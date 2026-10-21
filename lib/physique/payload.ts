/**
 * The assistant's physique payload (03-architecture §4.1): the client's
 * `PhysiqueAnalysis` verbatim, the client clock, and a compact set of
 * recent facts for citation only. Pure: the io wrapper gathers the inputs.
 */

import type { Now, LocalDate } from "@/lib/dates";
import { addDays } from "@/lib/dates";
import type { FoodEntry, DayFlags, PhysiqueAnalysis, PhysiqueGoal, PhysiqueProgram, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { WeightUnit } from "@/lib/units";
import type { AskSubject } from "@/lib/physique/askAbout";
import { dailyIntakeSeries, targetInEffect } from "@/lib/physique/intake";
import { mainLiftSeries } from "@/lib/physique/strength";
import { weighInsByDate } from "@/lib/physique/weight";

/** Days of weigh-ins, intake and sleep sent for citation. OURS. */
export const RECENT_DAYS = 14;
/** e1RM values per main lift sent for citation. OURS. */
export const RECENT_E1RM_PER_LIFT = 3;
/** Main lifts included. OURS. */
export const RECENT_MAX_LIFTS = 4;

export type PhysiqueRecent = {
  /** Day offset from today (0 = today, −13 = 13 days ago) and kg. */
  weighIns: Array<{ d: number; kg: number }>;
  /** Day offset, kcal, protein g, and the day status. */
  intake: Array<{ d: number; kcal: number; p: number; status: "complete" | "partial" | "fasting" | "unlogged" }>;
  /** Day offset and hours asleep. */
  sleep: Array<{ d: number; h: number }>;
  lifts: Array<{ name: string; e1rm: Array<{ d: number; kg: number }> }>;
  goal: { type: PhysiqueGoal["type"]; targetKg: number; ratePctPerWeek: number; startDate: LocalDate } | null;
  targets: { kcal: number; proteinG: number; fatG: number; carbsG: number; since: LocalDate } | null;
};

export type AssistantPhysiquePayload = {
  analysis: PhysiqueAnalysis;
  now: Now;
  recent: PhysiqueRecent;
  /** A connection or finding the user asked about from Progress (PR3f), as the engine read it. */
  subject?: AskSubject;
};

export type PhysiqueRecentInputs = {
  weighIns: readonly WeighIn[];
  foodEntries: readonly FoodEntry[];
  dayFlags: Readonly<Record<string, DayFlags>>;
  sleepNights: readonly SleepNight[];
  workouts: readonly StoredWorkout[];
  goal: PhysiqueGoal | null;
  program: PhysiqueProgram | null;
  weightUnit: WeightUnit;
};

function offset(today: LocalDate, date: LocalDate): number {
  const a = Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)));
  const b = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
  return Math.round((b - a) / 86_400_000);
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Compact recent facts for the assistant to cite. Numbers only; no raw labels or notes. */
export function buildPhysiqueRecent(inputs: PhysiqueRecentInputs, now: Now): PhysiqueRecent {
  const from = addDays(now.today, -(RECENT_DAYS - 1));
  const byDate = weighInsByDate(inputs.weighIns);
  const weighIns = [...byDate.entries()]
    .filter(([date]) => date >= from && date <= now.today)
    .map(([date, kg]) => ({ d: offset(now.today, date), kg: r1(kg) }));
  const intake = dailyIntakeSeries(inputs.foodEntries, inputs.dayFlags, from, now.today)
    .filter((day) => day.status !== "unlogged")
    .map((day) => ({ d: offset(now.today, day.date), kcal: Math.round(day.kcal), p: Math.round(day.proteinG), status: day.status }));
  const sleep = inputs.sleepNights
    .filter((n) => n.date >= from && n.date <= now.today && Number.isFinite(n.asleepMin))
    .map((n) => ({ d: offset(now.today, n.date), h: r1(n.asleepMin / 60) }));
  const lifts = mainLiftSeries(inputs.workouts, inputs.weightUnit, now)
    .slice(0, RECENT_MAX_LIFTS)
    .map((l) => ({
      name: l.name.slice(0, 32),
      e1rm: l.exposures.slice(-RECENT_E1RM_PER_LIFT).map((e) => ({ d: offset(now.today, e.date), kg: r1(e.e1rm) })),
    }));
  const goal = inputs.goal
    ? { type: inputs.goal.type, targetKg: r1(inputs.goal.targetKg), ratePctPerWeek: inputs.goal.ratePctPerWeek, startDate: inputs.goal.startDate }
    : null;
  const entry = targetInEffect(inputs.program, now.today);
  const targets = entry ? { kcal: entry.kcal, proteinG: entry.proteinG, fatG: entry.fatG, carbsG: entry.carbsG, since: entry.startDate } : null;
  return { weighIns, intake, sleep, lifts, goal, targets };
}
