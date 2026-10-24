"""Прогноз времени дожития по подходу Survival-function-analysys.ipynb — с перекалибровкой на всей когорте.

Модели — те же, что в ноутбуке (CoxPH, Weibull AFT, XGBoost Cox, полносвязная и резервуарная нейросети),
с тем же разбиением df_balanced (= balanced_dataset.csv), стандартизацией и гиперпараметрами. Для пациента
считается функция выживаемости S(t) на сетке 0..τ−1 и прогноз времени RMST(τ) = ∫₀^τ S(t) dt.

Исправления по сравнению с ноутбуком.

1. Признаки doctor (наблюдающий врач) и llo (льготное лекарственное обеспечение) назначаются после выписки:
умершие рано их не получают (92% и 100% умерших от ССЗ в первые 30 дней; ЛЛО нет ни у одного из 69 умерших от ССЗ
в первые 180 дней), то есть в них частично заложен исход (immortal time bias). Модели всё же обучаются на всех
30 признаках (USE_POST_DISCHARGE): прогноз с ними — ретроспективный, по данным, известным после выписки. Похожие
пациенты и кластеры многоэтапного конвейера — по 28 признакам при поступлении (admission_features).

2. df_balanced — это смерти от ССЗ и пациенты, наблюдавшиеся не меньше τ. Пациентов включали в исследование
около двух лет, а закончилось оно для всех в один день: живые наблюдались 889–1634 дня, и 1098 пациентов,
цензурированных раньше τ, — в основном включённые поздно. Но df_balanced отбирает по исходу, а не по дате
включения: поздно включённые, умершие от ССЗ, в нём остаются (около 75% из 152 смертей), а выжившие — нет. Поэтому
смертей в нём 37%, а во всей когорте к τ — 11% (Каплан — Мейер). Это видно и без допущений о цензурировании:
до 889-го дня ни один живой пациент не выбывает, и в первый год от ССЗ умерли 88 из 1506 (5,8%), а в
df_balanced — 88 из 408 (21,6%). Функции выживаемости, оценённые на df_balanced, поэтому сильно занижены: средний
прогноз S(τ) 0,63–0,72 против 0,88 по Каплану — Мейеру на отложенных пациентах.

Модели ноутбука по-прежнему обучаются на df_balanced, а переход от оценки риска модели s к S(t) — калибратор Кокса
(для Weibull AFT — Weibull) S(t | s) = S₀(t)^exp(b₁·s + b₂·(s − s̄)²) (см. QUADRATIC_CALIBRATION) — обучается на всей
обучающей когорте med_dataset_cardio.xlsx с учётом цензурирования. Оценки риска для пациентов df_balanced при этом
берутся вне выборки (5 фолдов). Для нейросетей оценка риска — логит, а не вероятность: вероятность насыщается у 1
и сжимает прогноз у пациентов высокого риска.

Balanced mixture и Staged pipeline учат «смерть от ССЗ до τ» — исход, который у цензурированных до τ неизвестен.
Рано и поздно включённые пациенты различаются и по признакам при поступлении (AUC 0,70: у включённых рано выше
холестерин, ЛПНП и ФВ, меньше инфарктов), поэтому одних весов IPCW по времени недостаточно: средний прогноз S(τ)
остаётся 0,80–0,82. Цензурированные до τ входят в обучение с частичными метками (survival_share): известный исход
берётся как есть, а пациент, живой на день выбывания C, входит выжившим с весом q — долей доживших до τ среди
PSEUDO_NEIGHBOURS самых похожих на него пациентов, тоже живых на день C, с известным к τ исходом, — и умершим до τ
с весом 1 − q.

Команды:
  export   обучить модели и калибраторы, записать параметры и оба датасета в docs/survival_model.js
           (их использует интерактивная страница docs/index.html — тот же расчёт на JavaScript)
  predict  прогноз времени для пациента, в том числе с изменёнными признаками
  stamp    проставить в docs/index.html версии скриптов страницы (export делает это сам; нужно после правки docs/*.js)

Примеры:
  python scripts/survival_time_predictor.py export
  python scripts/survival_time_predictor.py predict --id 1444
  python scripts/survival_time_predictor.py predict --row 0 --set age=70 ef_hosp=35
  python scripts/survival_time_predictor.py predict --row 5 --dataset full
"""

import argparse
import base64
import json
import os
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
FULL_XLSX = ROOT / 'med_dataset_cardio.xlsx'
BALANCED_CSV = ROOT / 'balanced_dataset.csv'
MODEL_JS = ROOT / 'docs' / 'survival_model.js'
PAGE_HTML = ROOT / 'docs' / 'index.html'
JS_PREFIX = 'window.SURVIVAL_MODEL = '

# Горизонт τ и дневная сетка — как в ноутбуке
TAU = 1500
GRID = np.arange(TAU)
# Сроки оценки риска — 1, 3, 6, 9 и 12 месяцев. Прогноз модели — распределение времени, а не дата: медиана S(t)
# раньше τ означает риск смерти от ССЗ до τ выше 50%, а такой риск — у 1–3% пациентов, поэтому у умерших в первый
# год ошибка даты около 1300 дней. Пациенту показываются риски смерти от ССЗ к этим срокам, а модели сравниваются по
# тому, насколько эти риски отделяют умерших к сроку от остальных (AUC) и совпадают с фактом (прогноз / факт,
# группы риска).
HORIZONS = [30, 90, 180, 270, 365]
# Группы риска по прогнозу на 12 месяцев: < 3% — низкий, 3–10% — умеренный, 10–25% — высокий, ≥ 25% — очень высокий
RISK_GROUP_EDGES = [0.03, 0.10, 0.25]
# Прогнозы вне выборки для групп риска: кросс-валидация по CV_FOLDS фолдам обучающей когорты. На 302 отложенных
# пациентах для групп мало событий (7 смертей к 1 месяцу, 16 к году), на 1204 обучающих — 30 и 72
CV_FOLDS = 5
MODEL_NAMES = {
    'cph': 'CoxPH',
    'aft': 'Weibull AFT',
    'xgb': 'XGBoost Cox',
    'nn': 'NN Survival',
    'rn': 'RN Survival',
    'two': 'Cascade',
    'bal': 'Balanced mixture',
    'stg': 'Staged pipeline',
}
# Модели ноутбука с калибровкой S(t); 'two' — каскад классификаторов и моделей времени (train_cascade)
SURVIVAL_MODELS = ['cph', 'aft', 'xgb', 'nn', 'rn']
# Калибратор с квадратичным членом S(t | s) = S₀(t)^exp(b₁·s + b₂·(s − s̄)²), s̄ — средняя оценка обучающих; у XGBoost
# выигрыша нет, калибратор линейный (b₂ = 0). Квадратичный член порядок пациентов не меняет, а вероятности уточняет:
# при кросс-валидации (3 разбиения × 5 фолдов на 1204 обучающих) Brier S(τ) у CoxPH и Weibull AFT 0,0817 → 0,079 во всех
# трёх разбиениях, ошибка калибровки RMST 17 → 9–11 дней, у нейросетей Brier S(τ) тоже ниже. Чтобы риск оставался
# монотонным по s, оценка ограничивается вершиной параболы (за ней — 0–0,6% пациентов).
# Там же проверено и отвергнуто обучение самих моделей на всей когорте (Кокс-модели — с цензурированием, нейросети —
# с частичными метками, калибратор — по одной или по обеим оценкам): нейросети ранжируют хуже (C-index −0,04…−0,05),
# у CoxPH, Weibull AFT и XGBoost ранжирование лучше (+0,025…+0,047), но хуже Brier S(τ) и калибровка RMST.
QUADRATIC_CALIBRATION = ('cph', 'aft', 'nn', 'rn')

# Каскад: классификатор «смерть от ССЗ в первые EARLY_DAYS дней» (XGBoost, вероятность по Платту) и модель Кокса,
# обученная на проживших дольше EARLY_DAYS. S(t) = p·S_early(t) + (1 − p)·S_late(t), где S_early — распределение дней
# ранней смерти в обучающей выборке; прогноз — медиана S(t), как у остальных моделей.
# Методологическая ошибка прежней версии: отмеченным классификаторами пациентам назначались фиксированные дни
# (150 и 900), подобранные так, чтобы окно ±150 дней покрывало как можно больше смертей (0–300-й день). Это не
# оценка времени смерти, а центр окна допуска: смерть на 1-й день при прогнозе 150 считалась «верной», а выжившему
# с повышенным риском прогнозировалась смерть на 150-й день. Подбор порогов и дней по доле ошибок ≤ 150 дней
# подгонял модель под этот критерий. Выбор классификатора по-прежнему сделан кросс-валидацией (XGBoost по признакам
# при поступлении; kNN, t-SNE, агломеративная кластеризация, ансамбли и конструированные признаки его не превзошли).
EARLY_DAYS = 365

# Частичные метки цензурированных до τ (см. docstring): число похожих пациентов, по которым считается q. Соседи —
# обучающие пациенты df_balanced, живые на день выбывания, расстояние — по 28 стандартизованным признакам, доля
# доживших — с весами IPCW соседей (выжившие до τ попадают в df_balanced реже умерших). При кросс-валидации (5 × 5
# фолдов на 1204 обучающих) частичные метки лучше весов IPCW по C-index (+0,025), IBS и калибровке RMST (32–34 дня
# против 64–95); k = 25, 50 и 100 дают одно и то же.
PSEUDO_NEIGHBOURS = 50

# Balanced mixture: логистическая регрессия «смерть от ССЗ до τ» на 326 обучающих пациентах df_balanced и 878
# цензурированных до τ с частичными метками; S(t) = 1 − p·F(t), F — доля умерших к дню t среди умерших от ССЗ до τ
# с весами IPCW 1/G(T) (поздние смерти поздно включённых не наблюдаются; то же, что распределение по Каплану —
# Мейеру); прогноз — медиана S(t). Без цензурированных модель была откалибрована на df_balanced, а не на пациентов
# при поступлении: принадлежность к df_balanced зависит от исхода и даты включения и заранее не известна.

