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
      'legend.t0': 'No CVD death (target = 0), n = {n}',
      'legend.t1': 'CVD death (target = 1), n = {n}',
      'legend.selected': 'Selected',
      'sudden.legend': 'Sudden unexplained CVD death, n = {n}',
      'sudden.label': 'Sudden unexplained CVD death',
      'sudden.highlight': 'highlight ◆',
      'sudden.title': 'Hidden pattern: sudden unexplained CVD death',
      'sudden.note': 'CVD death on day {d} at a low predicted risk: the median risk of CVD death within {horizon} across the eight models is {risk}, {ratio}; the highest is {top} ({topModel}). Among the {k} patients most similar at admission, {share} survived {horizon}: the admission data do not explain this death.',
      'sudden.short': 'risk within {horizon} {risk} (median of the models); {share} of the {k} most similar patients survived this period',
      'sudden.h30': 'the first month',
      'sudden.h90': 'the first three months',
      'sudden.h180': 'the first six months',
      'sudden.h270': 'the first nine months',
      'sudden.h365': 'the first year',
      'unexpected.legend': 'Unexpected survival, n = {n}',
      'unexpected.label': 'Unexpected survival',
      'unexpected.title': 'Unexpected survival: high predicted risk, no CVD death',
      'unexpected.note': 'No CVD death during {time} days of follow-up, although the Staged pipeline, the default model for balanced_dataset.csv, estimated a risk of CVD death before day {tau} of {risk} (median of the eight models {consensus}). Among the {k} patients most similar at admission with a known outcome by τ, {died} died of CVD before day {tau}. If this share is much lower than the predicted risk, the model overestimates the risk for this profile; if it is high too, survival is not explained by the admission data (treatment and adherence after discharge are not in the data). It may also be a data-entry error: check the flagged parameters.',
      'unexpected.short': 'predicted risk {risk}; {died} of the {k} most similar patients died',
      'legend.edited': 'Edited: dataset position → new position',
      'status.initial': 'Computing t-SNE…',
      'status.affinities': 'Computing t-SNE: pairwise similarities of {n} patients…',
      'status.running': 'Computing t-SNE: iteration {i} / 1000 · perplexity {p}',
      'status.done': 't-SNE · perplexity {p} · KL divergence {kl} · edited patients: {n}',
      'tt.title': 'ID {id} · row {row}',
      'tt.heldOut': ' · held-out',
      'tt.time': 'time (dataset)',
      'tt.real': 'real min(T, τ)',
      'tt.outcome': 'outcome, target = {t}',
      'tt.pred': 'predicted time, {model}',
      'tt.predEdit': 'predicted with your edits',
      'tt.risk1y': 'CVD death risk within 1 year',

      'pred.title': 'Predicted time',
      'pred.sub': 'patient ID {id} · {model}',
      'hero.edited': 'With your edits · {model}',
      'hero.dataset': 'Dataset values · {model}',
      'hero.horizon': 'No date is predicted: the model names a day of death (the median of S(t)) only when the probability of CVD death by day {tau} exceeds 50%. The model\'s accuracy is in the risks by time point below.',
      'hero.sub': 'The date is the median of S(t): the day by which the probability of CVD death reaches 50%.',
      'hero.fact': 'Real min(T, τ): {v}.',
      'hero.factCensored': 'Real: ≥ {v} (followed {v} days without CVD death).',
      'hero.factOther': 'Real: ≥ {v} (died of other causes on day {v}, CVD death not observed).',
      'hero.unlikely': 'CVD death by day {tau} is unlikely · {model}',
      'hero.unlikelyEdited': 'With your edits: CVD death by day {tau} is unlikely · {model}',
      'hero.riskUnit': 'risk by day {tau}',
      'hero.delta': ' vs dataset values ({v} days)',
      'hero.deltaRisk': ' vs dataset values ({v})',
      'hero.hint': 'Edit a parameter to re-predict.',
      'unit.days': 'days',
      'unit.pp': 'pp',
      'days': '{n} days',
      'days.short': '{n} d',
      'fact.time': 'time in dataset',
      'fact.outcome': '{outcome} · target = {t}',
      'fact.alive': 'P(no CVD death by τ)',
      'fact.aliveNote': 'S(τ), τ = {tau} days',
      'fact.rmst': 'Expected days without CVD death',
      'fact.rmstNote': 'RMST(τ), the area under S(t)',
      'fact.balStage': 'P(CVD death before day {tau})',
      'fact.balNote': 'logistic regression: balanced_dataset.csv plus partial labels of censored patients',
      'fact.cascadeStage': 'Cascade: P(CVD death ≤ {days} d)',
      'fact.cascadeNote': 'stage-1 classifier; the weight of early death in S(t)',
      'fact.stgGroup': 'Classifier: most likely group',
      'stg.early': 'CVD death within {days} days',
      'stg.late': 'CVD death on days {next}–{last}',
      'stg.survive': 'alive after day {tau}',
      'fact.stgCluster': 'Whole-cohort cluster',
      'fact.stgClusterTypical': 'typical patients, close to the cohort average',
      'fact.stgClusterNote': 'cluster {c} of {k} (agglomerative clustering of all patients at admission); CVD deaths within {days} days: {early} of {n} training patients',
      'fact.stgRoute': 'Time within this group',
      'fact.stgRouteNote': 'for reference: the prediction above is the median of S(t), which weighs all three groups by their probabilities',
      'fact.datasetValue': 'dataset values: {v}',
      'profile.title': 'Risk of CVD death by time point (bar: this patient, tick: cohort average; scale 0–{scale})',
      'profile.group': 'Risk group by the 12-month prediction:',
      'profile.h30': 'Within 1 month',
      'profile.h90': 'Within 3 months',
      'profile.h180': 'Within 6 months',
      'profile.h270': 'Within 9 months',
      'profile.h365': 'Within 12 months',
      'profile.death': 'CVD death on day {d}. Risk of CVD death {h} from the dataset values: {p}, {ratio}.',
      'profile.deathLate': 'CVD death on day {d}, after 12 months. Risk of CVD death within 12 months from the dataset values: {p}.',
      'profile.survived': 'No CVD death in the first 12 months (followed {d} days); 12-month risk from the dataset values: {p}.',
      'ratio.up': '{r}× the cohort average ({v})',
      'ratio.same': 'about the cohort average ({v})',
      'ratio.down': 'below the cohort average ({v})',
      'riskgroup.0': 'low (< 3%)',
      'riskgroup.1': 'moderate (3–10%)',
      'riskgroup.2': 'high (10–25%)',
      'riskgroup.3': 'very high (≥ 25%)',
      'horizon.30': '1 mo',
      'horizon.90': '3 mo',
      'horizon.180': '6 mo',
      'horizon.270': '9 mo',
      'horizon.365': '12 mo',
      'profile.cohort': 'cohort average',
      'profile.dataset': 'dataset values: {v}',
      'quality.title': 'Possible data-entry error',
      'quality.note': 'Outside the physiologically plausible range: {list}. The prediction uses the value as entered; correct it in the editor to see how the prediction changes.',
      'quality.item': '{label} = {v} {unit} (plausible {lo}–{hi})',
      'chart.aria': 'Survival function of patient ID {id}. Use the arrow keys to read values.',
      'chart.y': 'S(t), probability of no CVD death',
      'chart.x': 'days',
      'chart.deathBefore': 'CVD death on day {d} (dataset)',
      'chart.censoredBefore': 'alive, follow-up ended on day {d} (dataset)',
      'chart.otherBefore': 'died of other causes on day {d} (dataset)',
      'chart.deathAfter': 'CVD death on day {d}, after τ (dataset)',
      'chart.aliveAfter': 'no CVD death by τ, followed {d} days (dataset)',
      'chart.day': 'Day {d}',
      'chart.sBase': 'S(t), dataset values',
      'chart.sEdit': 'S(t), with edits',
      'chart.legendBase': 'dataset values',
      'chart.legendEdit': 'with your edits',
      'chart.note': 'Survival function S(t) of the selected patient. The predicted time is its median, the day S(t) falls to 0.5 (beyond τ if it stays above 0.5); the shaded area is RMST(τ) = ∫₀<sup>τ</sup> S(t) dt. A survival model predicts the distribution of the time of death, not a date: see the risks by time point above.',
      'models.aria': 'Predicted time of the selected patient by every model',
      'models.model': 'Model',
      'models.horizon': 'Time point for AUC and predicted / observed:',
      'models.cindex': 'C‑index',
      'models.auc': 'AUC',
      'models.eo': 'Predicted / observed',
      'models.ibs': 'IBS',
      'models.base': 'Time, dataset values',
      'models.edit': 'Time, edited',
      'models.note': 'Held-out patients of the whole cohort ({n}, IPCW weights for censoring), {model}, {h}: AUC {auc}, how well the risk separates patients who die of CVD by this time point from the rest (0.5 random, 1 perfect); predicted / observed {eo}, the ratio of expected to observed deaths (1 is exact); C-index {c}, ranking by risk; IBS {ibs}, accuracy of the whole S(t) over 0–τ. Held-out patients have {deaths} CVD deaths by this time point',
      'models.few': ', so the estimate is unstable; the risk groups below are more reliable.',
      'calib.title': 'How accurate the risks are: predicted / observed by risk group · {model}',
      'calib.group': 'Risk group (12 mo)',
      'calib.n': 'Patients',
      'calib.note': 'Out-of-sample predictions: cross-validation on {n} training patients ({folds} folds), each patient predicted by a model trained without them. Each cell shows the mean predicted risk of CVD death by the time point / the Kaplan–Meier estimate; the selected patient\'s group and the selected time point are highlighted. CVD deaths: {d1} within 1 month, {d12} within 12 months. Out of sample, {h}: AUC {auc}, predicted / observed {eo}.',

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
      'patient.calib': 'training patient (censored before τ)',
      'patient.edited': 'edited parameters: {n}',
      'mini.time': 'time in dataset ',
      'mini.pred': 'predicted ({model}) ',
      'outcome.cvd': 'CVD death',
      'outcome.other': 'Died of other causes',
      'outcome.alive': 'Alive at end of follow-up',
      'param.slider': '{label}, slider',
      'param.reset': 'Reset {label} to the dataset value',
      'param.resetTitle': 'Reset to the dataset value',
      'param.dataset': 'dataset',
      'param.datasetValue': 'dataset: {v}',
      'param.notUsed': 'not used by the models: known only after discharge',
      'param.implausible': 'implausible: expected {lo}–{hi}',
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
      'table.real': 'Real min(T, τ)',
      'table.pred': 'Predicted, days',
      'table.risk': 'Risk within 12 mo',
      'table.group': 'Risk group',
      'table.edit': 'With edits, days',

      'method.title': 'How it works',
      'method.list': `
        <li><b>Predicted time.</b> As in <i>Survival-function-analysys.ipynb</i>, a model gives the patient's survival function S(t), the probability of no CVD death by day t. The exact day of death cannot be determined from the admission data: a date (the median of S(t), the day by which the probability of CVD death reaches 50%) before τ = 1500 days means a risk of CVD death before τ above 50%, and only 1–3% of patients have such a risk. So the date is shown only for them; for everyone else the page says "CVD death by day 1500 is unlikely" and shows the risk by τ. The main content of the card is the risk of CVD death by 1, 3, 6, 9 and 12 months next to the cohort average, the risk group by the 12-month prediction and, for dataset patients, their outcome next to the risk the model gave. For the 82 held-out patients with a known outcome the date error is 0 for survivors and about 1300 days for those who died within the first year (72% of the total error): that is how a point prediction behaves at a moderate risk, not a calculation error, so the date error is not shown on the page.</li>
        <li><b>Models</b> (CoxPH, Weibull AFT, XGBoost Cox, NN and reservoir network) are trained as in the notebook on <code>balanced_dataset.csv</code>: the same 326 training patients (stratified split, <code>random_state=37</code>), <code>StandardScaler</code> and hyperparameters, but only on the 28 parameters known at admission. <code>doctor</code> (follow-up physician) and <code>llo</code> (subsidized drugs) are assigned after discharge: patients who die early do not get them (92% and 100% of CVD deaths within 30 days), so they partly carry the outcome (immortal time bias). They are shown in the editor but do not affect predictions.</li>
        <li><b>Calibration on the whole cohort.</b> Patients were enrolled over about two years and the study ended on the same day for everyone, so 1098 patients were followed for less than τ: 954 late enrollees still alive and 144 who died of other causes. <code>balanced_dataset.csv</code> selects patients by outcome, not by enrollment date: late enrollees who died of CVD stay in it (about 115 of the 152 deaths), late enrollees who survived do not. That is why 37% of it are CVD deaths, against 11% in the whole cohort by τ. This is visible without any assumption about censoring: no living patient leaves follow-up before day 889, and 5.8% of all patients died of CVD within the first year, against 21.6% in <code>balanced_dataset.csv</code>. Survival estimated on it is far too low: mean predicted S(τ) 0.63–0.72 against 0.88. Therefore the mapping from a model's risk score s to S(t) is refitted on all 1204 training patients with censoring taken into account; it is a CoxPH model on the risk score and its square: S(t | s) = S₀(t)<sup>exp(b₁·s + b₂·(s − s̄)²)</sup>, where s̄ is the mean score (for XGBoost Cox, on s only). For the 326 patients the models are trained on, the risk scores are out-of-fold (5 folds); for the neural networks the score is the logit. The score is capped at the vertex of the parabola, so the ranking of patients does not change, and the quadratic term makes the probabilities more accurate: in cross-validation the Brier score of S(τ) is lower than with the linear calibrator S₀(t)<sup>exp(c·s)</sup> in every split, and the RMST calibration error of CoxPH is 11 days instead of 17. Mean predicted S(τ) is 0.876–0.879 against 0.882 observed, and the calibration error of RMST over risk quintiles on held-out patients is 31–37 days.</li>
        <li><b>Accuracy</b> is measured by the risks at 1, 3, 6, 9 and 12 months. On the 302 held-out patients of the whole cohort (82 of them from <code>balanced_dataset.csv</code>; the same for both datasets, with IPCW weights for censoring) the model table shows, for the time point selected above it, AUC (how well the risk separates patients who die of CVD by the time point from the rest), predicted / observed (the ratio of expected to observed deaths), C-index and the integrated Brier score. Only 7 held-out patients died of CVD within 1 month and 16 within 12 months, so the risk groups (the table below the models) use out-of-sample predictions on the 1204 training patients (5-fold cross-validation; 30 and 72 deaths). For the Staged pipeline the out-of-sample AUC is 0.79–0.80 at every time point and predicted / observed 0.97–1.01; within 12 months 1.5% of the "low" group (43% of patients) died of CVD, 5.2% of "moderate", 18.8% of "high" and 41.4% of "very high", against predicted 1.9%, 5.4%, 16.0% and 34.7%. A high-risk group can be recognised, the day of death cannot.</li>
        <li><b>Balanced mixture and Staged pipeline: partial labels.</b> These models learn "CVD death before τ", an outcome that is unknown for patients censored before τ. Early and late enrollees also differ at admission (AUC 0.70: early enrollees have higher cholesterol, LDL and ejection fraction and fewer myocardial infarctions), so time-only IPCW weights are not enough: mean predicted S(τ) stays at 0.80–0.82. Censored patients enter training with partial labels. CVD deaths (late enrollees included) and patients who survived τ enter with weight 1: their outcome is known. A patient alive on the day C their follow-up ended enters as a survivor with weight q and as a CVD death before τ with weight 1 − q, where q is the share of survivors to τ among the 50 most similar patients with a known outcome who were also alive on day C. A patient similar to survivors gets q close to 1; one similar to those who died gets a much lower weight. In cross-validation on the 1204 training patients this beats both IPCW weights and the previous training on <code>balanced_dataset.csv</code> alone: C-index 0.782–0.786 against 0.758–0.768, IBS 0.062 against 0.064–0.108, RMST calibration error 32–34 days against 64–274. "Balanced mixture": a logistic regression of CVD death before τ gives the probability p, and S(t) = 1 − p·F(t), where F(t) is the share of CVD deaths before τ that occurred by day t (IPCW-weighted). "Staged pipeline" (below) is the default for <code>balanced_dataset.csv</code>, CoxPH for the whole cohort.</li>
        <li><b>Staged pipeline</b> (model "Staged pipeline"). (1) The whole cohort; (2) CVD deaths within the first 10 days are excluded; (3) the notebook's rule (CVD death or follow-up ≥ τ) gives a new balanced dataset without early deaths, 312 of the 326 training patients, to which the 878 patients censored before τ are added with partial labels. Classification in three groups: stage 1 — CVD death within 10 days or not (1199 training patients: the status on day 10 is known for almost all); stage 2 — CVD death before τ or life beyond 1500 days (logistic regression on the new balanced dataset and the partial labels). (4) A CoxPH model on all training patients who survived 10 days gives the timing of later deaths. (5) S(t) = 1 − P<sub>early</sub>·F<sub>early</sub>(t) − P<sub>late</sub>·F<sub>late</sub>(t | x), where F<sub>early</sub> is the distribution of early death days and F<sub>late</sub> the CoxPH time of death given death before τ. The predicted time is the median of this S(t): the classifier's probabilities set the time of each patient. <b>Clustering of the whole cohort for stage 1.</b> Agglomerative clustering of all 1506 patients by the 28 parameters at admission (no outcomes; complete linkage, 8 clusters; a patient belongs to the nearest cluster centre) finds clinical phenotypes: "anemia, no stenting, chronic kidney disease" and "hyperglycemia, diabetes, leukocytosis" contain 10 of the 17 CVD deaths within 10 days, the main cluster of 945 typical patients only 2. Stage 1 is a logistic regression on the parameters and the cluster membership; the card shows the patient's cluster. In cross-validation (5 splits × 5 folds) the clusters lowered the log-loss of stage 1 in 23 of 25 folds and raised its AUC from 0.794 to 0.808 (ward, average and complete linkage, 4–64 clusters, membership or the cluster's early-death rate as a feature were compared earlier; the rate was rejected: with 14 early deaths in 16 clusters it gave a negative coefficient). Only 14 training patients died within 10 days and the highest probability of death within 10 days is 18%, so the early-death group is never the most likely one. Taking only the most likely group and the time within it (shown in the card for reference) predicts "beyond the horizon" for almost everyone, and a patient whose group probability is 45–50% ends up in another group half of the time; so the prediction is the median of S(t). The highest risk of CVD death within 30 days is 30%, and the RMST calibration error on held-out patients is 31 days.</li>
        <li><b>Methodological review: why the "error ≤ 150 days" criterion was removed.</b> Earlier versions compared models by the share of patients with |predicted − real| ≤ 150 days and predicted fixed days: 150 days for patients marked by a classifier ("Balanced two-stage" at P(CVD death before τ) ≥ 0.6; the cascade for the top 2% of an early-death score), 900 days for the next 1%, 1500 days for everyone else. That was a methodological error. (1) 150 days was not an estimate of the time of death but the centre of the window 0–300 days, chosen because it maximizes hits of the criterion; early death times are strongly skewed (of the 151 CVD deaths before τ in <code>balanced_dataset.csv</code>, 37 occur within 30 days and 81 within 300). (2) A threshold turns a probability into a date: a patient with a 60% risk got "150 days", although by the model's own estimate they survive with probability 40%, and then the error is 1350 days. Of the 23 held-out patients marked this way, 14 died within 300 days, 6 later and 3 survived τ (IDs 347, 1085, 1499); IDs 63, 67 and 276 are the same cases among training patients. (3) The criterion is not a proper scoring rule and is dominated by survivors: predicting 1500 days for everyone already gives 62.2% on the 82 held-out patients, against 75.6% for the tuned rule. (4) Thresholds, days and classifiers were chosen by this same criterion, and the held-out patients were looked at after every change, so their estimate is optimistic. Now the prediction is the median of S(t), every model gives the risks of CVD death by 1, 3, 6, 9 and 12 months, and models are compared by time-dependent AUC, predicted / observed, C-index and IBS. No model can honestly name an early date: the highest probability of CVD death within 30 days among all 1506 patients is 0.13–0.33 for all eight models, and for CoxPH, Weibull AFT, NN Survival, RN Survival and Balanced mixture no patient has a window within the first year as the most likely outcome.</li>
        <li><b>Sudden unexplained CVD deaths</b> (orange ◆ on the map): CVD deaths within the first year at a low predicted risk. The median risk of the eight models by the nearest time point (1, 3, 6, 9 or 12 months) is below twice the cohort average, and at least 90% of the 50 patients most similar at admission (28 parameters, standardized) survived that period: 39 of the 88 such deaths in <code>balanced_dataset.csv</code>; the share of similar patients who survived is 90–100%, 97.7% on average. The median of the models rather than "no model": the previous rule ("all models predict a date beyond τ") did not flag, for example, ID 202 (death on day 2), because XGBoost Cox gave a date of day 1032, a death "some time before τ" rather than within the first month. XGBoost gives ID 202 a 1-month risk of 15.6% because of extreme leukocytosis (25.1·10⁹/L) and bradycardia (heart rate 35; linear models treat a low heart rate as protective), the other models 2.1–5.0% (median of the eight models 4.0% against the cohort average of 2.5%), and all 50 most similar patients survived the first month. These points lie among survivors on the map, not in a separate cluster.</li>
        <li><b>Unexpected survival</b> (blue ◆): patients without CVD death by τ for whom the Staged pipeline estimated a risk of CVD death before τ of 50% or more, so survival was less likely than death: 2 of the 257 such patients. The "very high" group is not a suitable threshold: with a 12-month risk of 25% or more (34% on average), 60% of patients survive the year, so survival is expected for them. ID 1234 (risk 61%, median of the eight models 20%; age 87, chronic kidney disease, 3 affected arteries without stenting): 42% of the 50 most similar patients with a known outcome died, so the model overestimates the risk for this profile. ID 67 (risk 65%, median of the models 34%): 60% of similar patients died, but the largest contribution to the risk comes from hemoglobin 34 g/L, an implausible value and probably an entry error: with 134 g/L the risk falls to 43%. The previous version of the pipeline, trained on <code>balanced_dataset.csv</code> alone, flagged 25 patients: for example, IDs 63 and 276 had a risk of 53%, now 17% and 15%, while 18% of similar patients died. Values outside physiologically plausible ranges are flagged in the editor and under the prediction.</li>
        <li><b>Cascade</b> (model "Cascade"): an XGBoost classifier of CVD death within 365 days with Platt calibration gives the probability p; a CoxPH model trained on patients who lived longer than 365 days gives S<sub>late</sub>(t); S(t) = p·S<sub>early</sub>(t) + (1 − p)·S<sub>late</sub>(t), where S<sub>early</sub> is the distribution of early death days in the training data. Earlier versions gave marked patients fixed days (150 or 900); this was removed (see the methodological review). The classifier was chosen by cross-validation on training patients only among logistic regression, XGBoost, CatBoost, random forest, a Cox risk score, kNN (several scalings, a learned NCA metric, importance weights, t-SNE coordinates), agglomerative clustering, SVM, MLP, LDA/QDA, naive Bayes and ensembles, with and without engineered features (approximate GRACE score, shock index, eGFR CKD-EPI, clinical flags). None of them separated early deaths better: even among the top 1–2% of scores only 17–33% die within 90 days. The strongest single factor was <code>doctor</code>, which is known only after discharge (see Models). The cascade ranks patients worse than CoxPH (C-index 0.79 against 0.84) and is kept for comparison.</li>
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
      'legend.t0': 'Нет смерти от ССЗ (target = 0), n = {n}',
      'legend.t1': 'Смерть от ССЗ (target = 1), n = {n}',
      'legend.selected': 'Выбранный пациент',
      'sudden.legend': 'Внезапная необъяснимая смерть от ССЗ, n = {n}',
      'sudden.label': 'Внезапная необъяснимая смерть от ССЗ',
      'sudden.highlight': 'выделить ◆',
      'sudden.title': 'Скрытая закономерность: внезапная необъяснимая смерть от ССЗ',
      'sudden.note': 'Смерть от ССЗ на {d}-й день при невысоком прогнозном риске: медиана риска смерти от ССЗ за {horizon} по восьми моделям — {risk}, {ratio}; наибольший — {top} ({topModel}). Среди {k} самых похожих при поступлении пациентов {share} пережили {horizon}: данные при поступлении эту смерть не объясняют.',
      'sudden.short': 'риск за {horizon} — {risk} (медиана моделей); {share} из {k} похожих пережили этот срок',
      'sudden.h30': 'первый месяц',
      'sudden.h90': 'первые три месяца',
      'sudden.h180': 'первые полгода',
      'sudden.h270': 'первые девять месяцев',
      'sudden.h365': 'первый год',
      'unexpected.legend': 'Неожиданное выживание, n = {n}',
      'unexpected.label': 'Неожиданное выживание',
      'unexpected.title': 'Неожиданное выживание: высокий прогнозный риск, но смерти от ССЗ нет',
      'unexpected.note': 'Смерти от ССЗ нет за {time} дн. наблюдения, хотя многоэтапный конвейер — модель по умолчанию для balanced_dataset.csv — оценил риск смерти от ССЗ до {tau}-го дня в {risk} (медиана восьми моделей — {consensus}). Среди {k} самых похожих при поступлении пациентов с известным к τ исходом от ССЗ до {tau}-го дня умерли {died}. Если эта доля намного ниже прогнозного риска, модель переоценивает риск для такого профиля; если она тоже высока, выживание не объясняется данными при поступлении (лечения и приверженности к нему после выписки в данных нет). Возможна и ошибка ввода: проверьте отмеченные признаки.',
      'unexpected.short': 'прогнозный риск {risk}; из {k} самых похожих умерли {died}',
      'legend.edited': 'Изменён: положение по датасету → новое',
      'status.initial': 'Расчёт t-SNE…',
      'status.affinities': 'Расчёт t-SNE: попарные сходства {n} пациентов…',
      'status.running': 'Расчёт t-SNE: итерация {i} / 1000 · perplexity {p}',
      'status.done': 't-SNE · perplexity {p} · KL-дивергенция {kl} · изменённых пациентов: {n}',
      'tt.title': 'ID {id} · строка {row}',
      'tt.heldOut': ' · тестовая выборка',
      'tt.time': 'time (датасет)',
      'tt.real': 'факт min(T, τ)',
      'tt.outcome': 'исход, target = {t}',
      'tt.pred': 'прогноз времени, {model}',
      'tt.predEdit': 'прогноз с вашими изменениями',
      'tt.risk1y': 'риск смерти от ССЗ за 1 год',

      'pred.title': 'Прогноз времени',
      'pred.sub': 'пациент ID {id} · {model}',
      'hero.edited': 'С вашими изменениями · {model}',
      'hero.dataset': 'Значения из датасета · {model}',
      'hero.horizon': 'Дата не прогнозируется: день смерти (медиану S(t)) модель называет, только когда вероятность смерти от ССЗ до {tau}-го дня выше 50%. Точность модели — в рисках к срокам ниже.',
      'hero.sub': 'Дата — медиана S(t): день, к которому вероятность смерти от ССЗ достигает 50%.',
      'hero.fact': 'Факт min(T, τ): {v}.',
      'hero.factCensored': 'Факт: ≥ {v} (наблюдался {v} дн. без смерти от ССЗ).',
      'hero.factOther': 'Факт: ≥ {v} (умер от других причин на {v}-й день, смерть от ССЗ не наблюдается).',
      'hero.unlikely': 'Смерть от ССЗ до {tau}-го дня маловероятна · {model}',
      'hero.unlikelyEdited': 'С вашими изменениями: смерть от ССЗ до {tau}-го дня маловероятна · {model}',
      'hero.riskUnit': 'риск до {tau}-го дня',
      'hero.delta': ' относительно значений датасета ({v} дн.)',
      'hero.deltaRisk': ' относительно значений датасета ({v})',
      'hero.hint': 'Измените любой признак — прогноз пересчитается.',
      'unit.days': 'дн.',
      'unit.pp': 'п. п.',
      'days': '{n} дн.',
      'days.short': '{n} дн.',
      'fact.time': 'time в датасете',
      'fact.outcome': '{outcome} · target = {t}',
      'fact.alive': 'P(без смерти от ССЗ до τ)',
      'fact.aliveNote': 'S(τ), τ = {tau} дн.',
      'fact.rmst': 'Ожидаемое число дней без смерти от ССЗ',
      'fact.rmstNote': 'RMST(τ), площадь под S(t)',
      'fact.balStage': 'P(смерть от ССЗ до {tau}-го дня)',
      'fact.balNote': 'логистическая регрессия: balanced_dataset.csv и частичные метки цензурированных',
      'fact.cascadeStage': 'Каскад: P(смерть от ССЗ ≤ {days} дн.)',
      'fact.cascadeNote': 'классификатор этапа 1 — вес ранней смерти в S(t)',
      'fact.stgGroup': 'Классификатор: наиболее вероятная группа',
      'stg.early': 'смерть от ССЗ в первые {days} дн.',
      'stg.late': 'смерть от ССЗ на {next}–{last}-й день',
      'stg.survive': 'жив дольше {tau} дн.',
      'fact.stgCluster': 'Кластер всей когорты',
      'fact.stgClusterTypical': 'типичные пациенты, близкие к среднему по когорте',
      'fact.stgClusterNote': 'кластер {c} из {k} (агломеративная кластеризация всех пациентов по данным при поступлении); смертей от ССЗ в первые {days} дн.: {early} из {n} обучающих пациентов',
      'fact.stgRoute': 'Время внутри этой группы',
      'fact.stgRouteNote': 'справочно: прогноз выше — медиана S(t), в которой все три группы взвешены по их вероятностям',
      'fact.datasetValue': 'по датасету: {v}',
      'profile.title': 'Риск смерти от ССЗ к сроку (полоса — пациент, штрих — среднее по когорте; шкала 0–{scale})',
      'profile.group': 'Группа риска по прогнозу на 12 месяцев:',
      'profile.h30': 'За 1 месяц',
      'profile.h90': 'За 3 месяца',
      'profile.h180': 'За 6 месяцев',
      'profile.h270': 'За 9 месяцев',
      'profile.h365': 'За 12 месяцев',
      'profile.death': 'Смерть от ССЗ на {d}-й день. Риск смерти от ССЗ {h} по значениям датасета — {p}, {ratio}.',
      'profile.deathLate': 'Смерть от ССЗ на {d}-й день, позже 12 месяцев. Риск смерти от ССЗ за 12 месяцев по значениям датасета — {p}.',
      'profile.survived': 'Без смерти от ССЗ в первые 12 месяцев (наблюдение {d} дн.); риск за 12 месяцев по значениям датасета — {p}.',
      'ratio.up': 'в {r} раза выше среднего ({v})',
      'ratio.same': 'на уровне среднего ({v})',
      'ratio.down': 'ниже среднего ({v})',
      'riskgroup.0': 'низкий (< 3%)',
      'riskgroup.1': 'умеренный (3–10%)',
      'riskgroup.2': 'высокий (10–25%)',
      'riskgroup.3': 'очень высокий (≥ 25%)',
      'horizon.30': '1 мес.',
      'horizon.90': '3 мес.',
      'horizon.180': '6 мес.',
      'horizon.270': '9 мес.',
      'horizon.365': '12 мес.',
      'profile.cohort': 'среднее по когорте',
      'profile.dataset': 'по датасету: {v}',
      'quality.title': 'Возможная ошибка ввода',
      'quality.note': 'Вне физиологически правдоподобного диапазона: {list}. Прогноз считается по введённому значению; исправьте его в редакторе, чтобы увидеть, как изменится прогноз.',
      'quality.item': '{label} = {v} {unit} (правдоподобно {lo}–{hi})',
      'chart.aria': 'Функция выживаемости пациента ID {id}. Значения можно читать клавишами со стрелками.',
      'chart.y': 'S(t), вероятность не умереть от ССЗ',
      'chart.x': 'дни',
      'chart.deathBefore': 'смерть от ССЗ на {d}-й день (датасет)',
      'chart.censoredBefore': 'жив, наблюдение закончилось на {d}-й день (датасет)',
      'chart.otherBefore': 'смерть от других причин на {d}-й день (датасет)',
      'chart.deathAfter': 'смерть от ССЗ на {d}-й день, после τ (датасет)',
      'chart.aliveAfter': 'нет смерти от ССЗ до τ, наблюдение {d} дн. (датасет)',
      'chart.day': 'День {d}',
      'chart.sBase': 'S(t), по датасету',
      'chart.sEdit': 'S(t), с изменениями',
      'chart.legendBase': 'значения датасета',
      'chart.legendEdit': 'с вашими изменениями',
      'chart.note': 'Функция выживаемости S(t) выбранного пациента. Прогноз времени — её медиана: день, когда S(t) опускается до 0,5 (за горизонтом τ, если остаётся выше 0,5); закрашенная площадь — RMST(τ) = ∫₀<sup>τ</sup> S(t) dt. Модель выживаемости прогнозирует распределение времени смерти, а не дату: см. риски к срокам выше.',
      'models.aria': 'Прогноз времени выбранного пациента по всем моделям',
      'models.model': 'Модель',
      'models.horizon': 'Срок для AUC и «прогноз / факт»:',
      'models.cindex': 'C‑index',
      'models.auc': 'AUC',
      'models.eo': 'Прогноз / факт',
      'models.ibs': 'IBS',
      'models.base': 'Время по датасету',
      'models.edit': 'Время с изменениями',
      'models.note': 'Отложенные пациенты всей когорты ({n}, веса IPCW для цензурирования), {model}, {h}: AUC {auc} — насколько хорошо риск отделяет умерших от ССЗ к этому сроку от остальных (0,5 — случайно, 1 — идеально); прогноз / факт {eo} — отношение ожидаемого числа смертей к наблюдаемому (1 — точно); C-index {c} — ранжирование по риску; IBS {ibs} — точность всей S(t) на 0–τ. Смертей от ССЗ к этому сроку у отложенных — {deaths}',
      'models.few': '; оценка неустойчива, надёжнее группы риска ниже.',
      'calib.title': 'Насколько точны риски: прогноз / факт по группам риска · {model}',
      'calib.group': 'Группа риска (12 мес.)',
      'calib.n': 'Пациентов',
      'calib.note': 'Прогнозы вне выборки: кросс-валидация на {n} обучающих пациентах ({folds} фолдов) — каждый пациент получил прогноз модели, обученной без него. В ячейке — средний прогноз риска смерти от ССЗ к сроку / факт по Каплану — Мейеру; выделены группа выбранного пациента и выбранный срок. Смертей от ССЗ: {d1} к 1 месяцу, {d12} к 12 месяцам. Вне выборки {h}: AUC {auc}, прогноз / факт {eo}.',

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
      'patient.calib': 'обучающая выборка (цензурирован до τ)',
      'patient.edited': 'изменено признаков: {n}',
      'mini.time': 'time в датасете ',
      'mini.pred': 'прогноз ({model}) ',
      'outcome.cvd': 'Смерть от ССЗ',
      'outcome.other': 'Смерть от других причин',
      'outcome.alive': 'Жив на конец наблюдения',
      'param.slider': '{label}, ползунок',
      'param.reset': 'Вернуть значение из датасета: {label}',
      'param.resetTitle': 'Вернуть значение из датасета',
      'param.dataset': 'датасет',
      'param.datasetValue': 'датасет: {v}',
      'param.notUsed': 'моделями не используется: известен только после выписки',
      'param.implausible': 'неправдоподобно: ожидается {lo}–{hi}',
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
      'table.real': 'Факт min(T, τ)',
      'table.pred': 'Прогноз, дн.',
      'table.risk': 'Риск за 12 мес.',
      'table.group': 'Группа риска',
      'table.edit': 'С изменениями, дн.',

      'method.title': 'Как это работает',
      'method.list': `
        <li><b>Прогноз времени.</b> Как в <i>Survival-function-analysys.ipynb</i>, модель даёт функцию выживаемости пациента S(t) — вероятность не умереть от ССЗ к дню t. Точный день смерти по данным при поступлении не определяется: дата (медиана S(t), день, к которому вероятность смерти от ССЗ достигает 50%) раньше τ = 1500 дней означает риск смерти от ССЗ до τ выше 50%, а такой риск — у 1–3% пациентов. Поэтому дата показывается только им, остальным — «смерть от ССЗ до 1500-го дня маловероятна» и риск до τ. Главное в карточке — риски смерти от ССЗ к 1, 3, 6, 9 и 12 месяцам рядом со средним по когорте, группа риска по прогнозу на 12 месяцев и, для пациентов датасета, их исход рядом с риском, который давала модель. У 82 отложенных пациентов с известным исходом ошибка даты у выживших — 0, а у умерших в первый год — около 1300 дней (72% всей ошибки): так устроен точечный прогноз при невысоком риске, а не ошибка расчёта, поэтому ошибка даты на странице не показывается.</li>
        <li><b>Модели</b> (CoxPH, Weibull AFT, XGBoost Cox, полносвязная и резервуарная нейросети) обучены как в ноутбуке на <code>balanced_dataset.csv</code>: те же 326 пациентов обучающей выборки (стратифицированное разбиение, <code>random_state=37</code>), <code>StandardScaler</code> и гиперпараметры, — но только по 28 признакам, известным при поступлении. <code>doctor</code> (наблюдающий врач) и <code>llo</code> (льготные лекарства) назначаются после выписки: умершие рано их не получают (92% и 100% умерших от ССЗ в первые 30 дней), то есть в них частично заложен исход (immortal time bias). В редакторе они показаны, но на прогноз не влияют.</li>
        <li><b>Калибровка на всей когорте.</b> Пациентов включали в исследование около двух лет, а закончилось оно для всех в один день, поэтому 1098 пациентов наблюдались меньше τ: 954 поздно включённых живых и 144 умерших от других причин. <code>balanced_dataset.csv</code> отбирает пациентов по исходу, а не по дате включения: поздно включённые, умершие от ССЗ, в нём остаются (около 115 из 152 смертей), а выжившие — нет. Поэтому смертей от ССЗ в нём 37%, а во всей когорте к τ — 11%. Это видно и без допущений о цензурировании: до 889-го дня ни один живой пациент не выбывает, и в первый год от ССЗ умерли 5,8% всех пациентов, а в <code>balanced_dataset.csv</code> — 21,6%. Выживаемость, оценённая на нём, сильно занижена: средний прогноз S(τ) 0,63–0,72 против 0,88. Поэтому переход от оценки риска модели s к S(t) обучен заново на всех 1204 обучающих пациентах с учётом цензурирования — это модель Кокса по оценке риска и её квадрату: S(t | s) = S₀(t)<sup>exp(b₁·s + b₂·(s − s̄)²)</sup>, где s̄ — средняя оценка (у XGBoost Cox — только по s). Для 326 пациентов, на которых обучены модели, оценки риска взяты вне выборки (5 фолдов); у нейросетей оценка риска — логит. Оценка ограничена вершиной параболы, поэтому порядок пациентов по риску не меняется, а квадратичный член уточняет вероятности: при кросс-валидации Brier S(τ) ниже, чем с линейным калибратором S₀(t)<sup>exp(c·s)</sup>, во всех разбиениях, ошибка калибровки RMST у CoxPH — 11 дней вместо 17. Средний прогноз S(τ) — 0,876–0,879 при фактических 0,882, ошибка калибровки RMST по квинтилям риска на отложенных пациентах — 31–37 дней.</li>
        <li><b>Точность</b> — по рискам к срокам 1, 3, 6, 9 и 12 месяцев. На 302 отложенных пациентах всей когорты (из них 82 — из <code>balanced_dataset.csv</code>; одинаково для обоих датасетов, цензурирование учтено весами IPCW) для выбранного над таблицей моделей срока показаны AUC (насколько хорошо риск отделяет умерших от ССЗ к сроку от остальных), «прогноз / факт» (отношение ожидаемого числа смертей к наблюдаемому), C-index и интегральный Brier score. Среди отложенных к 1 месяцу умерли от ССЗ лишь 7 пациентов, к 12 месяцам — 16, поэтому группы риска (таблица под моделями) посчитаны по прогнозам вне выборки на 1204 обучающих пациентах (кросс-валидация по 5 фолдам; 30 и 72 смерти). У Staged pipeline вне выборки AUC 0,79–0,80 на всех сроках, «прогноз / факт» 0,97–1,01, а за 12 месяцев умерли от ССЗ 1,5% пациентов группы «низкий» (43% пациентов), 5,2% — «умеренный», 18,8% — «высокий» и 41,4% — «очень высокий» при прогнозе 1,9%, 5,4%, 16,0% и 34,7%. Группу высокого риска распознать можно, день смерти — нет.</li>
        <li><b>Balanced mixture и Staged pipeline: частичные метки.</b> Эти модели учат «смерть от ССЗ до τ», а у цензурированных до τ этот исход неизвестен. Рано и поздно включённые пациенты различаются и по признакам при поступлении (AUC 0,70: у включённых рано выше холестерин, ЛПНП и ФВ, меньше инфарктов), поэтому одних весов IPCW по времени недостаточно: средний прогноз S(τ) остаётся 0,80–0,82. Цензурированные входят в обучение с частичными метками. Умершие от ССЗ (в том числе поздно включённые) и дожившие до τ входят с весом 1: их исход известен. Пациент, живой на день выбывания C, входит выжившим с весом q и умершим до τ с весом 1 − q, где q — доля доживших до τ среди 50 самых похожих на него пациентов с известным исходом, тоже живых на день C. Похожий на выживших получает q около 1, а похожий на умерших — сильно сниженный вес. При кросс-валидации на 1204 обучающих пациентах это лучше и весов IPCW, и прежнего обучения только на <code>balanced_dataset.csv</code>: C-index 0,782–0,786 против 0,758–0,768, IBS 0,062 против 0,064–0,108, ошибка калибровки RMST 32–34 дня против 64–274. «Balanced mixture»: логистическая регрессия смерти от ССЗ до τ даёт вероятность p, и S(t) = 1 − p·F(t), где F(t) — доля смертей от ССЗ до τ, случившихся к дню t (с весами IPCW). «Staged pipeline» (ниже) — модель по умолчанию для <code>balanced_dataset.csv</code>, CoxPH — для всей когорты.</li>
        <li><b>Многоэтапный конвейер</b> (модель «Staged pipeline»). (1) Вся когорта; (2) смерти от ССЗ в первые 10 дней исключаются; (3) правило ноутбука (смерть от ССЗ или наблюдение ≥ τ) даёт новый balanced без ранних смертей — 312 из 326 обучающих пациентов, к которым добавляются 878 цензурированных до τ с частичными метками. Классификация в три группы: этап 1 — смерть от ССЗ в первые 10 дней или нет (1199 обучающих пациентов: статус на 10-й день известен почти у всех); этап 2 — смерть от ССЗ до τ или жизнь дольше 1500 дней (логистическая регрессия на новом balanced и частичных метках). (4) Модель Кокса на всех обучающих пациентах, переживших 10 дней, даёт время поздней смерти. (5) S(t) = 1 − P<sub>ранн</sub>·F<sub>ранн</sub>(t) − P<sub>поздн</sub>·F<sub>поздн</sub>(t | x), где F<sub>ранн</sub> — распределение дней ранней смерти, F<sub>поздн</sub> — время смерти по модели Кокса при условии смерти до τ. Прогноз времени — медиана этой S(t): вероятности классификатора определяют время каждого пациента. <b>Кластеризация всей когорты для этапа 1.</b> Агломеративная кластеризация всех 1506 пациентов по 28 признакам при поступлении (без исходов; полная связь, 8 кластеров; пациент относится к ближайшему центру кластера) находит клинические фенотипы: в кластерах «анемия, без стентирования, ХБП» и «гипергликемия, диабет, лейкоцитоз» — 10 из 17 смертей от ССЗ в первые 10 дней, в основном кластере из 945 типичных пациентов — 2. Этап 1 — логистическая регрессия по признакам и принадлежности к кластеру; кластер пациента показан в карточке. При кросс-валидации (5 разбиений × 5 фолдов) кластеры снизили log-loss этапа 1 в 23 из 25 фолдов и повысили AUC с 0,794 до 0,808 (связи ward, average, complete, 4–64 кластера, принадлежность или доля ранних смертей в кластере как признак сравнивались раньше; доля отвергнута: при 14 ранних смертях на 16 кластеров она давала отрицательный коэффициент). В первые 10 дней умерли лишь 14 обучающих пациентов, наибольшая вероятность смерти в первые 10 дней — 18%, поэтому группа ранней смерти не бывает самой вероятной ни у одного пациента. Если брать только наиболее вероятную группу и время внутри неё (в карточке показано справочно), почти всем прогнозируется «за горизонтом», а пациент с вероятностью группы 45–50% в половине случаев попадает в другую группу; поэтому прогноз — медиана S(t). Наибольший риск смерти от ССЗ в первые 30 дней — 30%, ошибка калибровки RMST на отложенных пациентах — 31 день.</li>
        <li><b>Методологический разбор: почему убран критерий «ошибка ≤ 150 дней».</b> Прежние версии сравнивали модели по доле пациентов с |прогноз − факт| ≤ 150 дней и прогнозировали фиксированные дни: 150 дней — пациентам, отмеченным классификатором («Balanced two-stage» при P(смерть от ССЗ до τ) ≥ 0,6; каскад — верхним 2% оценки ранней смерти), 900 дней — следующему 1%, 1500 дней — всем остальным. Это была методологическая ошибка. (1) 150 дней — не оценка времени смерти, а центр окна 0–300 дней, выбранный потому, что он максимизирует попадания в критерий; время ранней смерти сильно скошено (из 151 смерти от ССЗ до τ в <code>balanced_dataset.csv</code> 37 — в первые 30 дней, 81 — в первые 300). (2) Порог превращает вероятность в дату: пациент с риском 60% получал «150 дней», хотя по оценке самой модели выживает с вероятностью 40%, и тогда ошибка — 1350 дней. Из 23 отложенных пациентов, отмеченных так, 14 умерли в первые 300 дней, 6 — позже, 3 пережили τ (ID 347, 1085, 1499); ID 63, 67 и 276 — такие же случаи среди обучающих пациентов. (3) Критерий не является состоятельным правилом оценки и определяется выжившими: прогноз 1500 дней всем уже даёт 62,2% на 82 отложенных пациентах против 75,6% у подобранного правила. (4) Пороги, дни и классификаторы подбирались по этому же критерию, а отложенная выборка просматривалась после каждого изменения, поэтому её оценка оптимистична. Теперь прогноз — медиана S(t), каждая модель даёт риски смерти от ССЗ к 1, 3, 6, 9 и 12 месяцам, а модели сравниваются по зависящему от времени AUC, «прогноз / факт», C-index и IBS. Честно назвать раннюю дату не может ни одна модель: наибольшая вероятность смерти от ССЗ в первые 30 дней среди всех 1506 пациентов — 0,13–0,33 у всех восьми моделей, а у CoxPH, Weibull AFT, NN Survival, RN Survival и Balanced mixture ни у одного пациента окно первого года не является самым вероятным исходом.</li>
        <li><b>Внезапные необъяснимые смерти от ССЗ</b> (оранжевый ◆ на карте): смерти от ССЗ в первый год при невысоком прогнозном риске. Медиана риска восьми моделей к ближайшему сроку (1, 3, 6, 9 или 12 месяцев) ниже двух средних по когорте, и не меньше 90% из 50 самых похожих при поступлении пациентов (28 признаков, стандартизованных) пережили этот срок: 39 из 88 таких смертей в <code>balanced_dataset.csv</code>, доля переживших среди похожих — 90–100%, в среднем 97,7%. Медиана моделей, а не «ни одна модель»: прежнее правило («у всех моделей дата за горизонтом τ») не отмечало, например, ID 202 (смерть на 2-й день), потому что XGBoost Cox давал ему дату 1032-й день — смерть «когда-нибудь до τ», а не в первый месяц. Риск смерти в первый месяц у ID 202 по XGBoost — 15,6% из-за крайних лейкоцитоза (25,1·10⁹/л) и брадикардии (ЧСС 35; линейные модели считают низкую ЧСС защитной), у остальных моделей — 2,1–5,0% (медиана восьми моделей 4,0% при среднем по когорте 2,5%), а все 50 самых похожих пациентов пережили первый месяц. На карте такие точки лежат среди выживших, а не отдельным скоплением.</li>
        <li><b>Неожиданное выживание</b> (синий ◆): пациенты без смерти от ССЗ до τ, у которых многоэтапный конвейер оценил риск смерти от ССЗ до τ в 50% и выше, то есть выживание было менее вероятно, чем смерть: 2 из 257 таких пациентов. Для группы «очень высокий» порог не годится: при риске за 12 месяцев ≥ 25% (в среднем 34%) год переживают 60% пациентов, для них выживание ожидаемо. ID 1234 (риск 61%, медиана восьми моделей — 20%; возраст 87 лет, ХБП, 3 поражённые артерии без стентирования): среди 50 самых похожих пациентов с известным исходом умерли 42% — модель переоценивает риск для такого профиля. ID 67 (риск 65%, медиана моделей — 34%): среди похожих умерли 60%, но главный вклад в риск даёт гемоглобин 34 г/л — неправдоподобное значение, вероятно ошибка ввода: при 134 г/л риск снижается до 43%. Прежняя версия конвейера, обученная только на <code>balanced_dataset.csv</code>, отмечала 25 пациентов: например, ID 63 и 276 получали риск 53%, а теперь — 17% и 15%, и среди похожих на них умерли 18%. Значения вне физиологически правдоподобных диапазонов отмечаются в редакторе и под прогнозом.</li>
        <li><b>Каскад</b> (модель «Cascade»): XGBoost-классификатор смерти от ССЗ в первые 365 дней с калибровкой Платта даёт вероятность p, модель Кокса, обученная на проживших дольше 365 дней, — S<sub>поздн</sub>(t); S(t) = p·S<sub>ранн</sub>(t) + (1 − p)·S<sub>поздн</sub>(t), где S<sub>ранн</sub> — распределение дней ранней смерти в обучающей выборке. Прежние версии давали отмеченным пациентам фиксированные дни (150 или 900); это убрано (см. методологический разбор). Классификатор выбирался кросс-валидацией только на обучающей выборке из логистической регрессии, XGBoost, CatBoost, случайного леса, риска по модели Кокса, kNN (разные масштабирования, обученная метрика NCA, веса по важности, координаты t-SNE), агломеративной кластеризации, SVM, MLP, LDA/QDA, наивного Байеса и ансамблей, без и вместе с конструированными признаками (приближённая шкала GRACE, shock index, eGFR CKD-EPI, клинические флаги). Ни один не отделил ранние смерти лучше: даже среди верхних 1–2% оценок в первые 90 дней умирают лишь 17–33%. Самым сильным одиночным фактором оказался <code>doctor</code>, который известен только после выписки (см. «Модели»). Каскад ранжирует пациентов хуже CoxPH (C-index 0,79 против 0,84) и оставлен для сравнения.</li>
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
    pct: (value) => new Intl.NumberFormat(LOCALES[lang], { style: 'percent', maximumFractionDigits: 1 }).format(value), // 12.3% / 12,3 %
    applyStatic,
  };

  applyStatic();
})(window);
