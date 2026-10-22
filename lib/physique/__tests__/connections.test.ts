import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { CONN_MIN_GROUP, compareThirds, connections, sessionStrength, type ConnectionInputs } from "@/lib/physique/connections";
import type { FoodEntry, SleepNight } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

const today = "2026-10-21";
const now = { today, tz: "UTC" };

/** Seeded uniform in [0, 1). */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * Sixteen weeks of squat and bench three days a week (Mon, Wed, Fri), each
 * lift's top set progressing slowly with 1.5% noise, and a night of sleep
 * before every day. `sleepEffectPct` is how much weaker a session is after
 * a night under 6.5 hours.
 */
function history(seed: number, sleepEffectPct: number): ConnectionInputs {
  const r = rng(seed);
  const workouts: StoredWorkout[] = [];
  const sleepNights: SleepNight[] = [];
  const start = addDays(today, -111);
  for (let d = 0; d < 112; d++) {
    const date = addDays(start, d);
    const hours = 5.6 + r() * 2.8;
    sleepNights.push({ id: `n-${date}`, date, asleepMin: Math.round(hours * 60), source: "manual", loggedAt: `${date}T08:00:00.000Z`, schemaVersion: 1 } as SleepNight);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow !== 1 && dow !== 3 && dow !== 5) continue;
    const short = hours < 6.5 ? 1 - sleepEffectPct / 100 : 1;
    const lift = (base: number) => {
      const level = base * (1 + 0.0004 * d);
      const noise = 1 + (r() - 0.5) * 0.03;
      return Math.round(level * noise * short * 2) / 2;
    };
    workouts.push({
      completedAt: `${date}T18:00:00.000Z`,
      name: "Full body",
      exercises: [
        { name: "Squat", sets: [{ weight: String(lift(120)), reps: "5" }] },
        { name: "Bench Press", sets: [{ weight: String(lift(90)), reps: "5" }] },
      ],
    });
  }
  return { workouts, sleepNights, foodEntries: [], dayFlags: {}, weighIns: [], unit: "kg" };
}

