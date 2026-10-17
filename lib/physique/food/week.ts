/**
 * Week strip and Week widget helpers (05-design §9.4): the Monday-to-Sunday
 * week around a date, and per-day totals against the target in effect.
 * Pure; the caller passes entries, flags, the program and the dates.
 */

import { addDays, weekday, type LocalDate } from "@/lib/dates";
import { dailyIntake, targetInEffect } from "@/lib/physique/intake";
import type { DayFlags, FoodEntry, PhysiqueProgram, ProgramTargets } from "@/lib/physique/types";

/** Weeks start on Monday, as the check-in does. OURS. */
export function weekStart(date: LocalDate): LocalDate {
  const wd = weekday(date); // 0 = Sunday
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}

/** The seven dates of the week containing `date`, Monday first. */
export function weekDates(date: LocalDate): LocalDate[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

export type WeekDay = {
  date: LocalDate;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** Anything logged (entries, an override, or a fasting flag). */
  logged: boolean;
  status: "complete" | "partial" | "fasting" | "unlogged";
  target: ProgramTargets | null;
  future: boolean;
};

/** Per-day totals for a week; days after `today` are marked future and left empty. */
export function weekTotals(
  dates: readonly LocalDate[],
  entries: readonly FoodEntry[],
  dayFlags: Readonly<Record<string, DayFlags>>,
  program: PhysiqueProgram | null | undefined,
  today: LocalDate
): WeekDay[] {
  return dates.map((date) => {
    const future = date > today;
    const dayEntries = future ? [] : entries.filter((e) => e.date === date);
    const intake = dailyIntake(date, dayEntries, dayFlags[date]);
    return {
      date,
      kcal: intake.kcal,
      proteinG: intake.proteinG,
      carbsG: intake.carbsG,
      fatG: intake.fatG,
      logged: !future && intake.status !== "unlogged",
      status: intake.status,
      target: targetInEffect(program, date),
      future,
    };
  });
}

/** A target tick counts as met within ±5 % of the target (grey tick turns white). OURS. */
export const TARGET_MET_TOLERANCE = 0.05;

export function targetMet(value: number, target: number | null | undefined): boolean {
  if (!target || target <= 0) return false;
  return Math.abs(value - target) / target <= TARGET_MET_TOLERANCE;
}
