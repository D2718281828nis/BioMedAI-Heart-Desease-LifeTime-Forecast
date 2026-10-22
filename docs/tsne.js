/*
 * Точный t-SNE (O(N²)) для карты пациентов в браузере.
 *
 * Оптимизация повторяет sklearn.manifold.TSNE (method='exact'): условные вероятности
 * подбираются бинарным поиском под заданную perplexity, раннее преувеличение 12 на первых
 * 250 итерациях, momentum 0.5 → 0.8, адаптивные gains, learning_rate = max(N / 12 / 4, 50),
 * инициализация PCA. Инициализация детерминированная, поэтому при одной и той же perplexity
 * карта получается одинаковой.
 *
 * project() помещает новый (изменённый) объект на готовую карту, не сдвигая остальные точки:
 * минимизирует KL-дивергенцию между его p(j|x) в исходном пространстве и q(j|y) на карте
 * (out-of-sample t-SNE, как transform() в openTSNE).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TSNE = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 2.220446049250313e-16;

  // Квадраты расстояний от объекта x до всех строк X (матрицу N × N не храним: для 1506 пациентов это 18 МБ)
  function squaredDistancesTo(x, X, n, d, out) {
    for (let j = 0; j < n; j++) {
      let s = 0;
      for (let k = 0; k < d; k++) {
        const diff = x[k] - X[j * d + k];
        s += diff * diff;
      }
      out[j] = s;
    }
    return out;
  }

  // Условные вероятности p(j|i) для строки расстояний dist (skip — индекс самого объекта или -1).
  // Бинарный поиск точности beta так, чтобы энтропия распределения равнялась log(perplexity).
  function conditionalRow(dist, skip, perplexity, out) {
    const n = dist.length;
    const target = Math.log(perplexity);
    let dmin = Infinity;
    for (let j = 0; j < n; j++) if (j !== skip && dist[j] < dmin) dmin = dist[j];

    let beta = 1, betaMin = -Infinity, betaMax = Infinity;
    for (let step = 0; step < 100; step++) {
      let sumP = 0;
      for (let j = 0; j < n; j++) {
        out[j] = j === skip ? 0 : Math.exp(-(dist[j] - dmin) * beta);
        sumP += out[j];
      }
      if (sumP === 0) sumP = EPS;
      let sumDP = 0;
      for (let j = 0; j < n; j++) {
        out[j] /= sumP;
        sumDP += (dist[j] - dmin) * out[j];
      }
      const diff = Math.log(sumP) + beta * sumDP - target;
      if (Math.abs(diff) <= 1e-5) break;
      if (diff > 0) {
        betaMin = beta;
        beta = betaMax === Infinity ? beta * 2 : (beta + betaMax) / 2;
      } else {
        betaMax = beta;
        beta = betaMin === -Infinity ? beta / 2 : (beta + betaMin) / 2;
      }
    }
    return out;
  }

  // Две главные компоненты степенным методом; знак фиксируем, чтобы карта не «переворачивалась»
  function pcaInit(X, n, d) {
    const C = new Float64Array(d * d);
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < d; a++) {
        const xa = X[i * d + a];
        for (let b = 0; b < d; b++) C[a * d + b] += xa * X[i * d + b];
      }
    }
    const components = [];
    for (let c = 0; c < 2; c++) {
      let v = new Float64Array(d).fill(1 / Math.sqrt(d));
      if (c === 1) v = v.map((x, k) => (k % 2 ? -x : x));
      let lambda = 0;
      for (let it = 0; it < 500; it++) {
        const w = new Float64Array(d);
        for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) w[a] += C[a * d + b] * v[b];
        for (const u of components) {
          const proj = u.v.reduce((s, x, k) => s + x * v[k], 0) * u.lambda;
          for (let a = 0; a < d; a++) w[a] -= proj * u.v[a];
        }
        lambda = Math.hypot(...w);
        if (lambda === 0) break;
        v = w.map((x) => x / lambda);
      }
      let big = 0;
      for (let a = 0; a < d; a++) if (Math.abs(v[a]) > Math.abs(v[big])) big = a;
      if (v[big] < 0) v = v.map((x) => -x);
      components.push({ v, lambda });
    }
    const Y = new Float64Array(2 * n);
    for (let i = 0; i < n; i++) {
      for (let c = 0; c < 2; c++) {
        let s = 0;
        for (let a = 0; a < d; a++) s += X[i * d + a] * components[c].v[a];
        Y[2 * i + c] = s;
      }
    }
    // Как в sklearn: масштаб первой компоненты — std 1e-4
    let mean = 0, sq = 0;
    for (let i = 0; i < n; i++) mean += Y[2 * i] / n;
    for (let i = 0; i < n; i++) sq += (Y[2 * i] - mean) ** 2 / n;
    const scale = 1e-4 / (Math.sqrt(sq) || 1);
    for (let k = 0; k < Y.length; k++) Y[k] *= scale;
    return Y;
  }

  /**
   * @param {Float64Array} X  стандартизованные признаки, n × d построчно
   */
  function TSNE(X, n, d, options) {
    const opts = Object.assign({ perplexity: 30, iterations: 1000, exaggeration: 12, exaggerationIters: 250 }, options);
    this.X = X;
    this.n = n;
    this.d = d;
    this.perplexity = Math.min(Math.max(opts.perplexity, 1), n - 1);
    this.iterations = opts.iterations;
    this.exaggeration = opts.exaggeration;
    this.exaggerationIters = opts.exaggerationIters;
    this.learningRate = Math.max(n / opts.exaggeration / 4, 50);
    this.iter = 0;

    // Совместные вероятности P = (P(j|i) + P(i|j)) / 2N
    const P = new Float64Array(n * n);
    const dist = new Float64Array(n), row = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      squaredDistancesTo(X.subarray(i * d, (i + 1) * d), X, n, d, dist);
      conditionalRow(dist, i, this.perplexity, row);
      P.set(row, i * n);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const p = Math.max((P[i * n + j] + P[j * n + i]) / (2 * n), EPS);
        P[i * n + j] = P[j * n + i] = p;
      }
    }
    this.P = P;
    this.Y = pcaInit(X, n, d);
    this.update = new Float64Array(2 * n);
    this.gains = new Float64Array(2 * n).fill(1);
    this.grad = new Float64Array(2 * n);
    this.repulsion = new Float64Array(2 * n);
  }

  TSNE.prototype.done = function () {
    return this.iter >= this.iterations;
  };

  // Выполнить steps итераций градиентного спуска; возвращает true, когда оптимизация закончена.
  // Градиент 4 Σ_j (P_ij − q_ij) w_ij (y_i − y_j), q_ij = w_ij / Σ w, раскладываем на притяжение
  // Σ P_ij w_ij (y_i − y_j) и отталкивание Σ w_ij² (y_i − y_j) / Σ w — оба копятся за один проход по парам i < j
  TSNE.prototype.step = function (steps) {
    const { n, Y, P, grad, repulsion, update, gains } = this;
    for (let s = 0; s < steps && this.iter < this.iterations; s++, this.iter++) {
      const early = this.iter < this.exaggerationIters;
      const exag = early ? this.exaggeration : 1;
      const momentum = early ? 0.5 : 0.8;

      grad.fill(0);
      repulsion.fill(0);
      let sumW = 0;
      for (let i = 0; i < n; i++) {
        const yx = Y[2 * i], yy = Y[2 * i + 1];
        let ax = 0, ay = 0, rx = 0, ry = 0;
        for (let j = i + 1; j < n; j++) {
          const dx = yx - Y[2 * j], dy = yy - Y[2 * j + 1];
          const w = 1 / (1 + dx * dx + dy * dy);
          sumW += w;
          const a = exag * P[i * n + j] * w, r = w * w;
          ax += a * dx; ay += a * dy;
          rx += r * dx; ry += r * dy;
          grad[2 * j] -= a * dx; grad[2 * j + 1] -= a * dy;
          repulsion[2 * j] -= r * dx; repulsion[2 * j + 1] -= r * dy;
        }
        grad[2 * i] += ax; grad[2 * i + 1] += ay;
        repulsion[2 * i] += rx; repulsion[2 * i + 1] += ry;
      }
      sumW *= 2;
      for (let k = 0; k < 2 * n; k++) grad[k] = 4 * (grad[k] - repulsion[k] / sumW);
      for (let k = 0; k < 2 * n; k++) {
        gains[k] = update[k] * grad[k] < 0 ? gains[k] + 0.2 : Math.max(gains[k] * 0.8, 0.01);
        update[k] = momentum * update[k] - this.learningRate * gains[k] * grad[k];
        Y[k] += update[k];
      }
    }
    return this.done();
  };

  // KL(P || Q) — значение функции потерь t-SNE
  TSNE.prototype.kl = function () {
    const { n, Y, P } = this;
    let sumW = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = Y[2 * i] - Y[2 * j], dy = Y[2 * i + 1] - Y[2 * j + 1];
        sumW += 2 / (1 + dx * dx + dy * dy);
      }
    }
    let kl = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = Y[2 * i] - Y[2 * j], dy = Y[2 * i + 1] - Y[2 * j + 1];
        const q = Math.max(1 / (1 + dx * dx + dy * dy) / sumW, EPS);
        kl += 2 * P[i * n + j] * Math.log(Math.max(P[i * n + j], EPS) / q);
      }
    }
    return kl;
  };

  TSNE.prototype.bounds = function () {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < this.n; i++) {
      x0 = Math.min(x0, this.Y[2 * i]); x1 = Math.max(x1, this.Y[2 * i]);
      y0 = Math.min(y0, this.Y[2 * i + 1]); y1 = Math.max(y1, this.Y[2 * i + 1]);
    }
    return { x0, x1, y0, y1 };
  };

  /**
   * Положение нового объекта x (стандартизованного) на готовой карте; остальные точки не двигаются.
   * exclude — индекс объекта, которого не должно быть среди соседей (сам пациент в исходном виде), или -1.
   * Минимум ищем перебором по сетке на всей карте (чтобы не застрять в локальном минимуме),
   * затем уточняем градиентным спуском.
   */
  TSNE.prototype.project = function (x, exclude) {
    const { n, d, Y } = this;
    const dist = squaredDistancesTo(x, this.X, n, d, new Float64Array(n));
    const p = conditionalRow(dist, exclude, this.perplexity, new Float64Array(n));
    const near = [];
    for (let j = 0; j < n; j++) if (p[j] > 1e-12) near.push(j);

    // KL с точностью до константы: −Σ p_j log w_j + log Σ_k w_k, где w = 1 / (1 + |y − y_j|²)
    const cost = (yx, yy) => {
      let attract = 0, sumW = 0;
      for (const j of near) attract += p[j] * Math.log(1 + (yx - Y[2 * j]) ** 2 + (yy - Y[2 * j + 1]) ** 2);
      for (let j = 0; j < n; j++) if (j !== exclude) sumW += 1 / (1 + (yx - Y[2 * j]) ** 2 + (yy - Y[2 * j + 1]) ** 2);
      return attract + Math.log(sumW);
    };
    const gradient = (yx, yy) => {
      let sumW = 0;
      const w = new Float64Array(n);
      for (let j = 0; j < n; j++) {
        if (j === exclude) continue;
        w[j] = 1 / (1 + (yx - Y[2 * j]) ** 2 + (yy - Y[2 * j + 1]) ** 2);
        sumW += w[j];
      }
      let gx = 0, gy = 0;
      for (let j = 0; j < n; j++) {
        if (j === exclude) continue;
        const m = 2 * (p[j] - w[j] / sumW) * w[j];
        gx += m * (yx - Y[2 * j]);
        gy += m * (yy - Y[2 * j + 1]);
      }
      return [gx, gy];
    };

    const b = this.bounds();
    const padX = (b.x1 - b.x0) * 0.05, padY = (b.y1 - b.y0) * 0.05;
    const cells = 40;
    let best = [0, 0], bestCost = Infinity;
    for (let a = 0; a <= cells; a++) {
      for (let c = 0; c <= cells; c++) {
        const yx = b.x0 - padX + (b.x1 - b.x0 + 2 * padX) * (a / cells);
        const yy = b.y0 - padY + (b.y1 - b.y0 + 2 * padY) * (c / cells);
        const v = cost(yx, yy);
        if (v < bestCost) { bestCost = v; best = [yx, yy]; }
      }
    }
    let step = (b.x1 - b.x0) / cells;
    for (let it = 0; it < 200 && step > 1e-6; it++) {
      const [gx, gy] = gradient(best[0], best[1]);
      const norm = Math.hypot(gx, gy);
      if (norm === 0) break;
      const cand = [best[0] - step * gx / norm, best[1] - step * gy / norm];
      const v = cost(cand[0], cand[1]);
      if (v < bestCost) { best = cand; bestCost = v; step *= 1.2; }
      else step *= 0.5;
    }
    return best;
  };

  return TSNE;
});
