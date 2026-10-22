/**
 * Connections (L1; rebuilt per lift in IN5, 08-insights.md): how sleep,
 * food, training load and timing line up with the lifts, measured across
 * the person's own history. The founder: the app's value is seeing weight,
 * food and training in one place, "then a way to see how each is affecting
 * each other, more for training, in ways they wouldn't on their own".
 * Never advice: each line says what the numbers show.
 *
 * Method (research L §4):
 * - Strength is each compound lift's best set as an estimated 1RM, on a log
 *   scale, read against that lift's own course: an intercept for each
 *   4-week block, a slope within blocks and deload weeks, fitted in the
 *   same regression as the condition (Frisch–Waugh), so steady progress, a
 *   cut's fade and runs of short nights are not mistaken for each other.
 *   (The old median of neighbouring sessions halved an effect when short
 *   nights came in runs.)
 * - Lifts on the same day are averaged into one reading, so a day counts
 *   once; the standard error is robust and widened for day-to-day carry-over
 *   (lag-1 autocorrelation).
 * - Every condition has its expected direction set here, in code, before
 *   any data (sleep longer: stronger; woke early: weaker, ...). A link needs
 *   all of: false-discovery control across the conditions read (Benjamini–
 *   Hochberg, q 0.10; the opposite direction needs z 3.3), an effect a
 *   lifter would notice (1.5%, or half the day-to-day noise), the same sign
 *   and half the floor in both halves of the history (alternating 4-week
 *   blocks), with 40 days or more a real alignment beating 19 of 20 shifted
 *   ones, and the same verdict a week earlier.
 * - The effect shown is shrunk by (1 − 1/z²), so a link just over the line
 *   is not shown at its luckiest; in kilos on each main lift, from that
 *   lift's own sessions once it has 30, else from all of them.
 *
 * Silence beats false positives: below the gates a condition is left out
 * or reads "no clear link". What moved together, never what caused what.
 *
 * IN9 adds drinks the evening before (a drinking evening against a dry
 * one, `dayExtras.ts`), expected to weaken, read as strictly as the rest;
 * its studies line says strength often holds.
 *
 * Pure: data and `now` in, connections out.
 */

