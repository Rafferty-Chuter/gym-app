/**
 * Connections (L1): how sleep, food and weight change line up with the
 * lifts, measured across the person's own history. The founder: the app's
 * value is seeing weight, food and training in one place, "then a way to
 * see how each is affecting each other, more for training, in ways they
 * wouldn't on their own". Shown in the weekly report (and later the coach
 * chat), never as advice: each line says what the numbers show.
 *
 * Method, per session:
 * - Strength is each compound lift's best set as an estimated one-rep max,
 *   as a percentage above or below that lift's own level around then (the
 *   median of up to two sessions either side), so steady progress or a cut's
 *   slow fade does not count as a difference. A session with several lifts
 *   is one reading, their mean.
 * - Each condition (the night's sleep, the two days' calories before, the
 *   day before's protein, the fortnight's weight trend, days since the last
 *   session, the morning's HRV) is read for the same session.
 * - Sessions are split into thirds by the condition; the top third is
 *   compared with the bottom third (the middle is left out for contrast).
 *
 * Silence beats false positives: a difference is reported only when each
 * third has CONN_MIN_GROUP sessions, it is at least CONN_MIN_EFFECT_PCT,
 * and its interval at CONN_Z (strict, as up to six are read at once)
 * leaves out zero. Otherwise it is "no clear difference", or nothing at all
 * below the minimum. The data shows what moved together, not what caused
 * what, and the words say no more than that.
 *
 * Pure: data and `now` in, connections out.
 */

import { addDays, dayDiff, type LocalDate, type Now } from "@/lib/dates";
import { mean, median, stdev } from "@/lib/stats";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { countsForBalance } from "@/lib/physique/food/energy";
import { dailyIntakeSeries } from "@/lib/physique/intake";
import { nightsByDate } from "@/lib/physique/sleep";
import { isCompoundLift, liftSeries, workoutDate } from "@/lib/physique/strength";
import { trendSeries } from "@/lib/physique/weight";
import type { DayFlags, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { WeightUnit } from "@/lib/units";

// ── Thresholds (tags as in 02-engine-spec) ──

/** History read, days. OURS: 16 weeks gives about 30 sessions at two a week while the training itself stays much the same. */
export const CONN_WINDOW_DAYS = 112;
/** Sessions either side that set a lift's level around a session. OURS: two each way follows a block's progress without chasing one session. */
export const CONN_NEIGHBOURS = 2;
/** Neighbouring sessions needed for a level. OURS: a median of three is the least that ignores one odd session. */
export const CONN_MIN_NEIGHBOURS = 3;
/** Neighbours count only within this many days. OURS: six weeks, a training block. */
export const CONN_NEIGHBOUR_DAYS = 42;
/** A session further than this from its level, %, is left out. OURS: beyond day-to-day strength (2 to 5%), it is a logging slip or a different variation. */
export const CONN_MAX_RESIDUAL_PCT = 15;
/** Sessions in each third before a comparison is read. OURS: below eight a single odd session moves the mean by more than the effects looked for. */
export const CONN_MIN_GROUP = 8;
/** Width of the interval, in standard errors. OURS: about Bonferroni for six comparisons at 5% (2.64), rounded down to 2.5. */
export const CONN_Z = 2.5;
/** Smallest difference reported, %. EVID: a top set's session-to-session spread is about 2 to 3%; under 1.5% is not one a lifter would notice. */
export const CONN_MIN_EFFECT_PCT = 1.5;
/** Days before a session whose calories are read. OURS: glycogen and fatigue turn over in a day or two. */
export const CONN_INTAKE_DAYS = 2;
/** Days of weight trend read before a session. OURS: two weeks, the shortest the trend's rate is steady over. */
export const CONN_RATE_DAYS = 14;
/** Days off counted at most. OURS: a week off is a break, not rest between sessions. */
export const CONN_MAX_REST_DAYS = 7;

// ── Types ──

export type ConnectionId = "sleep" | "calories" | "protein" | "rate" | "rest" | "hrv";

export type ConnectionGroup = {
  /** The third's typical condition, formatted: "7h 50m", "2,900 kcal". */
  value: string;
  /** Mean strength against the lift's level, %. */
  pct: number;
  sessions: number;
};

export type Connection = {
  id: ConnectionId;
  /** "Sleep", "Calories", ... */
  label: string;
  /** "linked": a clear difference; "none": enough sessions, no clear difference. */
  state: "linked" | "none";
  /** One sentence with both groups' numbers. */
  text: string;
  /** Top third minus bottom third, %, one decimal. */
  diffPct: number;
  high: ConnectionGroup;
  low: ConnectionGroup;
  /** The sessions behind each third, for drawing them on the timeline (PR2). */
  points: { high: SessionPoint[]; low: SessionPoint[] };
};

/** One session in a comparison: its date and strength against the lift's own level, %. */
export type SessionPoint = { date: LocalDate; pct: number };

export type ConnectionsResult = {
  from: LocalDate;
  through: LocalDate;
  /** Weeks read: CONN_WINDOW_DAYS, or longer when the caller asks for more history. */
  weeks: number;
  /** Sessions with a strength reading in the window. */
  sessions: number;
  /** Clear differences first (largest first), then the conditions with none. Empty below every minimum. */
  items: Connection[];
};

export type ConnectionInputs = {
  workouts: readonly StoredWorkout[];
  sleepNights: readonly SleepNight[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  weighIns: readonly WeighIn[];
  unit: WeightUnit;
};

// ── Strength per session ──

export type SessionStrength = { date: LocalDate; pct: number };

/**
 * Each session's strength against the lifts' own levels around it, from
 * `from` to `now.today`. Compound lifts only: isolation sets swing too much
 * with rep ranges to read a few percent.
 */
export function sessionStrength(workouts: readonly StoredWorkout[], unit: WeightUnit, now: Now, from: LocalDate): SessionStrength[] {
  const byDate = new Map<LocalDate, number[]>();
  for (const s of liftSeries(workouts, unit, now)) {
    if (!isCompoundLift(s.name, s.exerciseId)) continue;
    const ex = s.exposures;
    for (let i = 0; i < ex.length; i++) {
      const e = ex[i];
      if (e.date < from) continue;
      const near: number[] = [];
      for (let k = Math.max(0, i - CONN_NEIGHBOURS); k <= Math.min(ex.length - 1, i + CONN_NEIGHBOURS); k++) {
        if (k !== i && Math.abs(dayDiff(ex[k].date, e.date)) <= CONN_NEIGHBOUR_DAYS) near.push(ex[k].e1rm);
      }
      if (near.length < CONN_MIN_NEIGHBOURS) continue;
      const level = median(near);
      if (!(level > 0)) continue;
      const pct = (e.e1rm / level - 1) * 100;
      if (Math.abs(pct) > CONN_MAX_RESIDUAL_PCT) continue;
      const list = byDate.get(e.date) ?? [];
      list.push(pct);
      byDate.set(e.date, list);
    }
  }
  return [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, xs]) => ({ date, pct: mean(xs) }));
}

