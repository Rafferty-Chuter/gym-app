/**
 * Seeded synthetic scenarios for tests and the dev seed page.
 * Spec: docs/plan/02-engine-spec.md §8.4.
 *
 * Deterministic for a given `seed`. Produces repo-shaped records.
 */

import { addDays, weekday, type LocalDate } from "@/lib/dates";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type {
  DayEvent,
  DayFlags,
  FoodEntry,
  PhysiqueGoal,
  PhysiqueProfile,
  SleepNight,
  TrainingStatus,
  WaistEntry,
  WeighIn,
} from "@/lib/physique/types";

/** kcal per kg of weight change. PUB (MacroFactor V3), same for gain and loss. */
export const ENERGY_DENSITY_KCAL_PER_KG = 7716;

// ── PRNG ──

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── Spec ──

export type LiftSpec = {
  name: string;
  startE1rm: number;
  /** "linear": reach `changePct` at the last day. "step": jump by `changePct` at `atDay`. */
  profile: "linear" | "step";
  changePct: number;
  atDay?: number;
  perWeek: number;
  /** Per-session noise as a coefficient of variation. */
  cv?: number;
};

export type ScenarioSpec = {
  seed?: number;
  /** First date of generated data. */
  startDate?: LocalDate;
  /** Total days including preDays. */
  days: number;
  /** Maintenance days before the goal starts (goal.startDay = preDays). */
  preDays?: number;
  bodyweightKg: number;
  /** When set, weight moves by (intake − trueTDEE)/7716 per day. Otherwise the goal rate drives the drift. */
  trueTdeeKcal?: number;
  intake?: { meanKcal: number; sdKcal?: number } | "toTarget";
  /** Used to generate targets in "toTarget" mode (P3). Ignored otherwise. */
  targetKcal?: number;
  goal?: { ratePctPerWeek: number; targetKg?: number; trainingStatus?: TrainingStatus; confirmed?: boolean } | null;
  /** Marginal SD of the AR(1) weight noise. Innovation SD = sd·√(1−φ²). */
  noiseSdKg?: number;
  phi?: number;
  weighInDays?: "daily" | "4x" | "sparse";
  /** Water shift at phase start. Default −1.2 kg over 5 days on a cut, +0.8 on a bulk, 0 otherwise. */
  waterStepKg?: number;
  waterStepDays?: number;
  sleep?: { meanH: number; sdH?: number; source?: "manual" | "healthkit"; loggedShare?: number } | null;
  lifts?: LiftSpec[];
  events?: Array<{ day: number; event: DayEvent }>;
  waist?: { startCm: number; changeCm: number } | null;
  /** Mark a run of days as partial (user flagged) or fasting. */
  flags?: Array<{ day: number; status: "partial" | "fasting" }>;
  profile?: Partial<PhysiqueProfile>;
};

export type Scenario = {
  spec: Required<Pick<ScenarioSpec, "seed" | "startDate" | "days" | "preDays">> & ScenarioSpec;
  startDate: LocalDate;
  endDate: LocalDate;
  today: LocalDate;
  goal: PhysiqueGoal | null;
  profile: PhysiqueProfile;
  weighIns: WeighIn[];
  foodEntries: FoodEntry[];
  dayFlags: Record<string, DayFlags>;
  sleepNights: SleepNight[];
  waist: WaistEntry[];
  workouts: StoredWorkout[];
  /** The true daily weight path without noise, for assertions. */
  trueKg: number[];
  /** The intake used per day (kcal). */
  intakeKcal: number[];
  rand: () => number;
};

const DEFAULT_START: LocalDate = "2026-08-01";

