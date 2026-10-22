import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { gaussian, mulberry32 } from "@/lib/physique/fixtures";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import { stuckLifts, type StuckLiftInputs } from "@/lib/physique/liftPlateau";
import { stuckChangesLine, stuckTitle, stuckValue } from "@/lib/physique/liftPlateauWords";
import type { ExpenditurePoint, FoodEntry, PhysiqueGoal, SleepNight, WeighIn } from "@/lib/physique/types";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

const TODAY = "2026-10-21";
const now = { today: TODAY, tz: "UTC" };
const WEEKS = 16;
const START = addDays(TODAY, -(WEEKS * 7 - 1));

/** % a week a lift moves in each week (index 0 = the first week). */
type Path = (week: number) => number;
const rising = (r: number): Path => () => r;
const riseThenFlat = (r: number, flatFromWeek: number): Path => (w) => (w < flatFromWeek ? r : 0);
const riseThenDrop = (r: number, d: number, fromWeek: number): Path => (w) => (w < fromWeek ? r : d);

type Person = {
  bench?: Path;
  squat?: Path;
  noisePct?: number;
  /** Extra chest sets a session (incline press), before and after a week. */
  chestExtra?: { before: number; after: number; fromWeek: number };
  /** Sleep hours before and after a week. */
  sleep?: { before: number; after: number; fromWeek: number };
  /** Daily intake against 2,700 maintenance, before and after a week. */
  balance?: { before: number; after: number; fromWeek: number };
  goal?: "lose" | "gain" | null;
};

/**
 * Sixteen weeks of squat and bench three days a week (Mon, Wed, Fri), each
 * session's top set moving along its path with the given session noise,
 * plus nights, food, weigh-ins and a maintenance estimate.
 */
