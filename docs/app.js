/*
 * Интерактивная карта пациентов: t-SNE, выбор и редактирование пациента, прогноз времени дожития.
 * Данные и параметры моделей — docs/survival_model.js (scripts/survival_time_predictor.py export).
 *
 * Пациенты — все строки med_dataset_cardio.xlsx (глобальный индекс g); balanced_dataset.csv — подмножество
 * этих строк. Карта, таблица и номер строки относятся к выбранному датасету (локальный индекс i = ds.local[g]).
 */
(function () {
  'use strict';

  const BUNDLE = window.SURVIVAL_MODEL;
  const predictor = SurvivalPredictor.createPredictor(BUNDLE);
  const FEATURES = BUNDLE.features;
  const D = FEATURES.length;
  const PATIENTS = BUNDLE.patients;
  const NP = PATIENTS.id.length;
  const DATASETS = BUNDLE.datasets;
  const TAU = BUNDLE.meta.tau;
  const MODELS = BUNDLE.meta.model_names;
  const MODEL_KEYS = Object.keys(MODELS);
  // Сроки оценки риска (1, 3, 6, 9 и 12 месяцев) и средний риск по когорте к ним (Каплан — Мейер)
  const HORIZONS = BUNDLE.meta.horizons;
  const COHORT_RISKS = BUNDLE.meta.cohort_risks;
  const DEFAULT_HORIZON = HORIZONS.length - 1;
  // Модель по умолчанию: для balanced_dataset.csv — многоэтапный конвейер, для всей когорты — CoxPH. Все модели
  // откалиброваны на всю когорту, поэтому метрики в таблице моделей — на отложенных пациентах всей когорты
  const DEFAULT_MODELS = { balanced: 'stg', full: 'cph' };
  // Признаки, которые модели не используют (известны только после выписки)
  const MODEL_FEATURES = new Set(BUNDLE.model_features || BUNDLE.features);
  const DEFAULT_DATASET = 'balanced';
  const STORAGE_KEY = 'survival-explorer:v1';
  const ITERATIONS = 1000;

  // Группа признака в редакторе и шаг ползунка (у категориальных — 1);
  // названия, единицы и значения категорий на двух языках — в i18n.js
  const FEATURE_INFO = {
    age: { step: 1, group: 'demo' },
    gender: { group: 'demo' },
    bmi: { step: 0.1, group: 'demo' },
    smoking: { group: 'demo' },
    bpm: { step: 1, group: 'vitals' },
    sysAP: { step: 1, group: 'vitals' },
    ef_hosp: { step: 0.1, group: 'vitals' },
    pulm_cong: { group: 'vitals' },
    af: { group: 'comorb' },
    dm: { group: 'comorb' },
    ckd: { group: 'comorb' },
    copd: { group: 'comorb' },
    insult: { group: 'comorb' },
    onco: { group: 'comorb' },
    severity: { group: 'event' },
    stemi: { group: 'event' },
    nstemi: { group: 'event' },
    sum_cad: { step: 1, group: 'event' },
    ca_delay: { group: 'treat' },
    stenting: { group: 'treat' },
    total_revasc: { group: 'treat' },
    llo: { group: 'treat' },
    doctor: { group: 'treat' },
    hb: { step: 1, group: 'labs' },
    leukoc: { step: 0.1, group: 'labs' },
    tromboc: { step: 1, group: 'labs' },
    t_chol: { step: 0.1, group: 'labs' },
    ldl: { step: 0.01, group: 'labs' },
    glu: { step: 0.1, group: 'labs' },
    crea: { step: 1, group: 'labs' },
  };
  const GROUPS = ['demo', 'vitals', 'comorb', 'event', 'treat', 'labs'];
  // patients.split: 0 — обучающий, цензурирован до τ; 1 — обучающий из balanced_dataset.csv; 2 — отложенная выборка
  const SPLIT_KEYS = ['patient.calib', 'patient.train', 'patient.test'];

  const { t } = I18N;
  // Исход: смерть от ССЗ (target = 1), смерть от других причин (для смерти от ССЗ — цензурирование) или жив
  const outcomeKey = (g) => (PATIENTS.target[g] ? 'cvd' : PATIENTS.death_any[g] ? 'other' : 'alive');
  const outcome = (g) => t(`outcome.${outcomeKey(g)}`);

  // Фактическое min(T, τ), с которым сравнивается прогноз RMST: точно — у умерших от ССЗ и наблюдавшихся
  // не меньше τ; если наблюдение закончилось раньше без смерти от ССЗ — известна только нижняя граница
  function observed(g) {
    const time = PATIENTS.time[g];
    return PATIENTS.target[g] || time >= TAU ? { value: Math.min(time, TAU), exact: true } : { value: time, exact: false };
  }

  // ---------------------------------------------------------------------------
  // Вспомогательные функции
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  function el(tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children) if (child != null) node.append(child);
    return node;
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (key === 'text') node.textContent = value;
      else node.setAttribute(key, value);
    }
    return node;
  }

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
  const fmtDays = (v) => I18N.int(v);
  const days = (v) => t('days', { n: fmtDays(v) });
  // Прогноз τ означает «смерти от ССЗ в пределах горизонта τ не будет» — показываем «≥ τ», а не точный день;
  // так же показываем факт у пациентов, наблюдавшихся дольше τ без смерти от ССЗ (их время — не день смерти)
  const fmtTime = (v) => (v >= TAU ? `≥ ${fmtDays(TAU)}` : fmtDays(v));
  const daysTime = (v) => t('days', { n: fmtTime(v) });
  const fmtObserved = (g) => {
    const o = observed(g);
    return o.exact ? fmtTime(o.value) : `≥ ${fmtDays(o.value)}`;
  };
  const fmtPct = (v) => I18N.pct(v);
  // Риск относительно среднего по когорте: «в 2,0 раза выше среднего (2,5%)», «на уровне среднего», «ниже среднего»
  const ratioText = (p, avg) => {
    const r = p / avg;
    return r >= 1.25 ? t('ratio.up', { r: I18N.fixed(r, 1), v: fmtPct(avg) })
      : r > 0.8 ? t('ratio.same', { v: fmtPct(avg) }) : t('ratio.down', { v: fmtPct(avg) });
  };
  const riskGroupLabel = (risk1y) => t(`riskgroup.${predictor.riskGroup(risk1y)}`);
  // Значение для поля ввода — всегда с точкой; для подписей — I18N.num по правилам языка
  const fmtValue = (v) => String(+(+v).toFixed(4));
  const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  function loadSaved() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  }

  // ---------------------------------------------------------------------------
  // Состояние: текущие (возможно, изменённые) значения признаков всех пациентов
  // ---------------------------------------------------------------------------
  const saved = loadSaved();
  const indexById = new Map(PATIENTS.id.map((id, g) => [id, g]));
  const state = {
    dataset: DATASETS[saved.dataset] ? saved.dataset : DEFAULT_DATASET,
    perplexity: Number.isFinite(saved.perplexity) ? clamp(Math.round(saved.perplexity), 2, 100) : 30,
    // Выбранная модель запоминается для каждого датасета отдельно — пока не сменилась модель по умолчанию
    models: Object.fromEntries(Object.entries(DEFAULT_MODELS).map(([key, m]) => [key,
      MODELS[saved.models?.[key]] && saved.defaults?.[key] === m ? saved.models[key] : m])),
    selected: indexById.has(saved.selectedId) ? indexById.get(saved.selectedId) : -1,
    hovered: -1,
    theme: saved.theme,
    highlightSudden: saved.highlightSudden === true,
    horizon: Number.isInteger(saved.horizon) && saved.horizon >= 0 && saved.horizon < HORIZONS.length ? saved.horizon : DEFAULT_HORIZON,
    values: PATIENTS.X.map((row) => row.slice()),
  };
  // Изменения храним по ID пациента: он одинаков в обоих датасетах
  for (const [id, changes] of Object.entries(saved.editsById || {})) {
    const g = indexById.get(Number(id));
    if (g === undefined) continue;
    for (const [feature, value] of Object.entries(changes)) {
      const k = FEATURES.indexOf(feature);
      if (k >= 0 && Number.isFinite(value)) state.values[g][k] = value;
    }
  }

  function isEdited(g) {
    const x = state.values[g], original = PATIENTS.X[g];
    for (let k = 0; k < D; k++) if (x[k] !== original[k]) return true;
    return false;
  }
  const editedFeatures = (g) => FEATURES.filter((_, k) => state.values[g][k] !== PATIENTS.X[g][k]);
  state.model = state.models[state.dataset];
  const editedSet = new Set();

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const editsById = {};
      for (const g of editedSet) {
        const changes = editsById[PATIENTS.id[g]] = {};
        for (const f of editedFeatures(g)) changes[f] = state.values[g][FEATURES.indexOf(f)];
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          dataset: state.dataset, perplexity: state.perplexity, models: state.models, defaults: DEFAULT_MODELS,
          selectedId: PATIENTS.id[state.selected],
          theme: state.theme, lang: I18N.lang, highlightSudden: state.highlightSudden, horizon: state.horizon, editsById,
        }));
      } catch (e) { /* хранилище недоступно — состояние живёт только до перезагрузки */ }
    }, 200);
  }

  // ---------------------------------------------------------------------------
  // Прогноз времени (медиана S(t)) и риск смерти от ССЗ за год для всех пациентов и всех моделей
  // ---------------------------------------------------------------------------
  const baseTime = {}, baseRisk = {}; // по исходным значениям датасета
  const curTime = {}, curRisk = {};   // по текущим значениям (с изменениями)
  for (const m of MODEL_KEYS) {
    baseTime[m] = new Float64Array(NP);
    baseRisk[m] = new Float64Array(NP);
    PATIENTS.X.forEach((x, g) => {
      const p = predictor.predict(x, m);
      baseTime[m][g] = p.time;
      baseRisk[m][g] = p.risk1y;
    });
    curTime[m] = baseTime[m].slice();
    curRisk[m] = baseRisk[m].slice();
  }
  function refreshTime(g) {
    const edited = isEdited(g);
    if (edited) editedSet.add(g); else editedSet.delete(g);
    for (const m of MODEL_KEYS) {
      const p = edited ? predictor.predict(state.values[g], m) : null;
      curTime[m][g] = p ? p.time : baseTime[m][g];
      curRisk[m][g] = p ? p.risk1y : baseRisk[m][g];
    }
  }
  for (let g = 0; g < NP; g++) if (isEdited(g)) refreshTime(g);

  // Группы с исходом, который данные при поступлении не объясняют: внезапная смерть от ССЗ и неожиданное выживание
  const markedGroup = (g) => (PATIENTS.sudden[g] ? 'sudden' : PATIENTS.unexpected[g] ? 'unexpected' : null);

  // Значения вне правдоподобного диапазона — вероятная ошибка ввода
  const PLAUSIBLE = BUNDLE.meta.plausible;
  const implausible = (values) => FEATURES.flatMap((f, k) => {
    const range = PLAUSIBLE[f];
    return range && (values[k] < range[0] || values[k] > range[1]) ? [{ f, v: values[k], lo: range[0], hi: range[1] }] : [];
  });

  // ---------------------------------------------------------------------------
  // Датасет: строки, стандартизация признаков для t-SNE и сама карта (кэшируется для каждого датасета)
  // ---------------------------------------------------------------------------
  const views = {};
  function getView(key) {
    if (views[key]) return views[key];
    const rows = Int32Array.from(DATASETS[key].rows || PATIENTS.id.map((_, g) => g));
    const n = rows.length;
    const local = new Int32Array(NP).fill(-1);
    rows.forEach((g, i) => { local[g] = i; });
    const mu = new Float64Array(D), sd = new Float64Array(D);
    for (const g of rows) PATIENTS.X[g].forEach((v, k) => { mu[k] += v / n; });
    for (const g of rows) PATIENTS.X[g].forEach((v, k) => { sd[k] += (v - mu[k]) ** 2 / n; });
    for (let k = 0; k < D; k++) sd[k] = Math.sqrt(sd[k]) || 1;
    const standardize = (x) => Float64Array.from(x, (v, k) => (v - mu[k]) / sd[k]);
    const Z = new Float64Array(n * D);
    rows.forEach((g, i) => Z.set(standardize(PATIENTS.X[g]), i * D));
    const counts = [0, 0];
    for (const g of rows) counts[PATIENTS.target[g]]++;
    views[key] = {
      key, file: DATASETS[key].file, rows, n, local, standardize, Z, counts,
      tsne: null, perplexity: null, kl: null,
      pos: new Float64Array(2 * n),   // целевые положения точек
      disp: new Float64Array(2 * n),  // отображаемые (анимируются к pos)
      projOriginal: new Map(),        // проекция исходных значений пациента на карту
    };
    return views[key];
  }
  let ds = getView(state.dataset);
  if (state.selected < 0 || ds.local[state.selected] < 0) state.selected = ds.rows[0];

  // ---------------------------------------------------------------------------
  // t-SNE
  // ---------------------------------------------------------------------------
  let tsnePhase = 'idle'; // affinities → running → done
  let tsneToken = 0;

  function startTSNE() {
    const view = ds;
    const token = ++tsneToken;
    tsnePhase = 'affinities';
    view.perplexity = null;
    view.kl = null;
    view.projOriginal.clear();
    updateStatus();
    // Сначала даём браузеру показать статус: расчёт сходств для 1506 пациентов занимает заметное время
    requestAnimationFrame(() => setTimeout(() => {
      if (token !== tsneToken) return;
      view.tsne = new TSNE(view.Z, view.n, D, { perplexity: state.perplexity, iterations: ITERATIONS });
      view.perplexity = state.perplexity;
      tsnePhase = 'running';
      const frame = () => {
        if (token !== tsneToken) return;
        // Итерации — порциями примерно по 30 мс на кадр, чтобы страница не замирала на большом датасете
        const start = performance.now();
        let done;
        do done = view.tsne.step(5); while (!done && performance.now() - start < 30);
        view.pos.set(view.tsne.Y);
        view.disp.set(view.tsne.Y);
        computeTransform();
        drawMap();
        updateStatus();
        if (!done) {
          requestAnimationFrame(frame);
          return;
        }
        tsnePhase = 'done';
        view.kl = view.tsne.kl();
        for (const g of editedSet) placeEdited(g);
        updateStatus();
        animate();
      };
      frame();
    }, 0));
  }

  // Положение изменённого пациента на карте. Проекция исходных значений (a) обычно немного
  // отличается от его места на карте; это смещение переносим на проекцию новых значений (b),
  // чтобы при малом изменении точка сдвигалась плавно от своего места. Чем дальше b от a,
  // тем меньше вес переноса: при сильном изменении точка встаёт ровно среди новых соседей.
  function projectedPosition(g, i) {
    const Y = ds.tsne.Y;
    if (!isEdited(g)) return [Y[2 * i], Y[2 * i + 1]];
    let a = ds.projOriginal.get(g);
    if (!a) {
      a = ds.tsne.project(ds.Z.subarray(i * D, (i + 1) * D), i);
      ds.projOriginal.set(g, a);
    }
    const b = ds.tsne.project(ds.standardize(state.values[g]), i);
    const bounds = ds.tsne.bounds();
    const span = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
    const weight = Math.exp(-Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.08 * span));
    return [b[0] + weight * (Y[2 * i] - a[0]), b[1] + weight * (Y[2 * i + 1] - a[1])];
  }

  function placeEdited(g) {
    const i = ds.local[g];
    if (i < 0 || tsnePhase !== 'done') return;
    const [x, y] = projectedPosition(g, i);
    ds.pos[2 * i] = x;
    ds.pos[2 * i + 1] = y;
  }

  let animating = false;
  function animate() {
    if (animating) return;
    animating = true;
    const tick = () => {
      const { pos, disp } = ds;
      let moving = false;
      for (let k = 0; k < pos.length; k++) {
        const diff = pos[k] - disp[k];
        if (Math.abs(diff) > 1e-3) {
          disp[k] += diff * 0.2;
          moving = true;
        } else disp[k] = pos[k];
      }
      drawMap();
      if (moving) requestAnimationFrame(tick);
      else animating = false;
    };
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------
  // Отрисовка карты (canvas)
  // ---------------------------------------------------------------------------
  const canvas = $('map');
  const ctx = canvas.getContext('2d');
  const tooltip = $('map-tooltip');
  const screen = { scale: 1, ox: 0, oy: 0, w: 0, h: 0 };
  let colors = {};

  function readColors() {
    colors = {
      t: [cssVar('--t0'), cssVar('--t1')],
      edit: cssVar('--edit'),
      surface: cssVar('--surface'),
      ink: cssVar('--ink'),
      ink2: cssVar('--ink-2'),
      muted: cssVar('--muted'),
    };
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    screen.w = rect.width;
    screen.h = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeTransform();
    drawMap();
  }

  // Масштаб одинаковый по обеим осям: расстояния на карте t-SNE изотропны
  function computeTransform() {
    if (!ds.tsne) return;
    const b = ds.tsne.bounds();
    const padData = 0.06, padPx = 16;
    const bw = (b.x1 - b.x0) * (1 + 2 * padData) || 1, bh = (b.y1 - b.y0) * (1 + 2 * padData) || 1;
    screen.scale = Math.min((screen.w - 2 * padPx) / bw, (screen.h - 2 * padPx) / bh);
    screen.ox = screen.w / 2 - ((b.x0 + b.x1) / 2) * screen.scale;
    screen.oy = screen.h / 2 + ((b.y0 + b.y1) / 2) * screen.scale;
  }
  const sx = (x) => screen.ox + x * screen.scale;
  const sy = (y) => screen.oy - y * screen.scale;

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  function diamond(x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.lineTo(x + r, y);
    ctx.lineTo(x, y + r);
    ctx.lineTo(x - r, y);
    ctx.closePath();
  }

  // Внезапная смерть от ССЗ или неожиданное выживание — ромб цвета фактического исхода с обводкой цветом текста
  function drawMarked(x, y, r, g) {
    diamond(x, y, r + 2);
    ctx.fillStyle = colors.surface;
    ctx.fill();
    diamond(x, y, r);
    ctx.fillStyle = colors.t[PATIENTS.target[g]];
    ctx.fill();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  function drawMap() {
    ctx.clearRect(0, 0, screen.w, screen.h);
    if (!ds.tsne) return;
    const { rows, n, disp } = ds;
    const Y = ds.tsne.Y;
    const r = n > 800 ? 3 : 4;

    // Пациенты; у каждой точки кольцо цвета фона, чтобы перекрывающиеся точки читались.
    // В режиме выделения внезапных смертей остальные точки приглушены
    ctx.lineWidth = n > 800 ? 1 : 1.5;
    ctx.strokeStyle = colors.surface;
    ctx.globalAlpha = state.highlightSudden ? 0.2 : 1;
    for (let i = 0; i < n; i++) {
      const g = rows[i];
      if (editedSet.has(g) || markedGroup(g)) continue;
      circle(sx(disp[2 * i]), sy(disp[2 * i + 1]), r);
      ctx.fillStyle = colors.t[PATIENTS.target[g]];
      ctx.fill();
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      const g = rows[i];
      if (markedGroup(g) && !editedSet.has(g)) drawMarked(sx(disp[2 * i]), sy(disp[2 * i + 1]), state.highlightSudden ? 7 : 5, g);
    }

    // Изменённые пациенты: исходное место (пустой кружок) → линия → новое положение
    for (const g of editedSet) {
      const i = ds.local[g];
      if (i < 0) continue;
      const x0 = sx(Y[2 * i]), y0 = sy(Y[2 * i + 1]);
      const x1 = sx(disp[2 * i]), y1 = sy(disp[2 * i + 1]);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.strokeStyle = colors.edit;
      ctx.lineWidth = 2;
      ctx.stroke();
      circle(x0, y0, 3.5);
      ctx.fillStyle = colors.surface;
      ctx.fill();
      ctx.strokeStyle = colors.muted;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      circle(x1, y1, 6.5);
      ctx.fillStyle = colors.edit;
      ctx.fill();
      if (markedGroup(g)) {
        drawMarked(x1, y1, 4, g);
        continue;
      }
      circle(x1, y1, 4);
      ctx.fillStyle = colors.t[PATIENTS.target[g]];
      ctx.fill();
    }

    const h = ds.local[state.hovered] ?? -1;
    if (state.hovered >= 0 && h >= 0 && state.hovered !== state.selected) {
      circle(sx(disp[2 * h]), sy(disp[2 * h + 1]), 7.5);
      ctx.strokeStyle = colors.ink2;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Выбранный пациент — обведён, с подписью
    const s = ds.local[state.selected];
    if (s < 0) return;
    const x = sx(disp[2 * s]), y = sy(disp[2 * s + 1]);
    circle(x, y, 10);
    ctx.strokeStyle = colors.surface;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    const label = `ID ${PATIENTS.id[state.selected]}`;
    ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    const width = ctx.measureText(label).width;
    const lx = x + 14 + width > screen.w ? x - 14 - width : x + 14;
    const ly = y - 12 < 12 ? y + 22 : y - 12;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors.surface;
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = colors.ink;
    ctx.fillText(label, lx, ly);
  }

  // Ближайший к указателю пациент в радиусе 16 px (глобальный индекс или −1)
  function nearest(px, py) {
    const { rows, n, disp } = ds;
    let best = -1, bestD = 16 * 16;
    for (let i = 0; i < n; i++) {
      const dx = sx(disp[2 * i]) - px, dy = sy(disp[2 * i + 1]) - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = rows[i]; }
    }
    return best;
  }

  function suddenParams(g) {
    const h = PATIENTS.sudden_horizon[g];
    const avg = COHORT_RISKS[HORIZONS.indexOf(h)];
    return {
      d: fmtDays(PATIENTS.time[g]), k: BUNDLE.meta.sudden_neighbours, share: fmtPct(PATIENTS.sudden_survived[g]),
      horizon: t(`sudden.h${h}`), risk: fmtPct(PATIENTS.sudden_risk[g]), avg: fmtPct(avg),
      ratio: ratioText(PATIENTS.sudden_risk[g], avg), top: fmtPct(PATIENTS.sudden_top_risk[g]),
      topModel: MODELS[MODEL_KEYS[PATIENTS.sudden_top_model[g]]],
    };
  }

  function unexpectedParams(g) {
    return {
      risk: fmtPct(PATIENTS.unexpected_risk[g]), time: fmtDays(PATIENTS.time[g]), tau: fmtDays(TAU),
      k: BUNDLE.meta.sudden_neighbours, died: fmtPct(PATIENTS.unexpected_died[g]),
      consensus: fmtPct(PATIENTS.unexpected_consensus[g]),
    };
  }

  // Пояснение для отмеченных групп: [заголовок, текст, краткая версия]
  function groupNote(g) {
    const group = markedGroup(g);
    if (group === 'sudden') return [t('sudden.title'), t('sudden.note', suddenParams(g)), `${t('sudden.label')}: ${t('sudden.short', suddenParams(g))}`];
    if (group === 'unexpected') return [t('unexpected.title'), t('unexpected.note', unexpectedParams(g)), `${t('unexpected.label')}: ${t('unexpected.short', unexpectedParams(g))}`];
    return null;
  }

  function showTooltip(g, px, py) {
    const m = state.model;
    const rows = [
      [days(PATIENTS.time[g]), t('tt.time')],
      [outcome(g), t('tt.outcome', { t: PATIENTS.target[g] })],
      [t('days', { n: fmtObserved(g) }), t('tt.real')],
      [daysTime(baseTime[m][g]), t('tt.pred', { model: MODELS[m] })],
      [fmtPct(baseRisk[m][g]), t('tt.risk1y')],
    ];
    if (editedSet.has(g)) rows.push([daysTime(curTime[m][g]), t('tt.predEdit')]);
    tooltip.replaceChildren(
      el('div', { class: 'tt-title' },
        el('span', { class: `dot t${PATIENTS.target[g]}` }),
        t('tt.title', { id: PATIENTS.id[g], row: ds.local[g] }) + (PATIENTS.split[g] === 2 ? t('tt.heldOut') : '')),
      ...rows.map(([value, label]) => el('div', { class: 'tt-row' }, el('b', { text: value }), el('span', { text: label }))),
      markedGroup(g) ? el('div', { class: 'tt-note' }, el('span', { class: `diamond t${PATIENTS.target[g]}` }),
        el('span', { text: groupNote(g)[2] })) : null,
    );
    tooltip.style.display = 'block';
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    tooltip.style.left = `${px + 14 + tw > screen.w ? px - 14 - tw : px + 14}px`;
    tooltip.style.top = `${clamp(py - th / 2, 0, screen.h - th)}px`;
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const g = nearest(px, py);
    if (g !== state.hovered) {
      state.hovered = g;
      drawMap();
    }
    canvas.style.cursor = g >= 0 ? 'pointer' : 'crosshair';
    if (g >= 0) showTooltip(g, px, py); else hideTooltip();
  });
  canvas.addEventListener('pointerleave', () => {
    state.hovered = -1;
    hideTooltip();
    drawMap();
  });
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const g = nearest(e.clientX - rect.left, e.clientY - rect.top);
    if (g >= 0) selectPatient(g);
  });
  canvas.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    stepPatient(step);
  });

  function updateStatus() {
    const p = state.perplexity;
    $('tsne-status').textContent =
      tsnePhase === 'affinities' ? t('status.affinities', { n: fmtDays(ds.n) })
        : tsnePhase === 'running' ? t('status.running', { i: ds.tsne.iter, p })
          : t('status.done', { p, kl: ds.kl === null ? '…' : I18N.fixed(ds.kl, 3), n: editedSet.size });
  }

  // ---------------------------------------------------------------------------
  // Прогноз для выбранного пациента: карточка, функция выживаемости, таблица моделей
  // ---------------------------------------------------------------------------
  function renderPrediction() {
    const g = state.selected, m = state.model;
    const edited = editedSet.has(g);
    const base = predictor.predict(PATIENTS.X[g], m);
    const cur = edited ? predictor.predict(state.values[g], m) : base;
    const time = PATIENTS.time[g], target = PATIENTS.target[g];

    $('prediction-sub').textContent = t('pred.sub', { id: PATIENTS.id[g], model: MODELS[m] });
    // Дата (медиана S(t)) — только если вероятность смерти от ССЗ до τ выше 50%; иначе — риск до τ
    const dated = cur.time < TAU;
    const tau = fmtDays(TAU);
    $('hero-label').textContent = t(dated ? (edited ? 'hero.edited' : 'hero.dataset')
      : (edited ? 'hero.unlikelyEdited' : 'hero.unlikely'), { model: MODELS[m], tau });
    $('hero-value').replaceChildren(dated ? fmtTime(cur.time) : fmtPct(1 - cur.sTau),
      el('span', { class: 'unit', text: dated ? t('unit.days') : t('hero.riskUnit', { tau }) }));
    if (edited && dated && base.time < TAU) {
      const diff = cur.time - base.time;
      const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '';
      $('hero-delta').replaceChildren(
        el('b', { text: `${arrow} ${diff >= 0 ? '+' : '−'}${days(Math.abs(diff))}` }),
        t('hero.delta', { v: fmtTime(base.time) }));
    } else if (edited) {
      const diff = 100 * (base.sTau - cur.sTau);
      const arrow = diff > 0.05 ? '▲' : diff < -0.05 ? '▼' : '';
      $('hero-delta').replaceChildren(
        el('b', { text: `${arrow} ${diff >= 0 ? '+' : '−'}${I18N.fixed(Math.abs(diff), 1)} ${t('unit.pp')}` }),
        t('hero.deltaRisk', { v: fmtPct(1 - base.sTau) }));
    } else {
      $('hero-delta').textContent = t('hero.hint');
    }

    const fact = (term, value, note) => el('div', {}, el('dt', { text: term }), el('dd', {}, value, el('small', { text: note })));
    const datasetOr = (format, value, note) => (edited ? t('fact.datasetValue', { v: format(value) }) : note);
    $('facts').replaceChildren(...[
      fact(t('fact.time'), days(time), t('fact.outcome', { outcome: outcome(g), t: target })),
      fact(t('fact.rmst'), days(cur.rmst), datasetOr(days, base.rmst, t('fact.rmstNote'))),
      dated ? fact(t('fact.alive'), I18N.fixed(cur.sTau, 2),
        datasetOr((v) => I18N.fixed(v, 2), base.sTau, t('fact.aliveNote', { tau: fmtDays(TAU) }))) : null,
      // Каскад и модель для balanced: вероятность их классификатора
      cur.stage && cur.stage.kind === 'cascade' ? fact(t('fact.cascadeStage', { days: fmtDays(cur.stage.days) }), fmtPct(cur.stage.p), t('fact.cascadeNote')) : null,
      cur.stage && cur.stage.kind === 'balanced' ? fact(t('fact.balStage', { tau: fmtDays(TAU) }), fmtPct(cur.stage.p), t('fact.balNote')) : null,
      // Конвейер: вероятности трёх групп классификатора и (справочно) время внутри наиболее вероятной группы
      ...(cur.stage && cur.stage.kind === 'staged' ? stagedFacts(cur.stage, fact) : []),
    ].filter(Boolean));
    // Если наблюдение закончилось до τ без смерти от ССЗ, min(T, τ) неизвестно — есть только нижняя граница
    const factKey = observed(g).exact ? 'hero.fact' : PATIENTS.death_any[g] ? 'hero.factOther' : 'hero.factCensored';
    $('hero-sub').textContent = `${t(dated ? 'hero.sub' : 'hero.horizon', { tau })} ${t(factKey, { v: observed(g).exact ? fmtObserved(g) : fmtDays(time) })}`;

    renderRiskProfile(g, cur.risks, edited ? base.risks : null, base.risks);
    const note = $('sudden-note');
    const groupText = groupNote(g);
    note.hidden = !groupText;
    note.classList.toggle('survivor', markedGroup(g) === 'unexpected');
    if (groupText) note.replaceChildren(el('b', {}, el('span', { class: `diamond t${PATIENTS.target[g]}` }), groupText[0]), groupText[1]);
    const issues = implausible(state.values[g]);
    $('quality-note').hidden = issues.length === 0;
    if (issues.length) {
      $('quality-note').replaceChildren(el('b', { text: t('quality.title') }),
        t('quality.note', {
          list: issues.map(({ f, v, lo, hi }) => {
            const { label, unit } = I18N.feature(f);
            return t('quality.item', { label, v: I18N.num(v), unit: unit || '', lo: I18N.num(lo), hi: I18N.num(hi) });
          }).join('; '),
        }));
    }

    renderSurvivalChart(g, base.curve, edited ? cur.curve : null);
    renderModelTable();
    renderMiniSummary();
  }

  const STAGED_GROUPS = ['early', 'late', 'survive'];
  function stagedFacts(stage, fact) {
    const params = { days: fmtDays(stage.days), next: fmtDays(stage.days + 1), last: fmtDays(TAU - 1), tau: fmtDays(TAU) };
    const probs = STAGED_GROUPS.map((key, k) => `${t(`stg.${key}`, params)} ${fmtPct(stage.P[k])}`).join(' · ');
    // Кластер всей когорты: признаки, сильнее всего отличающие его пациентов от среднего (↑ — выше, ↓ — ниже);
    // отличия меньше 0,5σ не показываем — у основного кластера типичных пациентов их нет
    const distinct = stage.clusterProfile.filter(({ z }) => Math.abs(z) >= 0.5);
    const profile = distinct.length
      ? distinct.map(({ feature, z }) => `${I18N.feature(feature).label} ${z > 0 ? '↑' : '↓'}`).join(', ')
      : t('fact.stgClusterTypical');
    return [
      fact(t('fact.stgGroup'), el('span', { class: 'fact-text', text: t(`stg.${STAGED_GROUPS[stage.group]}`, params) }), probs),
      fact(t('fact.stgCluster'), el('span', { class: 'fact-text', text: profile }), t('fact.stgClusterNote', {
        c: stage.cluster + 1, k: BUNDLE.models.stg.clusters.n.length, days: params.days,
        early: fmtDays(stage.clusterEarly), n: fmtDays(stage.clusterN),
      })),
      fact(t('fact.stgRoute'), daysTime(stage.routeTime), t('fact.stgRouteNote')),
    ];
  }

  // Риски смерти от ССЗ к срокам: полоса — пациент, штрих — среднее по когорте; шкала 0–PROFILE_SCALE
  const PROFILE_SCALE = 0.5;
  const scalePct = (p) => `${(100 * Math.min(p / PROFILE_SCALE, 1)).toFixed(1)}%`;
  function renderRiskProfile(g, risks, datasetRisks, baseRisks) {
    const risk1y = risks[risks.length - 1];
    $('risk-profile').replaceChildren(
      el('div', { class: 'profile-title', text: t('profile.title', { scale: fmtPct(PROFILE_SCALE) }) }),
      el('div', { class: 'profile-group' }, t('profile.group'), ' ', el('b', { text: riskGroupLabel(risk1y) }),
        datasetRisks ? ` · ${t('profile.dataset', { v: riskGroupLabel(datasetRisks[datasetRisks.length - 1]) })}` : ''),
      ...risks.map((p, k) => el('div', { class: 'profile-row' },
        el('span', { class: 'profile-label', text: t(`profile.h${HORIZONS[k]}`) }),
        el('span', { class: 'profile-track' },
          el('span', { class: 'profile-bar t1', style: `width:${scalePct(p)}` }),
          el('span', { class: 'profile-cohort', style: `left:${scalePct(COHORT_RISKS[k])}`, title: t('profile.cohort') })),
        el('b', { text: fmtPct(p) }),
        el('small', { text: datasetRisks ? t('profile.dataset', { v: fmtPct(datasetRisks[k]) }) : ratioText(p, COHORT_RISKS[k]) }))),
      outcomeVsRisk(g, baseRisks),
    );
  }

  // Исход пациента рядом с риском, который модель давала по значениям датасета: вместо ошибки даты
  function outcomeVsRisk(g, risks) {
    const time = PATIENTS.time[g], last = HORIZONS.length - 1;
    let text = null;
    if (PATIENTS.target[g] && time <= HORIZONS[last]) {
      const k = HORIZONS.findIndex((h) => time <= h);
      text = t('profile.death', { d: fmtDays(time), h: t(`profile.h${HORIZONS[k]}`).toLowerCase(), p: fmtPct(risks[k]),
        ratio: ratioText(risks[k], COHORT_RISKS[k]) });
    } else if (PATIENTS.target[g]) {
      text = t('profile.deathLate', { d: fmtDays(time), p: fmtPct(risks[last]) });
    } else if (time > HORIZONS[last]) {
      text = t('profile.survived', { d: fmtDays(time), p: fmtPct(risks[last]) });
    }
    return text ? el('div', { class: 'profile-outcome', text }) : null;
  }

  // Метрики моделей к выбранному сроку — на отложенных пациентах всей когорты
  function renderModelTable() {
    const g = state.selected;
    const edited = editedSet.has(g);
    const metrics = BUNDLE.metrics, j = state.horizon;
    $('model-table').tBodies[0].replaceChildren(...MODEL_KEYS.map((m) => {
      const radio = el('input', { type: 'radio', name: 'model-radio', value: m, checked: m === state.model });
      radio.addEventListener('change', () => setModel(m));
      const tr = el('tr', { class: m === state.model ? 'active' : '' },
        el('td', {}, el('label', {}, radio, MODELS[m])),
        el('td', { text: I18N.fixed(metrics[m].c_index, 3) }),
        el('td', { text: I18N.fixed(metrics[m].auc[j], 3) }),
        el('td', { text: I18N.fixed(metrics[m].eo[j], 2) }),
        el('td', { text: I18N.fixed(metrics[m].ibs, 4) }),
        el('td', { text: t('days.short', { n: fmtTime(baseTime[m][g]) }) }),
        el('td', { text: edited ? t('days.short', { n: fmtTime(curTime[m][g]) }) : '—' }));
      tr.addEventListener('click', (e) => { if (e.target !== radio) setModel(m); });
      return tr;
    }));
    const r = metrics[state.model], deaths = BUNDLE.meta.test_deaths[j];
    $('models-note').textContent = t('models.note', {
      n: BUNDLE.meta.test_size, model: MODELS[state.model], h: t(`profile.h${HORIZONS[j]}`).toLowerCase(),
      auc: I18N.fixed(r.auc[j], 3), eo: I18N.fixed(r.eo[j], 2), c: I18N.fixed(r.c_index, 3), ibs: I18N.fixed(r.ibs, 4),
      deaths: fmtDays(deaths),
    }) + (deaths < 20 ? t('models.few') : '.');
    renderCalibration();
  }

  // Прогноз и факт по группам риска для выбранной модели — прогнозы вне выборки на обучающей когорте
  function renderCalibration() {
    const m = state.model, j = state.horizon;
    const groups = BUNDLE.calibration[m];
    const patientGroup = predictor.riskGroup(baseRisk[m][state.selected]);
    $('calib-title').textContent = t('calib.title', { model: MODELS[m] });
    $('calib-table').tHead.rows[0].replaceChildren(
      el('th', { scope: 'col', text: t('calib.group') }), el('th', { scope: 'col', text: t('calib.n') }),
      ...HORIZONS.map((h, k) => el('th', { scope: 'col', class: k === j ? 'active' : '', text: t(`horizon.${h}`) })));
    $('calib-table').tBodies[0].replaceChildren(...groups.map((grp, i) => el('tr', { class: i === patientGroup ? 'active' : '' },
      el('td', { text: t(`riskgroup.${i}`) }),
      el('td', { text: fmtDays(grp.n) }),
      ...HORIZONS.map((_, k) => el('td', { class: k === j ? 'active' : '',
        text: grp.n ? `${fmtPct(grp.pred[k])} / ${fmtPct(grp.obs[k])}` : '—' })))));
    const cv = BUNDLE.metrics_cv[m], meta = BUNDLE.meta;
    $('calib-note').textContent = t('calib.note', {
      n: fmtDays(meta.cv_size), folds: meta.cv_folds, d1: fmtDays(meta.cv_deaths[0]), d12: fmtDays(meta.cv_deaths[meta.cv_deaths.length - 1]),
      h: t(`profile.h${HORIZONS[j]}`).toLowerCase(), auc: I18N.fixed(cv.auc[j], 3), eo: I18N.fixed(cv.eo[j], 2),
    });
    renderConfusion();
  }

  // Матрица ошибок групп риска за 12 месяцев для выбранной модели: строка — группа по прогнозу (вне выборки), столбец —
  // по «реальному» риску (доля умерших от ССЗ среди похожих пациентов); справа и снизу — фактическая смертность
  function renderConfusion() {
    const m = state.model, g = state.selected, conf = BUNDLE.confusion;
    const cells = conf.models[m].cells;  // [прогноз][«реальная»] = [пациентов, умерли от ССЗ за 12 мес., исход известен]
    const K = cells.length, groups = [...Array(K).keys()];
    const add = (a, b) => a.map((v, k) => v + b[k]);
    const sumOf = (list) => list.reduce(add, [0, 0, 0]);
    const rowSum = groups.map((i) => sumOf(cells[i]));
    const colSum = groups.map((j) => sumOf(groups.map((i) => cells[i][j])));
    const total = sumOf(rowSum);
    const where = (test) => sumOf(groups.flatMap((i) => groups.filter((j) => test(i, j)).map((j) => cells[i][j])));
    const rate = ([, died, known]) => (known ? fmtPct(died / known) : '—');
    const label = (i) => t(`riskgroup.${i}`);
    const patientRow = predictor.riskGroup(baseRisk[m][g]), patientCol = predictor.riskGroup(PATIENTS.real_risk[g]);

    $('confusion-title').textContent = t('confusion.title', { model: MODELS[m] });
    $('confusion-table').tHead.rows[0].replaceChildren(
      el('th', { scope: 'col', text: t('confusion.corner') }),
      ...groups.map((j) => el('th', { scope: 'col', class: j === patientCol ? 'active' : null, text: label(j) })),
      el('th', { scope: 'col', text: t('confusion.total') }), el('th', { scope: 'col', class: 'fact', text: t('confusion.died') }));
    // Ячейка: число пациентов и доля умерших среди них; заливка — доля пациентов строки
    $('confusion-table').tBodies[0].replaceChildren(...groups.map((i) => el('tr', { class: i === patientRow ? 'active' : null },
      el('td', { text: label(i) }),
      ...groups.map((j) => el('td', {
        class: ['cell', i === j ? 'diag' : '', i === patientRow && j === patientCol ? 'patient' : ''].join(' ').trim(),
        style: `--share: ${rowSum[i][0] ? (cells[i][j][0] / rowSum[i][0]).toFixed(3) : 0}`,
      }, fmtDays(cells[i][j][0]), cells[i][j][2] ? el('small', { text: rate(cells[i][j]) }) : null)),
      el('td', { text: fmtDays(rowSum[i][0]) }),
      el('td', { class: 'fact', text: rate(rowSum[i]) }))));
    $('confusion-table').tFoot.replaceChildren(
      el('tr', {}, el('td', { text: t('confusion.total') }), ...colSum.map((c) => el('td', { text: fmtDays(c[0]) })),
        el('td', { text: fmtDays(total[0]) }), el('td', { class: 'fact', text: rate(total) })),
      el('tr', {}, el('td', { text: t('confusion.died') }), ...colSum.map((c) => el('td', { text: rate(c) })),
        el('td', {}), el('td', { class: 'fact' })));

    // Взвешенная (квадратичная) каппа Коэна: согласие групп с поправкой на случайное совпадение
    let disagreement = 0, chance = 0;
    for (const i of groups) {
      for (const j of groups) {
        const w = ((i - j) / (K - 1)) ** 2;
        disagreement += w * cells[i][j][0];
        chance += w * rowSum[i][0] * colSum[j][0] / total[0];
      }
    }
    const agree = where((i, j) => i === j);
    $('confusion-summary').textContent = t('confusion.summary', {
      agree: fmtPct(agree[0] / total[0]), near: fmtPct(where((i, j) => Math.abs(i - j) === 1)[0] / total[0]),
      kappa: I18N.fixed(1 - disagreement / chance, 2), k: conf.neighbours,
      auc: I18N.fixed(conf.models[m].auc, 2), aucReal: I18N.fixed(conf.real_auc, 2),
      up: rate(where((i, j) => i > j)), down: rate(where((i, j) => i < j)), same: rate(agree),
    }) + ' ' + t('confusion.patient', {
      id: PATIENTS.id[g], pred: fmtPct(baseRisk[m][g]), predGroup: label(patientRow), k: conf.neighbours,
      real: fmtPct(PATIENTS.real_risk[g]), realGroup: label(patientCol),
    });
    $('confusion-note').textContent = t('confusion.note', { k: conf.neighbours, n: fmtDays(total[0]) });
  }

  function renderMiniSummary() {
    const g = state.selected, m = state.model;
    const edited = editedSet.has(g);
    const predicted = edited
      ? [el('b', { text: fmtTime(baseTime[m][g]) }), ' → ', el('b', { text: daysTime(curTime[m][g]) })]
      : [el('b', { text: daysTime(baseTime[m][g]) })];
    $('mini-summary').replaceChildren(
      el('span', {}, t('mini.time'), el('b', { text: days(PATIENTS.time[g]) })),
      el('span', {}, t('mini.pred', { model: MODELS[m] }), ...predicted),
    );
  }

  // Функция выживаемости S(t): по значениям датасета и (если есть) с изменениями
  let chartData = null;
  function renderSurvivalChart(g, baseCurve, editCurve) {
    chartData = { g, baseCurve, editCurve, time: PATIENTS.time[g], target: PATIENTS.target[g] };
    drawSurvivalChart();
  }

  function drawSurvivalChart() {
    const host = $('survival-chart');
    if (!chartData) return;
    const { g, baseCurve, editCurve, time, target } = chartData;
    const W = host.clientWidth || 600, H = 250;
    const m = { l: 40, r: 14, t: 24, b: 30 };
    const x = (day) => m.l + (day / TAU) * (W - m.l - m.r);
    const y = (s) => m.t + (1 - s) * (H - m.t - m.b);
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, tabindex: 0, role: 'img',
      'aria-label': t('chart.aria', { id: PATIENTS.id[state.selected] }) });

    for (const s of [0, 0.25, 0.5, 0.75, 1]) {
      root.append(svg('line', { class: s === 0 ? 'ax-base' : 'ax-grid', x1: m.l, x2: W - m.r, y1: y(s), y2: y(s) }));
      root.append(svg('text', { class: 'ax-text', x: m.l - 8, y: y(s) + 4, 'text-anchor': 'end', text: I18N.fixed(s, 2) }));
    }
    for (let day = 0; day <= TAU; day += 250) {
      root.append(svg('text', { class: 'ax-text', x: x(day), y: H - m.b + 16, 'text-anchor': 'middle', text: fmtDays(day) }));
    }
    root.append(svg('text', { class: 'ax-title', x: m.l, y: 12, text: t('chart.y') }));
    root.append(svg('text', { class: 'ax-title', x: W - m.r, y: H - 2, 'text-anchor': 'end', text: t('chart.x') }));

    const path = (curve) => {
      let d = '';
      for (let day = 0; day < curve.length; day += 3) d += `${day ? 'L' : 'M'}${x(day).toFixed(1)},${y(curve[day]).toFixed(1)}`;
      return d + `L${x(curve.length - 1).toFixed(1)},${y(curve[curve.length - 1]).toFixed(1)}`;
    };
    const shown = editCurve || baseCurve;
    root.append(svg('path', { class: `area ${editCurve ? 'edit' : 'base'}`, d: `${path(shown)}L${x(TAU - 1)},${y(0)}L${x(0)},${y(0)}Z` }));
    root.append(svg('path', { class: 'curve base', d: path(baseCurve) }));
    if (editCurve) root.append(svg('path', { class: 'curve edit', d: path(editCurve) }));

    // Время из датасета: событие или цензурирование до τ — вертикальная линия, иначе подпись у правого края.
    // Подпись ставим сверху или снизу — туда, где в этот момент нет кривых
    const at = Math.min(time, TAU - 1);
    const curvesAt = [baseCurve[at], ...(editCurve ? [editCurve[at]] : [])];
    const labelY = Math.max(...curvesAt) < 0.7 ? y(1) + 12 : Math.min(...curvesAt) > 0.3 ? y(0) - 8 : y(0.5) + 4;
    // На узком графике подпись — в две строки (ширина оценивается по числу символов: SVG ещё не в документе)
    const eventLabel = (text, lx, anchor, room) => {
      const cut = text.length * 6.2 > room ? text.lastIndexOf(' ', Math.ceil(text.length / 2)) : -1;
      const lines = cut > 0 ? [text.slice(0, cut), text.slice(cut + 1)] : [text];
      const node = svg('text', { class: 'event-label', y: labelY > y(0.5) ? labelY - 14 * (lines.length - 1) : labelY, 'text-anchor': anchor });
      lines.forEach((line, k) => node.append(svg('tspan', { x: lx, dy: k ? 14 : 0, text: line })));
      root.append(node);
    };
    if (time < TAU) {
      root.append(svg('line', { class: 'event-line', x1: x(time), x2: x(time), y1: y(1), y2: y(0) }));
      const right = x(time) < W * 0.6;
      eventLabel(t(target ? 'chart.deathBefore' : PATIENTS.death_any[g] ? 'chart.otherBefore' : 'chart.censoredBefore', { d: fmtDays(time) }),
        x(time) + (right ? 6 : -6), right ? 'start' : 'end', right ? W - m.r - x(time) - 6 : x(time) - 6 - m.l);
    } else {
      eventLabel(t(target ? 'chart.deathAfter' : 'chart.aliveAfter', { d: fmtDays(time) }), W - m.r - 4, 'end', W - 2 * m.r - 4 - m.l);
    }

    const cross = svg('g', { visibility: 'hidden' });
    const crossLine = svg('line', { class: 'crosshair', y1: y(1), y2: y(0) });
    const dotBase = svg('circle', { class: 'cross-dot base', r: 4.5 });
    const dotEdit = svg('circle', { class: 'cross-dot edit', r: 4.5 });
    cross.append(crossLine, dotBase);
    if (editCurve) cross.append(dotEdit);
    root.append(cross);
    const hit = svg('rect', { x: m.l, y: m.t, width: W - m.l - m.r, height: H - m.t - m.b, fill: 'transparent' });
    root.append(hit);

    const tip = el('div', { class: 'tooltip' });
    let current = -1;
    const show = (day) => {
      current = clamp(Math.round(day), 0, TAU - 1);
      const cx = x(current);
      crossLine.setAttribute('x1', cx);
      crossLine.setAttribute('x2', cx);
      dotBase.setAttribute('cx', cx);
      dotBase.setAttribute('cy', y(baseCurve[current]));
      if (editCurve) {
        dotEdit.setAttribute('cx', cx);
        dotEdit.setAttribute('cy', y(editCurve[current]));
      }
      cross.setAttribute('visibility', 'visible');
      const rows = [[baseCurve[current], t('chart.sBase'), cssVar('--ink-2')]];
      if (editCurve) rows.push([editCurve[current], t('chart.sEdit'), cssVar('--edit')]);
      tip.replaceChildren(el('div', { class: 'tt-title', text: t('chart.day', { d: fmtDays(current) }) }),
        ...rows.map(([v, label, color]) => el('div', { class: 'tt-row' },
          el('span', { class: 'tt-key', style: `background:${color}` }), el('b', { text: I18N.fixed(v, 3) }), el('span', { text: label }))));
      tip.style.display = 'block';
      const tw = tip.offsetWidth;
      tip.style.left = `${cx + 12 + tw > W ? cx - 12 - tw : cx + 12}px`;
      tip.style.top = `${m.t}px`;
    };
    const hide = () => {
      cross.setAttribute('visibility', 'hidden');
      tip.style.display = 'none';
      current = -1;
    };
    hit.addEventListener('pointermove', (e) => {
      const rect = root.getBoundingClientRect();
      show(((e.clientX - rect.left - m.l) / (W - m.l - m.r)) * TAU);
    });
    hit.addEventListener('pointerleave', hide);
    root.addEventListener('blur', hide);
    root.addEventListener('keydown', (e) => {
      const step = { ArrowRight: 30, ArrowLeft: -30, PageUp: 365, PageDown: -365 }[e.key];
      if (!step) return;
      e.preventDefault();
      show((current < 0 ? 0 : current) + step);
    });

    host.replaceChildren(root, tip);
    $('survival-legend').replaceChildren(...(editCurve
      ? [el('span', { class: 'key' }, el('span', { class: 'line-key', style: `background:${cssVar('--ink-2')}` }), t('chart.legendBase')),
        el('span', { class: 'key' }, el('span', { class: 'line-key', style: `background:${cssVar('--edit')}` }), t('chart.legendEdit'))]
      : []));
  }

  // ---------------------------------------------------------------------------
  // Редактор параметров
  // ---------------------------------------------------------------------------
  // Диапазон ползунков — по полному датасету, чтобы он не менялся при переключении датасета
  const ranges = FEATURES.map((_, k) => {
    let lo = Infinity, hi = -Infinity;
    for (const x of PATIENTS.X) { lo = Math.min(lo, x[k]); hi = Math.max(hi, x[k]); }
    return [lo, hi];
  });
  const inputs = {}; // feature → { row, range, num, reset, orig }

  function encoding(text) {
    if (text.levels) return text.levels.map((name, v) => `${v} ${name}`).join(', ');
    return text.unit;
  }

  // Строится заново при смене языка
  function buildEditor() {
    const list = $('param-list');
    list.replaceChildren();
    for (const group of GROUPS) {
      const section = el('div', { class: 'group' }, el('h3', { text: t(`group.${group}`) }));
      for (const f of FEATURES.filter((name) => FEATURE_INFO[name].group === group)) {
        const k = FEATURES.indexOf(f);
        const text = I18N.feature(f);
        const [lo, hi] = ranges[k];
        const step = text.levels ? 1 : FEATURE_INFO[f].step;
        const range = el('input', { type: 'range', min: lo, max: hi, step, id: `range-${f}`, 'aria-label': t('param.slider', { label: text.label }) });
        const num = el('input', { type: 'number', step: 'any', id: `num-${f}`, inputmode: 'decimal' });
        const reset = el('button', { class: 'reset', type: 'button', 'aria-label': t('param.reset', { label: text.label }), title: t('param.resetTitle'), text: '↺' });
        const orig = el('span', { class: 'param-orig' });
        const used = MODEL_FEATURES.has(f);
        const row = el('div', { class: used ? 'param' : 'param unused' },
          el('div', { class: 'param-head' },
            el('span', { class: 'param-name' },
              el('label', { for: `num-${f}`, text: text.label }), el('code', { text: f }),
              el('span', { class: 'param-enc', text: ` · ${encoding(text)}${used ? '' : ` · ${t('param.notUsed')}`}` })),
            orig),
          range, num, reset);

        range.addEventListener('input', () => {
          num.value = range.value;
          num.removeAttribute('aria-invalid');
          setValue(k, parseFloat(range.value));
        });
        num.addEventListener('input', () => {
          const v = parseFloat(num.value);
          if (!Number.isFinite(v)) {
            num.setAttribute('aria-invalid', 'true');
            return;
          }
          num.removeAttribute('aria-invalid');
          range.value = clamp(v, lo, hi);
          setValue(k, v);
        });
        num.addEventListener('blur', () => {
          if (num.getAttribute('aria-invalid')) {
            num.value = fmtValue(state.values[state.selected][k]);
            num.removeAttribute('aria-invalid');
          }
        });
        reset.addEventListener('click', () => {
          const v = PATIENTS.X[state.selected][k];
          range.value = v;
          num.value = fmtValue(v);
          setValue(k, v);
        });
        inputs[f] = { row, range, num, reset, orig };
        section.append(row);
      }
      list.append(section);
    }
  }

  // Синхронизировать поля с выбранным пациентом; поле, в котором сейчас печатают, не трогаем
  function syncEditor() {
    const g = state.selected;
    FEATURES.forEach((f, k) => {
      const { row, range, num, reset, orig } = inputs[f];
      const v = state.values[g][k], o = PATIENTS.X[g][k];
      const { levels } = I18N.feature(f);
      if (document.activeElement !== num) num.value = fmtValue(v);
      if (document.activeElement !== range) range.value = v;
      const edited = v !== o;
      row.classList.toggle('edited', edited);
      reset.disabled = !edited;
      const level = levels && levels[o] !== undefined ? ` (${levels[o]})` : '';
      const bounds = PLAUSIBLE[f];
      const bad = Boolean(bounds) && (v < bounds[0] || v > bounds[1]);
      row.classList.toggle('implausible', bad);
      orig.textContent = (edited ? t('param.datasetValue', { v: I18N.num(o) }) + level : t('param.dataset') + level)
        + (bad ? ` · ${t('param.implausible', { lo: I18N.num(bounds[0]), hi: I18N.num(bounds[1]) })}` : '');
    });
  }

  function renderPatientBar() {
    const g = state.selected;
    const i = ds.local[g];
    const idInput = $('patient-id');
    if (document.activeElement !== idInput) idInput.value = PATIENTS.id[g];
    $('patient-row').max = ds.n - 1;
    $('patient-row').value = i;
    $('patient-row-out').textContent = t('patient.rowOf', { i: fmtDays(i), max: fmtDays(ds.n - 1) });
    const nEdited = editedSet.has(g) ? editedFeatures(g).length : 0;
    const resetBtn = el('button', { type: 'button', disabled: nEdited === 0, text: t('patient.reset') });
    resetBtn.addEventListener('click', () => resetPatient(g));
    $('patient-badges').replaceChildren(...[
      el('span', { class: 'badge' }, el('span', { class: `dot t${PATIENTS.target[g]}` }),
        t('fact.outcome', { outcome: outcome(g), t: PATIENTS.target[g] })),
      el('span', { class: 'badge', text: t(SPLIT_KEYS[PATIENTS.split[g]]) }),
      nEdited ? el('span', { class: 'badge' }, el('span', { class: 'ring-sm' }), t('patient.edited', { n: nEdited })) : null,
      resetBtn,
    ].filter(Boolean));
  }

  // ---------------------------------------------------------------------------
  // Табличное представление выбранного датасета
  // ---------------------------------------------------------------------------
  let tableRows = []; // по локальному индексу
  const sortState = { key: 'row', dir: 1 };
  const COLUMNS = [
    ['row', 'table.row', (g) => ds.local[g]],
    ['id', 'table.id', (g) => PATIENTS.id[g]],
    ['target', 'table.outcome', (g) => PATIENTS.target[g]],
    ['time', 'table.time', (g) => PATIENTS.time[g]],
    ['real', 'table.real', (g) => observed(g).value],
    ['pred', 'table.pred', (g) => baseTime[state.model][g]],
    ['risk', 'table.risk', (g) => baseRisk[state.model][g]],
    ['group', 'table.group', (g) => baseRisk[state.model][g]],
    ['edited', 'table.edit', (g) => (editedSet.has(g) ? curTime[state.model][g] : -1)],
  ];

  function buildTableHead() {
    const head = $('patients-table').tHead.rows[0];
    for (const [key] of COLUMNS) {
      const button = el('button', { type: 'button' });
      button.addEventListener('click', () => {
        sortState.dir = sortState.key === key ? -sortState.dir : 1;
        sortState.key = key;
        sortTable();
      });
      head.append(el('th', { scope: 'col' }, button));
    }
  }

  function buildTableBody() {
    tableRows = Array.from(ds.rows, (g) => {
      const tr = el('tr', { tabindex: 0 });
      tr.addEventListener('click', () => selectPatient(g));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectPatient(g); });
      return tr;
    });
    for (const g of ds.rows) updateTableRow(g);
    $('patients-table').tBodies[0].replaceChildren(...tableRows);
    sortTable();
  }

  function updateTableRow(g) {
    const i = ds.local[g];
    if (i < 0 || !tableRows[i]) return;
    const m = state.model;
    tableRows[i].classList.toggle('active', g === state.selected);
    tableRows[i].replaceChildren(
      el('td', { text: i }),
      el('td', { text: PATIENTS.id[g] }),
      el('td', {}, el('span', { class: 'outcome' }, el('span', { class: `dot t${PATIENTS.target[g]}` }), outcome(g),
        markedGroup(g) ? el('span', { class: `diamond t${PATIENTS.target[g]}`, title: t(`${markedGroup(g)}.label`) }) : null)),
      el('td', { text: fmtDays(PATIENTS.time[g]) }),
      el('td', { text: fmtObserved(g) }),
      el('td', { text: fmtTime(baseTime[m][g]) }),
      el('td', { text: fmtPct(baseRisk[m][g]) }),
      el('td', { text: riskGroupLabel(baseRisk[m][g]) }),
      el('td', { text: editedSet.has(g) ? fmtTime(curTime[m][g]) : '—' }),
    );
  }

  function sortTable() {
    const value = COLUMNS.find(([key]) => key === sortState.key)[2];
    const order = Array.from(ds.rows).sort((a, b) => (value(a) - value(b)) * sortState.dir || ds.local[a] - ds.local[b]);
    $('patients-table').tBodies[0].append(...order.map((g) => tableRows[ds.local[g]]));
    [...$('patients-table').tHead.rows[0].cells].forEach((th, c) => {
      const sorted = COLUMNS[c][0] === sortState.key;
      th.setAttribute('aria-sort', sorted ? (sortState.dir > 0 ? 'ascending' : 'descending') : 'none');
      th.firstChild.textContent = t(COLUMNS[c][1]) + (sorted ? (sortState.dir > 0 ? ' ▲' : ' ▼') : '');
    });
  }

  // ---------------------------------------------------------------------------
  // Действия
  // ---------------------------------------------------------------------------
  function selectPatient(g) {
    const previous = state.selected;
    state.selected = g;
    $('patient-msg').textContent = '';
    updateTableRow(previous);
    updateTableRow(g);
    syncEditor();
    renderPatientBar();
    renderPrediction();
    drawMap();
    save();
  }

  function stepPatient(step) {
    const i = ds.local[state.selected];
    selectPatient(ds.rows[(i + step + ds.n) % ds.n]);
  }

  function patientChanged(g) {
    refreshTime(g);
    placeEdited(g);
    animate();
    updateTableRow(g);
    syncEditor();
    renderPatientBar();
    renderPrediction();
    updateStatus();
    $('reset-all').disabled = editedSet.size === 0;
    save();
  }

  function setValue(k, v) {
    state.values[state.selected][k] = v;
    patientChanged(state.selected);
  }

  function resetPatient(g) {
    state.values[g] = PATIENTS.X[g].slice();
    patientChanged(g);
  }

  function resetAll() {
    for (const g of [...editedSet]) {
      state.values[g] = PATIENTS.X[g].slice();
      patientChanged(g);
    }
  }

  function setModel(m) {
    state.model = m;
    state.models[state.dataset] = m;
    $('model-select').value = m;
    for (const g of ds.rows) updateTableRow(g);
    sortTable();
    renderPrediction();
    save();
  }

  function setPerplexity(p) {
    state.perplexity = clamp(Math.round(p), 2, 100);
    $('perplexity-range').value = state.perplexity;
    if (document.activeElement !== $('perplexity-num')) $('perplexity-num').value = state.perplexity;
    save();
    clearTimeout(setPerplexity.timer);
    setPerplexity.timer = setTimeout(startTSNE, 120);
  }

  function setDataset(key) {
    if (key === state.dataset || !DATASETS[key]) return;
    // Недосчитанная карта прежнего датасета больше не нужна
    if (tsnePhase !== 'done') ds.perplexity = null;
    tsneToken++;
    state.dataset = key;
    ds = getView(key);
    $('dataset-select').value = key;
    state.model = state.models[key];
    $('model-select').value = state.model;
    if (ds.local[state.selected] < 0) state.selected = ds.rows[0];
    state.hovered = -1;
    hideTooltip();
    buildTableBody();
    renderTexts();
    if (ds.tsne && ds.perplexity === state.perplexity) {
      // Карта этого датасета уже посчитана — показываем её, расставив изменённых пациентов
      tsnePhase = 'done';
      ds.pos.set(ds.tsne.Y);
      for (const g of editedSet) placeEdited(g);
      ds.disp.set(ds.pos);
      computeTransform();
      updateStatus();
    } else {
      startTSNE();
    }
    selectPatient(state.selected);
  }

  // Выгрузка выбранного датасета с изменениями и прогнозом времени всех моделей
  function downloadCsv() {
    const columns = BUNDLE.columns;
    const header = ['', ...columns, 'edited', ...MODEL_KEYS.flatMap((m) => [`predicted_time_${m}`, `risk_1y_${m}`])];
    const lines = [header.join(',')];
    for (const g of ds.rows) {
      const cells = [PATIENTS.id[g]];
      for (const c of columns) {
        if (c === 'time') cells.push(PATIENTS.time[g]);
        else if (c === 'target') cells.push(PATIENTS.target[g]);
        else cells.push(state.values[g][FEATURES.indexOf(c)]);
      }
      cells.push(editedSet.has(g) ? 1 : 0, ...MODEL_KEYS.flatMap((m) => [curTime[m][g], curRisk[m][g].toFixed(4)]));
      lines.push(cells.join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
    const a = el('a', { href: url, download: `${ds.file.replace(/\.\w+$/, '')}_edited.csv` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function effectiveDark() {
    const theme = document.documentElement.dataset.theme;
    return theme ? theme === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  function themeChanged() {
    readColors();
    drawMap();
    drawSurvivalChart();
    $('theme-toggle').setAttribute('aria-label', t(effectiveDark() ? 'theme.toLight' : 'theme.toDark'));
  }

  // Тексты, которые собирает сам скрипт (статичные переводит I18N.applyStatic)
  function renderTexts() {
    $('legend-t0').textContent = t('legend.t0', { n: fmtDays(ds.counts[0]) });
    $('legend-t1').textContent = t('legend.t1', { n: fmtDays(ds.counts[1]) });
    $('legend-sudden').textContent = t('sudden.legend', { n: fmtDays(ds.rows.reduce((sum, g) => sum + PATIENTS.sudden[g], 0)) });
    $('legend-unexpected').textContent = t('unexpected.legend', { n: fmtDays(ds.rows.reduce((sum, g) => sum + PATIENTS.unexpected[g], 0)) });
    $('generated').textContent = t('footer.generated', { date: BUNDLE.meta.generated });
    $('theme-toggle').setAttribute('aria-label', t(effectiveDark() ? 'theme.toLight' : 'theme.toDark'));
    for (const option of $('dataset-select').options) {
      option.textContent = t(`dataset.${option.value}`, { n: fmtDays(getView(option.value).n) });
    }
    for (const option of $('horizon-select').options) option.textContent = t(`horizon.${HORIZONS[option.value]}`);
    updateStatus();
  }

  function setLang(lang) {
    if (lang === I18N.lang) return;
    I18N.setLang(lang);
    // Ссылка в адресной строке ведёт на ту же языковую версию
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      window.history.replaceState(null, '', url);
    } catch (e) { /* например, file:// — адрес не меняем */ }
    $('patient-msg').textContent = '';
    renderTexts();
    buildEditor();
    syncEditor();
    renderPatientBar();
    renderPrediction();
    for (const g of ds.rows) updateTableRow(g);
    sortTable();
    hideTooltip();
    save();
  }

  // ---------------------------------------------------------------------------
  // Инициализация
  // ---------------------------------------------------------------------------
  function init() {
    const datasetSelect = $('dataset-select');
    for (const key of Object.keys(DATASETS)) datasetSelect.append(el('option', { value: key }));
    datasetSelect.value = state.dataset;
    datasetSelect.addEventListener('change', () => setDataset(datasetSelect.value));
    // Срок, к которому показываются метрики моделей
    const horizonSelect = $('horizon-select');
    HORIZONS.forEach((_, k) => horizonSelect.append(el('option', { value: k })));
    horizonSelect.value = state.horizon;
    horizonSelect.addEventListener('change', () => {
      state.horizon = Number(horizonSelect.value);
      renderModelTable();
      save();
    });
    renderTexts();
    document.querySelectorAll('[data-lang]').forEach((button) => {
      button.addEventListener('click', () => setLang(button.dataset.lang));
    });

    const select = $('model-select');
    for (const m of MODEL_KEYS) select.append(el('option', { value: m, text: MODELS[m] }));
    select.value = state.model;
    select.addEventListener('change', () => setModel(select.value));

    $('perplexity-range').value = state.perplexity;
    $('perplexity-num').value = state.perplexity;
    $('perplexity-range').addEventListener('input', (e) => setPerplexity(+e.target.value));
    $('perplexity-num').addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (Number.isFinite(v) && v >= 2 && v <= 100) setPerplexity(v);
    });
    $('perplexity-num').addEventListener('blur', (e) => { e.target.value = state.perplexity; });

    $('patient-row').addEventListener('input', (e) => selectPatient(ds.rows[+e.target.value]));
    $('prev-patient').addEventListener('click', () => stepPatient(-1));
    $('next-patient').addEventListener('click', () => stepPatient(1));
    $('patient-id').addEventListener('change', (e) => {
      const g = indexById.get(Number(e.target.value));
      if (g !== undefined && ds.local[g] >= 0) selectPatient(g);
      else if (g !== undefined) $('patient-msg').textContent = t('patient.notInDataset', { id: e.target.value, file: ds.file });
      else $('patient-msg').textContent = t('patient.notFound', { id: e.target.value });
    });

    $('reset-all').addEventListener('click', resetAll);
    $('highlight-sudden').checked = state.highlightSudden;
    $('highlight-sudden').addEventListener('change', (e) => {
      state.highlightSudden = e.target.checked;
      drawMap();
      save();
    });
    $('reset-all').disabled = editedSet.size === 0;
    $('download').addEventListener('click', downloadCsv);

    $('theme-toggle').addEventListener('click', () => {
      state.theme = effectiveDark() ? 'light' : 'dark';
      document.documentElement.dataset.theme = state.theme;
      themeChanged();
      save();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged);

    buildEditor();
    buildTableHead();
    buildTableBody();
    readColors();
    themeChanged();
    selectPatient(state.selected);

    new ResizeObserver(resizeCanvas).observe($('map-wrap'));
    let chartWidth = 0;
    new ResizeObserver(() => {
      const w = $('survival-chart').clientWidth;
      if (w !== chartWidth) { chartWidth = w; drawSurvivalChart(); }
    }).observe($('survival-chart'));
    resizeCanvas();
    startTSNE();
  }

  init();
})();
