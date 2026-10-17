/** M5 T1 + T2: set types and the one e1RM behind volume, trend and plateau. */
import { describe, expect, it } from "vitest";
import { countHardSets, getE1rmSets, getHardSets, nextSetType, setTypeOf } from "@/lib/completedSets";
import { bestSessionE1rm, e1rmAdj, parseWorkingSet } from "@/lib/physique/strength";
import { estimateE1RM, getBestSet, getDetailedVolumeByMuscleGroup, getVolumeByMuscleGroup } from "@/lib/trainingMetrics";
import { e1rmSlopePctPerWeek, getLiftTrendStatus, recentE1rmPoints, recentE1rmSeries } from "@/lib/liftTrend";
import { detectPlateauForLift } from "@/lib/plateauSignal";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

const sets = [
  { weight: "40", reps: "10", type: "warmup" as const },
  { weight: "100", reps: "5" },
  { weight: "100", reps: "4", rir: 2 },
  { weight: "80", reps: "8", type: "drop" as const },
  { weight: "90", reps: "6", rir: 3, type: "failure" as const },
  { weight: "100", reps: "" },
];

describe("set types", () => {
  it("defaults to working and cycles W → D → F → working", () => {
    expect(setTypeOf({ weight: "1", reps: "1" })).toBe("working");
    expect(setTypeOf({ weight: "1", reps: "1", type: "bogus" })).toBe("working");
    expect(nextSetType("working")).toBe("warmup");
    expect(nextSetType("failure")).toBe("working");
  });

  it("keeps warm-ups out of hard sets and drops out of e1RM sets", () => {
    expect(getHardSets(sets).map((s) => s.weight)).toEqual(["100", "100", "80", "90"]);
    expect(countHardSets(sets)).toBe(4);
    expect(getE1rmSets(sets).map((s) => s.weight)).toEqual(["100", "100", "90"]);
  });
});

describe("one e1RM", () => {
  it("skips warm-ups and drops, treats failure as RIR 0, caps reps + RIR at 12", () => {
    expect(parseWorkingSet(sets[0], "kg")).toBeNull();
    expect(parseWorkingSet(sets[3], "kg")).toBeNull();
    expect(parseWorkingSet(sets[4], "kg")?.rir).toBe(0);
    expect(parseWorkingSet({ weight: "60", reps: "10", rir: 3 }, "kg")).toBeNull();
    expect(bestSessionE1rm(sets, "kg")).toBeCloseTo(100 * (1 + 6 / 30), 6); // 100 × 4 reps @ RIR 2 beats 100 × 5
    expect(estimateE1RM(100, 5)).toBe(Number(e1rmAdj(100, 5, 0).toFixed(1)));
    expect(getBestSet(sets)).toEqual({ weight: 100, reps: 5 });
  });

  it("counts volume without warm-ups", () => {
    const w: StoredWorkout = { completedAt: "2026-10-10T10:00:00Z", exercises: [{ name: "Bench Press", sets }] };
    expect(getVolumeByMuscleGroup([w]).chest).toBe(4);
    expect(getDetailedVolumeByMuscleGroup([w]).chest).toBe(4);
  });
});

describe("lift trend and plateau read the same series", () => {
  const mk = (daysAgo: number, w: number, extra: StoredWorkout["exercises"][number]["sets"] = []): StoredWorkout => ({
    completedAt: new Date(Date.UTC(2026, 9, 16 - daysAgo, 10)).toISOString(),
    exercises: [{ name: "Squat", sets: [{ weight: "60", reps: "8", type: "warmup" }, { weight: String(w), reps: "5", rir: 1 }, ...extra] }],
  });

  it("ignores warm-ups and uses RIR, with a time-based slope", () => {
    const workouts = [mk(21, 100), mk(14, 102), mk(7, 104), mk(0, 106)];
    const points = recentE1rmPoints(workouts, "Squat");
    expect(points.map((p) => p.e1rm)).toEqual([100, 102, 104, 106].map((w) => Number((w * (1 + 6 / 30)).toFixed(1))));
    expect(recentE1rmSeries(workouts, "Squat")).toHaveLength(4);
    const status = getLiftTrendStatus(workouts, "Squat");
    expect(status.status).toBe("progressing");
    expect(status.slopePctPerWeek).toBeCloseTo(2, 1);
    expect(e1rmSlopePctPerWeek(points.slice(0, 2))).toBeNull();
  });

  it("a heavy warm-up no longer masks a plateau", () => {
    const flat = [28, 21, 14, 7, 0].map((d) => mk(d, 100, [{ weight: "140", reps: "1", type: "warmup" }]));
    const p = detectPlateauForLift(flat, "Squat");
    expect(p).not.toBeNull();
    expect(getLiftTrendStatus(flat, "Squat").status).toBe("flat");
  });
});
