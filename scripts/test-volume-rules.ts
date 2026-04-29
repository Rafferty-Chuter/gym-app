/**
 * Direct verification of the new volume rules across all branches of the matrix.
 * Run from gym-app/ with: npx tsx scripts/test-volume-rules.ts
 */

import {
  detectVolumeSignals,
  getVolumeContextByMuscleGroup,
  getWorkoutsFromLast7Days,
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

type Scenario = {
  name: string;
  workouts: StoredWorkout[];
  progression: Record<string, MuscleProgression>;
  expect: { [muscle: string]: { id: string | null; status?: string } | null };
};

const scenarios: Scenario[] = [
  // RIR-logged path
  {
    name: "RIR logged: hard sets = 14, progression good → Warning regardless",
    progression: { chest: "good", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: Array(14).fill(0).map(() => set(80, 8, 1)) },
        ],
      },
    ],
    expect: { chest: { id: "volume-high-chest", status: "warning" } },
  },
  {
    name: "RIR logged: hard sets = 4 → Low",
    progression: { chest: "good", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: Array(4).fill(0).map(() => set(80, 8, 2)) },
        ],
      },
    ],
    expect: { chest: { id: "volume-low-chest", status: "warning" } },
  },
  {
    name: "RIR logged: hard sets = 8 → Good (no signal)",
    progression: { chest: "stalling", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: Array(8).fill(0).map(() => set(80, 8, 1)) },
        ],
      },
    ],
    expect: { chest: null },
  },
  {
    name: "RIR logged: 4 hard + 6 easy (RIR=4) sets, total 10 → hardSets=4 → Low",
    progression: { chest: "good", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: [
            ...Array(4).fill(0).map(() => set(80, 8, 1)),
            ...Array(6).fill(0).map(() => set(60, 8, 4)),
          ] },
        ],
      },
    ],
    expect: { chest: { id: "volume-low-chest", status: "warning" } },
  },
  // No-RIR path
  {
    name: "No RIR: 18 sets, progression good → high-soft (neutral)",
    progression: { chest: "good", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: Array(18).fill(0).map(() => set(80, 8)) },
        ],
      },
    ],
    expect: { chest: { id: "volume-high-chest", status: "neutral" } },
  },
  {
    name: "No RIR: 18 sets, progression stalling → Warning",
    progression: { chest: "stalling", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: Array(18).fill(0).map(() => set(80, 8)) },
        ],
      },
    ],
    expect: { chest: { id: "volume-high-chest", status: "warning" } },
  },
  {
    name: "No RIR: 10 sets → Good (no signal)",
    progression: { chest: "stalling", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: Array(10).fill(0).map(() => set(80, 8)) },
        ],
      },
    ],
    expect: { chest: null },
  },
  {
    name: "No RIR: 4 sets, progression good → Fine (no signal)",
    progression: { chest: "good", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: Array(4).fill(0).map(() => set(80, 8)) },
        ],
      },
    ],
    expect: { chest: null },
  },
  {
    name: "No RIR: 4 sets, progression stalling → Low",
    progression: { chest: "stalling", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: Array(4).fill(0).map(() => set(80, 8)) },
        ],
      },
    ],
    expect: { chest: { id: "volume-low-chest", status: "warning" } },
  },
  {
    name: "No RIR: 4 sets, progression unclear → Low (unclear treated like stalling)",
    progression: { chest: "unclear", back: "unclear", legs: "unclear", shoulders: "unclear", arms: "unclear" },
    workouts: [
      {
        completedAt: isoDaysAgo(2),
        name: "Push",
        exercises: [
          { name: "Bench Press", sets: Array(4).fill(0).map(() => set(80, 8)) },
        ],
      },
    ],
    expect: { chest: { id: "volume-low-chest", status: "warning" } },
  },
];

let passed = 0;
let failed = 0;
for (const s of scenarios) {
  const recent = getWorkoutsFromLast7Days(s.workouts);
  const ctx = getVolumeContextByMuscleGroup(recent);
  const signals = detectVolumeSignals(s.workouts, s.progression);
  const errs: string[] = [];
  for (const muscle of Object.keys(s.expect)) {
    const exp = s.expect[muscle];
    const actual = signals.find((sig) => sig.target?.muscleGroup === muscle);
    if (exp === null) {
      if (actual) errs.push(`expected NO signal for ${muscle}, got id=${actual.id} status=${actual.status}`);
    } else {
      if (!actual) {
        errs.push(`expected ${exp.id} for ${muscle}, got nothing`);
      } else {
        if (actual.id !== exp.id) errs.push(`${muscle}: expected id=${exp.id}, got id=${actual.id}`);
        if (exp.status && actual.status !== exp.status) errs.push(`${muscle}: expected status=${exp.status}, got status=${actual.status}`);
      }
    }
  }
  if (errs.length === 0) {
    passed++;
    console.log(`PASS  ${s.name}`);
  } else {
    failed++;
    console.log(`FAIL  ${s.name}`);
    console.log(`      chest ctx: totalSets=${ctx.chest.totalSets} hardSets=${ctx.chest.hardSets} setsWithRir=${ctx.chest.setsWithRir} rirLogged=${ctx.chest.rirLogged}`);
    for (const e of errs) console.log(`      ${e}`);
    console.log(`      all signals: ${signals.map((sig) => `${sig.id}(${sig.status})`).join(", ") || "(none)"}`);
  }
}

console.log(`\n${passed} passed, ${failed} failed (${scenarios.length} total)`);
process.exit(failed === 0 ? 0 : 1);
