// Проверка: прогноз на JavaScript (docs/survival_predictor.js) совпадает с расчётом самих библиотек
// (lifelines, xgboost, keras), который scripts/survival_time_predictor.py сохранил в docs/survival_model.js:
// RMST(τ) и прогноз времени (медиана S(t)).
// Запуск: node scripts/check_js_predictor.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const docs = path.join(__dirname, '..', 'docs');
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(docs, 'survival_model.js'), 'utf8'), context);
const bundle = context.window.SURVIVAL_MODEL;
const { createPredictor } = require(path.join(docs, 'survival_predictor.js'));

const predictor = createPredictor(bundle);
// Медиана — первый день с S(t) ≤ 0,5: из-за округления S на границе день может сдвинуться на 1
const TOLERANCE = { rmst: 0.05, time: 1 };
let failed = false;
for (const [name, title] of Object.entries(bundle.meta.model_names)) {
  const maxDiff = { rmst: 0, time: 0 };
  bundle.patients.X.forEach((x, i) => {
    const p = predictor.predict(x, name);
    maxDiff.rmst = Math.max(maxDiff.rmst, Math.abs(p.rmst - bundle.reference_rmst[name][i]));
    maxDiff.time = Math.max(maxDiff.time, Math.abs(p.time - bundle.reference_time[name][i]));
  });
  const ok = Object.keys(TOLERANCE).every((k) => maxDiff[k] <= TOLERANCE[k]);
  failed ||= !ok;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${title.padEnd(12)} max |Δ|: RMST ${maxDiff.rmst.toExponential(2)} дн., ` +
    `прогноз ${maxDiff.time} дн. (${bundle.patients.X.length} пациентов)`);
}
// Конвейер: вероятности групп и справочная маршрутизация (группа, время внутри неё)
const ref = bundle.reference_staged;
const routeDiff = { P: 0, group: 0, time: 0, cluster: 0 };
bundle.patients.X.forEach((x, i) => {
  const { stage } = predictor.predict(x, 'stg');
  stage.P.forEach((p, k) => { routeDiff.P = Math.max(routeDiff.P, Math.abs(p - ref.P[i][k])); });
  routeDiff.group += stage.group !== ref.group[i];
  routeDiff.cluster += stage.cluster !== ref.cluster[i];
  routeDiff.time = Math.max(routeDiff.time, Math.abs(stage.routeTime - ref.time[i]));
});
const routeOk = routeDiff.P < 1e-6 && routeDiff.group === 0 && routeDiff.time <= 1 && routeDiff.cluster === 0;
failed ||= !routeOk;
console.log(`${routeOk ? 'OK  ' : 'FAIL'} Конвейер: кластеров не совпало ${routeDiff.cluster}, группы max |ΔP| ${routeDiff.P.toExponential(2)}, ` +
  `несовпадений группы ${routeDiff.group}, время группы max |Δ| ${routeDiff.time} дн.`);
process.exit(failed ? 1 : 0);