# Многоэтапный конвейер (train_staged):
# 1) вся когорта; 2) без ранних смертей (смерть от ССЗ в первые STAGED_EARLY_DAYS = 10 дней); 3) правило balanced
# из ноутбука (смерть от ССЗ или наблюдение ≥ τ) — новый balanced без ранних смертей, его обучающие пациенты, и
# цензурированные до τ с частичными метками; классификация в три группы: этап 1 — ранняя смерть или нет (все
# обучающие: статус на 10-й день известен у всех), этап 2 — смерть от ССЗ до τ или жизнь дольше τ (логистическая
# регрессия на новом balanced и частичных метках); 4) модель Кокса на всех обучающих, переживших 10 дней
# (цензурированные — на дне выбывания), — время поздней смерти;
# 5) S(t) = 1 − p_ранн·F_ранн(t) − p_поздн·F_поздн(t | x), где F_ранн — распределение дней ранней смерти (до 10-го
# дня живые не выбывают), F_поздн — время смерти по модели Кокса при условии смерти до τ. Прогноз — медиана S(t):
# вероятности классификатора определяют время каждого пациента. Жёсткая маршрутизация (время группы с наибольшей
# вероятностью) на странице показана справочно.
# Этап 1 использует агломеративную кластеризацию всей когорты: STAGED_CLUSTERS кластеров, связь STAGED_LINKAGE,
# 28 признаков при поступлении всех 1506 пациентов, без исходов; принадлежность — ближайший центроид. Принадлежность
# к кластеру (one-hot) входит в логистическую регрессию вместе с признаками пациента. Кластеры — клинические фенотипы:
# в кластере «анемия, ХБП, ФП, без стентирования» (100 пациентов) и «гипергликемия, диабет, лейкоцитоз» (78) — 10 из
# 17 смертей от ССЗ в первые 10 дней, в основном кластере (945 пациентов) — 2. При кросс-валидации (5 разбиений ×
# 5 фолдов, 1199 обучающих с известным статусом на 10-й день, 14 ранних смертей) кластеры снижают log-loss этапа 1
# (0,0568 против 0,0574) в 23 из 25 фолдов и повышают AUC с 0,794 до 0,808; C = 0,03 — лучший из 0,01–0,3. Перебор
# (на 326 обучающих df_balanced): связи ward, average, complete; 4–64 кластера; one-hot или доля ранних смертей
# в кластере как признак; только кластер или вместе с признаками. Доля ранних смертей в кластере (target encoding)
# отвергнута: при 14 ранних смертях на 16 кластеров исключение собственного исхода пациента из доли его кластера
# даёт отрицательный коэффициент и ненадёжный выигрыш. Для этапа 2 кластеры не помогают.
STAGED_EARLY_DAYS = 10
STAGED_CLUSTERS = 8
STAGED_LINKAGE = 'complete'
STAGED_GROUPS = ('early', 'late', 'survive')

# Внезапная необъяснимая смерть: смерть от ССЗ в первые SUDDEN_MAX_DAY дней при невысоком прогнозном риске. Срок
# сравнения — ближайший из HORIZONS, не раньше дня смерти. Смерть отмечается, если медиана риска восьми моделей к этому
# сроку ниже SUDDEN_RISK_RATIO средних по когорте (Каплан — Мейер) и не меньше SUDDEN_SURVIVED из SUDDEN_NEIGHBOURS самых
# похожих по признакам при поступлении пациентов с известным на этот срок исходом его пережили. Медиана моделей, а не
# «ни одна модель»: прежнее правило «у всех моделей медиана S(t) за τ» не отмечало, например, ID 202 (смерть на 2-й
# день), потому что XGBoost Cox давал ему медиану 1032 дня — смерть «когда-нибудь до τ», а не в первый месяц.
SUDDEN_MAX_DAY = 365
SUDDEN_RISK_RATIO = 2
SUDDEN_SURVIVED = 0.9
SUDDEN_NEIGHBOURS = 50
# Неожиданное выживание: нет смерти от ССЗ до τ, хотя модель по умолчанию для balanced_dataset.csv (многоэтапный
# конвейер: 1 − вероятность группы «жив дольше τ») оценивала риск смерти от ССЗ до τ не ниже UNEXPECTED_RISK; для
# сравнения — медиана риска восьми моделей и доля умерших от ССЗ до τ среди SUDDEN_NEIGHBOURS самых похожих пациентов
# с известным к τ исходом. Порог 50% — выживание было менее вероятно, чем смерть; у группы «очень высокий» (риск за
# 12 месяцев ≥ 25%, в среднем 34%) год переживают 60% — для неё выживание ожидаемо
UNEXPECTED_RISK = 0.5
# Матрица ошибок групп риска: строка — группа по прогнозу модели на 12 месяцев, столбец — по «реальному» риску. Риск
# отдельного пациента не наблюдается (он либо умирает, либо нет), поэтому «реальный» риск — доля умерших от ССЗ за
# 12 месяцев среди REAL_RISK_NEIGHBOURS самых похожих при поступлении пациентов (28 стандартизованных признаков,
# исход за 12 месяцев известен, сам пациент не входит). Эта оценка грубее моделей: смерти за 12 месяцев она различает
# с AUC 0,69 против 0,74–0,79 у прогнозов вне выборки и сглаживает крайние значения (в «очень высокий» попадают
# единицы пациентов), поэтому вместе с матрицей показывается фактическая смертность по строкам и столбцам
REAL_RISK_NEIGHBOURS = 50
# Правдоподобные диапазоны значений: вне них — вероятная ошибка ввода (страница предупреждает о таких значениях)
PLAUSIBLE = {'age': (18, 105), 'ef_hosp': (10, 80), 'bpm': (30, 220), 'sysAP': (60, 260), 'bmi': (15, 60),
             'hb': (60, 200), 'leukoc': (1, 50), 'tromboc': (20, 1000), 't_chol': (1, 15), 'ldl': (0.3, 12),
             'glu': (2, 35), 'crea': (30, 1000)}

# Признаки, известные только после выписки (см. docstring)
POST_DISCHARGE = ('doctor', 'llo')
# Модели обучаются и на них — вариант «задним числом»: при кросс-валидации на 1204 обучающих AUC смерти от ССЗ
# за 12 месяцев растёт на 0,04–0,07 (у Staged pipeline 0,79 → 0,84), но прирост дают смерти, случившиеся до назначения
# ЛЛО и врача. Для нового пациента при поступлении (llo = 0, doctor = 0) риск завышен на 28–95%, а AUC не выше, чем
# без них; влияние ЛЛО на прогноз завышено (landmark-анализ, scripts/llo_landmark_analysis.py)
USE_POST_DISCHARGE = True
# Роль пациента в обучении (patients.split в docs/survival_model.js)
SPLIT_CALIBRATION, SPLIT_TRAIN, SPLIT_TEST = 0, 1, 2
SPLIT_NAMES = {SPLIT_CALIBRATION: 'обучающая выборка (цензурирован до τ)',
               SPLIT_TRAIN: 'обучающая выборка', SPLIT_TEST: 'отложенная выборка'}


# ---------------------------------------------------------------------------
# Данные
# ---------------------------------------------------------------------------
def load_full_dataset(path=FULL_XLSX):
    """med_dataset_cardio.xlsx с той же предобработкой, что в ноутбуке; индекс — ID пациента.
    Столбец death_any (result — смерть от любой причины) в признаки не входит: нужен, чтобы отличать
    смерть от других причин (target = 0, цензурирование для смерти от ССЗ) от пациентов, живых на конец наблюдения."""
    data = pd.read_excel(path, header=0)
    data.rename(columns={'0_na, 1_mi': 'severity', '0_no, 1_ther, 2_card': 'doctor'}, inplace=True)
    data.drop(columns=['card', 'na', 'dmonit'], inplace=True)
    data['target'] = data['result_cvd']
    death_any = data.pop('result')
    data.drop(columns=['result_cvd'], inplace=True)
    features = [c for c in data.columns if c not in ('time', 'target')]
    return data, features, death_any


def admission_features(features):
    """Признаки, известные при поступлении: все, кроме назначаемых после выписки."""
    return [f for f in features if f not in POST_DISCHARGE]


def model_features(features):
    """Признаки моделей: все 30 (USE_POST_DISCHARGE) или только известные при поступлении."""
    return list(features) if USE_POST_DISCHARGE else admission_features(features)


def balanced_subset(full, check_csv=BALANCED_CSV):
    """df_balanced из ноутбука: пациенты с известным статусом на τ — умершие или наблюдавшиеся не меньше τ дней.
    Ноутбук сохраняет его в balanced_dataset.csv; проверяем, что совпадает."""
    df = full[(full['target'] == 1) | (full['time'] >= TAU)].copy()
    if Path(check_csv).exists():
        saved = pd.read_csv(check_csv, index_col=0, float_precision='round_trip')
        same = saved.index.equals(df.index) and list(saved.columns) == list(df.columns) \
            and np.array_equal(saved.values.astype(float), df.values.astype(float))
        assert same, f'{check_csv} не совпадает с df_balanced из {FULL_XLSX.name}'
    return df


def split_dataset(df):
    """То же разбиение, что в ноутбуке: 20% отложенная выборка со стратификацией по target."""
    from sklearn.model_selection import train_test_split
    return train_test_split(df.index, test_size=0.2, stratify=df['target'], random_state=37)


def split_cohort(full, df):
    """Разбиение всей когорты: df_balanced — как в ноутбуке; цензурированные до τ — тоже 80/20.
    Возвращает (обучение моделей ноутбука, цензурированные до τ обучающие, отложенная выборка)."""
    from sklearn.model_selection import train_test_split
    bal_train, bal_test = split_dataset(df)
    censored_early = full.index.difference(df.index)
    cal_train, cal_test = train_test_split(censored_early, test_size=0.2, random_state=37)
    return bal_train, cal_train, bal_test.append(cal_test)


def ipcw_weights(full, cohort_idx, idx):
    """Веса IPCW пациентов df_balanced: 1 / G(min(T, τ) − 1), где G(t) — вероятность наблюдаться дольше t
    (Каплан — Мейер по cohort_idx; выбывание — конец наблюдения без смерти от ССЗ), как в test_metrics.
    df_balanced берёт всех умерших от ССЗ, а выживших — только включённых в исследование достаточно рано, чтобы
    наблюдаться τ дней (G(τ) ≈ 0,19): выживший получает вес около 5, умерший на день T — 1 / G(T − 1)."""
    from lifelines import KaplanMeierFitter
    G = KaplanMeierFitter().fit(full.loc[cohort_idx, 'time'], 1 - full.loc[cohort_idx, 'target'])
    t = np.minimum(full.loc[idx, 'time'].values.astype(float), TAU)
    return pd.Series(1 / np.maximum(G.survival_function_at_times(t - 1).values, 1e-3), index=idx)


def survival_share(full, features, scaler, known_idx, censored_idx, weights):
    """Частичные метки (см. PSEUDO_NEIGHBOURS): для каждого цензурированного до τ пациента — q, доля доживших до τ
    среди самых похожих на него пациентов known_idx (исход к τ известен), живых на день его выбывания C; weights —
    веса IPCW пациентов known_idx. Пациент, похожий на выживших, получает q около 1, похожий на умерших — меньше."""
    Z_known = scaler.transform(full.loc[known_idx, features])
    Z_cens = scaler.transform(full.loc[censored_idx, features])
    t_known = full.loc[known_idx, 'time'].values
    survived = t_known >= TAU
    w = weights.loc[known_idx].values
    q = np.zeros(len(censored_idx))
    for j, c in enumerate(full.loc[censored_idx, 'time'].values):
        alive = np.flatnonzero(t_known > c)
        near = alive[np.argsort(((Z_known[alive] - Z_cens[j]) ** 2).sum(axis=1), kind='stable')[:PSEUDO_NEIGHBOURS]]
        q[j] = (w[near] * survived[near]).sum() / w[near].sum()
    return pd.Series(q, index=censored_idx)


def pseudo_labelled(full, known_idx, q):
    """Обучающие строки «смерть от ССЗ до τ»: пациенты known_idx — с весом 1, цензурированные до τ (индекс q) —
    дважды: выжившим с весом q и умершим до τ с весом 1 − q. Возвращает (ID пациентов, метки, веса)."""
    time = full.loc[known_idx, 'time'].values
    death = full.loc[known_idx, 'target'].values.astype(bool) & (time < TAU)
    ids = np.concatenate([np.asarray(known_idx), np.asarray(q.index), np.asarray(q.index)])
    label = np.concatenate([death, np.zeros(len(q), bool), np.ones(len(q), bool)])
    weight = np.concatenate([np.ones(len(known_idx)), q.values, 1 - q.values])
    keep = weight > 0
    return ids[keep], label[keep], weight[keep]


