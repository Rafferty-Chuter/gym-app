import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { CONN_MIN_HISTORY_DAYS, CONN_PER_LIFT_MIN, CONNECTION_IDS, connections, type ConnectionInputs } from "@/lib/physique/connections";
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

type Opts = {
  days?: number;
  /** % weaker a session is after a night under 6.5 hours. */
  sleepEffectPct?: number;
  /** Short nights come in runs (a week of short, then a week or two of long), as real ones do. */
  clustered?: boolean;
  /** Wake time 07:00, or 05:30 on about a day in five; % weaker on those days. */
  wakeEarlyPct?: number;
  /** % weaker after two nights under 6 hours in a row. */
  shortRunPct?: number;
  /** Only the squat feels the sleep effect (per-lift reads). */
  squatOnly?: boolean;
  /** Session noise, % (1.5 by default). */
  noisePct?: number;
};

/**
 * Squat and bench three days a week (Mon, Wed, Fri), each lift's top set
 * progressing slowly with session noise, and a night of sleep before every
 * day, with the effects asked for.
 */
function history(seed: number, sleepEffectPct = 0, o: Opts = {}): ConnectionInputs {
  const r = rng(seed);
  const days = o.days ?? 112;
  const workouts: StoredWorkout[] = [];
  const sleepNights: SleepNight[] = [];
  const start = addDays(today, -(days - 1));
  let prevH = 7.5;
  let longRun = true;
  for (let d = 0; d < days; d++) {
    const date = addDays(start, d);
    if (o.clustered && d % 7 === 0) longRun = r() < 0.6;
    const hours = o.clustered ? (longRun ? 7.4 + r() * 0.8 : 5.4 + r() * 0.8) : o.shortRunPct != null ? (r() < 0.35 ? 5.3 + r() * 0.5 : 7.2 + r() * 1.2) : 5.6 + r() * 2.8;
    const early = o.wakeEarlyPct != null && r() < 0.2;
    sleepNights.push({ id: `n-${date}`, date, asleepMin: Math.round(hours * 60), source: "manual", loggedAt: `${date}T08:00:00.000Z`, schemaVersion: 1, ...(o.wakeEarlyPct != null ? { wakeTime: early ? "05:30" : "07:00", bedtime: "23:00" } : {}) } as SleepNight);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    const prev = prevH;
    prevH = hours;
    if (dow !== 1 && dow !== 3 && dow !== 5) continue;
    const effect = (lift: "squat" | "bench") => {
      let f = 1;
      if (hours < 6.5 && (!o.squatOnly || lift === "squat")) f *= 1 - (o.sleepEffectPct ?? sleepEffectPct) / 100;
      if (early) f *= 1 - (o.wakeEarlyPct ?? 0) / 100;
      if (o.shortRunPct != null && hours < 6 && prev < 6) f *= 1 - o.shortRunPct / 100;
      return f;
    };
    const noise = (o.noisePct ?? 1.5) / 100;
    const lift = (base: number, which: "squat" | "bench") => Math.round(base * (1 + 0.0004 * d) * (1 + (r() - 0.5) * 2 * noise) * effect(which) * 2) / 2;
    workouts.push({
      completedAt: `${date}T18:00:00.000Z`,
      name: "Full body",
      exercises: [
        { name: "Squat", sets: [{ weight: String(lift(120, "squat")), reps: "5" }] },
        { name: "Bench Press", sets: [{ weight: String(lift(90, "bench")), reps: "5" }] },
      ],
    });
  }
  return { workouts, sleepNights, foodEntries: [], dayFlags: {}, weighIns: [], unit: "kg" };
}

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

/**
 * IN9: forty weeks of three sessions a week, food every day, and drinks
 * (54 g of alcohol) on about one evening in three; sessions the day after a
 * drinking evening are `effectPct` weaker.
 */
