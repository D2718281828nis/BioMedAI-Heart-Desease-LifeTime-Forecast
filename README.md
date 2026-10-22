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

[d2718281828nis.github.io/BioMedAI-Heart-Desease-LifeTime-Forecast](https://d2718281828nis.github.io/BioMedAI-Heart-Desease-LifeTime-Forecast/) ([docs/](docs/)) — исследование пациентов из [balanced_dataset.csv](balanced_dataset.csv) (408) или полного [med_dataset_cardio.xlsx](med_dataset_cardio.xlsx) (1506), датасет выбирается на странице:

- карта t-SNE всех пациентов датасета, цвет — `target`; perplexity задаётся на странице, t-SNE считается в браузере;
- пациент выбирается по ID, номеру строки или щелчком по карте и обводится на карте; при наведении на точку видно `time` из датасета;
- любой из 30 признаков пациента можно изменить ползунком или вводом числа: точка перемещается на карте (из исходного положения на новое), а время дожития пересчитывается подходом [Survival-function-analysys.ipynb](Survival-function-analysys.ipynb) — функция выживаемости S(t) и прогноз RMST(τ) = ∫₀^τ S(t) dt, τ = 1500 дней, по любой из пяти моделей ноутбука; изменения привязаны к ID пациента и видны в обоих датасетах;
- интерфейс на русском (по умолчанию) и английском, переключатель RU/EN в шапке; ссылка на английскую версию — [?lang=en](https://d2718281828nis.github.io/BioMedAI-Heart-Desease-LifeTime-Forecast/?lang=en) (тексты — [docs/i18n.js](docs/i18n.js)).

Модели обучены, как в ноутбуке, на `df_balanced` (= balanced_dataset.csv), но переход от оценки риска модели к функции выживаемости S(t) откалиброван на всей обучающей когорте med_dataset_cardio.xlsx с учётом цензурирования. Без этого прогноз сильно занижен: в `df_balanced` нет 1098 пациентов, наблюдение которых закончилось до τ, и смертей в нём 37% вместо 10%, поэтому средний прогноз S(τ) моделей ноутбука 0,63–0,72 при фактических 0,88. После калибровки на 302 отложенных пациентах (82 из `df_balanced` и 220 цензурированных до τ):

| Модель | C-index | Brier S(τ), IPCW | Ошибка калибровки RMST, дн. | Средний прогноз S(τ) (факт 0,882) |
|---|---|---|---|---|
| CoxPH | 0,863 | 0,076 | 46 | 0,877 |
| Weibull AFT | 0,863 | 0,076 | 50 | 0,879 |
| XGBoost Cox | 0,811 | 0,081 | 20 | 0,873 |
| NN Survival | 0,861 | 0,076 | 38 | 0,877 |
| RN Survival | 0,839 | 0,078 | 31 | 0,880 |

Ранжирование пациентов (C-index) у моделей то же, что в ноутбуке; без калибровки ошибка калибровки RMST была 190–290 дней. На странице прогноз сравнивается с фактическим min(T, τ): у пациентов, наблюдение которых закончилось до τ без смерти от ССЗ (живы или умерли от других причин), известна только нижняя граница «≥ time». Точный день ранней смерти по этим признакам не предсказывается: такие пациенты выделяются высоким риском (AUC 0,92 для смерти от ССЗ в первые 100 дней у CoxPH), но даже у них вероятность ранней смерти около 10–15%, поэтому ожидаемое время остаётся большим. Подбор гиперпараметров XGBoost кросс-валидацией C-index не улучшает (0,799 → 0,803), поэтому по умолчанию на странице — CoxPH.

Прогноз времени — [scripts/survival_time_predictor.py](scripts/survival_time_predictor.py): читает med_dataset_cardio.xlsx с предобработкой ноутбука (и проверяет, что `df_balanced` совпадает с balanced_dataset.csv), обучает модели как в ноутбуке, калибрует S(t) на всей обучающей когорте, считает метрики на отложенной выборке и выгружает параметры и оба датасета в `docs/survival_model.js`, по которым страница считает S(t) на JavaScript. Тот же прогноз из командной строки:

```bash
conda run -n biomedai python scripts/survival_time_predictor.py predict --id 1444 --set age=70 llo=1
conda run -n biomedai python scripts/survival_time_predictor.py predict --row 5 --dataset full
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
- В `Survival-function-analysys.ipynb` модели обучаются только на пациентах с известным статусом на τ = 1500 дней (умершие и наблюдавшиеся не меньше 1500 дней): это нужно для проверки на ground truth, но пациенты, цензурированные раньше τ, в обучение не попадают. Из-за этого функции выживаемости в ноутбуке занижены (средний прогноз S(τ) 0,63–0,72 при фактических 0,88); в `scripts/survival_time_predictor.py` и на интерактивной странице это исправлено калибровкой S(t) на всей когорте.
- `target` — смерть от ССЗ; 145 пациентов с `target = 0` умерли от других причин (`result = 1`). Для смерти от ССЗ они цензурированы на дне своей смерти, то есть их `time` — не время жизни без события.

Модели оцениваются на отложенной тестовой выборке из реальных пациентов (`test_idx`); балансировка SMOTE применяется только к обучающей части.

## Лицензия

[MIT](LICENSE)
