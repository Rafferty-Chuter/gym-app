/**
 * Weight: trend (display + expenditure) and rate of change (verdicts).
 * Normative spec: docs/plan/02-engine-spec.md §1.2 (segment), §2.
 *
 * Pure. Dates are local `YYYY-MM-DD`; weights are kg.
 */

import { addDays, dateRange, dayDiff, maxDate, type LocalDate } from "@/lib/dates";
import { ewma, mean, robustSlope } from "@/lib/stats";
import type { DayFlags, PhysiqueGoal, WeighIn } from "@/lib/physique/types";

// ── Constants (tags per 02-engine-spec) ──

/** EMA weight on the newest weigh-in. CAL: reproduces MacroFactor's published impulse test. */
export const TREND_ALPHA = 0.1;
/** Days after a phase start / rate change with no rate verdicts. EVID (Hall 2008; Kreitzman 1992). */
export const PHASE_MASK_DAYS = 7;
/** A goal-rate change at least this large restarts the segment. OURS. */
export const RATE_CHANGE_MASK_THRESHOLD = 0.2;
/** Multiplier on the slope SE for day-to-day water autocorrelation. EVID/derived (research F §5). */
export const SE_INFLATION = 1.6;
/** One-sided 95% z. */
export const Z_95 = 1.645;
/** Fallback margins (%BW/wk at 85 kg) when the SE is unreliable. EVID/derived (research F §5). */
export const FALLBACK_MARGIN: Record<number, number> = { 14: 0.66, 21: 0.38, 28: 0.25, 42: 0.14 };
/** Margin multiplier when a water event sits in or just before the window. OURS. */
export const WATER_EVENT_MARGIN_MULT = 1.5;
/** Days before a window in which a water event still widens the margin. OURS. */
export const WATER_EVENT_LOOKBACK_DAYS = 14;
/** Weigh-in ratio a display window needs (per day), and the absolute minimum. EVID. */
export const MIN_WEIGHIN_RATIO = 0.4;
export const MIN_WEIGHINS_FOR_RATE = 5;
export const MIN_DAYS_FOR_RATE = 14;
/** A new weigh-in further than this from the trend asks "Is that right?". OURS. */
export const SANITY_PCT = 0.03;
/** Days excluded from rate windows after each water event type. EVID (creatine) / OURS (others). */
export const WATER_EVENT_EXCLUSION_DAYS = {
  creatine_start_loading: 7,
  creatine_start: 28,
  carb_switch: 7,
  illness: 7,
  travel: 7,
  period: 0,
} as const;

// ── Daily series ──

export type DailyWeight = { date: LocalDate; kg: number; real: boolean };

/** Earliest weigh-in per date, sorted ascending. */
export function weighInsByDate(weighIns: readonly WeighIn[]): Map<LocalDate, number> {
  const sorted = [...weighIns].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.loggedAt < b.loggedAt ? -1 : 1));
  const out = new Map<LocalDate, number>();
  for (const w of sorted) {
    if (!Number.isFinite(w.kg) || w.kg <= 0) continue;
    if (!out.has(w.date)) out.set(w.date, w.kg);
  }
  return out;
}

/**
 * Daily weights from the first to the last weigh-in, with linear
 * interpolation on missing days. Never extends past the last weigh-in.
 */
export function dailyWeightSeries(weighIns: readonly WeighIn[]): DailyWeight[] {
  const byDate = weighInsByDate(weighIns);
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0) return [];
  const out: DailyWeight[] = [];
  for (let i = 0; i < dates.length; i++) {
    const d0 = dates[i];
    const k0 = byDate.get(d0)!;
    out.push({ date: d0, kg: k0, real: true });
    if (i === dates.length - 1) break;
    const d1 = dates[i + 1];
    const k1 = byDate.get(d1)!;
    const gap = dayDiff(d0, d1);
    for (let j = 1; j < gap; j++) {
      out.push({ date: addDays(d0, j), kg: k0 + ((k1 - k0) * j) / gap, real: false });
    }
  }
  return out;
}