# ---------------------------------------------------------------------------
# Модели ноутбука на df_balanced
# ---------------------------------------------------------------------------
def train_models(df, features, train_idx):
    from lifelines import CoxPHFitter, WeibullAFTFitter
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    from xgboost import XGBRegressor

    scaler = StandardScaler().fit(df.loc[train_idx, features])
    X_train_sc = scaler.transform(df.loc[train_idx, features])
    time_train = df.loc[train_idx, 'time'].astype(float).values
    event_train = df.loc[train_idx, 'target'].astype(bool).values

    # Признак без разброса в обучающей выборке lifelines не оценит (onco = 1 — у 5 пациентов df_balanced, во фолде
    # кросс-валидации их может не остаться): CoxPH и Weibull AFT обучаются без него, его коэффициент — 0
    active = [f for f, sd in zip(features, X_train_sc.std(axis=0)) if sd > 0]
    cph_data_train = pd.DataFrame(X_train_sc, columns=features)[active]
    cph_data_train['time'] = time_train
    cph_data_train['target'] = event_train.astype(int)

    # 1. CoxPH и 2. Weibull AFT
    cph = CoxPHFitter(alpha=0.05, penalizer=0.1).fit(cph_data_train, duration_col='time', event_col='target')
    aft = WeibullAFTFitter(alpha=0.05, penalizer=0.1).fit(cph_data_train, duration_col='time', event_col='target')

    # 3. XGBoost Cox; лог-риск центрируется по обучающей выборке, как xgb_log_risk() в ноутбуке
    y_train_xgb = np.where(event_train, time_train, -time_train)
    xgb_surv = XGBRegressor(objective='survival:cox', eval_metric='cox-nloglik', n_estimators=300,
                            learning_rate=0.03, max_depth=3, subsample=0.8, colsample_bynode=0.8,
                            random_state=42)
    xgb_surv.fit(X_train_sc, y_train_xgb)
    xgb_margin_offset = xgb_surv.predict(X_train_sc, output_margin=True).mean()

    # 4. Полносвязная нейросеть: классификатор события
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    tf.keras.utils.set_random_seed(42)
    tf.config.experimental.enable_op_determinism()
    nn_model = keras.Sequential([
        layers.Input(shape=(X_train_sc.shape[1],)),
        layers.Dense(128, activation='relu'),
        layers.Dropout(0.3),
        layers.Dense(64, activation='relu'),
        layers.Dropout(0.3),
        layers.Dense(1, activation='sigmoid'),
    ])
    nn_model.compile(optimizer='adam', loss='binary_crossentropy', metrics=['accuracy'])
    nn_model.fit(X_train_sc, event_train, epochs=50, batch_size=32, validation_split=0.2, verbose=0)

    # 5. Резервуарная нейросеть: случайная проекция tanh(X @ W_in) + логистическая регрессия
    np.random.seed(42)
    W_in = np.random.normal(0, 1, (X_train_sc.shape[1], 2000))
    W_in /= np.sqrt(np.sum(W_in ** 2, axis=0, keepdims=True) + 1e-8)
    rn_readout = LogisticRegression(solver='liblinear', random_state=42).fit(np.tanh(X_train_sc @ W_in), event_train)

    return dict(scaler=scaler, active=active, cph=cph, aft=aft, xgb_surv=xgb_surv, xgb_margin_offset=xgb_margin_offset,
                nn_model=nn_model, W_in=W_in, rn_readout=rn_readout)


def risk_scores(m, X_sc, features):
    """Оценка риска каждой модели: лог-риск CoxPH, log λ Weibull AFT, лог-риск XGBoost,
    логиты нейросетей (до сигмоиды)."""
    lam = m['aft'].params_.loc['lambda_']
    X_active = pd.DataFrame(X_sc, columns=features)[m['active']]
    W1, b1, W2, b2, W3, b3 = m['nn_model'].get_weights()
    hidden = np.maximum(np.maximum(X_sc @ W1 + b1, 0) @ W2 + b2, 0)
    return {
        'cph': m['cph'].predict_log_partial_hazard(X_active).values,
        'aft': X_active.values @ lam[m['active']].values + lam['Intercept'],
        'xgb': m['xgb_surv'].predict(X_sc, output_margin=True) - m['xgb_margin_offset'],
        'nn': (hidden @ W3 + b3).ravel(),
        'rn': m['rn_readout'].decision_function(np.tanh(X_sc @ m['W_in'])),
    }


def calibration_covariates(cal, score):
    """Ковариаты калибратора по оценке риска: s и (s − s̄)² (см. QUADRATIC_CALIBRATION); s ограничена вершиной параболы."""
    s = np.clip(np.asarray(score, dtype=float), *cal['clip'])
    return pd.DataFrame({'score': s, 'score2': (s - cal['mean']) ** 2} if cal['quadratic'] else {'score': s})


def fit_calibrator(name, score, time, event):
    """Калибратор S(t | s) модели name: Кокс (для Weibull AFT — Weibull) по оценке риска с учётом цензурирования."""
    from lifelines import CoxPHFitter, WeibullAFTFitter
    score = np.asarray(score, dtype=float)
    cal = {'kind': 'weibull' if name == 'aft' else 'cox', 'quadratic': name in QUADRATIC_CALIBRATION,
           'mean': float(score.mean()), 'clip': (-np.inf, np.inf)}
    data = calibration_covariates(cal, score).assign(time=time, event=event)
    cal['model'] = (WeibullAFTFitter() if name == 'aft' else CoxPHFitter()).fit(data, duration_col='time', event_col='event')
    if cal['quadratic']:
        params = cal['model'].params_.loc['lambda_'] if name == 'aft' else cal['model'].params_
        b1, b2 = params['score'], params['score2']
        if b2 != 0:
            # Вершина параболы b₁·s + b₂·(s − s̄)²: дальше от s̄ риск менялся бы с ростом s в обратную сторону
            vertex = cal['mean'] - b1 / (2 * b2)
            cal['clip'] = (-np.inf, vertex) if vertex > cal['mean'] else (vertex, np.inf)
    return cal


def recalibrate(full, df, features, bal_train, cal_train, m):
    """Калибраторы S(t | оценка риска), обученные на всей обучающей когорте с учётом цензурирования:
    Кокс для CoxPH, XGBoost и нейросетей, Weibull AFT — для Weibull AFT. Оценки риска пациентов df_balanced —
    вне выборки (модели 5 фолдов), остальных — финальной моделью, которая их не видела."""
    from sklearn.model_selection import StratifiedKFold

    train_all = bal_train.append(cal_train)
    scores = {k: pd.Series(np.nan, index=train_all) for k in SURVIVAL_MODELS}
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    for fold_train, fold_val in folds.split(bal_train, df.loc[bal_train, 'target']):
        fold = train_models(df, features, bal_train[fold_train])
        val = bal_train[fold_val]
        for k, s in risk_scores(fold, fold['scaler'].transform(df.loc[val, features]), features).items():
            scores[k].loc[val] = s
    for k, s in risk_scores(m, m['scaler'].transform(full.loc[cal_train, features]), features).items():
        scores[k].loc[cal_train] = s

    time, event = full.loc[train_all, 'time'].values, full.loc[train_all, 'target'].values
    return {k: fit_calibrator(k, scores[k].values, time, event) for k in SURVIVAL_MODELS}


def library_survival(m, calibrators, X_sc, features):
    """Функции выживаемости S(t) на сетке средствами самих библиотек (lifelines, xgboost, keras), форма (n, τ)."""
    scores = risk_scores(m, X_sc, features)
    return {k: calibrators[k]['model'].predict_survival_function(calibration_covariates(calibrators[k], scores[k]),
                                                                 times=GRID).values.T
            for k in SURVIVAL_MODELS}


# ---------------------------------------------------------------------------
# Двухэтапный алгоритм
# ---------------------------------------------------------------------------
def train_cascade(full, features, train_idx, scaler):
    """Каскад (см. EARLY_DAYS): классификатор ранней смерти обучается на пациентах с известным статусом на
    EARLY_DAYS, вероятность калибруется по Платту на оценках вне выборки (5 фолдов); модель Кокса — на проживших
    дольше EARLY_DAYS."""
    from lifelines import CoxPHFitter
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold
    from xgboost import XGBClassifier

    def xgb():
        return XGBClassifier(n_estimators=600, learning_rate=0.03, max_depth=1, subsample=0.8, colsample_bynode=0.8,
                             min_child_weight=1, random_state=42, eval_metric='logloss')

    time = full.loc[train_idx, 'time'].values.astype(float)
    event = full.loc[train_idx, 'target'].values.astype(bool)
    Z = scaler.transform(full.loc[train_idx, features])
    label = np.where(event & (time <= EARLY_DAYS), 1, np.where(time > EARLY_DAYS, 0, -1))
    known = label >= 0
    classifier = xgb().fit(Z[known], label[known])
    margin_oof = np.zeros(known.sum())
    for fold_train, fold_val in StratifiedKFold(5, shuffle=True, random_state=0).split(Z[known], label[known]):
        fold = xgb().fit(Z[known][fold_train], label[known][fold_train])
        margin_oof[fold_val] = fold.predict(Z[known][fold_val], output_margin=True)
    platt = LogisticRegression(C=1e6).fit(margin_oof[:, None], label[known])

    late = time > EARLY_DAYS
    late_data = pd.DataFrame(Z[late], columns=features).assign(time=time[late], event=event[late].astype(int))
    late_cox = CoxPHFitter(penalizer=0.1).fit(late_data, duration_col='time', event_col='event')
    return dict(stage1=classifier, platt1=(float(platt.coef_[0, 0]), float(platt.intercept_[0])),
                early_days=np.sort(time[label == 1]).astype(int), late_cox=late_cox, Z_known1=Z[known])


def cascade_mixture(margin1, platt1, early_days, S_late):
    """S(t) каскада: p·S_early + (1 − p)·S_late, p — вероятность ранней смерти по Платту, S_early — распределение
    дней ранней смерти в обучающей выборке."""
    p_early = 1 / (1 + np.exp(-(platt1[0] * margin1 + platt1[1])))
    S_early = (np.asarray(early_days)[None, :] > GRID[:, None]).mean(axis=1)
    return p_early[:, None] * S_early[None, :] + (1 - p_early[:, None]) * S_late


def library_cascade(cascade, X_sc, features):
    """S(t) каскада средствами самих библиотек (xgboost, scikit-learn, lifelines)."""
    S_late = cascade['late_cox'].predict_survival_function(pd.DataFrame(X_sc, columns=features), times=GRID).values.T
    return cascade_mixture(cascade['stage1'].predict(X_sc, output_margin=True), cascade['platt1'], cascade['early_days'], S_late)


