/**
 * Spotted from the stored records (IN10, IN11): every engine Spotted reads,
 * run to a day, then ranked. The weekly report reads it to its last day and
 * the iPhone app's reminders read it to today, so Monday's notification
 * and the report lead with the same fact. Progress keeps its own pieces
 * (it reads a chosen range and shows each engine's card), passing the
 * same engines to `spotted`. Pure.
 */

import type { Now } from "@/lib/dates";
import { alcoholLinks } from "@/lib/physique/alcohol";
import { connections, type ConnectionsResult } from "@/lib/physique/connections";
import { findings, type Finding } from "@/lib/physique/findings";
import { mainLiftLevels, type ReferenceLift } from "@/lib/physique/liftEffect";
import { stuckLifts } from "@/lib/physique/liftPlateau";
import { latestJump, spotted, type SpottedItem } from "@/lib/physique/spotted";
import type { DailyVitals, DayFlags, ExpenditurePoint, FoodEntry, PhysiqueGoal, PhysiqueProgram, Sex, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { WeightUnit } from "@/lib/units";

export type SpottedSources = {
  weighIns: readonly WeighIn[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  sleepNights: readonly SleepNight[];
  vitals?: readonly DailyVitals[];
  workouts: readonly StoredWorkout[];
  /** The goal being worked towards, if any; one that starts after `at.today` is left out. */
  goal: PhysiqueGoal | null;
  program: PhysiqueProgram | null;
  expenditure: readonly ExpenditurePoint[] | null;
  profile: { sex?: Sex; age?: number; heightCm?: number };
};

/** Engine reads a caller already has for the same day, so they aren't run twice. */
export type SpottedPre = { connections?: ConnectionsResult; findings?: readonly Finding[]; lift?: ReferenceLift | null };

/** What Spotted shows on `at.today`, from the records. */
export function spottedFor(s: SpottedSources, at: Now, unit: WeightUnit, pre: SpottedPre = {}): SpottedItem[] {
  const goal = s.goal && !s.goal.completedAt && s.goal.startDate <= at.today ? s.goal : null;
  const expenditure = s.expenditure ? [...s.expenditure] : null;
  const conn = pre.connections ?? connections({ workouts: s.workouts, sleepNights: s.sleepNights, foodEntries: s.foodEntries, dayFlags: s.dayFlags, weighIns: s.weighIns, expenditure, unit, vitals: s.vitals }, at);
  const sleepLink = conn.items.find((c) => c.id === "sleep" && c.state === "linked");
  const found =
    pre.findings ??
    findings({ weighIns: s.weighIns, foodEntries: s.foodEntries, dayFlags: s.dayFlags, sleepNights: s.sleepNights, goal, program: s.program, profile: s.profile, workouts: s.workouts, unit, sleepConnectionPct: sleepLink?.diffPct ?? null }, at.today);
  const lift = pre.lift !== undefined ? pre.lift : (mainLiftLevels(s.workouts, unit, at)[0] ?? null);
  const stuck = stuckLifts({ workouts: s.workouts, sleepNights: s.sleepNights, foodEntries: s.foodEntries, dayFlags: s.dayFlags, weighIns: s.weighIns, expenditure, goal, unit }, at);
  const jump = latestJump({ weighIns: s.weighIns, foodEntries: s.foodEntries, dayFlags: s.dayFlags, workouts: s.workouts, tz: at.tz, vitals: s.vitals }, at.today);
  const alcohol = alcoholLinks({ foodEntries: s.foodEntries, dayFlags: s.dayFlags, sleepNights: s.sleepNights, vitals: s.vitals, weighIns: s.weighIns }, at);
  return spotted({ today: at.today, unit, jump, stuck, connections: conn, findings: [...found], lift, alcohol });
}
