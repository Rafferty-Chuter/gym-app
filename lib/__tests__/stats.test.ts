import { describe, expect, it } from "vitest";
import { ewma, leastSquaresSlope, mad, mean, median, olsSlope, robustSlope, stdev, tCdf, winsorize } from "@/lib/stats";

describe("basic stats", () => {
  it("mean / median / stdev / mad", () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
    expect(mad([1, 2, 3, 4, 100])).toBe(1);
    expect(Number.isNaN(mean([]))).toBe(true);
  });

  it("winsorize clips at ±k sd", () => {
    const xs = [10, 10, 10, 10, 10, 10, 10, 10, 10, 100];
    const w = winsorize(xs, 1);
    expect(Math.max(...w)).toBeLessThan(100);
    expect(w.slice(0, 9)).toEqual(xs.slice(0, 9));
  });

  it("ewma seeds with the first value", () => {
    expect(ewma([10, 20], 0.5)).toEqual([10, 15]);
  });
});

describe("olsSlope", () => {
  it("matches a hand-worked example (slope 2, intercept 1, se 0 on exact data)", () => {
    const xs = [0, 1, 2, 3, 4];
    const ys = xs.map((x) => 1 + 2 * x);
    const fit = olsSlope(xs, ys);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.se).toBeCloseTo(0, 10);
    expect(fit.n).toBe(5);
  });

  it("matches a reference SE (x = 1..5, y = 2.1, 3.9, 6.2, 7.8, 10.1)", () => {
    // Hand-worked: x̄ = 3, ȳ = 6.02, Sxy = 19.9, Sxx = 10 → slope 1.99, intercept 0.05.
    // Residuals 0.06, −0.13, 0.18, −0.21, 0.10 → SSE 0.107 → se = sqrt(0.107/3/10) = 0.05972.
    const fit = olsSlope([1, 2, 3, 4, 5], [2.1, 3.9, 6.2, 7.8, 10.1]);
    expect(fit.slope).toBeCloseTo(1.99, 6);
    expect(fit.intercept).toBeCloseTo(0.05, 6);
    expect(fit.se).toBeCloseTo(0.05972, 4);
  });

  it("returns infinite se for fewer than 3 points", () => {
    expect(olsSlope([0, 1], [0, 1]).se).toBe(Infinity);
    expect(olsSlope([], []).n).toBe(0);
  });
});

describe("robustSlope", () => {
  it("ignores a single +3 kg typo where OLS moves by ~0.3 %/wk", () => {
    // 21 daily weigh-ins at 85 kg losing 0.6 %/wk (−0.0729 kg/day), small deterministic noise.
    const xs = Array.from({ length: 21 }, (_, i) => i);
    const ys = xs.map((d) => 85 - 0.0729 * d + 0.15 * Math.sin(d * 1.7));
    const clean = olsSlope(xs, ys);
    const spiked = [...ys];
    spiked[20] += 3; // +3 kg typo on the last day
    const ols = olsSlope(xs, spiked);
    const robust = robustSlope(xs, spiked);
    const toPctPerWeek = (slope: number) => (slope * 7) / 85 * 100;
    const olsShift = Math.abs(toPctPerWeek(ols.slope) - toPctPerWeek(clean.slope));
    const robustShift = Math.abs(toPctPerWeek(robust.slope) - toPctPerWeek(clean.slope));
    expect(olsShift).toBeGreaterThan(0.25);
    expect(robustShift).toBeLessThan(0.08);
  });
});

describe("leastSquaresSlope (index-based)", () => {
  it("behaves as liftTrend expects", () => {
    expect(leastSquaresSlope([])).toBe(0);
    expect(leastSquaresSlope([5])).toBe(0);
    expect(leastSquaresSlope([1, 2, 3])).toBeCloseTo(1, 10);
    expect(leastSquaresSlope([100, 100, 100, 100])).toBe(0);
  });
});

describe("Student's t (IN9)", () => {
  it("matches published quantiles", () => {
    expect(tCdf(0, 4)).toBeCloseTo(0.5, 6);
    // Two-sided 5% at 4 df is 2.776; one-sided 1% at 10 df is 2.764; at 1 df the Cauchy.
    expect(tCdf(2.776, 4)).toBeCloseTo(0.975, 3);
    expect(tCdf(2.764, 10)).toBeCloseTo(0.99, 3);
    expect(tCdf(1, 1)).toBeCloseTo(0.75, 6);
    expect(tCdf(-2.776, 4)).toBeCloseTo(0.025, 3);
    // Large df: the normal.
    expect(tCdf(1.96, 1e6)).toBeCloseTo(0.975, 3);
    // Fractional df (Welch).
    expect(tCdf(2.5, 7.3)).toBeGreaterThan(tCdf(2.5, 7));
    expect(tCdf(2.5, 7.3)).toBeLessThan(tCdf(2.5, 8));
  });
});