# ---------------------------------------------------------------------------
# Balanced mixture: df_balanced и частичные метки цензурированных до τ
# ---------------------------------------------------------------------------
def train_balanced(full, features, train_idx, scaler, q, weights):
    """Логистическая регрессия «смерть от ССЗ до τ» на обучающих пациентах df_balanced (train_idx) и цензурированных
    до τ с частичными метками q; weights — веса IPCW train_idx для распределения дней смерти F."""
    from sklearn.linear_model import LogisticRegression
    ids, label, weight = pseudo_labelled(full, train_idx, q)
    classifier = LogisticRegression(C=0.3, max_iter=5000).fit(scaler.transform(full.loc[ids, features]), label,
                                                              sample_weight=weight)
    time = full.loc[train_idx, 'time'].values.astype(float)
    death = full.loc[train_idx, 'target'].values.astype(bool) & (time < TAU)
    order = np.argsort(time[death], kind='stable')
    return dict(classifier=classifier, death_days=time[death][order].astype(int),
                death_weights=weights.loc[train_idx].values[death][order])


def balanced_mixture(p_death, death_days, death_weights):
    """S(t) = 1 − p · F(t), где F — доля умерших к дню t среди умерших от ССЗ до τ в обучающей выборке с весами IPCW:
    поздние смерти поздно включённых не наблюдаются, и вес поздних смертей больше."""
    w = np.asarray(death_weights, dtype=float)
    F = ((np.asarray(death_days)[None, :] <= GRID[:, None]) * w).sum(axis=1) / w.sum()
    return 1 - p_death[:, None] * F[None, :]


def library_balanced(bm, X_sc):
    """(S(t), вероятность смерти от ССЗ до τ) средствами scikit-learn."""
    p = bm['classifier'].predict_proba(X_sc)[:, 1]
    return balanced_mixture(p, bm['death_days'], bm['death_weights']), p


# ---------------------------------------------------------------------------
# Многоэтапный конвейер
# ---------------------------------------------------------------------------
def staged_training_set(full, train_idx):
    """Шаги 1–3 (см. STAGED_EARLY_DAYS): вся когорта → без ранних смертей → правило balanced из ноутбука → обучающие
    пациенты. Отложенная выборка не меняется: ранние смерти в ней остаются, их надо прогнозировать."""
    early = (full['target'] == 1) & (full['time'] <= STAGED_EARLY_DAYS)
    rest = full[~early]
    new_balanced = rest[(rest['target'] == 1) | (rest['time'] >= TAU)]
    return new_balanced.index.intersection(train_idx)


def staged_clustering(full, features):
    """Агломеративная кластеризация всей когорты по признакам при поступлении, без исходов. Принадлежность —
    ближайший центроид: одна и та же для пациентов датасета и для изменённых на странице."""
    from sklearn.cluster import AgglomerativeClustering
    X = full[features].values.astype(float)
    mean, scale = X.mean(axis=0), X.std(axis=0)
    Z = (X - mean) / scale
    labels = AgglomerativeClustering(n_clusters=STAGED_CLUSTERS, linkage=STAGED_LINKAGE).fit_predict(Z)
    centroids = np.array([Z[labels == c].mean(axis=0) for c in range(STAGED_CLUSTERS)])
    # Профиль для пояснения: три признака, сильнее всего отличающие пациентов кластера (по ближайшему центроиду)
    # от среднего по когорте, в σ
    member = ((Z[:, None, :] - centroids[None]) ** 2).sum(axis=-1).argmin(axis=1)
    profile = []
    for c in range(STAGED_CLUSTERS):
        z = Z[member == c].mean(axis=0)
        profile.append([{'feature': features[k], 'z': round(float(z[k]), 2)} for k in np.argsort(-np.abs(z))[:3]])
    return dict(features=list(features), mean=mean, scale=scale, centroids=centroids, profile=profile)


def cluster_of(clustering, X_raw):
    Z = (np.atleast_2d(X_raw) - clustering['mean']) / clustering['scale']
    return ((Z[:, None, :] - clustering['centroids'][None]) ** 2).sum(axis=-1).argmin(axis=1)


def _one_hot(cluster):
    return np.eye(STAGED_CLUSTERS)[cluster]


def train_staged(full, features, train_idx, cohort_train_idx, scaler, q):
    """Этап 1 — логистическая регрессия «ранняя смерть» по признакам и принадлежности к кластеру всей когорты
    (все обучающие с известным статусом на 10-й день); этап 2 — логистическая регрессия «смерть от ССЗ до τ» на новом
    balanced без ранних смертей (из train_idx) и частичных метках q цензурированных до τ; модель Кокса времени
    поздней смерти — на всех обучающих (cohort_train_idx), переживших 10 дней."""
    from lifelines import CoxPHFitter
    from sklearn.linear_model import LogisticRegression

    clustering = staged_clustering(full, admission_features(features))
    t_all = full.loc[cohort_train_idx, 'time'].values.astype(float)
    death_all = full.loc[cohort_train_idx, 'target'].values.astype(bool)
    early_all = death_all & (t_all <= STAGED_EARLY_DAYS)
    known = early_all | (t_all > STAGED_EARLY_DAYS)
    X_known = full.loc[cohort_train_idx, features].values[known]
    c_all = cluster_of(clustering, full.loc[cohort_train_idx, clustering['features']].values[known])
    stage1 = LogisticRegression(C=0.03, max_iter=5000).fit(
        np.column_stack([scaler.transform(X_known), _one_hot(c_all)]), early_all[known])

    q_late = q[full.loc[q.index, 'time'] > STAGED_EARLY_DAYS]
    ids, label, weight = pseudo_labelled(full, staged_training_set(full, train_idx), q_late)
    stage2 = LogisticRegression(C=0.1, max_iter=5000).fit(scaler.transform(full.loc[ids, features]), label,
                                                          sample_weight=weight)

    late = t_all > STAGED_EARLY_DAYS
    Z_late = scaler.transform(full.loc[cohort_train_idx[late], features])
    # Признак без разброса (бинарный и редкий) модель Кокса не оценивает: его коэффициент — 0
    varying = [f for f, s in zip(features, Z_late.std(axis=0)) if s > 1e-9]
    late_data = pd.DataFrame(Z_late, columns=features)[varying].assign(
        time=t_all[late], event=(death_all[late] & (t_all[late] < TAU)).astype(int))
    late_cox = CoxPHFitter(penalizer=0.1).fit(late_data, duration_col='time', event_col='event')
    return dict(clustering=clustering, cluster_n=np.bincount(c_all, minlength=STAGED_CLUSTERS),
                cluster_early=np.bincount(c_all, weights=early_all[known], minlength=STAGED_CLUSTERS).astype(int),
                stage1=stage1, stage2=stage2, late_cox=late_cox, late_features=varying,
                early_days=np.sort(t_all[early_all]).astype(int))


def staged_mixture(p1, p2, early_days, S_late):
    """S(t) конвейера и вероятности групп (ранняя смерть, смерть от ССЗ до τ после ранней, жизнь дольше τ).
    S_late — S(t) модели Кокса на новом balanced; F_поздн = (1 − S_late) / (1 − S_late(τ)) — время смерти при условии
    смерти до τ."""
    P = np.column_stack([p1, (1 - p1) * p2, (1 - p1) * (1 - p2)])
    F_early = (np.asarray(early_days)[None, :] <= GRID[:, None]).mean(axis=1)
    F_late = (1 - S_late) / np.maximum(1 - S_late[:, -1:], 1e-12)
    return 1 - P[:, :1] * F_early[None, :] - P[:, 1:2] * F_late, P, F_late


def staged_route(P, early_days, F_late):
    """Справочно — жёсткая маршрутизация: группа с наибольшей вероятностью и медиана времени внутри неё
    (ранняя смерть — медиана дней ранней смерти, поздняя — медиана F_поздн(t | x), жизнь дольше τ — τ)."""
    group = P.argmax(axis=1)
    hit = F_late >= 0.5
    late_median = np.where(hit.any(axis=1), hit.argmax(axis=1), TAU)
    time = np.select([group == 0, group == 1], [int(np.median(early_days)), late_median], TAU)
    return group, time


def library_staged(st, X_raw, X_sc, features):
    """(S(t), вероятности групп, F_поздн) средствами scikit-learn и lifelines; X_raw — признаки моделей без
    стандартизации (для кластера — только признаки при поступлении)."""
    cluster = cluster_of(st['clustering'], X_raw[:, [features.index(f) for f in st['clustering']['features']]])
    p1 = st['stage1'].predict_proba(np.column_stack([X_sc, _one_hot(cluster)]))[:, 1]
    p2 = st['stage2'].predict_proba(X_sc)[:, 1]
    late = pd.DataFrame(X_sc, columns=features)[st['late_features']]
    S_late = st['late_cox'].predict_survival_function(late, times=GRID).values.T
    return staged_mixture(p1, p2, st['early_days'], S_late)


# ---------------------------------------------------------------------------
# Экспорт параметров: всё, что нужно для расчёта S(t) без библиотек (numpy или JavaScript)
# ---------------------------------------------------------------------------
def _f32_b64(a):
    return base64.b64encode(np.ascontiguousarray(a, dtype='<f4').tobytes()).decode('ascii')


def _f32_short(v):
    # Кратчайшая запись числа float32: при обратном чтении через float32 (Math.fround) значение восстанавливается точно
    return float(np.format_float_positional(np.float32(v), unique=True))


def _round(a, digits=7):
    return [float(f'{v:.{digits}g}') for v in np.asarray(a, dtype=float).ravel()]


def _export_cox(cox, covariates):
    """Модель Кокса lifelines: S(t | z) = exp(−H0(t) · exp((z − center) · beta)).
    H0(t) на сетке берём у самой модели — для объекта с z = center, у которого частичный риск равен 1."""
    center = cox._norm_mean[covariates].values
    H0 = cox.predict_cumulative_hazard(pd.DataFrame([center], columns=covariates), times=GRID).values[:, 0]
    return {'beta': _round(cox.params_[covariates].values, 10), 'center': _round(center, 10), 'H0': _round(H0)}


def _export_calibrator(cal):
    """Калибратор оценки риска s: s̄, границы s (null — нет границы) и модель Кокса или Weibull по ковариатам
    s, (s − s̄)² (у линейного — только s)."""
    covariates = list(calibration_covariates(cal, [0.0]).columns)
    out = {'mean': float(cal['mean']), 'clip': [float(v) if np.isfinite(v) else None for v in cal['clip']]}
    model = cal['model']
    if cal['kind'] == 'weibull':
        lam = model.params_.loc['lambda_']
        return {'type': 'weibull', **out, 'intercept': float(lam['Intercept']), 'beta': _round(lam[covariates].values, 10),
                'rho_intercept': float(model.params_.loc[('rho_', 'Intercept')])}
    return {'type': 'cox', **out, **_export_cox(model, covariates)}


def _export_xgb_trees(xgb_surv, X_train_sc):
    booster = xgb_surv.get_booster()
    trees = json.loads(booster.save_raw('json'))['learner']['gradient_booster']['model']['trees']
    exported = [{'left': t['left_children'], 'right': t['right_children'], 'feature': t['split_indices'],
                 'value': [_f32_short(v) for v in t['split_conditions']]} for t in trees]
    # Сдвиг: базовый margin (base_score) минус центрирование лог-риска по обучающей выборке
    leaf_sum = _xgb_leaf_sum(exported, X_train_sc)
    base_margin = np.mean(xgb_surv.predict(X_train_sc, output_margin=True) - leaf_sum)
    return exported, base_margin


