// Проверка: прогноз времени на JavaScript (docs/survival_predictor.js) совпадает с расчётом самих
// библиотек (lifelines, xgboost, keras), который scripts/survival_time_predictor.py сохранил в docs/survival_model.js.
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
const TOLERANCE_DAYS = 0.05;
let failed = false;
for (const [name, title] of Object.entries(bundle.meta.model_names)) {
  const reference = bundle.reference_rmst[name];
  let maxDiff = 0;
  bundle.patients.X.forEach((x, i) => {
    maxDiff = Math.max(maxDiff, Math.abs(predictor.predict(x, name).rmst - reference[i]));
  });
  const ok = maxDiff < TOLERANCE_DAYS;
  failed ||= !ok;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${title.padEnd(12)} max |ΔRMST| = ${maxDiff.toExponential(2)} дн. (${reference.length} пациентов)`);
}
process.exit(failed ? 1 : 0);