export type TrendPoint = { date: LocalDate; trendKg: number; real: boolean; kg: number };

/** EMA trend over the interpolated series (02 §2.1). Ends at the last weigh-in. */
export function trendSeries(weighIns: readonly WeighIn[]): TrendPoint[] {
  const daily = dailyWeightSeries(weighIns);
  const trend = ewma(
    daily.map((d) => d.kg),
    TREND_ALPHA
  );
  return daily.map((d, i) => ({ date: d.date, trendKg: trend[i], real: d.real, kg: d.kg }));
}

export function latestTrend(weighIns: readonly WeighIn[]): TrendPoint | null {
  const t = trendSeries(weighIns);
  return t.length ? t[t.length - 1] : null;
}

/** Trend value on a specific date (null before the first or after the last weigh-in). */
export function trendOn(series: readonly TrendPoint[], date: LocalDate): number | null {
  const p = series.find((x) => x.date === date);
  return p ? p.trendKg : null;
}

export type DayTrend = { date: LocalDate; trendKg: number | null; scaleKg: number | null };

/**
 * One row per day in [from, to], newest first, for the weigh-in list (C11):
 * the scale weight when there was one, and the trend every day, missed
 * days included. Between weigh-ins the trend runs over the interpolated
 * series; after the last weigh-in it holds at the last value, because an
 * EMA with no new reading does not move; before the first there is none.
 */
export function dailyTrendRows(weighIns: readonly WeighIn[], from: LocalDate, to: LocalDate): DayTrend[] {
  const series = trendSeries(weighIns);
  const byDate = new Map(series.map((p) => [p.date, p]));
  const last = series.length ? series[series.length - 1] : null;
  const rows: DayTrend[] = [];
  for (let d = to; d >= from; d = addDays(d, -1)) {
    const p = byDate.get(d);
    const trendKg = p ? p.trendKg : last && d > last.date ? last.trendKg : null;
    rows.push({ date: d, trendKg, scaleKg: p && p.real ? p.kg : null });
  }
  return rows;
}

// ── Segment and masks ──

export type SegmentInput = {
  goal: PhysiqueGoal | null;
  dayFlags: Readonly<Record<string, DayFlags>>;
  today: LocalDate;
};

function waterEventEnd(date: LocalDate, flags: DayFlags): LocalDate | null {
  let end: LocalDate | null = null;
  for (const ev of flags.events ?? []) {
    let days: number;
    if (ev.type === "creatine_start") days = ev.creatineLoading ? WATER_EVENT_EXCLUSION_DAYS.creatine_start_loading : WATER_EVENT_EXCLUSION_DAYS.creatine_start;
    else days = WATER_EVENT_EXCLUSION_DAYS[ev.type];
    if (days <= 0) continue;
    const e = addDays(date, days);
    end = end ? maxDate(end, e) : e;
  }
  return end;
}

/** First day a rate window may include (02 §1.2 "phase segment"). Null when there's no goal. */
export function segmentStart({ goal, dayFlags, today }: SegmentInput): LocalDate | null {
  if (!goal) return null;
  let start = addDays(goal.startDate, PHASE_MASK_DAYS);
  for (const change of goal.rateHistory ?? []) {
    if (Math.abs(change.toPctPerWeek - change.fromPctPerWeek) >= RATE_CHANGE_MASK_THRESHOLD) {
      start = maxDate(start, addDays(change.date, PHASE_MASK_DAYS));
    }
  }
  for (const [date, flags] of Object.entries(dayFlags)) {
    if (date > today) continue;
    const end = waterEventEnd(date, flags);
    if (end) start = maxDate(start, end);
  }
  return start;
}

/** True while the phase-change mask is active (02 §2.3): no rate verdicts. */
export function phaseMaskActive(goal: PhysiqueGoal | null, today: LocalDate): boolean {
  if (!goal) return false;
  if (dayDiff(goal.startDate, today) < PHASE_MASK_DAYS) return true;
  for (const change of goal.rateHistory ?? []) {
    if (Math.abs(change.toPctPerWeek - change.fromPctPerWeek) >= RATE_CHANGE_MASK_THRESHOLD && dayDiff(change.date, today) < PHASE_MASK_DAYS) {
      return true;
    }
  }
  return false;
}

