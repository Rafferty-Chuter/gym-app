/**
 * The stuck lift, and what changed (IN4, 08-insights.md). Pure.
 *
 * For each main lift (02 §1.2: a loaded compound trained in 5 of the last
 * 6 weeks), its sessions' best estimated 1RMs, deload weeks left out:
 * - Flat: no new best level (the median of four sessions running, 1.5%
 *   past the old best) for 6 sessions or more over 4 weeks or more, and the
 *   line through those sessions is not clearly rising, up 1% (or 0.25% a
 *   week) at most, and credibly under a 0.5% a week rise. A lifter's "no
 *   new best in N sessions" (Everlift, Plates, research L §5) with guards
 *   against a slow riser who had a lucky run. IN4 study, 2.5% session
 *   noise: 3 of 30 lifts rising 0.5% a week were called stuck; 17 of 30
 *   flat for 7 weeks, 24 of 30 flat for 10 weeks and 27 of 30 dropping 1%
 *   a week for 6 weeks were caught.
 * - Dropping: of the stretches of recent sessions (6 to 24) ending at the
 *   last, the one with the biggest drop whose line is clearly down (3 SE,
 *   stricter than Progress's 2.5 as many stretches are tried) and down 3%
 *   or more, over 3 weeks or more.
 * On a cut, holding is the aim, so only a drop is a stuck lift (as the
 * weekly lifts link).
 *
 * Then what changed since the lift's best against the 6 weeks before,
 * each only past its floor and only the way that could hold a lift back:
 * hard sets a week for its main muscle and sessions a week of the lift
 * (either way), sleep and short nights, the deficit, protein, rep range,
 * deload weeks, and a cut faster than 0.75% a week. Described, never
 * blamed: with few training blocks a person's own data cannot say which
 * one did it (research L §3).
 */

