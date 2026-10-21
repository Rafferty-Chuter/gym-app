import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { goalEta } from "@/lib/physique/goalEta";
import { goalProgress } from "@/lib/physique/goalProgress";
import { phasePlan } from "@/lib/physique/phasePlan";
import { buildWeekReport, reportWeekStart } from "@/lib/physique/weekReport";
import { allFixes, buildWeeklyInsight, heading, MAX_FIXES, type InsightInputs } from "@/lib/physique/weeklyInsight";
import type { JudgeInputs } from "@/lib/physique/judge";
import type { DeloadRead } from "@/lib/training/deload";
import { analyse, inputsOf, NOW } from "@/lib/physique/__tests__/judgeHelpers";

const FLAT = [
  { name: "Squat", startE1rm: 150, profile: "linear" as const, changePct: 0, perWeek: 2, cv: 0.01 },
  { name: "Bench Press", startE1rm: 110, profile: "linear" as const, changePct: 0, perWeek: 2, cv: 0.01 },
];
const NONE: DeloadRead = { state: "none", weeksAccumulated: 2, weeksUntilDue: 3 };
const fmt = { kg: (kg: number) => `${kg.toFixed(1)} kg`, date: (d: string) => d };

function scenario(over: Partial<Parameters<typeof makeScenario>[0]> = {}) {
  return makeScenario({ seed: 21, days: 63, preDays: 21, bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, targetKg: 78 }, waterStepKg: 0, lifts: FLAT, sleep: { meanH: 7.8, sdH: 0.2, source: "manual", loggedShare: 1 }, ...over });
}

/** Inputs for the last complete week, as the report page builds them. */
function inputs(sc: ReturnType<typeof scenario>, over: Partial<JudgeInputs> = {}, extra: Partial<InsightInputs> = {}): InsightInputs {
  const base = inputsOf(sc, over);
  const now = NOW(sc.today);
  const analysis = analyse(sc, over);
  const exp = computeExpenditure({ profile: base.profile, weighIns: base.weighIns, foodEntries: base.foodEntries, dayFlags: base.dayFlags, goals: base.goals }, now);
  const report = buildWeekReport(
    { weighIns: base.weighIns, foodEntries: base.foodEntries, dayFlags: base.dayFlags, sleepNights: base.sleepNights, workouts: base.workouts, program: base.program, goal: base.goal, weightUnit: "kg", expenditure: exp?.series ?? null },
    addDays(reportWeekStart(sc.today), -7),
    now
  );
  const eta = goalEta(base.goal ?? null, base.weighIns, base.dayFlags, sc.today);
  const plan = phasePlan(base.goal ?? null, goalProgress(base.goal ?? null, base.weighIns, sc.today), eta, sc.today);
  return { report, analysis, goal: base.goal ?? null, eta, plan, deload: NONE, recovery: null, plannedSessions: 2, today: sc.today, fmt, ...extra };
}