def _xgb_leaf_sum(trees, X_sc):
    Xf = np.asarray(X_sc, dtype=np.float32)
    out = np.zeros(len(Xf))
    for t in trees:
        left, right, feature = t['left'], t['right'], t['feature']
        value = np.asarray(t['value'], dtype=np.float32)
        for i, x in enumerate(Xf):
            node = 0
            while left[node] != -1:
                node = left[node] if x[feature[node]] < value[node] else right[node]
            out[i] += value[node]
    return out


def export_params(df, features, train_idx, m, calibrators, ts, bm, st):
    X_train_sc = m['scaler'].transform(df.loc[train_idx, features])
    trees, base_margin = _export_xgb_trees(m['xgb_surv'], X_train_sc)
    nn_weights = m['nn_model'].get_weights()  # W1, b1, W2, b2, W3, b3

    # Оценки риска CoxPH — (x − center) · β, Weibull AFT — log λ = x · β + β0; у признаков без разброса
    # в обучающей выборке β = 0. S(t) — по калибратору оценки
    position = [features.index(f) for f in m['active']]
    cph_beta, cph_center, aft_beta = np.zeros(len(features)), np.zeros(len(features)), np.zeros(len(features))
    cph_beta[position] = m['cph'].params_[m['active']].values
    cph_center[position] = m['cph']._norm_mean[m['active']].values
    lam = m['aft'].params_.loc['lambda_']
    aft_beta[position] = lam[m['active']].values

    return {
        'scaler': {'mean': _round(m['scaler'].mean_, 12), 'scale': _round(m['scaler'].scale_, 12)},
        'models': {
            'cph': {'type': 'cox', 'beta': _round(cph_beta, 10), 'center': _round(cph_center, 10),
                    'calibrator': _export_calibrator(calibrators['cph'])},
            'aft': {'type': 'weibull_aft', 'lambda_intercept': float(lam['Intercept']), 'lambda_beta': _round(aft_beta, 10),
                    'calibrator': _export_calibrator(calibrators['aft'])},
            'xgb': {'type': 'xgb_cox', 'trees': trees, 'bias': float(base_margin - m['xgb_margin_offset']),
                    'calibrator': _export_calibrator(calibrators['xgb'])},
            'nn': {'type': 'mlp',
                   'layers': [{'in': w.shape[0], 'out': w.shape[1], 'W': _f32_b64(w), 'b': _f32_b64(b), 'activation': act}
                              for (w, b), act in zip(zip(nn_weights[::2], nn_weights[1::2]), ['relu', 'relu', 'linear'])],
                   'calibrator': _export_calibrator(calibrators['nn'])},
            'rn': {'type': 'reservoir', 'n_features': len(features), 'n_reservoir': m['W_in'].shape[1],
                   'W_in': _f32_b64(m['W_in']), 'coef': _f32_b64(m['rn_readout'].coef_[0]),
                   'intercept': float(m['rn_readout'].intercept_[0]),
                   'calibrator': _export_calibrator(calibrators['rn'])},
            'two': _export_cascade(ts, features),
            'bal': {'type': 'balanced_mixture', 'coef': _round(bm['classifier'].coef_[0], 10),
                    'intercept': float(bm['classifier'].intercept_[0]), 'death_days': bm['death_days'].tolist(),
                    'death_weights': _round(bm['death_weights'], 6)},
            'stg': _export_staged(st, features),
        },
    }


def _export_staged(st, features):
    # Модель Кокса поздней смерти — по всем признакам: у не оценённых (без разброса на новом balanced) коэффициент 0
    late = _export_cox(st['late_cox'], st['late_features'])
    beta, center = np.zeros(len(features)), np.zeros(len(features))
    for f, b, c in zip(st['late_features'], late['beta'], late['center']):
        beta[features.index(f)], center[features.index(f)] = b, c
    cl = st['clustering']
    return {'type': 'staged', 'early_days': STAGED_EARLY_DAYS,
            # кластеры всей когорты: стандартизация, центроиды; ранние смерти и число пациентов в обучающей когорте
            'clusters': {'features': cl['features'], 'mean': _round(cl['mean'], 12), 'scale': _round(cl['scale'], 12),
                         'centroids': [_round(c, 10) for c in cl['centroids']], 'profile': cl['profile'],
                         'n': st['cluster_n'].tolist(), 'early': st['cluster_early'].tolist()},
            # этап 1: коэффициенты признаков, затем — принадлежности к каждому кластеру
            'stage1': {'coef': _round(st['stage1'].coef_[0], 10), 'intercept': float(st['stage1'].intercept_[0])},
            'stage2': {'coef': _round(st['stage2'].coef_[0], 10), 'intercept': float(st['stage2'].intercept_[0])},
            'early_death_days': st['early_days'].tolist(),
            'late': {'beta': beta.tolist(), 'center': center.tolist(), 'H0': late['H0']}}


def _export_cascade(cascade, features):
    trees1, bias1 = _export_xgb_trees(cascade['stage1'], cascade['Z_known1'])
    return {'type': 'cascade', 'early_days': EARLY_DAYS,
            'stage1': {'trees': trees1, 'bias': float(bias1), 'platt': list(cascade['platt1'])},
            'early_death_days': cascade['early_days'].tolist(),
            'late': _export_cox(cascade['late_cox'], features)}


# ---------------------------------------------------------------------------
# Прогноз по экспортированным параметрам — те же формулы, что в docs/survival_predictor.js
# ---------------------------------------------------------------------------
def _b64_f32(s, shape=None):
    a = np.frombuffer(base64.b64decode(s), dtype='<f4').astype(float)
    return a.reshape(shape) if shape else a


class SurvivalTimePredictor:
    def __init__(self, bundle):
        self.bundle = bundle
        self.features = bundle['features']
        self.model_features = bundle.get('model_features', self.features)
        self._columns = [self.features.index(f) for f in self.model_features]
        self.tau = bundle['meta']['tau']
        self.mean = np.array(bundle['scaler']['mean'])
        self.scale = np.array(bundle['scaler']['scale'])
        self.models = bundle['models']
        nn = self.models['nn']
        self._nn = [(_b64_f32(l['W'], (l['in'], l['out'])), _b64_f32(l['b']), l['activation']) for l in nn['layers']]
        rn = self.models['rn']
        self._rn_W = _b64_f32(rn['W_in'], (rn['n_features'], rn['n_reservoir']))
        self._rn_coef = _b64_f32(rn['coef'])

    @classmethod
    def from_js(cls, path=MODEL_JS):
        text = Path(path).read_text(encoding='utf-8')
        return cls(json.loads(text[len(JS_PREFIX):].rstrip().rstrip(';')))

    @staticmethod
    def _cox(cox, Z):
        lph = (np.atleast_2d(Z) - np.array(cox['center'])) @ np.array(cox['beta'])
        return np.exp(-np.outer(np.exp(lph), np.array(cox['H0'])))

    @staticmethod
    def _calibrated(cal, score):
        """S(t) по калибратору оценки риска — как calibrated() в docs/survival_predictor.js."""
        lo, hi = (-np.inf if cal['clip'][0] is None else cal['clip'][0]), (np.inf if cal['clip'][1] is None else cal['clip'][1])
        s = np.clip(np.ravel(score), lo, hi)
        Z = np.column_stack([s, (s - cal['mean']) ** 2])[:, :len(cal['beta'])]
        if cal['type'] == 'weibull':
            lam = np.exp(Z @ np.array(cal['beta']) + cal['intercept'])
            return np.exp(-(GRID[None, :] / lam[:, None]) ** np.exp(cal['rho_intercept']))
        return SurvivalTimePredictor._cox(cal, Z)

    def risk_score(self, X_sc, name):
        """Ковариата калибратора: лог-риск CoxPH и XGBoost, log λ Weibull AFT, логит нейросети."""
        if name == 'cph':
            m = self.models['cph']
            return (X_sc - np.array(m['center'])) @ np.array(m['beta'])
        if name == 'aft':
            m = self.models['aft']
            return X_sc @ np.array(m['lambda_beta']) + m['lambda_intercept']
        if name == 'xgb':
            m = self.models['xgb']
            return (_xgb_leaf_sum(m['trees'], X_sc) + m['bias'])[:, None]
        if name == 'nn':
            h = X_sc
            for W, b, act in self._nn:
                h = h @ W + b
                if act == 'relu':
                    h = np.maximum(h, 0)
                elif act == 'sigmoid':
                    h = 1 / (1 + np.exp(-h))
            return h
        if name == 'rn':
            m = self.models['rn']
            return (np.tanh(X_sc @ self._rn_W) @ self._rn_coef + m['intercept'])[:, None]
        raise ValueError(name)

    def _scale(self, X_raw):
        """Стандартизация признаков моделей; X_raw — все признаки пациента в порядке self.features."""
        return (np.atleast_2d(np.asarray(X_raw, dtype=float))[:, self._columns] - self.mean) / self.scale

    def _balanced(self, X_sc):
        m = self.models['bal']
        p = 1 / (1 + np.exp(-(X_sc @ np.array(m['coef']) + m['intercept'])))
        return balanced_mixture(p, m['death_days'], m['death_weights'])

    def _two_stage(self, X_sc):
        m = self.models['two']
        s1 = m['stage1']
        margin1 = _xgb_leaf_sum(s1['trees'], X_sc) + s1['bias']
        return cascade_mixture(margin1, s1['platt'], m['early_death_days'], self._cox(m['late'], X_sc))

    def staged(self, X_raw):
        """Конвейер: (S(t), вероятности групп, F_поздн) — как staged() в docs/survival_predictor.js."""
        X_sc = self._scale(X_raw)
        m = self.models['stg']
        cl = m['clusters']
        columns = [self.features.index(f) for f in cl.get('features', self.model_features)]  # признаки при поступлении
        Zc = (np.atleast_2d(np.asarray(X_raw, dtype=float))[:, columns] - np.array(cl['mean'])) / np.array(cl['scale'])
        cluster = ((Zc[:, None, :] - np.array(cl['centroids'])[None]) ** 2).sum(axis=-1).argmin(axis=1)
        coef1 = np.array(m['stage1']['coef'])
        d = X_sc.shape[1]
        p1 = 1 / (1 + np.exp(-(X_sc @ coef1[:d] + coef1[d + cluster] + m['stage1']['intercept'])))
        p2 = 1 / (1 + np.exp(-(X_sc @ np.array(m['stage2']['coef']) + m['stage2']['intercept'])))
        return staged_mixture(p1, p2, m['early_death_days'], self._cox(m['late'], X_sc))

    def survival(self, X_raw, name):
        """S(t) на сетке 0..τ−1 для исходных (нестандартизованных) признаков, форма (n, τ)."""
        if name == 'stg':
            return self.staged(X_raw)[0]
        X_sc = self._scale(X_raw)
        m = self.models[name]
        if name == 'two':
            return self._two_stage(X_sc)
        if name == 'bal':
            return self._balanced(X_sc)
        return self._calibrated(m['calibrator'], self.risk_score(X_sc, name))

    def predict(self, X_raw, name):
        return point_prediction(self.survival(X_raw, name))


