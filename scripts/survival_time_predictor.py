"""Прогноз времени дожития по подходу Survival-function-analysys.ipynb — с перекалибровкой на всей когорте.

Модели — те же, что в ноутбуке (CoxPH, Weibull AFT, XGBoost Cox, полносвязная и резервуарная нейросети),
с тем же разбиением df_balanced (= balanced_dataset.csv), стандартизацией и гиперпараметрами. Для пациента
считается функция выживаемости S(t) на сетке 0..τ−1 и прогноз времени RMST(τ) = ∫₀^τ S(t) dt.

Исправления по сравнению с ноутбуком.

1. Признаки doctor (наблюдающий врач) и llo (льготное лекарственное обеспечение) назначаются после выписки:
умершие рано их не получают (92% и 100% умерших от ССЗ в первые 30 дней), то есть в них частично заложен исход
(immortal time bias). Модели используют только 28 признаков, известных при поступлении (MODEL_FEATURES).

2. df_balanced — это смерти от ССЗ и пациенты, наблюдавшиеся не меньше τ;
1098 пациентов, цензурированных раньше τ, в него не входят. Поэтому доля смертей в нём 37% вместо 10%,
и функции выживаемости, оценённые на нём, сильно занижены: средний прогноз S(τ) 0,63–0,72 против 0,88
по Каплану — Мейеру на отложенных пациентах. Модели по-прежнему обучаются на df_balanced (там у всех известен
исход, и пациентов они ранжируют лучше всего), а переход от оценки риска модели к S(t) — калибратор Кокса
(для Weibull AFT — Weibull) — обучается на всей обучающей когорте med_dataset_cardio.xlsx с учётом
цензурирования. Оценки риска для пациентов df_balanced при этом берутся вне выборки (5 фолдов). Для нейросетей
оценка риска — логит, а не вероятность: вероятность насыщается у 1 и сжимает прогноз у пациентов высокого риска.

Команды:
  export   обучить модели и калибраторы, записать параметры и оба датасета в docs/survival_model.js
           (их использует интерактивная страница docs/index.html — тот же расчёт на JavaScript)
  predict  прогноз времени для пациента, в том числе с изменёнными признаками

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
JS_PREFIX = 'window.SURVIVAL_MODEL = '

# Горизонт τ и дневная сетка — как в ноутбуке
TAU = 1500
GRID = np.arange(TAU)
# Окна времени профиля риска: смерть от ССЗ в первые 30 дней, на 31–90-й, 91–365-й, 366–1499-й день, нет смерти до τ.
# Прогноз модели — распределение времени, а не дата: точный день смерти по данным при поступлении не определяется
# (смерть «скорее всего» не попадает ни в одно окно, кроме «нет смерти до τ»), поэтому пациенту показываются
# вероятности окон, а точечный прогноз — медиана S(t).
WINDOW_EDGES = [30, 90, 365, TAU]
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

# Модель для популяции balanced_dataset.csv — пациентов, у которых исход к τ известен (смерть от ССЗ или
# наблюдение ≥ τ; смертей от ССЗ 37% вместо 10% во всей когорте). Остальные модели откалиброваны на всю когорту
# и для этой популяции занижают риск. Логистическая регрессия «смерть от ССЗ до τ» на 326 обучающих пациентах
# df_balanced: S(t) = 1 − p·F(t), F — доля умерших к дню t среди умерших от ССЗ до τ в обучающей выборке; прогноз —
# медиана S(t). Применять — только к пациентам этой популяции.

# Многоэтапный конвейер для той же популяции (train_staged):
# 1) вся когорта; 2) без ранних смертей (смерть от ССЗ в первые STAGED_EARLY_DAYS = 10 дней); 3) правило balanced
# из ноутбука (смерть от ССЗ или наблюдение ≥ τ) — новый balanced без ранних смертей, его обучающие пациенты;
# классификация в три группы: этап 1 — ранняя смерть или нет, этап 2 — смерть от ССЗ до τ или жизнь дольше τ
# (логистическая регрессия на новом balanced); 4) модель Кокса на новом balanced — время поздней смерти;
# 5) S(t) = 1 − p_ранн·F_ранн(t) − p_поздн·F_поздн(t | x), где F_ранн — распределение дней ранней смерти, F_поздн — время
# смерти по модели Кокса при условии смерти до τ. Прогноз — медиана S(t): вероятности классификатора определяют время
# каждого пациента. Жёсткая маршрутизация (время группы с наибольшей вероятностью) при кросс-валидации хуже; на странице
# она показана справочно.
# Этап 1 использует агломеративную кластеризацию всей когорты: STAGED_CLUSTERS кластеров, связь STAGED_LINKAGE,
# 28 признаков при поступлении всех 1506 пациентов, без исходов; принадлежность — ближайший центроид. Принадлежность
# к кластеру (one-hot) входит в логистическую регрессию вместе с признаками пациента. Кластеры — клинические фенотипы:
# в кластере «анемия, ХБП, ФП, без стентирования» (100 пациентов) и «гипергликемия, диабет, лейкоцитоз» (78) — 10 из
# 17 смертей от ССЗ в первые 10 дней, в основном кластере (945 пациентов) — 2. При кросс-валидации (5 разбиений ×
# 5 фолдов, 326 обучающих balanced, 14 ранних смертей) кластеры снижают log-loss этапа 1 в каждом разбиении
# (на 0,002) и повышают AUC на 0,012–0,024. Перебор: связи ward, average, complete; 4–64 кластера; one-hot или доля
# ранних смертей в кластере как признак; только кластер или вместе с признаками. Доля ранних смертей в кластере
# (target encoding) отвергнута: при 14 ранних смертях на 16 кластеров исключение собственного исхода пациента из доли
# его кластера даёт отрицательный коэффициент и ненадёжный выигрыш. Для этапа 2 кластеры не помогают.
STAGED_EARLY_DAYS = 10
STAGED_CLUSTERS = 8
STAGED_LINKAGE = 'complete'
STAGED_GROUPS = ('early', 'late', 'survive')

# Внезапная необъяснимая смерть: смерть от ССЗ в первые SUDDEN_MAX_DAY дней, которую не предсказала ни одна модель
# (у всех прогноз ≥ τ). Для каждого такого пациента — доля переживших тот же срок (первый месяц, три месяца или год)
# среди SUDDEN_NEIGHBOURS самых похожих по признакам при поступлении пациентов с известным на этот срок исходом
SUDDEN_MAX_DAY = 365
SUDDEN_NEIGHBOURS = 50
# Неожиданное выживание: нет смерти от ССЗ до τ, хотя модель по умолчанию для популяции balanced_dataset.csv
# (многоэтапный конвейер: 1 − вероятность группы «жив дольше τ») оценивала риск смерти от ССЗ до τ не ниже UNEXPECTED_RISK; для сравнения — доля умерших от ССЗ до τ среди SUDDEN_NEIGHBOURS
# самых похожих пациентов с известным к τ исходом
UNEXPECTED_RISK = 0.5
# Правдоподобные диапазоны значений: вне них — вероятная ошибка ввода (страница предупреждает о таких значениях)
PLAUSIBLE = {'age': (18, 105), 'ef_hosp': (10, 80), 'bpm': (30, 220), 'sysAP': (60, 260), 'bmi': (15, 60),
             'hb': (60, 200), 'leukoc': (1, 50), 'tromboc': (20, 1000), 't_chol': (1, 15), 'ldl': (0.3, 12),
             'glu': (2, 35), 'crea': (30, 1000)}

# Признаки, известные только после выписки: в моделях не используются (см. docstring)
POST_DISCHARGE = ('doctor', 'llo')
# Роль пациента в обучении (patients.split в docs/survival_model.js)
SPLIT_CALIBRATION, SPLIT_TRAIN, SPLIT_TEST = 0, 1, 2
SPLIT_NAMES = {SPLIT_CALIBRATION: 'обучающая выборка (только калибровка: цензурирован до τ)',
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


def model_features(features):
    """Признаки моделей: все, кроме известных только после выписки."""
    return [f for f in features if f not in POST_DISCHARGE]


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
    Возвращает (обучение моделей, только калибровка, отложенная выборка)."""
    from sklearn.model_selection import train_test_split
    bal_train, bal_test = split_dataset(df)
    censored_early = full.index.difference(df.index)
    cal_train, cal_test = train_test_split(censored_early, test_size=0.2, random_state=37)
    return bal_train, cal_train, bal_test.append(cal_test)


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

    cph_data_train = pd.DataFrame(X_train_sc, columns=features)
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

    return dict(scaler=scaler, cph=cph, aft=aft, xgb_surv=xgb_surv, xgb_margin_offset=xgb_margin_offset,
                nn_model=nn_model, W_in=W_in, rn_readout=rn_readout)


