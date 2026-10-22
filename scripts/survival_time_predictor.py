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
# Допустимая ошибка прогноза, дни, и порог уверенности P(|ошибка| ≤ TOLERANCE), начиная с которого прогноз надёжен
TOLERANCE = 150
CONFIDENT = 0.9
MODEL_NAMES = {
    'cph': 'CoxPH',
    'aft': 'Weibull AFT',
    'xgb': 'XGBoost Cox',
    'nn': 'NN Survival',
    'rn': 'RN Survival',
    'two': 'Cascade',
}
# Модели ноутбука с калибровкой S(t); 'two' — каскад классификаторов и моделей времени (train_cascade)
SURVIVAL_MODELS = ['cph', 'aft', 'xgb', 'nn', 'rn']

# Каскад: этап 1 — классификатор «смерть от ССЗ в первые EARLY_DAYS дней» (группа ранней смерти, прогноз EARLY_TIME);
# этап 2 — классификатор «смерть от ССЗ между EARLY_DAYS и τ» для остальных (прогноз MID_TIME); этап 3 — модель
# Кокса, обученная на проживших дольше EARLY_DAYS, для всех прочих (медиана её S(t)). Классификаторы отмечают
# заданную долю обучающих пациентов с наибольшей оценкой риска.
# Все настройки выбраны кросс-валидацией только на обучающей выборке. Перебирались: E из {90, 180, 365} дней;
# логистическая регрессия, XGBoost (глубина 1–3, 150–600 деревьев), CatBoost, случайный лес, риск по модели Кокса
# и их ансамбли; 30 исходных признаков или вместе с конструированными (приближённая шкала GRACE, shock index,
# eGFR CKD-EPI, флаги шока, ФВ < 40%, анемии, гипергликемии, лейкоцитоза, возраста ≥ 75); доля отмечаемых 0,5–5%;
# день прогноза ранней смерти 53–175; второй классификатор (доля 1–3%, день 600–1200); также kNN (разные
# масштабирования, NCA, веса важности, координаты t-SNE), SVM, MLP, LDA/QDA, наивный Байес и агломеративная
# кластеризация (ward/average/complete, 5–150 кластеров) как классификатор. Ни один вариант не превзошёл XGBoost.
# Выигрыш ограничен точностью (precision) классификаторов: для смерти в первые 90 дней среди отмеченных умирают
# рано лишь 17–33%, для первого года — около половины у верхних 1–2%. Доля отмечаемых выбрана заново для признаков
# при поступлении (без doctor и llo).
EARLY_DAYS = 365
STAGE1_SHARE = 0.02   # доля пациентов, относимых к группе ранней смерти
EARLY_TIME = 150      # прогноз для неё: окно ±150 дней покрывает смерти с 0-го по 300-й день
MID_SHARE = 0.01      # доля пациентов, относимых к группе смерти между EARLY_DAYS и τ
MID_TIME = 900
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
    """Каскад (см. константы EARLY_DAYS…MID_TIME). Классификаторы обучаются на пациентах с известной меткой
    (цензурированные до горизонта метки не входят); их вероятности калибруются по Платту на оценках вне выборки
    (5 фолдов) — по ним строится смесь распределений для уверенности и функции выживаемости."""
    from lifelines import CoxPHFitter
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold
    from xgboost import XGBClassifier

    def xgb():
        return XGBClassifier(n_estimators=600, learning_rate=0.03, max_depth=1, subsample=0.8, colsample_bynode=0.8,
                             min_child_weight=1, random_state=42, eval_metric='logloss')

    def platt(score_fn, Z, y):
        """Калибровка по Платту на оценках вне выборки: score_fn(Z_train, y_train, Z_val) → оценки."""
        oof = np.zeros(len(y))
        for fold_train, fold_val in StratifiedKFold(5, shuffle=True, random_state=0).split(Z, y):
            oof[fold_val] = score_fn(Z[fold_train], y[fold_train], Z[fold_val])
        model = LogisticRegression(C=1e6).fit(oof[:, None], y)
        return float(model.coef_[0, 0]), float(model.intercept_[0])

    time = full.loc[train_idx, 'time'].values.astype(float)
    event = full.loc[train_idx, 'target'].values.astype(bool)
    Z = scaler.transform(full.loc[train_idx, features])

    # Этап 1: смерть от ССЗ в первые EARLY_DAYS дней
    y1 = np.where(event & (time <= EARLY_DAYS), 1, np.where(time > EARLY_DAYS, 0, -1))
    k1 = y1 >= 0
    stage1 = xgb().fit(Z[k1], y1[k1])
    margin1 = stage1.predict(Z, output_margin=True)
    a1, b1 = platt(lambda Za, ya, Zb: xgb().fit(Za, ya).predict(Zb, output_margin=True), Z[k1], y1[k1])

    # Этап 2: смерть от ССЗ между EARLY_DAYS и τ у проживших дольше EARLY_DAYS — ансамбль XGBoost и логистической
    # регрессии: среднее их маржей, стандартизованных по обучающим пациентам
    y2 = np.where(time <= EARLY_DAYS, -1, np.where(event & (time < TAU), 1, np.where(time >= TAU, 0, -1)))
    k2 = y2 >= 0

    def stage2_fit(Za, ya):
        x, l = xgb().fit(Za, ya), LogisticRegression(C=1.0, max_iter=5000).fit(Za, ya)
        mx, ml = x.predict(Za, output_margin=True), l.decision_function(Za)
        return x, l, (mx.mean(), mx.std(), ml.mean(), ml.std())

    def stage2_score(x, l, norm, Zb):
        return ((x.predict(Zb, output_margin=True) - norm[0]) / norm[1] + (l.decision_function(Zb) - norm[2]) / norm[3]) / 2

    xgb2, lr2, norm2 = stage2_fit(Z[k2], y2[k2])
    score2 = stage2_score(xgb2, lr2, norm2, Z)
    a2, b2 = platt(lambda Za, ya, Zb: stage2_score(*stage2_fit(Za, ya), Zb), Z[k2], y2[k2])

    # Этап 3: модель Кокса на проживших дольше EARLY_DAYS
    late = time > EARLY_DAYS
    late_data = pd.DataFrame(Z[late], columns=features).assign(time=time[late], event=event[late].astype(int))
    late_cox = CoxPHFitter(penalizer=0.1).fit(late_data, duration_col='time', event_col='event')

    return dict(stage1=stage1, platt1=(a1, b1), threshold1=float(np.quantile(margin1, 1 - STAGE1_SHARE)),
                xgb2=xgb2, lr2=lr2, norm2=norm2, platt2=(a2, b2), threshold2=float(np.quantile(score2, 1 - MID_SHARE)),
                early_days=np.sort(time[y1 == 1]).astype(int), late_cox=late_cox, Z_known1=Z[k1], Z_known2=Z[k2])