describe("weekly insight (W3)", () => {
  it("a cut on its way: the heading dates the target at the current rate, with no plan narrative (Z3)", () => {
    const i = inputs(scenario());
    const h = heading(i);
    expect(h.title).toMatch(/^78\.0 kg around \d{4}-\d{2}-\d{2}$/);
    expect(h.lines[0]).toMatch(/^At −\d\.\d+ %\/wk\. \d+\.\d kg to go\.$/);
    expect(h.lines.some((l) => /maintenance|then/.test(l))).toBe(false);
    expect(h.lines.at(-1)).toMatch(/^Lifts holding since your goal started on \d{4}-\d{2}-\d{2}\.$/);
    expect(i.analysis.strength.status).toBe("holding");
  });

  it("eating under target is a fix with the size of the gap and one action", () => {
    const sc = scenario({ intakeOffsetKcal: -500 });
    const fixes = allFixes(inputs(sc));
    const intake = fixes.find((f) => f.id === "intake")!;
    expect(intake.title).toBe("Eat closer to target");
    expect(intake.why).toMatch(/^Averaged \d{3} kcal under the [\d,]+ kcal target on logged days\.$/);
    expect(intake.action).toMatch(/^About \d{3} kcal more a day\.$/);
    expect(intake.state).toBe("attention");
  });

  it("missed days come first as one gaps fix pointing at the first missing day", () => {
    const sc = scenario();
    const i0 = inputs(sc);
    const start = i0.report.start;
    const drop = new Set([addDays(start, 1), addDays(start, 3), addDays(start, 4)]);
    const foodEntries = sc.foodEntries.filter((f) => !drop.has(f.date));
    const fixes = allFixes(inputs(sc, { foodEntries }));
    expect(fixes[0].id).toBe("gaps");
    expect(fixes[0].why).toBe("3 days with no food this week. The estimates lean on most days being logged.");
    expect(fixes[0].href).toBe(`/food?date=${addDays(start, 1)}`);
  });

  it("a safety verdict is the only fix", () => {
    const i = inputs(scenario());
    const analysis = { ...i.analysis, verdict: { ...i.analysis.verdict, id: "SAFE-2" as const, title: "Pause the cut", detail: "Detail." } };
    const fixes = allFixes({ ...i, analysis, deload: { state: "due", reason: "scheduled", weeksAccumulated: 6, liftsDown: 0, liftsCompared: 0 } });
    expect(fixes.map((f) => f.id)).toEqual(["safety"]);
    expect(heading({ ...i, analysis })).toEqual({ state: "attention", title: "Goal on hold", lines: ["Targets stay where they are. The note on Progress says why."] });
    expect(buildWeeklyInsight({ ...i, analysis }).goingWell).toEqual([]);
  });

  it("a trend that has stopped reads flat, not moving away; well off the plan's date reads watch", () => {
    const i = inputs(scenario());
    const eta = { ...i.eta!, basis: "observed" as const, date: null, reason: "away" as const, ratePctPerWeek: 0.03 };
    expect(heading({ ...i, eta }).title).toBe("Weight is flat");
    expect(heading({ ...i, eta: { ...eta, ratePctPerWeek: 0.3 } }).title).toBe("Moving away from the target");
    expect(heading({ ...i, eta: { ...i.eta!, daysVsPlan: -40 } }).state).toBe("watch");
    expect(heading({ ...i, eta: { ...i.eta!, daysVsPlan: 2 } }).state).toBe("good");
  });

  it("short sleep and a due deload become fixes; at most three show and the rest are counted", () => {
    const sc = scenario({ sleep: { meanH: 6.4, sdH: 0.2, source: "manual", loggedShare: 1 }, intakeOffsetKcal: -500 });
    const i = inputs(sc, {}, { deload: { state: "due", reason: "scheduled", weeksAccumulated: 6, liftsDown: 0, liftsCompared: 0 }, plannedSessions: 4 });
    const all = allFixes(i);
    expect(all.map((f) => f.id)).toEqual(expect.arrayContaining(["intake", "sleep", "sessions", "deload"]));
    const sleep = all.find((f) => f.id === "sleep")!;
    expect(sleep.why).toMatch(/^6h \d\dm a night, under the 7 hours adults need, \d short nights?\.$/);
    const out = buildWeeklyInsight(i);
    expect(out.fixes).toHaveLength(MAX_FIXES);
    expect(out.more).toBe(all.length - MAX_FIXES);
    expect(out.fixes[0].id).toBe("intake");
    expect(all.find((f) => f.id === "deload")!.why).toBe("6 weeks of training since the last one.");
    const withoutDeload = buildWeeklyInsight({ ...i, exclude: ["deload"] });
    expect([...withoutDeload.fixes.map((f) => f.id)]).not.toContain("deload");
    expect(withoutDeload.more).toBe(all.length - 1 - MAX_FIXES);
  });

  it("a clean week has nothing to fix and says what went to plan", () => {
    const sc = scenario();
    const i = inputs(sc);
    const fixes = allFixes(i).filter((f) => f.id !== "intake" && f.id !== "protein");
    expect(fixes).toEqual([]);
    expect(buildWeeklyInsight(i).goingWell).toEqual(expect.arrayContaining(["weighed in 7 of 7 days", "sleep at your usual", "every session done"]));
  });

  it("no goal: the heading says so; old weeks carry no heading", () => {
    const sc = makeScenario({ seed: 91, days: 40, bodyweightKg: 85, trueTdeeKcal: 2800, goal: null, sleep: { meanH: 7.5, sdH: 0.3, source: "manual", loggedShare: 1 } });
    const i = inputs(sc as ReturnType<typeof scenario>);
    expect(heading(i).title).toBe("No goal set");
    const old = buildWeeklyInsight({ ...i, report: { ...i.report, end: addDays(sc.today, -20) } });
    expect(old.heading).toBeNull();
  });
});