function person(seed: number, p: Person = {}): StuckLiftInputs {
  const r = mulberry32(seed);
  const workouts: StoredWorkout[] = [];
  const sleepNights: SleepNight[] = [];
  const foodEntries: FoodEntry[] = [];
  const weighIns: WeighIn[] = [];
  const expenditure: ExpenditurePoint[] = [];
  let bench = 100;
  let squat = 140;
  let kg = 85;
  for (let d = 0; d < WEEKS * 7; d++) {
    const date: LocalDate = addDays(START, d);
    const week = Math.floor(d / 7);
    bench *= 1 + (p.bench ?? rising(0.5))(week) / 100 / 7;
    squat *= 1 + (p.squat ?? rising(0.5))(week) / 100 / 7;
    const sl = p.sleep && week >= p.sleep.fromWeek ? p.sleep.after : (p.sleep?.before ?? 7.6);
    sleepNights.push({ id: `n${d}`, date, loggedAt: `${date}T07:00:00.000Z`, source: "healthkit", schemaVersion: 1, asleepMin: Math.round((sl + 0.3 * gaussian(r)) * 60) });
    const bal = p.balance && week >= p.balance.fromWeek ? p.balance.after : (p.balance?.before ?? -300);
    foodEntries.push({ id: `f${d}`, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Day", kcal: 2700 + bal, proteinG: 170, carbsG: 250, fatG: 80, method: "quick" });
    kg += bal / 7716;
    weighIns.push({ id: `w${d}`, date, loggedAt: `${date}T07:00:00.000Z`, source: "manual", schemaVersion: 1, kg: Math.round(kg * 100) / 100 });
    expenditure.push({ date, tdee: 2700, state: "updating", trendKg: kg } as ExpenditurePoint);
    const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
    if (dow !== 1 && dow !== 3 && dow !== 5) continue;
    const noise = (p.noisePct ?? 2) / 100;
    const top = (e1rm: number) => String(Math.round((e1rm * (1 + noise * gaussian(r))) / (1 + 5 / 30) / 2.5) * 2.5);
    const chest = p.chestExtra ? (week >= p.chestExtra.fromWeek ? p.chestExtra.after : p.chestExtra.before) : 0;
    workouts.push({
      completedAt: `${date}T18:00:00.000Z`,
      name: "Full body",
      exercises: [
        { name: "Squat", sets: [{ weight: top(squat), reps: "5" }, { weight: "100", reps: "5" }, { weight: "100", reps: "5" }] },
        { name: "Bench Press", sets: [{ weight: top(bench), reps: "5" }, { weight: "70", reps: "5" }, { weight: "70", reps: "5" }] },
        ...(chest > 0 ? [{ name: "Incline Dumbbell Press", sets: Array.from({ length: chest }, () => ({ weight: "30", reps: "10" })) }] : []),
      ],
    });
  }
  const goal: PhysiqueGoal | null =
    p.goal === null || p.goal === undefined
      ? null
      : { id: "g", createdAt: `${START}T07:00:00.000Z`, type: p.goal, startDate: START, startTrendKg: 85, targetKg: p.goal === "lose" ? 78 : 92, ratePctPerWeek: p.goal === "lose" ? -0.5 : 0.25, trainingStatusAtCreation: "intermediate", schemaVersion: 1 };
  return { workouts, sleepNights, foodEntries, dayFlags: {}, weighIns, expenditure, goal, unit: "kg" };
}

const bench = (i: StuckLiftInputs) => stuckLifts(i, now).find((s) => /bench/i.test(s.name)) ?? null;
const squat = (i: StuckLiftInputs) => stuckLifts(i, now).find((s) => /squat/i.test(s.name)) ?? null;

describe("the stuck lift, and what changed (IN4)", () => {
  it("a bench that stopped rising seven weeks ago, while chest sets fell, is flat with that change named", () => {
    const p = person(1, { bench: riseThenFlat(1, 9), chestExtra: { before: 3, after: 1, fromWeek: 9 } });
    const s = bench(p);
    expect(s).toMatchObject({ state: "flat" });
    expect(s!.sessions).toBeGreaterThanOrEqual(6);
    const sets = s!.changes!.find((c) => c.kind === "sets");
    expect(sets).toMatchObject({ kind: "sets", muscle: "Chest" });
    if (sets?.kind === "sets") expect(sets.during).toBeLessThan(sets.before);
    expect(squat(p)).toBeNull();
  });

  it("a squat dropping while sleep fell is dropping, with the sleep named", () => {
    const p = person(2, { squat: riseThenDrop(0.5, -1.5, 9), sleep: { before: 7.8, after: 6.1, fromWeek: 9 } });
    const s = squat(p);
    expect(s?.state).toBe("dropping");
    expect(s!.changeKg).toBeLessThan(0);
    expect(s!.changes!.some((c) => c.kind === "sleep")).toBe(true);
  });

  it("flat with nothing changed says what was checked", () => {
    const p = person(3, { bench: riseThenFlat(1, 6) });
    const s = bench(p);
    expect(s?.state).toBe("flat");
    expect(s!.changes).toEqual([]);
    expect(stuckChangesLine(s!)).toMatch(/^Sets, sessions, sleep and food held steady since \d+ [A-Z][a-z]{2}$/);
  });

  it("with under four weeks of history before its best, nothing is compared rather than a wrong change", () => {
    const p = person(7, { bench: () => 0 });
    // A flat bench from the first session: its best is in the first week, with no history before it.
    const s = bench(p);
    expect(s?.state).toBe("flat");
    expect(s!.changes).toBeNull();
    expect(stuckChangesLine(s!)).toMatch(/^Since \d+\u00a0[A-Z][a-z]{2}, the start of its history$/);
  });

  it("a deeper deficit is named, and a switch from a surplus keeps its signs", () => {
    const p = person(4, { bench: riseThenFlat(1, 6), balance: { before: -250, after: -650, fromWeek: 6 } });
    const s = bench(p)!;
    expect(s.changes?.some((c) => c.kind === "balance")).toBe(true);
    expect(stuckChangesLine(s)).toMatch(/deficit \d{3} → 6\d0 kcal a day/);
    const sw = { ...s, changes: [{ kind: "balance" as const, beforeKcal: 200, duringKcal: -300 }] };
    expect(stuckChangesLine(sw)).toMatch(/\+200 → −300 kcal a day against maintenance$/);
  });

  it("on a cut, holding is the aim: flat is not flagged, dropping is", () => {
    expect(bench(person(5, { bench: riseThenFlat(1, 6), goal: "lose" }))).toBeNull();
    expect(squat(person(6, { squat: riseThenDrop(0.5, -1.5, 9), goal: "lose" }))?.state).toBe("dropping");
  });

  it("words: the fact, the level in kg, before → after, never a cause or advice", () => {
    const p = person(1, { bench: riseThenFlat(1, 9), chestExtra: { before: 3, after: 1, fromWeek: 9 }, sleep: { before: 7.8, after: 6.4, fromWeek: 9 } });
    const s = bench(p)!;
    expect(stuckTitle(s)).toMatch(/^Bench Press: flat for \d+ sessions$/);
    expect(stuckValue(s, "kg")).toMatch(/^\d+ kg$/);
    expect(stuckChangesLine(s)).toMatch(/^Since \d+ [A-Z][a-z]{2}: .*chest sets \d+ → \d+ a week/);
    expect(stuckChangesLine(s)).toMatch(/sleep \dh \d+m → \dh \d+m/);
    const d = squat(person(2, { squat: riseThenDrop(0.5, -1.5, 9) }))!;
    expect(stuckTitle(d)).toMatch(/^Squat: down \d+(\.5)? kg in \d+ sessions$/);
    for (const t of [stuckTitle(s), stuckChangesLine(s), stuckTitle(d), stuckChangesLine(d)]) {
      expect(bannedPhrasesIn(t)).toEqual([]);
      expect(t).not.toMatch(/because|caused|should|try|aim|you need|muscle loss/i);
    }
  });

  // ── The study ──

  it("study: rising lifts are rarely called stuck; flat and dropping lifts are caught as their data allows", () => {
    let risingFlagged = 0;
    let flatCaught = 0;
    let dropCaught = 0;
    let flat10Caught = 0;
    const N = 30;
    for (let seed = 1; seed <= N; seed++) {
      if (bench(person(100 + seed, { bench: rising(0.5), noisePct: 2.5 }))) risingFlagged++;
      if (bench(person(200 + seed, { bench: riseThenFlat(1, 9), noisePct: 2.5 }))?.state === "flat") flatCaught++;
      if (squat(person(300 + seed, { squat: riseThenDrop(0.5, -1, 10), noisePct: 2.5 }))?.state === "dropping") dropCaught++;
      if (bench(person(400 + seed, { bench: riseThenFlat(1, 6), noisePct: 2.5 }))?.state === "flat") flat10Caught++;
    }
    console.info(`stuck-lift study (30 each, 2.5% session noise): rising +0.5%/wk flagged ${risingFlagged}; flat 7 weeks caught ${flatCaught}; flat 10 weeks caught ${flat10Caught}; dropping 1%/wk for 6 weeks caught ${dropCaught}`);
    // With 2.5% session noise, seven weeks of flat can't always be told from a 0.5% a week rise; silence there is the point. Ten weeks can.
    expect(risingFlagged / N).toBeLessThanOrEqual(0.1);
    expect(flatCaught / N).toBeGreaterThanOrEqual(0.5);
    expect(flat10Caught / N).toBeGreaterThanOrEqual(0.8);
    expect(dropCaught / N).toBeGreaterThanOrEqual(0.7);
  });
});