describe("Connections (L1)", () => {
  it("reads each session against the lift's own level, so steady progress is not a difference", () => {
    const h = history(1, 0);
    const s = sessionStrength(h.workouts, "kg", now, addDays(today, -111));
    expect(s.length).toBeGreaterThan(40);
    const avg = s.reduce((a, x) => a + x.pct, 0) / s.length;
    expect(Math.abs(avg)).toBeLessThan(0.5);
  });

  it("finds a 5% cost of short nights, with both groups' numbers in one factual sentence", () => {
    const res = connections(history(2, 5), now);
    const sleep = res.items.find((c) => c.id === "sleep");
    expect(sleep?.state).toBe("linked");
    expect(sleep!.diffPct).toBeGreaterThan(2.5);
    expect(sleep!.text).toMatch(/^After your longest nights \(\d+h \d+m on average\), your lifts were \d+\.\d% stronger than after your shortest \(\d+h \d+m\)\.$/);
    expect(sleep!.text).not.toMatch(/should|try|aim|get more|fix/i);
  });

  it("says no clear difference when sleep has no effect, across many seeds", () => {
    let linked = 0;
    for (let seed = 10; seed < 40; seed++) {
      const sleep = connections(history(seed, 0), now).items.find((c) => c.id === "sleep");
      expect(sleep).toBeDefined();
      if (sleep!.state === "linked") linked += 1;
    }
    expect(linked).toBeLessThanOrEqual(1);
  });

  it("stays silent with too few sessions, and leaves out conditions that were never recorded", () => {
    const h = history(3, 5);
    const short = { ...h, workouts: h.workouts.slice(-12) };
    expect(connections(short, now).items).toEqual([]);
    const ids = connections(h, now).items.map((c) => c.id);
    expect(ids).not.toContain("calories");
    expect(ids).not.toContain("hrv");
  });

  it("returns the sessions behind each third, and reads longer history only when asked (PR2)", () => {
    const h = history(2, 5);
    const res = connections(h, now);
    expect(res.weeks).toBe(16);
    const sleep = res.items.find((c) => c.id === "sleep")!;
    expect(sleep.points.high).toHaveLength(sleep.high.sessions);
    expect(sleep.points.low).toHaveLength(sleep.low.sessions);
    for (const p of [...sleep.points.high, ...sleep.points.low]) {
      expect(p.date >= res.from && p.date <= res.through).toBe(true);
    }
    const meanHigh = sleep.points.high.reduce((a, p) => a + p.pct, 0) / sleep.points.high.length;
    expect(Math.round(meanHigh * 10) / 10).toBe(sleep.high.pct);
    expect(connections(h, now, { days: 30 }).weeks).toBe(16);
    const longer = connections(h, now, { days: 182 });
    expect(longer.weeks).toBe(26);
    expect(longer.from < res.from).toBe(true);
  });

  it("compares thirds only when they separate and each holds the minimum", () => {
    const tied = Array.from({ length: 3 * CONN_MIN_GROUP + 3 }, (_, i) => ({ pct: i % 2, v: 2 }));
    expect(compareThirds(tied)).toBeNull();
    const few = Array.from({ length: 3 * CONN_MIN_GROUP - 1 }, (_, i) => ({ pct: 0, v: i }));
    expect(compareThirds(few)).toBeNull();
    const ok = Array.from({ length: 3 * CONN_MIN_GROUP }, (_, i) => ({ pct: i < CONN_MIN_GROUP ? -3 : 3, v: i }));
    const c = compareThirds(ok);
    expect(c?.low).toHaveLength(CONN_MIN_GROUP);
    expect(c?.diff).toBeCloseTo(6, 5);
  });

  // ── C7: more conditions, each with its evidence ──

  /** Sixteen weeks of three sessions a week with food every day and sessions at random hours; `carbEffect` and `eveningEffect` make sessions after high-carb days, or late in the day, stronger. */
  function richHistory(seed: number, carbEffectPct: number, eveningEffectPct: number): ConnectionInputs {
    const r = rng(seed);
    const workouts: StoredWorkout[] = [];
    const foodEntries: FoodEntry[] = [];
    const start = addDays(today, -111);
    const carbsByDate = new Map<string, number>();
    for (let d = -1; d < 112; d++) {
      const date = addDays(start, d);
      const carbs = Math.round(120 + r() * 260);
      carbsByDate.set(date, carbs);
      foodEntries.push({ id: `f-${date}`, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Day", kcal: Math.round(2300 + r() * 600), proteinG: Math.round(140 + r() * 60), carbsG: carbs, fatG: 80, method: "manual" } as unknown as FoodEntry);
    }
    for (let d = 0; d < 112; d++) {
      const date = addDays(start, d);
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (dow !== 1 && dow !== 3 && dow !== 5) continue;
      const evening = r() < 0.5;
      const hour = evening ? 18 + Math.floor(r() * 3) : 6 + Math.floor(r() * 3);
      const highCarb = (carbsByDate.get(addDays(date, -1)) ?? 0) > 250;
      const effect = (highCarb ? 1 + carbEffectPct / 100 : 1) * (evening ? 1 + eveningEffectPct / 100 : 1);
      const lift = (base: number) => Math.round(base * (1 + 0.0004 * d) * (1 + (r() - 0.5) * 0.03) * effect * 2) / 2;
      workouts.push({
        completedAt: `${date}T${String(hour).padStart(2, "0")}:15:00.000Z`,
        name: "Full body",
        exercises: [
          { name: "Squat", sets: [{ weight: String(lift(120)), reps: "5" }] },
          { name: "Bench Press", sets: [{ weight: String(lift(90)), reps: "5" }] },
        ],
      });
    }
    return { workouts, sleepNights: [], foodEntries, dayFlags: {}, weighIns: [], unit: "kg" };
  }

  it("finds a carbs effect and a time-of-day effect, each with what studies found and no advice", () => {
    const carbs = connections(richHistory(5, 4, 0), now).items.find((c) => c.id === "carbs");
    expect(carbs?.state).toBe("linked");
    expect(carbs!.text).toMatch(/^After your highest-carb days \(\d+ g on average\), your lifts were \d+\.\d% stronger than after your lowest \(\d+ g\)\.$/);
    expect(carbs!.evidence?.source).toMatch(/Henselmans/);
    const time = connections(richHistory(6, 0, 4), now).items.find((c) => c.id === "time");
    expect(time?.state).toBe("linked");
    expect(time!.text).toMatch(/^In your latest sessions \(around \d{2}:\d{2}\), your lifts were \d+\.\d% stronger than in your earliest \(around \d{2}:\d{2}\)\.$/);
    for (const c of [carbs!, time!]) expect(`${c.text} ${c.evidence?.text ?? ""}`).not.toMatch(/should|try|aim|make sure|you need/i);
    // IN1: the hour is when the session started. Logged sessions stamp the end, so an hour-long one reads an hour earlier.
    const timed = richHistory(6, 0, 4);
    const started = { ...timed, workouts: timed.workouts.map((w) => ({ ...w, durationSec: 3600 })) };
    const t2 = connections(started, now).items.find((c) => c.id === "time");
    expect(t2!.high.mean).toBeCloseTo(time!.high.mean - 1, 5);
    expect(t2!.low.mean).toBeCloseTo(time!.low.mean - 1, 5);
  });

  it("rarely links anything by chance with eight conditions read at once", () => {
    let linked = 0;
    let checked = 0;
    for (let seed = 40; seed < 70; seed++) {
      const res = connections(richHistory(seed, 0, 0), now);
      linked += res.items.filter((c) => c.state === "linked").length;
      checked += res.checked;
    }
    // Carbs, protein, time and rest are read on every seed; calories against maintenance needs the estimate.
    expect(checked).toBeGreaterThanOrEqual(30 * 3);
    expect(linked).toBeLessThanOrEqual(3);
  });

  it("reads calories against maintenance only with the estimate, as the day before's gap", () => {
    const h = richHistory(7, 0, 0);
    expect(connections(h, now).items.map((c) => c.id)).not.toContain("balance");
    const expenditure = h.foodEntries.map((e) => ({ date: e.date, tdee: 2800, state: "updating" as const, trendKg: 80, base: 2800, offset: 0, updatingDays: 1 }));
    const bal = connections({ ...h, expenditure }, now).items.find((c) => c.id === "balance");
    expect(bal).toBeDefined();
    // Intake runs 2,300 to 2,900 against 2,800, so the highest-calorie days sit near maintenance and the lowest well under.
    expect(bal!.high.value).toMatch(/^(\d+ (under|over) maintenance|at maintenance)$/);
    expect(bal!.low.value).toMatch(/^\d+ under maintenance$/);
  });

  it("shows two conditions that rose and fell together as one finding, naming the other (C7)", () => {
    const h = richHistory(5, 4, 0);
    // Calories follow carbs here, as they do when the extra food is carbs.
    const foodEntries = h.foodEntries.map((e) => ({ ...e, kcal: 1800 + 4 * e.carbsG }));
    const expenditure = foodEntries.map((e) => ({ date: e.date, tdee: 2800, state: "updating" as const, trendKg: 80, base: 2800, offset: 0, updatingDays: 1 }));
    const res = connections({ ...h, foodEntries, expenditure }, now);
    const linked = res.items.filter((c) => c.state === "linked");
    const food = linked.filter((c) => c.id === "carbs" || c.id === "balance");
    expect(food).toHaveLength(1);
    expect(food[0].movedWith).toBe(food[0].id === "carbs" ? "balance" : "carbs");
    // TR12: which way the other moved, for "Calories were higher too, so it could be either".
    expect(food[0].movedWithSign).toBe(1);
    expect(food[0].text).toMatch(/rose and fell with it, so the two can't be told apart\.$/);
    // Each third keeps its raw mean for the plain-words row.
    expect(food[0].high.mean).toBeGreaterThan(food[0].low.mean);
  });
});

describe("Connections: the pace towards the first read (PR3d)", () => {
  it("counts the sessions of the last four weeks, a week", () => {
    const h = history(3, 0);
    const res = connections({ ...h, workouts: h.workouts.slice(-12) }, now);
    // Three sessions a week (Mon, Wed, Fri) over the last four weeks.
    expect(res.recentPerWeek).toBe(3);
    expect(connections({ ...h, workouts: [] }, now).recentPerWeek).toBe(0);
  });
});
