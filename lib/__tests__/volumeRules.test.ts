/**
 * Volume rules across all branches of the matrix. Ported from
 * scripts/test-volume-rules.ts (F1) so it runs under vitest.
 */
import { describe, expect, it } from "vitest";
import {
  detectVolumeSignals,
  type StoredWorkout,
  type MuscleProgression,
} from "@/lib/trainingAnalysis";

function isoDaysAgo(d: number, h = 14): string {
  const t = Date.now() - d * 24 * 3600 * 1000 - h * 3600 * 1000;
  return new Date(t).toISOString();
}

function set(weight: number | string, reps: number | string, rir?: number) {
  const s: { weight: string; reps: string; rir?: number } = {
    weight: String(weight),
    reps: String(reps),
  };
  if (rir !== undefined) s.rir = rir;
  return s;
}

const base: Record<string, MuscleProgression> = {
  chest: "unclear",
  back: "unclear",
  legs: "unclear",
  shoulders: "unclear",
  arms: "unclear",
};

type Scenario = {
  name: string;
  chest: MuscleProgression;
  sets: { weight: string; reps: string; rir?: number }[];
  expect: { id: string; status?: string } | null;
};

const scenarios: Scenario[] = [
  {
    name: "RIR logged: hard sets = 14, progression good → Warning regardless",
    chest: "good",
    sets: Array(14).fill(0).map(() => set(80, 8, 1)),
    expect: { id: "volume-high-chest", status: "warning" },
  },
  {
    name: "RIR logged: hard sets = 4 → Low",
    chest: "good",
    sets: Array(4).fill(0).map(() => set(80, 8, 2)),
    expect: { id: "volume-low-chest", status: "warning" },
  },
  {
    name: "RIR logged: hard sets = 8 → Good (no signal)",
    chest: "stalling",
    sets: Array(8).fill(0).map(() => set(80, 8, 1)),
    expect: null,
  },
  {
    name: "RIR logged: 4 hard + 6 easy (RIR=4) sets → hardSets=4 → Low",
    chest: "good",
    sets: [
      ...Array(4).fill(0).map(() => set(80, 8, 1)),
      ...Array(6).fill(0).map(() => set(60, 8, 4)),
    ],
    expect: { id: "volume-low-chest", status: "warning" },
  },
  {
    name: "No RIR: 18 sets, progression good → high-soft (neutral)",
    chest: "good",
    sets: Array(18).fill(0).map(() => set(80, 8)),
    expect: { id: "volume-high-chest", status: "neutral" },
  },
  {
    name: "No RIR: 18 sets, progression stalling → Warning",
    chest: "stalling",
    sets: Array(18).fill(0).map(() => set(80, 8)),
    expect: { id: "volume-high-chest", status: "warning" },
  },
  {
    name: "No RIR: 10 sets → Good (no signal)",
    chest: "stalling",
    sets: Array(10).fill(0).map(() => set(80, 8)),
    expect: null,
  },
  {
    name: "No RIR: 4 sets, progression good → Fine (no signal)",
    chest: "good",
    sets: Array(4).fill(0).map(() => set(80, 8)),
    expect: null,
  },
  {
    name: "No RIR: 4 sets, progression stalling → Low",
    chest: "stalling",
    sets: Array(4).fill(0).map(() => set(80, 8)),
    expect: { id: "volume-low-chest", status: "warning" },
  },
  {
    name: "No RIR: 4 sets, progression unclear → Low",
    chest: "unclear",
    sets: Array(4).fill(0).map(() => set(80, 8)),
    expect: { id: "volume-low-chest", status: "warning" },
  },
];

describe("volume rules", () => {
  for (const s of scenarios) {
    it(s.name, () => {
      const workouts: StoredWorkout[] = [
        {
          completedAt: isoDaysAgo(2),
          name: "Push",
          exercises: [{ name: "Bench Press", sets: s.sets }],
        },
      ];
      const signals = detectVolumeSignals(workouts, { ...base, chest: s.chest });
      const actual = signals.find((sig) => sig.target?.muscleGroup === "chest");
      if (s.expect === null) {
        expect(actual).toBeUndefined();
      } else {
        expect(actual?.id).toBe(s.expect.id);
        if (s.expect.status) expect(actual?.status).toBe(s.expect.status);
      }
    });
  }
});