import { addDays, dayDiff, type LocalDate, type Now } from "@/lib/dates";
import { mean, median, normalCdf, solveLinear, stdev } from "@/lib/stats";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { countsForBalance } from "@/lib/physique/food/energy";
import { dailyIntakeSeries } from "@/lib/physique/intake";
import { drinkingEvenings } from "@/lib/physique/dayExtras";
import { nightsByDate } from "@/lib/physique/sleep";
import { deloadWeeks, isCompoundLift, liftSeries, MAIN_LIFT_WEEKS, pickMainLifts, workoutDate } from "@/lib/physique/strength";
import { trendSeries } from "@/lib/physique/weight";
import { countHardSets } from "@/lib/completedSets";
import type { DailyVitals, DayFlags, ExpenditurePoint, FoodEntry, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { kgToDisplay, type WeightUnit } from "@/lib/units";
import { workoutStartedAt } from "@/lib/workoutTime";

// ── Thresholds (tags as in 02-engine-spec) ──

/** History read, days. OURS (IN5): a year; the block terms follow the training's course, so more history adds power instead of drift. */
export const CONN_WINDOW_DAYS = 365;
/** Days from the first session read to the last before anything is read. OURS (research L §4): twelve weeks, three blocks. */
export const CONN_MIN_HISTORY_DAYS = 84;
/** Days in each group (third, or yes and no) before a comparison is read. OURS (research L §4): ten each way. */
export const CONN_MIN_GROUP = 10;
/** Distinct weeks each group must be spread over. OURS (research L §4): a link from one odd week is not one. */
export const CONN_MIN_GROUP_WEEKS = 6;
/** Days of each lift's own course one intercept covers. OURS (research L §4): four weeks, a training block. */
export const CONN_BLOCK_DAYS = 28;
/** A session further than this from its lift's course (log, about 15%) is left out. OURS: a logging slip or a different variation. */
export const CONN_MAX_RESIDUAL = 0.15;
/** False-discovery rate across the conditions read. OURS (research L §4; Benjamini and Hochberg 1995, valid under positive dependence, Benjamini and Yekutieli 2001). */
export const CONN_Q = 0.1;
/** z a link against its expected direction needs. OURS (research L §4). */
export const CONN_OPPOSITE_Z = 3.3;
/** Smallest difference reported, %. EVID: a top set's session-to-session spread is about 2 to 3%; under 1.5% is not one a lifter would notice. */
export const CONN_MIN_EFFECT_PCT = 1.5;
/** ...or this share of the person's own day-to-day noise, if larger. EVID: Hopkins' smallest worthwhile change (research L §4). */
export const CONN_NOISE_SHARE = 0.5;
/** Days of readings before the shifted-alignment check runs. OURS (research L §4). */
export const CONN_SHIFT_MIN_DAYS = 40;
/** Shifted alignments tried, and the fewest days a shift moves. OURS (Harris 2020 shift test, research L §4). */
export const CONN_SHIFTS = 20;
export const CONN_SHIFT_MIN_LAG = 7;
/** Share of shifted alignments that may match or beat the real one. OURS: 1 in 20. */
export const CONN_SHIFT_MAX_SHARE = 0.05;
/** Most the standard error is widened for carry-over between days. OURS: a guard against a runaway estimate. */
export const CONN_AR_MAX = 3;
/** Days before today the same verdict must also hold. OURS (research L §4 hysteresis): a link shows after two weekly passes. */
export const CONN_HOLD_DAYS = 7;
/** A lift's own sessions before its effect is read alone. OURS (08 IN5). */
export const CONN_PER_LIFT_MIN = 30;
/** Days before a session whose calories are read. OURS: the day before, as carbs, so an overlap between them shows (C7). */
export const CONN_INTAKE_DAYS = 1;
/** Days before a session whose protein, and calories over days, are read. OURS: recovery from the last session runs a day or two. */
export const CONN_PROTEIN_DAYS = 3;
/** Days of weight trend read before a session. OURS: two weeks, the shortest the trend's rate is steady over. */
export const CONN_RATE_DAYS = 14;
/** Two conditions this correlated across the same days are one finding, not two (C7). OURS. */
export const CONN_OVERLAP_R = 0.6;
/** Two links correlated this much are refitted together; the smaller is kept only if it still stands with the larger held fixed. OURS (research L §4: refit with both predictors). */
export const CONN_PARTIAL_R = 0.3;
/** z the smaller link needs with the larger held fixed. OURS: two-sided 5%. */
export const CONN_PARTIAL_Z = 1.96;
/** Days off counted at most. OURS: a week off is a break, not rest between sessions. */
export const CONN_MAX_REST_DAYS = 7;
/** Days since the same lift counted at most. OURS: two weeks. */
export const CONN_MAX_SAME_DAYS = 14;
/** Days of hard sets counted before a session. OURS: the week before. */
export const CONN_LOAD_DAYS = 7;
/** Minutes earlier than usual that count as waking early. EVID: sleep cut at the end of the night hurt more than a late bedtime (Craven 2022, research L §3). */
export const CONN_WAKE_EARLY_MIN = 60;
/** Nights the usual wake time is the median of, and the fewest. OURS: two weeks, as the sleep score's usual wake. */
export const CONN_USUAL_NIGHTS = 14;
export const CONN_USUAL_MIN = 5;
/** A short night, hours. EVID: 6 hours or less lowered performance across 69 studies (Craven 2022). */
export const CONN_SHORT_NIGHT_H = 6;
/** Days of HRV the usual is taken from, and the fewest readings. OURS: four weeks. */
export const CONN_HRV_DAYS = 28;
export const CONN_HRV_MIN = 10;
/** Days the training pace is read over, for how soon the first comparison comes. OURS. */
export const CONN_PACE_DAYS = 28;
/** Days with a strength reading needed before any comparison can be read: three groups of CONN_MIN_GROUP. */
export const CONN_MIN_SESSIONS = CONN_MIN_GROUP * 3;

// ── Types ──

export type ConnectionId = "sleep" | "wake" | "shortRun" | "hrv" | "carbs" | "balance" | "balance3" | "protein" | "alcohol" | "time" | "awake" | "rest" | "lastSame" | "load" | "rate";

/** What studies found about a condition and lifting, one sentence, with the source. */
export type ConnectionEvidence = { text: string; source: string };

export type ConnectionGroup = {
  /** The group's typical condition, formatted: "7h 50m", "310 g", "Woke early". */
  value: string;
  /** The same, unformatted, in the condition's own measure (1 or 0 for a yes-or-no condition). */
  mean: number;
  /** Mean strength against the lifts' own course, %. */
  pct: number;
  sessions: number;
};

/** A link's size on one lift, in kilos at its current level. */
export type LiftEffect = {
  name: string;
  /** Shrunk difference, %. */
  pct: number;
  kg: number;
  /** Sessions of this lift the read used. */
  sessions: number;
  /** True when read from this lift's own sessions; false when it is the pooled read put on its level. */
  own: boolean;
};

export type Connection = {
  id: ConnectionId;
  /** "Sleep the night before", "Carbs the day before", ... */
  label: string;
  /** "range": thirds of a measure; "yesno": a condition that was there or not. */
  kind: "range" | "yesno";
  /** "linked": a clear difference; "none": enough days, no clear difference. */
  state: "linked" | "none";
  /** One sentence with both groups' numbers. */
  text: string;
  /** Upper group (or yes) against lower (or no), %, shrunk, one decimal. */
  diffPct: number;
  high: ConnectionGroup;
  low: ConnectionGroup;
  /** Each main lift's share of it. */
  perLift: LiftEffect[];
  /** The regression's z, for the record. */
  z: number;
  /** Benjamini–Hochberg q across the conditions read. */
  q: number;
  /** What studies found, when there is a study worth naming (C7). */
  evidence: ConnectionEvidence | null;
  /** Another clear difference that rose and fell with this one across the same days (C7). */
  movedWith: ConnectionId | null;
  /** 1 when `movedWith` was higher on the same days, −1 when lower; null without one. */
  movedWithSign: 1 | -1 | null;
  /** The days behind each group, for drawing them (PR2). */
  points: { high: SessionPoint[]; low: SessionPoint[] };
};

/** One day in a comparison: its date and strength against the lifts' own course, %. */
export type SessionPoint = { date: LocalDate; pct: number };

export type ConnectionsResult = {
  from: LocalDate;
  through: LocalDate;
  weeks: number;
  /** Days with a strength reading in the window. */
  sessions: number;
  /** Clear differences first (largest first), then the conditions with none. Empty below every minimum. */
  items: Connection[];
  /** Conditions with enough days to be compared, whatever the result. */
  checked: number;
  /** Days with a compound lift a week over the last CONN_PACE_DAYS. */
  recentPerWeek: number;
};

export type ConnectionInputs = {
  workouts: readonly StoredWorkout[];
  sleepNights: readonly SleepNight[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  weighIns: readonly WeighIn[];
  /** The maintenance estimate by day; without it calories against maintenance are not read. */
  expenditure?: readonly ExpenditurePoint[] | null;
  unit: WeightUnit;
  /** IN9b: day vitals, for drinks logged in Apple Health. */
  vitals?: readonly DailyVitals[];
};

// ── Conditions: words and expected direction ──

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const signedRate = (v: number, unit: WeightUnit) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${kgToDisplay(Math.abs(v), unit).toFixed(1)} ${unit}/wk`;
const days = (v: number) => {
  const d = Math.round(v);
  return `${d} ${d === 1 ? "day" : "days"}`;
};
const balanceWords = (v: number) => (Math.abs(v) < 50 ? "at maintenance" : `${n0(Math.abs(v))} ${v < 0 ? "under" : "over"} maintenance`);
const clock = (h: number) => {
  const m = Math.round(h * 60);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

type Spec = {
  label: string;
  kind: "range" | "yesno";
  /** Expected sign of the effect of more of the condition (or of yes): +1 stronger, −1 weaker, 0 either way (tested both ways). */
  dir: 1 | -1 | 0;
  fmt: (v: number, unit: WeightUnit) => string;
  /** "After your longest nights (7h 50m on average)" / "On mornings you woke an hour or more earlier than usual". */
  high: (v: string) => string;
  low: (v: string) => string;
  pair: string;
  evidence: ConnectionEvidence | null;
};

const CRAVEN: ConnectionEvidence = { text: "Across 69 studies, a night of 6 hours or less lowered performance, strength included.", source: "Craven J et al. Sports Med 2022;52:2669–90" };
/** IN9: the honest read for drinks the evening before; strength often holds. */
export const SHAW: ConnectionEvidence = { text: "In a trial, jumps, a mid-thigh pull and curls held the morning after an evening's drinking; a hard cycling test ended 11% sooner.", source: "Shaw AG et al. Int J Sports Physiol Perform 2022;17:44–9" };
const MURPHY: ConnectionEvidence = { text: "Over weeks, training in a deficit gained less muscle, while strength gains held up.", source: "Murphy C, Koehler K. Scand J Med Sci Sports 2022;32:125–37" };

/**
 * Each condition's words, expected direction and what studies found. Only
 * conditions with studies behind a possible effect on lifting are read
 * (C7); the direction is set here, before any data, and never tuned.
 */
const SPEC: Record<ConnectionId, Spec> = {
  sleep: { label: "Sleep the night before", kind: "range", dir: 1, fmt: (v) => formatHoursMin(Math.round(v * 60)), high: (v) => `After your longest nights (${v} on average)`, low: (v) => `after your shortest (${v})`, pair: "your longest and shortest nights", evidence: CRAVEN },
  wake: { label: "Waking early", kind: "yesno", dir: -1, fmt: (v) => (v >= 0.5 ? "Woke early" : "Usual wake"), high: () => "On mornings you woke an hour or more earlier than usual", low: () => "on the rest", pair: "early and usual mornings", evidence: { text: "Sleep cut short at the end of the night lowered performance more than a late bedtime.", source: "Craven J et al. Sports Med 2022;52:2669–90" } },
  shortRun: { label: "Two short nights in a row", kind: "yesno", dir: -1, fmt: (v) => (v >= 0.5 ? "Two short nights" : "The rest"), high: () => "After two nights under 6 hours in a row", low: () => "after the rest", pair: "two short nights and the rest", evidence: { text: "Consecutive nights of restricted sleep lowered strength in multi-joint lifts.", source: "Knowles OE et al. J Sci Med Sport 2018;21:959–68" } },
  hrv: { label: "HRV that morning", kind: "range", dir: 1, fmt: (v) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)} SD`, high: (v) => `On mornings with your HRV highest against your usual (${v})`, low: (v) => `on your lowest (${v})`, pair: "your highest and lowest HRV mornings", evidence: null },
  carbs: { label: "Carbs the day before", kind: "range", dir: 1, fmt: (v) => `${n0(v)} g`, high: (v) => `After your highest-carb days (${v} on average)`, low: (v) => `after your lowest (${v})`, pair: "your highest- and lowest-carb days", evidence: { text: "More carbs helped in 6 of 19 short-term studies, mostly in sessions of more than 10 sets a muscle.", source: "Henselmans M et al. Nutrients 2022;14:856" } },
  balance: { label: "Calories the day before", kind: "range", dir: 1, fmt: balanceWords, high: (v) => `After your highest-calorie days (${v} on average)`, low: (v) => `after your lowest (${v})`, pair: "your highest- and lowest-calorie days", evidence: MURPHY },
  balance3: { label: "Calories over three days", kind: "range", dir: 1, fmt: balanceWords, high: (v) => `After your highest-calorie three days (${v} on average)`, low: (v) => `after your lowest (${v})`, pair: "your highest- and lowest-calorie three days", evidence: MURPHY },
  protein: { label: "Protein over three days", kind: "range", dir: 1, fmt: (v) => `${n0(v)} g a day`, high: (v) => `After your highest-protein three days (${v} on average)`, low: (v) => `after your lowest (${v})`, pair: "your highest- and lowest-protein days", evidence: { text: "Across 49 trials, more protein added to strength and muscle gains, levelling off at about 1.6 g per kg a day.", source: "Morton RW et al. Br J Sports Med 2018;52:376–84" } },
  // IN9: a drinking evening (0.25 g of alcohol per kg or more) against a dry one, the day after; evenings with a little, or unlogged, are left out.
  alcohol: { label: "Drinks the evening before", kind: "yesno", dir: -1, fmt: (v) => (v >= 0.5 ? "Drank" : "None"), high: () => "The day after an evening's drinking", low: () => "after evenings with none", pair: "days after drinking and days after none", evidence: SHAW },
  time: { label: "Time of day", kind: "range", dir: 1, fmt: clock, high: (v) => `In your latest sessions (around ${v})`, low: (v) => `in your earliest (around ${v})`, pair: "your earliest and latest sessions", evidence: { text: "Strength tests higher in the evening than the morning, a gap that narrows with morning training.", source: "Grgic J et al. Chronobiol Int 2019;36:449–60" } },
  awake: { label: "Hours awake before training", kind: "range", dir: 0, fmt: (v) => formatHoursMin(Math.round(v * 60)), high: (v) => `When you trained longest after waking (${v} on average)`, low: (v) => `when soonest (${v})`, pair: "your sessions soonest and longest after waking", evidence: null },
  rest: { label: "Days since the last session", kind: "range", dir: 0, fmt: days, high: (v) => `After your longest breaks (${v} on average)`, low: (v) => `after your shortest (${v})`, pair: "your longest and shortest breaks", evidence: { text: "After sets taken to failure, strength and bar speed took longer to come back, beyond 24 to 48 hours.", source: "Morán-Navarro R et al. Eur J Appl Physiol 2017;117:2387–99" } },
  lastSame: { label: "Days since the same lift", kind: "range", dir: 0, fmt: days, high: (v) => `After your longest gaps between sessions of a lift (${v} on average)`, low: (v) => `after your shortest (${v})`, pair: "your longest and shortest gaps between sessions of a lift", evidence: null },
  load: { label: "Hard sets the week before", kind: "range", dir: -1, fmt: (v) => `${n0(v)} sets`, high: (v) => `After your heaviest weeks (${v} on average)`, low: (v) => `after your lightest (${v})`, pair: "your heaviest and lightest weeks", evidence: null },
  rate: { label: "Weight trend", kind: "range", dir: 1, fmt: signedRate, high: (v) => `With the weight trend at ${v}`, low: (v) => `at ${v}`, pair: "your faster and slower weight change", evidence: { text: "In a trial with athletes, losing about 0.7% of body weight a week kept more lean mass and strength than 1.4% a week.", source: "Garthe I et al. Int J Sport Nutr Exerc Metab 2011;21:97–104" } },
};

