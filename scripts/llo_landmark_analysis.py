"""Эффект ЛЛО (llo) и наблюдения кардиологом (doctor) на смерть от ССЗ с поправкой на immortal time bias.

llo и doctor назначаются после выписки: умерший рано их не получает (92% и 100% умерших от ССЗ в первые 30 дней —
без наблюдающего врача и без ЛЛО). Если сравнивать группы с нулевого дня, время до назначения засчитывается
получившим как заведомо прожитое, и эффект завышается. Landmark-анализ: берём пациентов, живых и наблюдаемых
к дню L, и сравниваем выживаемость после L (модель Кокса с поправкой на 28 признаков при поступлении).
L = 0 — наивный анализ, как в ноутбуках. Ограничение: даты начала ЛЛО и наблюдения в датасете нет; предполагается,
что к дню L статус уже определился.

Запуск: python scripts/llo_landmark_analysis.py
"""
import warnings

import numpy as np
import pandas as pd
from lifelines import CoxPHFitter

from survival_time_predictor import load_full_dataset, model_features

warnings.filterwarnings('ignore')
LANDMARKS = [0, 30, 90, 180, 365]


def landmark_hr(full, covariates, exposure_cols, landmark):
    """Отношение рисков смерти от ССЗ после дня landmark для столбцов exposure_cols (с поправкой на covariates)."""
    cohort = full[full['time'] > landmark]
    X = cohort[covariates]
    data = ((X - X.mean()) / X.std()).assign(**{c: cohort[c] for c in exposure_cols},
                                             time=cohort['time'] - landmark, event=cohort['target'])
    cox = CoxPHFitter(penalizer=0.01).fit(data, duration_col='time', event_col='event')
    s = cox.summary
    return [{'exposure': c, 'landmark, days': landmark, 'patients': len(cohort), 'CVD deaths': int(cohort['target'].sum()),
             'exposed, %': round(100 * cohort[c].mean(), 1),
             'HR': s.loc[c, 'exp(coef)'], '95% CI': f"{s.loc[c, 'exp(coef) lower 95%']:.2f}–{s.loc[c, 'exp(coef) upper 95%']:.2f}",
             'p': s.loc[c, 'p']} for c in exposure_cols]


def main():
    full, features, _ = load_full_dataset()
    admission = model_features(features)
    full = full.assign(doctor_cardiologist=(full['doctor'] == 2).astype(int), doctor_therapist=(full['doctor'] == 1).astype(int))
    rows = []
    for landmark in LANDMARKS:
        # ЛЛО — с поправкой на признаки при поступлении и на наблюдающего врача (тоже назначается после выписки)
        rows += landmark_hr(full, admission, ['llo', 'doctor_therapist', 'doctor_cardiologist'], landmark)
    table = pd.DataFrame(rows).sort_values(['exposure', 'landmark, days'])
    pd.set_option('display.width', 200)
    print('Смерть от ССЗ после дня L, модель Кокса с поправкой на 28 признаков при поступлении')
    print('(doctor: терапевт и кардиолог против отсутствия наблюдающего врача; L = 0 — наивный анализ)\n')
    print(table.round({'HR': 2, 'p': 4}).to_string(index=False))


if __name__ == '__main__':
    main()
