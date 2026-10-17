import { describe, expect, it } from "vitest";
import { addDays } from "@/lib/dates";
import { makeScenario } from "@/lib/physique/fixtures";
import { buildCheckInPlan, type CheckInInputs } from "@/lib/physique/checkIn";
import { computeExpenditure } from "@/lib/physique/expenditure";
import { buildReview, decide, nutritionRead, sleepRead, trainingRead, REVIEW_MIN_FOOD_DAYS, type ReviewInputs } from "@/lib/physique/review";
import { buildWeekReport, reportWeekStart } from "@/lib/physique/weekReport";
import type { JudgeInputs } from "@/lib/physique/judge";
import type { DeloadRead } from "@/lib/training/deload";
import { analyse, inputsOf, NOW } from "@/lib/physique/__tests__/judgeHelpers";

const FLAT_LIFTS = [
  { name: "Squat", startE1rm: 150, profile: "linear" as const, changePct: 0, perWeek: 2, cv: 0.01 },
  { name: "Bench Press", startE1rm: 110, profile: "linear" as const, changePct: 0, perWeek: 2, cv: 0.01 },
];

const NONE: DeloadRead = { state: "none", weeksAccumulated: 2, weeksUntilDue: 3 };
const DUE: DeloadRead = { state: "due", reason: "scheduled", weeksAccumulated: 5, liftsDown: 0, liftsCompared: 0 };

function scenario(over: Partial<Parameters<typeof makeScenario>[0]> = {}) {
  return makeScenario({
    seed: 21,
    days: 63,
    preDays: 21,
    bodyweightKg: 85,
    trueTdeeKcal: 2800,
    intake: "toTarget",
    goal: { ratePctPerWeek: -0.6 },
    waterStepKg: 0,
    lifts: FLAT_LIFTS,
    sleep: { meanH: 7.8, sdH: 0.2, source: "manual", loggedShare: 1 },
    ...over,
  });
}

/** The review's inputs as the io layer builds them: the plan for today, the report for the last complete week. */
function reviewInputs(sc: ReturnType<typeof scenario>, over: Partial<JudgeInputs> = {}, deload: DeloadRead = NONE): ReviewInputs {
  const base = inputsOf(sc, over);
  const analysis = analyse(sc, over);
  const now = NOW(sc.today);
  const checkIn: CheckInInputs = { ...base, goals: base.goals, analysis, goal: base.goal, program: base.program, waist: base.waist };
  const plan = buildCheckInPlan(checkIn, now);
  const exp = computeExpenditure({ profile: base.profile, weighIns: base.weighIns, foodEntries: base.foodEntries, dayFlags: base.dayFlags, goals: base.goals }, now);
  const report = buildWeekReport(
    {
      weighIns: base.weighIns,
      foodEntries: base.foodEntries,
      dayFlags: base.dayFlags,
      sleepNights: base.sleepNights,
      workouts: base.workouts,
      program: base.program,
      goal: base.goal,
      weightUnit: "kg",
      expenditure: exp?.series ?? null,
    },
    reportWeekStart(addDays(plan.weekStart, -1)),
    now
  );
  return { plan, report, analysis, deload, plannedSessions: 2 };
}