/** The order conditions are read and listed in. */
export const CONNECTION_IDS: readonly ConnectionId[] = ["sleep", "wake", "shortRun", "hrv", "carbs", "balance", "balance3", "protein", "alcohol", "time", "awake", "rest", "lastSame", "load", "rate"];

// ── Readers ──

/** Hour of the day of an instant, local, as hours with fractions (18.5 is 18:30). */
function localHour(iso: string, tz: string): number | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const h = Number(parts.find((p) => p.type === "hour")?.value);
  const m = Number(parts.find((p) => p.type === "minute")?.value);
  return Number.isFinite(h) && Number.isFinite(m) ? h + m / 60 : null;
}

const clockMin = (hhmm: string | undefined): number | null => {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
};

type Reader = (lift: string, d: LocalDate) => number | null;

/** The condition for one session (a lift on a date), or null when it was not recorded. */
function readers(i: ConnectionInputs, from: LocalDate, now: Now, sameLiftGap: ReadonlyMap<string, number>): Record<ConnectionId, Reader> {
  const nights = nightsByDate(i.sleepNights);
  const lead = Math.max(CONN_INTAKE_DAYS, CONN_PROTEIN_DAYS, CONN_HRV_DAYS, CONN_USUAL_NIGHTS) + 1;
  const intake = new Map(dailyIntakeSeries(i.foodEntries, i.dayFlags, addDays(from, -lead), now.today).map((d) => [d.date, d]));
  const maintenance = new Map((i.expenditure ?? []).map((p) => [p.date, p.tdee]));
  const trend = new Map(trendSeries(i.weighIns).map((p) => [p.date, p.trendKg]));
  const evenings = drinkingEvenings(i.foodEntries, i.dayFlags, i.weighIns, addDays(from, -lead), now.today, { vitals: i.vitals });
  const workoutDays = [...new Set(i.workouts.map((w) => workoutDate(w, now.tz)).filter((d): d is LocalDate => d != null))].sort();
  const firstWorkout = workoutDays[0] ?? null;
  const rest = new Map<LocalDate, number>();
  for (let k = 1; k < workoutDays.length; k++) {
    const gap = dayDiff(workoutDays[k - 1], workoutDays[k]);
    if (gap >= 1 && gap <= CONN_MAX_REST_DAYS) rest.set(workoutDays[k], gap);
  }
  const hours = new Map<LocalDate, number>();
  const sets = new Map<LocalDate, number>();
  for (const w of i.workouts) {
    const d = workoutDate(w, now.tz);
    if (!d) continue;
    // IN1: the hour the session started; logged sessions stamp `completedAt` at the end.
    const start = workoutStartedAt(w);
    const h = start ? localHour(start, now.tz) : null;
    if (h != null && !hours.has(d)) hours.set(d, h);
    sets.set(d, (sets.get(d) ?? 0) + (w.exercises ?? []).reduce((n, ex) => n + countHardSets(ex.sets ?? []), 0));
  }
  const complete = (d: LocalDate) => {
    const x = intake.get(d);
    return x && x.status === "complete" ? x : null;
  };
  const kcalVsMaint = (d: LocalDate) => {
    const x = intake.get(d);
    const m = maintenance.get(d);
    return x && countsForBalance(x.status) && m != null ? x.kcal - m : null;
  };
  const asleep = (d: LocalDate) => {
    const n = nights.get(d);
    return n && n.valid ? n.asleepH : null;
  };
  const usualWake = (d: LocalDate) => {
    const xs: number[] = [];
    for (let k = 1; k <= CONN_USUAL_NIGHTS; k++) {
      const m = clockMin(nights.get(addDays(d, -k))?.night.wakeTime);
      if (m != null) xs.push(m);
    }
    return xs.length >= CONN_USUAL_MIN ? median(xs) : null;
  };
  const lnHrv = (d: LocalDate) => {
    const h = nights.get(d)?.night.hrvMs;
    return typeof h === "number" && h > 0 ? Math.log(h) : null;
  };
  return {
    sleep: (_l, d) => asleep(d),
    wake: (_l, d) => {
      const w = clockMin(nights.get(d)?.night.wakeTime);
      const u = usualWake(d);
      return w != null && u != null ? (u - w >= CONN_WAKE_EARLY_MIN ? 1 : 0) : null;
    },
    shortRun: (_l, d) => {
      const a = asleep(d);
      const b = asleep(addDays(d, -1));
      return a != null && b != null ? (a < CONN_SHORT_NIGHT_H && b < CONN_SHORT_NIGHT_H ? 1 : 0) : null;
    },
    hrv: (_l, d) => {
      const today = lnHrv(d);
      if (today == null) return null;
      const xs: number[] = [];
      for (let k = 1; k <= CONN_HRV_DAYS; k++) {
        const v = lnHrv(addDays(d, -k));
        if (v != null) xs.push(v);
      }
      const sd = stdev(xs);
      return xs.length >= CONN_HRV_MIN && sd > 0 ? (today - mean(xs)) / sd : null;
    },
    carbs: (_l, d) => complete(addDays(d, -1))?.carbsG ?? null,
    balance: (_l, d) => kcalVsMaint(addDays(d, -CONN_INTAKE_DAYS)),
    balance3: (_l, d) => {
      const xs: number[] = [];
      for (let k = 1; k <= CONN_PROTEIN_DAYS; k++) {
        const v = kcalVsMaint(addDays(d, -k));
        if (v != null) xs.push(v);
      }
      return xs.length >= 2 ? mean(xs) : null;
    },
    protein: (_l, d) => {
      const xs: number[] = [];
      for (let k = 1; k <= CONN_PROTEIN_DAYS; k++) {
        const x = complete(addDays(d, -k));
        if (x) xs.push(x.proteinG);
      }
      return xs.length >= 2 ? mean(xs) : null;
    },
    alcohol: (_l, d) => {
      const e = evenings.get(addDays(d, -1));
      return e ? (e.kind === "drink" ? 1 : 0) : null;
    },
    time: (_l, d) => hours.get(d) ?? null,
    awake: (_l, d) => {
      const h = hours.get(d);
      const w = clockMin(nights.get(d)?.night.wakeTime);
      if (h == null || w == null) return null;
      const a = h - w / 60;
      return a > 0 && a < 20 ? a : null;
    },
    rest: (_l, d) => rest.get(d) ?? null,
    lastSame: (l, d) => sameLiftGap.get(`${l}|${d}`) ?? null,
    load: (_l, d) => {
      // Only once the log reaches back a week: before that, "no sets" is no record.
      if (!firstWorkout || dayDiff(firstWorkout, d) <= CONN_LOAD_DAYS) return null;
      let n = 0;
      for (let k = 1; k <= CONN_LOAD_DAYS; k++) n += sets.get(addDays(d, -k)) ?? 0;
      return n;
    },
    // kg a week (TR12: kilos first).
    rate: (_l, d) => {
      const end = trend.get(addDays(d, -1));
      const start = trend.get(addDays(d, -1 - CONN_RATE_DAYS));
      return end != null && start != null && start > 0 ? ((end - start) * 7) / CONN_RATE_DAYS : null;
    },
  };
}

