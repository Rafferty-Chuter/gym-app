/**
 * What each part of Progress needs before it shows (PR5, the first-use
 * state). Every part already stays silent below its own minimum (rule 3);
 * this says which minimum, how far along the person is, and roughly how
 * long is left at their pace, after WHOOP's and Visible's calibration
 * counts. The minimums are the engine's own constants, not new ones.
 *
 * Pure: data, the engine's results and `now` in.
 */

import { addDays, dayDiff, type LocalDate, type Now } from "@/lib/dates";
import { CONN_MIN_SESSIONS, type ConnectionsResult } from "@/lib/physique/connections";
import { INITIAL_HOLD_DAYS, SETTLING_UPDATING_DAYS, type ExpenditureResult } from "@/lib/physique/expenditure";
import { nightsByDate, SLEEP_USUAL_MIN_NIGHTS } from "@/lib/physique/sleep";
import { isCompoundLift, liftSeries, MAIN_LIFT_MIN_WEEKS_TRAINED, MAIN_LIFT_WEEKS, pickMainLifts } from "@/lib/physique/strength";
import { firstRateRead, type FirstRateRead } from "@/lib/physique/weight";
import type { DayFlags, PhysiqueGoal, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { WeightUnit } from "@/lib/units";

export type UnlockId = "goal" | "weight" | "maintenance" | "lifts" | "sleep" | "connections";

export type Unlock = {
  id: UnlockId;
  done: boolean;
  have: number;
  need: number;
  unit: "weigh-ins" | "days" | "weeks" | "nights" | "sessions" | null;
  /** Roughly how many days are left at the person's pace; null when it can't be told (nothing logged yet). */
  etaDays: number | null;
  /** Connections only: enough sessions, but no sleep or food logged alongside them to compare. */
  needsAlongside?: boolean;
  /** Maintenance only: the day the estimate starts moving with the person's own food and weight, while it still holds its starting guess. */
  startsOn?: LocalDate;
  /** Weight only: the first rate read, as Home and the goal card give it (IN12). */
  firstRead?: FirstRateRead;
};

export type UnlockInputs = {
  goal: PhysiqueGoal | null;
  weighIns: readonly WeighIn[];
  /** Logged water events move the first day a weigh-in counts toward the rate. */
  dayFlags?: Readonly<Record<string, DayFlags>>;
  sleepNights: readonly SleepNight[];
  workouts: readonly StoredWorkout[];
  expenditure: ExpenditureResult | null;
  connections: ConnectionsResult;
  unit: WeightUnit;
};

/** Days the sleep count looks back over. OURS: four weeks, the usual's own window. */
const SLEEP_LOOKBACK_DAYS = 28;

/** Each part of Progress in page order, with what it needs and how far along it is. */
export function progressUnlocks(i: UnlockInputs, now: Now): Unlock[] {
  const today = now.today;

  // ── Goal ──
  const goal: Unlock = { id: "goal", done: !!i.goal && !i.goal.completedAt, have: i.goal ? 1 : 0, need: 1, unit: null, etaDays: null };

  // ── Weight trend: the first rate read, the same date Home and the goal card give (IN12) ──
  // Days run from the goal's start when its first week is left out (so the week shows as done), else from the first weigh-in.
  const first = i.weighIns.reduce<LocalDate | null>((m, w) => (w.date <= today && (!m || w.date < m) ? w.date : m), null);
  const read = firstRateRead({ goal: i.goal, dayFlags: i.dayFlags ?? {}, today, weighIns: i.weighIns });
  const countFrom = read.fromReason === "goal_start" && i.goal ? i.goal.startDate : read.from;
  const readyDays = dayDiff(countFrom, read.on) + 1;
  const ready = !!first && read.weighInsNeeded === 0 && read.on <= today;
  const weight: Unlock = first
    ? { id: "weight", done: ready, have: ready ? readyDays : Math.max(0, Math.min(readyDays, dayDiff(countFrom, today) + 1)), need: readyDays, unit: "days", etaDays: ready ? 0 : dayDiff(today, read.on), firstRead: read }
    : { id: "weight", done: false, have: 0, need: readyDays, unit: "days", etaDays: null };

  // ── Maintenance: the starting guess's hold, then the estimate's warm-up of updating days ──
  // Counted from the day the estimate started, so the first week shows as days done, not "0 of 21" with no reason (IN12).
  const updating = i.expenditure?.maturity.updatingDays ?? 0;
  const seedDate = i.expenditure?.seed.date ?? null;
  const held = seedDate && seedDate <= today ? Math.min(INITIAL_HOLD_DAYS, dayDiff(seedDate, today) + 1) : 0;
  const maintenanceNeed = INITIAL_HOLD_DAYS + SETTLING_UPDATING_DAYS;
  const maintenanceHave = Math.min(held + updating, maintenanceNeed);
  const maintenance: Unlock = {
    id: "maintenance",
    done: updating >= SETTLING_UPDATING_DAYS,
    have: maintenanceHave,
    need: maintenanceNeed,
    unit: "days",
    etaDays: maintenanceHave > 0 ? maintenanceNeed - maintenanceHave : null,
    ...(seedDate && updating === 0 && held < INITIAL_HOLD_DAYS ? { startsOn: addDays(seedDate, INITIAL_HOLD_DAYS) } : {}),
  };

  // ── Lifts: a compound lift trained in enough of the last six weeks becomes a main lift ──
  const mainLifts = pickMainLifts(i.workouts, i.unit, now);
  const from = addDays(today, -(MAIN_LIFT_WEEKS * 7 - 1));
  let bestWeeks = 0;
  for (const s of liftSeries(i.workouts, i.unit, now)) {
    if (!isCompoundLift(s.name, s.exerciseId)) continue;
    const weeks = new Set(s.exposures.filter((e) => e.date >= from && e.date <= today).map((e) => Math.floor(dayDiff(e.date, today) / 7)));
    bestWeeks = Math.max(bestWeeks, weeks.size);
  }
  const liftsDone = mainLifts.length > 0;
  const lifts: Unlock = { id: "lifts", done: liftsDone, have: liftsDone ? MAIN_LIFT_MIN_WEEKS_TRAINED : Math.min(bestWeeks, MAIN_LIFT_MIN_WEEKS_TRAINED), need: MAIN_LIFT_MIN_WEEKS_TRAINED, unit: "weeks", etaDays: bestWeeks > 0 && !liftsDone ? (MAIN_LIFT_MIN_WEEKS_TRAINED - bestWeeks) * 7 : null };

  // ── Sleep: enough nights for the person's usual ──
  const sleepFrom = addDays(today, -(SLEEP_LOOKBACK_DAYS - 1));
  const nights = [...nightsByDate(i.sleepNights).values()].filter((n) => n.valid && n.date >= sleepFrom && n.date <= today).length;
  const sleep: Unlock = { id: "sleep", done: nights >= SLEEP_USUAL_MIN_NIGHTS, have: Math.min(nights, SLEEP_USUAL_MIN_NIGHTS), need: SLEEP_USUAL_MIN_NIGHTS, unit: "nights", etaDays: nights > 0 ? Math.max(0, SLEEP_USUAL_MIN_NIGHTS - nights) : null };

  // ── Connections: enough sessions read against their lifts, with sleep or food alongside ──
  const c = i.connections;
  const have = Math.min(c.sessions, CONN_MIN_SESSIONS);
  const connectionsDone = c.checked > 0;
  const left = CONN_MIN_SESSIONS - have;
  const connectionsUnlock: Unlock = {
    id: "connections",
    done: connectionsDone,
    have,
    need: CONN_MIN_SESSIONS,
    unit: "sessions",
    etaDays: connectionsDone || left === 0 || c.recentPerWeek <= 0 ? null : Math.ceil((left / c.recentPerWeek) * 7),
    ...(!connectionsDone && left === 0 ? { needsAlongside: true } : {}),
  };

  return [goal, weight, maintenance, lifts, sleep, connectionsUnlock];
}
