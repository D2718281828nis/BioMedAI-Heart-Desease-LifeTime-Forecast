/*
 * Тексты интерфейса на английском и русском; переключатель EN/RU в шапке страницы.
 *
 * Статичные элементы index.html помечены атрибутами:
 *   data-i18n="ключ"            — textContent
 *   data-i18n-html="ключ"       — innerHTML (только строки из этого словаря, не данные)
 *   data-i18n-aria-label="ключ" — aria-label
 * Скрипт подключается первым и сразу применяет язык, чтобы страница не мигала английским текстом.
 */
(function (root) {
  'use strict';

  const NOTEBOOK_URL = 'https://github.com/D2718281828nis/BioMedAI-Heart-Desease-LifeTime-Forecast/blob/main/Survival-function-analysys.ipynb';

  const STRINGS = {
    en: {
      'doc.title': 'Survival Time Explorer',
      'doc.description': 'Interactive t-SNE map of acute coronary syndrome patients (balanced_dataset.csv or the full med_dataset_cardio.xlsx): select a patient, edit clinical parameters and re-predict survival time with the models of Survival-function-analysys.ipynb.',
      'h1': 'Survival time explorer',
      'lede': `Patients after acute coronary syndrome: <code>balanced_dataset.csv</code> (408 patients with a known status at τ = 1500 days, as in the notebook) or the full <code>med_dataset_cardio.xlsx</code> (1506). The map is a t-SNE of their 30 clinical parameters, colored by outcome. Select a patient and change any parameter: the point moves on the map and the time is re-predicted with the survival models of <a href="${NOTEBOOK_URL}">Survival-function-analysys.ipynb</a>.`,
      'lang.group': 'Language',
      'theme.toLight': 'Switch to light theme',
      'theme.toDark': 'Switch to dark theme',

      'toolbar.aria': 'Map and model settings',
      'dataset.label': 'Dataset',
      'dataset.balanced': 'balanced_dataset.csv ({n})',
      'dataset.full': 'med_dataset_cardio.xlsx ({n})',
      'perplexity.label': 't-SNE perplexity',
      'perplexity.aria': 'Perplexity value',
      'model.label': 'Survival model',
      'resetAll': 'Reset all edits',
      'download': 'Download CSV',

      'map.title': 't-SNE map of patients',
      'map.aria': 't-SNE map of the patients of the selected dataset, colored by outcome. Hover a point to see its time; click to select it. The same data is in the table view below.',
      'map.hint': 'Hover a point to see its time · click to select',
      'legend.t0': 'No CVD death (target = 0), n = {n}',
      'legend.t1': 'CVD death (target = 1), n = {n}',
      'legend.selected': 'Selected',
      'sudden.legend': 'Sudden unexplained CVD death, n = {n}',
      'sudden.label': 'Sudden unexplained CVD death',
      'sudden.highlight': 'highlight ◆',
      'sudden.title': 'Hidden pattern: sudden unexplained CVD death',
      'sudden.note': 'CVD death on day {d} that none of the models predicted: the admission data do not explain it. Even among the {k} patients most similar at admission, {share} survived {horizon}. Predicting death on day {d} for such patients would be wrong {wrong} times out of 100.',
      'sudden.short': '{share} of the {k} most similar patients survived {horizon}',
      'sudden.h30': 'the first month',
      'sudden.h90': 'the first three months',
      'sudden.h365': 'the first year',
      'unexpected.legend': 'Unexpected survival, n = {n}',
      'unexpected.label': 'Unexpected survival',
      'unexpected.title': 'Unexpected survival: high predicted risk, no CVD death',
      'unexpected.note': 'No CVD death during {time} days of follow-up, although the model for the balanced_dataset.csv population estimated a {risk} risk of CVD death before day {tau}. Among the {k} patients most similar at admission whose outcome by τ is known, {died} died of CVD before day {tau}. If this share is much lower than the predicted risk, the model overestimates the risk for this profile; if it is high as well, the survival is not explained by the admission data (treatment and adherence after discharge are not in the data). A data-entry error is also possible: check the flagged parameters.',
      'unexpected.short': 'predicted risk {risk}; {died} of the {k} most similar patients died',
      'legend.edited': 'Edited: dataset position → new position',
      'status.initial': 'Computing t-SNE…',
      'status.affinities': 'Computing t-SNE: pairwise similarities of {n} patients…',
      'status.running': 'Computing t-SNE: iteration {i} / 1000 · perplexity {p}',
      'status.done': 't-SNE · perplexity {p} · KL divergence {kl} · edited patients: {n}',
      'tt.title': 'ID {id} · row {row}',
      'tt.heldOut': ' · held-out',
      'tt.time': 'time (dataset)',
      'tt.real': 'real min(T, τ)',
      'tt.outcome': 'outcome, target = {t}',
      'tt.pred': 'predicted time, {model}',
      'tt.predEdit': 'predicted with your edits',
      'tt.risk1y': 'CVD death risk within 1 year',

      'pred.title': 'Predicted time',
      'pred.sub': 'patient ID {id} · {model}',
      'hero.edited': 'With your edits · {model}',
      'hero.dataset': 'Dataset values · {model}',
      'hero.horizon': 'The probability of CVD death within τ = {tau} days stays below 50%, so the median of S(t) lies beyond the horizon; the data do not allow predicting further (follow-up ends at 1500–1634 days).',
      'hero.sub': 'predicted min(T, τ), τ = {tau} days: the median of S(t), the day by which the probability of CVD death reaches 50%; real: {v}',
      'hero.subCensored': 'predicted min(T, τ), τ = {tau} days: the median of S(t), the day by which the probability of CVD death reaches 50%; real: ≥ {v} (followed {v} days without CVD death)',
      'hero.subOther': 'predicted min(T, τ), τ = {tau} days: the median of S(t), the day by which the probability of CVD death reaches 50%; real: ≥ {v} (died of other causes on day {v}, CVD death not observed)',
      'hero.delta': ' vs dataset values ({v} days)',
      'hero.hint': 'Edit a parameter to re-predict.',
      'unit.days': 'days',
      'days': '{n} days',
      'days.short': '{n} d',
      'fact.time': 'time in dataset',
      'fact.outcome': '{outcome} · target = {t}',
      'fact.alive': 'P(no CVD death by τ)',
      'fact.aliveNote': 'S(τ), τ = {tau} days',
      'fact.rmst': 'Expected days without CVD death',
      'fact.rmstNote': 'RMST(τ), the area under S(t)',
      'fact.balStage': 'P(CVD death before day {tau})',
      'fact.balNote': 'logistic regression trained on balanced_dataset.csv',
      'fact.cascadeStage': 'Cascade: P(CVD death ≤ {days} d)',
      'fact.cascadeNote': 'stage-1 classifier; the weight of early death in S(t)',
      'fact.datasetValue': 'dataset values: {v}',
      'profile.title': 'Risk of CVD death by time window (bar: this patient, tick: cohort average)',
      'profile.w30': 'Within 30 days',
      'profile.w90': 'Days 31–90',
      'profile.w365': 'Days 91–365',
      'profile.w1500': 'Day 366 – {tau}',
      'profile.wNone': 'No CVD death by day {tau}',
      'profile.cohort': 'cohort average',
      'profile.cohortValue': 'cohort: {v}',
      'profile.dataset': 'dataset values: {v}',
      'quality.title': 'Possible data-entry error',
      'quality.note': 'Outside the physiologically plausible range: {list}. The prediction uses the value as entered; correct it in the editor to see how the prediction changes.',
      'quality.item': '{label} = {v} {unit} (plausible {lo}–{hi})',
      'chart.aria': 'Survival function of patient ID {id}. Use the arrow keys to read values.',
      'chart.y': 'S(t), probability of no CVD death',
      'chart.x': 'days',
      'chart.deathBefore': 'CVD death on day {d} (dataset)',
      'chart.censoredBefore': 'alive, follow-up ended on day {d} (dataset)',
      'chart.otherBefore': 'died of other causes on day {d} (dataset)',
      'chart.deathAfter': 'CVD death on day {d}, after τ (dataset)',
      'chart.aliveAfter': 'no CVD death by τ, followed {d} days (dataset)',
      'chart.day': 'Day {d}',
      'chart.sBase': 'S(t), dataset values',
      'chart.sEdit': 'S(t), with edits',
      'chart.legendBase': 'dataset values',
      'chart.legendEdit': 'with your edits',
      'chart.note': 'Survival function S(t) of the selected patient. The predicted time is its median, the day S(t) falls to 0.5 (beyond τ if it stays above 0.5); the shaded area is RMST(τ) = ∫₀<sup>τ</sup> S(t) dt. A survival model predicts the distribution of the time of death, not a date: see the risk by time window above.',
      'models.aria': 'Predicted time of the selected patient by every model',
      'models.model': 'Model',
      'models.cindex': 'C‑index',
      'models.auc30': 'AUC 30 d',
      'models.auc365': 'AUC 1 y',
      'models.ibs': 'IBS',
      'models.mae': 'Mean error, d',
      'models.base': 'Time, dataset values',
      'models.edit': 'Time, edited',
      'models.note': 'Held-out patients of the whole cohort ({n}, IPCW weights for censoring), {model}: C-index {c}; time-dependent AUC {auc30} at 30 days and {auc365} at 1 year (how well patients who die within the window are separated from the rest); integrated Brier score {ibs} (accuracy of the whole S(t) over 0–τ, lower is better); mean error of the median {mae} days.',
      'models.noteBalanced': 'Held-out patients of balanced_dataset.csv ({n}, outcome by τ known for all), {model}: C-index {c}; AUC {auc30} at 30 days and {auc365} at 1 year; IBS {ibs}; mean error of the median {mae} days. This population has 37% CVD deaths against 10% in the whole cohort: models calibrated on the whole cohort underestimate the risk here, so "Balanced mixture" is trained on this population.',

      'patient.title': 'Patient',
      'patient.prev': 'Previous patient',
      'patient.next': 'Next patient',
      'patient.id': 'ID',
      'patient.row': 'Row',
      'patient.rowOf': 'row {i} of {max}',
      'patient.notFound': 'No patient with ID {id}',
      'patient.notInDataset': 'ID {id} is not in {file}',
      'patient.reset': 'Reset patient',
      'patient.test': 'held-out test patient',
      'patient.train': 'training patient',
      'patient.calib': 'training patient (calibration only)',
      'patient.edited': 'edited parameters: {n}',
      'mini.time': 'time in dataset ',
      'mini.pred': 'predicted ({model}) ',
      'outcome.cvd': 'CVD death',
      'outcome.other': 'Died of other causes',
      'outcome.alive': 'Alive at end of follow-up',
      'param.slider': '{label}, slider',
      'param.reset': 'Reset {label} to the dataset value',
      'param.resetTitle': 'Reset to the dataset value',
      'param.dataset': 'dataset',
      'param.datasetValue': 'dataset: {v}',
      'param.notUsed': 'not used by the models: known only after discharge',
      'param.implausible': 'implausible: expected {lo}–{hi}',
      'group.demo': 'Demographics',
      'group.vitals': 'On admission',
      'group.comorb': 'Comorbidities',
      'group.event': 'Index event',
      'group.treat': 'Treatment and follow-up',
      'group.labs': 'Laboratory',

      'table.summary': 'Table view',
      'table.sub': 'all patients, sortable; click a row to select',
      'table.row': 'Row',
      'table.id': 'ID',
      'table.outcome': 'Outcome',
      'table.time': 'time, days',
      'table.real': 'Real min(T, τ)',
      'table.pred': 'Predicted, days',
      'table.error': '|Error|, days',
      'table.risk': 'Risk within 1 y',
      'table.edit': 'With edits, days',

      'method.title': 'How it works',
      'method.list': `
        <li><b>Predicted time.</b> As in <i>Survival-function-analysys.ipynb</i>, a model gives the patient's survival function S(t), the probability of no CVD death by day t. The predicted time is its median: the day by which the probability of CVD death reaches 50%, or "beyond τ = 1500 days" if it stays lower (of all single numbers, the median minimizes the expected absolute error). One date hides how uncertain it is, so the page also shows, from the same S(t), the probabilities of CVD death within 30 days, on days 31–90, 91–365 and 366–1500 and of no CVD death by day 1500, next to the cohort average, and RMST(τ), the area under S(t). The prediction is compared with min(T, τ): it is known exactly for CVD deaths and for patients followed for τ days or longer; when follow-up ended earlier (alive, or died of other causes) only a lower bound "≥ time" is known.</li>
        <li><b>Models</b> (CoxPH, Weibull AFT, XGBoost Cox, NN and reservoir network) are trained as in the notebook on <code>balanced_dataset.csv</code>: the same 326 training patients (stratified split, <code>random_state=37</code>), <code>StandardScaler</code> and hyperparameters, but only on the 28 parameters known at admission. <code>doctor</code> (follow-up physician) and <code>llo</code> (subsidized drugs) are assigned after discharge: patients who die early do not get them (92% and 100% of CVD deaths within 30 days), so they partly carry the outcome (immortal time bias). They are shown in the editor but do not affect predictions.</li>
        <li><b>Calibration on the whole cohort.</b> <code>balanced_dataset.csv</code> keeps CVD deaths and patients followed for τ days or longer, but drops the 1098 patients whose follow-up ended earlier, so 37% of it are deaths instead of 10%. Survival estimated on it is far too low: mean predicted S(τ) 0.63–0.72 against 0.88 observed. Therefore the mapping from each model's risk score to S(t) is fitted on all 1204 training patients of <code>med_dataset_cardio.xlsx</code> with censoring taken into account (out-of-fold scores for the models' own training patients, logits for the neural networks). The ranking of patients does not change; predicted survival now matches the observed one.</li>
        <li><b>Accuracy</b> is measured on the held-out patients of the selected dataset (302 of the whole cohort, 82 of them from <code>balanced_dataset.csv</code>): C-index (ranking of patients by risk); time-dependent AUC at 30 and 365 days (how well patients who die within the window are separated from the rest); integrated Brier score over 0–τ (accuracy of the whole S(t), a proper scoring rule); calibration error of RMST (mean |prediction − Kaplan–Meier| over risk quintiles) and the mean error of the median. For the whole cohort censoring is taken into account with IPCW weights. With these parameters AUC at 1 year is about 0.87: a high-risk group can be recognised, the day of death cannot.</li>
        <li><b>Two populations, two default models.</b> <code>balanced_dataset.csv</code> contains only patients whose outcome by τ = 1500 days is known (CVD death or follow-up ≥ τ): 37% of them died of CVD, against 10% in the whole cohort. Models calibrated on the whole cohort are right for the cohort but underestimate the risk in this population. Therefore the balanced view uses "Balanced mixture" by default: a logistic regression of CVD death before τ, trained on the 326 training patients of <code>balanced_dataset.csv</code>, gives the probability p, and S(t) = 1 − p·F(t), where F(t) is the share of the training CVD deaths before τ that occurred by day t. On the 82 held-out patients of <code>balanced_dataset.csv</code> it has C-index 0.849, IBS 0.110 and a mean error of the median of 233 days, against IBS 0.18–0.19 and 370–384 days for the models calibrated on the whole cohort. In the whole cohort it overestimates the risk (mean predicted S(τ) 0.64 against 0.88 observed), so the full view uses CoxPH. The model table shows metrics on the held-out patients of the selected dataset.</li>
        <li><b>Methodological review: why the "error ≤ 150 days" criterion was removed.</b> Earlier versions compared models by the share of patients with |predicted − real| ≤ 150 days and predicted fixed days: 150 days for patients marked by a classifier ("Balanced two-stage" at P(CVD death before τ) ≥ 0.6; the cascade for the top 2% of an early-death score), 900 days for the next 1%, 1500 days for everyone else. That was a methodological error. (1) 150 days was not an estimate of the time of death but the centre of the window 0–300 days, chosen because it maximizes hits of the criterion; early death times are strongly skewed (of the 151 CVD deaths before τ in <code>balanced_dataset.csv</code>, 37 occur within 30 days and 81 within 300). (2) A threshold turns a probability into a date: a patient with a 60% risk got "150 days", although by the model's own estimate they survive with probability 40%, and then the error is 1350 days. Of the 23 held-out patients marked this way, 14 died within 300 days, 6 later and 3 survived τ (IDs 347, 1085, 1499); IDs 63, 67 and 276 are the same cases among training patients. (3) The criterion is not a proper scoring rule and is dominated by survivors: predicting 1500 days for everyone already gives 62.2% on the 82 held-out patients, against 75.6% for the tuned rule. (4) Thresholds, days and classifiers were chosen by this same criterion, and the held-out patients were looked at after every change, so their estimate is optimistic. Now the prediction is the median of S(t), every model gives the probabilities of the time windows, and models are compared by C-index, time-dependent AUC and IBS. No model can honestly name an early date: the highest probability of CVD death within 30 days among all 1506 patients is 0.19–0.35 depending on the model, and for CoxPH, Weibull AFT, RN Survival and Balanced mixture no patient has a window within the first year as the most likely outcome.</li>
        <li><b>Sudden unexplained CVD deaths</b> (orange ◆ on the map): CVD deaths within the first year that none of the seven models predicted (all predicted times beyond τ): 23 of the 88 such deaths in <code>balanced_dataset.csv</code>. For each of them the share of patients who survived the same period (the first month, three months or the first year) is computed among the 50 patients most similar at admission (28 parameters, standardized): it is 90–100%, 98% on average. These points lie among survivors on the map, not in a separate cluster.</li>
        <li><b>Unexpected survival</b> (blue ◆): patients without CVD death by τ for whom the model for the <code>balanced_dataset.csv</code> population estimated a risk of CVD death before τ of 50% or more: 26 of the 257 such patients (risk 51–91%). Among the 50 most similar patients with a known outcome, 14–62% died before τ, 38% on average. For 20 of the 26 this share is below 50%: the model overestimates the risk for this profile (IDs 63 and 276: risk 60%, but only 18% of similar patients died). For 6 (IDs 67, 347, 369, 640, 676, 896) it is 50% or higher: their survival is not explained by the admission data; treatment and adherence after discharge are not in the data. ID 67 has hemoglobin 34 g/L, an implausible value and probably an entry error: with 134 g/L the risk falls from 88% to 61%. Values outside physiologically plausible ranges are flagged in the editor and under the prediction.</li>
        <li><b>Cascade</b> (model "Cascade"): an XGBoost classifier of CVD death within 365 days with Platt calibration gives the probability p; a CoxPH model trained on patients who lived longer than 365 days gives S<sub>late</sub>(t); S(t) = p·S<sub>early</sub>(t) + (1 − p)·S<sub>late</sub>(t), where S<sub>early</sub> is the distribution of early death days in the training data. Earlier versions gave marked patients fixed days (150 or 900); this was removed (see the methodological review). The classifier was chosen by cross-validation on training patients only among logistic regression, XGBoost, CatBoost, random forest, a Cox risk score, kNN (several scalings, a learned NCA metric, importance weights, t-SNE coordinates), agglomerative clustering, SVM, MLP, LDA/QDA, naive Bayes and ensembles, with and without engineered features (approximate GRACE score, shock index, eGFR CKD-EPI, clinical flags). None of them separated early deaths better: even among the top 1–2% of scores only 17–33% die within 90 days. The strongest single factor was <code>doctor</code>, which is known only after discharge (see Models). The cascade ranks patients worse than CoxPH (C-index 0.79 against 0.84) and is kept for comparison.</li>
        <li><b>t-SNE</b> is computed in the browser on the 30 parameters standardized within the selected dataset (exact method, PCA initialization, 1000 iterations, as in scikit-learn). When you edit a patient, it is placed onto the fixed map by out-of-sample t-SNE: only that point moves, from its dataset position (hollow circle) to the new one. Edits are kept by patient ID across both datasets.</li>
        <li>The same prediction from the command line:</li>`,
      'footer.license': 'MIT license',
      'footer.generated': 'models re-trained {date} by scripts/survival_time_predictor.py',
    },

    ru: {
      'doc.title': 'Время дожития: карта пациентов',
      'doc.description': 'Интерактивная карта t-SNE пациентов после острого коронарного синдрома (balanced_dataset.csv или полный med_dataset_cardio.xlsx): выберите пациента, измените клинические признаки и пересчитайте прогноз времени дожития моделями Survival-function-analysys.ipynb.',
      'h1': 'Исследование времени дожития',
      'lede': `Пациенты после острого коронарного синдрома: <code>balanced_dataset.csv</code> (408 пациентов с известным статусом на τ = 1500 дней, как в ноутбуке) или полный <code>med_dataset_cardio.xlsx</code> (1506). Карта — t-SNE по 30 клиническим признакам, цвет — исход. Выберите пациента и измените любой признак: точка переместится на карте, а время дожития будет заново спрогнозировано моделями выживаемости из <a href="${NOTEBOOK_URL}">Survival-function-analysys.ipynb</a>.`,
      'lang.group': 'Язык',
      'theme.toLight': 'Включить светлую тему',
      'theme.toDark': 'Включить тёмную тему',

      'toolbar.aria': 'Настройки карты и модели',
      'dataset.label': 'Датасет',
      'dataset.balanced': 'balanced_dataset.csv ({n})',
      'dataset.full': 'med_dataset_cardio.xlsx ({n})',
      'perplexity.label': 'Perplexity t-SNE',
      'perplexity.aria': 'Значение perplexity',
      'model.label': 'Модель выживаемости',
      'resetAll': 'Сбросить все изменения',
      'download': 'Скачать CSV',

      'map.title': 'Карта пациентов (t-SNE)',
      'map.aria': 'Карта t-SNE пациентов выбранного датасета, цвет — исход. Наведите на точку, чтобы увидеть time; щелчок выбирает пациента. Те же данные — в таблице ниже.',
      'map.hint': 'Наведите на точку — увидите time · щелчок выбирает пациента',
      'legend.t0': 'Нет смерти от ССЗ (target = 0), n = {n}',
      'legend.t1': 'Смерть от ССЗ (target = 1), n = {n}',
      'legend.selected': 'Выбранный пациент',
      'sudden.legend': 'Внезапная необъяснимая смерть от ССЗ, n = {n}',
      'sudden.label': 'Внезапная необъяснимая смерть от ССЗ',
      'sudden.highlight': 'выделить ◆',
      'sudden.title': 'Скрытая закономерность: внезапная необъяснимая смерть от ССЗ',
      'sudden.note': 'Смерть от ССЗ на {d}-й день, которую не предсказала ни одна модель: данные при поступлении её не объясняют. Даже среди {k} самых похожих при поступлении пациентов {share} пережили {horizon}. Прогноз смерти на {d}-й день для таких пациентов был бы ошибочным {wrong} раз из 100.',
      'sudden.short': '{share} из {k} самых похожих пациентов пережили {horizon}',
      'sudden.h30': 'первый месяц',
      'sudden.h90': 'первые три месяца',
      'sudden.h365': 'первый год',
      'unexpected.legend': 'Неожиданное выживание, n = {n}',
      'unexpected.label': 'Неожиданное выживание',
      'unexpected.title': 'Неожиданное выживание: высокий прогнозный риск, но смерти от ССЗ нет',
      'unexpected.note': 'Смерти от ССЗ нет за {time} дн. наблюдения, хотя модель для популяции balanced_dataset.csv оценила риск смерти от ССЗ до {tau}-го дня в {risk}. Среди {k} самых похожих при поступлении пациентов с известным к τ исходом от ССЗ до {tau}-го дня умерли {died}. Если эта доля намного ниже прогнозного риска, модель переоценивает риск для такого профиля; если она тоже высока, выживание не объясняется данными при поступлении (лечения и приверженности к нему после выписки в данных нет). Возможна и ошибка ввода: проверьте отмеченные признаки.',
      'unexpected.short': 'прогнозный риск {risk}; из {k} самых похожих умерли {died}',
      'legend.edited': 'Изменён: положение по датасету → новое',
      'status.initial': 'Расчёт t-SNE…',
      'status.affinities': 'Расчёт t-SNE: попарные сходства {n} пациентов…',
      'status.running': 'Расчёт t-SNE: итерация {i} / 1000 · perplexity {p}',
      'status.done': 't-SNE · perplexity {p} · KL-дивергенция {kl} · изменённых пациентов: {n}',
      'tt.title': 'ID {id} · строка {row}',
      'tt.heldOut': ' · тестовая выборка',
      'tt.time': 'time (датасет)',
      'tt.real': 'факт min(T, τ)',
      'tt.outcome': 'исход, target = {t}',
      'tt.pred': 'прогноз времени, {model}',
      'tt.predEdit': 'прогноз с вашими изменениями',
      'tt.risk1y': 'риск смерти от ССЗ за 1 год',

      'pred.title': 'Прогноз времени',
      'pred.sub': 'пациент ID {id} · {model}',
      'hero.edited': 'С вашими изменениями · {model}',
      'hero.dataset': 'Значения из датасета · {model}',
      'hero.horizon': 'Вероятность смерти от ССЗ в пределах τ = {tau} дн. остаётся ниже 50%, поэтому медиана S(t) лежит за горизонтом; дальше данные прогнозировать не позволяют — наблюдение заканчивается на 1500–1634-й день.',
      'hero.sub': 'прогноз min(T, τ), τ = {tau} дн.: медиана S(t) — день, к которому вероятность смерти от ССЗ достигает 50%; факт: {v}',
      'hero.subCensored': 'прогноз min(T, τ), τ = {tau} дн.: медиана S(t) — день, к которому вероятность смерти от ССЗ достигает 50%; факт: ≥ {v} (наблюдался {v} дн. без смерти от ССЗ)',
      'hero.subOther': 'прогноз min(T, τ), τ = {tau} дн.: медиана S(t) — день, к которому вероятность смерти от ССЗ достигает 50%; факт: ≥ {v} (умер от других причин на {v}-й день, смерть от ССЗ не наблюдается)',
      'hero.delta': ' относительно значений датасета ({v} дн.)',
      'hero.hint': 'Измените любой признак — прогноз пересчитается.',
      'unit.days': 'дн.',
      'days': '{n} дн.',
      'days.short': '{n} дн.',
      'fact.time': 'time в датасете',
      'fact.outcome': '{outcome} · target = {t}',
      'fact.alive': 'P(без смерти от ССЗ до τ)',
      'fact.aliveNote': 'S(τ), τ = {tau} дн.',
      'fact.rmst': 'Ожидаемое число дней без смерти от ССЗ',
      'fact.rmstNote': 'RMST(τ), площадь под S(t)',
      'fact.balStage': 'P(смерть от ССЗ до {tau}-го дня)',
      'fact.balNote': 'логистическая регрессия, обученная на balanced_dataset.csv',
      'fact.cascadeStage': 'Каскад: P(смерть от ССЗ ≤ {days} дн.)',
      'fact.cascadeNote': 'классификатор этапа 1 — вес ранней смерти в S(t)',
      'fact.datasetValue': 'по датасету: {v}',
      'profile.title': 'Риск смерти от ССЗ по окнам времени (полоса — пациент, штрих — среднее по когорте)',
      'profile.w30': 'В первые 30 дней',
      'profile.w90': '31–90-й день',
      'profile.w365': '91–365-й день',
      'profile.w1500': '366–{tau}-й день',
      'profile.wNone': 'Без смерти от ССЗ до {tau}-го дня',
      'profile.cohort': 'среднее по когорте',
      'profile.cohortValue': 'когорта: {v}',
      'profile.dataset': 'по датасету: {v}',
      'quality.title': 'Возможная ошибка ввода',
      'quality.note': 'Вне физиологически правдоподобного диапазона: {list}. Прогноз считается по введённому значению; исправьте его в редакторе, чтобы увидеть, как изменится прогноз.',
      'quality.item': '{label} = {v} {unit} (правдоподобно {lo}–{hi})',
      'chart.aria': 'Функция выживаемости пациента ID {id}. Значения можно читать клавишами со стрелками.',
      'chart.y': 'S(t), вероятность не умереть от ССЗ',
      'chart.x': 'дни',
      'chart.deathBefore': 'смерть от ССЗ на {d}-й день (датасет)',
      'chart.censoredBefore': 'жив, наблюдение закончилось на {d}-й день (датасет)',
      'chart.otherBefore': 'смерть от других причин на {d}-й день (датасет)',
      'chart.deathAfter': 'смерть от ССЗ на {d}-й день, после τ (датасет)',
      'chart.aliveAfter': 'нет смерти от ССЗ до τ, наблюдение {d} дн. (датасет)',
      'chart.day': 'День {d}',
      'chart.sBase': 'S(t), по датасету',
      'chart.sEdit': 'S(t), с изменениями',
      'chart.legendBase': 'значения датасета',
      'chart.legendEdit': 'с вашими изменениями',
      'chart.note': 'Функция выживаемости S(t) выбранного пациента. Прогноз времени — её медиана: день, когда S(t) опускается до 0,5 (за горизонтом τ, если остаётся выше 0,5); закрашенная площадь — RMST(τ) = ∫₀<sup>τ</sup> S(t) dt. Модель выживаемости прогнозирует распределение времени смерти, а не дату: см. риск по окнам времени выше.',
      'models.aria': 'Прогноз времени выбранного пациента по всем моделям',
      'models.model': 'Модель',
      'models.cindex': 'C‑index',
      'models.auc30': 'AUC 30 дн.',
      'models.auc365': 'AUC 1 год',
      'models.ibs': 'IBS',
      'models.mae': 'Ср. ошибка, дн.',
      'models.base': 'Время по датасету',
      'models.edit': 'Время с изменениями',
      'models.note': 'Отложенные пациенты всей когорты ({n}, веса IPCW для цензурирования), {model}: C-index {c}; зависящий от времени AUC {auc30} на 30 днях и {auc365} на 1 годе (насколько хорошо умершие в пределах окна отделяются от остальных); интегральный Brier score {ibs} (точность всей S(t) на 0–τ, чем меньше, тем лучше); средняя ошибка медианы {mae} дн.',
      'models.noteBalanced': 'Отложенные пациенты balanced_dataset.csv ({n}, исход к τ известен у всех), {model}: C-index {c}; AUC {auc30} на 30 днях и {auc365} на 1 годе; IBS {ibs}; средняя ошибка медианы {mae} дн. В этой популяции смертей от ССЗ 37% против 10% во всей когорте: модели, откалиброванные на всю когорту, здесь занижают риск, поэтому «Balanced mixture» обучена на этой популяции.',

      'patient.title': 'Пациент',
      'patient.prev': 'Предыдущий пациент',
      'patient.next': 'Следующий пациент',
      'patient.id': 'ID',
      'patient.row': 'Строка',
      'patient.rowOf': 'строка {i} из {max}',
      'patient.notFound': 'Нет пациента с ID {id}',
      'patient.notInDataset': 'ID {id} нет в {file}',
      'patient.reset': 'Сбросить пациента',
      'patient.test': 'тестовая (отложенная) выборка',
      'patient.train': 'обучающая выборка',
      'patient.calib': 'обучающая выборка (только калибровка)',
      'patient.edited': 'изменено признаков: {n}',
      'mini.time': 'time в датасете ',
      'mini.pred': 'прогноз ({model}) ',
      'outcome.cvd': 'Смерть от ССЗ',
      'outcome.other': 'Смерть от других причин',
      'outcome.alive': 'Жив на конец наблюдения',
      'param.slider': '{label}, ползунок',
      'param.reset': 'Вернуть значение из датасета: {label}',
      'param.resetTitle': 'Вернуть значение из датасета',
      'param.dataset': 'датасет',
      'param.datasetValue': 'датасет: {v}',
      'param.notUsed': 'моделями не используется: известен только после выписки',
      'param.implausible': 'неправдоподобно: ожидается {lo}–{hi}',
      'group.demo': 'Общие сведения',
      'group.vitals': 'При поступлении',
      'group.comorb': 'Сопутствующие заболевания',
      'group.event': 'Характеристики ОКС',
      'group.treat': 'Лечение и наблюдение',
      'group.labs': 'Лабораторные показатели',

      'table.summary': 'Таблица',
      'table.sub': 'все пациенты; сортировка по столбцам, щелчок по строке выбирает пациента',
      'table.row': 'Строка',
      'table.id': 'ID',
      'table.outcome': 'Исход',
      'table.time': 'time, дн.',
      'table.real': 'Факт min(T, τ)',
      'table.pred': 'Прогноз, дн.',
      'table.error': '|Ошибка|, дн.',
      'table.risk': 'Риск за 1 год',
      'table.edit': 'С изменениями, дн.',

      'method.title': 'Как это работает',
      'method.list': `
        <li><b>Прогноз времени.</b> Как в <i>Survival-function-analysys.ipynb</i>, модель даёт функцию выживаемости пациента S(t) — вероятность не умереть от ССЗ к дню t. Прогноз времени — её медиана: день, к которому вероятность смерти от ССЗ достигает 50%, или «за горизонтом τ = 1500 дней», если она остаётся ниже (из всех одиночных чисел у медианы наименьшая ожидаемая абсолютная ошибка). Одна дата скрывает неопределённость, поэтому по той же S(t) показываются и вероятности смерти от ССЗ в первые 30 дней, на 31–90-й, 91–365-й и 366–1500-й день и отсутствия смерти от ССЗ до 1500-го дня — рядом со средним по когорте, а также RMST(τ) — площадь под S(t). Прогноз сравнивается с min(T, τ): это значение известно точно для умерших от ССЗ и для наблюдавшихся τ дней и дольше; если наблюдение закончилось раньше (пациент жив или умер от других причин), известна только нижняя граница «≥ time».</li>
        <li><b>Модели</b> (CoxPH, Weibull AFT, XGBoost Cox, полносвязная и резервуарная нейросети) обучены как в ноутбуке на <code>balanced_dataset.csv</code>: те же 326 пациентов обучающей выборки (стратифицированное разбиение, <code>random_state=37</code>), <code>StandardScaler</code> и гиперпараметры, — но только по 28 признакам, известным при поступлении. <code>doctor</code> (наблюдающий врач) и <code>llo</code> (льготные лекарства) назначаются после выписки: умершие рано их не получают (92% и 100% умерших от ССЗ в первые 30 дней), то есть в них частично заложен исход (immortal time bias). В редакторе они показаны, но на прогноз не влияют.</li>
        <li><b>Калибровка на всей когорте.</b> В <code>balanced_dataset.csv</code> входят умершие от ССЗ и наблюдавшиеся τ дней и дольше, но нет 1098 пациентов, наблюдение которых закончилось раньше, поэтому смертей в нём 37% вместо 10%. Выживаемость, оценённая на нём, сильно занижена: средний прогноз S(τ) 0,63–0,72 против 0,88 по факту. Поэтому переход от оценки риска каждой модели к S(t) обучен на всех 1204 обучающих пациентах <code>med_dataset_cardio.xlsx</code> с учётом цензурирования (для собственных обучающих пациентов моделей — оценки вне выборки, у нейросетей — логиты). Порядок пациентов по риску не меняется, а прогноз выживаемости совпадает с фактической.</li>
        <li><b>Точность</b> измерена на отложенных пациентах выбранного датасета (302 во всей когорте, из них 82 — из <code>balanced_dataset.csv</code>): C-index (ранжирование пациентов по риску); зависящий от времени AUC на 30 и 365 днях (насколько хорошо умершие в пределах окна отделяются от остальных); интегральный Brier score на 0–τ (точность всей S(t), строго состоятельное правило оценки); ошибка калибровки RMST (среднее |прогноз − Каплан — Мейер| по квинтилям риска) и средняя ошибка медианы. Для всей когорты цензурирование учтено весами IPCW. По этим признакам AUC на 1 годе около 0,87: группу высокого риска распознать можно, день смерти — нет.</li>
        <li><b>Две популяции — две модели по умолчанию.</b> В <code>balanced_dataset.csv</code> только пациенты, у которых исход к τ = 1500 дней известен (смерть от ССЗ или наблюдение ≥ τ): смертей от ССЗ среди них 37% против 10% во всей когорте. Модели, откалиброванные на всю когорту, верны для когорты, но в этой популяции занижают риск. Поэтому для balanced по умолчанию используется «Balanced mixture»: логистическая регрессия смерти от ССЗ до τ, обученная на 326 обучающих пациентах <code>balanced_dataset.csv</code>, даёт вероятность p, и S(t) = 1 − p·F(t), где F(t) — доля смертей от ССЗ до τ в обучающей выборке, случившихся к дню t. На 82 отложенных пациентах <code>balanced_dataset.csv</code> у неё C-index 0,849, IBS 0,110 и средняя ошибка медианы 233 дня против IBS 0,18–0,19 и 370–384 дней у моделей, откалиброванных на всю когорту. Во всей когорте она завышает риск (средний прогноз S(τ) 0,64 при фактических 0,88), поэтому для полного датасета используется CoxPH. Таблица моделей показывает метрики на отложенных пациентах выбранного датасета.</li>
        <li><b>Методологический разбор: почему убран критерий «ошибка ≤ 150 дней».</b> Прежние версии сравнивали модели по доле пациентов с |прогноз − факт| ≤ 150 дней и прогнозировали фиксированные дни: 150 дней — пациентам, отмеченным классификатором («Balanced two-stage» при P(смерть от ССЗ до τ) ≥ 0,6; каскад — верхним 2% оценки ранней смерти), 900 дней — следующему 1%, 1500 дней — всем остальным. Это была методологическая ошибка. (1) 150 дней — не оценка времени смерти, а центр окна 0–300 дней, выбранный потому, что он максимизирует попадания в критерий; время ранней смерти сильно скошено (из 151 смерти от ССЗ до τ в <code>balanced_dataset.csv</code> 37 — в первые 30 дней, 81 — в первые 300). (2) Порог превращает вероятность в дату: пациент с риском 60% получал «150 дней», хотя по оценке самой модели выживает с вероятностью 40%, и тогда ошибка — 1350 дней. Из 23 отложенных пациентов, отмеченных так, 14 умерли в первые 300 дней, 6 — позже, 3 пережили τ (ID 347, 1085, 1499); ID 63, 67 и 276 — такие же случаи среди обучающих пациентов. (3) Критерий не является состоятельным правилом оценки и определяется выжившими: прогноз 1500 дней всем уже даёт 62,2% на 82 отложенных пациентах против 75,6% у подобранного правила. (4) Пороги, дни и классификаторы подбирались по этому же критерию, а отложенная выборка просматривалась после каждого изменения, поэтому её оценка оптимистична. Теперь прогноз — медиана S(t), каждая модель даёт вероятности окон времени, а модели сравниваются по C-index, зависящему от времени AUC и IBS. Честно назвать раннюю дату не может ни одна модель: наибольшая вероятность смерти от ССЗ в первые 30 дней среди всех 1506 пациентов — 0,19–0,35 в зависимости от модели, а у CoxPH, Weibull AFT, RN Survival и Balanced mixture ни у одного пациента окно первого года не является самым вероятным исходом.</li>
        <li><b>Внезапные необъяснимые смерти от ССЗ</b> (оранжевый ◆ на карте): смерти от ССЗ в первый год, которые не предсказала ни одна из семи моделей (все прогнозы — за горизонтом τ): 23 из 88 таких смертей в <code>balanced_dataset.csv</code>. Для каждой посчитана доля переживших тот же срок (первый месяц, три месяца или первый год) среди 50 самых похожих при поступлении пациентов (28 признаков, стандартизованных): она составляет 90–100%, в среднем 98%. На карте такие точки лежат среди выживших, а не отдельным скоплением.</li>
        <li><b>Неожиданное выживание</b> (синий ◆): пациенты без смерти от ССЗ до τ, у которых модель для популяции <code>balanced_dataset.csv</code> оценила риск смерти от ССЗ до τ в 50% и выше: 26 из 257 таких пациентов (риск 51–91%). Среди 50 самых похожих пациентов с известным исходом до τ умерли 14–62%, в среднем 38%. У 20 из 26 эта доля ниже 50%: модель переоценивает риск для такого профиля (ID 63 и 276: риск 60%, а среди похожих умерли лишь 18%). У 6 (ID 67, 347, 369, 640, 676, 896) — 50% и выше: их выживание не объясняется данными при поступлении; лечения и приверженности к нему после выписки в данных нет. У ID 67 гемоглобин 34 г/л — неправдоподобное значение, вероятно ошибка ввода: при 134 г/л риск снижается с 88% до 61%. Значения вне физиологически правдоподобных диапазонов отмечаются в редакторе и под прогнозом.</li>
        <li><b>Каскад</b> (модель «Cascade»): XGBoost-классификатор смерти от ССЗ в первые 365 дней с калибровкой Платта даёт вероятность p, модель Кокса, обученная на проживших дольше 365 дней, — S<sub>поздн</sub>(t); S(t) = p·S<sub>ранн</sub>(t) + (1 − p)·S<sub>поздн</sub>(t), где S<sub>ранн</sub> — распределение дней ранней смерти в обучающей выборке. Прежние версии давали отмеченным пациентам фиксированные дни (150 или 900); это убрано (см. методологический разбор). Классификатор выбирался кросс-валидацией только на обучающей выборке из логистической регрессии, XGBoost, CatBoost, случайного леса, риска по модели Кокса, kNN (разные масштабирования, обученная метрика NCA, веса по важности, координаты t-SNE), агломеративной кластеризации, SVM, MLP, LDA/QDA, наивного Байеса и ансамблей, без и вместе с конструированными признаками (приближённая шкала GRACE, shock index, eGFR CKD-EPI, клинические флаги). Ни один не отделил ранние смерти лучше: даже среди верхних 1–2% оценок в первые 90 дней умирают лишь 17–33%. Самым сильным одиночным фактором оказался <code>doctor</code>, который известен только после выписки (см. «Модели»). Каскад ранжирует пациентов хуже CoxPH (C-index 0,79 против 0,84) и оставлен для сравнения.</li>
        <li><b>t-SNE</b> считается в браузере по 30 признакам, стандартизованным внутри выбранного датасета (точный метод, инициализация PCA, 1000 итераций — как в scikit-learn). Изменённый пациент помещается на готовую карту методом out-of-sample t-SNE: двигается только его точка — из положения по датасету (пустой кружок) в новое. Изменения привязаны к ID пациента и сохраняются в обоих датасетах.</li>
        <li>Тот же прогноз из командной строки:</li>`,
      'footer.license': 'лицензия MIT',
      'footer.generated': 'модели переобучены {date} скриптом scripts/survival_time_predictor.py',
    },
  };

  // Названия признаков, единицы и значения категорий — по med_dataset_cardio.md
  const NO_YES = { en: ['no', 'yes'], ru: ['нет', 'да'] };
  const FEATURES = {
    en: {
      age: { label: 'Age', unit: 'years' },
      gender: { label: 'Sex', levels: ['female', 'male'] },
      bmi: { label: 'Body-mass index', unit: 'kg/m²' },
      smoking: { label: 'Smoker', levels: NO_YES.en },
      bpm: { label: 'Heart rate on admission', unit: 'bpm' },
      sysAP: { label: 'Systolic blood pressure', unit: 'mmHg' },
      ef_hosp: { label: 'LV ejection fraction', unit: '%' },
      pulm_cong: { label: 'Pulmonary congestion', levels: NO_YES.en },
      af: { label: 'Atrial fibrillation / flutter', levels: NO_YES.en },
      dm: { label: 'Diabetes mellitus', levels: NO_YES.en },
      ckd: { label: 'Chronic kidney disease ≥ 3a', levels: NO_YES.en },
      copd: { label: 'COPD', levels: NO_YES.en },
      insult: { label: 'Prior stroke', levels: NO_YES.en },
      onco: { label: 'Cancer', levels: NO_YES.en },
      severity: { label: 'Severity', levels: ['unstable angina', 'myocardial infarction'] },
      stemi: { label: 'STEMI', levels: NO_YES.en },
      nstemi: { label: 'NSTEMI', levels: NO_YES.en },
      sum_cad: { label: 'Affected coronary arteries', unit: 'count' },
      ca_delay: { label: 'Angiography delayed > 24 h', levels: NO_YES.en },
      stenting: { label: 'Stenting', levels: NO_YES.en },
      total_revasc: { label: 'Total revascularization', levels: NO_YES.en },
      llo: { label: 'Subsidized drugs after discharge', levels: NO_YES.en },
      doctor: { label: 'Follow-up physician', levels: ['none', 'general practitioner', 'cardiologist'] },
      hb: { label: 'Hemoglobin', unit: 'g/L' },
      leukoc: { label: 'Leukocytes', unit: '×10⁹/L' },
      tromboc: { label: 'Platelets', unit: '×10⁹/L' },
      t_chol: { label: 'Total cholesterol', unit: 'mmol/L' },
      ldl: { label: 'LDL cholesterol', unit: 'mmol/L' },
      glu: { label: 'Glucose', unit: 'mmol/L' },
      crea: { label: 'Creatinine', unit: 'µmol/L' },
    },
    ru: {
      age: { label: 'Возраст', unit: 'лет' },
      gender: { label: 'Пол', levels: ['женский', 'мужской'] },
      bmi: { label: 'Индекс массы тела', unit: 'кг/м²' },
      smoking: { label: 'Курение', levels: NO_YES.ru },
      bpm: { label: 'ЧСС при поступлении', unit: 'уд/мин' },
      sysAP: { label: 'Систолическое АД', unit: 'мм рт. ст.' },
      ef_hosp: { label: 'Фракция выброса ЛЖ', unit: '%' },
      pulm_cong: { label: 'Застой в лёгких', levels: NO_YES.ru },
      af: { label: 'Фибрилляция / трепетание предсердий', levels: NO_YES.ru },
      dm: { label: 'Сахарный диабет', levels: NO_YES.ru },
      ckd: { label: 'ХБП 3а стадии и выше', levels: NO_YES.ru },
      copd: { label: 'ХОБЛ', levels: NO_YES.ru },
      insult: { label: 'Инсульт в анамнезе', levels: NO_YES.ru },
      onco: { label: 'Онкологическое заболевание', levels: NO_YES.ru },
      severity: { label: 'Тяжесть ОКС', levels: ['нестабильная стенокардия', 'инфаркт миокарда'] },
      stemi: { label: 'ИМ с подъёмом ST', levels: NO_YES.ru },
      nstemi: { label: 'ИМ без подъёма ST', levels: NO_YES.ru },
      sum_cad: { label: 'Поражённые коронарные артерии', unit: 'шт.' },
      ca_delay: { label: 'Коронарография позже 24 ч', levels: NO_YES.ru },
      stenting: { label: 'Стентирование', levels: NO_YES.ru },
      total_revasc: { label: 'Полная реваскуляризация', levels: NO_YES.ru },
      llo: { label: 'Льготные лекарства после выписки', levels: NO_YES.ru },
      doctor: { label: 'Наблюдающий врач', levels: ['нет', 'терапевт', 'кардиолог'] },
      hb: { label: 'Гемоглобин', unit: 'г/л' },
      leukoc: { label: 'Лейкоциты', unit: '×10⁹/л' },
      tromboc: { label: 'Тромбоциты', unit: '×10⁹/л' },
      t_chol: { label: 'Общий холестерин', unit: 'ммоль/л' },
      ldl: { label: 'Холестерин ЛПНП', unit: 'ммоль/л' },
      glu: { label: 'Глюкоза', unit: 'ммоль/л' },
      crea: { label: 'Креатинин', unit: 'мкмоль/л' },
    },
  };

  const LOCALES = { en: 'en-US', ru: 'ru-RU' };
  const STORAGE_KEY = 'survival-explorer:v1';

  // Язык: параметр ссылки ?lang=en|ru, иначе сохранённый выбор, иначе русский
  const DEFAULT_LANG = 'ru';
  function detect() {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('lang');
      if (STRINGS[fromUrl]) return fromUrl;
    } catch (e) { /* адрес без параметров */ }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (saved && STRINGS[saved.lang]) return saved.lang;
    } catch (e) { /* хранилище недоступно */ }
    return DEFAULT_LANG;
  }

  let lang = detect();
  const formats = {};

  function t(key, params) {
    const text = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
    return params ? text.replace(/\{(\w+)\}/g, (_, name) => (params[name] ?? '')) : text;
  }

  function format(value, minDigits, maxDigits) {
    const key = `${lang}:${minDigits}:${maxDigits}`;
    formats[key] ||= new Intl.NumberFormat(LOCALES[lang], { minimumFractionDigits: minDigits, maximumFractionDigits: maxDigits });
    return formats[key].format(value);
  }

  function applyStatic() {
    document.documentElement.lang = lang;
    document.title = t('doc.title');
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = t('doc.description');
    document.querySelectorAll('[data-i18n]').forEach((node) => { node.textContent = t(node.dataset.i18n); });
    document.querySelectorAll('[data-i18n-html]').forEach((node) => { node.innerHTML = t(node.dataset.i18nHtml); });
    document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel)));
    document.querySelectorAll('[data-lang]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.lang === lang)));
  }

  root.I18N = {
    languages: Object.keys(STRINGS),
    get lang() { return lang; },
    setLang(next) {
      if (!STRINGS[next]) return;
      lang = next;
      applyStatic();
    },
    t,
    feature: (name) => FEATURES[lang][name],
    int: (value) => format(Math.round(value), 0, 0),        // 1,524 / 1 524
    fixed: (value, digits) => format(value, digits, digits), // 0.866 / 0,866
    num: (value) => format(value, 0, 4),                      // значение признака: 43.5 / 43,5
    pct: (value) => new Intl.NumberFormat(LOCALES[lang], { style: 'percent', maximumFractionDigits: 1 }).format(value), // 12.3% / 12,3 %
    applyStatic,
  };

  applyStatic();
})(window);