// ── The model ──

/** One session of one lift: its log e1RM and where it sits in the lift's own course. */
type Obs = { lift: string; date: LocalDate; y: number; block: number; t: number; deload: number };

/** Each compound lift's sessions in the window, with their block (counted back from `through`), time within it and deload flag. */
function observations(i: ConnectionInputs, now: Now, from: LocalDate, through: LocalDate): Obs[] {
  const deloads = deloadWeeks(i.workouts, now);
  const out: Obs[] = [];
  for (const s of liftSeries(i.workouts, i.unit, now)) {
    if (!isCompoundLift(s.name, s.exerciseId)) continue;
    for (const e of s.exposures) {
      if (e.date < from || e.date > through || !(e.e1rm > 0)) continue;
      const back = dayDiff(e.date, through);
      out.push({
        lift: s.key,
        date: e.date,
        y: Math.log(e.e1rm),
        block: Math.floor(back / CONN_BLOCK_DAYS),
        t: CONN_BLOCK_DAYS / 2 - (back % CONN_BLOCK_DAYS),
        deload: deloads.some((w) => e.date >= w.start && e.date <= w.end) ? 1 : 0,
      });
    }
  }
  return out;
}

/** A lift's nuisance design (block intercepts, a slope within blocks, deload) as a function giving what it leaves of a vector. */
function residualiser(rows: readonly Obs[]): ((v: readonly number[]) => number[]) | null {
  const blocks = [...new Set(rows.map((r) => r.block))];
  const hasDeload = rows.some((r) => r.deload) && rows.some((r) => !r.deload);
  const p = blocks.length + 1 + (hasDeload ? 1 : 0);
  if (rows.length < p + 2) return null;
  const design = rows.map((r) => [...blocks.map((b) => (r.block === b ? 1 : 0)), r.t, ...(hasDeload ? [r.deload] : [])]);
  const xtx = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => design.reduce((s, row) => s + row[a] * row[b], 0) + (a === b ? 1e-9 : 0)));
  return (v) => {
    const xty = Array.from({ length: p }, (_, a) => design.reduce((s, row, k) => s + row[a] * v[k], 0));
    const coef = solveLinear(xtx, xty);
    if (!coef) return v.map(() => 0);
    return v.map((x, k) => x - design[k].reduce((s, d, a) => s + d * coef[a], 0));
  };
}

