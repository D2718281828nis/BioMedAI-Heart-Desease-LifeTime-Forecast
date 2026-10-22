/*
 * Интерактивная карта пациентов: t-SNE, выбор и редактирование пациента, прогноз времени дожития.
 * Данные и параметры моделей — docs/survival_model.js (scripts/survival_time_predictor.py export).
 */
(function () {
  'use strict';

  const BUNDLE = window.SURVIVAL_MODEL;
  const predictor = SurvivalPredictor.createPredictor(BUNDLE);
  const FEATURES = BUNDLE.features;
  const D = FEATURES.length;
  const PATIENTS = BUNDLE.patients;
  const N = PATIENTS.id.length;
  const TAU = BUNDLE.meta.tau;
  const MODELS = BUNDLE.meta.model_names;
  const MODEL_KEYS = Object.keys(MODELS);
  const DEFAULT_MODEL = 'xgb';
  const STORAGE_KEY = 'survival-explorer:v1';

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

  const { t } = I18N;
  const outcome = (target) => t(`outcome.${target}`);

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
  const state = {
    perplexity: Number.isFinite(saved.perplexity) ? clamp(Math.round(saved.perplexity), 2, 100) : 30,
    model: MODELS[saved.model] ? saved.model : DEFAULT_MODEL,
    selected: Number.isInteger(saved.selected) && saved.selected >= 0 && saved.selected < N ? saved.selected : 0,
    hovered: -1,
    theme: saved.theme,
    values: PATIENTS.X.map((row) => row.slice()),
  };
  const editedSet = new Set();
  for (const [row, changes] of Object.entries(saved.edits || {})) {
    const i = Number(row);
    if (!Number.isInteger(i) || i < 0 || i >= N) continue;
    for (const [feature, value] of Object.entries(changes)) {
      const k = FEATURES.indexOf(feature);
      if (k >= 0 && Number.isFinite(value)) state.values[i][k] = value;
    }
  }

  function isEdited(i) {
    const x = state.values[i], original = PATIENTS.X[i];
    for (let k = 0; k < D; k++) if (x[k] !== original[k]) return true;
    return false;
  }
  const editedFeatures = (i) => FEATURES.filter((_, k) => state.values[i][k] !== PATIENTS.X[i][k]);

  let saveTimer = 0;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const edits = {};
      for (const i of editedSet) {
        edits[i] = {};
        for (const f of editedFeatures(i)) edits[i][f] = state.values[i][FEATURES.indexOf(f)];
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          perplexity: state.perplexity, model: state.model, selected: state.selected, theme: state.theme, lang: I18N.lang, edits,
        }));
      } catch (e) { /* хранилище недоступно — состояние живёт только до перезагрузки */ }
    }, 200);
  }

  // ---------------------------------------------------------------------------
  // Прогноз времени (RMST) для всех пациентов и всех моделей
  // ---------------------------------------------------------------------------
  const baseTime = {}; // по исходным значениям датасета
  const curTime = {};  // по текущим значениям (с изменениями)
  for (const m of MODEL_KEYS) {
    baseTime[m] = Float64Array.from(PATIENTS.X, (x) => predictor.predict(x, m).rmst);
    curTime[m] = baseTime[m].slice();
  }
  function refreshTime(i) {
    const edited = isEdited(i);
    if (edited) editedSet.add(i); else editedSet.delete(i);
    for (const m of MODEL_KEYS) curTime[m][i] = edited ? predictor.predict(state.values[i], m).rmst : baseTime[m][i];
  }
  for (let i = 0; i < N; i++) if (isEdited(i)) refreshTime(i);

  // ---------------------------------------------------------------------------
  // t-SNE: признаки стандартизуем по всем 408 пациентам
  // ---------------------------------------------------------------------------
  const mu = new Float64Array(D), sd = new Float64Array(D);
  PATIENTS.X.forEach((x) => x.forEach((v, k) => { mu[k] += v / N; }));
  PATIENTS.X.forEach((x) => x.forEach((v, k) => { sd[k] += (v - mu[k]) ** 2 / N; }));
  for (let k = 0; k < D; k++) sd[k] = Math.sqrt(sd[k]) || 1;
  const standardize = (x) => Float64Array.from(x, (v, k) => (v - mu[k]) / sd[k]);
  const Z = new Float64Array(N * D);
  PATIENTS.X.forEach((x, i) => Z.set(standardize(x), i * D));

  let tsne = null;
  let tsneRunning = false;
  let tsneToken = 0;
  let tsneKL = null;
  const pos = new Float64Array(2 * N);   // целевые положения точек
  const disp = new Float64Array(2 * N);  // отображаемые (анимируются к pos)
  const projOriginal = new Map();        // проекция исходных значений пациента на текущую карту

  function startTSNE() {
    const token = ++tsneToken;
    tsneRunning = true;
    tsneKL = null;
    projOriginal.clear();
    updateStatus();
    requestAnimationFrame(() => {
      if (token !== tsneToken) return;
      tsne = new TSNE(Z, N, D, { perplexity: state.perplexity });
      const frame = () => {
        if (token !== tsneToken) return;
        const done = tsne.step(20);
        pos.set(tsne.Y);
        disp.set(tsne.Y);
        computeView();
        drawMap();
        updateStatus();
        if (!done) {
          requestAnimationFrame(frame);
          return;
        }
        tsneRunning = false;
        tsneKL = tsne.kl();
        for (const i of editedSet) placeEdited(i);
        updateStatus();
        animate();
      };
      frame();
    });
  }

  // Положение изменённого пациента на карте. Проекция исходных значений (a) обычно немного
  // отличается от его места на карте; это смещение переносим на проекцию новых значений (b),
  // чтобы при малом изменении точка сдвигалась плавно от своего места. Чем дальше b от a,
  // тем меньше вес переноса: при сильном изменении точка встаёт ровно среди новых соседей.
  function projectedPosition(i) {
    const Y = tsne.Y;
    if (!isEdited(i)) return [Y[2 * i], Y[2 * i + 1]];
    let a = projOriginal.get(i);
    if (!a) {
      a = tsne.project(Z.subarray(i * D, (i + 1) * D), i);
      projOriginal.set(i, a);
    }
    const b = tsne.project(standardize(state.values[i]), i);
    const bounds = tsne.bounds();
    const span = Math.max(bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
    const weight = Math.exp(-Math.hypot(b[0] - a[0], b[1] - a[1]) / (0.08 * span));
    return [b[0] + weight * (Y[2 * i] - a[0]), b[1] + weight * (Y[2 * i + 1] - a[1])];
  }

  function placeEdited(i) {
    if (!tsne || tsneRunning) return;
    const [x, y] = projectedPosition(i);
    pos[2 * i] = x;
    pos[2 * i + 1] = y;
  }

  let animating = false;
  function animate() {
    if (animating) return;
    animating = true;
    const tick = () => {
      let moving = false;
      for (let k = 0; k < 2 * N; k++) {
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
  let view = { scale: 1, ox: 0, oy: 0, w: 0, h: 0 };
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
    view.w = rect.width;
    view.h = rect.height;
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    computeView();
    drawMap();
  }

  // Масштаб одинаковый по обеим осям: расстояния на карте t-SNE изотропны
  function computeView() {
    if (!tsne) return;
    const b = tsne.bounds();
    const padData = 0.06, padPx = 16;
    const bw = (b.x1 - b.x0) * (1 + 2 * padData) || 1, bh = (b.y1 - b.y0) * (1 + 2 * padData) || 1;
    view.scale = Math.min((view.w - 2 * padPx) / bw, (view.h - 2 * padPx) / bh);
    view.ox = view.w / 2 - ((b.x0 + b.x1) / 2) * view.scale;
    view.oy = view.h / 2 + ((b.y0 + b.y1) / 2) * view.scale;
  }
  const sx = (x) => view.ox + x * view.scale;
  const sy = (y) => view.oy - y * view.scale;

  function circle(x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }

  function drawMap() {
    ctx.clearRect(0, 0, view.w, view.h);
    if (!tsne) return;
    const Y = tsne.Y;

    // Пациенты; у каждой точки кольцо цвета фона, чтобы перекрывающиеся точки читались
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = colors.surface;
    for (let i = 0; i < N; i++) {
      if (editedSet.has(i)) continue;
      circle(sx(disp[2 * i]), sy(disp[2 * i + 1]), 4);
      ctx.fillStyle = colors.t[PATIENTS.target[i]];
      ctx.fill();
      ctx.stroke();
    }

    // Изменённые пациенты: исходное место (пустой кружок) → линия → новое положение
    for (const i of editedSet) {
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
      circle(x1, y1, 4);
      ctx.fillStyle = colors.t[PATIENTS.target[i]];
      ctx.fill();
    }

    if (state.hovered >= 0 && state.hovered !== state.selected) {
      const i = state.hovered;
      circle(sx(disp[2 * i]), sy(disp[2 * i + 1]), 7.5);
      ctx.strokeStyle = colors.ink2;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Выбранный пациент — обведён, с подписью
    const s = state.selected;
    const x = sx(disp[2 * s]), y = sy(disp[2 * s + 1]);
    circle(x, y, 10);
    ctx.strokeStyle = colors.surface;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = colors.ink;
    ctx.lineWidth = 2;
    ctx.stroke();
    const label = `ID ${PATIENTS.id[s]}`;
    ctx.font = '600 12px system-ui, -apple-system, "Segoe UI", sans-serif';
    const width = ctx.measureText(label).width;
    const lx = x + 14 + width > view.w ? x - 14 - width : x + 14;
    const ly = y - 12 < 12 ? y + 22 : y - 12;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors.surface;
    ctx.strokeText(label, lx, ly);
    ctx.fillStyle = colors.ink;
    ctx.fillText(label, lx, ly);
  }

  // Ближайшая к указателю точка в радиусе 16 px
  function nearest(px, py) {
    let best = -1, bestD = 16 * 16;
    for (let i = 0; i < N; i++) {
      const dx = sx(disp[2 * i]) - px, dy = sy(disp[2 * i + 1]) - py;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD) { bestD = d2; best = i; }
    }
    return best;
  }

  function showTooltip(i, px, py) {
    const m = state.model;
    const rows = [
      [days(PATIENTS.time[i]), t('tt.time')],
      [outcome(PATIENTS.target[i]), t('tt.outcome', { t: PATIENTS.target[i] })],
      [days(baseTime[m][i]), t('tt.pred', { model: MODELS[m] })],
    ];
    if (editedSet.has(i)) rows.push([days(curTime[m][i]), t('tt.predEdit')]);
    tooltip.replaceChildren(
      el('div', { class: 'tt-title' },
        el('span', { class: `dot t${PATIENTS.target[i]}` }),
        t('tt.title', { id: PATIENTS.id[i], row: i }) + (PATIENTS.test[i] ? t('tt.heldOut') : '')),
      ...rows.map(([value, label]) => el('div', { class: 'tt-row' }, el('b', { text: value }), el('span', { text: label }))),
    );
    tooltip.style.display = 'block';
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    tooltip.style.left = `${px + 14 + tw > view.w ? px - 14 - tw : px + 14}px`;
    tooltip.style.top = `${clamp(py - th / 2, 0, view.h - th)}px`;
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    const i = nearest(px, py);
    if (i !== state.hovered) {
      state.hovered = i;
      drawMap();
    }
    canvas.style.cursor = i >= 0 ? 'pointer' : 'crosshair';
    if (i >= 0) showTooltip(i, px, py); else hideTooltip();
  });
  canvas.addEventListener('pointerleave', () => {
    state.hovered = -1;
    hideTooltip();
    drawMap();
  });
  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const i = nearest(e.clientX - rect.left, e.clientY - rect.top);
    if (i >= 0) selectPatient(i);
  });
  canvas.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    selectPatient((state.selected + step + N) % N);
  });

  function updateStatus() {
    const text = tsneRunning
      ? t('status.running', { i: tsne ? tsne.iter : 0, p: state.perplexity })
      : t('status.done', { p: state.perplexity, kl: tsneKL === null ? '…' : I18N.fixed(tsneKL, 3), n: editedSet.size });
    $('tsne-status').textContent = text;
  }

  // ---------------------------------------------------------------------------
  // Прогноз для выбранного пациента: карточка, функция выживаемости, таблица моделей
  // ---------------------------------------------------------------------------
  function renderPrediction() {
    const i = state.selected, m = state.model;
    const edited = editedSet.has(i);
    const base = predictor.predict(PATIENTS.X[i], m);
    const cur = edited ? predictor.predict(state.values[i], m) : base;
    const time = PATIENTS.time[i], target = PATIENTS.target[i];

    $('prediction-sub').textContent = t('pred.sub', { id: PATIENTS.id[i], model: MODELS[m] });
    $('hero-label').textContent = t(edited ? 'hero.edited' : 'hero.dataset', { model: MODELS[m] });
    $('hero-value').replaceChildren(fmtDays(cur.rmst), el('span', { class: 'unit', text: t('unit.days') }));
    if (edited) {
      const diff = cur.rmst - base.rmst;
      const arrow = diff > 0.5 ? '▲' : diff < -0.5 ? '▼' : '';
      $('hero-delta').replaceChildren(
        el('b', { text: `${arrow} ${diff >= 0 ? '+' : '−'}${days(Math.abs(diff))}` }),
        t('hero.delta', { v: fmtDays(base.rmst) }));
    } else {
      $('hero-delta').textContent = t('hero.hint');
    }

    const median = (p) => (p.median === null ? t('fact.beyond', { tau: fmtDays(TAU) }) : days(p.median));
    const fact = (term, value, note) => el('div', {}, el('dt', { text: term }), el('dd', {}, value, el('small', { text: note })));
    $('facts').replaceChildren(
      fact(t('fact.time'), days(time), t('fact.outcome', { outcome: outcome(target), t: target })),
      fact(t('fact.alive'), I18N.fixed(cur.sTau, 2),
        edited ? t('fact.datasetValue', { v: I18N.fixed(base.sTau, 2) }) : t('fact.aliveNote', { tau: fmtDays(TAU) })),
      fact(t('fact.median'), median(cur),
        edited ? t('fact.datasetValue', { v: median(base) }) : t('fact.medianNote', { half: I18N.fixed(0.5, 1) })),
    );
    $('hero-sub').textContent = t('hero.sub', { tau: fmtDays(TAU), v: fmtDays(Math.min(time, TAU)) });

    renderSurvivalChart(base.curve, edited ? cur.curve : null, time, target);
    renderModelTable();
    renderMiniSummary();
  }

  function renderModelTable() {
    const i = state.selected;
    const edited = editedSet.has(i);
    $('model-table').tBodies[0].replaceChildren(...MODEL_KEYS.map((m) => {
      const radio = el('input', { type: 'radio', name: 'model-radio', value: m, checked: m === state.model });
      radio.addEventListener('change', () => setModel(m));
      const tr = el('tr', { class: m === state.model ? 'active' : '' },
        el('td', {}, el('label', {}, radio, MODELS[m])),
        el('td', { text: I18N.fixed(BUNDLE.metrics[m].c_index, 3) }),
        el('td', { text: I18N.fixed(BUNDLE.metrics[m].brier_s_tau, 3) }),
        el('td', { text: t('days.short', { n: fmtDays(baseTime[m][i]) }) }),
        el('td', { text: edited ? t('days.short', { n: fmtDays(curTime[m][i]) }) : '—' }));
      tr.addEventListener('click', (e) => { if (e.target !== radio) setModel(m); });
      return tr;
    }));
  }

  function renderMiniSummary() {
    const i = state.selected, m = state.model;
    const edited = editedSet.has(i);
    const predicted = edited
      ? [el('b', { text: fmtDays(baseTime[m][i]) }), ' → ', el('b', { text: days(curTime[m][i]) })]
      : [el('b', { text: days(baseTime[m][i]) })];
    $('mini-summary').replaceChildren(
      el('span', {}, t('mini.time'), el('b', { text: days(PATIENTS.time[i]) })),
      el('span', {}, t('mini.pred', { model: MODELS[m] }), ...predicted),
    );
  }

  // Функция выживаемости S(t): по значениям датасета и (если есть) с изменениями
  let chartData = null;
  function renderSurvivalChart(baseCurve, editCurve, time, target) {
    chartData = { baseCurve, editCurve, time, target };
    drawSurvivalChart();
  }

  function drawSurvivalChart() {
    const host = $('survival-chart');
    if (!chartData) return;
    const { baseCurve, editCurve, time, target } = chartData;
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

    // Время из датасета: смерть до τ — вертикальная линия, иначе подпись у правого края.
    // Подпись ставим сверху или снизу — туда, где в этот момент нет кривых
    const at = Math.min(time, TAU - 1);
    const curvesAt = [baseCurve[at], ...(editCurve ? [editCurve[at]] : [])];
    const labelY = Math.max(...curvesAt) < 0.7 ? y(1) + 12 : Math.min(...curvesAt) > 0.3 ? y(0) - 8 : y(0.5) + 4;
    if (time < TAU) {
      root.append(svg('line', { class: 'event-line', x1: x(time), x2: x(time), y1: y(1), y2: y(0) }));
      const right = x(time) < W * 0.6;
      root.append(svg('text', { class: 'event-label', x: x(time) + (right ? 6 : -6), y: labelY, 'text-anchor': right ? 'start' : 'end',
        text: t(target ? 'chart.deathBefore' : 'chart.censoredBefore', { d: fmtDays(time) }) }));
    } else {
      root.append(svg('text', { class: 'event-label', x: W - m.r - 4, y: labelY, 'text-anchor': 'end',
        text: t(target ? 'chart.deathAfter' : 'chart.aliveAfter', { d: fmtDays(time) }) }));
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
  const ranges = FEATURES.map((_, k) => {
    let lo = Infinity, hi = -Infinity;
    for (const x of PATIENTS.X) { lo = Math.min(lo, x[k]); hi = Math.max(hi, x[k]); }
    return [lo, hi];
  });
  const inputs = {}; // feature → { row, range, num, orig }

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
        const row = el('div', { class: 'param' },
          el('div', { class: 'param-head' },
            el('span', { class: 'param-name' },
              el('label', { for: `num-${f}`, text: text.label }), el('code', { text: f }),
              el('span', { class: 'param-enc', text: ` · ${encoding(text)}` })),
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
    const i = state.selected;
    FEATURES.forEach((f, k) => {
      const { row, range, num, reset, orig } = inputs[f];
      const v = state.values[i][k], o = PATIENTS.X[i][k];
      const { levels } = I18N.feature(f);
      if (document.activeElement !== num) num.value = fmtValue(v);
      if (document.activeElement !== range) range.value = v;
      const edited = v !== o;
      row.classList.toggle('edited', edited);
      reset.disabled = !edited;
      const level = levels && levels[o] !== undefined ? ` (${levels[o]})` : '';
      orig.textContent = edited ? t('param.datasetValue', { v: I18N.num(o) }) + level : t('param.dataset') + level;
    });
  }

  function renderPatientBar() {
    const i = state.selected;
    const idInput = $('patient-id');
    if (document.activeElement !== idInput) idInput.value = PATIENTS.id[i];
    $('patient-row').value = i;
    $('patient-row-out').textContent = t('patient.rowOf', { i, max: N - 1 });
    const nEdited = editedSet.has(i) ? editedFeatures(i).length : 0;
    const resetBtn = el('button', { type: 'button', disabled: nEdited === 0, text: t('patient.reset') });
    resetBtn.addEventListener('click', () => resetPatient(i));
    $('patient-badges').replaceChildren(...[
      el('span', { class: 'badge' }, el('span', { class: `dot t${PATIENTS.target[i]}` }),
        t('fact.outcome', { outcome: outcome(PATIENTS.target[i]), t: PATIENTS.target[i] })),
      el('span', { class: 'badge', text: t(PATIENTS.test[i] ? 'patient.test' : 'patient.train') }),
      nEdited ? el('span', { class: 'badge' }, el('span', { class: 'ring-sm' }), t('patient.edited', { n: nEdited })) : null,
      resetBtn,
    ].filter(Boolean));
  }

  // ---------------------------------------------------------------------------
  // Табличное представление
  // ---------------------------------------------------------------------------
  const tableRows = [];
  const sortState = { key: 'row', dir: 1 };
  const COLUMNS = [
    ['row', 'table.row', (i) => i],
    ['id', 'table.id', (i) => PATIENTS.id[i]],
    ['target', 'table.outcome', (i) => PATIENTS.target[i]],
    ['time', 'table.time', (i) => PATIENTS.time[i]],
    ['pred', 'table.pred', (i) => baseTime[state.model][i]],
    ['edited', 'table.edit', (i) => (editedSet.has(i) ? curTime[state.model][i] : -1)],
  ];

  function buildTable() {
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
    const body = $('patients-table').tBodies[0];
    for (let i = 0; i < N; i++) {
      const tr = el('tr', { tabindex: 0 });
      tr.addEventListener('click', () => selectPatient(i));
      tr.addEventListener('keydown', (e) => { if (e.key === 'Enter') selectPatient(i); });
      tableRows.push(tr);
      updateTableRow(i);
      body.append(tr);
    }
    sortTable();
  }

  function updateTableRow(i) {
    const m = state.model;
    tableRows[i].classList.toggle('active', i === state.selected);
    tableRows[i].replaceChildren(
      el('td', { text: i }),
      el('td', { text: PATIENTS.id[i] }),
      el('td', {}, el('span', { class: 'outcome' }, el('span', { class: `dot t${PATIENTS.target[i]}` }), outcome(PATIENTS.target[i]))),
      el('td', { text: fmtDays(PATIENTS.time[i]) }),
      el('td', { text: fmtDays(baseTime[m][i]) }),
      el('td', { text: editedSet.has(i) ? fmtDays(curTime[m][i]) : '—' }),
    );
  }

  function sortTable() {
    const value = COLUMNS.find(([key]) => key === sortState.key)[2];
    const order = [...Array(N).keys()].sort((a, b) => (value(a) - value(b)) * sortState.dir || a - b);
    $('patients-table').tBodies[0].append(...order.map((i) => tableRows[i]));
    [...$('patients-table').tHead.rows[0].cells].forEach((th, c) => {
      const sorted = COLUMNS[c][0] === sortState.key;
      th.setAttribute('aria-sort', sorted ? (sortState.dir > 0 ? 'ascending' : 'descending') : 'none');
      th.firstChild.textContent = t(COLUMNS[c][1]) + (sorted ? (sortState.dir > 0 ? ' ▲' : ' ▼') : '');
    });
  }

  // ---------------------------------------------------------------------------
  // Действия
  // ---------------------------------------------------------------------------
  function selectPatient(i) {
    const previous = state.selected;
    state.selected = i;
    $('patient-msg').textContent = '';
    updateTableRow(previous);
    updateTableRow(i);
    syncEditor();
    renderPatientBar();
    renderPrediction();
    drawMap();
    save();
  }

  function patientChanged(i) {
    refreshTime(i);
    placeEdited(i);
    animate();
    updateTableRow(i);
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

  function resetPatient(i) {
    state.values[i] = PATIENTS.X[i].slice();
    patientChanged(i);
  }

  function resetAll() {
    for (const i of [...editedSet]) {
      state.values[i] = PATIENTS.X[i].slice();
      patientChanged(i);
    }
  }

  function setModel(m) {
    state.model = m;
    $('model-select').value = m;
    for (let i = 0; i < N; i++) updateTableRow(i);
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

  // Выгрузка датасета с изменениями и прогнозом времени всех моделей
  function downloadCsv() {
    const columns = BUNDLE.columns;
    const header = ['', ...columns, 'edited', ...MODEL_KEYS.map((m) => `predicted_time_${m}`)];
    const lines = [header.join(',')];
    for (let i = 0; i < N; i++) {
      const cells = [PATIENTS.id[i]];
      for (const c of columns) {
        if (c === 'time') cells.push(PATIENTS.time[i]);
        else if (c === 'target') cells.push(PATIENTS.target[i]);
        else cells.push(state.values[i][FEATURES.indexOf(c)]);
      }
      cells.push(editedSet.has(i) ? 1 : 0, ...MODEL_KEYS.map((m) => curTime[m][i].toFixed(1)));
      lines.push(cells.join(','));
    }
    const url = URL.createObjectURL(new Blob([lines.join('\n') + '\n'], { type: 'text/csv' }));
    const a = el('a', { href: url, download: 'balanced_dataset_edited.csv' });
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
  const counts = [0, 0];
  PATIENTS.target.forEach((target) => counts[target]++);
  function renderTexts() {
    $('legend-t0').textContent = t('legend.t0', { n: counts[0] });
    $('legend-t1').textContent = t('legend.t1', { n: counts[1] });
    $('generated').textContent = t('footer.generated', { date: BUNDLE.meta.generated });
    $('theme-toggle').setAttribute('aria-label', t(effectiveDark() ? 'theme.toLight' : 'theme.toDark'));
    updateStatus();
  }

  function setLang(lang) {
    if (lang === I18N.lang) return;
    I18N.setLang(lang);
    $('patient-msg').textContent = '';
    renderTexts();
    buildEditor();
    syncEditor();
    renderPatientBar();
    renderPrediction();
    for (let i = 0; i < N; i++) updateTableRow(i);
    sortTable();
    if (state.hovered >= 0) hideTooltip();
    save();
  }

  // ---------------------------------------------------------------------------
  // Инициализация
  // ---------------------------------------------------------------------------
  function init() {
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

    $('patient-row').max = N - 1;
    $('patient-row').addEventListener('input', (e) => selectPatient(+e.target.value));
    $('prev-patient').addEventListener('click', () => selectPatient((state.selected - 1 + N) % N));
    $('next-patient').addEventListener('click', () => selectPatient((state.selected + 1) % N));
    $('patient-id').addEventListener('change', (e) => {
      const i = PATIENTS.id.indexOf(Number(e.target.value));
      if (i >= 0) selectPatient(i);
      else $('patient-msg').textContent = t('patient.notFound', { id: e.target.value });
    });

    $('reset-all').addEventListener('click', resetAll);
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
    buildTable();
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
