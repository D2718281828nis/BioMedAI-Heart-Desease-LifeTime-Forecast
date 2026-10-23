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
        case 'stg':
          return staged(z, xRaw).curve;
        default:
          throw new Error('Unknown model: ' + name);
      }
    }

    // Balanced mixture — как balanced_mixture() в scripts/survival_time_predictor.py: логистическая регрессия
    // «смерть от ССЗ до τ» (df_balanced и частичные метки цензурированных до τ); S(t) = 1 − p·F(t), F — доля умерших
    // к дню t среди умерших от ССЗ до τ в обучающей выборке с весами IPCW
    const bal = models.bal;
    const deathCdf = new Float64Array(tau);
    const deathTotal = bal.death_weights.reduce((sum, w) => sum + w, 0);
    for (let t = 0; t < tau; t++) {
      let sum = 0;
      bal.death_days.forEach((day, k) => { if (day <= t) sum += bal.death_weights[k]; });
      deathCdf[t] = sum / deathTotal;
    }
    function balanced(z) {
      let s = bal.intercept;
      for (let k = 0; k < d; k++) s += bal.coef[k] * z[k];
      const p = sigmoid(s);
      return { curve: Float64Array.from(deathCdf, (F) => 1 - p * F), stage: { kind: 'balanced', p, tau } };
    }

    // Многоэтапный конвейер — как staged_mixture() и staged_route() в scripts/survival_time_predictor.py:
    // кластер всей когорты — ближайший центроид агломеративной кластеризации; этап 1 — вероятность ранней смерти
    // (логистическая регрессия по признакам и принадлежности к кластеру), этап 2 — смерти от ССЗ до τ среди
    // переживших ранний срок (логистическая регрессия), время поздней смерти — модель Кокса при условии смерти до τ.
    // S(t) = 1 − P[0]·F_ранн(t) − P[1]·F_поздн(t | z); group и routeTime — справочно: группа с наибольшей вероятностью
    // и медиана времени внутри неё
    const stg = models.stg;
    const clusters = stg.clusters;
    function clusterOf(xRaw) {
      let best = 0, bestD = Infinity;
      clusters.centroids.forEach((centroid, c) => {
        let dist = 0;
        for (let k = 0; k < d; k++) {
          const v = (xRaw[columns[k]] - clusters.mean[k]) / clusters.scale[k] - centroid[k];
          dist += v * v;
        }
        if (dist < bestD) { bestD = dist; best = c; }
      });
      return best;
    }
    // Профиль кластера: признаки, сильнее всего отличающие его пациентов от среднего по когорте (в σ)
    const clusterProfile = clusters.profile;
    const stgEarly = Float64Array.from(stg.early_death_days).sort();
    const stgEarlyCdf = new Float64Array(tau);
    for (let t = 0; t < tau; t++) stgEarlyCdf[t] = stgEarly.filter((day) => day <= t).length / stgEarly.length;
    const half = stgEarly.length >> 1;
    const stgEarlyMedian = Math.trunc(stgEarly.length % 2 ? stgEarly[half] : (stgEarly[half - 1] + stgEarly[half]) / 2);
    function staged(z, xRaw) {
      const cluster = clusterOf(xRaw);
      let s1 = stg.stage1.intercept + stg.stage1.coef[d + cluster];
      for (let k = 0; k < d; k++) s1 += stg.stage1.coef[k] * z[k];
      const p1 = sigmoid(s1);
      let s2 = stg.stage2.intercept;
      for (let k = 0; k < d; k++) s2 += stg.stage2.coef[k] * z[k];
      const p2 = sigmoid(s2);
      const P = [p1, (1 - p1) * p2, (1 - p1) * (1 - p2)];
      const late = coxSurvival(stg.late, z);
      const denom = Math.max(1 - late[tau - 1], 1e-12);
      const curve = new Float64Array(tau);
      let lateMedian = tau;
      for (let t = 0; t < tau; t++) {
        const F = (1 - late[t]) / denom;
        curve[t] = 1 - P[0] * stgEarlyCdf[t] - P[1] * F;
        if (lateMedian === tau && F >= 0.5) lateMedian = t;
      }
      const group = P.indexOf(Math.max(...P));
      const routeTime = group === 0 ? stgEarlyMedian : group === 1 ? lateMedian : tau;
      return {
        curve,
        stage: {
          kind: 'staged', P, group, routeTime, days: stg.early_days, tau,
          cluster, clusterN: clusters.n[cluster], clusterEarly: clusters.early[cluster],
          clusterProfile: clusterProfile[cluster],
        },
      };
    }

    // Прогноз — как point_prediction() в scripts/survival_time_predictor.py:
    // time — медиана S(t) (первый день, когда S(t) ≤ 0,5, или τ — «смерти от ССЗ в пределах τ не ожидается»);
    // windows — вероятности окон: смерть от ССЗ в первые 30 дней, на 31–90-й, 91–365-й, 366–1499-й день, нет до τ;
    // rmst — ожидаемое число дней без смерти от ССЗ в пределах τ; sTau = S(τ); risk1y — риск смерти от ССЗ за год;
    // stage — у каскада, модели для balanced и конвейера: вероятности их классификаторов
    const SPECIAL = { two: (z) => twoStage(z), bal: (z) => balanced(z), stg: (z, x) => staged(z, x) };
    function predict(xRaw, name) {
      const special = SPECIAL[name] ? SPECIAL[name](scale(xRaw), xRaw) : null;
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