import { addDays, dayDiff, type LocalDate, type Now } from "@/lib/dates";
import { mean, median, olsSlope } from "@/lib/stats";
import { countsForBalance } from "@/lib/physique/food/energy";
import { dailyIntakeSeries } from "@/lib/physique/intake";
import { nightsByDate } from "@/lib/physique/sleep";
import { deloadWeeks, liftSeries, pickMainLifts, workoutDate, type LiftExposure } from "@/lib/physique/strength";
import { CUT_GREEN_MAX } from "@/lib/physique/targets";
import { trendSeries } from "@/lib/physique/weight";
import { getDetailedMuscleGroupsForLoggedExercise, getDetailedVolumeByMuscleGroup, type DetailedMuscleGroup } from "@/lib/trainingMetrics";
import { GROUP_LABEL } from "@/lib/volumeAnalysis";
import type { DayFlags, ExpenditurePoint, FoodEntry, PhysiqueGoal, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { WeightUnit } from "@/lib/units";

// ── Thresholds ──

/** Sessions a running best level is the median of. OURS (IN4 study): four, so a lucky session or two is not a best. */
export const LEVEL_SESSIONS = 4;
/** How far a running level must pass the old best to be a new one, %. OURS (IN4 study): a new best inside a session's noise is luck, not progress. */
export const NEW_BEST_PCT = 1.5;
/** Sessions since the best level before a lift reads flat. OURS (08 IN4): two weeks of three sessions. */
export const FLAT_MIN_SESSIONS = 6;
/** Days since the best level before a lift reads flat. OURS (IN4 study): four weeks; at three, a lift rising 0.5% a week with 2.5% session noise read flat too often. */
export const FLAT_MIN_DAYS = 28;
/** Most a flat lift's line may rise over its sessions, %, at least. OURS: inside a session's noise. */
export const FLAT_MAX_RISE_PCT = 1;
/** ...or this much a week over a longer span. OURS (IN4 study): a lift up 1.7% over nine weeks has stalled in all but name; a lifter progressing at 0.5% a week clears it. */
export const FLAT_MAX_RISE_PCT_WEEK = 0.25;
/** A flat lift's line must be credibly under this rise, % a week: its change plus 1.645 standard errors stays below it. EVID: intermediate lifters gain about 0.5% a week (02 §6.2 training status), so a lift that could still be rising at that pace is not called flat. */
export const FLAT_RISE_REF_PCT_WEEK = 0.5;
/** One-sided 95%. PUB. */
export const Z_ONE_SIDED = 1.645;
/** Standard errors from flat before a line counts as clearly rising or falling. OURS: as Progress's lift line (LIFT_FIT_Z). */
export const CLEAR_Z = 2.5;
/** Sessions and days a drop is read over, at least. OURS. */
export const DROP_MIN_SESSIONS = 5;
export const DROP_MIN_DAYS = 21;
/** Most recent sessions a drop is looked for in. OURS: about two months at three a week. */
export const DROP_MAX_SESSIONS = 24;
/** Standard errors a drop's line must sit below flat. OURS (IN4 study): stricter than Progress's 2.5 as many stretches are tried; at 2.5, 3 of 30 lifts flat for ten weeks read as dropping. */
export const DROP_Z = 3;
/** Smallest drop called dropping, %. EVID: above a top set's 2 to 3% session noise (research L §4); the strength engine's own drop is 5% over blocks. */
export const DROP_MIN_PCT = 3;
/** Days before the lift's best that "before" covers. OURS: six weeks, as the main-lift window. */
export const BEFORE_DAYS = 42;
/** Floors for what changed. OURS unless tagged. */
export const SETS_MIN_CHANGE = 3;
export const SETS_MIN_SHARE = 0.2;
export const FREQ_MIN_CHANGE = 0.5;
export const SLEEP_MIN_DROP_MIN = 20;
/** A short night, hours. EVID: as the sleep engine's watch threshold (02 §7.2). */
export const SHORT_NIGHT_H = 6;
export const SHORT_NIGHTS_MIN_RISE = 1;
export const BALANCE_MIN_DROP_KCAL = 200;
export const PROTEIN_MIN_DROP_G = 20;
export const REPS_MIN_CHANGE = 3;
/** Days with a reading in each window before a mean is compared. OURS. */
export const MIN_DAYS = 7;
/** Days of history before the lift's best that "before" must cover, or nothing is compared. OURS: four weeks; a shorter "before" compares a few early sessions with everything since. */
export const BEFORE_MIN_DAYS = 28;

// ── Types ──

export type StuckChange =
  | { kind: "sets"; muscle: string; before: number; during: number }
  | { kind: "frequency"; before: number; during: number }
  | { kind: "sleep"; beforeH: number; duringH: number }
  | { kind: "shortNights"; before: number; during: number }
  | { kind: "balance"; beforeKcal: number; duringKcal: number }
  | { kind: "protein"; beforeG: number; duringG: number }
  | { kind: "reps"; before: number; during: number }
  | { kind: "deload"; weeks: number }
  | { kind: "cutPace"; kgPerWeek: number; pctPerWeek: number };

export type StuckLift = {
  name: string;
  key: string;
  exerciseId?: string;
  state: "flat" | "dropping";
  /** The session the best level was reached. */
  since: LocalDate;
  /** Sessions after it. */
  sessions: number;
  /** The best level, kg (median of three sessions). */
  levelKg: number;
  /** The line's change over the sessions since, kg. */
  changeKg: number;
  changePct: number;
  /** What changed since against the 6 weeks before, the largest against its floor first; null when the history before the best is under 4 weeks. */
  changes: StuckChange[] | null;
};

export type StuckLiftInputs = {
  workouts: readonly StoredWorkout[];
  sleepNights: readonly SleepNight[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  weighIns: readonly WeighIn[];
  expenditure: readonly ExpenditurePoint[] | null;
  goal: PhysiqueGoal | null;
  unit: WeightUnit;
};

// ── Detection ──

function lineOver(ex: readonly LiftExposure[]): { slope: number; se: number; from: number; to: number } {
  const x0 = ex[0].date;
  const xs = ex.map((e) => dayDiff(x0, e.date));
  const f = olsSlope(xs, ex.map((e) => e.e1rm));
  const last = xs[xs.length - 1];
  return { slope: f.slope, se: f.se, from: f.intercept, to: f.intercept + f.slope * last };
}

type Read = { state: "flat" | "dropping"; peak: number; level: number; change: number; changePct: number };

function readLift(ex: readonly LiftExposure[], cut: boolean): Read | null {
  if (ex.length < LEVEL_SESSIONS + DROP_MIN_SESSIONS) return null;
  const level = (i: number) => median(ex.slice(i - LEVEL_SESSIONS + 1, i + 1).map((e) => e.e1rm));
  // The last new best (past the old one by NEW_BEST_PCT), for flat.
  let best = -Infinity;
  let peak = LEVEL_SESSIONS - 1;
  for (let i = LEVEL_SESSIONS - 1; i < ex.length; i++) {
    const l = level(i);
    if (l > best * (1 + NEW_BEST_PCT / 100)) {
      best = l;
      peak = i;
    }
  }
  const lastDate = ex[ex.length - 1].date;
  // Dropping: of the recent stretches ending at the last session, the biggest drop whose line is clearly down, 3% or more.
  let drop: Read | null = null;
  for (let k = DROP_MIN_SESSIONS + 1; k <= Math.min(ex.length, DROP_MAX_SESSIONS); k++) {
    const from = ex.length - k;
    if (dayDiff(ex[from].date, lastDate) < DROP_MIN_DAYS) continue;
    const line = lineOver(ex.slice(from));
    const z = Number.isFinite(line.se) && line.se > 0 ? line.slope / line.se : 0;
    const changePct = (line.to / line.from - 1) * 100;
    if (z <= -DROP_Z && changePct <= -DROP_MIN_PCT && (!drop || changePct < drop.changePct)) {
      drop = { state: "dropping", peak: from, level: from >= LEVEL_SESSIONS - 1 ? level(from) : ex[from].e1rm, change: line.to - line.from, changePct };
    }
  }
  if (drop) return drop;
  if (cut) return null;
  // Flat: no new best for FLAT_MIN_SESSIONS over FLAT_MIN_DAYS, the line not clearly rising and credibly under a lifter's pace.
  const after = ex.slice(peak);
  const days = dayDiff(ex[peak].date, lastDate);
  if (after.length - 1 < FLAT_MIN_SESSIONS || days < FLAT_MIN_DAYS) return null;
  const line = lineOver(after);
  const z = Number.isFinite(line.se) && line.se > 0 ? line.slope / line.se : 0;
  const changePct = (line.to / line.from - 1) * 100;
  const maxRise = Math.max(FLAT_MAX_RISE_PCT, (FLAT_MAX_RISE_PCT_WEEK * days) / 7);
  const sePct = Number.isFinite(line.se) ? ((line.se * days) / line.from) * 100 : Infinity;
  const credible = changePct + Z_ONE_SIDED * sePct < (FLAT_RISE_REF_PCT_WEEK * days) / 7;
  if (z < CLEAR_Z && changePct <= maxRise && credible) return { state: "flat", peak, level: best, change: line.to - line.from, changePct };
  return null;
}

// ── What changed ──

const perWeek = (count: number, from: LocalDate, to: LocalDate) => count / Math.max(1, (dayDiff(from, to) + 1) / 7);

function inRange(d: LocalDate, from: LocalDate, to: LocalDate) {
  return d >= from && d <= to;
}

function changesFor(i: StuckLiftInputs, lift: { name: string; exerciseId?: string; exposures: readonly LiftExposure[] }, since: LocalDate, now: Now): StuckChange[] | null {
  // "Before" is the 6 weeks before the best, or what history there is, and at least 4 weeks of it.
  const first = i.workouts.reduce<LocalDate | null>((m, w) => {
    const d = workoutDate(w, now.tz);
    return d && (m == null || d < m) ? d : m;
  }, null);
  const before0 = first && first > addDays(since, -BEFORE_DAYS) ? first : addDays(since, -BEFORE_DAYS);
  const before1 = addDays(since, -1);
  if (dayDiff(before0, before1) + 1 < BEFORE_MIN_DAYS) return null;
  const during0 = since;
  // Through yesterday: today is still being logged, and would count as a whole day of no sessions.
  const during1 = addDays(now.today, -1);
  const out: Array<{ c: StuckChange; size: number }> = [];

  // Sets a week for the lift's main muscle, and sessions a week of the lift.
  const muscle = getDetailedMuscleGroupsForLoggedExercise({ name: lift.name, exerciseId: lift.exerciseId })[0] as DetailedMuscleGroup | undefined;
  const window = (from: LocalDate, to: LocalDate) => i.workouts.filter((w) => {
    const d = workoutDate(w, now.tz);
    return d != null && inRange(d, from, to);
  });
  const wb = window(before0, before1);
  if (muscle && wb.length) {
    const b = perWeek(getDetailedVolumeByMuscleGroup(wb)[muscle], before0, before1);
    const d = perWeek(getDetailedVolumeByMuscleGroup(window(during0, during1))[muscle], during0, during1);
    if (Math.abs(d - b) >= SETS_MIN_CHANGE && Math.abs(d - b) >= SETS_MIN_SHARE * b) out.push({ c: { kind: "sets", muscle: GROUP_LABEL[muscle] ?? muscle, before: Math.round(b), during: Math.round(d) }, size: Math.abs(d - b) / SETS_MIN_CHANGE });
  }
  const fb = perWeek(lift.exposures.filter((e) => inRange(e.date, before0, before1)).length, before0, before1);
  const fd = perWeek(lift.exposures.filter((e) => inRange(e.date, during0, during1)).length, during0, during1);
  if (wb.length && Math.abs(fd - fb) >= FREQ_MIN_CHANGE) out.push({ c: { kind: "frequency", before: Math.round(fb * 10) / 10, during: Math.round(fd * 10) / 10 }, size: Math.abs(fd - fb) / FREQ_MIN_CHANGE });

  // Sleep, and short nights, when they got worse.
  const nights = [...nightsByDate(i.sleepNights).values()].map((n) => n.night);
  const sleepIn = (from: LocalDate, to: LocalDate) => nights.filter((n) => inRange(n.date, from, to) && n.asleepMin > 0).map((n) => n.asleepMin / 60);
  const sb = sleepIn(before0, before1);
  const sd = sleepIn(during0, during1);
  if (sb.length >= MIN_DAYS && sd.length >= MIN_DAYS) {
    const drop = (mean(sb) - mean(sd)) * 60;
    if (drop >= SLEEP_MIN_DROP_MIN) out.push({ c: { kind: "sleep", beforeH: mean(sb), duringH: mean(sd) }, size: drop / SLEEP_MIN_DROP_MIN });
    const shortB = perWeek(sb.filter((h) => h < SHORT_NIGHT_H).length, before0, before1);
    const shortD = perWeek(sd.filter((h) => h < SHORT_NIGHT_H).length, during0, during1);
    if (shortD - shortB >= SHORT_NIGHTS_MIN_RISE && drop < SLEEP_MIN_DROP_MIN) out.push({ c: { kind: "shortNights", before: Math.round(shortB), during: Math.round(shortD) }, size: (shortD - shortB) / SHORT_NIGHTS_MIN_RISE });
  }

  // Food: a deeper deficit, less protein.
  const series = dailyIntakeSeries(i.foodEntries, i.dayFlags, before0, during1).filter((x) => countsForBalance(x.status));
  const tdee = new Map((i.expenditure ?? []).map((p) => [p.date, p.tdee]));
  const food = (from: LocalDate, to: LocalDate) => series.filter((x) => inRange(x.date, from, to));
  const balance = (xs: ReturnType<typeof food>) => xs.filter((x) => tdee.has(x.date)).map((x) => x.kcal - (tdee.get(x.date) as number));
  const bb = balance(food(before0, before1));
  const bd = balance(food(during0, during1));
  if (bb.length >= MIN_DAYS && bd.length >= MIN_DAYS && mean(bb) - mean(bd) >= BALANCE_MIN_DROP_KCAL) out.push({ c: { kind: "balance", beforeKcal: Math.round(mean(bb)), duringKcal: Math.round(mean(bd)) }, size: (mean(bb) - mean(bd)) / BALANCE_MIN_DROP_KCAL });
  const pb = food(before0, before1).map((x) => x.proteinG);
  const pd = food(during0, during1).map((x) => x.proteinG);
  if (pb.length >= MIN_DAYS && pd.length >= MIN_DAYS && mean(pb) - mean(pd) >= PROTEIN_MIN_DROP_G) out.push({ c: { kind: "protein", beforeG: Math.round(mean(pb)), duringG: Math.round(mean(pd)) }, size: (mean(pb) - mean(pd)) / PROTEIN_MIN_DROP_G });

  // The lift's rep range.
  const rb = lift.exposures.filter((e) => inRange(e.date, before0, before1)).map((e) => e.medianReps);
  const rd = lift.exposures.filter((e) => inRange(e.date, during0, during1)).map((e) => e.medianReps);
  if (rb.length >= 3 && rd.length >= 3 && Math.abs(median(rd) - median(rb)) >= REPS_MIN_CHANGE) out.push({ c: { kind: "reps", before: Math.round(median(rb)), during: Math.round(median(rd)) }, size: Math.abs(median(rd) - median(rb)) / REPS_MIN_CHANGE });

  // Deload weeks since, and a cut faster than strength holds up to.
  const deloads = deloadWeeks(i.workouts, now).filter((w) => w.end >= during0).length;
  if (deloads) out.push({ c: { kind: "deload", weeks: deloads }, size: 1 });
  if (i.goal?.type === "lose") {
    const t = trendSeries(i.weighIns.filter((w) => w.date <= during1));
    const a = t.find((p) => p.date >= during0);
    const z = t.at(-1);
    const weeks = a && z ? dayDiff(a.date, z.date) / 7 : 0;
    if (a && z && weeks >= 2) {
      const kgPerWeek = (z.trendKg - a.trendKg) / weeks;
      const pct = (kgPerWeek / a.trendKg) * 100;
      if (-pct > CUT_GREEN_MAX) out.push({ c: { kind: "cutPace", kgPerWeek, pctPerWeek: pct }, size: -pct / CUT_GREEN_MAX });
    }
  }
  return out.sort((a, b) => b.size - a.size).map((x) => x.c);
}

/** Every main lift that is flat or dropping, flat ones only off a cut, the biggest drop first. */
export function stuckLifts(i: StuckLiftInputs, now: Now): StuckLift[] {
  const mains = new Set(pickMainLifts(i.workouts, i.unit, now).map((m) => m.key));
  const deloads = deloadWeeks(i.workouts, now);
  const inDeload = (d: LocalDate) => deloads.some((w) => d >= w.start && d <= w.end);
  const cut = i.goal?.type === "lose" && !i.goal.completedAt;
  const out: StuckLift[] = [];
  for (const s of liftSeries(i.workouts, i.unit, now)) {
    if (!mains.has(s.key)) continue;
    const ex = s.exposures.filter((e) => !inDeload(e.date));
    const r = readLift(ex, cut);
    if (!r) continue;
    const since = ex[r.peak].date;
    out.push({
      name: s.name,
      key: s.key,
      ...(s.exerciseId ? { exerciseId: s.exerciseId } : {}),
      state: r.state,
      since,
      sessions: ex.length - 1 - r.peak,
      levelKg: r.level,
      changeKg: r.change,
      changePct: r.changePct,
      changes: changesFor(i, s, since, now),
    });
  }
  return out.sort((a, b) => (a.state === b.state ? a.changePct - b.changePct : a.state === "dropping" ? -1 : 1));
}