def risk_scores(m, X_sc, features):
    """Оценка риска каждой модели: лог-риск CoxPH, log λ Weibull AFT, лог-риск XGBoost,
    логиты нейросетей (до сигмоиды)."""
    lam = m['aft'].params_.loc['lambda_']
    W1, b1, W2, b2, W3, b3 = m['nn_model'].get_weights()
    hidden = np.maximum(np.maximum(X_sc @ W1 + b1, 0) @ W2 + b2, 0)
    return {
        'cph': m['cph'].predict_log_partial_hazard(pd.DataFrame(X_sc, columns=features)).values,
        'aft': X_sc @ lam[features].values + lam['Intercept'],
        'xgb': m['xgb_surv'].predict(X_sc, output_margin=True) - m['xgb_margin_offset'],
        'nn': (hidden @ W3 + b3).ravel(),
        'rn': m['rn_readout'].decision_function(np.tanh(X_sc @ m['W_in'])),
    }


def recalibrate(full, df, features, bal_train, cal_train, m):
    """Калибраторы S(t | оценка риска), обученные на всей обучающей когорте с учётом цензурирования:
    Кокс для CoxPH, XGBoost и нейросетей, Weibull AFT — для Weibull AFT. Оценки риска пациентов df_balanced —
    вне выборки (модели 5 фолдов), остальных — финальной моделью, которая их не видела."""
    from lifelines import CoxPHFitter, WeibullAFTFitter
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

    data = pd.DataFrame({'time': full.loc[train_all, 'time'].values, 'event': full.loc[train_all, 'target'].values})
    return {k: (WeibullAFTFitter() if k == 'aft' else CoxPHFitter()).fit(
                data.assign(score=scores[k].values), duration_col='time', event_col='event')
            for k in SURVIVAL_MODELS}


