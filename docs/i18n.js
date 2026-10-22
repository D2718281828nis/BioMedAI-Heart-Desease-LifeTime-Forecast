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
      'tt.conf': 'P(|error| ≤ {tol} days)',

      'pred.title': 'Predicted time',
      'pred.sub': 'patient ID {id} · {model}',
      'hero.edited': 'With your edits · {model}',
      'hero.dataset': 'Dataset values · {model}',
      'hero.sub': 'predicted min(T, τ), τ = {tau} days: the median of S(t), the estimate with the smallest error; real: {v}',
      'hero.subCensored': 'predicted min(T, τ), τ = {tau} days: the median of S(t), the estimate with the smallest error; real: ≥ {v} (followed {v} days without CVD death)',
      'hero.subOther': 'predicted min(T, τ), τ = {tau} days: the median of S(t), the estimate with the smallest error; real: ≥ {v} (died of other causes on day {v}, CVD death not observed)',
      'hero.delta': ' vs dataset values ({v} days)',
      'hero.hint': 'Edit a parameter to re-predict.',
      'unit.days': 'days',
      'days': '{n} days',
      'days.short': '{n} d',
      'fact.time': 'time in dataset',
      'fact.outcome': '{outcome} · target = {t}',
      'fact.alive': 'P(no CVD death by τ)',
      'fact.aliveNote': 'S(τ), τ = {tau} days',
      'fact.risk': 'CVD death risk within 1 year',
      'fact.conf': 'P(|error| ≤ {tol} days)',
      'fact.confOk': 'reliable: ≥ {p}',
      'fact.confLow': 'not guaranteed: below {p}, the outcome is uncertain',
      'fact.rmst': 'Expected days without CVD death',
      'fact.rmstNote': 'RMST(τ), the area under S(t)',
      'fact.stage': 'Stage 1: group',
      'fact.stageEarly': 'early CVD death',
      'fact.stageLate': 'other patients',
      'fact.stageNote': 'classifier score {p} (threshold {thr}) for CVD death within {days} days',
      'fact.cohort': 'cohort average: {v}',
      'fact.datasetValue': 'dataset values: {v}',
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
      'chart.note': 'Survival function S(t) of the selected patient. The predicted time is the day S(t) falls to 0.5 (1500 if it stays above 0.5); the shaded area is RMST(τ) = ∫₀<sup>τ</sup> S(t) dt.',
      'models.aria': 'Predicted time of the selected patient by every model',
      'models.model': 'Model',
      'models.cindex': 'C-index (test)',
      'models.brier': 'Brier S(τ), IPCW',
      'models.mae': 'Mean error, days',
      'models.within': 'Error ≤ 150 days',
      'models.base': 'Time, dataset values',
      'models.edit': 'Time, edited',
      'models.note': 'Measured on {n} held-out patients, {model}: mean error {mae} days (with RMST as the prediction: {maeRmst}), error ≤ {tol} days for {within} of patients. An error ≤ {tol} days cannot be guaranteed for every patient: patients with the same parameters have outcomes that differ by years. When P(|error| ≤ {tol} days) ≥ {p} (so for {share} of patients), the error was ≤ {tol} days in {hit} of held-out cases.',

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
      'table.conf': 'P(error ≤ 150 d)',
      'table.edit': 'With edits, days',

      'method.title': 'How it works',
      'method.list': `
        <li><b>Predicted time.</b> As in <i>Survival-function-analysys.ipynb</i>, a model gives the patient's survival function S(t), the probability of no CVD death by day t. The predicted time is its median: the day S(t) falls to 0.5, or τ = 1500 days if it stays above. Among all estimates from S(t) the median has the smallest mean absolute error (106 against 140 days for RMST(τ), the area under S(t), which is also shown). Every prediction comes with P(|error| ≤ 150 days) computed from the same S(t). It is compared with min(T, τ): it is known exactly for CVD deaths and for patients followed for τ days or longer; when follow-up ended earlier (alive, or died of other causes) only a lower bound "≥ time" is known.</li>
        <li><b>Models</b> (CoxPH, Weibull AFT, XGBoost Cox, NN and reservoir network) are trained as in the notebook on <code>balanced_dataset.csv</code>: the same 326 training patients (stratified split, <code>random_state=37</code>), <code>StandardScaler</code> and hyperparameters.</li>
        <li><b>Calibration on the whole cohort.</b> <code>balanced_dataset.csv</code> keeps CVD deaths and patients followed for τ days or longer, but drops the 1098 patients whose follow-up ended earlier, so 37% of it are deaths instead of 10%. Survival estimated on it is far too low: mean predicted S(τ) 0.63–0.72 against 0.88 observed. Therefore the mapping from each model's risk score to S(t) is fitted on all 1204 training patients of <code>med_dataset_cardio.xlsx</code> with censoring taken into account (out-of-fold scores for the models' own training patients, logits for the neural networks). The ranking of patients does not change; predicted survival now matches the observed one.</li>
        <li><b>Accuracy</b> is measured on 302 held-out patients (82 from <code>balanced_dataset.csv</code> and 220 censored before τ): C-index, Brier score of S(τ) with IPCW weights, and calibration error of RMST (mean |prediction − Kaplan–Meier| over risk quintiles). A survival model predicts a distribution, not a date. With these 30 parameters the C-index is about 0.86, so the exact day of an early death cannot be predicted; such patients are recognized by a high risk: compare "CVD death risk within 1 year" with the cohort average.</li>
        <li><b>Two-stage algorithm</b> (model "Two-stage"). Stage 1: an XGBoost classifier of CVD death within the first 365 days. Stage 2: patients classified as early deaths get the median day of early deaths in the training data; the others get the median of S(t) of a new CoxPH trained on patients who lived longer than 365 days. The settings were chosen by cross-validation on training patients only, among: 90, 180 or 365 days; logistic regression or XGBoost; the 30 parameters with or without engineered features (approximate GRACE score, shock index, eGFR CKD-EPI, flags of shock, EF &lt; 40%, anemia, hyperglycemia, leukocytosis, age ≥ 75); a constant or a Weibull model of the early-death day; threshold 0.3–0.7. Engineered features did not improve the classification. On held-out patients the algorithm is as accurate as the single models (see the model table): early CVD deaths are hard to recognise in advance, and most patients the classifier flags actually survive.</li>
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
      'tt.conf': 'P(|ошибка| ≤ {tol} дн.)',

      'pred.title': 'Прогноз времени',
      'pred.sub': 'пациент ID {id} · {model}',
      'hero.edited': 'С вашими изменениями · {model}',
      'hero.dataset': 'Значения из датасета · {model}',
      'hero.sub': 'прогноз min(T, τ), τ = {tau} дн.: медиана S(t) — оценка с наименьшей ошибкой; факт: {v}',
      'hero.subCensored': 'прогноз min(T, τ), τ = {tau} дн.: медиана S(t) — оценка с наименьшей ошибкой; факт: ≥ {v} (наблюдался {v} дн. без смерти от ССЗ)',
      'hero.subOther': 'прогноз min(T, τ), τ = {tau} дн.: медиана S(t) — оценка с наименьшей ошибкой; факт: ≥ {v} (умер от других причин на {v}-й день, смерть от ССЗ не наблюдается)',
      'hero.delta': ' относительно значений датасета ({v} дн.)',
      'hero.hint': 'Измените любой признак — прогноз пересчитается.',
      'unit.days': 'дн.',
      'days': '{n} дн.',
      'days.short': '{n} дн.',
      'fact.time': 'time в датасете',
      'fact.outcome': '{outcome} · target = {t}',
      'fact.alive': 'P(без смерти от ССЗ до τ)',
      'fact.aliveNote': 'S(τ), τ = {tau} дн.',
      'fact.risk': 'Риск смерти от ССЗ за 1 год',
      'fact.conf': 'P(|ошибка| ≤ {tol} дн.)',
      'fact.confOk': 'надёжно: ≥ {p}',
      'fact.confLow': 'не гарантируется: меньше {p}, исход неопределён',
      'fact.rmst': 'Ожидаемое число дней без смерти от ССЗ',
      'fact.rmstNote': 'RMST(τ), площадь под S(t)',
      'fact.stage': 'Этап 1: группа',
      'fact.stageEarly': 'ранняя смерть от ССЗ',
      'fact.stageLate': 'остальные пациенты',
      'fact.stageNote': 'оценка классификатора {p} (порог {thr}) для смерти от ССЗ в первые {days} дн.',
      'fact.cohort': 'в среднем по когорте: {v}',
      'fact.datasetValue': 'по датасету: {v}',
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
      'chart.note': 'Функция выживаемости S(t) выбранного пациента. Прогноз времени — день, когда S(t) опускается до 0,5 (1500, если остаётся выше 0,5); закрашенная площадь — RMST(τ) = ∫₀<sup>τ</sup> S(t) dt.',
      'models.aria': 'Прогноз времени выбранного пациента по всем моделям',
      'models.model': 'Модель',
      'models.cindex': 'C-index (тест)',
      'models.brier': 'Brier S(τ), IPCW',
      'models.mae': 'Средняя ошибка, дн.',
      'models.within': 'Ошибка ≤ 150 дн.',
      'models.base': 'Время по датасету',
      'models.edit': 'Время с изменениями',
      'models.note': 'Измерено на {n} отложенных пациентах, {model}: средняя ошибка {mae} дн. (если прогнозом считать RMST — {maeRmst}), ошибка ≤ {tol} дн. у {within} пациентов. Ошибку ≤ {tol} дн. нельзя гарантировать для каждого пациента: у пациентов с одинаковыми признаками исходы различаются на годы. Когда P(|ошибка| ≤ {tol} дн.) ≥ {p} (так у {share} пациентов), на отложенной выборке ошибка была ≤ {tol} дн. в {hit} случаев.',

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
      'table.conf': 'P(ошибка ≤ 150 дн.)',
      'table.edit': 'С изменениями, дн.',

      'method.title': 'Как это работает',
      'method.list': `
        <li><b>Прогноз времени.</b> Как в <i>Survival-function-analysys.ipynb</i>, модель даёт функцию выживаемости пациента S(t) — вероятность не умереть от ССЗ к дню t. Прогноз времени — её медиана: день, когда S(t) опускается до 0,5, или τ = 1500 дней, если остаётся выше. Из всех оценок по S(t) у медианы наименьшая средняя абсолютная ошибка (106 против 140 дней у RMST(τ) — площади под S(t), она тоже показывается). Для каждого прогноза по той же S(t) считается P(|ошибка| ≤ 150 дн.). Он сравнивается с min(T, τ): это значение известно точно для умерших от ССЗ и для наблюдавшихся τ дней и дольше; если наблюдение закончилось раньше (пациент жив или умер от других причин), известна только нижняя граница «≥ time».</li>
        <li><b>Модели</b> (CoxPH, Weibull AFT, XGBoost Cox, полносвязная и резервуарная нейросети) обучены как в ноутбуке на <code>balanced_dataset.csv</code>: те же 326 пациентов обучающей выборки (стратифицированное разбиение, <code>random_state=37</code>), <code>StandardScaler</code> и гиперпараметры.</li>
        <li><b>Калибровка на всей когорте.</b> В <code>balanced_dataset.csv</code> входят умершие от ССЗ и наблюдавшиеся τ дней и дольше, но нет 1098 пациентов, наблюдение которых закончилось раньше, поэтому смертей в нём 37% вместо 10%. Выживаемость, оценённая на нём, сильно занижена: средний прогноз S(τ) 0,63–0,72 против 0,88 по факту. Поэтому переход от оценки риска каждой модели к S(t) обучен на всех 1204 обучающих пациентах <code>med_dataset_cardio.xlsx</code> с учётом цензурирования (для собственных обучающих пациентов моделей — оценки вне выборки, у нейросетей — логиты). Порядок пациентов по риску не меняется, а прогноз выживаемости совпадает с фактической.</li>
        <li><b>Точность</b> измерена на 302 отложенных пациентах (82 из <code>balanced_dataset.csv</code> и 220 цензурированных до τ): C-index, Brier score прогноза S(τ) с весами IPCW и ошибка калибровки RMST (среднее |прогноз − Каплан — Мейер| по квинтилям риска). Модель выживаемости прогнозирует распределение, а не дату. По этим 30 признакам C-index около 0,86, поэтому точный день ранней смерти предсказать нельзя; такие пациенты распознаются по высокому риску — сравните «Риск смерти от ССЗ за 1 год» со средним по когорте.</li>
        <li><b>Двухэтапный алгоритм</b> (модель «Two-stage»). Этап 1 — XGBoost-классификатор смерти от ССЗ в первые 365 дней. Этап 2 — пациентам из группы ранней смерти прогнозируется медиана дня ранней смерти в обучающей выборке, остальным — медиана S(t) новой модели Кокса, обученной на проживших дольше 365 дней. Настройки выбраны кросс-валидацией только на обучающей выборке из вариантов: 90, 180 или 365 дней; логистическая регрессия или XGBoost; 30 признаков без или вместе с конструированными (приближённая шкала GRACE, shock index, eGFR CKD-EPI, флаги шока, ФВ &lt; 40%, анемии, гипергликемии, лейкоцитоза, возраста ≥ 75); константа или модель Weibull для дня ранней смерти; порог 0,3–0,7. Конструированные признаки классификацию не улучшили. На отложенной выборке точность алгоритма такая же, как у отдельных моделей (см. таблицу моделей): раннюю смерть от ССЗ трудно распознать заранее, и большинство отмеченных классификатором пациентов на самом деле выживают.</li>
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
