import { describe, expect, it } from "vitest";
import { addDays, weekday } from "@/lib/dates";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { makeScenario } from "@/lib/physique/fixtures";
import { targetInEffect } from "@/lib/physique/intake";
import { checkInProgram, goalChangedSince, newProgram, refreshProgram, trendWeightOn, type ProgramInputs } from "@/lib/physique/program";
import { CALORIE_FLOOR, macros, UNSMOOTHED_DAYS_AFTER_START, weeklyTarget } from "@/lib/physique/targets";
import { latestTrend } from "@/lib/physique/weight";
import type { PhysiqueProgram, ProgramEntry } from "@/lib/physique/types";

function scenario(days: number, seed = 5, over: Partial<Parameters<typeof makeScenario>[0]> = {}) {
  const sc = makeScenario({ seed, days, bodyweightKg: 85, trueTdeeKcal: 2800, intake: { meanKcal: 2300 }, goal: { ratePctPerWeek: -0.6 }, ...over });
  const inputs: ProgramInputs = { profile: sc.profile, weighIns: sc.weighIns, foodEntries: sc.foodEntries, dayFlags: sc.dayFlags, goals: [sc.goal!] };
  return { sc, inputs, now: { today: sc.today, tz: "UTC" } };
}

describe("newProgram (02 §5.3)", () => {
  it("is unsmoothed, sourced goal_start, and built from today's expenditure and trend weight", () => {
    const { sc, inputs, now } = scenario(35);
    const u = newProgram(sc.goal!, inputs, now)!;
    const exp = computeExpenditure(inputs, now)!;
    const tdee = exp.series[exp.series.length - 1].tdee;
    const trendKg = latestTrend(sc.weighIns)!.trendKg;
    expect(u.tdee).toBe(tdee);
    expect(u.trendKg).toBeCloseTo(trendKg, 9);
    const expected = weeklyTarget({ tdee, trendKg, goal: sc.goal!, prevTargetKcal: null, unsmoothed: true, sex: "M" });
    expect(u.entry.kcal).toBe(expected.kcal);
    expect(u.entry).toMatchObject({ startDate: sc.today, source: "goal_start", tdeeAtAccept: tdee, acceptedAt: `${sc.today}T00:00:00.000Z` });
    expect(u.entry).toMatchObject(macros({ kcal: expected.kcal, trendKg, heightCm: 180, sex: "M", phase: "lose", proteinLevel: "moderate", dietType: "balanced" }));
    expect(u.program).toMatchObject({ id: `program-${sc.goal!.id}`, goalId: sc.goal!.id, schemaVersion: 1 });
    expect(u.program.history).toEqual([u.entry]);
    expect(u.from).toBeNull();
    expect(u.target.capped).toBe(false);
    const custom = newProgram(sc.goal!, inputs, now, { acceptedAt: "2026-09-04T08:15:00.000Z", id: "custom" })!;
    expect(custom.entry.acceptedAt).toBe("2026-09-04T08:15:00.000Z");
    expect(custom.program.id).toBe("custom");
  });

  it("with no data yet it uses the seed and the goal's start trend; without a seed it is null", () => {
    const { sc } = scenario(1);
    const empty: ProgramInputs = { profile: sc.profile, weighIns: [], foodEntries: [], dayFlags: {}, goals: [sc.goal!] };
    const u = newProgram(sc.goal!, empty, { today: sc.startDate, tz: "UTC" })!;
    expect(u.trendKg).toBe(85);
    expect(u.tdee).toBeGreaterThan(1500);
    expect(trendWeightOn(empty, sc.goal!, sc.startDate)).toBe(85);
    const noHeight: ProgramInputs = { ...empty, profile: { ...sc.profile, heightCm: undefined, expenditureSeed: undefined } };
    expect(newProgram(sc.goal!, noHeight, { today: sc.startDate, tz: "UTC" })).toBeNull();
  });
});

