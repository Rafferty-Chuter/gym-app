import { describe, expect, it } from "vitest";
import { equipmentFor, snapLoad, suggestNext, suggestionLabel, type ExerciseSession } from "@/lib/training/progression";
import type { RepTargets } from "@/lib/training/targets";

type S = [weight: number, reps: number, rir?: number];
const session = (day: number, sets: S[]): ExerciseSession => ({
  completedAt: `2026-10-${String(day).padStart(2, "0")}T18:00:00.000Z`,
  sets: sets.map(([weight, reps, rir]) => ({ weight: String(weight), reps: String(reps), ...(rir == null ? {} : { rir }), done: true })),
});
const bench: RepTargets = { repMin: 6, repMax: 10, rir: 2 };
const raise: RepTargets = { repMin: 10, repMax: 15, rir: 1 };
const run = (name: string, targets: RepTargets, sessions: ExerciseSession[], phase?: "cut" | "maintain" | "lean_bulk") => suggestNext({ name, targets, sessions, unit: "kg", phase });

describe("progression rule", () => {
  it("1. says nothing below two sessions, and nothing at all without a loaded set", () => {
    expect(run("Bench Press", bench, [session(1, [[80, 8, 2]])])).toEqual({ kind: "early", sessions: 1 });
    expect(run("Bench Press", bench, []).kind).toBe("none");
    expect(run("Pull-Up", bench, [session(1, [[0, 8, 2]]), session(3, [[0, 9, 2]])]).kind).toBe("none");
    expect(suggestionLabel({ kind: "early", sessions: 1 }, "kg")).toBeNull();
  });

  it("2. beating the expectation moves the load up one step that exists", () => {
    // Expectation: mid 8 + RIR 2 = 10 reps to failure. 80 × 10 at RIR 2 is 12: progress.
    const s = run("Bench Press", bench, [session(1, [[80, 8, 2], [80, 8, 2]]), session(4, [[80, 10, 2], [80, 10, 2], [80, 9, 2]])]);
    expect(s.kind).toBe("next");
    if (s.kind !== "next") return;
    expect(s.loadKg).toBe(82.5);
    expect(s.reps).toBeGreaterThanOrEqual(6);
    expect(s.reps).toBeLessThanOrEqual(10);
    expect(s.note).toBeUndefined();
    expect(suggestionLabel(s, "kg")).toBe(`Next 82.5 kg × ${s.reps}`);
  });

  it("3. meeting the expectation holds the load and adds a rep", () => {
    const s = run("Bench Press", bench, [session(1, [[80, 8, 2]]), session(4, [[80, 8, 2], [80, 8, 2]])]);
    expect(s).toMatchObject({ kind: "next", loadKg: 80, reps: 9, rir: 2 });
  });

  it("4. falling short steps back slightly and never more than the ceiling", () => {
    const s = run("Bench Press", bench, [session(1, [[100, 8, 2]]), session(4, [[100, 5, 0]])]);
    expect(s.kind).toBe("next");
    if (s.kind !== "next") return;
    expect(s.loadKg).toBeLessThanOrEqual(100);
    expect(s.loadKg).toBeGreaterThanOrEqual(87.5);
    expect(s.note).toBe("stepped_back");
    expect(s.reps).toBeGreaterThanOrEqual(6);
  });

  it("5. a step that is too coarse becomes a rep instead, past the range if need be", () => {
    // 10 kg dumbbells: the next pair is 12.5, a 25 % jump. Add a rep at 10 instead.
    const s = run("Dumbbell Lateral Raise", raise, [session(1, [[10, 14, 1]]), session(4, [[10, 15, 1], [10, 15, 1]])]);
    expect(s).toMatchObject({ kind: "next", loadKg: 10, reps: 16, note: "range_expanded" });
    // 7 kg dumbbells step by 1 kg, which is a fair jump for an isolation.
    const t = run("Dumbbell Lateral Raise", raise, [session(1, [[7, 14, 1]]), session(4, [[7, 15, 1], [7, 15, 1]])]);
    expect(t).toMatchObject({ kind: "next", loadKg: 8 });
  });

  it("6. without RIR on most sets it falls back to double progression", () => {
    const top = run("Bench Press", bench, [session(1, [[80, 10], [80, 10]]), session(4, [[80, 10], [80, 10], [80, 10]])]);
    expect(top).toMatchObject({ kind: "next", loadKg: 82.5, reps: 6, note: "double_progression" });
    const mid = run("Bench Press", bench, [session(1, [[80, 8], [80, 8]]), session(4, [[80, 8], [80, 7]])]);
    expect(mid).toMatchObject({ kind: "next", loadKg: 80, reps: 9, note: "double_progression" });
    const miss = run("Bench Press", bench, [session(1, [[80, 5], [80, 5]]), session(4, [[80, 5], [80, 4]])]);
    expect(miss).toMatchObject({ kind: "next", loadKg: 77.5, reps: 6, note: "double_progression" });
  });

  it("7. on a cut a short session holds the load rather than dropping it", () => {
    // 100 × 3 to failure after 100 × 8 at RIR 2: the estimate says fewer than 6 reps at 100, so off a cut the load would drop.
    const cut = run("Bench Press", bench, [session(1, [[100, 8, 2]]), session(4, [[100, 3, 0]])], "cut");
    expect(cut).toMatchObject({ kind: "next", loadKg: 100, reps: 6, note: "held_on_cut" });
    const off = run("Bench Press", bench, [session(1, [[100, 8, 2]]), session(4, [[100, 3, 0]])], "maintain");
    expect(off.kind === "next" && off.loadKg < 100).toBe(true);
    const twice = run("Bench Press", bench, [session(1, [[100, 4, 0]]), session(4, [[100, 4, 0]])], "cut");
    expect(twice.kind === "next" && twice.loadKg < 100).toBe(true);
  });

  it("snaps to what exists and reads the equipment from the name", () => {
    expect(equipmentFor("Dumbbell Bench Press")).toBe("dumbbell");
    expect(equipmentFor("Lat Pulldown")).toBe("cable");
    expect(equipmentFor("Leg Press")).toBe("machine");
    expect(equipmentFor("Weighted Chin-Up")).toBe("bodyweight");
    expect(equipmentFor("Back Squat")).toBe("barbell");
    expect(snapLoad(81.2, "barbell")).toBe(80);
    expect(snapLoad(81.3, "barbell")).toBe(82.5);
    expect(snapLoad(7.4, "dumbbell")).toBe(7);
    expect(snapLoad(0.4, "barbell")).toBe(2.5);
  });
});
