import { describe, expect, it } from "vitest";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { bestSet, formatDuration, formatSet, groupByMonth, recordLine, recordsByWorkout, workoutRecords, workoutStats } from "@/lib/training/workoutSummary";
import { chartMetricsFor, chartSeries, exerciseRecords, exerciseSessions, loggedExercises } from "@/lib/training/exerciseHistory";

const s = (weight: string, reps: string, type?: "warmup" | "drop" | "failure") => ({ weight, reps, ...(type ? { type } : {}) });

const w1: StoredWorkout = {
  completedAt: "2026-09-28T08:00:00.000Z",
  name: "Push A",
  durationSec: 3120,
  exercises: [
    { name: "Bench Press", sets: [s("40", "10", "warmup"), s("80", "8"), s("80", "7")] },
    { name: "Push Up", sets: [s("", "20"), s("", "15")] },
  ],
};
const w2: StoredWorkout = {
  completedAt: "2026-10-05T08:00:00.000Z",
  name: "Push A",
  durationSec: 3300,
  exercises: [
    // Same lift under its library name: one history.
    { name: "Barbell Bench Press", sets: [s("60", "12", "warmup"), s("82.5", "6"), s("80", "8"), s("60", "15", "drop")] },
    { name: "Push Up", sets: [s("", "22")] },
    { name: "Cable Fly", sets: [s("20", "12")] },
  ],
};

describe("workout summary (TR4)", () => {
  it("stats count hard sets and their volume, never warm-ups", () => {
    const st = workoutStats(w2);
    expect(st.sets).toBe(5);
    expect(st.exercises).toBe(3);
    expect(st.volume).toBe(Math.round(82.5 * 6 + 80 * 8 + 60 * 15 + 20 * 12));
    expect(st.durationSec).toBe(3300);
    expect(formatDuration(3300)).toBe("55 min");
    expect(formatDuration(3900)).toBe("1 h 05 min");
  });

  it("the best set is the highest e1RM, and a bodyweight exercise's is its most reps", () => {
    expect(bestSet(w2.exercises[0].sets)).toEqual({ weight: 80, reps: 8 });
    expect(formatSet(bestSet(w2.exercises[0].sets), "kg")).toBe("80 kg × 8");
    expect(formatSet(bestSet(w1.exercises[1].sets), "kg")).toBe("20 reps");
    expect(bestSet([s("100", "5", "warmup")])).toBeNull();
  });

  it("records are against earlier sessions only, and a first session sets none", () => {
    expect(workoutRecords(w1, [w1])).toEqual([]);
    const recs = workoutRecords(w2, [w1, w2]);
    const kinds = recs.map((r) => `${r.name}:${r.kind}`);
    expect(kinds).toContain("Barbell Bench Press:weight");
    expect(kinds).toContain("Push Up:reps");
    // 82.5×6 (e1RM 99) does not beat 80×8 (e1RM 101.3); a drop set never counts.
    expect(kinds).not.toContain("Barbell Bench Press:e1rm");
    expect(kinds.some((k) => k.startsWith("Cable Fly"))).toBe(false);
    const heavy = recs.find((r) => r.kind === "weight");
    expect(heavy && recordLine(heavy, "kg")).toBe("Heaviest weight 82.5 kg, was 80");
  });

  it("the one-pass history map agrees with the per-workout records", () => {
    const map = recordsByWorkout([w2, w1]);
    expect(map.has(w1.completedAt)).toBe(false);
    expect(map.get(w2.completedAt)?.map((r) => r.kind).sort()).toEqual(workoutRecords(w2, [w1, w2]).map((r) => r.kind).sort());
  });

  it("groups by month, newest first", () => {
    const g = groupByMonth([w1, w2, { ...w1, completedAt: "2026-10-01T08:00:00.000Z" }], (iso) => iso.slice(0, 7), (k) => k);
    expect(g.map((x) => [x.key, x.items.length])).toEqual([
      ["2026-10", 2],
      ["2026-09", 1],
    ]);
    expect(g[0].items[0].completedAt).toBe(w2.completedAt);
  });
});

describe("exercise history (TR6)", () => {
  it("sessions match by identity, newest first, with e1RM and volume", () => {
    const ss = exerciseSessions([w1, w2], { name: "Bench Press" });
    expect(ss.map((x) => x.completedAt)).toEqual([w2.completedAt, w1.completedAt]);
    expect(ss[0].heaviest).toBe(82.5);
    expect(ss[1].volume).toBe(80 * 8 + 80 * 7);
    expect(ss[0].sets[0]).toEqual({ weight: 60, reps: 12, type: "warmup" });
  });

  it("records ignore warm-ups and drop sets, rep records keep the heaviest per rep count", () => {
    const r = exerciseRecords(exerciseSessions([w1, w2], { name: "Bench Press" }));
    expect(r.heaviest?.value).toBe(82.5);
    expect(r.e1rm?.weight).toBe(80);
    expect(r.e1rm?.reps).toBe(8);
    expect(r.e1rm?.completedAt).toBe(w1.completedAt);
    expect(r.repRecords.map((x) => [x.reps, x.weight])).toEqual([
      [6, 82.5],
      [7, 80],
      [8, 80],
    ]);
    expect(r.repRecords.some((x) => x.reps === 15)).toBe(false);
    expect(r.mostReps).toBeNull();
  });

  it("charts oldest first, and bodyweight work charts reps", () => {
    const bench = exerciseSessions([w1, w2], { name: "Bench Press" });
    expect(chartSeries(bench, "heaviest").map((p) => p.value)).toEqual([80, 82.5]);
    expect(chartMetricsFor(bench)).toEqual(["e1rm", "heaviest", "volume"]);
    const pu = exerciseSessions([w1, w2], { name: "Push Up" });
    expect(chartMetricsFor(pu)).toEqual(["reps"]);
    expect(chartSeries(pu, "reps").map((p) => p.value)).toEqual([20, 22]);
    expect(exerciseRecords(pu).mostReps?.value).toBe(22);
  });

  it("the exercise index joins old names to the library entry, newest first", () => {
    const idx = loggedExercises([w1, w2]);
    expect(idx.map((x) => x.name)).toEqual(["Barbell Bench Press", "Push Up", "Cable Fly"]);
    expect(idx[0]).toMatchObject({ sessions: 2, lastAt: w2.completedAt });
    expect(idx[2].sessions).toBe(1);
  });
});
