"""Прогноз времени дожития по подходу Survival-function-analysys.ipynb — с перекалибровкой на всей когорте.

Модели — те же, что в ноутбуке (CoxPH, Weibull AFT, XGBoost Cox, полносвязная и резервуарная нейросети),
с тем же разбиением df_balanced (= balanced_dataset.csv), стандартизацией и гиперпараметрами. Для пациента
считается функция выживаемости S(t) на сетке 0..τ−1 и прогноз времени RMST(τ) = ∫₀^τ S(t) dt.

Исправление по сравнению с ноутбуком. df_balanced — это смерти от ССЗ и пациенты, наблюдавшиеся не меньше τ;
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
  python scripts/survival_time_predictor.py predict --row 0 --set age=70 llo=1
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
MODEL_NAMES = {
    'cph': 'CoxPH',
    'aft': 'Weibull AFT',
    'xgb': 'XGBoost Cox',
    'nn': 'NN Survival',
    'rn': 'RN Survival',
}
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
    scores = {k: pd.Series(np.nan, index=train_all) for k in MODEL_NAMES}
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
            for k in MODEL_NAMES}


def library_survival(m, calibrators, X_sc, features):
    """Функции выживаемости S(t) на сетке средствами самих библиотек (lifelines, xgboost, keras), форма (n, τ)."""
    scores = risk_scores(m, X_sc, features)
    return {k: calibrators[k].predict_survival_function(pd.DataFrame({'score': scores[k]}), times=GRID).values.T
            for k in MODEL_NAMES}


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


def export_params(df, features, train_idx, m, calibrators):
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
        },
    }


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

    def survival(self, X_raw, name):
        """S(t) на сетке 0..τ−1 для исходных (нестандартизованных) признаков, форма (n, τ)."""
        X_sc = (np.atleast_2d(np.asarray(X_raw, dtype=float)) - self.mean) / self.scale
        m = self.models[name]
        if name == 'cph':
            return self._cox(m, X_sc)
        if name == 'aft':
            lam = np.exp(X_sc @ np.array(m['lambda_beta']) + m['lambda_intercept'])
            return np.exp(-(GRID[None, :] / lam[:, None]) ** np.exp(m['rho_intercept']))
        return self._cox(m['calibrator'], self.risk_score(X_sc, name))

    def predict(self, X_raw, name):
        """Прогноз времени: RMST(τ) = Σ S(t) по дневной сетке (как в ноутбуке), S(τ), медиана дожития
        и риск смерти от ССЗ в течение года."""
        S = self.survival(X_raw, name)
        below = S <= 0.5
        median = np.where(below.any(axis=1), below.argmax(axis=1), np.nan)
        return {'rmst': S.sum(axis=1), 's_tau': S[:, -1], 'median': median, 'risk_1y': 1 - S[:, 365]}


# ---------------------------------------------------------------------------
# Метрики на отложенной выборке с учётом цензурирования
# ---------------------------------------------------------------------------
def test_metrics(curves, time_obs, event_obs, time_train, event_train):
    """C-index; Brier score прогноза S(τ) с весами IPCW (обратная вероятность не быть цензурированным —
    так в оценку корректно входят пациенты, цензурированные до τ); ошибка калибровки RMST — среднее
    |прогноз − RMST Каплана — Мейера| по квинтилям прогноза; средняя абсолютная ошибка прогноза min(T, τ)
    у пациентов, для которых он известен (веса IPCW)."""
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

    out = {}
    for name, S in curves.items():
        rmst = S.sum(axis=1)
        groups = pd.qcut(pd.Series(rmst).rank(method='first'), 5, labels=False).values
        calibration = np.mean([abs(rmst[groups == g].mean() - restricted_mean_survival_time(
            KaplanMeierFitter().fit(time_obs[groups == g], event_obs[groups == g]), t=TAU)) for g in range(5)])
        out[name] = {
            'c_index': float(concordance_index(time_obs, rmst, event_obs)),
            'brier_s_tau': float(np.sum(weights * ((time_obs >= TAU) - S[:, -1]) ** 2) / len(time_obs)),
            'calibration_rmst': float(calibration),
            'mae_rmst': float(np.sum((weights * np.abs(rmst - true_tau))[known]) / weights[known].sum()),
            'mean_s_tau': float(S[:, -1].mean()),
        }
    out['_km_s_tau'] = float(KaplanMeierFitter().fit(time_obs, event_obs).survival_function_at_times(TAU - 1).iloc[0])
    return out


def cmd_export(args):
    from lifelines import KaplanMeierFitter
    full, features, death_any = load_full_dataset(args.xlsx)
    df = balanced_subset(full)
    bal_train, cal_train, test_idx = split_cohort(full, df)
    print(f'Обучаем модели ноутбука на df_balanced ({len(bal_train)} пациентов)...')
    m = train_models(df, features, bal_train)
    print(f'Калибруем S(t) на всей обучающей когорте ({len(bal_train) + len(cal_train)} пациентов)...')
    calibrators = recalibrate(full, df, features, bal_train, cal_train, m)

    # Эталонный прогноз библиотек — для всех пациентов полного датасета
    reference = library_survival(m, calibrators, m['scaler'].transform(full[features]), features)
    test_pos = full.index.get_indexer(test_idx)
    train_all = bal_train.append(cal_train)
    metrics = test_metrics({k: S[test_pos] for k, S in reference.items()},
                           full.loc[test_idx, 'time'].values.astype(float), full.loc[test_idx, 'target'].values.astype(bool),
                           full.loc[train_all, 'time'].values.astype(float), full.loc[train_all, 'target'].values)
    km_s_tau = metrics.pop('_km_s_tau')
    cohort_km = KaplanMeierFitter().fit(full['time'], full['target'])

    # Пациенты — весь med_dataset_cardio.xlsx; balanced_dataset.csv — подмножество его строк
    split = np.full(len(full), SPLIT_TEST)
    split[full.index.isin(bal_train)] = SPLIT_TRAIN
    split[full.index.isin(cal_train)] = SPLIT_CALIBRATION
    bundle = {
        'meta': {'tau': TAU, 'generated': date.today().isoformat(), 'notebook': 'Survival-function-analysys.ipynb',
                 'model_names': MODEL_NAMES,
                 # Каплан — Мейер по всей когорте: средний риск — для сравнения с прогнозом пациента
                 'cohort_risk_1y': float(1 - cohort_km.survival_function_at_times(365).iloc[0]),
                 'cohort_s_tau': float(cohort_km.survival_function_at_times(TAU - 1).iloc[0]),
                 'test_size': len(test_idx), 'test_km_s_tau': km_s_tau},
        'features': features,
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
        **export_params(df, features, bal_train, m, calibrators),
        'metrics': metrics,
        # RMST(τ) по самим библиотекам — эталон для проверки JavaScript-расчёта (scripts/check_js_predictor.js)
        'reference_rmst': {k: _round(S.sum(axis=1), 9) for k, S in reference.items()},
    }

    # Проверка: расчёт по экспортированным параметрам совпадает с библиотеками
    predictor = SurvivalTimePredictor(json.loads(json.dumps(bundle)))
    print(f'Отложенная выборка: {len(test_idx)} пациентов, S(τ) по Каплану — Мейеру {km_s_tau:.3f}')
    print(f'{"модель":<12} {"C-index":>8} {"Brier IPCW":>11} {"калибр. RMST":>13} {"MAE RMST":>9} '
          f'{"ср. S(τ)":>9} {"max |ΔRMST|":>12}')
    for name in MODEL_NAMES:
        diff = np.abs(predictor.predict(full[features].values, name)['rmst'] - reference[name].sum(axis=1)).max()
        r = metrics[name]
        print(f'{MODEL_NAMES[name]:<12} {r["c_index"]:>8.4f} {r["brier_s_tau"]:>11.3f} {r["calibration_rmst"]:>10.1f} дн '
              f'{r["mae_rmst"]:>6.0f} дн {r["mean_s_tau"]:>9.3f} {diff:>12.2e}')
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
        print(f'  {predictor.features[i]}: {x[i]:g} → {x_edit[i]:g}')
    names = MODEL_NAMES if args.model == 'all' else {args.model: MODEL_NAMES[args.model]}
    print(f'{"модель":<12} {"RMST(τ), дни":>13} {"с изменениями":>14} {"S(τ)":>6} {"риск 1 год":>11} {"медиана":>8}')
    for name, title in names.items():
        base = predictor.predict(x, name)
        edit = predictor.predict(x_edit, name)
        median = edit['median'][0]
        print(f'{title:<12} {base["rmst"][0]:>13.0f} {edit["rmst"][0]:>14.0f} {edit["s_tau"][0]:>6.3f} '
              f'{edit["risk_1y"][0]:>11.1%} {(f"{median:.0f}" if np.isfinite(median) else f"> {TAU}"):>8}')


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