describe("checkInProgram and refreshProgram (02 §5.3, §0.3b)", () => {
  /** Append a check-in entry starting on `startDate`, moving the existing entries 14 days earlier so it is the one in effect. */
  function withEntry(program: PhysiqueProgram, kcal: number, startDate: string): PhysiqueProgram {
    const earlier = program.history.map((e) => ({ ...e, startDate: addDays(e.startDate, -14) }));
    const e: ProgramEntry = { ...program.history[0], kcal, startDate, source: "check_in" };
    return { ...program, history: [...earlier, e] };
  }

  it("caps the weekly step at max(100, 5% of tdee) once 28 days have passed, and reports the raw target", () => {
    const { sc, inputs, now } = scenario(42);
    const base = newProgram(sc.goal!, inputs, now)!;
    const far = withEntry(base.program, base.entry.kcal + 500, addDays(sc.today, -7));
    const u = checkInProgram(far, sc.goal!, inputs, now)!;
    expect(u.from!.kcal).toBe(base.entry.kcal + 500);
    expect(u.target.cap).toBe(Math.max(100, 0.05 * u.tdee));
    expect(u.target.capped).toBe(true);
    expect(u.entry.kcal).toBe(Math.round(base.entry.kcal + 500 - u.target.cap!));
    expect(u.target.raw).toBeCloseTo(base.target.raw, 6);
    expect(u.entry.source).toBe("check_in");
    expect(u.program.history).toHaveLength(3);
    expect(targetInEffect(u.program, sc.today)).toEqual(u.entry);
    expect(u.program.history.map((e) => e.source)).toEqual(["goal_start", "check_in", "check_in"]);
  });

  it("is unsmoothed inside the first 28 days, after a goal change, or on a refresh", () => {
    const short = scenario(UNSMOOTHED_DAYS_AFTER_START - 1);
    const b1 = newProgram(short.sc.goal!, short.inputs, short.now)!;
    const far1 = withEntry(b1.program, b1.entry.kcal + 500, addDays(short.sc.today, -7));
    expect(checkInProgram(far1, short.sc.goal!, short.inputs, short.now)!.entry.kcal).toBe(b1.entry.kcal);

    const { sc, inputs, now } = scenario(42);
    const b2 = newProgram(sc.goal!, inputs, now)!;
    const far2 = withEntry(b2.program, b2.entry.kcal + 500, addDays(sc.today, -7));
    const changed = { ...sc.goal!, rateHistory: [{ date: addDays(sc.today, -3), fromPctPerWeek: -1.0, toPctPerWeek: -0.6, reason: "user" as const }] };
    expect(goalChangedSince(changed, far2, addDays(sc.today, -7))).toBe(true);
    expect(goalChangedSince(sc.goal!, far2, addDays(sc.today, -7))).toBe(false);
    expect(checkInProgram(far2, changed, inputs, now)!.entry.kcal).toBe(b2.entry.kcal);
    expect(checkInProgram(far2, { ...sc.goal!, id: "other" }, inputs, now)!.entry.kcal).toBe(b2.entry.kcal);

    const r = refreshProgram(far2, sc.goal!, inputs, now)!;
    expect(r.entry.kcal).toBe(b2.entry.kcal);
    expect(r.entry.source).toBe("refresh");
    expect(r.target.capped).toBe(false);
    expect(refreshProgram(far2, sc.goal!, inputs, now, { source: "apply_now" })!.entry.source).toBe("apply_now");
  });

  it("never goes under the calorie floor", () => {
    const { sc, inputs, now } = scenario(35, 5, { bodyweightKg: 55, goal: { ratePctPerWeek: -1.0 }, profile: { sex: "F", heightCm: 160, manualInitialTdee: 1700 } });
    const u = newProgram(sc.goal!, inputs, now)!;
    expect(u.entry.kcal).toBeGreaterThanOrEqual(CALORIE_FLOOR.F);
    expect(u.target.floorBound).toBe(u.target.raw < CALORIE_FLOOR.F);
  });
});

describe("closed-loop scenario (02 §8.4 `toTarget`)", () => {
  it("builds the program at goal start, revises it weekly, and the intake follows the target in effect", () => {
    const sc = makeScenario({ seed: 21, days: 63, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 } });
    expect(sc.program).not.toBeNull();
    const history = sc.program!.history;
    expect(history[0]).toMatchObject({ source: "goal_start", startDate: sc.goal!.startDate });
    const checkInDays = Array.from({ length: 63 - 22 }, (_, i) => addDays(sc.goal!.startDate, i + 1)).filter((d) => weekday(d) === sc.profile.checkInWeekday);
    expect(history.slice(1).map((e) => e.startDate)).toEqual(checkInDays);
    expect(history.slice(1).every((e) => e.source === "check_in")).toBe(true);
    for (const e of history) expect(e.tdeeAtAccept).toBeGreaterThan(1500);

    // Intake tracks the target in effect, with N(0, 350) noise.
    const diffs: number[] = [];
    for (let d = 21; d < 63; d++) {
      const date = addDays(sc.startDate, d);
      const target = targetInEffect(sc.program, date)!;
      diffs.push(sc.intakeKcal[d] - target.kcal);
      expect(sc.foodEntries.find((f) => f.date === date)!.kcal).toBe(sc.intakeKcal[d]);
    }
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    expect(Math.abs(meanDiff)).toBeLessThan(150);
    // Before the goal the intake sits at maintenance.
    const pre = sc.intakeKcal.slice(0, 21).reduce((a, b) => a + b, 0) / 21;
    expect(Math.abs(pre - 2800)).toBeLessThan(250);
    // The true weight falls once the cut starts (energy balance plus the water step).
    expect(sc.trueKg[62]).toBeLessThan(sc.trueKg[20] - 1.5);
    // Fixed-mean mode builds no program; its output is unchanged from P2 (checked against the old generator).
    const fixed = makeScenario({ seed: 21, days: 63, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: { meanKcal: 2800 }, goal: { ratePctPerWeek: -0.6 } });
    expect(fixed.program).toBeNull();
    // The intake noise has its own stream: with the weight path driven by the goal rate (no true TDEE),
    // changing the intake noise leaves every weigh-in untouched.
    const a = makeScenario({ seed: 21, days: 63, preDays: 21, bodyweightKg: 85, intake: "toTarget", intakeSdKcal: 0, goal: { ratePctPerWeek: -0.6 } });
    const b = makeScenario({ seed: 21, days: 63, preDays: 21, bodyweightKg: 85, intake: "toTarget", intakeSdKcal: 350, goal: { ratePctPerWeek: -0.6 } });
    expect(a.weighIns).toEqual(b.weighIns);
    expect(a.intakeKcal.slice(21)).not.toEqual(b.intakeKcal.slice(21));
    expect(a.program!.history.length).toBe(b.program!.history.length);
  });

  it("the engine's targets converge toward the true deficit over a 6-week cut", () => {
    // 10 seeds, 21 days of maintenance then 42 days of cut, seed TDEE from the profile (not the true value).
    let sumRate = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const sc = makeScenario({ seed, days: 63, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 } });
      const last = sc.program!.history[sc.program!.history.length - 1];
      const impliedRate = ((last.kcal - 2800) / 7716) * 7 / sc.trueKg[62] * 100;
      sumRate += impliedRate;
    }
    const meanImplied = sumRate / 10;
    expect(meanImplied).toBeLessThan(-0.3);
    expect(meanImplied).toBeGreaterThan(-1.0);
  });
});