/** A water event inside [windowStart − lookback, windowEnd] widens the margin. */
export function waterEventNear(dayFlags: Readonly<Record<string, DayFlags>>, windowStart: LocalDate, windowEnd: LocalDate): boolean {
  const from = addDays(windowStart, -WATER_EVENT_LOOKBACK_DAYS);
  for (const [date, flags] of Object.entries(dayFlags)) {
    if (date < from || date > windowEnd) continue;
    if ((flags.events ?? []).length > 0) return true;
  }
  return false;
}

/** A period event in the first or last 5 days of a window (G-NOISE-4). */
export function periodAtWindowEdge(dayFlags: Readonly<Record<string, DayFlags>>, windowStart: LocalDate, windowEnd: LocalDate): boolean {
  for (const [date, flags] of Object.entries(dayFlags)) {
    if (!(flags.events ?? []).some((e) => e.type === "period")) continue;
    if ((date >= windowStart && dayDiff(windowStart, date) < 5) || (date <= windowEnd && dayDiff(date, windowEnd) < 5)) return true;
  }
  return false;
}

// ── Rate ──

export type RateResult = {
  ratePctPerWeek: number;
  slopeKgPerDay: number;
  /** Mean raw weigh-in over the window. */
  bw: number;
  se: number;
  seAdj: number;
  /** One-sided 95% margin in %BW/wk, already widened for water events. */
  margin: number;
  n: number;
  windowDays: number;
  windowStart: LocalDate;
  windowEnd: LocalDate;
  waterEventNearby: boolean;
};

export function marginFor(windowDays: number, seAdjPct: number, bw: number, waterEventNearby: boolean): number {
  const fallback = (FALLBACK_MARGIN[windowDays] ?? FALLBACK_MARGIN[14]) * (85 / Math.max(bw, 30));
  const fromSe = Number.isFinite(seAdjPct) ? Z_95 * seAdjPct : Infinity;
  const base = Math.max(Math.min(fromSe, Infinity), fallback);
  const m = Number.isFinite(fromSe) ? Math.max(fromSe, fallback) : fallback;
  void base;
  return waterEventNearby ? m * WATER_EVENT_MARGIN_MULT : m;
}

/**
 * Robust slope of raw weigh-ins against day number over the last `windowDays`
 * ending on `endDate` (02 §2.2). Null with fewer than MIN_WEIGHINS_FOR_RATE.
 */
export function rateOverWindow(
  weighIns: readonly WeighIn[],
  endDate: LocalDate,
  windowDays: number,
  dayFlags: Readonly<Record<string, DayFlags>> = {}
): RateResult | null {
  const windowStart = addDays(endDate, -(windowDays - 1));
  const byDate = weighInsByDate(weighIns);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [date, kg] of byDate) {
    if (date < windowStart || date > endDate) continue;
    xs.push(dayDiff(windowStart, date));
    ys.push(kg);
  }
  if (xs.length < MIN_WEIGHINS_FOR_RATE) return null;
  const fit = robustSlope(xs, ys);
  const bw = mean(ys);
  const toPct = (kgPerDay: number) => (kgPerDay * 7 * 100) / bw;
  const ratePctPerWeek = toPct(fit.slope);
  const sePct = Number.isFinite(fit.se) ? toPct(fit.se) : Infinity;
  const seAdj = sePct * SE_INFLATION;
  const waterEventNearby = waterEventNear(dayFlags, windowStart, endDate);
  const margin = marginFor(windowDays, seAdj, bw, waterEventNearby);
  return {
    ratePctPerWeek,
    slopeKgPerDay: fit.slope,
    bw,
    se: sePct,
    seAdj,
    margin,
    n: fit.n,
    windowDays,
    windowStart,
    windowEnd: endDate,
    waterEventNearby,
  };
}

export type WindowPick = { windowDays: number; result: RateResult };