def library_survival(m, calibrators, X_sc, features):
    """Функции выживаемости S(t) на сетке средствами самих библиотек (lifelines, xgboost, keras), форма (n, τ)."""
    scores = risk_scores(m, X_sc, features)
    return {k: calibrators[k].predict_survival_function(pd.DataFrame({'score': scores[k]}), times=GRID).values.T
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
# Двухэтапная модель для популяции balanced_dataset.csv
# ---------------------------------------------------------------------------
def train_balanced(df, features, train_idx, scaler):
    """Логистическая регрессия «смерть от ССЗ до τ» на обучающих пациентах df_balanced."""
    from sklearn.linear_model import LogisticRegression
    time = df.loc[train_idx, 'time'].values.astype(float)
    death = df.loc[train_idx, 'target'].values.astype(bool) & (time < TAU)
    classifier = LogisticRegression(C=0.3, max_iter=5000).fit(scaler.transform(df.loc[train_idx, features]), death)
    return dict(classifier=classifier, death_days=np.sort(time[death]).astype(int))


def balanced_mixture(p_death, death_days):
    """S(t) = 1 − p · F(t), где F — доля умерших к дню t среди умерших от ССЗ до τ в обучающей выборке."""
    F = (np.asarray(death_days)[None, :] <= GRID[:, None]).mean(axis=1)
    return 1 - p_death[:, None] * F[None, :]


def library_balanced(bm, X_sc):
    """(S(t), вероятность смерти от ССЗ до τ) средствами scikit-learn."""
    p = bm['classifier'].predict_proba(X_sc)[:, 1]
    return balanced_mixture(p, bm['death_days']), p


# ---------------------------------------------------------------------------
# Многоэтапный конвейер для популяции balanced_dataset.csv
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
    return dict(mean=mean, scale=scale, centroids=centroids, profile=profile)


def cluster_of(clustering, X_raw):
    Z = (np.atleast_2d(X_raw) - clustering['mean']) / clustering['scale']
    return ((Z[:, None, :] - clustering['centroids'][None]) ** 2).sum(axis=-1).argmin(axis=1)


def _one_hot(cluster):
    return np.eye(STAGED_CLUSTERS)[cluster]


def train_staged(full, df, features, train_idx, cohort_train_idx, scaler):
    """Этап 1 — логистическая регрессия «ранняя смерть» по признакам и принадлежности к кластеру всей когорты
    (обучающие df_balanced); этап 2 — логистическая регрессия «смерть от ССЗ до τ» и модель Кокса времени поздней
    смерти на новом balanced без ранних смертей."""
    from lifelines import CoxPHFitter
    from sklearn.linear_model import LogisticRegression

    clustering = staged_clustering(full, features)
    # Для пояснения на странице: ранние смерти в кластерах среди всей обучающей когорты с известным статусом на 10-й день
    t_all = full.loc[cohort_train_idx, 'time'].values.astype(float)
    early_all = full.loc[cohort_train_idx, 'target'].values.astype(bool) & (t_all <= STAGED_EARLY_DAYS)
    known = early_all | (t_all > STAGED_EARLY_DAYS)
    c_all = cluster_of(clustering, full.loc[cohort_train_idx, features].values[known])

    time = df.loc[train_idx, 'time'].values.astype(float)
    early = df.loc[train_idx, 'target'].values.astype(bool) & (time <= STAGED_EARLY_DAYS)
    Z = scaler.transform(df.loc[train_idx, features])
    cluster = cluster_of(clustering, df.loc[train_idx, features].values)
    stage1 = LogisticRegression(C=0.03, max_iter=5000).fit(np.column_stack([Z, _one_hot(cluster)]), early)

    late_idx = staged_training_set(full, train_idx)
    Z_late = scaler.transform(full.loc[late_idx, features])
    time_late = full.loc[late_idx, 'time'].values.astype(float)
    death_late = full.loc[late_idx, 'target'].values.astype(bool) & (time_late < TAU)
    stage2 = LogisticRegression(C=0.1, max_iter=5000).fit(Z_late, death_late)
    # Признак без разброса на новом balanced (бинарный и редкий) модель Кокса не оценивает: его коэффициент — 0
    varying = [f for f, s in zip(features, Z_late.std(axis=0)) if s > 1e-9]
    late_data = pd.DataFrame(Z_late, columns=features)[varying].assign(time=time_late, event=death_late.astype(int))
    late_cox = CoxPHFitter(penalizer=0.1).fit(late_data, duration_col='time', event_col='event')
    return dict(clustering=clustering, cluster_n=np.bincount(c_all, minlength=STAGED_CLUSTERS),
                cluster_early=np.bincount(c_all, weights=early_all[known], minlength=STAGED_CLUSTERS).astype(int),
                stage1=stage1, stage2=stage2, late_cox=late_cox, late_features=varying,
                early_days=np.sort(time[early]).astype(int))


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
    стандартизации (для кластера)."""
    cluster = cluster_of(st['clustering'], X_raw)
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

    # CoxPH с калибратором — снова модель Кокса по признакам: log HR = c · (x − center) · β,
    # базовый риск — калибратора при оценке риска 0
    cal = calibrators['cph']
    c = cal.params_['score']
    cph = {'beta': _round(c * m['cph'].params_[features].values, 10),
           'center': _round(m['cph']._norm_mean[features].values, 10),
           'H0': _round(cal.predict_cumulative_hazard(pd.DataFrame({'score': [0.0]}), times=GRID).values[:, 0])}

    # Weibull AFT с калибратором — снова Weibull AFT: log λ = a + b · (x · β + β0), ρ — у калибратора
    lam, cal = m['aft'].params_.loc['lambda_'], calibrators['aft']
    a, b = cal.params_.loc[('lambda_', 'Intercept')], cal.params_.loc[('lambda_', 'score')]
    aft = {'lambda_intercept': float(a + b * lam['Intercept']), 'lambda_beta': _round(b * lam[features].values, 10),
           'rho_intercept': float(cal.params_.loc[('rho_', 'Intercept')])}

    return {
        'scaler': {'mean': _round(m['scaler'].mean_, 12), 'scale': _round(m['scaler'].scale_, 12)},
        'models': {
            'cph': {'type': 'cox', **cph},
            'aft': {'type': 'weibull_aft', **aft},
            'xgb': {'type': 'xgb_cox', 'trees': trees, 'bias': float(base_margin - m['xgb_margin_offset']),
                    'calibrator': _export_cox(calibrators['xgb'], ['score'])},
            'nn': {'type': 'mlp',
                   'layers': [{'in': w.shape[0], 'out': w.shape[1], 'W': _f32_b64(w), 'b': _f32_b64(b), 'activation': act}
                              for (w, b), act in zip(zip(nn_weights[::2], nn_weights[1::2]), ['relu', 'relu', 'linear'])],
                   'calibrator': _export_cox(calibrators['nn'], ['score'])},
            'rn': {'type': 'reservoir', 'n_features': len(features), 'n_reservoir': m['W_in'].shape[1],
                   'W_in': _f32_b64(m['W_in']), 'coef': _f32_b64(m['rn_readout'].coef_[0]),
                   'intercept': float(m['rn_readout'].intercept_[0]),
                   'calibrator': _export_cox(calibrators['rn'], ['score'])},
            'two': _export_cascade(ts, features),
            'bal': {'type': 'balanced_mixture', 'coef': _round(bm['classifier'].coef_[0], 10),
                    'intercept': float(bm['classifier'].intercept_[0]), 'death_days': bm['death_days'].tolist()},
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
            'clusters': {'mean': _round(cl['mean'], 12), 'scale': _round(cl['scale'], 12),
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

    def risk_score(self, X_sc, name):
        """Ковариата калибратора Кокса: лог-риск XGBoost или логит нейросети."""
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
        return balanced_mixture(p, m['death_days'])

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
        Zc = (np.atleast_2d(np.asarray(X_raw, dtype=float))[:, self._columns] - np.array(cl['mean'])) / np.array(cl['scale'])
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
        if name == 'cph':
            return self._cox(m, X_sc)
        if name == 'aft':
            lam = np.exp(X_sc @ np.array(m['lambda_beta']) + m['lambda_intercept'])
            return np.exp(-(GRID[None, :] / lam[:, None]) ** np.exp(m['rho_intercept']))
        return self._cox(m['calibrator'], self.risk_score(X_sc, name))

    def predict(self, X_raw, name):
        return point_prediction(self.survival(X_raw, name))


def window_probabilities(S):
    """Вероятности окон WINDOW_EDGES по S(t): смерть от ССЗ в первые 30 дней, на 31–90-й, 91–365-й, 366–1499-й день
    и отсутствие смерти от ССЗ до τ, форма (n, 5)."""
    S = np.atleast_2d(S)
    s = lambda day: S[:, min(day, S.shape[1] - 1)]
    return np.column_stack([1 - s(30), s(30) - s(90), s(90) - s(365), s(365) - s(TAU - 1), s(TAU - 1)])


def point_prediction(S):
    """Прогноз по функциям выживаемости S (n, τ).

    time — медиана: первый день, когда S(t) ≤ 0,5, или τ, если S(t) > 0,5 на всём горизонте («смерти от ССЗ
    в пределах τ не ожидается»). Медиана минимизирует среднюю абсолютную ошибку. windows — профиль риска по окнам
    времени; rmst — RMST(τ) = Σ S(t), ожидаемое число дней без смерти от ССЗ (как в ноутбуке)."""
    S = np.atleast_2d(S)
    below = S <= 0.5
    time = np.where(below.any(axis=1), below.argmax(axis=1), S.shape[1])
    return {'time': time, 'rmst': S.sum(axis=1), 's_tau': S[:, -1], 'risk_1y': 1 - S[:, 365],
            'windows': window_probabilities(S)}


# ---------------------------------------------------------------------------
# Метрики на отложенной выборке с учётом цензурирования
# ---------------------------------------------------------------------------
def test_metrics(curves, time_obs, event_obs, time_train, event_train, ipcw=True):
    """Стандартные метрики моделей выживаемости на отложенной выборке.

    C-index — согласованность порядка пациентов по RMST(τ) с порядком событий. AUC 30 и 365 дней — различение
    умерших от ССЗ к этому дню и проживших дольше по риску 1 − S(t). Brier S(τ) и интегральный Brier score (IBS,
    среднее Brier score по дням 30, 60, …, 1470) — точность самих вероятностей: 0 — идеально, 0,25 — константа 0,5.
    MAE — средняя абсолютная ошибка медианы S(t) относительно min(T, τ) у пациентов, у которых он известен.
    Ошибка калибровки RMST — среднее |прогноз − RMST Каплана — Мейера| по квинтилям прогноза.
    ipcw=True — веса IPCW (обратная вероятность не быть цензурированным), чтобы пациенты, цензурированные раньше,
    корректно входили в оценку всей когорты; ipcw=False — для balanced_dataset.csv, где исход к τ известен у всех."""
    from lifelines import KaplanMeierFitter
    from lifelines.utils import concordance_index, restricted_mean_survival_time
    from sklearn.metrics import roc_auc_score
    km_censoring = KaplanMeierFitter().fit(time_train, 1 - event_train)
    G = (lambda t: np.maximum(km_censoring.survival_function_at_times(t).values, 1e-3)) if ipcw \
        else (lambda t: np.ones(np.size(t)))

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

        def auc(day):
            w = weights_at(day)
            k = w > 0
            return float(roc_auc_score(event_obs[k] & (time_obs[k] <= day), 1 - S[k, day], sample_weight=w[k]))
        out[name] = {
            'c_index': float(concordance_index(time_obs, rmst, event_obs)),
            'auc_30': auc(30), 'auc_365': auc(365),
            'brier_s_tau': float(np.sum(w_tau * ((time_obs >= TAU) - S[:, -1]) ** 2) / len(time_obs)),
            'ibs': float(np.mean(brier)),
            'mae': float(np.sum((w_tau * np.abs(p['time'] - true_tau))[known]) / w_tau[known].sum()),
            'calibration_rmst': float(calibration),
            'mean_s_tau': float(S[:, -1].mean()),
        }
    out['_km_s_tau'] = float(KaplanMeierFitter().fit(time_obs, event_obs).survival_function_at_times(TAU - 1).iloc[0])
    return out


def cmd_export(args):
    from lifelines import KaplanMeierFitter
    full, features, death_any = load_full_dataset(args.xlsx)
    mf = model_features(features)
    df = balanced_subset(full)
    bal_train, cal_train, test_idx = split_cohort(full, df)
    print(f'Обучаем модели ноутбука на df_balanced ({len(bal_train)} пациентов, {len(mf)} признаков при поступлении; '
          f'без {", ".join(POST_DISCHARGE)})...')
    m = train_models(df, mf, bal_train)
    print(f'Калибруем S(t) на всей обучающей когорте ({len(bal_train) + len(cal_train)} пациентов)...')
    calibrators = recalibrate(full, df, mf, bal_train, cal_train, m)

    train_all = bal_train.append(cal_train)
    print(f'Каскад: классификатор смерти от ССЗ ≤ {EARLY_DAYS} дн. и модель Кокса для остальных...')
    ts = train_cascade(full, mf, train_all, m['scaler'])
    print('Модель для популяции balanced_dataset.csv...')
    bm = train_balanced(df, mf, bal_train, m['scaler'])
    staged_idx = staged_training_set(full, bal_train)
    print(f'Многоэтапный конвейер: новый balanced без смертей от ССЗ в первые {STAGED_EARLY_DAYS} дн. — '
          f'{len(staged_idx)} обучающих пациентов из {len(bal_train)}...')
    st = train_staged(full, df, mf, bal_train, bal_train.append(cal_train), m['scaler'])

    # Эталонный прогноз библиотек — для всех пациентов полного датасета
    X_all_sc = m['scaler'].transform(full[mf])
    reference = library_survival(m, calibrators, X_all_sc, mf)
    reference['two'] = library_cascade(ts, X_all_sc, mf)
    reference['bal'], _ = library_balanced(bm, X_all_sc)
    reference['stg'], staged_P, staged_F_late = library_staged(st, full[mf].values.astype(float), X_all_sc, mf)
    staged_cluster = cluster_of(st['clustering'], full[mf].values.astype(float))
    staged_group, staged_time = staged_route(staged_P, st['early_days'], staged_F_late)
    reference_pred = {k: point_prediction(S) for k, S in reference.items()}
    sudden, sudden_horizon, sudden_survived = sudden_unexplained_deaths(full, mf, [p['time'] for p in reference_pred.values()])
    p_death_staged = 1 - staged_P[:, 2]
    unexpected, unexpected_died = unexpected_survivals(full, mf, p_death_staged)
    print(f'Внезапных необъяснимых смертей от ССЗ (≤ {SUDDEN_MAX_DAY} дн., ни одна модель не предсказала): {int(sudden.sum())}; '
          f'неожиданных выживаний (риск по конвейеру ≥ {UNEXPECTED_RISK:.0%}): {int(unexpected.sum())}')

    # Метрики — для каждой популяции на её отложенных пациентах: вся когорта (302, веса IPCW)
    # и balanced_dataset.csv (82 отложенных пациента df_balanced, исход известен у всех)
    def metrics_on(idx, ipcw):
        pos = full.index.get_indexer(idx)
        return test_metrics({k: S[pos] for k, S in reference.items()},
                            full.loc[idx, 'time'].values.astype(float), full.loc[idx, 'target'].values.astype(bool),
                            full.loc[train_all, 'time'].values.astype(float), full.loc[train_all, 'target'].values,
                            ipcw=ipcw)
    bal_test = df.index.intersection(test_idx)
    metrics = {'full': metrics_on(test_idx, True), 'balanced': metrics_on(bal_test, False)}
    km_s_tau = metrics['full'].pop('_km_s_tau')
    metrics['balanced'].pop('_km_s_tau')
    cohort_km = KaplanMeierFitter().fit(full['time'], full['target'])

    # Пациенты — весь med_dataset_cardio.xlsx; balanced_dataset.csv — подмножество его строк
    split = np.full(len(full), SPLIT_TEST)
    split[full.index.isin(bal_train)] = SPLIT_TRAIN
    split[full.index.isin(cal_train)] = SPLIT_CALIBRATION
    bundle = {
        'meta': {'tau': TAU, 'generated': date.today().isoformat(), 'notebook': 'Survival-function-analysys.ipynb',
                 'model_names': MODEL_NAMES, 'window_edges': WINDOW_EDGES, 'early_days': EARLY_DAYS,
                 'plausible': PLAUSIBLE, 'unexpected_risk': UNEXPECTED_RISK,
                 # Каплан — Мейер по всей когорте: средний риск — для сравнения с прогнозом пациента
                 'cohort_risk_1y': float(1 - cohort_km.survival_function_at_times(365).iloc[0]),
                 'cohort_s_tau': float(cohort_km.survival_function_at_times(TAU - 1).iloc[0]),
                 # профиль риска пациента «в среднем по когорте» (Каплан — Мейер) — для сравнения с профилем пациента
                 'cohort_windows': _round(window_probabilities(cohort_km.survival_function_at_times(GRID).values[None, :])[0], 4),
                 'test_size': {'full': len(test_idx), 'balanced': len(bal_test)}, 'test_km_s_tau': km_s_tau,
                 'sudden_max_day': SUDDEN_MAX_DAY, 'sudden_neighbours': SUDDEN_NEIGHBOURS},
        'features': features,
        'model_features': mf,  # признаки моделей — без известных только после выписки
        'columns': full.columns.tolist(),  # порядок столбцов датасетов — для выгрузки изменённого датасета
        'patients': {
            'id': full.index.tolist(),
            'time': full['time'].astype(int).tolist(),
            'target': full['target'].astype(int).tolist(),
            'death_any': death_any.astype(int).tolist(),
            'split': split.tolist(),  # 0 — только калибровка, 1 — обучение моделей и калибровка, 2 — отложенная выборка
            'X': [_round(row, 10) for row in full[features].values],
            # Внезапная необъяснимая смерть: признак, срок сравнения, доля переживших его среди похожих пациентов
            'sudden': sudden.astype(int).tolist(),
            'sudden_horizon': sudden_horizon.tolist(),
            'sudden_survived': _round(sudden_survived, 3),
            # Неожиданное выживание: признак, риск смерти от ССЗ до τ по конвейеру, доля умерших среди похожих
            'unexpected': unexpected.astype(int).tolist(),
            'unexpected_risk': _round(np.where(unexpected, p_death_staged, 0), 3),
            'unexpected_died': _round(unexpected_died, 3),
        },
        'datasets': {
            'balanced': {'file': BALANCED_CSV.name, 'rows': full.index.get_indexer(df.index).tolist()},
            'full': {'file': FULL_XLSX.name, 'rows': None},
        },
        **export_params(df, mf, bal_train, m, calibrators, ts, bm, st),
        'metrics': metrics,
        # Прогноз по самим библиотекам — эталон для проверки JavaScript-расчёта (scripts/check_js_predictor.js)
        'reference_rmst': {k: _round(S.sum(axis=1), 9) for k, S in reference.items()},
        'reference_time': {k: p['time'].tolist() for k, p in reference_pred.items()},
        # Конвейер: вероятности групп и жёсткая маршрутизация (справочно) — для той же проверки
        'reference_staged': {'P': [_round(row, 9) for row in staged_P], 'group': staged_group.tolist(),
                             'time': staged_time.astype(int).tolist(), 'cluster': staged_cluster.tolist()},
    }

    # Проверка: расчёт по экспортированным параметрам совпадает с библиотеками
    predictor = SurvivalTimePredictor(json.loads(json.dumps(bundle)))
    for population, title in [('full', f'вся когорта: {len(test_idx)} отложенных, веса IPCW, S(τ) по Каплану — Мейеру {km_s_tau:.3f}'),
                              ('balanced', f'balanced_dataset.csv: {len(bal_test)} отложенных, исход известен у всех')]:
        print(f'\nОтложенная выборка — {title}')
        print(f'{"модель":<19} {"C-index":>8} {"AUC 30":>7} {"AUC 365":>8} {"Brier τ":>8} {"IBS":>6} {"MAE":>7} '
              f'{"калибр.":>8} {"ср. S(τ)":>9} {"max |ΔRMST|":>12}')
        for name in MODEL_NAMES:
            diff = np.abs(predictor.predict(full[features].values, name)['rmst'] - reference[name].sum(axis=1)).max()
            r = metrics[population][name]
            print(f'{MODEL_NAMES[name]:<19} {r["c_index"]:>8.4f} {r["auc_30"]:>7.3f} {r["auc_365"]:>8.3f} '
                  f'{r["brier_s_tau"]:>8.3f} {r["ibs"]:>6.3f} {r["mae"]:>4.0f} дн {r["calibration_rmst"]:>5.0f} дн '
                  f'{r["mean_s_tau"]:>9.3f} {diff:>12.2e}')
            assert diff < 0.05, f'{name}: расчёт по параметрам расходится с библиотекой'

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(JS_PREFIX + json.dumps(bundle, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'Записано: {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} ({os.path.getsize(out) / 1024:.0f} КБ)')


def sudden_unexplained_deaths(full, model_feature_names, predicted_times):
    """Внезапные необъяснимые смерти (см. SUDDEN_MAX_DAY). Возвращает массивы по пациентам: признак группы,
    срок сравнения (30, 90 или 365 дней) и долю переживших его среди самых похожих пациентов."""
    time = full['time'].values
    event = full['target'].values.astype(bool)
    missed = np.all([t >= TAU for t in predicted_times], axis=0)
    sudden = event & (time <= SUDDEN_MAX_DAY) & missed
    X = full[model_feature_names].values
    Z = (X - X.mean(axis=0)) / X.std(axis=0)
    horizon = np.zeros(len(time), dtype=int)
    survived = np.zeros(len(time))
    for g in np.flatnonzero(sudden):
        h = 30 if time[g] <= 30 else 90 if time[g] <= 90 else 365
        known = np.flatnonzero(((event & (time <= h)) | (time > h)) & (np.arange(len(time)) != g))
        nearest = known[np.argsort(((Z[known] - Z[g]) ** 2).sum(axis=1))[:SUDDEN_NEIGHBOURS]]
        horizon[g] = h
        survived[g] = 1 - (event[nearest] & (time[nearest] <= h)).mean()
    return sudden, horizon, survived


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
        unused = '' if predictor.features[i] in predictor.model_features else ' (моделями не используется: известен после выписки)'
        print(f'  {predictor.features[i]}: {x[i]:g} → {x_edit[i]:g}{unused}')
    names = MODEL_NAMES if args.model == 'all' else {args.model: MODEL_NAMES[args.model]}
    print(f'{"модель":<19} {"прогноз":>9} {"с изм.":>8} {"≤30 дн":>7} {"31–90":>6} {"91–365":>7} {"1–4 года":>9} '
          f'{f"нет до {TAU}":>11} {"RMST(τ)":>8}')
    show = lambda t: f'≥ {TAU}' if t >= TAU else str(int(t))
    for name, title in names.items():
        base = predictor.predict(x, name)
        edit = predictor.predict(x_edit, name)
        w = edit['windows'][0]
        print(f'{title:<19} {show(base["time"][0]):>9} {show(edit["time"][0]):>8} {w[0]:>7.1%} {w[1]:>6.1%} {w[2]:>7.1%} '
              f'{w[3]:>9.1%} {w[4]:>11.1%} {edit["rmst"][0]:>8.0f}')
    if 'stg' in names:
        m = predictor.models['stg']
        _, P, F_late = predictor.staged(x_edit)
        group, route_time = staged_route(P, m['early_death_days'], F_late)
        labels = [f'ранняя смерть ≤ {STAGED_EARLY_DAYS} дн.', f'смерть от ССЗ на {STAGED_EARLY_DAYS + 1}–{TAU - 1}-й день',
                  f'жив дольше {TAU} дн.']
        print(f'Конвейер: {"; ".join(f"{l} {p:.1%}" for l, p in zip(labels, P[0]))}')
        print(f'  наиболее вероятная группа — {labels[group[0]]}; время внутри неё (справочно): {show(route_time[0])} дн.')


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

    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