describe("review (G3)", () => {
  it("a clean cut week: three reads with states, the verdict, and one decision that updates targets", () => {
    const sc = scenario();
    const review = buildReview(reviewInputs(sc));
    expect(review.week.complete).toBe(true);
    expect(review.week.daysCovered).toBe(7);
    // Seeded, so the numbers are fixed: this week the closed loop ate under target, and the judge says so.
    expect(review.reads.nutrition).toEqual({ state: "watch", title: "267 kcal under target", detail: "1,680 of 1,947 kcal a day · 7 of 7 days logged · protein 1.6 g/kg" });
    expect(review.reads.training.title).toBe("2 of 2 sessions · 12 hard sets");
    expect(review.reads.training.detail).toBe("2 lifts: 1 down, 1 flat");
    expect(review.reads.sleep).toEqual({ state: "good", title: "7h 42m a night", detail: "goal 8h 00m · 7 nights · 2h 06m under over the week" });
    expect(review.verdict.title).toBe("Eat to target first");
    expect(review.verdict.recommendationLabel).toBe("Eat to target (about 220 kcal/day more)");
    expect(review.decision).toEqual({
      kind: "accept",
      title: "Update targets",
      lines: ["Targets 2,082 → 2,192 kcal · protein 160 g · fat 86 g · carbs 194 g"],
      changes: [{ kind: "targets", from: { kcal: 2082, proteinG: 160, fatG: 80, carbsG: 180 }, to: { kcal: 2192, proteinG: 160, fatG: 86, carbsG: 194 } }],
    });
  });

  it("a due deload joins the decision and the training read says so", () => {
    const sc = scenario();
    const review = buildReview(reviewInputs(sc, {}, DUE));
    expect(review.reads.training.state).toBe("watch");
    expect(review.reads.training.detail).toMatch(/^Deload due · 5 weeks since the last/);
    expect(review.decision.kind).toBe("accept");
    if (review.decision.kind !== "accept") return;
    expect(review.decision.title).toMatch(/start a deload$/);
    expect(review.decision.changes.some((c) => c.kind === "deload")).toBe(true);
    expect(review.decision.lines.some((l) => l.startsWith("Deload due"))).toBe(true);
  });

  it("a safety verdict holds: nothing is applied", () => {
    const sc = scenario();
    const inputs = reviewInputs(sc);
    const analysis = { ...inputs.analysis, verdict: { ...inputs.analysis.verdict, id: "SAFE-2" as const, title: "Pause the cut" } };
    const d = decide({ ...inputs, analysis, deload: DUE });
    expect(d.kind).toBe("hold");
    expect(d.title).toBe("Pause the cut");
  });

  it("a logging break holds the targets and says what to log", () => {
    const sc = scenario();
    const foodEntries = sc.foodEntries.filter((f) => f.date < addDays(sc.today, -9));
    const review = buildReview(reviewInputs(sc, { foodEntries }));
    expect(review.decision.kind).toBe("hold");
    expect(review.decision.title).toBe("Targets hold until logging resumes");
    expect(review.decision.lines[0]).toMatch(/^Log \d more days? of food/);
  });

  it("thin weeks read early: few food days, no nights, no sessions", () => {
    const sc = scenario({ sleep: { meanH: 7.8, sdH: 0.2, source: "manual", loggedShare: 0 }, lifts: [] });
    const inputs = reviewInputs(sc);
    const start = inputs.report.start;
    const keep = new Set([start, addDays(start, 1), addDays(start, 2)]);
    const foodEntries = sc.foodEntries.filter((f) => f.date < start || f.date > addDays(start, 6) || keep.has(f.date));
    const thin = reviewInputs(sc, { foodEntries });
    expect(thin.report.food.daysLogged).toBeLessThan(REVIEW_MIN_FOOD_DAYS);
    expect(nutritionRead(thin.report)).toMatchObject({ state: "unknown", title: "Early read" });
    expect(sleepRead(thin.report)).toMatchObject({ state: "unknown", title: "Early read", detail: "No nights logged this week." });
    expect(trainingRead(thin.report, NONE)).toMatchObject({ state: "unknown", title: "No sessions logged" });
  });

  it("carries the check-in's questions: partial and unlogged days", () => {
    const sc = scenario();
    const partialDate = addDays(sc.today, -2);
    const unloggedDate = addDays(sc.today, -4);
    const foodEntries = sc.foodEntries.filter((f) => f.date !== unloggedDate).map((f) => (f.date === partialDate ? { ...f, kcal: 600 } : f));
    const review = buildReview(reviewInputs(sc, { foodEntries }));
    expect(review.questions.partialDays).toEqual([{ date: partialDate, kcal: 600 }]);
    expect(review.questions.unloggedDays).toEqual([unloggedDate]);
    expect(review.questions.waist).not.toBeNull();
  });
});
