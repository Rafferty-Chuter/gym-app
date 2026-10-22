/**
 * Pure statistics helpers shared by the training and physique engines.
 * Nothing here reads storage or the clock.
 */

export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function median(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Median absolute deviation (unscaled). */
export function mad(xs: readonly number[]): number {
  if (xs.length === 0) return NaN;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}

/** Sample standard deviation (n − 1). Returns 0 for fewer than 2 values. */
export function stdev(xs: readonly number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) * (x - m);
  return Math.sqrt(s / (xs.length - 1));
}

/** Clip every value to within ±k standard deviations of the mean. */
export function winsorize(xs: readonly number[], k = 3): number[] {
  if (xs.length < 2) return [...xs];
  const m = mean(xs);
  const sd = stdev(xs);
  if (sd === 0) return [...xs];
  const lo = m - k * sd;
  const hi = m + k * sd;
  return xs.map((x) => Math.min(hi, Math.max(lo, x)));
}

/**
 * Exponentially weighted moving average, seeded with the first value.
 * `alpha` is the weight on the newest observation.
 */
export function ewma(xs: readonly number[], alpha: number): number[] {
  const out: number[] = [];
  let prev: number | null = null;
  for (const x of xs) {
    prev = prev === null ? x : prev + alpha * (x - prev);
    out.push(prev);
  }
  return out;
}

export type SlopeFit = {
  slope: number;
  intercept: number;
  /** Standard error of the slope. Infinity when it can't be estimated (n < 3). */
  se: number;
  n: number;
};

const EMPTY_FIT: SlopeFit = { slope: 0, intercept: 0, se: Infinity, n: 0 };

/** Ordinary least squares of y on x. */
export function olsSlope(xs: readonly number[], ys: readonly number[]): SlopeFit {
  const n = Math.min(xs.length, ys.length);
  if (n === 0) return EMPTY_FIT;
  if (n === 1) return { slope: 0, intercept: ys[0], se: Infinity, n };
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i];
    sy += ys[i];
  }
  const mx = sx / n;
  const my = sy / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    sxx += dx * dx;
    sxy += dx * (ys[i] - my);
  }
  if (sxx === 0) return { slope: 0, intercept: my, se: Infinity, n };
  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  if (n < 3) return { slope, intercept, se: Infinity, n };
  let sse = 0;
  for (let i = 0; i < n; i++) {
    const r = ys[i] - (intercept + slope * xs[i]);
    sse += r * r;
  }
  const se = Math.sqrt(sse / (n - 2) / sxx);
  return { slope, intercept, se, n };
}

/**
 * OLS made robust to a few bad entries: fit, cap residuals at ±3 × MAD
 * (scaled to σ), refit, and repeat until the slope settles (max 8 rounds).
 * Falls back to plain OLS when the residuals have no spread or n < 4.
 */
export function robustSlope(xs: readonly number[], ys: readonly number[]): SlopeFit {
  let fit = olsSlope(xs, ys);
  if (fit.n < 4 || !Number.isFinite(fit.se)) return fit;
  const n = fit.n;
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  for (let round = 0; round < 8; round++) {
    const residuals: number[] = [];
    for (let i = 0; i < n; i++) residuals.push(y[i] - (fit.intercept + fit.slope * x[i]));
    const sigma = mad(residuals) * 1.4826;
    if (!(sigma > 0)) return fit;
    const cap = 3 * sigma;
    const clipped: number[] = [];
    let changed = false;
    for (let i = 0; i < n; i++) {
      const r = Math.min(cap, Math.max(-cap, residuals[i]));
      if (r !== residuals[i]) changed = true;
      clipped.push(fit.intercept + fit.slope * x[i] + r);
    }
    if (!changed) return fit;
    const next = olsSlope(x, clipped);
    const converged = Math.abs(next.slope - fit.slope) < 1e-9;
    fit = next;
    if (converged) break;
  }
  return fit;
}

/**
 * Least-squares slope of a series against its index (0, 1, 2, …).
 * Returns 0 for fewer than 2 values. Used by lib/liftTrend.ts.
 */
export function leastSquaresSlope(values: readonly number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumXX += i * i;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/**
 * Solve A x = b by Gauss–Jordan elimination with partial pivoting; null
 * when A is singular. Small systems only (the engines' regressions have
 * at most a few dozen terms).
 */
export function solveLinear(a: readonly (readonly number[])[], b: readonly number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r][c] / m[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  return m.map((row, i) => row[n] / row[i]);
}

/** Standard normal cumulative distribution (Abramowitz and Stegun 7.1.26, error under 1.5e-7). */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.3275911 * (Math.abs(z) / Math.SQRT2));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(z * z) / 2);
  return z >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

/** ln Γ(x) for x > 0 (Lanczos, g 7, error under 1e-13). */
function lnGamma(x: number): number {
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  const z = x - 1;
  let a = c[0];
  const t = z + 7.5;
  for (let k = 1; k < 9; k++) a += c[k] / (z + k);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Continued fraction for the regularised incomplete beta (modified Lentz, Numerical Recipes 6.4). */
function betaFraction(a: number, b: number, x: number): number {
  const tiny = 1e-300;
  let c = 1;
  let d = 1 - ((a + b) * x) / (a + 1);
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
    d = 1 + aa * d;
    if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-12) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
function incompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? (front * betaFraction(a, b, x)) / a : 1 - (front * betaFraction(b, a, 1 - x)) / b;
}

/**
 * Student's t cumulative distribution with `df` degrees of freedom (any
 * positive real, as Welch's test gives). For the small groups the alcohol
 * read compares (IN9), where the normal would claim too much.
 */
export function tCdf(t: number, df: number): number {
  if (!(df > 0) || !Number.isFinite(t)) return t > 0 ? 1 : t < 0 ? 0 : 0.5;
  const tail = 0.5 * incompleteBeta(df / (df + t * t), df / 2, 0.5);
  return t >= 0 ? 1 - tail : tail;
}
