/*
 * Прогноз времени дожития по подходу Survival-function-analysys.ipynb — в браузере.
 *
 * Параметры моделей (CoxPH, Weibull AFT, XGBoost Cox, NN и RN) вместе с калибраторами S(t), обученными
 * на всей когорте с учётом цензурирования, экспортирует scripts/survival_time_predictor.py
 * в docs/survival_model.js. Формулы те же, что в классе SurvivalTimePredictor этого скрипта;
 * совпадение с lifelines / xgboost / keras проверяет scripts/check_js_predictor.js.
 *
 * Для пациента считается функция выживаемости S(t) на дневной сетке 0..τ−1 и прогноз времени
 * RMST(τ) = Σ S(t) — ожидаемое число дней жизни в пределах горизонта τ.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SurvivalPredictor = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function decodeF32(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return Float64Array.from(new Float32Array(bytes.buffer));
  }

  // Модель Кокса: S(t | z) = exp(−H0(t) · exp((z − center) · beta))
  function coxSurvival(cox, z) {
    let lph = 0;
    for (let k = 0; k < z.length; k++) lph += (z[k] - cox.center[k]) * cox.beta[k];
    const hr = Math.exp(lph);
    const S = new Float64Array(cox.H0.length);
    for (let t = 0; t < S.length; t++) S[t] = Math.exp(-cox.H0[t] * hr);
    return S;
  }

  function createPredictor(bundle) {
    const { features, scaler, models } = bundle;
    const tau = bundle.meta.tau;
    // Модели используют только признаки, известные при поступлении (model_features); на вход подаются все признаки
    const modelFeatures = bundle.model_features || features;
    const columns = modelFeatures.map((f) => features.indexOf(f));
    const d = modelFeatures.length;

    // Пороги и листья XGBoost хранятся как float32: сравнение признака с порогом тоже во float32, как в xgboost
    const prepareTrees = (list) => list.map((t) => ({
      left: Int32Array.from(t.left),
      right: Int32Array.from(t.right),
      feature: Int32Array.from(t.feature),
      value: Float64Array.from(t.value, Math.fround),
    }));
    function treeSum(trees, z) {
      const zf = Float64Array.from(z, Math.fround);
      let sum = 0;
      for (const t of trees) {
        let node = 0;
        while (t.left[node] !== -1) node = zf[t.feature[node]] < t.value[node] ? t.left[node] : t.right[node];
        sum += t.value[node];
      }
      return sum;
    }
    const trees = prepareTrees(models.xgb.trees);
    const sigmoid = (v) => 1 / (1 + Math.exp(-v));

    // Каскад — как cascade_mixture() в scripts/survival_time_predictor.py: классификатор смерти от ССЗ в первые
    // early_days дней (деревья XGBoost, вероятность по Платту) и модель Кокса, обученная на проживших дольше.
    // S(t) = p·S_early + (1 − p)·S_late, S_early — распределение дней ранней смерти в обучающей выборке
    const cascade = models.two;
    const s1 = cascade.stage1;
    const stage1Trees = prepareTrees(s1.trees);
    const sEarly = new Float64Array(tau);
    for (let t = 0; t < tau; t++) sEarly[t] = cascade.early_death_days.filter((day) => day > t).length / cascade.early_death_days.length;
    function twoStage(z) {
      const pEarly = sigmoid(s1.platt[0] * (treeSum(stage1Trees, z) + s1.bias) + s1.platt[1]);
      const late = coxSurvival(cascade.late, z);
      const curve = Float64Array.from(late, (v, t) => pEarly * sEarly[t] + (1 - pEarly) * v);
      return { curve, stage: { kind: 'cascade', p: pEarly, days: cascade.early_days } };
    }

    const nnLayers = models.nn.layers.map((l) => ({ ...l, W: decodeF32(l.W), b: decodeF32(l.b) }));
    const rn = models.rn;
    const rnW = decodeF32(rn.W_in);
    const rnCoef = decodeF32(rn.coef);

    function scale(xRaw) {
      const z = new Float64Array(d);
      for (let k = 0; k < d; k++) z[k] = (xRaw[columns[k]] - scaler.mean[k]) / scaler.scale[k];
      return z;
    }

    const xgbLogRisk = (z) => treeSum(trees, z) + models.xgb.bias;

    // Логит нейросети (последний слой без сигмоиды) — оценка риска для калибратора
    function nnLogit(z) {
      let h = z;
      for (const l of nnLayers) {
        const out = new Float64Array(l.out);
        for (let j = 0; j < l.out; j++) {
          let s = l.b[j];
          for (let i = 0; i < l.in; i++) s += h[i] * l.W[i * l.out + j];
          out[j] = l.activation === 'relu' ? Math.max(s, 0) : l.activation === 'sigmoid' ? 1 / (1 + Math.exp(-s)) : s;
        }
        h = out;
      }
      return h[0];
    }

    // Логит резервуарной сети: tanh(z · W_in) · coef + intercept
    function rnLogit(z) {
      let s = rn.intercept;
      for (let j = 0; j < rn.n_reservoir; j++) {
        let a = 0;
        for (let i = 0; i < rn.n_features; i++) a += z[i] * rnW[i * rn.n_reservoir + j];
        s += Math.tanh(a) * rnCoef[j];
      }
      return s;
    }

    // S(t) на сетке 0..τ−1 для исходных (нестандартизованных) признаков
    function survival(xRaw, name) {
      const z = scale(xRaw);
      const m = models[name];
      switch (name) {
        case 'cph':
          return coxSurvival(m, z);
        case 'aft': {
          let s = m.lambda_intercept;
          for (let k = 0; k < d; k++) s += z[k] * m.lambda_beta[k];
          const lambda = Math.exp(s), rho = Math.exp(m.rho_intercept);
          const S = new Float64Array(tau);
          for (let t = 0; t < tau; t++) S[t] = Math.exp(-Math.pow(t / lambda, rho));
          return S;
        }
        case 'xgb':
          return coxSurvival(m.calibrator, [xgbLogRisk(z)]);
        case 'nn':
          return coxSurvival(m.calibrator, [nnLogit(z)]);
        case 'rn':
          return coxSurvival(m.calibrator, [rnLogit(z)]);
        case 'two':
          return twoStage(z).curve;
        case 'bal':
          return balanced(z).curve;
        default:
          throw new Error('Unknown model: ' + name);
      }
    }

    // Модель для популяции balanced_dataset.csv — как balanced_mixture() в scripts/survival_time_predictor.py:
    // логистическая регрессия «смерть от ССЗ до τ»; S(t) = 1 − p·F(t), F — доля умерших к дню t среди умерших
    // от ССЗ до τ в обучающей выборке
    const bal = models.bal;
    const deathCdf = new Float64Array(tau);
    for (let t = 0; t < tau; t++) deathCdf[t] = bal.death_days.filter((day) => day <= t).length / bal.death_days.length;
    function balanced(z) {
      let s = bal.intercept;
      for (let k = 0; k < d; k++) s += bal.coef[k] * z[k];
      const p = sigmoid(s);
      return { curve: Float64Array.from(deathCdf, (F) => 1 - p * F), stage: { kind: 'balanced', p, tau } };
    }

    // Прогноз — как point_prediction() в scripts/survival_time_predictor.py:
    // time — медиана S(t) (первый день, когда S(t) ≤ 0,5, или τ — «смерти от ССЗ в пределах τ не ожидается»);
    // windows — вероятности окон: смерть от ССЗ в первые 30 дней, на 31–90-й, 91–365-й, 366–1499-й день, нет до τ;
    // rmst — ожидаемое число дней без смерти от ССЗ в пределах τ; sTau = S(τ); risk1y — риск смерти от ССЗ за год;
    // stage — у каскада и модели для balanced: вероятность их классификатора
    function predict(xRaw, name) {
      const special = name === 'two' ? twoStage(scale(xRaw)) : name === 'bal' ? balanced(scale(xRaw)) : null;
      const curve = special ? special.curve : survival(xRaw, name);
      const n = curve.length;
      let rmst = 0, time = n;
      for (let t = 0; t < n; t++) {
        rmst += curve[t];
        if (time === n && curve[t] <= 0.5) time = t;
      }
      const S = (day) => curve[Math.min(day, n - 1)];
      const windows = [1 - S(30), S(30) - S(90), S(90) - S(365), S(365) - S(n - 1), S(n - 1)];
      return { curve, time, rmst, sTau: S(n - 1), risk1y: 1 - S(365), windows, stage: special ? special.stage : null };
    }

    return { features, modelFeatures, tau, modelNames: bundle.meta.model_names, scale, survival, predict };
  }

  return { createPredictor };
});
