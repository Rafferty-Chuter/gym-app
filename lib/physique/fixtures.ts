/**
 * Seeded synthetic scenarios for tests and the dev seed page.
 * Spec: docs/plan/02-engine-spec.md §8.4.
 *
 * Deterministic for a given `seed`. Produces repo-shaped records.
 * `intake: "toTarget"` is a closed loop: the program comes from
 * `newProgram` at goal start and is revised weekly through
 * `checkInProgram`, and the intake follows the target in effect.
 */

import { addDays, weekday, type LocalDate } from "@/lib/dates";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { ENERGY_DENSITY_KCAL_PER_KG, snapshotSeed } from "@/lib/physique/expenditure";
import { checkInProgram, newProgram, targetInEffect, type ProgramInputs } from "@/lib/physique/program";
import type {
  DayEvent,
  DayFlags,
  FoodEntry,
  PhysiqueGoal,
  PhysiqueProfile,
  PhysiqueProgram,
  SleepNight,
  SleepSegment,
  TrainingStatus,
  WaistEntry,
  WeighIn,
} from "@/lib/physique/types";

export { ENERGY_DENSITY_KCAL_PER_KG };

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

/** Separate stream for closed-loop intake noise, so the weight noise is the same in both intake modes. */
const INTAKE_STREAM_SALT = 0x5bd1e995;

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
  /**
   * `{meanKcal}` eats a fixed mean. `"toTarget"` eats the program's target in effect
   * (plus N(0, `intakeSdKcal`)), with `targetKcal ?? trueTdeeKcal` before the goal starts.
   */
  intake?: { meanKcal: number; sdKcal?: number } | "toTarget";
  /** Intake noise SD in "toTarget" mode. Default 350. */
  intakeSdKcal?: number;
  /** "toTarget" only: a persistent offset from the target in effect (−500 = eats 500 kcal under target). Default 0. */
  intakeOffsetKcal?: number;
  /**
   * First day index with food entries (default 0). Earlier days are eaten but
   * never logged, so expenditure holds at the seed until logging starts.
   */
  foodLogFromDay?: number;
  /** Pre-goal (maintenance) intake in "toTarget" mode when `trueTdeeKcal` is unset. */
  targetKcal?: number;
  goal?: { ratePctPerWeek: number; targetKg?: number; trainingStatus?: TrainingStatus; confirmed?: boolean } | null;
  /** Marginal SD of the AR(1) weight noise. Innovation SD = sd·√(1−φ²). */
  noiseSdKg?: number;
  phi?: number;
  weighInDays?: "daily" | "4x" | "sparse";
  /** Water shift at phase start. Default −1.2 kg over 5 days on a cut, +0.8 on a bulk, 0 otherwise. */
  waterStepKg?: number;
  waterStepDays?: number;
  sleep?: {
    meanH: number;
    sdH?: number;
    source?: "manual" | "healthkit";
    loggedShare?: number;
    /** S6, healthkit only: HRV (sdnn, lognormal), resting HR and a stage split on every night; the drop lowers HRV and raises RHR from `dropFromDay`. */
    hrv?: { meanMs: number; sdPct?: number; rhrBpm?: number; dropFromDay?: number; dropPct?: number; rhrRiseBpm?: number };
  } | null;
  lifts?: LiftSpec[];
  events?: Array<{ day: number; event: DayEvent }>;
  waist?: { startCm: number; changeCm: number } | null;
  /**
   * Share of what is eaten that gets logged (E1; default 1). Weight follows
   * what is eaten. In "toTarget" mode, once the goal starts, the person logs
   * about the target, so they eat target / logShare; otherwise they eat the
   * mean (or maintenance) and log that × logShare.
   */
  logShare?: number;
  /** Share of logged kcal from protein (E1; default 0.3). Fat stays 25%, carbs take the rest. */
  proteinShare?: number;
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
  /** The program built by the closed loop ("toTarget" with a goal); null otherwise. */
  program: PhysiqueProgram | null;
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
const DEFAULT_INTAKE_SD = 350;

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

  // Day flags (needed before the day loop so partial/fasting days shape the food log).
  const dayFlags: Record<string, DayFlags> = {};
  const flagsByDay = new Map<number, "partial" | "fasting">();
  for (const f of input.flags ?? []) {
    flagsByDay.set(f.day, f.status);
    const date = addDays(startDate, f.day);
    dayFlags[date] = { ...(dayFlags[date] ?? { date }), status: f.status };
  }
  for (const e of input.events ?? []) {
    const date = addDays(startDate, e.day);
    const cur = dayFlags[date] ?? { date };
    dayFlags[date] = { ...cur, events: [...(cur.events ?? []), e.event] };
  }

  // Profile, with the expenditure seed fixed at the start date (02 §4.2), as the app stores it.
  const baseProfile: PhysiqueProfile = {
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
  const expenditureSeed =
    baseProfile.expenditureSeed ??
    snapshotSeed({
      profile: baseProfile,
      goals: goal ? [goal] : [],
      startDate: baseProfile.expenditureStartDate ?? startDate,
      onboarding: { bodyweightKg: bw0 },
    }) ??
    undefined;
  const profile: PhysiqueProfile = { ...baseProfile, expenditureSeed };

  // Water step at phase start.
  const defaultWater = goal ? (goal.type === "lose" ? -1.2 : goal.type === "gain" ? 0.8 : 0) : 0;
  const waterKg = input.waterStepKg ?? defaultWater;
  const waterDays = input.waterStepDays ?? 5;

  // Intake: fixed-mean mode draws every day up front (keeps the draw order of earlier seeds).
  const intakeSpec = input.intake ?? { meanKcal: input.trueTdeeKcal ?? 2800 };
  const closedLoop = intakeSpec === "toTarget";
  const intakeRand = closedLoop ? mulberry32((seed ^ INTAKE_STREAM_SALT) >>> 0) : rand;
  const intakeSd = closedLoop ? (input.intakeSdKcal ?? DEFAULT_INTAKE_SD) : (intakeSpec.sdKcal ?? DEFAULT_INTAKE_SD);
  const intakeKcal: number[] = [];
  if (!closedLoop) {
    for (let d = 0; d < days; d++) intakeKcal.push(Math.max(800, Math.round(intakeSpec.meanKcal + gaussian(rand) * intakeSd)));
  }
  const maintenanceKcal = input.trueTdeeKcal ?? input.targetKcal ?? 2800;

  // Day loop: target → intake → true weight → weigh-in → food entry.
  const trueKg: number[] = [];
  const weighIns: WeighIn[] = [];
  const foodEntries: FoodEntry[] = [];
  const mode = input.weighInDays ?? "daily";
  const now = (today: LocalDate) => ({ today, tz: "UTC" });
  const inputsSoFar = (): ProgramInputs => ({ profile, weighIns, foodEntries, dayFlags, goals: goal ? [goal] : [] });
  let program: PhysiqueProgram | null = null;
  let kg = bw0;
  let eps = gaussian(rand) * sd;
  for (let d = 0; d < days; d++) {
    const date = addDays(startDate, d);
    const inPhase = goal ? d >= goalStartDay : false;

    if (closedLoop) {
      let target = maintenanceKcal;
      if (goal && inPhase) {
        if (d === goalStartDay) {
          program = newProgram(goal, inputsSoFar(), now(date))?.program ?? null;
        } else if (program && weekday(date) === profile.checkInWeekday) {
          program = checkInProgram(program, goal, inputsSoFar(), now(date))?.program ?? program;
        }
        target = targetInEffect(program, date)?.kcal ?? maintenanceKcal;
      }
      intakeKcal.push(Math.max(800, Math.round(target + (input.intakeOffsetKcal ?? 0) + gaussian(intakeRand) * intakeSd)));
    }

    // E1: what is eaten against what is logged.
    const share = input.logShare ?? 1;
    // Before a goal there is no target to aim the log at, so the person eats and logs part of it.
    const aimsLog = closedLoop && inPhase;
    const eaten = aimsLog ? intakeKcal[d] / share : intakeKcal[d];
    const logged = aimsLog ? intakeKcal[d] : Math.round(intakeKcal[d] * share);
    let delta = 0;
    if (input.trueTdeeKcal !== undefined) {
      delta = (eaten - input.trueTdeeKcal) / ENERGY_DENSITY_KCAL_PER_KG;
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

    eps = phi * eps + gaussian(rand) * innovationSd;
    const wd = weekday(date);
    const log = mode === "daily" ? true : mode === "4x" ? wd === 0 || wd === 1 || wd === 3 || wd === 5 : d % 3 === 0;
    if (log) {
      weighIns.push({
        id: `seed-w-${seed}-${d}`,
        date,
        loggedAt: `${date}T07:05:00.000Z`,
        source: "seed",
        schemaVersion: 1,
        kg: Math.round((trueKg[d] + eps) * 10) / 10,
      });
    }

    // Food: one summary entry per day, split 30/45/25 P/C/F by kcal.
    const status = flagsByDay.get(d);
    if (status !== "fasting" && d >= (input.foodLogFromDay ?? 0)) {
      const kcal = status === "partial" ? Math.round(logged * 0.3) : logged;
      const pShare = input.proteinShare ?? 0.3;
      foodEntries.push({
        id: `seed-f-${seed}-${d}`,
        date,
        loggedAt: `${date}T19:30:00.000Z`,
        source: "seed",
        schemaVersion: 1,
        label: "Day total",
        kcal,
        proteinG: Math.round((kcal * pShare) / 4),
        carbsG: Math.round((kcal * (0.75 - pShare)) / 4),
        fatG: Math.round((kcal * 0.25) / 9),
        method: "quick",
      });
    }
  }

  // Sleep.
  const sleepNights: SleepNight[] = [];
  if (input.sleep) {
    const s = input.sleep;
    for (let d = 0; d < days; d++) {
      if (rand() > (s.loggedShare ?? 1)) continue;
      const h = Math.min(11, Math.max(3, s.meanH + gaussian(rand) * (s.sdH ?? 0.6)));
      const date = addDays(startDate, d);
      const asleepMin = Math.round(h * 60);
      const nightRecord: SleepNight = {
        id: `seed-s-${seed}-${d}`,
        date,
        loggedAt: `${date}T07:10:00.000Z`,
        source: s.source === "healthkit" ? "healthkit" : "seed",
        schemaVersion: 1,
        asleepMin,
        inBedMin: asleepMin + 25,
        bedtime: "23:00",
        wakeTime: "07:00",
        wakeups: "1-2",
      };
      if (s.source === "healthkit" && s.hrv) {
        const dropping = s.hrv.dropFromDay != null && d >= s.hrv.dropFromDay;
        const hrvMs = s.hrv.meanMs * Math.exp((gaussian(rand) * (s.hrv.sdPct ?? 10)) / 100) * (dropping ? 1 - (s.hrv.dropPct ?? 15) / 100 : 1);
        nightRecord.hrvMs = Math.round(hrvMs * 10) / 10;
        nightRecord.hrvMethod = "sdnn";
        nightRecord.restingHr = Math.round((s.hrv.rhrBpm ?? 52) + gaussian(rand) * 1.5 + (dropping ? (s.hrv.rhrRiseBpm ?? 0) : 0));
        const deepMin = Math.round(asleepMin * Math.min(0.25, Math.max(0.1, 0.17 + gaussian(rand) * 0.03)));
        const remMin = Math.round(asleepMin * Math.min(0.3, Math.max(0.12, 0.22 + gaussian(rand) * 0.03)));
        const awakeMin = Math.round(asleepMin * 0.05);
        nightRecord.stages = { deepMin, remMin, coreMin: asleepMin - deepMin - remMin, awakeMin };
        // As the watch sends it: no "in bed" without the iPhone's Sleep schedule, and no wake-up count.
        delete nightRecord.inBedMin;
        delete nightRecord.wakeups;
        // S8: real mornings wander, and weekends run later; bedtime follows from the night's length.
        const weekend = [0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
        const wakeMin = 7 * 60 + Math.round(gaussian(rand) * 12) + (weekend ? 35 : 0);
        nightRecord.wakeTime = clockFromMin(wakeMin);
        nightRecord.bedtime = clockFromMin(wakeMin - asleepMin - awakeMin);
        nightRecord.segments = syntheticSegments(deepMin, remMin, asleepMin - deepMin - remMin, awakeMin);
      }
      sleepNights.push(nightRecord);
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

  return {
    spec: { ...input, seed, startDate, days, preDays },
    startDate,
    endDate,
    today: endDate,
    goal,
    profile,
    program,
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

function clockFromMin(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Dev-only stage segments for seeded watch nights (S8): ~90 min cycles of
 * core, deep, core and REM, deep front-loaded and REM back-loaded as in
 * a real night, with brief wakes between cycles.
 */
function syntheticSegments(deepMin: number, remMin: number, coreMin: number, awakeMin: number): SleepSegment[] {
  const cycles = Math.max(3, Math.round((deepMin + remMin + coreMin) / 90));
  const deepW = Array.from({ length: cycles }, (_, k) => cycles - k);
  const remW = Array.from({ length: cycles }, (_, k) => k + 1);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const out: SleepSegment[] = [];
  let o = 0;
  const push = (st: SleepSegment["s"], d: number) => {
    const len = Math.round(d);
    if (len <= 0) return;
    out.push({ s: st, o, d: len });
    o += len;
  };
  for (let k = 0; k < cycles; k++) {
    const core = coreMin / cycles;
    push("core", core / 2);
    push("deep", (deepMin * deepW[k]) / sum(deepW));
    push("core", core / 2);
    push("rem", (remMin * remW[k]) / sum(remW));
    if (k < cycles - 1) push("awake", awakeMin / (cycles - 1));
  }
  return out;
}