function drinkHistory(seed: number, effectPct: number, weeks = 40): ConnectionInputs {
  const r = rng(seed);
  const days = weeks * 7;
  const workouts: StoredWorkout[] = [];
  const foodEntries: FoodEntry[] = [];
  const start = addDays(today, -(days - 1));
  const drank = new Set<string>();
  for (let d = -1; d < days; d++) {
    const date = addDays(start, d);
    foodEntries.push({ id: `f-${date}`, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Day", kcal: 2400, proteinG: 160, carbsG: 250, fatG: 80, method: "quick", time: "13:00" });
    if (r() < 0.33) {
      drank.add(date);
      foodEntries.push({ id: `d-${date}`, date, loggedAt: `${date}T21:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Lager, standard", kcal: 409, proteinG: 3, carbsG: 30, fatG: 0, method: "search", time: "21:00", alcoholG: 54 });
    }
  }
  for (let d = 0; d < days; d++) {
    const date = addDays(start, d);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow !== 1 && dow !== 3 && dow !== 5) continue;
    const f = drank.has(addDays(date, -1)) ? 1 - effectPct / 100 : 1;
    const lift = (base: number) => Math.round(base * (1 + 0.0004 * d) * (1 + (r() - 0.5) * 0.05) * f * 2) / 2;
    workouts.push({ completedAt: `${date}T18:00:00.000Z`, name: "Full body", exercises: [{ name: "Squat", sets: [{ weight: String(lift(120)), reps: "5" }] }, { name: "Bench Press", sets: [{ weight: String(lift(90)), reps: "5" }] }] });
  }
  return { workouts, sleepNights: [], foodEntries, dayFlags: {}, weighIns: [], unit: "kg" };
}

describe("Connections: drinks the evening before (IN9)", () => {
  it("links lifts 4% lighter the day after drinking, in the session counts", () => {
    const c = connections(drinkHistory(41, 4), now).items.find((x) => x.id === "alcohol");
    expect(c?.state).toBe("linked");
    expect(c!.diffPct).toBeLessThan(-2);
    expect(c!.kind).toBe("yesno");
    expect(c!.high.sessions).toBeGreaterThanOrEqual(10);
    expect(c!.evidence?.source).toMatch(/Shaw/);
  });

  it("strength that holds after drinking reads as no clear link", () => {
    for (const seed of [42, 43, 44]) {
      const c = connections(drinkHistory(seed, 0), now).items.find((x) => x.id === "alcohol");
      expect(c?.state).toBe("none");
    }
  });

  it("IN9b: reads drinks logged only in Apple Health", () => {
    const h = drinkHistory(41, 4);
    const vitals = h.foodEntries.filter((e) => e.alcoholG).map((e) => ({ id: `hk-v-${e.date}`, date: e.date, loggedAt: e.loggedAt, source: "healthkit" as const, schemaVersion: 1 as const, alcoholDrinks: 4 }));
    const fromHealth = { ...h, foodEntries: h.foodEntries.filter((e) => !e.alcoholG), vitals };
    expect(connections(fromHealth, now).items.find((x) => x.id === "alcohol")?.state).toBe("linked");
    expect(connections({ ...fromHealth, vitals: [] }, now).items.find((x) => x.id === "alcohol")).toBeUndefined();
  });

  it("is not read without drinks logged, or from days whose food isn't logged", () => {
    const h = drinkHistory(45, 4);
    const dry = { ...h, foodEntries: h.foodEntries.filter((e) => !e.alcoholG) };
    expect(connections(dry, now).items.find((x) => x.id === "alcohol")).toBeUndefined();
    expect(connections({ ...h, foodEntries: [] }, now).items.find((x) => x.id === "alcohol")).toBeUndefined();
  });
});

describe("Connections (L1, rebuilt in IN5)", () => {
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

  it("stays silent with too few sessions or under twelve weeks, and leaves out conditions never recorded", () => {
    const h = history(3, 5);
    expect(connections({ ...h, workouts: h.workouts.slice(-12) }, now).items).toEqual([]);
    const shortHistory = history(3, 5, { days: CONN_MIN_HISTORY_DAYS - 7 });
    expect(connections(shortHistory, now).items).toEqual([]);
    const ids = connections(h, now).items.map((c) => c.id);
    for (const id of ["balance", "hrv", "carbs", "wake"]) expect(ids).not.toContain(id);
  });

  it("IN5: short nights in runs are no longer halved by the lift's own level", () => {
    // The old neighbour median took a run of short nights as the lift's level and read a true −4% as about −2%.
    let found = 0;
    let sum = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sleep = connections(history(100 + seed, 0, { clustered: true, sleepEffectPct: 4, days: 182 }), now).items.find((c) => c.id === "sleep");
      if (sleep?.state === "linked") found++;
      sum += sleep?.diffPct ?? 0;
    }
    expect(found).toBeGreaterThanOrEqual(7);
    // About 4%, a little under after shrinking towards zero.
    expect(sum / 10).toBeGreaterThan(3);
  });

  it("IN5: waking an hour early, a yes-or-no condition, read against the rest", () => {
    const c = connections(history(7, 0, { wakeEarlyPct: 5, days: 182 }), now).items.find((x) => x.id === "wake");
    expect(c).toMatchObject({ kind: "yesno", state: "linked", high: { value: "Woke early" }, low: { value: "Usual wake" } });
    expect(c!.diffPct).toBeLessThan(-2.5);
    expect(c!.text).toMatch(/^On mornings you woke an hour or more earlier than usual, your lifts were \d+\.\d% weaker than on the rest\.$/);
  });

  it("IN5: two short nights in a row", () => {
    const c = connections(history(8, 0, { shortRunPct: 6, days: 182 }), now).items.find((x) => x.id === "shortRun");
    expect(c?.state).toBe("linked");
    expect(c!.diffPct).toBeLessThan(-3);
  });

  it("IN5: each main lift's own share, once it has the sessions", () => {
    const res = connections(history(9, 0, { sleepEffectPct: 6, squatOnly: true, days: 182 }), now);
    const sleep = res.items.find((c) => c.id === "sleep")!;
    expect(sleep.state).toBe("linked");
    const squat = sleep.perLift.find((l) => l.name === "Squat")!;
    const bench = sleep.perLift.find((l) => l.name === "Bench Press")!;
    expect(squat.own && bench.own).toBe(true);
    expect(squat.sessions).toBeGreaterThanOrEqual(CONN_PER_LIFT_MIN);
    expect(squat.pct).toBeGreaterThan(bench.pct + 2);
    expect(Math.abs(bench.pct)).toBeLessThan(2);
    expect(squat.kg).toBeGreaterThan(3);
  });

  it("IN5: a link must hold a week earlier too", () => {
    // Twelve weeks and a day: the gate is met today but not a week ago, so nothing links yet.
    const h = history(2, 8, { days: CONN_MIN_HISTORY_DAYS + 2 });
    const sleep = connections(h, now).items.find((c) => c.id === "sleep");
    expect(sleep?.state).toBe("none");
  });

  it("returns the days behind each group, and reads up to a year", () => {
    const h = history(2, 5);
    const res = connections(h, now);
    expect(res.weeks).toBe(16);
    const sleep = res.items.find((c) => c.id === "sleep")!;
    expect(sleep.points.high).toHaveLength(sleep.high.sessions);
    expect(sleep.points.low).toHaveLength(sleep.low.sessions);
    for (const p of [...sleep.points.high, ...sleep.points.low]) expect(p.date >= res.from && p.date <= res.through).toBe(true);
    const meanHigh = sleep.points.high.reduce((a, p) => a + p.pct, 0) / sleep.points.high.length;
    expect(Math.round(meanHigh * 10) / 10).toBe(sleep.high.pct);
    const longer = connections(history(2, 5, { days: 300 }), now);
    expect(longer.weeks).toBe(43);
  });

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

  it("rarely links anything by chance with every condition read at once", () => {
    let linked = 0;
    let checked = 0;
    for (let seed = 40; seed < 70; seed++) {
      const res = connections(richHistory(seed, 0, 0), now);
      linked += res.items.filter((c) => c.state === "linked").length;
      checked += res.checked;
    }
    expect(checked).toBeGreaterThanOrEqual(30 * 3);
    expect(linked).toBeLessThanOrEqual(3);
  });

  it("reads calories against maintenance only with the estimate, as the day before's gap", () => {
    const h = richHistory(7, 0, 0);
    expect(connections(h, now).items.map((c) => c.id)).not.toContain("balance");
    const expenditure = h.foodEntries.map((e) => ({ date: e.date, tdee: 2800, state: "updating" as const, trendKg: 80, base: 2800, offset: 0, updatingDays: 1 }));
    const bal = connections({ ...h, expenditure }, now).items.find((c) => c.id === "balance");
    expect(bal).toBeDefined();
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
    const food = linked.filter((c) => c.id === "carbs" || c.id === "balance" || c.id === "balance3");
    expect(food).toHaveLength(1);
    expect(["carbs", "balance", "balance3"]).toContain(food[0].movedWith);
    expect(food[0].movedWithSign).toBe(1);
    expect(food[0].text).toMatch(/rose and fell with it, so the two can't be told apart\.$/);
    expect(food[0].high.mean).toBeGreaterThan(food[0].low.mean);
  });

  it("lists every condition it knows, in a fixed order", () => {
    expect(CONNECTION_IDS).toHaveLength(15);
    expect(new Set(CONNECTION_IDS).size).toBe(15);
  });
});

describe("Connections: the pace towards the first read (PR3d)", () => {
  it("counts the sessions of the last four weeks, a week", () => {
    const h = history(3, 0);
    const res = connections({ ...h, workouts: h.workouts.slice(-12) }, now);
    expect(res.recentPerWeek).toBe(3);
    expect(connections({ ...h, workouts: [] }, now).recentPerWeek).toBe(0);
  });
});