export function makeScenario(input: ScenarioSpec): Scenario {
  const seed = input.seed ?? 1;
  const rand = mulberry32(seed);
  const startDate = input.startDate ?? DEFAULT_START;
  const preDays = input.preDays ?? 0;
  const days = input.days;
  const endDate = addDays(startDate, days - 1);
  const bw0 = input.bodyweightKg;
  const phi = input.phi ?? 0.5;
  const sd = input.noiseSdKg ?? 0.5;
  const innovationSd = sd * Math.sqrt(1 - phi * phi);
  const goalSpec = input.goal === undefined ? null : input.goal;
  const goalStartDay = preDays;
  const goalStartDate = addDays(startDate, goalStartDay);
  const createdAtIso = `${goalStartDate}T07:00:00.000Z`;

  const goal: PhysiqueGoal | null = goalSpec
    ? {
        id: `seed-goal-${seed}`,
        createdAt: createdAtIso,
        type: goalSpec.ratePctPerWeek < 0 ? "lose" : goalSpec.ratePctPerWeek > 0 ? "gain" : "maintain",
        startDate: goalStartDate,
        startTrendKg: bw0,
        targetKg: goalSpec.targetKg ?? (goalSpec.ratePctPerWeek < 0 ? Math.round(bw0 * 0.92) : goalSpec.ratePctPerWeek > 0 ? Math.round(bw0 * 1.08) : bw0),
        ratePctPerWeek: goalSpec.ratePctPerWeek,
        trainingStatusAtCreation: goalSpec.trainingStatus ?? "intermediate",
        phaseStartConfirmedAt: goalSpec.confirmed === false ? undefined : createdAtIso,
        schemaVersion: 1,
      }
    : null;

  // Water step at phase start.
  const defaultWater = goal ? (goal.type === "lose" ? -1.2 : goal.type === "gain" ? 0.8 : 0) : 0;
  const waterKg = input.waterStepKg ?? defaultWater;
  const waterDays = input.waterStepDays ?? 5;

  // Intake per day.
  const intakeSpec = input.intake ?? { meanKcal: input.trueTdeeKcal ?? 2800 };
  const intakeKcal: number[] = [];
  for (let d = 0; d < days; d++) {
    if (intakeSpec === "toTarget") {
      // P3 closes the loop; until then, eat at the provided target (or TDEE).
      const target = input.targetKcal ?? input.trueTdeeKcal ?? 2800;
      intakeKcal.push(Math.max(800, Math.round(target + gaussian(rand) * 350)));
    } else {
      intakeKcal.push(Math.max(800, Math.round(intakeSpec.meanKcal + gaussian(rand) * (intakeSpec.sdKcal ?? 350))));
    }
  }

  // True weight path.
  const trueKg: number[] = [];
  let kg = bw0;
  for (let d = 0; d < days; d++) {
    const inPhase = goal ? d >= goalStartDay : false;
    let delta = 0;
    if (input.trueTdeeKcal !== undefined) {
      delta = (intakeKcal[d] - input.trueTdeeKcal) / ENERGY_DENSITY_KCAL_PER_KG;
    } else if (goal && inPhase) {
      delta = ((goal.ratePctPerWeek / 100) * kg) / 7;
    }
    kg += delta;
    let water = 0;
    if (goal && waterKg !== 0 && d >= goalStartDay) {
      const k = Math.min(waterDays, d - goalStartDay + 1);
      water = (waterKg * k) / waterDays;
    }
    trueKg.push(kg + water);
  }

  // AR(1) noise and weigh-ins.
  const weighIns: WeighIn[] = [];
  let eps = gaussian(rand) * sd;
  for (let d = 0; d < days; d++) {
    eps = phi * eps + gaussian(rand) * innovationSd;
    const date = addDays(startDate, d);
    const mode = input.weighInDays ?? "daily";
    const wd = weekday(date);
    const log =
      mode === "daily" ? true : mode === "4x" ? wd === 0 || wd === 1 || wd === 3 || wd === 5 : d % 3 === 0;
    if (!log) continue;
    weighIns.push({
      id: `seed-w-${seed}-${d}`,
      date,
      loggedAt: `${date}T07:05:00.000Z`,
      source: "seed",
      schemaVersion: 1,
      kg: Math.round((trueKg[d] + eps) * 10) / 10,
    });
  }

  // Food entries: one summary entry per day, split 30/45/25 P/C/F by kcal.
  const foodEntries: FoodEntry[] = [];
  const flagsByDay = new Map<number, "partial" | "fasting">();
  for (const f of input.flags ?? []) flagsByDay.set(f.day, f.status);
  for (let d = 0; d < days; d++) {
    const status = flagsByDay.get(d);
    if (status === "fasting") continue;
    const kcal = status === "partial" ? Math.round(intakeKcal[d] * 0.3) : intakeKcal[d];
    const date = addDays(startDate, d);
    foodEntries.push({
      id: `seed-f-${seed}-${d}`,
      date,
      loggedAt: `${date}T19:30:00.000Z`,
      source: "seed",
      schemaVersion: 1,
      label: "Day total",
      kcal,
      proteinG: Math.round((kcal * 0.3) / 4),
      carbsG: Math.round((kcal * 0.45) / 4),
      fatG: Math.round((kcal * 0.25) / 9),
      method: "quick",
    });
  }

  // Day flags.
  const dayFlags: Record<string, DayFlags> = {};
  for (const f of input.flags ?? []) {
    const date = addDays(startDate, f.day);
    dayFlags[date] = { ...(dayFlags[date] ?? { date }), status: f.status };
  }
  for (const e of input.events ?? []) {
    const date = addDays(startDate, e.day);
    const cur = dayFlags[date] ?? { date };
    dayFlags[date] = { ...cur, events: [...(cur.events ?? []), e.event] };
  }

  // Sleep.
  const sleepNights: SleepNight[] = [];
  if (input.sleep) {
    const s = input.sleep;
    for (let d = 0; d < days; d++) {
      if (rand() > (s.loggedShare ?? 1)) continue;
      const h = Math.min(11, Math.max(3, s.meanH + gaussian(rand) * (s.sdH ?? 0.6)));
      const date = addDays(startDate, d);
      sleepNights.push({
        id: `seed-s-${seed}-${d}`,
        date,
        loggedAt: `${date}T07:10:00.000Z`,
        source: s.source === "healthkit" ? "healthkit" : "seed",
        schemaVersion: 1,
        asleepMin: Math.round(h * 60),
        inBedMin: Math.round(h * 60 + 25),
        bedtime: "23:00",
        wakeTime: "07:00",
        wakeups: "1-2",
      });
    }
  }

  // Waist (weekly).
  const waist: WaistEntry[] = [];
  if (input.waist) {
    for (let d = 0; d < days; d += 7) {
      const date = addDays(startDate, d);
      const cm = input.waist.startCm + (input.waist.changeCm * d) / Math.max(1, days - 1) + gaussian(rand) * 0.3;
      waist.push({ id: `seed-x-${seed}-${d}`, date, loggedAt: `${date}T07:12:00.000Z`, source: "seed", schemaVersion: 1, cm: Math.round(cm * 10) / 10 });
    }
  }

  // Workouts: each lift on fixed weekdays; e1RM_adj = w × (1 + (reps + rir)/30) with reps 5, rir 2.
  const workouts: StoredWorkout[] = [];
  const byDate = new Map<LocalDate, StoredWorkout>();
  const lifts = input.lifts ?? [];
  const weekdaysFor = (perWeek: number): number[] => (perWeek >= 3 ? [1, 3, 5] : perWeek === 2 ? [1, 4] : [2]);
  for (const lift of lifts) {
    const cv = lift.cv ?? 0.03;
    const daysOfWeek = weekdaysFor(lift.perWeek);
    for (let d = 0; d < days; d++) {
      const date = addDays(startDate, d);
      if (!daysOfWeek.includes(weekday(date))) continue;
      let path = lift.startE1rm;
      if (lift.profile === "linear") {
        path = lift.startE1rm * (1 + (lift.changePct / 100) * (d / Math.max(1, days - 1)));
      } else if (lift.profile === "step") {
        const at = lift.atDay ?? goalStartDay;
        if (d >= at) path = lift.startE1rm * (1 + lift.changePct / 100);
      }
      const e1 = path * (1 + gaussian(rand) * cv);
      const topKg = e1 / (1 + 7 / 30);
      const w = byDate.get(date) ?? { completedAt: `${date}T18:00:00.000Z`, name: "[seed] Session", durationSec: 3600, exercises: [] };
      w.exercises.push({
        name: lift.name,
        sets: [
          { weight: (Math.round(topKg * 2) / 2).toFixed(1), reps: "5", rir: 2 },
          { weight: (Math.round(topKg * 0.9 * 2) / 2).toFixed(1), reps: "8", rir: 2 },
          { weight: (Math.round(topKg * 0.9 * 2) / 2).toFixed(1), reps: "8", rir: 1 },
        ],
      });
      byDate.set(date, w);
    }
  }
  for (const w of [...byDate.values()].sort((a, b) => (a.completedAt < b.completedAt ? -1 : 1))) workouts.push(w);

  const profile: PhysiqueProfile = {
    generalActivity: "moderate",
    checkInWeekday: 1,
    proteinLevel: "moderate",
    dietType: "balanced",
    sleepGoalH: 8,
    sex: "M",
    age: 30,
    heightCm: 180,
    expenditureStartDate: startDate,
    schemaVersion: 1,
    ...(input.profile ?? {}),
  };

  return {
    spec: { ...input, seed, startDate, days, preDays },
    startDate,
    endDate,
    today: endDate,
    goal,
    profile,
    weighIns,
    foodEntries,
    dayFlags,
    sleepNights,
    waist,
    workouts,
    trueKg,
    intakeKcal,
    rand,
  };
}
