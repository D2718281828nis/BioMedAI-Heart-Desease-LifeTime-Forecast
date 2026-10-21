# BioMedAI-Heart-Desease-LifeTime-Forecast

Прогноз времени дожития и риска летального исхода у пациентов после острого коронарного синдрома (ОКС) по клиническим, лабораторным данным и данным о лечении. Отдельное направление — оценка влияния льготного лекарственного обеспечения (ЛЛО) после выписки на выживаемость.

## Данные

- [med_dataset_cardio.xlsx](med_dataset_cardio.xlsx) — 1506 пациентов, 36 столбцов.
- [med_dataset_cardio.md](med_dataset_cardio.md) — описание признаков.

Ключевые столбцы:

| Столбец | Смысл |
|---|---|
| `time` | срок наблюдения / время до события, дни (от 1 до 1634) |
| `result` | летальный исход (297 событий, 19,7%) |
| `result_cvd` | смерть от сердечно-сосудистых причин (152 события, 10,1%) |
| `llo` | факт получения ЛЛО после выписки |

## Ноутбуки

Рекомендуемый порядок чтения:

| Ноутбук | Содержание |
|---|---|
| [model_coronary_syndrome_clsf_regression_forecast.ipynb](model_coronary_syndrome_clsf_regression_forecast.ipynb) | Основной ноутбук: разведочный анализ, удаление дублирующих признаков, кластеризация (K-Means, DBSCAN, K-modes, t-SNE), классификация, регрессия `time`, SHAP, модель Кокса |
| [Analyse_LLO_feature_importance.ipynb](Analyse_LLO_feature_importance.ipynb) | Влияние ЛЛО: регрессия `time`, SHAP, взаимодействие ЛЛО × возраст (стратификация, модель Кокса с взаимодействием, PDP), функции выживаемости по возрастным группам |
| [Survival-function-analysys.ipynb](Survival-function-analysys.ipynb) | Сравнение моделей выживаемости: CoxPH, Weibull AFT, XGBoost Cox, полносвязная и резервуарная нейросети; C-index, SHAP |
| [XGboost-predictions-case1_2.ipynb](XGboost-predictions-case1_2.ipynb) | XGBoost-регрессор с подбором гиперпараметров (Optuna), группы риска, клинические кейсы 1 и 2, кривые Каплана — Мейера, PR-кривая |

## Запуск

Каждый ноутбук открывается в Google Colab по бейджу «Open In Colab» в первой ячейке.

- `Analyse_LLO_feature_importance.ipynb` и `Survival-function-analysys.ipynb` загружают данные напрямую из этого репозитория.
- `model_coronary_syndrome_clsf_regression_forecast.ipynb` и `XGboost-predictions-case1_2.ipynb` ожидают файл по пути `/content/med_dataset_cardio.xlsx` — перед запуском загрузите его в Colab.

Для локального запуска создайте отдельное окружение из [environment.yml](environment.yml) и выберите его ядро в Jupyter / VS Code:

```bash
conda env create -f environment.yml
conda run -n biomedai python -m ipykernel install --user --name biomedai --display-name "Python (BioMedAI)"
```

Не устанавливайте TensorFlow через pip в базовое окружение Anaconda: его библиотеки конфликтуют с `pyarrow` из Anaconda, и ядро падает с ошибкой сегментации при `import tensorflow`. В окружении `biomedai` все пакеты взяты из conda-forge и совместимы между собой.

Ячейки нужно выполнять сверху вниз: многие из них используют переменные, определённые выше.

## Известные ограничения

- Регрессия `time` не учитывает цензурирование: для выживших пациентов `time` — это срок наблюдения, а не время до события.
- В `Analyse_LLO_feature_importance.ipynb` стратифицированный анализ по возрасту и модель Кокса с взаимодействием строятся на `df_upsampled`, где есть синтетические объекты SMOTE; статистические выводы стоит пересчитать на реальных пациентах.
- В `Survival-function-analysys.ipynb` модели обучаются только на пациентах с известным статусом на τ = 1500 дней (умершие и наблюдавшиеся не меньше 1500 дней): это нужно для проверки на ground truth, но пациенты, цензурированные раньше τ, в обучение не попадают.

Модели оцениваются на отложенной тестовой выборке из реальных пациентов (`test_idx`); балансировка SMOTE применяется только к обучающей части.

## Лицензия

[MIT](LICENSE)
