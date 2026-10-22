// Проверка: прогноз на JavaScript (docs/survival_predictor.js) совпадает с расчётом самих библиотек
// (lifelines, xgboost, keras), который scripts/survival_time_predictor.py сохранил в docs/survival_model.js:
// RMST(τ), прогноз времени (медиана S(t)) и уверенность P(|ошибка| ≤ допуска).
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
const TOLERANCE = { rmst: 0.05, time: 1, confidence: 1e-3 };
let failed = false;
for (const [name, title] of Object.entries(bundle.meta.model_names)) {
  const maxDiff = { rmst: 0, time: 0, confidence: 0 };
  bundle.patients.X.forEach((x, i) => {
    const p = predictor.predict(x, name);
    maxDiff.rmst = Math.max(maxDiff.rmst, Math.abs(p.rmst - bundle.reference_rmst[name][i]));
    maxDiff.time = Math.max(maxDiff.time, Math.abs(p.time - bundle.reference_time[name][i]));
    maxDiff.confidence = Math.max(maxDiff.confidence, Math.abs(p.confidence - bundle.reference_confidence[name][i]));
  });
  const ok = Object.keys(TOLERANCE).every((k) => maxDiff[k] <= TOLERANCE[k]);
  failed ||= !ok;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${title.padEnd(12)} max |Δ|: RMST ${maxDiff.rmst.toExponential(2)} дн., ` +
    `прогноз ${maxDiff.time} дн., уверенность ${maxDiff.confidence.toExponential(2)} (${bundle.patients.X.length} пациентов)`);
}
process.exit(failed ? 1 : 0);