/**
 * The largest candidate window that fits inside the segment and meets the
 * weigh-in requirement. `minWeighIns` can be a number or a per-day ratio.
 */
export function pickWindow(
  weighIns: readonly WeighIn[],
  endDate: LocalDate,
  candidates: readonly number[],
  opts: { segmentStart: LocalDate | null; minWeighIns: number | { ratio: number; min: number }; dayFlags?: Readonly<Record<string, DayFlags>>; minDays?: number }
): WindowPick | null {
  const sorted = [...candidates].sort((a, b) => b - a);
  // A window must be covered by data: it cannot start before the segment
  // or before the first weigh-in, otherwise 10 days of daily weigh-ins would
  // satisfy a 21-day window's ratio and report a rate over days that never
  // existed.
  const firstDate = weighInsByDate(weighIns).keys().next().value ?? null;
  const floor = opts.segmentStart && firstDate ? maxDate(opts.segmentStart, firstDate) : (opts.segmentStart ?? firstDate);
  for (const days of sorted) {
    if (opts.minDays && days < opts.minDays) continue;
    const start = addDays(endDate, -(days - 1));
    if (floor && start < floor) continue;
    const result = rateOverWindow(weighIns, endDate, days, opts.dayFlags);
    if (!result) continue;
    const need = typeof opts.minWeighIns === "number" ? opts.minWeighIns : Math.max(opts.minWeighIns.min, Math.ceil(days * opts.minWeighIns.ratio));
    if (result.n < need) continue;
    return { windowDays: days, result };
  }
  return null;
}

/** Display rate: 28 → 21 → 14 days, ≥0.4 weigh-ins/day (min 5). */
export function displayRate(
  weighIns: readonly WeighIn[],
  endDate: LocalDate,
  segment: LocalDate | null,
  dayFlags: Readonly<Record<string, DayFlags>> = {}
): WindowPick | null {
  // With no goal there is no segment; use the first weigh-in as the floor.
  return pickWindow(weighIns, endDate, [28, 21, 14], {
    segmentStart: segment,
    minWeighIns: { ratio: MIN_WEIGHIN_RATIO, min: MIN_WEIGHINS_FOR_RATE },
    dayFlags,
    minDays: MIN_DAYS_FOR_RATE,
  });
}

/** How many more weigh-ins are needed for a first (14-day) rate read. */
export function weighInsNeededForRate(weighIns: readonly WeighIn[], endDate: LocalDate): number {
  const start = addDays(endDate, -(MIN_DAYS_FOR_RATE - 1));
  const n = [...weighInsByDate(weighIns).keys()].filter((d) => d >= start && d <= endDate).length;
  const need = Math.max(MIN_WEIGHINS_FOR_RATE, Math.ceil(MIN_DAYS_FOR_RATE * MIN_WEIGHIN_RATIO));
  return Math.max(0, need - n);
}

export function isConfidentlyAbove(r: RateResult, x: number): boolean {
  return r.ratePctPerWeek - x > r.margin;
}

export function isConfidentlyBelow(r: RateResult, x: number): boolean {
  return x - r.ratePctPerWeek > r.margin;
}

/** Is `rate` inside goal ± tolerance, or not confidently outside it? */
export function notConfidentlyOutside(r: RateResult, goalRate: number, tolerance: number): boolean {
  return !isConfidentlyAbove(r, goalRate + tolerance) && !isConfidentlyBelow(r, goalRate - tolerance);
}

// ── Entry sanity ──

export function sanityCheck(newKg: number, trendKg: number | null): { ok: boolean; pct: number } {
  if (trendKg === null || !Number.isFinite(trendKg) || trendKg <= 0) return { ok: true, pct: 0 };
  const pct = Math.abs(newKg - trendKg) / trendKg;
  return { ok: pct <= SANITY_PCT, pct };
}

/** Dates in [from, to] that have a real weigh-in. */
export function weighInDates(weighIns: readonly WeighIn[], from: LocalDate, to: LocalDate): LocalDate[] {
  const set = weighInsByDate(weighIns);
  return dateRange(from, to).filter((d) => set.has(d));
}
