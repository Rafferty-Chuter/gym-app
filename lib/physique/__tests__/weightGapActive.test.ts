import { describe, expect, it } from "vitest";
import { addDays, type LocalDate } from "@/lib/dates";
import { weightGap, type WeightGapInputs } from "@/lib/physique/weightGap";
import { weightGapLines, weightGapShort } from "@/lib/physique/weightGapWords";
import { bannedPhrasesIn } from "@/lib/physique/copy";
import type { DailySteps, DailyVitals, ExpenditurePoint, FoodEntry, HealthWorkout } from "@/lib/physique/types";

const THROUGH = "2026-10-18";
const FROM = addDays(THROUGH, -27);
const GOAL_START = "2026-07-06";
const kgFmt = (x: number) => `${x.toFixed(1)} kg`;

type Person = {
  /** Active energy a day in the window's first half and its second; absent means none recorded. */
  activeFrom?: number;
  activeTo?: number;
  activeAtStart?: number;
  stepsFrom?: number;
  stepsTo?: number;
  /** Runs a week in each half of the window. */
  runsFrom?: number;
  runsTo?: number;
  maintAtStart?: number;
  maintNow?: number;
};

const run = (start: string): HealthWorkout => ({ activity: "run", name: "running", start, durationMin: 40, activeKcal: 420 });

/** IN3's made-up cut, with Apple Health day records added (IN8). */
function inputs(p: Person): WeightGapInputs {
  const steps: DailySteps[] = [];
  const vitals: DailyVitals[] = [];
  const foodEntries: FoodEntry[] = [];
  const expenditure: ExpenditurePoint[] = [];
  const total = 1 + (Date.parse(THROUGH) - Date.parse(GOAL_START)) / 86_400_000;
  for (let k = 0; k < total; k++) {
    const date: LocalDate = addDays(GOAL_START, k);
    const inWindow = date >= FROM;
    const late = inWindow && (Date.parse(date) - Date.parse(FROM)) / (27 * 86_400_000) >= 0.5;
    const s = inWindow ? (late ? (p.stepsTo ?? 9000) : (p.stepsFrom ?? 9000)) : (p.stepsFrom ?? 9000);
    steps.push({ id: `s${k}`, date, loggedAt: `${date}T23:00:00.000Z`, source: "healthkit", schemaVersion: 1, steps: s });
    const a = inWindow ? (late ? p.activeTo : p.activeFrom) : (p.activeAtStart ?? p.activeFrom);
    // Runs on Monday, Wednesday and Friday, as many a week as asked.
    const weekdayRun = [1, 3, 5].slice(0, inWindow ? (late ? (p.runsTo ?? 0) : (p.runsFrom ?? 0)) : 0);
    const workouts = weekdayRun.includes(new Date(`${date}T12:00:00Z`).getUTCDay()) ? [run("07:00")] : undefined;
    if (a != null || workouts) vitals.push({ id: `hk-v-${date}`, date, loggedAt: `${date}T23:00:00.000Z`, source: "healthkit", schemaVersion: 1, ...(a != null ? { activeKcal: a } : {}), ...(workouts ? { workouts } : {}) });
    foodEntries.push({ id: `f${k}`, date, loggedAt: `${date}T20:00:00.000Z`, source: "manual", schemaVersion: 1, label: "Day", kcal: 2300, proteinG: 170, carbsG: 220, fatG: 70, method: "quick" });
    const m = (p.maintAtStart ?? 2800) + (k / (total - 1)) * ((p.maintNow ?? 2800) - (p.maintAtStart ?? 2800));
    expenditure.push({ date, tdee: Math.round(m), state: "updating", trendKg: null } as ExpenditurePoint);
  }
  const before: ExpenditurePoint[] = Array.from({ length: 35 }, (_, k) => ({ date: addDays(GOAL_START, k - 35), tdee: p.maintAtStart ?? 2800, state: "updating", trendKg: null }) as ExpenditurePoint);
  return { foodEntries, dayFlags: {}, steps, vitals, expenditure: [...before, ...expenditure], goalStart: GOAL_START, from: FROM, through: THROUGH, today: addDays(THROUGH, 4), bodyKg: 85, expectedKgWk: -0.45, actualKgWk: -0.15 };
}