/** Lag-1 autocorrelation of a series. */
function lag1(e: readonly number[]): number {
  if (e.length < 3) return 0;
  const m = mean(e);
  let num = 0;
  let den = 0;
  for (let k = 0; k < e.length; k++) {
    den += (e[k] - m) ** 2;
    if (k > 0) num += (e[k] - m) * (e[k - 1] - m);
  }
  return den > 0 ? num / den : 0;
}

/** Slope through the origin of `ry` on `rx` with a robust, carry-over widened standard error. */
function slope(rx: readonly number[], ry: readonly number[]): { beta: number; se: number; z: number; sd: number } | null {
  let sxx = 0;
  let sxy = 0;
  for (let k = 0; k < rx.length; k++) {
    sxx += rx[k] * rx[k];
    sxy += rx[k] * ry[k];
  }
  if (!(sxx > 1e-12)) return null;
  const beta = sxy / sxx;
  const e = ry.map((y, k) => y - beta * rx[k]);
  const hc = Math.sqrt(rx.reduce((s, x, k) => s + x * x * e[k] * e[k], 0)) / sxx;
  const r1 = lag1(e);
  const infl = Math.min(CONN_AR_MAX, Math.max(1, (1 + r1) / (1 - r1)));
  const se = hc * Math.sqrt(infl);
  return { beta, se, z: se > 0 ? beta / se : 0, sd: stdev(e) };
}

type DayRow = { date: LocalDate; block: number; rx: number; ry: number; x: number };

type Fit = {
  beta: number;
  z: number;
  sd: number;
  days: DayRow[];
  /** Per-lift slopes from their own sessions. */
  lifts: Map<string, { beta: number; z: number; n: number }>;
  /** Share of shifted alignments that matched or beat the real one the expected way; null below CONN_SHIFT_MIN_DAYS. */
  shiftShare: number | null;
};

