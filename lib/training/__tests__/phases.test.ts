import { describe, expect, it } from "vitest";
import { suggestNext, type ExerciseSession } from "@/lib/training/progression";
import { landmarks, targetBand } from "@/lib/training/volumeTargets";

/**
 * T7: the phase changes what the rules do with the same data. Scenarios
 * for a cut and a lean bulk against the same baseline.
 */
const session = (day: number, sets: Array<[number, number, number]>): ExerciseSession => ({
  completedAt: `2026-10-${String(day).padStart(2, "0")}T18:00:00.000Z`,
  sets: sets.map(([weight, reps, rir]) => ({ weight: String(weight), reps: String(reps), rir, done: true })),
});
const bench = { repMin: 6, repMax: 10, rir: 2 };
// A good week, then a short one: 100 × 8 at RIR 2, then 100 × 3 to failure.
const shortWeek = [session(1, [[100, 8, 2]]), session(4, [[100, 3, 0]])];

describe("phase-aware rules", () => {
  it("on a cut the lift holds its load through a short session; off a cut it steps back", () => {
    const cut = suggestNext({ name: "Bench Press", targets: bench, sessions: shortWeek, unit: "kg", phase: "cut" });
    const maintain = suggestNext({ name: "Bench Press", targets: bench, sessions: shortWeek, unit: "kg", phase: "maintain" });
    expect(cut).toMatchObject({ kind: "next", loadKg: 100, note: "held_on_cut" });
    expect(maintain.kind === "next" && maintain.loadKg < 100).toBe(true);
  });

  it("on a cut the volume ceiling comes down for every priority", () => {
    const chest = landmarks("chest");
    expect(targetBand("chest", "emphasise", "cut").high).toBe(Math.round(chest.mrv * 0.8));
    expect(targetBand("chest", "emphasise", "cut").high).toBeLessThan(targetBand("chest", "emphasise", "maintain").high);
    expect(targetBand("chest", "maintain", "cut")).toEqual(targetBand("chest", "maintain", "maintain"));
  });

  it("on a lean bulk Grow pushes a little further, never past MRV", () => {
    const chest = landmarks("chest");
    expect(targetBand("chest", "grow", "lean_bulk")).toEqual({ low: chest.mev, high: chest.mev + 6 });
    expect(targetBand("chest", "grow", "maintain")).toEqual({ low: chest.mev, high: chest.mev + 4 });
    // Traps: MEV 6, MRV 12. The bonus cannot push past MRV.
    expect(targetBand("traps", "grow", "lean_bulk").high).toBe(12);
    // Lifting rules do not change on a bulk: the same short week steps back as it would at maintenance.
    const bulk = suggestNext({ name: "Bench Press", targets: bench, sessions: shortWeek, unit: "kg", phase: "lean_bulk" });
    expect(bulk.kind === "next" && bulk.loadKg < 100).toBe(true);
  });
});
