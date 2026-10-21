/**
 * The made-up history behind "See an example" on Progress (PR5) and the
 * CONNECTIONS preset of the dev seed page: 16 weeks of a cut, three
 * sessions a week, with top sets 4% lighter after nights under 6.5 hours
 * and 3% heavier after higher-carb days, so every part of Progress has
 * something to show. Generated in memory; never stored.
 *
 * Pure: `today` in, a scenario out (seeded, so the same each time).
 */

import { addDays, type LocalDate, type Now } from "@/lib/dates";
import { computeExpenditure, type ExpenditureResult } from "@/lib/physique/expenditure";
import { makeScenario, type ScenarioSpec } from "@/lib/physique/fixtures";
import { buildPhysiqueAnalysis } from "@/lib/physique/judge";
import type { PhysiqueAnalysis } from "@/lib/physique/types";
import type { WeightUnit } from "@/lib/units";

export type ExampleScenario = ReturnType<typeof makeScenario>;

/** Days of history in the example. */
export const EXAMPLE_DAYS = 112;

/** The CONNECTIONS spec: 16 weeks, an 85 kg cut towards 78 kg, squat and bench three times a week. */
export function connectionsSpec(today: LocalDate): ScenarioSpec {
  return {
    seed: 18,
    days: EXAMPLE_DAYS,
    startDate: addDays(today, -(EXAMPLE_DAYS - 1)),
    bodyweightKg: 85,
    trueTdeeKcal: 2800,
    intake: "toTarget",
    goal: { ratePctPerWeek: -0.5, targetKg: 78 },
    sleep: { meanH: 7.0, sdH: 0.7, source: "manual", loggedShare: 1 },
    lifts: [
      { name: "Squat", startE1rm: 150, profile: "linear", changePct: 3, perWeek: 3, cv: 0.015 },
      { name: "Bench Press", startE1rm: 110, profile: "linear", changePct: 2, perWeek: 3, cv: 0.015 },
    ],
  };
}

/** Top sets 4% lighter after a night under 6.5 hours, so the sleep connection has something to find (L1). */
export function shortNightsCost(sc: ExampleScenario): ExampleScenario {
  const hours = new Map(sc.sleepNights.map((n) => [n.date, n.asleepMin / 60]));
  return {
    ...sc,
    workouts: sc.workouts.map((w) => {
      const h = hours.get(w.completedAt.slice(0, 10));
      if (h == null || h >= 6.5) return w;
      return { ...w, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((st) => ({ ...st, weight: String(Math.round((parseFloat(st.weight) * 0.96) / 2.5) * 2.5) })) })) };
    }),
  };
}

/** Top sets 3% heavier after a day of more carbs than usual (above the median), so a second connection shows (C7). */
export function higherCarbsHelp(sc: ExampleScenario): ExampleScenario {
  const carbs = new Map<string, number>();
  for (const e of sc.foodEntries) carbs.set(e.date, (carbs.get(e.date) ?? 0) + e.carbsG);
  const sorted = [...carbs.values()].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return {
    ...sc,
    workouts: sc.workouts.map((w) => {
      const c = carbs.get(addDays(w.completedAt.slice(0, 10), -1));
      if (c == null || c <= mid) return w;
      return { ...w, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((st) => ({ ...st, weight: String(Math.round((parseFloat(st.weight) * 1.03) / 2.5) * 2.5) })) })) };
    }),
  };
}

/** The example history to `today`. */
export function exampleScenario(today: LocalDate): ExampleScenario {
  return higherCarbsHelp(shortNightsCost(makeScenario(connectionsSpec(today))));
}

// ── Everything Progress reads, for the example ──

export type ExampleBundle = {
  scenario: ExampleScenario;
  expenditure: ExpenditureResult | null;
  analysis: PhysiqueAnalysis;
};

/** The example history with its expenditure and the judge's analysis, as Progress would compute them from stored data. */
export function exampleBundle(now: Now, unit: WeightUnit): ExampleBundle {
  const sc = exampleScenario(now.today);
  const goals = sc.goal ? [sc.goal] : [];
  const expenditure = computeExpenditure({ profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals, workouts: sc.workouts, onboarding: {} }, now);
  const analysis = buildPhysiqueAnalysis(
    { goal: sc.goal, goals, program: sc.program, profile: sc.profile, onboarding: {}, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, sleepNights: sc.sleepNights, waist: sc.waist, workouts: sc.workouts, weightUnit: unit, checkIns: [] },
    now,
  );
  return { scenario: sc, expenditure, analysis };
}
