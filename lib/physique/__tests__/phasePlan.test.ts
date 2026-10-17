import { describe, expect, it } from "vitest";
import { MAINTENANCE_AFTER_CUT_WEEKS, phasePlan, planLine, planPosition } from "@/lib/physique/phasePlan";
import type { GoalEta } from "@/lib/physique/goalEta";
import type { GoalProgress } from "@/lib/physique/goalProgress";
import type { PhysiqueGoal } from "@/lib/physique/types";

const goal: PhysiqueGoal = { id: "g", createdAt: "2026-09-01T00:00:00Z", type: "lose", startDate: "2026-09-01", startTrendKg: 88, targetKg: 82, ratePctPerWeek: -0.5, trainingStatusAtCreation: "intermediate", schemaVersion: 1 };
const progress = { doneKg: 2, totalKg: 6, remainingKg: 4, weeks: [] } as unknown as GoalProgress;
const eta: GoalEta = { basis: "observed", date: "2026-12-20", earliest: "2026-12-10", latest: "2027-01-10", weeksLeft: 9, ratePctPerWeek: -0.5, planDate: "2026-12-01", daysVsPlan: 19, remainingKg: 4, reached: false, reason: null, weighInsNeeded: 0 };
const today = "2026-10-17";

describe("phase planner", () => {
  it("runs a cut to its ETA, then maintenance before anything else", () => {
    const plan = phasePlan(goal, progress, eta, today);
    expect(plan?.phases.map((p) => p.kind)).toEqual(["cut", "maintain", "next"]);
    expect(plan?.phases[0]).toMatchObject({ start: "2026-09-01", end: "2026-12-20", current: true });
    expect(plan?.phases[1]).toMatchObject({ start: "2026-12-20", end: "2027-01-10", current: false });
    expect(plan?.phases[2].start).toBe("2027-01-10");
    expect(MAINTENANCE_AFTER_CUT_WEEKS).toBe(3);
    expect(planLine(plan!, (d) => d)).toBe("Cut to 2026-12-20 · maintain 3 weeks · next from 2027-01-10");
  });

  it("dates the halfway point from today at the ETA's rate", () => {
    const plan = phasePlan(goal, progress, eta, today);
    const half = plan?.milestones[0];
    // Halfway is 3 kg down; 2 kg done, so 1 kg to go at 0.5 % of 86 kg a week, about 2.3 weeks.
    expect(half).toMatchObject({ label: "Halfway", kg: 85, reached: false });
    expect(half?.date).toBe("2026-11-02");
    expect(plan?.milestones[1]).toMatchObject({ label: "Target", kg: 82, date: "2026-12-20" });
    expect(planPosition(plan!, today)).toBeCloseTo(46 / 131, 2);
  });

  it("says why there is no date, and plans a bulk's settle", () => {
    const away = phasePlan(goal, progress, { ...eta, date: null, earliest: null, latest: null, weeksLeft: null, reason: "away", ratePctPerWeek: 0.2, daysVsPlan: null }, today);
    expect(away?.phases[0].end).toBeNull();
    expect(away?.phases[0].note).toMatch(/moving away/);
    expect(planLine(away!, (d) => d)).toBe("Cut · no end date yet");
    const bulk = phasePlan({ ...goal, type: "gain", startTrendKg: 80, targetKg: 84, ratePctPerWeek: 0.25 }, { ...progress, doneKg: 1, totalKg: 4, remainingKg: 3 } as GoalProgress, { ...eta, ratePctPerWeek: 0.25, date: "2027-01-05" }, today);
    expect(bulk?.phases.map((p) => p.label)).toEqual(["Lean bulk", "Maintain", "Next goal"]);
    expect(bulk?.phases[1].end).toBe("2027-01-19");
    const hold = phasePlan({ ...goal, type: "maintain", targetKg: 85 }, null, null, today);
    expect(hold?.phases.map((p) => p.kind)).toEqual(["maintain", "next"]);
  });
});
