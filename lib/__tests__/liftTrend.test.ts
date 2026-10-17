/**
 * Characterisation tests for lib/liftTrend.ts, written before the slope helper
 * moved to lib/stats.ts so the move can't change behaviour.
 */
import { describe, expect, it } from "vitest";
import { aggregateLiftTrends, classifyE1rmSeries, getLiftTrendStatus } from "@/lib/liftTrend";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

describe("classifyE1rmSeries", () => {
  it("progressing: +2% per session over 6 sessions", () => {
    const s = classifyE1rmSeries([100, 102, 104, 106, 108, 110], "Bench");
    expect(s.status).toBe("progressing");
    expect(s.slopePerSession).toBeCloseTo(2, 6);
    expect(s.windowChangePct).toBeCloseTo(0.1, 6);
  });

  it("flat: within ±1.5% band", () => {
    const s = classifyE1rmSeries([100, 100.5, 99.8, 100.2, 100.4, 100.1], "Squat");
    expect(s.status).toBe("flat");
  });

  it("early: fewer than 3 sessions; declining when endpoint and slope agree", () => {
    expect(classifyE1rmSeries([100, 90]).status).toBe("early");
    expect(classifyE1rmSeries([100, 97, 95, 93]).status).toBe("declining");
  });
});

describe("getLiftTrendStatus + aggregate", () => {
  it("reads e1RM from the heaviest set per session and aggregates", () => {
    const mk = (daysAgo: number, w: number): StoredWorkout => ({
      completedAt: new Date(Date.UTC(2026, 9, 16 - daysAgo, 10)).toISOString(),
      exercises: [{ name: "Bench Press", sets: [{ weight: String(w), reps: "5" }, { weight: "60", reps: "12" }] }],
    });
    const workouts = [mk(10, 100), mk(8, 102), mk(6, 104), mk(4, 106)];
    const status = getLiftTrendStatus(workouts, "Bench Press");
    expect(status.status).toBe("progressing");
    expect(status.sessionsTracked).toBe(4);
    expect(aggregateLiftTrends([status, status])).toBe("improving");
  });
});