def cascade_mixture(margin1, score2, params, S_late):
    """Прогноз каскада. Время: EARLY_TIME для группы ранней смерти (маржа этапа 1 ≥ порога), MID_TIME для группы
    этапа 2, иначе медиана S(t) модели Кокса этапа 3. Функция выживаемости — смесь p·S_early + (1 − p)·S_late,
    где p — откалиброванная вероятность ранней смерти, S_early — распределение дней ранней смерти в обучающей
    выборке; по ней считаются уверенность, RMST и риск, как у остальных моделей."""
    (a1, b1), early_days = params['platt1'], np.asarray(params['early_days'])
    p_early = 1 / (1 + np.exp(-(a1 * margin1 + b1)))
    S_early = (early_days[None, :] > GRID[:, None]).mean(axis=1)
    below = S_late <= 0.5
    late_time = np.where(below.any(axis=1), below.argmax(axis=1), TAU)
    time = np.where(margin1 >= params['threshold1'], EARLY_TIME,
                    np.where(score2 >= params['threshold2'], MID_TIME, late_time))
    return p_early[:, None] * S_early[None, :] + (1 - p_early[:, None]) * S_late, time


def library_cascade(cascade, X_sc, features):
    """Прогноз каскада средствами самих библиотек (xgboost, scikit-learn, lifelines): (S(t), время)."""
    S_late = cascade['late_cox'].predict_survival_function(pd.DataFrame(X_sc, columns=features), times=GRID).values.T
    norm = cascade['norm2']
    score2 = ((cascade['xgb2'].predict(X_sc, output_margin=True) - norm[0]) / norm[1]
              + (cascade['lr2'].decision_function(X_sc) - norm[2]) / norm[3]) / 2
    return cascade_mixture(cascade['stage1'].predict(X_sc, output_margin=True), score2, cascade, S_late)


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


