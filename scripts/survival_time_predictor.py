"""Прогноз времени дожития по подходу Survival-function-analysys.ipynb.

Скрипт воспроизводит модели выживаемости из ноутбука (CoxPH, Weibull AFT, XGBoost Cox,
полносвязная и резервуарная нейросети с калибровкой Кокса) на balanced_dataset.csv
с тем же разбиением, стандартизацией и гиперпараметрами, и считает для пациента
функцию выживаемости S(t) на сетке 0..τ−1 и прогноз времени RMST(τ) = ∫₀^τ S(t) dt.

Команды:
  export   обучить модели как в ноутбуке и записать параметры в docs/survival_model.js
           (их использует интерактивная страница docs/index.html — тот же расчёт на JavaScript)
  predict  прогноз времени для пациента из датасета, в том числе с изменёнными признаками

Примеры:
  python scripts/survival_time_predictor.py export
  python scripts/survival_time_predictor.py predict --id 1444
  python scripts/survival_time_predictor.py predict --row 0 --set age=70 llo=1
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
DATASET = ROOT / 'balanced_dataset.csv'
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


# ---------------------------------------------------------------------------
# Данные
# ---------------------------------------------------------------------------
def load_dataset(path=DATASET):
    """balanced_dataset.csv — это df_balanced из ноутбука; первый столбец — индекс пациента в исходном датасете."""
    df = pd.read_csv(path, index_col=0)
    features = [c for c in df.columns if c not in ('time', 'target')]
    return df, features


def split_dataset(df):
    """То же разбиение, что в ноутбуке: 20% отложенная выборка со стратификацией по target."""
    from sklearn.model_selection import train_test_split
    return train_test_split(df.index, test_size=0.2, stratify=df['target'], random_state=37)


# ---------------------------------------------------------------------------
# Обучение моделей — повторяет ячейки ноутбука
# ---------------------------------------------------------------------------
def train_models(df, features, train_idx):
    from lifelines import CoxPHFitter, WeibullAFTFitter
    from sklearn.base import clone
    from sklearn.linear_model import LogisticRegression
    from sklearn.model_selection import StratifiedKFold
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

    # 3. XGBoost Cox + калибратор Кокса по лог-риску вне выборки (out-of-fold)
    y_train_xgb = np.where(event_train, time_train, -time_train)
    xgb_surv = XGBRegressor(objective='survival:cox', eval_metric='cox-nloglik', n_estimators=300,
                            learning_rate=0.03, max_depth=3, subsample=0.8, colsample_bynode=0.8,
                            random_state=42)
    xgb_surv.fit(X_train_sc, y_train_xgb)
    xgb_margin_offset = xgb_surv.predict(X_train_sc, output_margin=True).mean()

    oof_log_risk = np.zeros(len(time_train))
    folds = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    for fold_train, fold_val in folds.split(X_train_sc, event_train):
        fold_model = clone(xgb_surv).fit(X_train_sc[fold_train], y_train_xgb[fold_train])
        fold_offset = fold_model.predict(X_train_sc[fold_train], output_margin=True).mean()
        oof_log_risk[fold_val] = fold_model.predict(X_train_sc[fold_val], output_margin=True) - fold_offset
    cox_calibrator = CoxPHFitter(alpha=0.05).fit(
        pd.DataFrame({'time': time_train, 'event': event_train.astype(int), 'xgb_log_risk': oof_log_risk}),
        duration_col='time', event_col='event')

    # 4. Полносвязная нейросеть (вероятность события) + калибратор Кокса
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
    event_prob_nn_train = nn_model.predict(X_train_sc, verbose=0).flatten()
    cox_calibrator_nn = CoxPHFitter(alpha=0.05).fit(
        pd.DataFrame({'time': time_train, 'event': event_train.astype(int), 'nn_event_probability': event_prob_nn_train}),
        duration_col='time', event_col='event')

    # 5. Резервуарная нейросеть: случайная проекция tanh(X @ W_in) + логистическая регрессия
    np.random.seed(42)
    W_in = np.random.normal(0, 1, (X_train_sc.shape[1], 2000))
    W_in /= np.sqrt(np.sum(W_in ** 2, axis=0, keepdims=True) + 1e-8)
    rn_readout = LogisticRegression(solver='liblinear', random_state=42).fit(np.tanh(X_train_sc @ W_in), event_train)
    event_prob_rn_train = rn_readout.predict_proba(np.tanh(X_train_sc @ W_in))[:, 1]
    cox_calibrator_rn = CoxPHFitter(alpha=0.05).fit(
        pd.DataFrame({'time': time_train, 'event': event_train.astype(int), 'rn_event_probability': event_prob_rn_train}),
        duration_col='time', event_col='event')

    return dict(scaler=scaler, cph=cph, aft=aft, xgb_surv=xgb_surv, xgb_margin_offset=xgb_margin_offset,
                cox_calibrator=cox_calibrator, nn_model=nn_model, cox_calibrator_nn=cox_calibrator_nn,
                W_in=W_in, rn_readout=rn_readout, cox_calibrator_rn=cox_calibrator_rn)


def library_survival(m, X_sc, features):
    """Функции выживаемости S(t) на сетке средствами самих библиотек (lifelines, xgboost, keras), форма (n, τ)."""
    X_df = pd.DataFrame(X_sc, columns=features)
    xgb_log_risk = m['xgb_surv'].predict(X_sc, output_margin=True) - m['xgb_margin_offset']
    curves = {
        'cph': m['cph'].predict_survival_function(X_df, times=GRID),
        'aft': m['aft'].predict_survival_function(X_df, times=GRID),
        'xgb': m['cox_calibrator'].predict_survival_function(
            pd.DataFrame({'xgb_log_risk': xgb_log_risk}), times=GRID),
        'nn': m['cox_calibrator_nn'].predict_survival_function(
            pd.DataFrame({'nn_event_probability': m['nn_model'].predict(X_sc, verbose=0).flatten()}), times=GRID),
        'rn': m['cox_calibrator_rn'].predict_survival_function(
            pd.DataFrame({'rn_event_probability': m['rn_readout'].predict_proba(np.tanh(X_sc @ m['W_in']))[:, 1]}),
            times=GRID),
    }
    return {name: sf.values.T for name, sf in curves.items()}


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
    # Сдвиг: базовый margin (base_score) минус центрирование лог-риска по обучающей выборке, как в xgb_log_risk()
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


def export_params(df, features, train_idx, m):
    X_train_sc = m['scaler'].transform(df.loc[train_idx, features])
    lam = m['aft'].params_.loc['lambda_']
    trees, base_margin = _export_xgb_trees(m['xgb_surv'], X_train_sc)
    nn_weights = m['nn_model'].get_weights()  # W1, b1, W2, b2, W3, b3
    return {
        'scaler': {'mean': _round(m['scaler'].mean_, 12), 'scale': _round(m['scaler'].scale_, 12)},
        'models': {
            'cph': {'type': 'cox', **_export_cox(m['cph'], features)},
            'aft': {'type': 'weibull_aft', 'lambda_intercept': float(lam['Intercept']),
                    'lambda_beta': _round(lam[features].values, 10),
                    'rho_intercept': float(m['aft'].params_.loc['rho_']['Intercept'])},
            'xgb': {'type': 'xgb_cox', 'trees': trees, 'bias': float(base_margin - m['xgb_margin_offset']),
                    'calibrator': _export_cox(m['cox_calibrator'], ['xgb_log_risk'])},
            'nn': {'type': 'mlp',
                   'layers': [{'in': w.shape[0], 'out': w.shape[1], 'W': _f32_b64(w), 'b': _f32_b64(b), 'activation': act}
                              for (w, b), act in zip(zip(nn_weights[::2], nn_weights[1::2]), ['relu', 'relu', 'sigmoid'])],
                   'calibrator': _export_cox(m['cox_calibrator_nn'], ['nn_event_probability'])},
            'rn': {'type': 'reservoir', 'n_features': len(features), 'n_reservoir': m['W_in'].shape[1],
                   'W_in': _f32_b64(m['W_in']), 'coef': _f32_b64(m['rn_readout'].coef_[0]),
                   'intercept': float(m['rn_readout'].intercept_[0]),
                   'calibrator': _export_cox(m['cox_calibrator_rn'], ['rn_event_probability'])},
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
        """Ковариата калибратора Кокса для моделей, откалиброванных через Кокса."""
        if name == 'xgb':
            m = self.models['xgb']
            return (_xgb_leaf_sum(m['trees'], X_sc) + m['bias'])[:, None]
        if name == 'nn':
            h = X_sc
            for W, b, act in self._nn:
                h = h @ W + b
                h = np.maximum(h, 0) if act == 'relu' else 1 / (1 + np.exp(-h))
            return h
        if name == 'rn':
            m = self.models['rn']
            return (1 / (1 + np.exp(-(np.tanh(X_sc @ self._rn_W) @ self._rn_coef + m['intercept']))))[:, None]
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
        """Прогноз времени: RMST(τ) = Σ S(t) по дневной сетке (как в ноутбуке), S(τ) и медиана дожития."""
        S = self.survival(X_raw, name)
        below = S <= 0.5
        median = np.where(below.any(axis=1), below.argmax(axis=1), np.nan)
        return {'rmst': S.sum(axis=1), 's_tau': S[:, -1], 'median': median}


# ---------------------------------------------------------------------------
# Метрики на отложенной выборке (как в разделе «Сравнение методов» ноутбука)
# ---------------------------------------------------------------------------
def test_metrics(curves, time_obs, event_obs):
    from lifelines.utils import concordance_index
    from sklearn.metrics import brier_score_loss
    survived = (time_obs >= TAU).astype(int)
    return {name: {'c_index': float(concordance_index(time_obs, S.sum(axis=1), event_obs)),
                   'brier_s_tau': float(brier_score_loss(survived, S[:, -1]))}
            for name, S in curves.items()}


def cmd_export(args):
    df, features = load_dataset(args.data)
    train_idx, test_idx = split_dataset(df)
    print('Обучаем модели как в Survival-function-analysys.ipynb...')
    m = train_models(df, features, train_idx)

    X_all_sc = m['scaler'].transform(df[features])
    reference = library_survival(m, X_all_sc, features)
    test_pos = df.index.get_indexer(test_idx)
    metrics = test_metrics({k: S[test_pos] for k, S in reference.items()},
                           df.loc[test_idx, 'time'].astype(float).values, df.loc[test_idx, 'target'].astype(bool).values)

    bundle = {
        'meta': {'tau': TAU, 'generated': date.today().isoformat(), 'notebook': 'Survival-function-analysys.ipynb',
                 'dataset': 'balanced_dataset.csv', 'model_names': MODEL_NAMES},
        'features': features,
        'columns': df.columns.tolist(),  # порядок столбцов balanced_dataset.csv — для выгрузки изменённого датасета
        'patients': {
            'id': df.index.tolist(),
            'time': df['time'].astype(int).tolist(),
            'target': df['target'].astype(int).tolist(),
            'test': df.index.isin(test_idx).astype(int).tolist(),
            'X': [[float(v) for v in row] for row in df[features].values],
        },
        **export_params(df, features, train_idx, m),
        'metrics': metrics,
        # RMST(τ) по самим библиотекам — эталон для проверки JavaScript-расчёта (scripts/check_js_predictor.js)
        'reference_rmst': {k: _round(S.sum(axis=1), 9) for k, S in reference.items()},
    }

    # Проверка: расчёт по экспортированным параметрам совпадает с библиотеками
    predictor = SurvivalTimePredictor(json.loads(json.dumps(bundle)))
    print(f'{"модель":<12} {"C-index (тест)":>15} {"Brier S(τ)":>11} {"max |ΔRMST|, дни":>18}')
    for name in MODEL_NAMES:
        diff = np.abs(predictor.predict(df[features].values, name)['rmst'] - reference[name].sum(axis=1)).max()
        print(f'{MODEL_NAMES[name]:<12} {metrics[name]["c_index"]:>15.4f} {metrics[name]["brier_s_tau"]:>11.3f} {diff:>18.2e}')
        assert diff < 0.05, f'{name}: расчёт по параметрам расходится с библиотекой'

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(JS_PREFIX + json.dumps(bundle, ensure_ascii=False, separators=(',', ':')) + ';\n', encoding='utf-8')
    print(f'Записано: {out.relative_to(ROOT) if out.is_relative_to(ROOT) else out} ({os.path.getsize(out) / 1024:.0f} КБ)')


def cmd_predict(args):
    predictor = SurvivalTimePredictor.from_js(args.model_file)
    p = predictor.bundle['patients']
    if args.id is not None:
        if args.id not in p['id']:
            raise SystemExit(f'Пациента с ID {args.id} нет в датасете')
        row = p['id'].index(args.id)
    else:
        row = args.row
    x = np.array(p['X'][row], dtype=float)
    x_edit = x.copy()
    for item in args.set:
        feature, value = item.split('=')
        x_edit[predictor.features.index(feature)] = float(value)

    status = 'смерть от ССЗ' if p['target'][row] else 'жив / цензурирован'
    print(f'Пациент: строка {row}, ID {p["id"][row]}; time = {p["time"][row]} дн. ({status}); '
          f'{"отложенная" if p["test"][row] else "обучающая"} выборка')
    for i in np.flatnonzero(x_edit != x):
        print(f'  {predictor.features[i]}: {x[i]:g} → {x_edit[i]:g}')
    names = MODEL_NAMES if args.model == 'all' else {args.model: MODEL_NAMES[args.model]}
    print(f'{"модель":<12} {"RMST(τ), дни":>13} {"с изменениями":>14} {"S(τ)":>6} {"медиана":>8}')
    for name, title in names.items():
        base = predictor.predict(x, name)
        edit = predictor.predict(x_edit, name)
        median = edit['median'][0]
        print(f'{title:<12} {base["rmst"][0]:>13.0f} {edit["rmst"][0]:>14.0f} {edit["s_tau"][0]:>6.3f} '
              f'{(f"{median:.0f}" if np.isfinite(median) else f"> {TAU}"):>8}')


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest='command', required=True)

    p_export = sub.add_parser('export', help='обучить модели и записать docs/survival_model.js')
    p_export.add_argument('--data', default=DATASET)
    p_export.add_argument('--out', default=MODEL_JS)
    p_export.set_defaults(func=cmd_export)

    p_predict = sub.add_parser('predict', help='прогноз времени для пациента')
    who = p_predict.add_mutually_exclusive_group(required=True)
    who.add_argument('--row', type=int, help='номер строки в balanced_dataset.csv (с 0)')
    who.add_argument('--id', type=int, help='ID пациента — первый столбец balanced_dataset.csv')
    p_predict.add_argument('--set', nargs='*', default=[], metavar='ПРИЗНАК=ЗНАЧЕНИЕ', help='изменённые признаки')
    p_predict.add_argument('--model', default='all', choices=['all', *MODEL_NAMES])
    p_predict.add_argument('--model-file', default=MODEL_JS)
    p_predict.set_defaults(func=cmd_predict)

    args = parser.parse_args()
    args.func(args)


if __name__ == '__main__':
    main()
