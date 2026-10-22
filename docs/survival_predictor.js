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
    const d = features.length;

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

    // Каскад — как cascade_mixture() в scripts/survival_time_predictor.py:
    // этап 1 — классификатор смерти от ССЗ в первые early_days дней (деревья XGBoost) → прогноз early_time;
    // этап 2 — классификатор смерти от ССЗ между early_days и τ (XGBoost + логистическая регрессия) → mid_time;
    // этап 3 — медиана S(t) модели Кокса, обученной на проживших дольше early_days.
    // S(t) — смесь p·S_early + (1 − p)·S_late (p — вероятность ранней смерти по Платту); по ней считаются
    // уверенность, RMST и риск
    const cascade = models.two;
    const s1 = cascade.stage1, s2 = cascade.stage2;
    const stage1Trees = prepareTrees(s1.trees), stage2Trees = prepareTrees(s2.xgb.trees);
    const platt = (p, score) => sigmoid(p[0] * score + p[1]);
    const sEarly = new Float64Array(tau);
    for (let t = 0; t < tau; t++) sEarly[t] = cascade.early_death_days.filter((d) => d > t).length / cascade.early_death_days.length;
    function twoStage(z) {
      const margin1 = treeSum(stage1Trees, z) + s1.bias;
      let ml = s2.lr.intercept;
      for (let k = 0; k < d; k++) ml += s2.lr.coef[k] * z[k];
      const score2 = ((treeSum(stage2Trees, z) + s2.xgb.bias - s2.xgb.mean) / s2.xgb.sd + (ml - s2.lr.mean) / s2.lr.sd) / 2;
      const pEarly = platt(s1.platt, margin1);
      const late = coxSurvival(cascade.late, z);
      let lateTime = tau;
      for (let t = 0; t < tau; t++) if (late[t] <= 0.5) { lateTime = t; break; }
      const curve = new Float64Array(tau);
      for (let t = 0; t < tau; t++) curve[t] = pEarly * sEarly[t] + (1 - pEarly) * late[t];
      const group = margin1 >= s1.threshold ? 'early' : score2 >= s2.threshold ? 'mid' : 'late';
      return {
        curve,
        time: group === 'early' ? cascade.early_time : group === 'mid' ? cascade.mid_time : lateTime,
        stage: {
          group, days: cascade.early_days, tau,
          // Вероятности по Платту и пороги в тех же единицах — для показа в карточке пациента
          pEarly, thresholdEarly: platt(s1.platt, s1.threshold),
          pMid: platt(s2.platt, score2), thresholdMid: platt(s2.platt, s2.threshold),
        },
      };
    }
    const nnLayers = models.nn.layers.map((l) => ({ ...l, W: decodeF32(l.W), b: decodeF32(l.b) }));
    const rn = models.rn;
    const rnW = decodeF32(rn.W_in);
    const rnCoef = decodeF32(rn.coef);

    function scale(xRaw) {
      const z = new Float64Array(d);
      for (let k = 0; k < d; k++) z[k] = (xRaw[k] - scaler.mean[k]) / scaler.scale[k];
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
        default:
          throw new Error('Unknown model: ' + name);
      }
    }

    // Прогноз min(T, τ) — как point_prediction() в scripts/survival_time_predictor.py.
    // time — медиана: первый день, когда S(t) ≤ 0,5, или τ (оценка с наименьшей средней абсолютной ошибкой);
    // confidence — вероятность по самой модели, что |min(T, τ) − time| ≤ tolerance;
    // rmst — ожидаемое число дней без смерти от ССЗ в пределах τ; sTau = S(τ); risk1y — риск смерти от ССЗ за год;
    // stage — у двухэтапного алгоритма: группа этапа 1 и оценка классификатора
    const tolerance = bundle.meta.tolerance;
    function predict(xRaw, name) {
      const two = name === 'two' ? twoStage(scale(xRaw)) : null;
      const curve = two ? two.curve : survival(xRaw, name);
      const n = curve.length;
      let rmst = 0, median = n;
      for (let t = 0; t < n; t++) {
        rmst += curve[t];
        if (median === n && curve[t] <= 0.5) median = t;
      }
      const time = two ? two.time : median;
      // S(k) с соглашениями S(−1) = 1 и S(k) = 0 при k ≥ τ: масса «дожил до τ» сосредоточена в точке τ
      const S = (k) => (k < 0 ? 1 : k >= n ? 0 : curve[k]);
      const confidence = S(Math.max(time - tolerance, 0) - 1) - S(Math.min(time + tolerance, n));
      return { curve, time, confidence, rmst, sTau: curve[n - 1], risk1y: 1 - curve[365], stage: two ? two.stage : null };
    }

    return { features, tau, tolerance, modelNames: bundle.meta.model_names, scale, survival, predict };
  }

  return { createPredictor };
});
