import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { applyCheckInAnswers, buildCheckInPlan, type CheckInInputs, type CheckInModule } from "@/lib/physique/checkIn";
import type { FoodEntry } from "@/lib/physique/types";
import { analyse, inputsOf, NOW } from "@/lib/physique/__tests__/judgeHelpers";

function scenario(over: Partial<Parameters<typeof makeScenario>[0]> = {}) {
  return makeScenario({ seed: 21, days: 63, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6 }, waterStepKg: 0, ...over });
}

function planFor(sc: ReturnType<typeof scenario>, over: Partial<CheckInInputs> = {}, today = sc.today) {
  const base = inputsOf(sc, over);
  const analysis = analyse(sc, over, today);
  const inputs: CheckInInputs = { ...base, goals: base.goals, analysis, goal: base.goal, program: base.program, waist: base.waist, ...over };
  return buildCheckInPlan(inputs, NOW(today));
}

const kinds = (modules: CheckInModule[]) => modules.map((m) => m.kind);

describe("buildCheckInPlan (02 §9)", () => {
  it("a clean week: waist prompt, program update, then the verdict, in that order", () => {
    const sc = scenario();
    const plan = planFor(sc);
    expect(kinds(plan.modules)).toEqual(["waist", "program_update", "verdict"]);
    expect(plan.fastAvailable).toBe(true);
    expect(plan.weekStart <= plan.today).toBe(true);
    const update = plan.modules.find((m) => m.kind === "program_update")!;
    expect(update.kind === "program_update" && update.from).not.toBeNull();
    expect(update.kind === "program_update" && update.to.kcal).toBeGreaterThan(1500);
    const verdict = plan.modules[plan.modules.length - 1];
    expect(verdict.kind).toBe("verdict");
  });

  it("asks about partial days, a missing weigh-in, unlogged days and a water event, in MacroFactor's order", () => {
    const sc = scenario({ events: [{ day: 58, event: { type: "travel" } }] });
    const partialDate = addDays(sc.today, -2);
    const unloggedDate = addDays(sc.today, -4);
    const foodEntries: FoodEntry[] = sc.foodEntries.filter((f) => f.date !== unloggedDate).map((f) => (f.date === partialDate ? { ...f, kcal: 600 } : f));
    const weighIns = sc.weighIns.filter((w) => w.date < addDays(sc.today, -3));
    const plan = planFor(sc, { foodEntries, weighIns });
    expect(kinds(plan.modules)).toEqual(["partial_days", "weigh_in", "unlogged_days", "water_event", "waist", "program_update", "verdict"]);
    const partial = plan.modules[0];
    expect(partial.kind === "partial_days" && partial.days).toEqual([{ date: partialDate, kcal: 600 }]);
    const weigh = plan.modules[1];
    expect(weigh.kind === "weigh_in" && weigh.lastWeighInDate).toBe(addDays(sc.today, -4));
    const unlogged = plan.modules[2];
    expect(unlogged.kind === "unlogged_days" && unlogged.dates).toEqual([unloggedDate]);
    const water = plan.modules[3];
    expect(water.kind === "water_event" && water.events).toEqual([{ date: addDays(sc.startDate, 58), type: "travel" }]);
  });

  it("explains a logging break while holding, and skips the waist prompt after a recent entry", () => {
    const sc = scenario({ waist: { startCm: 85, changeCm: -1 } });
    const foodEntries = sc.foodEntries.filter((f) => f.date < addDays(sc.today, -9));
    const plan = planFor(sc, { foodEntries });
    expect(kinds(plan.modules)).toContain("logging_break");
    expect(kinds(plan.modules)).not.toContain("waist");
    const brk = plan.modules.find((m) => m.kind === "logging_break")!;
    expect(brk.kind === "logging_break" && brk.foodDaysNeeded).toBe(3);
  });

  it("without a program there is no update and no fast check-in", () => {
    const sc = scenario();
    const plan = planFor(sc, { program: null });
    expect(kinds(plan.modules)).not.toContain("program_update");
    expect(plan.fastAvailable).toBe(false);
  });
});

describe("applyCheckInAnswers", () => {
  const ctx = (sc: ReturnType<typeof scenario>) => {
    let n = 0;
    return { now: NOW(sc.today), nowIso: `${sc.today}T08:00:00.000Z`, newId: () => `id-${++n}`, dayFlags: sc.dayFlags };
  };

  it("turns answers into DayFlags and a WaistEntry, and accepts the program", () => {
    const sc = scenario();
    const partialDate = addDays(sc.today, -2);
    const dismissDate = addDays(sc.today, -5);
    const fastDate = addDays(sc.today, -4);
    const plan = planFor(sc);
    const r = applyCheckInAnswers(
      plan,
      { partialDays: { [partialDate]: "partial", [dismissDate]: "full" }, unloggedDays: { [fastDate]: "fasting", [addDays(sc.today, -6)]: "skip" }, waistCm: 84.26, acceptProgram: true },
      ctx(sc)
    );
    expect(r.dayFlags).toContainEqual({ date: partialDate, status: "partial" });
    expect(r.dayFlags).toContainEqual({ date: dismissDate, partialDismissed: true });
    expect(r.dayFlags).toContainEqual({ date: fastDate, status: "fasting" });
    expect(r.dayFlags).toHaveLength(3);
    expect(r.waist).toMatchObject({ date: sc.today, cm: 84.3, source: "manual", schemaVersion: 1 });
    expect(r.program).not.toBeNull();
    expect(r.program!.history.length).toBe(sc.program!.history.length + 1);
    expect(r.checkIn).toMatchObject({ date: sc.today, weekStart: plan.weekStart, accepted: true, fast: false });
    expect(r.checkIn.id).not.toBe(r.waist!.id);
  });

  it("declining keeps the current program; a water-event skip keeps it too", () => {
    const sc = scenario();
    const plan = planFor(sc);
    const declined = applyCheckInAnswers(plan, { acceptProgram: false }, ctx(sc));
    expect(declined.program).toBeNull();
    expect(declined.checkIn.accepted).toBe(false);
    expect(declined.dayFlags).toEqual([]);
    expect(declined.waist).toBeNull();
    const skipped = applyCheckInAnswers(plan, { acceptProgram: true, skipUpdate: true }, ctx(sc));
    expect(skipped.program).toBeNull();
  });

  it("a fast check-in accepts the update and ignores every question", () => {
    const sc = scenario();
    const plan = planFor(sc);
    const r = applyCheckInAnswers(plan, { acceptProgram: false, fast: true, waistCm: 84, partialDays: { [addDays(sc.today, -2)]: "partial" } }, ctx(sc));
    expect(r.program).not.toBeNull();
    expect(r.dayFlags).toEqual([]);
    expect(r.waist).toBeNull();
    expect(r.checkIn).toMatchObject({ accepted: true, fast: true });
  });

  it("merges over existing flags instead of overwriting them", () => {
    const sc = scenario();
    const date = addDays(sc.today, -2);
    const plan = planFor(sc);
    const r = applyCheckInAnswers(plan, { partialDays: { [date]: "partial" }, acceptProgram: false }, { ...ctx(sc), dayFlags: { [date]: { date, note: "late dinner", events: [{ type: "travel" }] } } });
    expect(r.dayFlags[0]).toEqual({ date, note: "late dinner", events: [{ type: "travel" }], status: "partial" });
  });
});