/** Residualise y and x within each lift, keep sessions near the lift's course, then average each day. */
function dayRows(obs: readonly Obs[], xs: readonly number[], res: ReadonlyMap<string, (v: readonly number[]) => number[]>, idx: ReadonlyMap<string, number[]>): { rows: DayRow[]; perLift: Map<string, { rx: number[]; ry: number[] }> } {
  const byDay = new Map<LocalDate, { rx: number[]; ry: number[]; x: number[]; block: number }>();
  const perLift = new Map<string, { rx: number[]; ry: number[] }>();
  for (const [lift, ks] of idx) {
    const f = res.get(lift);
    if (!f) continue;
    const ry = f(ks.map((k) => obs[k].y));
    const rx = f(ks.map((k) => xs[k]));
    const keep = { rx: [] as number[], ry: [] as number[] };
    ks.forEach((k, j) => {
      if (Math.abs(ry[j]) > CONN_MAX_RESIDUAL) return;
      keep.rx.push(rx[j]);
      keep.ry.push(ry[j]);
      const o = obs[k];
      const d = byDay.get(o.date) ?? { rx: [], ry: [], x: [], block: o.block };
      d.rx.push(rx[j]);
      d.ry.push(ry[j]);
      d.x.push(xs[k]);
      byDay.set(o.date, d);
    });
    perLift.set(lift, keep);
  }
  const rows = [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, d]) => ({ date, block: d.block, rx: mean(d.rx), ry: mean(d.ry), x: mean(d.x) }));
  return { rows, perLift };
}

/** The condition against strength, with the shifted-alignment check. */
function fitCondition(obs: readonly Obs[], read: Reader, dir: 1 | -1 | 0): Fit | null {
  const keep: number[] = [];
  const xs: number[] = new Array(obs.length).fill(0);
  obs.forEach((o, k) => {
    const v = read(o.lift, o.date);
    if (v != null && Number.isFinite(v)) {
      keep.push(k);
      xs[k] = v;
    }
  });
  const idx = new Map<string, number[]>();
  for (const k of keep) idx.set(obs[k].lift, [...(idx.get(obs[k].lift) ?? []), k]);
  const res = new Map<string, (v: readonly number[]) => number[]>();
  for (const [lift, ks] of idx) {
    const f = residualiser(ks.map((k) => obs[k]));
    if (f) res.set(lift, f);
  }
  const { rows, perLift } = dayRows(obs, xs, res, idx);
  const s = slope(rows.map((r) => r.rx), rows.map((r) => r.ry));
  if (!s) return null;
  const lifts = new Map<string, { beta: number; z: number; n: number }>();
  for (const [lift, v] of perLift) {
    const f = v.rx.length >= CONN_PER_LIFT_MIN ? slope(v.rx, v.ry) : null;
    if (f) lifts.set(lift, { beta: f.beta, z: f.z, n: v.rx.length });
  }
  // Shifted alignments: each day's condition moved to another day, CONN_SHIFT_MIN_LAG or more away, round the end.
  let shiftShare: number | null = null;
  if (rows.length >= CONN_SHIFT_MIN_DAYS) {
    const dates = rows.map((r) => r.date);
    const xByDate = new Map(rows.map((r) => [r.date, r.x]));
    const n = dates.length;
    const span = n - 2 * CONN_SHIFT_MIN_LAG;
    let beat = 0;
    let tried = 0;
    for (let j = 0; j < CONN_SHIFTS && span > 0; j++) {
      const lag = CONN_SHIFT_MIN_LAG + Math.floor((j * span) / CONN_SHIFTS);
      const shifted = new Map(dates.map((d, k) => [d, xByDate.get(dates[(k + lag) % n]) as number]));
      const xs2 = [...xs];
      for (const k of keep) xs2[k] = shifted.get(obs[k].date) ?? xs[k];
      const r2 = dayRows(obs, xs2, res, idx).rows;
      const s2 = slope(r2.map((r) => r.rx), r2.map((r) => r.ry));
      if (!s2) continue;
      tried++;
      const toward = dir === 0 ? Math.abs(s2.z) >= Math.abs(s.z) : Math.sign(s2.z) === Math.sign(s.z) && Math.abs(s2.z) >= Math.abs(s.z);
      if (toward) beat++;
    }
    shiftShare = tried ? beat / tried : null;
  }
  return { beta: s.beta, z: s.z, sd: s.sd, days: rows, lifts, shiftShare };
}

// ── Groups, for the words and the strip ──

type Groups = { high: DayRow[]; low: DayRow[] };

/** Thirds of the condition (ties kept whole), or yes against no. */
function groupsOf(rows: readonly DayRow[], kind: "range" | "yesno"): Groups | null {
  if (kind === "yesno") return { high: rows.filter((r) => r.x >= 0.5), low: rows.filter((r) => r.x < 0.5) };
  const sorted = [...rows].sort((a, b) => a.x - b.x);
  const n = sorted.length;
  const k = Math.floor(n / 3);
  if (k < 1) return null;
  const q1 = sorted[k - 1].x;
  const q2 = sorted[n - k].x;
  if (q1 < q2) return { high: sorted.filter((r) => r.x >= q2), low: sorted.filter((r) => r.x <= q1) };
  // Tied across the cut (whole days): above against below the median.
  const m = median(sorted.map((r) => r.x));
  return { high: sorted.filter((r) => r.x > m), low: sorted.filter((r) => r.x < m) };
}

function spreadWeeks(rows: readonly DayRow[], from: LocalDate): number {
  return new Set(rows.map((r) => Math.floor(dayDiff(from, r.date) / 7))).size;
}

// ── Reading one date ──

type Read = {
  id: ConnectionId;
  fit: Fit;
  groups: Groups;
  /** Upper (or yes) minus lower (or no) in the condition's own measure. */
  dx: number;
  /** One-sided p the expected way (two-sided for dir 0). */
  p: number;
  /** Raw and shrunk effect between the groups, %. */
  rawPct: number;
  shrunkPct: number;
  /** Each half of the history's effect, %. */
  halves: [number, number] | null;
};

