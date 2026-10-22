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

## Интерактивная страница

[d2718281828nis.github.io/BioMedAI-Heart-Desease-LifeTime-Forecast](https://d2718281828nis.github.io/BioMedAI-Heart-Desease-LifeTime-Forecast/) — исследование пациентов из [balanced_dataset.csv](balanced_dataset.csv) ([docs/](docs/)):

- карта t-SNE всех 408 пациентов, цвет — `target`; perplexity задаётся на странице, t-SNE считается в браузере;
- пациент выбирается по ID, номеру строки или щелчком по карте и обводится на карте; при наведении на точку видно `time` из датасета;
- любой из 30 признаков пациента можно изменить ползунком или вводом числа: точка перемещается на карте (из исходного положения на новое), а время дожития пересчитывается подходом [Survival-function-analysys.ipynb](Survival-function-analysys.ipynb) — функция выживаемости S(t) и прогноз RMST(τ) = ∫₀^τ S(t) dt, τ = 1500 дней, по любой из пяти моделей ноутбука.

Прогноз времени — [scripts/survival_time_predictor.py](scripts/survival_time_predictor.py): обучает модели как в ноутбуке (то же разбиение, стандартизация и гиперпараметры; C-index и Brier на отложенной выборке совпадают с ноутбуком) и выгружает их параметры в `docs/survival_model.js`, по которым страница считает S(t) на JavaScript. Тот же прогноз из командной строки:

```bash
conda run -n biomedai python scripts/survival_time_predictor.py predict --id 1444 --set age=70 llo=1
```

После изменения данных или моделей пересоберите параметры и проверьте, что JavaScript-расчёт совпадает с lifelines / xgboost / keras:

```bash
conda run -n biomedai python scripts/survival_time_predictor.py export
node scripts/check_js_predictor.js
```

Локальный просмотр: `python -m http.server -d docs` и http://localhost:8000. Публикация: Settings → Pages → Deploy from a branch → `main`, папка `/docs`.

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
