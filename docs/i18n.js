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
      'legend.t0': 'Alive / censored (target = 0), n = {n}',
      'legend.t1': 'CVD death (target = 1), n = {n}',
      'legend.selected': 'Selected',
      'legend.edited': 'Edited: dataset position → new position',
      'status.initial': 'Computing t-SNE…',
      'status.affinities': 'Computing t-SNE: pairwise similarities of {n} patients…',
      'status.running': 'Computing t-SNE: iteration {i} / 1000 · perplexity {p}',
      'status.done': 't-SNE · perplexity {p} · KL divergence {kl} · edited patients: {n}',
      'tt.title': 'ID {id} · row {row}',
      'tt.heldOut': ' · held-out',
      'tt.excluded': ' · censored before τ',
      'tt.time': 'time (dataset)',
      'tt.outcome': 'outcome, target = {t}',
      'tt.pred': 'predicted time, {model}',
      'tt.predEdit': 'predicted with your edits',

      'pred.title': 'Predicted time',
      'pred.sub': 'patient ID {id} · {model}',
      'hero.edited': 'With your edits · {model}',
      'hero.dataset': 'Dataset values · {model}',
      'hero.sub': 'expected days alive within τ = {tau} days (RMST); compare with min(time, τ) = {v}',
      'hero.subCensored': 'expected days alive within τ = {tau} days (RMST); censored on day {v}, so min(T, τ) ≥ {v}',
      'hero.delta': ' vs dataset values ({v} days)',
      'hero.hint': 'Edit a parameter to re-predict.',
      'unit.days': 'days',
      'days': '{n} days',
      'days.short': '{n} d',
      'fact.time': 'time in dataset',
      'fact.outcome': '{outcome} · target = {t}',
      'fact.alive': 'P(alive at τ)',
      'fact.aliveNote': 'S(τ), τ = {tau} days',
      'fact.median': 'median survival',
      'fact.medianNote': 'first day with S(t) ≤ {half}',
      'fact.datasetValue': 'dataset values: {v}',
      'fact.beyond': '> {tau} days',
      'chart.aria': 'Survival function of patient ID {id}. Use the arrow keys to read values.',
      'chart.y': 'S(t), probability to be alive',
      'chart.x': 'days',
      'chart.deathBefore': 'CVD death on day {d} (dataset)',
      'chart.censoredBefore': 'censored on day {d} (dataset)',
      'chart.deathAfter': 'CVD death on day {d}, after τ (dataset)',
      'chart.aliveAfter': 'alive at τ, followed {d} days (dataset)',
      'chart.day': 'Day {d}',
      'chart.sBase': 'S(t), dataset values',
      'chart.sEdit': 'S(t), with edits',
      'chart.legendBase': 'dataset values',
      'chart.legendEdit': 'with your edits',
      'chart.note': 'Survival function S(t) of the selected patient. The shaded area under it is the predicted time: RMST(τ) = ∫₀<sup>τ</sup> S(t) dt.',
      'models.aria': 'Predicted time of the selected patient by every model',
      'models.model': 'Model',
      'models.cindex': 'C-index (test)',
      'models.brier': 'Brier S(τ)',
      'models.base': 'Time, dataset values',
      'models.edit': 'Time, edited',

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
      'patient.excluded': 'not used by the models: censored before τ',
      'patient.edited': 'edited parameters: {n}',
      'mini.time': 'time in dataset ',
      'mini.pred': 'predicted ({model}) ',
      'outcome.0': 'Alive / censored',
      'outcome.1': 'CVD death',
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
      'table.pred': 'Predicted, days',
      'table.edit': 'With edits, days',

      'method.title': 'How it works',
      'method.list': `
        <li><b>Time prediction</b> follows <i>Survival-function-analysys.ipynb</i>: a model gives the survival function S(t) of the patient, and the predicted time is RMST(τ), the area under S(t) up to τ = 1500 days. It is compared with min(time, τ) from the dataset.</li>
        <li><b>Models</b> (CoxPH, Weibull AFT, XGBoost Cox, NN and reservoir network with Cox calibration) are trained exactly as in the notebook: the same 326 training patients of <code>balanced_dataset.csv</code> (stratified split, <code>random_state=37</code>), <code>StandardScaler</code> and hyperparameters. C-index and Brier score are measured on the 82 held-out patients.</li>
        <li><b>Datasets.</b> <code>balanced_dataset.csv</code> is the notebook's <code>df_balanced</code>: the patients of <code>med_dataset_cardio.xlsx</code> whose status at τ is known (CVD death or follow-up ≥ τ). With the full <code>med_dataset_cardio.xlsx</code> the same models predict all 1506 patients, including 1098 censored before τ that the models never saw; for them only a lower bound of min(T, τ) is known.</li>
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
      'legend.t0': 'Жив / цензурирован (target = 0), n = {n}',
      'legend.t1': 'Смерть от ССЗ (target = 1), n = {n}',
      'legend.selected': 'Выбранный пациент',
      'legend.edited': 'Изменён: положение по датасету → новое',
      'status.initial': 'Расчёт t-SNE…',
      'status.affinities': 'Расчёт t-SNE: попарные сходства {n} пациентов…',
      'status.running': 'Расчёт t-SNE: итерация {i} / 1000 · perplexity {p}',
      'status.done': 't-SNE · perplexity {p} · KL-дивергенция {kl} · изменённых пациентов: {n}',
      'tt.title': 'ID {id} · строка {row}',
      'tt.heldOut': ' · тестовая выборка',
      'tt.excluded': ' · цензурирован до τ',
      'tt.time': 'time (датасет)',
      'tt.outcome': 'исход, target = {t}',
      'tt.pred': 'прогноз времени, {model}',
      'tt.predEdit': 'прогноз с вашими изменениями',

      'pred.title': 'Прогноз времени',
      'pred.sub': 'пациент ID {id} · {model}',
      'hero.edited': 'С вашими изменениями · {model}',
      'hero.dataset': 'Значения из датасета · {model}',
      'hero.sub': 'ожидаемое число дней жизни в пределах τ = {tau} дн. (RMST); сравнивается с min(time, τ) = {v}',
      'hero.subCensored': 'ожидаемое число дней жизни в пределах τ = {tau} дн. (RMST); цензурирован на {v}-й день, поэтому min(T, τ) ≥ {v}',
      'hero.delta': ' относительно значений датасета ({v} дн.)',
      'hero.hint': 'Измените любой признак — прогноз пересчитается.',
      'unit.days': 'дн.',
      'days': '{n} дн.',
      'days.short': '{n} дн.',
      'fact.time': 'time в датасете',
      'fact.outcome': '{outcome} · target = {t}',
      'fact.alive': 'P(жив на момент τ)',
      'fact.aliveNote': 'S(τ), τ = {tau} дн.',
      'fact.median': 'медиана дожития',
      'fact.medianNote': 'первый день, когда S(t) ≤ {half}',
      'fact.datasetValue': 'по датасету: {v}',
      'fact.beyond': '> {tau} дн.',
      'chart.aria': 'Функция выживаемости пациента ID {id}. Значения можно читать клавишами со стрелками.',
      'chart.y': 'S(t), вероятность быть живым',
      'chart.x': 'дни',
      'chart.deathBefore': 'смерть от ССЗ на {d}-й день (датасет)',
      'chart.censoredBefore': 'цензурирован на {d}-й день (датасет)',
      'chart.deathAfter': 'смерть от ССЗ на {d}-й день, после τ (датасет)',
      'chart.aliveAfter': 'жив на момент τ, наблюдение {d} дн. (датасет)',
      'chart.day': 'День {d}',
      'chart.sBase': 'S(t), по датасету',
      'chart.sEdit': 'S(t), с изменениями',
      'chart.legendBase': 'значения датасета',
      'chart.legendEdit': 'с вашими изменениями',
      'chart.note': 'Функция выживаемости S(t) выбранного пациента. Закрашенная площадь под ней — прогноз времени: RMST(τ) = ∫₀<sup>τ</sup> S(t) dt.',
      'models.aria': 'Прогноз времени выбранного пациента по всем моделям',
      'models.model': 'Модель',
      'models.cindex': 'C-index (тест)',
      'models.brier': 'Brier S(τ)',
      'models.base': 'Время по датасету',
      'models.edit': 'Время с изменениями',

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
      'patient.excluded': 'не использовался моделями: цензурирован до τ',
      'patient.edited': 'изменено признаков: {n}',
      'mini.time': 'time в датасете ',
      'mini.pred': 'прогноз ({model}) ',
      'outcome.0': 'Жив / цензурирован',
      'outcome.1': 'Смерть от ССЗ',
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
      'table.pred': 'Прогноз, дн.',
      'table.edit': 'С изменениями, дн.',

      'method.title': 'Как это работает',
      'method.list': `
        <li><b>Прогноз времени</b> — как в <i>Survival-function-analysys.ipynb</i>: модель даёт функцию выживаемости пациента S(t), а прогноз времени — RMST(τ), площадь под S(t) до τ = 1500 дней. Он сравнивается с min(time, τ) из датасета.</li>
        <li><b>Модели</b> (CoxPH, Weibull AFT, XGBoost Cox, полносвязная и резервуарная нейросети с калибровкой Кокса) обучены в точности как в ноутбуке: те же 326 пациентов обучающей выборки <code>balanced_dataset.csv</code> (стратифицированное разбиение, <code>random_state=37</code>), <code>StandardScaler</code> и гиперпараметры. C-index и Brier score измерены на 82 пациентах отложенной выборки.</li>
        <li><b>Датасеты.</b> <code>balanced_dataset.csv</code> — это <code>df_balanced</code> из ноутбука: пациенты <code>med_dataset_cardio.xlsx</code> с известным статусом на τ (смерть от ССЗ или наблюдение не меньше τ). На полном <code>med_dataset_cardio.xlsx</code> те же модели дают прогноз для всех 1506 пациентов, в том числе для 1098 цензурированных до τ, которых модели не видели; для них известна только нижняя граница min(T, τ).</li>
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
    applyStatic,
  };

  applyStatic();
})(window);