def horizon_risks(S):
    """Риски смерти от ССЗ к срокам HORIZONS по S(t), форма (n, len(HORIZONS))."""
    return 1 - np.atleast_2d(S)[:, HORIZONS]


def risk_group(risk_1y):
    """Группа риска 0–3 (низкий, умеренный, высокий, очень высокий) по прогнозу на 12 месяцев (RISK_GROUP_EDGES)."""
    return np.digitize(risk_1y, RISK_GROUP_EDGES)


def point_prediction(S):
    """Прогноз по функциям выживаемости S (n, τ).

    time — медиана: первый день, когда S(t) ≤ 0,5, или τ, если S(t) > 0,5 на всём горизонте («смерти от ССЗ
    в пределах τ не ожидается»). Медиана минимизирует среднюю абсолютную ошибку. risks — риски смерти от ССЗ к срокам
    HORIZONS; rmst — RMST(τ) = Σ S(t), ожидаемое число дней без смерти от ССЗ (как в ноутбуке)."""
    S = np.atleast_2d(S)
    below = S <= 0.5
    time = np.where(below.any(axis=1), below.argmax(axis=1), S.shape[1])
    return {'time': time, 'rmst': S.sum(axis=1), 's_tau': S[:, -1], 'risks': horizon_risks(S)}


# ---------------------------------------------------------------------------
# Метрики на отложенной выборке с учётом цензурирования
# ---------------------------------------------------------------------------
def test_metrics(curves, time_obs, event_obs, time_train, event_train):
    """Стандартные метрики моделей выживаемости на отложенной выборке.

    C-index — согласованность порядка пациентов по RMST(τ) с порядком событий. По каждому сроку HORIZONS: auc —
    различение умерших от ССЗ к сроку и проживших дольше по риску 1 − S(t); eo — отношение среднего прогноза риска
    к риску по Каплану — Мейеру (1 — число смертей предсказано точно); ipa — 1 − Brier / Brier прогноза без признаков
    (всем риск по Каплану — Мейеру обучающей выборки): доля, на которую модель точнее среднего. Brier S(τ)
    и интегральный Brier score (IBS, среднее Brier score по дням 30, 60, …, 1470) — точность самих вероятностей:
    0 — идеально, 0,25 — константа 0,5.
    MAE — средняя абсолютная ошибка медианы S(t) относительно min(T, τ) у пациентов, у которых он известен (большая
    по устройству прогноза, см. HORIZONS; на странице не показывается).
    Ошибка калибровки RMST — среднее |прогноз − RMST Каплана — Мейера| по квинтилям прогноза.
    Веса IPCW (обратная вероятность не быть цензурированным) нужны, чтобы пациенты, цензурированные раньше,
    корректно входили в оценку всей когорты."""
    from lifelines import KaplanMeierFitter
    from lifelines.utils import concordance_index, restricted_mean_survival_time
    from sklearn.metrics import roc_auc_score
    km_censoring = KaplanMeierFitter().fit(time_train, 1 - event_train)
    G = lambda t: np.maximum(km_censoring.survival_function_at_times(t).values, 1e-3)

    def weights_at(t):
        """Веса IPCW для оценки на день t: умершие к t — 1/G(T), прожившие дольше t — 1/G(t), прочие — 0."""
        w = np.zeros(len(time_obs))
        died = event_obs & (time_obs <= t)
        w[died] = 1 / G(time_obs[died] - 1)
        w[time_obs > t] = 1 / G(t)
        return w

    w_tau = weights_at(TAU - 1)
    known = w_tau > 0
    true_tau = np.minimum(time_obs, TAU)
    ibs_days = np.arange(30, TAU, 30)
    km_obs = KaplanMeierFitter().fit(time_obs, event_obs)
    km_null = KaplanMeierFitter().fit(time_train, event_train)  # прогноз без признаков: всем средний риск
    out = {}
    for name, S in curves.items():
        p = point_prediction(S)
        rmst = p['rmst']
        groups = pd.qcut(pd.Series(rmst).rank(method='first'), 5, labels=False).values
        calibration = np.mean([abs(rmst[groups == g].mean() - restricted_mean_survival_time(
            KaplanMeierFitter().fit(time_obs[groups == g], event_obs[groups == g]), t=TAU)) for g in range(5)])
        brier = []
        for day in ibs_days:
            w = weights_at(day)
            brier.append(np.sum(w * ((time_obs > day) - S[:, day]) ** 2) / len(time_obs))

        def at_horizon(day):
            w = weights_at(day)
            k = w > 0
            died = event_obs & (time_obs <= day)
            risk = 1 - S[:, day]
            null = 1 - km_null.survival_function_at_times(day).iloc[0]
            observed = 1 - km_obs.survival_function_at_times(day).iloc[0]
            return (float(roc_auc_score(died[k], risk[k], sample_weight=w[k])), float(risk.mean() / observed),
                    float(1 - np.sum(w * (died - risk) ** 2) / np.sum(w * (died - null) ** 2)))
        auc, eo, ipa = zip(*map(at_horizon, HORIZONS))
        out[name] = {
            'c_index': float(concordance_index(time_obs, rmst, event_obs)),
            'auc': list(auc), 'eo': list(eo), 'ipa': list(ipa),
            'brier_s_tau': float(np.sum(w_tau * ((time_obs >= TAU) - S[:, -1]) ** 2) / len(time_obs)),
            'ibs': float(np.mean(brier)),
            'mae': float(np.sum((w_tau * np.abs(p['time'] - true_tau))[known]) / w_tau[known].sum()),
            'calibration_rmst': float(calibration),
            'mean_s_tau': float(S[:, -1].mean()),
        }
    out['_km_s_tau'] = float(km_obs.survival_function_at_times(TAU - 1).iloc[0])
    out['_deaths'] = [int((event_obs & (time_obs <= day)).sum()) for day in HORIZONS]
    return out


def risk_group_calibration(S, time, event):
    """Прогноз и факт по группам риска (risk_group по прогнозу на 12 месяцев): число пациентов, смертей от ССЗ
    за 12 месяцев, средний прогноз риска и риск по Каплану — Мейеру к каждому сроку HORIZONS."""
    from lifelines import KaplanMeierFitter
    risks = horizon_risks(S)
    group = risk_group(risks[:, -1])
    out = []
    for g in range(len(RISK_GROUP_EDGES) + 1):
        k = group == g
        if not k.any():
            out.append({'n': 0, 'deaths': 0, 'pred': None, 'obs': None})
            continue
        km = KaplanMeierFitter().fit(time[k], event[k])
        out.append({'n': int(k.sum()), 'deaths': int((event[k] & (time[k] <= HORIZONS[-1])).sum()),
                    'pred': _round(risks[k].mean(axis=0), 4),
                    'obs': _round(1 - km.survival_function_at_times(HORIZONS).values, 4)})
    return out


def similar_patients_risk(full, model_feature_names, horizon=HORIZONS[-1]):
    """«Реальный» риск каждого пациента (см. REAL_RISK_NEIGHBOURS): доля умерших от ССЗ к сроку horizon среди самых
    похожих при поступлении пациентов с известным к этому сроку исходом; сам пациент не входит."""
    time = full['time'].values
    event = full['target'].values.astype(bool)
    X = full[model_feature_names].values
    Z = (X - X.mean(axis=0)) / X.std(axis=0)
    died = event & (time <= horizon)
    known = np.flatnonzero(died | (time > horizon))
    risk = np.zeros(len(time))
    for g in range(len(time)):
        pool = known[known != g]
        nearest = pool[np.argsort(((Z[pool] - Z[g]) ** 2).sum(axis=1), kind='stable')[:REAL_RISK_NEIGHBOURS]]
        risk[g] = died[nearest].mean()
    return risk


def risk_group_agreement(curves, real_risk, time, event):
    """Матрица ошибок групп риска за 12 месяцев: группа по прогнозу модели (строка) × группа по «реальному» риску
    similar_patients_risk (столбец); в ячейке [пациентов, умерли от ССЗ за 12 месяцев, исход за 12 месяцев известен].
    AUC прогноза и «реального» риска — для смерти от ССЗ за 12 месяцев у пациентов с известным исходом."""
    from sklearn.metrics import roc_auc_score
    h = HORIZONS[-1]
    died = event & (time <= h)
    known = died | (time > h)
    real = risk_group(real_risk)
    k = len(RISK_GROUP_EDGES) + 1
    out = {'neighbours': REAL_RISK_NEIGHBOURS, 'horizon': h,
           'real_auc': float(roc_auc_score(died[known], real_risk[known])), 'models': {}}
    for name, S in curves.items():
        risk = 1 - S[:, h]
        pred = risk_group(risk)
        cells = [[[int(((pred == i) & (real == j)).sum()), int(((pred == i) & (real == j) & died).sum()),
                   int(((pred == i) & (real == j) & known).sum())] for j in range(k)] for i in range(k)]
        out['models'][name] = {'auc': float(roc_auc_score(died[known], risk[known])), 'cells': cells}
    return out


def train_all_models(full, df, features, bal_train, cal_train, log=lambda *a: None):
    """Все восемь моделей: модели ноутбука на bal_train (df_balanced) с калибровкой S(t) на всей обучающей когорте,
    каскад, Balanced mixture и конвейер с частичными метками цензурированных до τ (cal_train)."""
    train_all = bal_train.append(cal_train)
    log(f'Обучаем модели ноутбука на df_balanced ({len(bal_train)} пациентов, {len(features)} признаков при поступлении; '
        f'{"включая известные после выписки " + ", ".join(POST_DISCHARGE) if USE_POST_DISCHARGE else "при поступлении"})...')
    m = train_models(df, features, bal_train)
    log(f'Калибруем S(t) на всей обучающей когорте ({len(train_all)} пациентов)...')
    calibrators = recalibrate(full, df, features, bal_train, cal_train, m)
    log(f'Каскад: классификатор смерти от ССЗ ≤ {EARLY_DAYS} дн. и модель Кокса для остальных...')
    ts = train_cascade(full, features, train_all, m['scaler'])
    weights = ipcw_weights(full, train_all, bal_train)
    q = survival_share(full, features, m['scaler'], bal_train, cal_train, weights)
    log(f'Частичные метки {len(cal_train)} цензурированных до τ: q (доля доживших до τ среди {PSEUDO_NEIGHBOURS} похожих) '
        f'в среднем {q.mean():.3f}, 5-й процентиль {q.quantile(0.05):.2f}, минимум {q.min():.2f}')
    bm = train_balanced(full, features, bal_train, m['scaler'], q, weights)
    log(f'Многоэтапный конвейер: новый balanced без смертей от ССЗ в первые {STAGED_EARLY_DAYS} дн. — '
        f'{len(staged_training_set(full, bal_train))} обучающих пациентов из {len(bal_train)} и частичные метки...')
    st = train_staged(full, features, bal_train, train_all, m['scaler'], q)
    return dict(m=m, calibrators=calibrators, ts=ts, bm=bm, st=st)


