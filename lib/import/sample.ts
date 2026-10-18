/**
 * Sample files for trying the app with history (I1): eleven weeks of daily
 * numbers for a cut that started eight weeks ago after three at maintenance, written in the daily-log
 * format, and the same weeks of training in Strong's CSV export format, so
 * both go through the ordinary import paths. Pure: built from the engine's
 * own scenario generator (lib/physique/fixtures.ts), relative to `today`,
 * so the files always end today.
 */

import { addDays, weekday, type LocalDate } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { dailyLogCsv, type DailyRow, type GoalLine } from "@/lib/import/dailyLog";

/** Days in the sample, and how many of them come before the goal. OURS: eleven weeks, three at maintenance, so each main lift has the three pre-phase sessions the strength read needs. */
export const SAMPLE_DAYS = 77;
export const SAMPLE_PRE_DAYS = 21;
/** The sample cut. OURS: an ordinary intermediate cut. */
export const SAMPLE_GOAL = { startKg: 86, targetKg: 80, ratePctPerWeek: -0.6, tdeeKcal: 2750 } as const;
/** Workouts are tagged so a "Remove imported data" can find them again. */
export const SAMPLE_WORKOUT_SUFFIX = " (sample)";

/** A small seeded generator so the files are the same on every phone for the same day. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The daily-log CSV and its goal line. Today has weight and sleep; its food and steps are left for the day itself. */
export function sampleDailyLog(today: LocalDate): { csv: string; rows: DailyRow[]; goal: GoalLine } {
  const startDate = addDays(today, -(SAMPLE_DAYS - 1));
  const sc = makeScenario({
    // Seed 23 loses a steady 0.4 to 0.9 kg a week; others wander more, which is real but makes a poor first look.
    seed: 23,
    startDate,
    days: SAMPLE_DAYS,
    preDays: SAMPLE_PRE_DAYS,
    bodyweightKg: SAMPLE_GOAL.startKg,
    trueTdeeKcal: SAMPLE_GOAL.tdeeKcal,
    intake: "toTarget",
    goal: { ratePctPerWeek: SAMPLE_GOAL.ratePctPerWeek, targetKg: SAMPLE_GOAL.targetKg },
    sleep: { meanH: 7.3, sdH: 0.5, source: "manual", loggedShare: 0.95 },
  });
  const rand = rng(7);
  const rows = new Map<LocalDate, DailyRow>();
  const row = (date: LocalDate) => rows.get(date) ?? rows.set(date, { date }).get(date)!;
  for (const w of sc.weighIns) row(w.date).weightKg = w.kg;
  const food = new Map<LocalDate, { kcal: number; p: number; c: number; f: number }>();
  for (const e of sc.foodEntries) {
    const t = food.get(e.date) ?? { kcal: 0, p: 0, c: 0, f: 0 };
    food.set(e.date, { kcal: t.kcal + e.kcal, p: t.p + e.proteinG, c: t.c + e.carbsG, f: t.f + e.fatG });
  }
  for (const [date, t] of food) {
    if (date >= today) continue;
    Object.assign(row(date), { kcal: Math.round(t.kcal), proteinG: Math.round(t.p), carbsG: Math.round(t.c), fatG: Math.round(t.f), fibreG: Math.round((t.kcal / 1000) * (10 + rand() * 6)) });
  }
  // Real mornings wander and weekends run later; bedtime follows from the night's length, as a watch records it.
  const clock = (min: number) => {
    const m = ((Math.round(min) % 1440) + 1440) % 1440;
    return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  };
  for (const n of sc.sleepNights) {
    const wakeMin = 7 * 60 + Math.round((rand() + rand() + rand() - 1.5) * 25) + ([0, 6].includes(weekday(n.date)) ? 35 : 0);
    Object.assign(row(n.date), { asleepMin: n.asleepMin, wake: clock(wakeMin), bedtime: clock(wakeMin - n.asleepMin - 20) });
  }
  for (let d = startDate; d < today; d = addDays(d, 1)) row(d).steps = Math.round(5500 + rand() * 6000 + (weekday(d) === 0 ? -2000 : 0));
  const goal: GoalLine = { start: addDays(startDate, SAMPLE_PRE_DAYS), targetKg: SAMPLE_GOAL.targetKg, ratePctPerWeek: SAMPLE_GOAL.ratePctPerWeek, training: "intermediate" };
  const sorted = [...rows.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { csv: dailyLogCsv(sorted, goal), rows: sorted, goal };
}

type Lift = { name: string; kg: number; reps: number; sets: number };

/**
 * Four sessions a week: upper and lower, twice, with bench and squat in
 * both so they lead the main lifts as they would for most lifters. Loads in
 * kg. OURS: a plain intermediate split.
 */
export const SAMPLE_SPLIT: Record<number, { name: string; lifts: Lift[] }> = {
  1: { name: "Upper A", lifts: [{ name: "Bench Press", kg: 85, reps: 6, sets: 3 }, { name: "Barbell Row", kg: 72.5, reps: 8, sets: 3 }, { name: "Overhead Press", kg: 50, reps: 8, sets: 3 }, { name: "Lat Pulldown", kg: 62.5, reps: 10, sets: 3 }, { name: "Lateral Raise", kg: 10, reps: 15, sets: 3 }] },
  2: { name: "Lower A", lifts: [{ name: "Squat", kg: 115, reps: 5, sets: 3 }, { name: "Romanian Deadlift", kg: 95, reps: 8, sets: 3 }, { name: "Leg Press", kg: 180, reps: 10, sets: 3 }, { name: "Lying Leg Curl", kg: 45, reps: 12, sets: 3 }] },
  4: { name: "Upper B", lifts: [{ name: "Bench Press", kg: 80, reps: 8, sets: 3 }, { name: "Lat Pulldown", kg: 60, reps: 12, sets: 3 }, { name: "Incline Dumbbell Press", kg: 30, reps: 10, sets: 3 }, { name: "Bicep Curl", kg: 14, reps: 12, sets: 3 }, { name: "Tricep Pushdown", kg: 30, reps: 12, sets: 3 }] },
  6: { name: "Lower B", lifts: [{ name: "Deadlift", kg: 150, reps: 5, sets: 3 }, { name: "Squat", kg: 105, reps: 7, sets: 3 }, { name: "Leg Extension", kg: 55, reps: 12, sets: 3 }, { name: "Hip Thrust", kg: 110, reps: 10, sets: 3 }] },
};

/**
 * The same eleven weeks of training in Strong's export format, one row per
 * set. Loads rise about 1% a week at maintenance and hold through the cut,
 * with a little day-to-day noise; every set is at RPE 8.
 */
export function sampleWorkoutsCsv(today: LocalDate): string {
  const startDate = addDays(today, -(SAMPLE_DAYS - 1));
  const goalStart = addDays(startDate, SAMPLE_PRE_DAYS);
  const rand = rng(11);
  const out = ['"Date","Workout Name","Duration","Exercise Name","Set Order","Weight","Weight Unit","Reps","Distance","Seconds","Notes","Workout Notes","RPE"'];
  for (let d = startDate; d < today; d = addDays(d, 1)) {
    const day = SAMPLE_SPLIT[weekday(d)];
    if (!day) continue;
    const weeksIn = Math.min(SAMPLE_PRE_DAYS, Math.max(0, (Date.parse(d) - Date.parse(startDate)) / 86400000)) / 7;
    const growth = 1 + 0.01 * weeksIn - (d >= goalStart ? 0 : 0.02);
    for (const lift of day.lifts) {
      const kg = Math.round((lift.kg * growth * (1 + (rand() - 0.5) * 0.02)) / 2.5) * 2.5;
      for (let s = 1; s <= lift.sets; s++) out.push([`"${d} 18:00:00"`, `"${day.name}${SAMPLE_WORKOUT_SUFFIX}"`, '"1h 5m"', `"${lift.name}"`, s, kg, '"kg"', lift.reps, 0, 0, '""', '""', 8].join(","));
    }
  }
  return out.join("\n") + "\n";
}
