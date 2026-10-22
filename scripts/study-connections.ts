/**
 * Does Connections find what is there, and only that? (IN5, 2026-10-22.)
 * Made-up lifters with one known effect each, and a control with none, are
 * run through the real engine (`lib/physique/connections.ts`) at 16, 26
 * and 52 weeks of history. Every condition is recorded for everyone
 * (nights with bed and wake times, food every day, a maintenance estimate,
 * sessions at varied hours), so all 14 are read at once.
 *
 *   npx tsx scripts/study-connections.ts [seeds=30] [noise=2.5] [out=docs/plan/research/M-connections-study.json]
 *
 * `noise` is the session-to-session spread of a top set (SD, %); research L
 * puts it at 2 to 4% for most lifters.
 *
 * Pure engine code only: no storage, no network.
 */

import { writeFileSync } from "node:fs";
import { addDays, type LocalDate } from "@/lib/dates";
import { connections, type ConnectionId, type ConnectionInputs } from "@/lib/physique/connections";
import type { ExpenditurePoint, FoodEntry, SleepNight } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

const SEEDS = Number(process.argv[2] ?? 30);
const NOISE = Number(process.argv[3] ?? 2.5) / 100;
const OUT = process.argv[4] ?? "docs/plan/research/M-connections-study.json";
const TODAY: LocalDate = "2026-10-21";
const NOW = { today: TODAY, tz: "UTC" };

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

type Truth = { id: ConnectionId | null; pct: number };

/**
 * Squat and bench three times a week with NOISE session noise and slow
 * progress; nights 5.6 to 8.4 h waking at 07:00 or, one day in five, 05:30;
 * carbs 120 to 380 g; sessions at 06:00 to 20:00. `truth` adds one effect.
 */
function lifter(seed: number, weeks: number, truth: Truth): ConnectionInputs {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const days = weeks * 7;
  const start = addDays(TODAY, -(days - 1));
  const workouts: StoredWorkout[] = [];
  const sleepNights: SleepNight[] = [];
  const foodEntries: FoodEntry[] = [];
  const expenditure: ExpenditurePoint[] = [];
  const carbs = new Map<LocalDate, number>();
  for (let d = -3; d < days; d++) {
    const date = addDays(start, d);
    const c = Math.round(120 + r() * 260);
    carbs.set(date, c);
    foodEntries.push({ id: `f${d}`, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Day", kcal: Math.round(2300 + r() * 600), proteinG: Math.round(140 + r() * 60), carbsG: c, fatG: 80, method: "quick" });
    expenditure.push({ date, tdee: 2700, state: "updating", trendKg: 82 } as ExpenditurePoint);
  }
  for (let d = 0; d < days; d++) {
    const date = addDays(start, d);
    const hours = 5.6 + r() * 2.8;
    const early = r() < 0.2;
    sleepNights.push({ id: `n${d}`, date, loggedAt: `${date}T08:00:00.000Z`, source: "healthkit", schemaVersion: 1, asleepMin: Math.round(hours * 60), bedtime: "23:00", wakeTime: early ? "05:30" : "07:00" });
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow !== 1 && dow !== 3 && dow !== 5) continue;
    let f = 1;
    if (truth.id === "sleep" && hours < 6.5) f *= 1 - truth.pct / 100;
    if (truth.id === "wake" && early) f *= 1 - truth.pct / 100;
    if (truth.id === "carbs" && (carbs.get(addDays(date, -1)) ?? 0) > 250) f *= 1 + truth.pct / 100;
    const hour = 6 + Math.floor(r() * 14);
    const top = (base: number) => String(Math.round(((base * (1 + 0.0004 * d) * (1 + NOISE * gauss()) * f) / (1 + 5 / 30)) * 2) / 2);
    workouts.push({ completedAt: `${date}T${String(hour).padStart(2, "0")}:30:00.000Z`, startedAt: `${date}T${String(hour).padStart(2, "0")}:00:00.000Z`, name: "Full body", exercises: [{ name: "Squat", sets: [{ weight: top(140), reps: "5" }] }, { name: "Bench Press", sets: [{ weight: top(100), reps: "5" }] }] });
  }
  return { workouts, sleepNights, foodEntries, dayFlags: {}, weighIns: [], expenditure, unit: "kg" };
}

const PERSONAS: Array<{ name: string; truth: Truth }> = [
  { name: "Sleep: 4% weaker after nights under 6.5 h", truth: { id: "sleep", pct: 4 } },
  { name: "Waking early: 4% weaker on mornings an hour and a half early", truth: { id: "wake", pct: 4 } },
  { name: "Carbs: 3% stronger after days over 250 g", truth: { id: "carbs", pct: 3 } },
  { name: "Control: no effect", truth: { id: null, pct: 0 } },
];
const LENGTHS = [16, 26, 52];

const rows: Array<Record<string, unknown>> = [];
for (const p of PERSONAS) {
  for (const weeks of LENGTHS) {
    let found = 0;
    let falseLinks = 0;
    let runsWithFalse = 0;
    const sizes: number[] = [];
    const otherIds: Record<string, number> = {};
    for (let s = 1; s <= SEEDS; s++) {
      const res = connections(lifter(1000 * weeks + s, weeks, p.truth), NOW);
      const linked = res.items.filter((c) => c.state === "linked");
      const hit = p.truth.id ? linked.find((c) => c.id === p.truth.id || c.movedWith === p.truth.id) : null;
      if (hit) {
        found++;
        sizes.push(Math.abs(hit.diffPct));
      }
      const others = linked.filter((c) => c !== hit);
      for (const c of others) otherIds[c.id] = (otherIds[c.id] ?? 0) + 1;
      const wrong = others.length;
      falseLinks += wrong;
      if (wrong) runsWithFalse++;
    }
    const row = {
      persona: p.name,
      weeks,
      found: p.truth.id ? `${found}/${SEEDS}` : "–",
      meanShownPct: sizes.length ? Math.round((sizes.reduce((a, b) => a + b, 0) / sizes.length) * 10) / 10 : null,
      falseLinksPerRun: Math.round((falseLinks / SEEDS) * 100) / 100,
      runsWithAFalseLink: `${runsWithFalse}/${SEEDS}`,
      otherLinks: otherIds,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
writeFileSync(OUT, JSON.stringify({ seeds: SEEDS, noisePct: NOISE * 100, today: TODAY, rows }, null, 2));
console.log(`written ${OUT}`);