// ── Comparison ──

type Pair = { pct: number; v: number; date?: LocalDate };

/** Top third against bottom third, or null when the thirds are too small or the values do not separate. */
export function compareThirds(pairs: readonly Pair[]): { high: Pair[]; low: Pair[]; diff: number; lo: number; hi: number } | null {
  const sorted = [...pairs].sort((a, b) => a.v - b.v);
  const n = sorted.length;
  const k = Math.floor(n / 3);
  if (k < CONN_MIN_GROUP) return null;
  const q1 = sorted[k - 1].v;
  const q2 = sorted[n - k].v;
  // Ties across the cut (rest days are whole numbers) would put one value in both groups.
  if (!(q1 < q2)) return null;
  const low = sorted.filter((p) => p.v <= q1);
  const high = sorted.filter((p) => p.v >= q2);
  const hp = high.map((p) => p.pct);
  const lp = low.map((p) => p.pct);
  const diff = mean(hp) - mean(lp);
  const se = Math.sqrt(stdev(hp) ** 2 / hp.length + stdev(lp) ** 2 / lp.length);
  return { high, low, diff, lo: diff - CONN_Z * se, hi: diff + CONN_Z * se };
}

// ── Conditions ──

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const signedRate = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)} %/wk`;
const days = (v: number) => {
  const d = Math.round(v);
  return `${d} ${d === 1 ? "day" : "days"}`;
};

type Wording = {
  label: string;
  fmt: (v: number) => string;
  /** "After your longest nights (7h 50m on average)". */
  high: (v: string) => string;
  /** "after your shortest (6h 05m)". */
  low: (v: string) => string;
  /** "your longest and shortest nights". */
  pair: string;
};

const WORDING: Record<ConnectionId, Wording> = {
  sleep: { label: "Sleep", fmt: (v) => formatHoursMin(Math.round(v * 60)), high: (v) => `After your longest nights (${v} on average)`, low: (v) => `after your shortest (${v})`, pair: "your longest and shortest nights" },
  calories: { label: "Calories", fmt: (v) => `${n0(v)} kcal`, high: (v) => `After eating more in the two days before (${v} a day)`, low: (v) => `after eating less (${v} a day)`, pair: "eating more and less in the two days before" },
  protein: { label: "Protein", fmt: (v) => `${n0(v)} g`, high: (v) => `After more protein the day before (${v})`, low: (v) => `after less (${v})`, pair: "more and less protein the day before" },
  rate: { label: "Weight trend", fmt: signedRate, high: (v) => `With the weight trend at ${v}`, low: (v) => `at ${v}`, pair: "your faster and slower weight change" },
  rest: { label: "Days off", fmt: days, high: (v) => `After ${v} off`, low: (v) => `after ${v}`, pair: "more and fewer days off" },
  hrv: { label: "HRV", fmt: (v) => `${n0(v)} ms`, high: (v) => `On mornings with your highest HRV (${v})`, low: (v) => `on your lowest (${v})`, pair: "your highest and lowest HRV mornings" },
};

/** The condition for one session date, or null when it was not recorded. */
function conditionReaders(i: ConnectionInputs, from: LocalDate, now: Now): Record<ConnectionId, (d: LocalDate) => number | null> {
  const nights = nightsByDate(i.sleepNights);
  const intake = new Map(dailyIntakeSeries(i.foodEntries, i.dayFlags, addDays(from, -CONN_INTAKE_DAYS), now.today).map((d) => [d.date, d]));
  const trend = new Map(trendSeries(i.weighIns).map((p) => [p.date, p.trendKg]));
  const rest = restDays(i.workouts, now.tz);
  return {
    sleep: (d) => {
      const n = nights.get(d);
      return n && n.valid ? n.asleepH : null;
    },
    hrv: (d) => {
      const h = nights.get(d)?.night.hrvMs;
      return typeof h === "number" && h > 0 ? h : null;
    },
    calories: (d) => {
      const counted = [1, 2].slice(0, CONN_INTAKE_DAYS).map((k) => intake.get(addDays(d, -k))).filter((x) => x && countsForBalance(x.status));
      return counted.length ? mean(counted.map((x) => x!.kcal)) : null;
    },
    protein: (d) => {
      const x = intake.get(addDays(d, -1));
      return x && x.status === "complete" ? x.proteinG : null;
    },
    rate: (d) => {
      const end = trend.get(addDays(d, -1));
      const start = trend.get(addDays(d, -1 - CONN_RATE_DAYS));
      return end != null && start != null && start > 0 ? ((end / start - 1) * 100 * 7) / CONN_RATE_DAYS : null;
    },
    rest: (d) => rest.get(d) ?? null,
  };
}

/** Days since the session before, per session date; null for the first or after a long break. */
function restDays(workouts: readonly StoredWorkout[], tz: string): Map<LocalDate, number> {
  const dates = [...new Set(workouts.map((w) => workoutDate(w, tz)).filter((d): d is LocalDate => d != null))].sort();
  const out = new Map<LocalDate, number>();
  for (let k = 1; k < dates.length; k++) {
    const gap = dayDiff(dates[k - 1], dates[k]);
    if (gap >= 1 && gap <= CONN_MAX_REST_DAYS) out.set(dates[k], gap);
  }
  return out;
}

// ── Connections ──

const ORDER: readonly ConnectionId[] = ["sleep", "calories", "protein", "rate", "rest", "hrv"];
const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Connections between the lifts and sleep, food, weight change, rest and
 * HRV over the CONN_WINDOW_DAYS to `now.today`. Conditions without enough
 * sessions are left out; the rest are "linked" or "none".
 */
export function connections(i: ConnectionInputs, now: Now, opts: { days?: number } = {}): ConnectionsResult {
  const through = now.today;
  // PR2: Progress can read more history (6M, All); never less than the window the minimums were set for.
  const days = Math.max(CONN_WINDOW_DAYS, opts.days ?? 0);
  const from = addDays(through, -(days - 1));
  const strength = sessionStrength(i.workouts, i.unit, now, from);
  const read = conditionReaders(i, from, now);
  const items: Connection[] = [];
  for (const id of ORDER) {
    const pairs = strength.map((s) => ({ pct: s.pct, v: read[id](s.date), date: s.date })).filter((p): p is Pair & { date: LocalDate } => p.v != null && Number.isFinite(p.v));
    const c = compareThirds(pairs);
    if (!c) continue;
    const w = WORDING[id];
    const hv = w.fmt(mean(c.high.map((p) => p.v)));
    const lv = w.fmt(mean(c.low.map((p) => p.v)));
    const linked = (c.lo > 0 || c.hi < 0) && Math.abs(c.diff) >= CONN_MIN_EFFECT_PCT;
    const diffPct = round1(c.diff);
    const text = linked
      ? `${w.high(hv)}, your lifts were ${Math.abs(diffPct).toFixed(1)}% ${diffPct > 0 ? "stronger" : "weaker"} than ${w.low(lv)}.`
      : `No clear difference between ${w.pair} (${hv} against ${lv}).`;
    items.push({
      id,
      label: w.label,
      state: linked ? "linked" : "none",
      text,
      diffPct,
      high: { value: hv, pct: round1(mean(c.high.map((p) => p.pct))), sessions: c.high.length },
      low: { value: lv, pct: round1(mean(c.low.map((p) => p.pct))), sessions: c.low.length },
      points: { high: c.high.map((p) => ({ date: p.date as LocalDate, pct: p.pct })), low: c.low.map((p) => ({ date: p.date as LocalDate, pct: p.pct })) },
    });
  }
  items.sort((a, b) => (a.state === b.state ? Math.abs(b.diffPct) - Math.abs(a.diffPct) : a.state === "linked" ? -1 : 1));
  return { from, through, weeks: Math.round(days / 7), sessions: strength.length, items };
}

/** Sessions with a strength reading needed before any comparison can be read. */
export const CONN_MIN_SESSIONS = CONN_MIN_GROUP * 3;