def library_curves(fitted, X_raw, features):
    """S(t) всех восьми моделей средствами библиотек для пациентов X_raw (DataFrame признаков моделей), а также
    вероятности групп и F_поздн конвейера."""
    m = fitted['m']
    X_sc = m['scaler'].transform(X_raw)
    curves = library_survival(m, fitted['calibrators'], X_sc, features)
    curves['two'] = library_cascade(fitted['ts'], X_sc, features)
    curves['bal'], _ = library_balanced(fitted['bm'], X_sc)
    curves['stg'], staged_P, staged_F_late = library_staged(fitted['st'], X_raw.values.astype(float), X_sc, features)
    return curves, staged_P, staged_F_late


def cross_validated_curves(full, df, features, train_idx):
    """Прогнозы вне выборки для обучающих пациентов (см. CV_FOLDS): S(t) каждой модели, обученной без фолда пациента
    так же, как при экспорте."""
    from sklearn.model_selection import StratifiedKFold
    oof = {k: np.zeros((len(train_idx), TAU)) for k in MODEL_NAMES}
    folds = StratifiedKFold(CV_FOLDS, shuffle=True, random_state=0).split(train_idx, full.loc[train_idx, 'target'])
    for i, (fold_train, fold_val) in enumerate(folds):
        print(f'  фолд {i + 1} из {CV_FOLDS}...')
        fold = train_idx[fold_train]
        fitted = train_all_models(full, df, features, fold.intersection(df.index), fold.difference(df.index))
        curves = library_curves(fitted, full.loc[train_idx[fold_val], features], features)[0]
        for k in oof:
            oof[k][fold_val] = curves[k]
    return oof