const pct = (logDiff: number) => (Math.exp(logDiff) - 1) * 100;
const shrinkOf = (z: number) => (Math.abs(z) > 1 ? 1 - 1 / (z * z) : 0);

function pValue(z: number, dir: 1 | -1 | 0): number {
  if (dir === 0) return 2 * (1 - normalCdf(Math.abs(z)));
  if (Math.sign(z) === dir) return 1 - normalCdf(Math.abs(z));
  return Math.abs(z) >= CONN_OPPOSITE_Z ? 2 * (1 - normalCdf(Math.abs(z))) : 1;
}

function readAll(i: ConnectionInputs, now: Now, from: LocalDate): { reads: Read[]; obs: Obs[]; linked: Set<ConnectionId>; q: Map<ConnectionId, number> } {
  const through = now.today;
  const obs = observations(i, now, from, through);
  const empty = { reads: [] as Read[], obs, linked: new Set<ConnectionId>(), q: new Map<ConnectionId, number>() };
  const dates = [...new Set(obs.map((o) => o.date))].sort();
  if (dates.length < CONN_MIN_SESSIONS || dayDiff(dates[0], dates[dates.length - 1]) < CONN_MIN_HISTORY_DAYS) return empty;
  // Days since the same lift, per session.
  const sameGap = new Map<string, number>();
  for (const s of liftSeries(i.workouts, i.unit, now)) {
    for (let k = 1; k < s.exposures.length; k++) {
      const g = dayDiff(s.exposures[k - 1].date, s.exposures[k].date);
      if (g >= 1 && g <= CONN_MAX_SAME_DAYS) sameGap.set(`${s.key}|${s.exposures[k].date}`, g);
    }
  }
  const read = readers(i, from, now, sameGap);
  const reads: Read[] = [];
  for (const id of CONNECTION_IDS) {
    const spec = SPEC[id];
    const fit = fitCondition(obs, read[id], spec.dir);
    if (!fit) continue;
    const groups = groupsOf(fit.days, spec.kind);
    if (!groups || groups.high.length < CONN_MIN_GROUP || groups.low.length < CONN_MIN_GROUP) continue;
    if (spreadWeeks(groups.high, from) < CONN_MIN_GROUP_WEEKS || spreadWeeks(groups.low, from) < CONN_MIN_GROUP_WEEKS) continue;
    const dx = mean(groups.high.map((r) => r.x)) - mean(groups.low.map((r) => r.x));
    // Halves: alternating 4-week blocks, from the same residuals.
    const half = (parity: number) => {
      const rs = fit.days.filter((r) => r.block % 2 === parity);
      const s = slope(rs.map((r) => r.rx), rs.map((r) => r.ry));
      return s ? pct(s.beta * dx) : null;
    };
    const h0 = half(0);
    const h1 = half(1);
    reads.push({ id, fit, groups, dx, p: pValue(fit.z, spec.dir), rawPct: pct(fit.beta * dx), shrunkPct: pct(fit.beta * shrinkOf(fit.z) * dx), halves: h0 != null && h1 != null ? [h0, h1] : null });
  }
  // Benjamini–Hochberg across the conditions read.
  const order = [...reads].sort((a, b) => a.p - b.p);
  const m = order.length;
  const q = new Map<ConnectionId, number>();
  let running = 1;
  for (let r = m - 1; r >= 0; r--) {
    running = Math.min(running, (order[r].p * m) / (r + 1));
    q.set(order[r].id, running);
  }
  const linked = new Set<ConnectionId>();
  for (const r of reads) {
    const floor = Math.max(CONN_MIN_EFFECT_PCT, CONN_NOISE_SHARE * r.fit.sd * 100);
    const sign = Math.sign(r.rawPct);
    const halvesOk = r.halves != null && r.halves.every((h) => Math.sign(h) === sign && Math.abs(h) >= floor / 2);
    const shiftOk = r.fit.shiftShare == null || r.fit.shiftShare <= CONN_SHIFT_MAX_SHARE;
    if ((q.get(r.id) ?? 1) <= CONN_Q && Math.abs(r.rawPct) >= floor && halvesOk && shiftOk) linked.add(r.id);
  }
  return { reads, obs, linked, q };
}

// ── Overlap ──