def export_params(df, features, train_idx, m, calibrators, ts):
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
        },
    }


def _export_cascade(cascade, features):
    trees1, bias1 = _export_xgb_trees(cascade['stage1'], cascade['Z_known1'])
    trees2, bias2 = _export_xgb_trees(cascade['xgb2'], cascade['Z_known2'])
    norm = cascade['norm2']
    return {'type': 'cascade', 'early_days': EARLY_DAYS, 'early_time': EARLY_TIME, 'mid_time': MID_TIME,
            'stage1': {'trees': trees1, 'bias': float(bias1), 'threshold': cascade['threshold1'],
                       'platt': list(cascade['platt1'])},
            'stage2': {'xgb': {'trees': trees2, 'bias': float(bias2), 'mean': float(norm[0]), 'sd': float(norm[1])},
                       'lr': {'coef': _round(cascade['lr2'].coef_[0], 10), 'intercept': float(cascade['lr2'].intercept_[0]),
                              'mean': float(norm[2]), 'sd': float(norm[3])},
                       'threshold': cascade['threshold2'], 'platt': list(cascade['platt2'])},
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

    def _two_stage(self, X_sc):
        m = self.models['two']
        s1, s2 = m['stage1'], m['stage2']
        margin1 = _xgb_leaf_sum(s1['trees'], X_sc) + s1['bias']
        mx = _xgb_leaf_sum(s2['xgb']['trees'], X_sc) + s2['xgb']['bias']
        ml = X_sc @ np.array(s2['lr']['coef']) + s2['lr']['intercept']
        score2 = ((mx - s2['xgb']['mean']) / s2['xgb']['sd'] + (ml - s2['lr']['mean']) / s2['lr']['sd']) / 2
        params = {'platt1': s1['platt'], 'early_days': m['early_death_days'],
                  'threshold1': s1['threshold'], 'threshold2': s2['threshold']}
        return cascade_mixture(margin1, score2, params, self._cox(m['late'], X_sc))

    def survival(self, X_raw, name):
        """S(t) на сетке 0..τ−1 для исходных (нестандартизованных) признаков, форма (n, τ)."""
        X_sc = self._scale(X_raw)
        m = self.models[name]
        if name == 'two':
            return self._two_stage(X_sc)[0]
        if name == 'cph':
            return self._cox(m, X_sc)
        if name == 'aft':
            lam = np.exp(X_sc @ np.array(m['lambda_beta']) + m['lambda_intercept'])
            return np.exp(-(GRID[None, :] / lam[:, None]) ** np.exp(m['rho_intercept']))
        return self._cox(m['calibrator'], self.risk_score(X_sc, name))

    def predict(self, X_raw, name):
        if name == 'two':
            X_sc = self._scale(X_raw)
            return point_prediction(*self._two_stage(X_sc))
        return point_prediction(self.survival(X_raw, name))


def point_prediction(S, time=None):
    """Прогноз min(T, τ) по функциям выживаемости S (n, τ).

    time — медиана: первый день, когда S(t) ≤ 0,5, или τ, если S(t) > 0,5 на всём горизонте. Медиана минимизирует
    среднюю абсолютную ошибку (у RMST — среднего — она больше: при исходах «рано умер» или «дожил» среднее
    попадает между ними). confidence — вероятность по самой модели, что |min(T, τ) − time| ≤ TOLERANCE:
    S(time − TOLERANCE − 1) − S(time + TOLERANCE), где S(−1) = 1, а за τ S = 0 (масса «дожил до τ» — в точке τ).
    rmst — RMST(τ) = Σ S(t), ожидаемое число дней без смерти от ССЗ (как в ноутбуке).
    Если time задано (двухэтапный алгоритм выбирает время сам), уверенность считается вокруг него."""
    S = np.atleast_2d(S)
    n, tau = S.shape
    if time is None:
        below = S <= 0.5
        time = np.where(below.any(axis=1), below.argmax(axis=1), tau)
    time = np.asarray(time).astype(int)
    padded = np.hstack([np.ones((n, 1)), S, np.zeros((n, 1))])   # padded[k] = S(k − 1); padded[τ + 1] = 0
    lo = np.maximum(time - TOLERANCE, 0)
    hi = np.minimum(time + TOLERANCE, tau)
    rows = np.arange(n)
    confidence = padded[rows, lo] - padded[rows, hi + 1]
    return {'time': time, 'confidence': confidence, 'rmst': S.sum(axis=1), 's_tau': S[:, -1],
            'risk_1y': 1 - S[:, 365]}


# ---------------------------------------------------------------------------
# Метрики на отложенной выборке с учётом цензурирования
# ---------------------------------------------------------------------------
def test_metrics(curves, time_obs, event_obs, time_train, event_train, times=None):
    """C-index; Brier score прогноза S(τ) с весами IPCW (обратная вероятность не быть цензурированным —
    так в оценку корректно входят пациенты, цензурированные до τ); ошибка калибровки RMST — среднее
    |прогноз − RMST Каплана — Мейера| по квинтилям прогноза. Для прогноза времени (медианы) — у пациентов
    с известным min(T, τ), с весами IPCW: средняя абсолютная ошибка, доля прогнозов с ошибкой ≤ TOLERANCE,
    а также доля пациентов с уверенностью ≥ CONFIDENT и фактическая доля ошибок ≤ TOLERANCE среди них.
    times — прогноз времени моделей, которые выбирают его не медианой S(t) (двухэтапный алгоритм)."""
    from lifelines import KaplanMeierFitter
    from lifelines.utils import concordance_index, restricted_mean_survival_time
    km_censoring = KaplanMeierFitter().fit(time_train, 1 - event_train)
    G = lambda t: np.maximum(km_censoring.survival_function_at_times(t).values, 1e-3)
    died = event_obs & (time_obs < TAU)
    weights = np.zeros(len(time_obs))
    weights[died] = 1 / G(time_obs[died] - 1)
    weights[time_obs >= TAU] = 1 / G(TAU)
    known = weights > 0
    true_tau = np.minimum(time_obs, TAU)

    weighted = lambda values, mask: float(np.sum((weights * values)[mask]) / weights[mask].sum())
    out = {}
    for name, S in curves.items():
        p = point_prediction(S, (times or {}).get(name))
        rmst = p['rmst']
        groups = pd.qcut(pd.Series(rmst).rank(method='first'), 5, labels=False).values
        calibration = np.mean([abs(rmst[groups == g].mean() - restricted_mean_survival_time(
            KaplanMeierFitter().fit(time_obs[groups == g], event_obs[groups == g]), t=TAU)) for g in range(5)])
        error = np.abs(p['time'] - true_tau)
        confident = known & (p['confidence'] >= CONFIDENT)
        out[name] = {
            'c_index': float(concordance_index(time_obs, rmst, event_obs)),
            'brier_s_tau': float(np.sum(weights * ((time_obs >= TAU) - S[:, -1]) ** 2) / len(time_obs)),
            'calibration_rmst': float(calibration),
            'mae_rmst': weighted(np.abs(rmst - true_tau), known),
            'mae': weighted(error, known),
            'within_tolerance': weighted(error <= TOLERANCE, known),
            'confident_share': float(np.mean(p['confidence'] >= CONFIDENT)),
            'confident_within_tolerance': weighted(error <= TOLERANCE, confident),
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
    print(f'Каскад: классификаторы смерти от ССЗ ≤ {EARLY_DAYS} дн. и {EARLY_DAYS}–{TAU} дн., модель Кокса...')
    ts = train_cascade(full, mf, train_all, m['scaler'])

    # Эталонный прогноз библиотек — для всех пациентов полного датасета
    X_all_sc = m['scaler'].transform(full[mf])
    reference = library_survival(m, calibrators, X_all_sc, mf)
    reference['two'], two_time = library_cascade(ts, X_all_sc, mf)
    reference_pred = {k: point_prediction(S, two_time if k == 'two' else None) for k, S in reference.items()}
    test_pos = full.index.get_indexer(test_idx)
    metrics = test_metrics({k: S[test_pos] for k, S in reference.items()},
                           full.loc[test_idx, 'time'].values.astype(float), full.loc[test_idx, 'target'].values.astype(bool),
                           full.loc[train_all, 'time'].values.astype(float), full.loc[train_all, 'target'].values,
                           times={'two': two_time[test_pos]})
    km_s_tau = metrics.pop('_km_s_tau')
    cohort_km = KaplanMeierFitter().fit(full['time'], full['target'])

    # Пациенты — весь med_dataset_cardio.xlsx; balanced_dataset.csv — подмножество его строк
    split = np.full(len(full), SPLIT_TEST)
    split[full.index.isin(bal_train)] = SPLIT_TRAIN
    split[full.index.isin(cal_train)] = SPLIT_CALIBRATION
    bundle = {
        'meta': {'tau': TAU, 'generated': date.today().isoformat(), 'notebook': 'Survival-function-analysys.ipynb',
                 'model_names': MODEL_NAMES, 'tolerance': TOLERANCE, 'confident': CONFIDENT,
                 # Каплан — Мейер по всей когорте: средний риск — для сравнения с прогнозом пациента
                 'cohort_risk_1y': float(1 - cohort_km.survival_function_at_times(365).iloc[0]),
                 'cohort_s_tau': float(cohort_km.survival_function_at_times(TAU - 1).iloc[0]),
                 'test_size': len(test_idx), 'test_km_s_tau': km_s_tau},
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
        },
        'datasets': {
            'balanced': {'file': BALANCED_CSV.name, 'rows': full.index.get_indexer(df.index).tolist()},
            'full': {'file': FULL_XLSX.name, 'rows': None},
        },
        **export_params(df, mf, bal_train, m, calibrators, ts),
        'metrics': metrics,
        # Прогноз по самим библиотекам — эталон для проверки JavaScript-расчёта (scripts/check_js_predictor.js)
        'reference_rmst': {k: _round(S.sum(axis=1), 9) for k, S in reference.items()},
        'reference_time': {k: p['time'].tolist() for k, p in reference_pred.items()},
        'reference_confidence': {k: _round(p['confidence'], 6) for k, p in reference_pred.items()},
    }

    # Проверка: расчёт по экспортированным параметрам совпадает с библиотеками
    predictor = SurvivalTimePredictor(json.loads(json.dumps(bundle)))
    print(f'Отложенная выборка: {len(test_idx)} пациентов, S(τ) по Каплану — Мейеру {km_s_tau:.3f}')
    print(f'{"модель":<12} {"C-index":>8} {"Brier":>6} {"калибр.":>8} {"MAE":>7} {"MAE RMST":>9} '
          f'{f"≤{TOLERANCE} дн":>8} {f"P≥{CONFIDENT}":>7} {"из них ≤":>9} {"ср. S(τ)":>9} {"max |ΔRMST|":>12}')
    for name in MODEL_NAMES:
        diff = np.abs(predictor.predict(full[features].values, name)['rmst'] - reference[name].sum(axis=1)).max()
        r = metrics[name]
        print(f'{MODEL_NAMES[name]:<12} {r["c_index"]:>8.4f} {r["brier_s_tau"]:>6.3f} {r["calibration_rmst"]:>5.0f} дн '
              f'{r["mae"]:>4.0f} дн {r["mae_rmst"]:>6.0f} дн {r["within_tolerance"]:>8.1%} {r["confident_share"]:>7.0%} '
              f'{r["confident_within_tolerance"]:>9.1%} {r["mean_s_tau"]:>9.3f} {diff:>12.2e}')
        assert diff < 0.05, f'{name}: расчёт по параметрам расходится с библиотекой'

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(JS_PREFIX + json.dumps(bundle, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'Записано: {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} ({os.path.getsize(out) / 1024:.0f} КБ)')


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
    print(f'{"модель":<12} {"прогноз, дни":>13} {"с изменениями":>14} {f"P(|ош.| ≤ {TOLERANCE})":>16} '
          f'{"RMST(τ)":>8} {"S(τ)":>6} {"риск 1 год":>11}')
    for name, title in names.items():
        base = predictor.predict(x, name)
        edit = predictor.predict(x_edit, name)
        print(f'{title:<12} {base["time"][0]:>13} {edit["time"][0]:>14} {edit["confidence"][0]:>16.1%} '
              f'{edit["rmst"][0]:>8.0f} {edit["s_tau"][0]:>6.3f} {edit["risk_1y"][0]:>11.1%}')


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