def cmd_export(args):
    from lifelines import KaplanMeierFitter
    full, features, death_any = load_full_dataset(args.xlsx)
    mf = model_features(features)
    adm = admission_features(features)  # похожие пациенты и кластеры — по признакам при поступлении
    df = balanced_subset(full)
    bal_train, cal_train, test_idx = split_cohort(full, df)
    train_all = bal_train.append(cal_train)
    fitted = train_all_models(full, df, mf, bal_train, cal_train, log=print)
    m, calibrators, ts, bm, st = (fitted[k] for k in ('m', 'calibrators', 'ts', 'bm', 'st'))

    # Эталонный прогноз библиотек — для всех пациентов полного датасета
    reference, staged_P, staged_F_late = library_curves(fitted, full[mf], mf)
    staged_cluster = cluster_of(st['clustering'], full[st['clustering']['features']].values.astype(float))
    staged_group, staged_time = staged_route(staged_P, st['early_days'], staged_F_late)
    reference_pred = {k: point_prediction(S) for k, S in reference.items()}
    cohort_km = KaplanMeierFitter().fit(full['time'], full['target'])
    sudden = sudden_unexplained_deaths(full, adm, reference, cohort_km)
    p_death_staged = 1 - staged_P[:, 2]
    consensus_tau = np.median([1 - S[:, -1] for S in reference.values()], axis=0)
    unexpected, unexpected_died = unexpected_survivals(full, adm, p_death_staged)
    print(f'Внезапных необъяснимых смертей от ССЗ (≤ {SUDDEN_MAX_DAY} дн., медиана риска моделей к сроку < '
          f'{SUDDEN_RISK_RATIO} средних, ≥ {SUDDEN_SURVIVED:.0%} похожих пережили срок): {int(sudden["sudden"].sum())}; '
          f'неожиданных выживаний (риск по конвейеру ≥ {UNEXPECTED_RISK:.0%}): {int(unexpected.sum())}')

    # Метрики — на отложенных пациентах всей когорты (302, веса IPCW) для обоих датасетов: все модели откалиброваны
    # на всю когорту. Отложенные пациенты balanced_dataset.csv (82) отобраны по исходу (смертей от ССЗ 38% против 11%),
    # без весов метрики на них оценивают не прогноз при поступлении, а эту выборку
    pos = full.index.get_indexer(test_idx)
    metrics = test_metrics({k: S[pos] for k, S in reference.items()},
                           full.loc[test_idx, 'time'].values.astype(float), full.loc[test_idx, 'target'].values.astype(bool),
                           full.loc[train_all, 'time'].values.astype(float), full.loc[train_all, 'target'].values)
    km_s_tau = metrics.pop('_km_s_tau')
    test_deaths = metrics.pop('_deaths')

    # Группы риска — по прогнозам вне выборки на всей обучающей когорте (см. CV_FOLDS)
    print(f'Прогнозы вне выборки для групп риска: кросс-валидация по {CV_FOLDS} фолдам {len(train_all)} обучающих...')
    oof = cross_validated_curves(full, df, mf, train_all)
    t_all = full.loc[train_all, 'time'].values.astype(float)
    e_all = full.loc[train_all, 'target'].values.astype(bool)
    metrics_cv = test_metrics(oof, t_all, e_all, t_all, e_all)
    metrics_cv.pop('_km_s_tau')
    cv_deaths = metrics_cv.pop('_deaths')
    calibration = {k: risk_group_calibration(S, t_all, e_all) for k, S in oof.items()}
    real_risk = similar_patients_risk(full, adm)
    confusion = risk_group_agreement(oof, real_risk[full.index.get_indexer(train_all)], t_all, e_all)

    # Пациенты — весь med_dataset_cardio.xlsx; balanced_dataset.csv — подмножество его строк
    split = np.full(len(full), SPLIT_TEST)
    split[full.index.isin(bal_train)] = SPLIT_TRAIN
    split[full.index.isin(cal_train)] = SPLIT_CALIBRATION
    bundle = {
        'meta': {'tau': TAU, 'generated': date.today().isoformat(), 'notebook': 'Survival-function-analysys.ipynb',
                 'model_names': MODEL_NAMES, 'horizons': HORIZONS, 'risk_group_edges': RISK_GROUP_EDGES,
                 'early_days': EARLY_DAYS, 'plausible': PLAUSIBLE, 'unexpected_risk': UNEXPECTED_RISK,
                 # Каплан — Мейер по всей когорте: средний риск к срокам — для сравнения с прогнозом пациента
                 'cohort_risks': _round(1 - cohort_km.survival_function_at_times(HORIZONS).values, 4),
                 'cohort_s_tau': float(cohort_km.survival_function_at_times(TAU - 1).iloc[0]),
                 'test_size': len(test_idx), 'test_km_s_tau': km_s_tau, 'test_deaths': test_deaths,
                 'cv_size': len(train_all), 'cv_folds': CV_FOLDS, 'cv_deaths': cv_deaths,
                 'sudden_max_day': SUDDEN_MAX_DAY, 'sudden_risk_ratio': SUDDEN_RISK_RATIO,
                 'sudden_survived': SUDDEN_SURVIVED, 'sudden_neighbours': SUDDEN_NEIGHBOURS},
        'features': features,
        'model_features': mf,  # признаки моделей
        'post_discharge': list(POST_DISCHARGE),  # из них известны только после выписки
        'columns': full.columns.tolist(),  # порядок столбцов датасетов — для выгрузки изменённого датасета
        'patients': {
            'id': full.index.tolist(),
            'time': full['time'].astype(int).tolist(),
            'target': full['target'].astype(int).tolist(),
            'death_any': death_any.astype(int).tolist(),
            'split': split.tolist(),  # 0 — обучающий, цензурирован до τ; 1 — обучающий из df_balanced; 2 — отложенная выборка
            'X': [_round(row, 10) for row in full[features].values],
            # Внезапная необъяснимая смерть: признак, срок сравнения, доля переживших его среди похожих пациентов,
            # медиана риска восьми моделей к сроку и наибольший риск (модель — индекс в meta.model_names)
            'sudden': sudden['sudden'].astype(int).tolist(),
            'sudden_horizon': sudden['horizon'].tolist(),
            'sudden_survived': _round(sudden['survived'], 3),
            'sudden_risk': _round(sudden['risk'], 4),
            'sudden_top_risk': _round(sudden['top_risk'], 4),
            'sudden_top_model': sudden['top_model'].tolist(),
            # Неожиданное выживание: признак, риск смерти от ССЗ до τ по конвейеру и медиана восьми моделей,
            # доля умерших среди похожих
            'unexpected': unexpected.astype(int).tolist(),
            'unexpected_risk': _round(np.where(unexpected, p_death_staged, 0), 3),
            'unexpected_consensus': _round(np.where(unexpected, consensus_tau, 0), 3),
            'unexpected_died': _round(unexpected_died, 3),
            # «Реальный» риск смерти от ССЗ за 12 месяцев: доля умерших среди самых похожих пациентов (матрица ошибок)
            'real_risk': _round(real_risk, 3),
        },
        'datasets': {
            'balanced': {'file': BALANCED_CSV.name, 'rows': full.index.get_indexer(df.index).tolist()},
            'full': {'file': FULL_XLSX.name, 'rows': None},
        },
        **export_params(df, mf, bal_train, m, calibrators, ts, bm, st),
        'metrics': metrics,          # 302 отложенных пациента всей когорты
        'metrics_cv': metrics_cv,    # прогнозы вне выборки на обучающей когорте
        'calibration': calibration,  # прогноз и факт по группам риска, прогнозы вне выборки
        'confusion': confusion,      # матрица ошибок групп риска: прогноз × «реальный» риск по похожим пациентам
        # Прогноз по самим библиотекам — эталон для проверки JavaScript-расчёта (scripts/check_js_predictor.js)
        'reference_rmst': {k: _round(S.sum(axis=1), 9) for k, S in reference.items()},
        'reference_time': {k: p['time'].tolist() for k, p in reference_pred.items()},
        # Конвейер: вероятности групп и жёсткая маршрутизация (справочно) — для той же проверки
        'reference_staged': {'P': [_round(row, 9) for row in staged_P], 'group': staged_group.tolist(),
                             'time': staged_time.astype(int).tolist(), 'cluster': staged_cluster.tolist()},
    }

    # Проверка: расчёт по экспортированным параметрам совпадает с библиотеками
    predictor = SurvivalTimePredictor(json.loads(json.dumps(bundle)))
    for title, ms, deaths in [(f'Отложенная выборка — вся когорта: {len(test_idx)} отложенных, веса IPCW, '
                               f'S(τ) по Каплану — Мейеру {km_s_tau:.3f}', metrics, test_deaths),
                              (f'Прогнозы вне выборки — {len(train_all)} обучающих, {CV_FOLDS} фолдов', metrics_cv, cv_deaths)]:
        print(f'\n{title}; смертей от ССЗ к срокам {", ".join(f"{h} дн. — {d}" for h, d in zip(HORIZONS, deaths))}')
        print(f'{"модель":<19} {"C-index":>8} ' + ' '.join(f'{f"AUC {h}":>8}' for h in HORIZONS)
              + f' {"E/O 365":>8} {"IBS":>6} {"калибр.":>8} {"ср. S(τ)":>9}')
        for name in MODEL_NAMES:
            r = ms[name]
            print(f'{MODEL_NAMES[name]:<19} {r["c_index"]:>8.4f} ' + ' '.join(f'{a:>8.3f}' for a in r['auc'])
                  + f' {r["eo"][-1]:>8.2f} {r["ibs"]:>6.3f} {r["calibration_rmst"]:>5.0f} дн {r["mean_s_tau"]:>9.3f}')
    labels = ['< 3%', '3–10%', '10–25%', '≥ 25%']
    print(f'\nГруппы риска (по прогнозу на 12 мес., вне выборки), прогноз / факт к срокам {", ".join(map(str, HORIZONS))} дн.:')
    for name in ('cph', 'stg'):
        print(f'  {MODEL_NAMES[name]}')
        for label, g in zip(labels, calibration[name]):
            cells = '  '.join(f'{p:.1%}/{o:.1%}' for p, o in zip(g['pred'], g['obs'])) if g['n'] else '—'
            print(f'    {label:>7}: {g["n"]:>4} пациентов, смертей за год {g["deaths"]:>3}:  {cells}')
    print(f'\nМатрица ошибок за 12 мес. (вне выборки): прогнозная группа × «реальная» по {REAL_RISK_NEIGHBOURS} похожим; '
          f'AUC «реального» риска {confusion["real_auc"]:.3f}')
    for name in MODEL_NAMES:
        cells = np.array(confusion['models'][name]['cells'])  # прогноз × «реальная» × [n, умерли, известен]
        i, j = np.indices(cells.shape[:2])
        rate = lambda mask: cells[mask][:, 1].sum() / max(cells[mask][:, 2].sum(), 1)
        print(f'  {MODEL_NAMES[name]:<19} AUC {confusion["models"][name]["auc"]:.3f}; совпадение '
              f'{cells[i == j][:, 0].sum() / cells[..., 0].sum():.0%}; умерли за год: модель выше похожих {rate(i > j):.1%}, '
              f'совпали {rate(i == j):.1%}, модель ниже {rate(i < j):.1%}')
    for name in MODEL_NAMES:
        diff = np.abs(predictor.predict(full[features].values, name)['rmst'] - reference[name].sum(axis=1)).max()
        assert diff < 0.05, f'{name}: расчёт по параметрам расходится с библиотекой (max |ΔRMST| = {diff:.2e})'

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(JS_PREFIX + json.dumps(bundle, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'Записано: {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} ({os.path.getsize(out) / 1024:.0f} КБ)')
    if out.resolve().parent == PAGE_HTML.parent:
        stamp_page()


def stamp_page(index=PAGE_HTML):
    """Версии скриптов страницы: src="app.js?v=<первые 10 знаков SHA-256 файла>". GitHub Pages разрешает браузеру
    хранить каждый файл 10 минут отдельно, и сразу после публикации браузер мог взять новый index.html со старыми
    app.js и i18n.js (флажок есть, а его текста и обработчика нет). С версией в адресе новый index.html загружает
    новые скрипты, а сохранённый в кэше старый — свои старые."""
    import hashlib
    import re
    html = index.read_text(encoding='utf-8')

    def versioned(match):
        name = match.group(1)
        digest = hashlib.sha256((index.parent / name).read_bytes()).hexdigest()[:10]
        return f'<script src="{name}?v={digest}"></script>'
    stamped = re.sub(r'<script src="([\w.-]+\.js)(?:\?v=\w+)?"></script>', versioned, html)
    if stamped != html:
        index.write_text(stamped, encoding='utf-8')
    print(f'Версии скриптов в {index.relative_to(ROOT)}: {"обновлены" if stamped != html else "актуальны"}')


def cmd_stamp(args):
    stamp_page()


def sudden_unexplained_deaths(full, model_feature_names, curves, cohort_km):
    """Внезапные необъяснимые смерти (см. SUDDEN_RISK_RATIO). curves — S(t) всех моделей для всех пациентов.
    Возвращает массивы по пациентам: признак группы, срок сравнения (из HORIZONS), долю переживших его среди самых
    похожих пациентов, медиану риска моделей к сроку, наибольший риск и номер модели с ним."""
    time = full['time'].values
    event = full['target'].values.astype(bool)
    X = full[model_feature_names].values
    Z = (X - X.mean(axis=0)) / X.std(axis=0)
    risks = np.stack([1 - S[:, HORIZONS] for S in curves.values()])  # модели × пациенты × сроки
    cohort = 1 - cohort_km.survival_function_at_times(HORIZONS).values
    n = len(time)
    out = {'sudden': np.zeros(n, bool), 'horizon': np.zeros(n, int), 'survived': np.zeros(n), 'risk': np.zeros(n),
           'top_risk': np.zeros(n), 'top_model': np.zeros(n, int)}
    for g in np.flatnonzero(event & (time <= SUDDEN_MAX_DAY)):
        j = next(j for j, h in enumerate(HORIZONS) if time[g] <= h)
        h = HORIZONS[j]
        known = np.flatnonzero(((event & (time <= h)) | (time > h)) & (np.arange(n) != g))
        nearest = known[np.argsort(((Z[known] - Z[g]) ** 2).sum(axis=1))[:SUDDEN_NEIGHBOURS]]
        survived = 1 - (event[nearest] & (time[nearest] <= h)).mean()
        risk = np.median(risks[:, g, j])
        if risk < SUDDEN_RISK_RATIO * cohort[j] and survived >= SUDDEN_SURVIVED:
            top = int(risks[:, g, j].argmax())
            out['sudden'][g] = True
            out['horizon'][g], out['survived'][g], out['risk'][g] = h, survived, risk
            out['top_risk'][g], out['top_model'][g] = risks[top, g, j], top
    return out


def unexpected_survivals(full, model_feature_names, p_death):
    """Неожиданное выживание (см. UNEXPECTED_RISK): признак группы и доля умерших от ССЗ до τ среди самых похожих
    при поступлении пациентов с известным к τ исходом."""
    time = full['time'].values
    event = full['target'].values.astype(bool)
    group = (time >= TAU) & ~(event & (time < TAU)) & (p_death >= UNEXPECTED_RISK)
    X = full[model_feature_names].values
    Z = (X - X.mean(axis=0)) / X.std(axis=0)
    known = (event & (time < TAU)) | (time >= TAU)
    died = np.zeros(len(time))
    for g in np.flatnonzero(group):
        candidates = np.flatnonzero(known & (np.arange(len(time)) != g))
        nearest = candidates[np.argsort(((Z[candidates] - Z[g]) ** 2).sum(axis=1))[:SUDDEN_NEIGHBOURS]]
        died[g] = (event[nearest] & (time[nearest] < TAU)).mean()
    return group, died


def outcome_text(target, death_any, time):
    if target:
        return f'смерть от ССЗ на {time}-й день'
    if death_any:
        return f'смерть от других причин на {time}-й день (время смерти от ССЗ не наблюдается)'
    return f'жив на конец наблюдения ({time} дн.)' if time < TAU else f'жив на момент τ (наблюдение {time} дн.)'


def cmd_predict(args):
    predictor = SurvivalTimePredictor.from_js(args.model_file)
    p = predictor.bundle['patients']
    if args.id is not None:
        if args.id not in p['id']:
            raise SystemExit(f'Пациента с ID {args.id} нет в датасете')
        row = p['id'].index(args.id)
    else:
        rows = predictor.bundle['datasets'][args.dataset]['rows'] or list(range(len(p['id'])))
        if not 0 <= args.row < len(rows):
            raise SystemExit(f'Строки {args.row} нет: в датасете {len(rows)} строк')
        row = rows[args.row]
    x = np.array(p['X'][row], dtype=float)
    x_edit = x.copy()
    for item in args.set:
        feature, value = item.split('=')
        x_edit[predictor.features.index(feature)] = float(value)

    time, target = p['time'][row], p['target'][row]
    real = (f'{min(time, TAU)}' if target or time >= TAU else f'≥ {time}')
    print(f'Пациент ID {p["id"][row]}: {outcome_text(target, p["death_any"][row], time)}; {SPLIT_NAMES[p["split"][row]]}')
    print(f'Факт min(T, τ) = {real} дн.')
    for i in np.flatnonzero(x_edit != x):
        unused = (' (моделями не используется: известен после выписки)' if predictor.features[i] not in predictor.model_features
                  else ' (известен только после выписки: влияние на риск завышено)' if predictor.features[i] in POST_DISCHARGE else '')
        print(f'  {predictor.features[i]}: {x[i]:g} → {x_edit[i]:g}{unused}')
    names = MODEL_NAMES if args.model == 'all' else {args.model: MODEL_NAMES[args.model]}
    groups = ['низкий', 'умеренный', 'высокий', 'очень высокий']
    print('Риск смерти от ССЗ к сроку (с изменениями); дата — медиана S(t), только при риске до τ выше 50%')
    print(f'{"модель":<19} {"дата":>7} {"с изм.":>7} ' + ' '.join(f'{f"{h} дн":>7}' for h in HORIZONS)
          + f' {"группа риска":>14} {f"до {TAU}":>8}')
    show = lambda t: '—' if t >= TAU else str(int(t))
    for name, title in names.items():
        base = predictor.predict(x, name)
        edit = predictor.predict(x_edit, name)
        r = edit['risks'][0]
        print(f'{title:<19} {show(base["time"][0]):>7} {show(edit["time"][0]):>7} ' + ' '.join(f'{v:>7.1%}' for v in r)
              + f' {groups[risk_group(r[-1])]:>14} {1 - edit["s_tau"][0]:>8.1%}')
    cohort = predictor.bundle['meta']['cohort_risks']
    print(f'{"среднее по когорте":<19} {"":>7} {"":>7} ' + ' '.join(f'{v:>7.1%}' for v in cohort))
    if 'stg' in names:
        m = predictor.models['stg']
        _, P, F_late = predictor.staged(x_edit)
        group, route_time = staged_route(P, m['early_death_days'], F_late)
        labels = [f'ранняя смерть ≤ {STAGED_EARLY_DAYS} дн.', f'смерть от ССЗ на {STAGED_EARLY_DAYS + 1}–{TAU - 1}-й день',
                  f'жив дольше {TAU} дн.']
        print(f'Конвейер: {"; ".join(f"{l} {p:.1%}" for l, p in zip(labels, P[0]))}')
        route = f'≥ {TAU}' if route_time[0] >= TAU else int(route_time[0])
        print(f'  наиболее вероятная группа — {labels[group[0]]}; время внутри неё (справочно): {route} дн.')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    p_export = sub.add_parser('export', help='обучить модели и записать docs/survival_model.js')
    p_export.add_argument('--xlsx', default=FULL_XLSX)
    p_export.add_argument('--out', default=MODEL_JS)
    p_export.set_defaults(func=cmd_export)

    p_predict = sub.add_parser('predict', help='прогноз времени для пациента')
    who = p_predict.add_mutually_exclusive_group(required=True)
    who.add_argument('--row', type=int, help='номер строки в датасете --dataset (с 0)')
    who.add_argument('--id', type=int, help='ID пациента — индекс строки med_dataset_cardio.xlsx, '
                                            'он же первый столбец balanced_dataset.csv')
    p_predict.add_argument('--dataset', default='balanced', choices=['balanced', 'full'],
                           help='для --row: balanced_dataset.csv или полный med_dataset_cardio.xlsx')
    p_predict.add_argument('--set', nargs='*', default=[], metavar='ПРИЗНАК=ЗНАЧЕНИЕ', help='изменённые признаки')
    p_predict.add_argument('--model', default='all', choices=['all', *MODEL_NAMES])
    p_predict.add_argument('--model-file', default=MODEL_JS)
    p_predict.set_defaults(func=cmd_predict)

    p_stamp = sub.add_parser('stamp', help='проставить в docs/index.html версии скриптов страницы')
    p_stamp.set_defaults(func=cmd_stamp)

    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
