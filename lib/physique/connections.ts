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
 * - Each condition is read for the same session, each one with studies
 *   behind a possible effect on lifting (C7): the night's sleep, the day
 *   before's carbs and calories against maintenance, the three
 *   days' protein, the time of day, days since the last session, the
 *   fortnight's weight trend and the morning's HRV.
 * - Sessions are split into thirds by the condition; the top third is
 *   compared with the bottom third (the middle is left out for contrast).
 *
 * Silence beats false positives: a difference is reported only when each
 * third has CONN_MIN_GROUP sessions, it is at least CONN_MIN_EFFECT_PCT,
 * and its interval at CONN_Z (strict, as up to eight are read at once)
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
import type { DayFlags, ExpenditurePoint, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";
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
/** Width of the interval, in standard errors. OURS: about Bonferroni for eight comparisons at 5% (2.73), so reading more conditions does not find more by chance. */
export const CONN_Z = 2.7;
/** Smallest difference reported, %. EVID: a top set's session-to-session spread is about 2 to 3%; under 1.5% is not one a lifter would notice. */
export const CONN_MIN_EFFECT_PCT = 1.5;
/** Days before a session whose calories are read. OURS: the day before, as carbs, so the two are read on the same days and an overlap between them shows (C7). */
export const CONN_INTAKE_DAYS = 1;
/** Days before a session whose protein is read. OURS: muscle protein synthesis stays raised for a day or two after training, so three days covers the last session's recovery. */
export const CONN_PROTEIN_DAYS = 3;
/** Days of weight trend read before a session. OURS: two weeks, the shortest the trend's rate is steady over. */
export const CONN_RATE_DAYS = 14;
/** Two conditions this correlated across the same sessions are one finding, not two (C7). OURS: at 0.6 most of one's ups and downs are the other's, so the data cannot tell them apart. */
export const CONN_OVERLAP_R = 0.6;
/** Days off counted at most. OURS: a week off is a break, not rest between sessions. */
export const CONN_MAX_REST_DAYS = 7;
/** Days the training pace is read over, for how soon the first comparison comes. OURS: four weeks, recent enough to be the person's habit now. */
export const CONN_PACE_DAYS = 28;

// ── Types ──

export type ConnectionId = "sleep" | "carbs" | "balance" | "protein" | "time" | "rest" | "rate" | "hrv";

/** What studies found about a condition and lifting, one sentence, with the source. */
export type ConnectionEvidence = { text: string; source: string };

export type ConnectionGroup = {
  /** The third's typical condition, formatted: "7h 50m", "310 g". */
  value: string;
  /** Mean strength against the lift's level, %. */
  pct: number;
  sessions: number;
};

export type Connection = {
  id: ConnectionId;
  /** "Sleep the night before", "Carbs the day before", ... */
  label: string;
  /** "linked": a clear difference; "none": enough sessions, no clear difference. */
  state: "linked" | "none";
  /** One sentence with both groups' numbers. */
  text: string;
  /** Top third minus bottom third, %, one decimal. */
  diffPct: number;
  high: ConnectionGroup;
  low: ConnectionGroup;
  /** What studies found, when there is a study worth naming (C7). */
  evidence: ConnectionEvidence | null;
  /** Another clear difference that rose and fell with this one across the same sessions, so the two cannot be told apart (C7). */
  movedWith: ConnectionId | null;
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
  /** Conditions with enough sessions to be compared, whatever the result. */
  checked: number;
  /** Sessions with a compound lift a week over the last CONN_PACE_DAYS, for how soon the first read comes (PR3d). */
  recentPerWeek: number;
};

export type ConnectionInputs = {
  workouts: readonly StoredWorkout[];
  sleepNights: readonly SleepNight[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  weighIns: readonly WeighIn[];
  /** The maintenance estimate by day, for calories against maintenance; without it that condition is not read. */
  expenditure?: readonly ExpenditurePoint[] | null;
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
const balance = (v: number) => (Math.abs(v) < 50 ? "at maintenance" : `${n0(Math.abs(v))} ${v < 0 ? "under" : "over"} maintenance`);
const clock = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
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
  evidence: ConnectionEvidence | null;
};

/**
 * Each condition's words and what studies found. Only conditions with
 * studies behind a possible effect on lifting are read (C7); the sentence
 * says what the person's own sessions showed, the evidence line what the
 * studies showed, and neither says what to do.
 */
const WORDING: Record<ConnectionId, Wording> = {
  sleep: {
    label: "Sleep the night before",
    fmt: (v) => formatHoursMin(Math.round(v * 60)),
    high: (v) => `After your longest nights (${v} on average)`,
    low: (v) => `after your shortest (${v})`,
    pair: "your longest and shortest nights",
    evidence: { text: "Across 69 studies, a night of 6 hours or less lowered performance, strength included.", source: "Craven J et al. Sports Med 2022;52:2669–90" },
  },
  carbs: {
    label: "Carbs the day before",
    fmt: (v) => `${n0(v)} g`,
    high: (v) => `After your highest-carb days (${v} on average)`,
    low: (v) => `after your lowest (${v})`,
    pair: "your highest- and lowest-carb days",
    evidence: { text: "More carbs helped in 6 of 19 short-term studies, mostly in sessions of more than 10 sets a muscle.", source: "Henselmans M et al. Nutrients 2022;14:856" },
  },
  balance: {
    label: "Calories the day before",
    fmt: balance,
    high: (v) => `After your highest-calorie days (${v} on average)`,
    low: (v) => `after your lowest (${v})`,
    pair: "your highest- and lowest-calorie days",
    evidence: { text: "Over weeks, training in a deficit gained less muscle, while strength gains held up.", source: "Murphy C, Koehler K. Scand J Med Sci Sports 2022;32:125–37" },
  },
  protein: {
    label: "Protein over three days",
    fmt: (v) => `${n0(v)} g a day`,
    high: (v) => `After your highest-protein three days (${v} on average)`,
    low: (v) => `after your lowest (${v})`,
    pair: "your highest- and lowest-protein days",
    evidence: { text: "Across 49 trials, more protein added to strength and muscle gains, levelling off at about 1.6 g per kg a day.", source: "Morton RW et al. Br J Sports Med 2018;52:376–84" },
  },
  time: {
    label: "Time of day",
    fmt: clock,
    high: (v) => `In your latest sessions (around ${v})`,
    low: (v) => `in your earliest (around ${v})`,
    pair: "your earliest and latest sessions",
    evidence: { text: "Strength tests higher in the evening than the morning, a gap that narrows with morning training.", source: "Grgic J et al. Chronobiol Int 2019;36:449–60" },
  },
  rest: {
    label: "Days since the last session",
    fmt: days,
    high: (v) => `After your longest breaks (${v} on average)`,
    low: (v) => `after your shortest (${v})`,
    pair: "your longest and shortest breaks",
    evidence: { text: "After sets taken to failure, strength and bar speed took longer to come back, beyond 24 to 48 hours.", source: "Morán-Navarro R et al. Eur J Appl Physiol 2017;117:2387–99" },
  },
  rate: {
    label: "Weight trend",
    fmt: signedRate,
    high: (v) => `With the weight trend at ${v}`,
    low: (v) => `at ${v}`,
    pair: "your faster and slower weight change",
    evidence: { text: "In a trial with athletes, losing about 0.7% of body weight a week kept more lean mass and strength than 1.4% a week.", source: "Garthe I et al. Int J Sport Nutr Exerc Metab 2011;21:97–104" },
  },
  hrv: {
    label: "HRV that morning",
    fmt: (v) => `${n0(v)} ms`,
    high: (v) => `On mornings with your highest HRV (${v})`,
    low: (v) => `on your lowest (${v})`,
    pair: "your highest and lowest HRV mornings",
    evidence: null,
  },
};

/** Hour of the day a session was saved, local, as hours with fractions (18.5 is 18:30). */
function localHour(iso: string, tz: string): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return Number.isFinite(h) && Number.isFinite(m) ? h + m / 60 : null;
}

/** The condition for one session date, or null when it was not recorded. */
function conditionReaders(i: ConnectionInputs, from: LocalDate, now: Now): Record<ConnectionId, (d: LocalDate) => number | null> {
  const nights = nightsByDate(i.sleepNights);
  const lead = Math.max(CONN_INTAKE_DAYS, CONN_PROTEIN_DAYS);
  const intake = new Map(dailyIntakeSeries(i.foodEntries, i.dayFlags, addDays(from, -lead), now.today).map((d) => [d.date, d]));
  const maintenance = new Map((i.expenditure ?? []).map((p) => [p.date, p.tdee]));
  const trend = new Map(trendSeries(i.weighIns).map((p) => [p.date, p.trendKg]));
  const rest = restDays(i.workouts, now.tz);
  const hours = new Map<LocalDate, number>();
  for (const w of i.workouts) {
    const d = workoutDate(w, now.tz);
    const h = localHour(w.completedAt, now.tz);
    if (d && h != null && !hours.has(d)) hours.set(d, h);
  }
  const complete = (d: LocalDate) => {
    const x = intake.get(d);
    return x && x.status === "complete" ? x : null;
  };
  return {
    sleep: (d) => {
      const n = nights.get(d);
      return n && n.valid ? n.asleepH : null;
    },
    hrv: (d) => {
      const h = nights.get(d)?.night.hrvMs;
      return typeof h === "number" && h > 0 ? h : null;
    },
    carbs: (d) => complete(addDays(d, -1))?.carbsG ?? null,
    balance: (d) => {
      const diffs: number[] = [];
      for (let k = 1; k <= CONN_INTAKE_DAYS; k++) {
        const day = addDays(d, -k);
        const x = intake.get(day);
        const m = maintenance.get(day);
        if (x && countsForBalance(x.status) && m != null) diffs.push(x.kcal - m);
      }
      return diffs.length ? mean(diffs) : null;
    },
    protein: (d) => {
      const xs: number[] = [];
      for (let k = 1; k <= CONN_PROTEIN_DAYS; k++) {
        const x = complete(addDays(d, -k));
        if (x) xs.push(x.proteinG);
      }
      return xs.length >= 2 ? mean(xs) : null;
    },
    time: (d) => hours.get(d) ?? null,
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

// ── Overlap ──

/** Pearson correlation of two conditions over the sessions both were read for; null with fewer than CONN_MIN_GROUP of them. */
function overlapR(a: ReadonlyMap<LocalDate, number>, b: ReadonlyMap<LocalDate, number>): number | null {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [d, x] of a) {
    const y = b.get(d);
    if (y != null) {
      xs.push(x);
      ys.push(y);
    }
  }
  if (xs.length < CONN_MIN_GROUP) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let k = 0; k < xs.length; k++) {
    sxy += (xs[k] - mx) * (ys[k] - my);
    sxx += (xs[k] - mx) ** 2;
    syy += (ys[k] - my) ** 2;
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}

// ── Connections ──

const ORDER: readonly ConnectionId[] = ["sleep", "carbs", "balance", "protein", "time", "rest", "rate", "hrv"];
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
  const values = new Map<ConnectionId, Map<LocalDate, number>>();
  for (const id of ORDER) {
    const pairs = strength.map((s) => ({ pct: s.pct, v: read[id](s.date), date: s.date })).filter((p): p is Pair & { date: LocalDate } => p.v != null && Number.isFinite(p.v));
    values.set(id, new Map(pairs.map((p) => [p.date, p.v])));
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
      evidence: w.evidence,
      movedWith: null,
      points: { high: c.high.map((p) => ({ date: p.date as LocalDate, pct: p.pct })), low: c.low.map((p) => ({ date: p.date as LocalDate, pct: p.pct })) },
    });
  }
  items.sort((a, b) => (a.state === b.state ? Math.abs(b.diffPct) - Math.abs(a.diffPct) : a.state === "linked" ? -1 : 1));
  // Two clear differences that moved together are one finding: the larger stays and names the other (C7).
  const linked = items.filter((c) => c.state === "linked");
  for (let x = 0; x < linked.length; x++) {
    const keep = linked[x];
    if (keep.state !== "linked") continue;
    for (let y = x + 1; y < linked.length; y++) {
      const other = linked[y];
      if (other.state !== "linked") continue;
      const r = overlapR(values.get(keep.id)!, values.get(other.id)!);
      if (r == null || Math.abs(r) < CONN_OVERLAP_R) continue;
      keep.movedWith = other.id;
      keep.text = `${keep.text} ${WORDING[other.id].label} ${r > 0 ? "rose and fell" : "moved the opposite way"} with it, so the two can't be told apart.`;
      other.state = "none";
    }
  }
  items.sort((a, b) => (a.state === b.state ? Math.abs(b.diffPct) - Math.abs(a.diffPct) : a.state === "linked" ? -1 : 1));
  const paceFrom = addDays(through, -(CONN_PACE_DAYS - 1));
  // Sessions with a compound lift, counted from the log itself: the newest session has no strength reading until the next ones arrive.
  const paceDates = new Set<LocalDate>();
  for (const l of liftSeries(i.workouts, i.unit, now)) if (isCompoundLift(l.name, l.exerciseId)) for (const e of l.exposures) if (e.date >= paceFrom && e.date <= through) paceDates.add(e.date);
  const recentPerWeek = (paceDates.size * 7) / CONN_PACE_DAYS;
  return { from, through, weeks: Math.round(days / 7), sessions: strength.length, items, checked: items.length, recentPerWeek };
}

/** Sessions with a strength reading needed before any comparison can be read. */
export const CONN_MIN_SESSIONS = CONN_MIN_GROUP * 3;