/** Pearson correlation of two conditions over the days both were read for; null with fewer than CONN_MIN_GROUP of them. */
function overlapR(a: readonly DayRow[], b: readonly DayRow[]): number | null {
  const bx = new Map(b.map((r) => [r.date, r.x]));
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of a) {
    const y = bx.get(r.date);
    if (y != null) {
      xs.push(r.x);
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

/**
 * z of `b` with `a` held fixed: both conditions' residuals on the days they
 * share, regressed together on strength, with a robust (sandwich) error.
 * Null with fewer than CONN_MIN_GROUP shared days or when they can't be
 * told apart at all.
 */
function partialZ(a: readonly DayRow[], b: readonly DayRow[]): number | null {
  const ax = new Map(a.map((r) => [r.date, r.rx]));
  const rows = b.filter((r) => ax.has(r.date)).map((r) => ({ xa: ax.get(r.date) as number, xb: r.rx, y: r.ry }));
  if (rows.length < CONN_MIN_GROUP) return null;
  let saa = 0;
  let sab = 0;
  let sbb = 0;
  let say = 0;
  let sby = 0;
  for (const r of rows) {
    saa += r.xa * r.xa;
    sab += r.xa * r.xb;
    sbb += r.xb * r.xb;
    say += r.xa * r.y;
    sby += r.xb * r.y;
  }
  const det = saa * sbb - sab * sab;
  if (!(Math.abs(det) > 1e-12)) return null;
  const ba = (sbb * say - sab * sby) / det;
  const bb = (saa * sby - sab * say) / det;
  // Sandwich: (X'X)^-1 X' diag(e^2) X (X'X)^-1, the b entry.
  let maa = 0;
  let mab = 0;
  let mbb = 0;
  for (const r of rows) {
    const e2 = (r.y - ba * r.xa - bb * r.xb) ** 2;
    maa += r.xa * r.xa * e2;
    mab += r.xa * r.xb * e2;
    mbb += r.xb * r.xb * e2;
  }
  const ib = [-sab / det, saa / det];
  const varB = ib[0] * (ib[0] * maa + ib[1] * mab) + ib[1] * (ib[0] * mab + ib[1] * mbb);
  return varB > 0 ? bb / Math.sqrt(varB) : null;
}

// ── Connections ──

const round1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Connections between the lifts and sleep, food, load, timing and weight
 * change over up to a year to `now.today`. Conditions without enough days
 * are left out; the rest are "linked" or "none". A link must also hold a
 * week earlier (CONN_HOLD_DAYS).
 */
export function connections(i: ConnectionInputs, now: Now, opts: { days?: number } = {}): ConnectionsResult {
  const through = now.today;
  const span = Math.max(CONN_WINDOW_DAYS, opts.days ?? 0);
  const from = addDays(through, -(span - 1));
  const cur = readAll(i, now, from);
  const prev = readAll(i, { today: addDays(through, -CONN_HOLD_DAYS), tz: now.tz }, addDays(from, -CONN_HOLD_DAYS));

  // Each main lift's current level, for kilos.
  const levelFrom = addDays(through, -(MAIN_LIFT_WEEKS * 7 - 1));
  const mains = pickMainLifts(i.workouts, i.unit, now)
    .map((l) => {
      const recent = l.exposures.filter((e) => e.date >= levelFrom && e.date <= through).map((e) => e.e1rm);
      return { key: l.key, name: l.name, levelKg: recent.length ? median(recent) : 0 };
    })
    .filter((l) => l.levelKg > 0);

  const items: Connection[] = [];
  for (const r of cur.reads) {
    const spec = SPEC[r.id];
    const linked = cur.linked.has(r.id) && prev.linked.has(r.id);
    const hMean = mean(r.groups.high.map((d) => d.x));
    const lMean = mean(r.groups.low.map((d) => d.x));
    const hv = spec.fmt(hMean, i.unit);
    const lv = spec.fmt(lMean, i.unit);
    const diffPct = round1(r.shrunkPct);
    const text = linked
      ? `${spec.high(hv)}, your lifts were ${Math.abs(diffPct).toFixed(1)}% ${diffPct > 0 ? "stronger" : "weaker"} than ${spec.low(lv)}.`
      : `No clear difference between ${spec.pair}${spec.kind === "range" ? ` (${hv} against ${lv})` : ""}.`;
    const perLift: LiftEffect[] = mains.map((m) => {
      const own = r.fit.lifts.get(m.key);
      const p = own ? pct(own.beta * shrinkOf(own.z) * r.dx) : r.shrunkPct;
      return { name: m.name, pct: round1(p), kg: (m.levelKg * p) / 100, sessions: own?.n ?? 0, own: own != null };
    });
    const point = (d: DayRow): SessionPoint => ({ date: d.date, pct: d.ry * 100 });
    items.push({
      id: r.id,
      label: spec.label,
      kind: spec.kind,
      state: linked ? "linked" : "none",
      text,
      diffPct,
      high: { value: hv, mean: hMean, pct: round1(mean(r.groups.high.map((d) => d.ry * 100))), sessions: r.groups.high.length },
      low: { value: lv, mean: lMean, pct: round1(mean(r.groups.low.map((d) => d.ry * 100))), sessions: r.groups.low.length },
      perLift,
      z: Math.round(r.fit.z * 100) / 100,
      q: Math.round((cur.q.get(r.id) ?? 1) * 1000) / 1000,
      evidence: spec.evidence,
      movedWith: null,
      movedWithSign: null,
      points: { high: r.groups.high.map(point), low: r.groups.low.map(point) },
    });
  }
  const byOrder = (a: Connection, b: Connection) => (a.state === b.state ? Math.abs(b.diffPct) - Math.abs(a.diffPct) : a.state === "linked" ? -1 : 1);
  items.sort(byOrder);
  // Two clear differences that moved together are one finding: the larger stays and names the other (C7).
  const rows = new Map(cur.reads.map((r) => [r.id, r.fit.days]));
  const linkedItems = items.filter((c) => c.state === "linked");
  for (let x = 0; x < linkedItems.length; x++) {
    const keep = linkedItems[x];
    if (keep.state !== "linked") continue;
    for (let y = x + 1; y < linkedItems.length; y++) {
      const other = linkedItems[y];
      if (other.state !== "linked") continue;
      const r = overlapR(rows.get(keep.id)!, rows.get(other.id)!);
      if (r == null || Math.abs(r) < CONN_PARTIAL_R) continue;
      // Correlated, but not so much they can't be told apart: the smaller stays only if it still stands with the larger held fixed.
      if (Math.abs(r) < CONN_OVERLAP_R) {
        const z = partialZ(rows.get(keep.id)!, rows.get(other.id)!);
        if (z != null && Math.abs(z) >= CONN_PARTIAL_Z) continue;
      }
      keep.movedWith = other.id;
      keep.movedWithSign = r > 0 ? 1 : -1;
      keep.text = `${keep.text} ${SPEC[other.id].label} ${r > 0 ? "rose and fell" : "moved the opposite way"} with it, so the two can't be told apart.`;
      other.state = "none";
    }
  }
  items.sort(byOrder);

  const paceFrom = addDays(through, -(CONN_PACE_DAYS - 1));
  const paceDates = new Set<LocalDate>();
  for (const l of liftSeries(i.workouts, i.unit, now)) if (isCompoundLift(l.name, l.exerciseId)) for (const e of l.exposures) if (e.date >= paceFrom && e.date <= through) paceDates.add(e.date);
  const sessionDays = new Set(cur.obs.map((o) => o.date)).size;
  const first = cur.obs.reduce<LocalDate | null>((m, o) => (m == null || o.date < m ? o.date : m), null);
  // Weeks read: from the first session in the window, as the window is now up to a year.
  const weeks = first ? Math.max(1, Math.round((dayDiff(first, through) + 1) / 7)) : Math.round(span / 7);
  return { from, through, weeks, sessions: sessionDays, items, checked: items.length, recentPerWeek: (paceDates.size * 7) / CONN_PACE_DAYS };
}
