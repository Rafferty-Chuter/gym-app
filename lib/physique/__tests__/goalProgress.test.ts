import { describe, expect, it } from "vitest";
import { currentWeight, goalDistanceAt } from "@/lib/physique/goalProgress";
import type { PhysiqueGoal, WeighIn } from "@/lib/physique/types";

const goal = (over: Partial<PhysiqueGoal> = {}): PhysiqueGoal => ({ id: "g", createdAt: "2026-10-17T12:00:00Z", type: "lose", startDate: "2026-10-17", startTrendKg: 79.3, targetKg: 75, ratePctPerWeek: -0.5, trainingStatusAtCreation: "intermediate", schemaVersion: 1, ...over });
const w = (date: string, kg: number, loggedAt = `${date}T07:00:00Z`, over: Partial<WeighIn> = {}): WeighIn => ({ id: `${date}-${kg}`, date, kg, loggedAt, source: "manual", schemaVersion: 1, ...over });

describe("the Progress headline is the current weight (IN12)", () => {
  // The founder's own weigh-ins, 14 to 22 Oct: the trend was 78.73 kg on the last day, the scale 77.3.
  const weighIns = [w("2026-10-14", 79.4, "2026-10-14T06:00:00Z", { source: "healthkit" }), w("2026-10-14", 79.5, "2026-10-14T08:00:00Z"), w("2026-10-16", 78.5), w("2026-10-17", 78.5), w("2026-10-18", 78.9), w("2026-10-21", 77.8), w("2026-10-22", 77.3)];

  it("takes the latest day's weight on or before today", () => {
    expect(currentWeight(weighIns, "2026-10-22")).toEqual({ date: "2026-10-22", kg: 77.3 });
    expect(currentWeight(weighIns, "2026-10-20")).toEqual({ date: "2026-10-18", kg: 78.9 });
    expect(currentWeight(weighIns, "2026-10-14")).toEqual({ date: "2026-10-14", kg: 79.4 });
    expect(currentWeight([], "2026-10-22")).toBeNull();
  });

  it("counts lost and to go from it, so the card adds up", () => {
    const d = goalDistanceAt(goal(), 77.3)!;
    expect(d.totalKg).toBeCloseTo(4.3);
    expect(d.doneKg).toBeCloseTo(2.0);
    expect(d.remainingKg).toBeCloseTo(2.3);
    expect(d.share).toBeCloseTo(2.0 / 4.3);
  });

  it("never runs past the start or the target, and has nothing to say for maintain", () => {
    expect(goalDistanceAt(goal(), 80.1)).toMatchObject({ doneKg: 0, share: 0 });
    expect(goalDistanceAt(goal(), 74.2)).toMatchObject({ remainingKg: 0, share: 1 });
    expect(goalDistanceAt(goal({ type: "gain", startTrendKg: 80, targetKg: 84, ratePctPerWeek: 0.25 }), 81)).toMatchObject({ doneKg: 1, remainingKg: 3 });
    expect(goalDistanceAt(goal({ type: "maintain", ratePctPerWeek: 0 }), 77.3)).toBeNull();
    expect(goalDistanceAt(null, 77.3)).toBeNull();
  });
});