describe("active energy explains a stall (IN8)", () => {
  it("names active energy falling, sized, with the runs and steps that fell with it", () => {
    const r = weightGap(inputs({ activeFrom: 650, activeTo: 400, stepsFrom: 11000, stepsTo: 7000, runsFrom: 3, runsTo: 1 }));
    const active = r.scale?.causes.find((c) => c.kind === "active");
    expect(active).toBeDefined();
    if (active?.kind !== "active") return;
    expect(active).toMatchObject({ fromKcal: 650, toKcal: 400, kcalPerDay: 250, steps: { from: 11000, to: 7000 }, workouts: { activity: "run", fromPerWeek: 3, toPerWeek: 1 } });
    // 250 kcal a day, half of it showing in the window: about 0.11 kg a week.
    expect(active.kgPerWeek).toBeCloseTo((0.5 * 250 * 7) / 7700, 2);
    // Active energy holds the steps, so they are not sized twice.
    expect(r.scale!.causes.some((c) => c.kind === "steps")).toBe(false);
    const lines = weightGapLines(r, kgFmt, "last 4 weeks");
    expect(lines[1]).toBe("Active energy fell from 650 to 400 kcal a day over the last 4 weeks, about 0.1 kg a week of it (runs 3 → 1 a week, steps 11,000 → 7,000 a day).");
    expect(bannedPhrasesIn(lines.join(" "))).toEqual([]);
  });

  it("with active energy unchanged, steps that fell are not named: the watch saw no less movement", () => {
    const r = weightGap(inputs({ activeFrom: 500, activeTo: 480, stepsFrom: 11000, stepsTo: 6000 }));
    expect(r.scale?.causes.some((c) => c.kind === "steps" || c.kind === "active")).toBe(false);
  });

  it("falls back to steps when active energy covers too few days", () => {
    const p = inputs({ stepsFrom: 11000, stepsTo: 6000 });
    const sparse = { ...p, vitals: [{ id: "v", date: THROUGH, loggedAt: "", source: "healthkit" as const, schemaVersion: 1 as const, activeKcal: 300 }] };
    expect(weightGap(sparse).scale?.causes.some((c) => c.kind === "steps")).toBe(true);
  });

  it("only counts the way the gap points: more active energy doesn't explain losing slower", () => {
    const r = weightGap(inputs({ activeFrom: 400, activeTo: 650 }));
    expect(r.scale?.causes.some((c) => c.kind === "active")).toBe(false);
  });

  it("since the goal began, active energy is said in place of steps, and leads the line under the goal card", () => {
    const r = weightGap(inputs({ activeAtStart: 700, activeFrom: 420, activeTo: 420, stepsFrom: 9000, maintAtStart: 2800, maintNow: 2550 }));
    expect(r.sinceStart).toMatchObject({ activeFrom: 700, activeTo: 420 });
    expect(weightGapLines(r, kgFmt, "last 4 weeks").at(-1)).toBe("Maintenance has gone from about 2,800 to 2,550 kcal since 6 Jul; active energy fell from 700 to 420 kcal a day in that time.");
    expect(weightGapShort(r)).toBe("Active energy 700 → 420 kcal a day since 6 Jul");
  });

  it("the short line names the window's cause, with the workouts behind it", () => {
    const r = weightGap(inputs({ activeFrom: 650, activeTo: 400, runsFrom: 3, runsTo: 1 }));
    expect(weightGapShort(r)).toBe("Active energy 650 → 400 kcal a day · runs 3 → 1 a week");
  });

  it("without Apple Health day records, IN3's read is unchanged", () => {
    const withSteps = inputs({ stepsFrom: 11000, stepsTo: 6000 });
    const none = { ...withSteps, vitals: undefined };
    const empty = { ...withSteps, vitals: [] };
    expect(weightGap(empty)).toEqual(weightGap(none));
    expect(weightGap(none).scale?.causes[0]?.kind).toBe("steps");
  });
});
