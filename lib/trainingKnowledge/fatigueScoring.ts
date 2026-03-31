import type { AssistantStructuredProgramme } from "@/lib/programmePipeline/types";
import type { BuiltWorkout } from "@/lib/workoutBuilder";
import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import {
  EXERCISE_FATIGUE_RULES,
  SESSION_FATIGUE_RULES,
  type FatigueMode,
} from "@/lib/trainingKnowledge/fatigueRules";

function parseRirMin(rir?: string): number {
  if (!rir) return 2;
  const nums = rir.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  return nums.length ? Math.min(...nums) : 2;
}

function parseRepMin(reps?: string): number {
  if (!reps) return 8;
  const nums = reps.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  return nums.length ? Math.min(...nums) : 8;
}

function parseSetMax(sets?: string): number {
  if (!sets) return 3;
  const nums = sets.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
  return nums.length ? Math.max(...nums) : 3;
}

export function getSetFatigueScore(setContext: {
  exerciseRole: keyof typeof EXERCISE_FATIGUE_RULES;
  rirMin?: number;
  repMin?: number;
}): number {
  const rule = EXERCISE_FATIGUE_RULES[setContext.exerciseRole] ?? EXERCISE_FATIGUE_RULES.secondary_compound;
  const nearFailure = (setContext.rirMin ?? 2) <= 1;
  const heavy = (setContext.repMin ?? 8) <= 6;
  let score = rule.baseSetCost;
  if (nearFailure) score *= rule.failureMultiplier;
  if (heavy) score *= rule.heavyLoadMultiplier;
  return score;
}

export function getExerciseFatigueScore(
  exercise: { exerciseId?: string; exerciseName?: string; sets?: string; reps?: string; rir?: string },
  mode: FatigueMode = "normal"
): number {
  const meta = getExerciseByIdOrName(exercise.exerciseId ?? exercise.exerciseName ?? "");
  if (!meta) return 0;
  const role = (meta.role in EXERCISE_FATIGUE_RULES ? meta.role : "secondary_compound") as keyof typeof EXERCISE_FATIGUE_RULES;
  const perSet = getSetFatigueScore({
    exerciseRole: role,
    rirMin: parseRirMin(exercise.rir),
    repMin: parseRepMin(exercise.reps),
  });
  const setCount = parseSetMax(exercise.sets);
  const raw = perSet * setCount;
  return mode === "low_fatigue" ? raw * 0.6 : raw;
}

export function getSessionFatigueScore(
  session: {
    sessionType: keyof typeof SESSION_FATIGUE_RULES;
    exercises: Array<{ exerciseId?: string; exerciseName?: string; sets?: string; reps?: string; rir?: string }>;
  },
  mode: FatigueMode = "normal"
): number {
  const total = session.exercises.reduce((sum, ex) => sum + getExerciseFatigueScore(ex, mode), 0);
  return Number(total.toFixed(1));
}

export function classifySessionFatigue(
  score: number,
  sessionType: keyof typeof SESSION_FATIGUE_RULES
): "low" | "moderate" | "high" {
  const rule = SESSION_FATIGUE_RULES[sessionType];
  if (score >= rule.highFatigueThreshold) return "high";
  if (score <= rule.softCap * 0.6) return "low";
  return "moderate";
}

export function getProgrammeFatigueProfile(programme: AssistantStructuredProgramme): {
  dayScores: Array<{ dayLabel: string; score: number; classification: "low" | "moderate" | "high" }>;
  weeklyScore: number;
} {
  const dayScores = programme.days.map((d) => {
    const sType = (d.sessionType in SESSION_FATIGUE_RULES ? d.sessionType : "upper") as keyof typeof SESSION_FATIGUE_RULES;
    const score = getSessionFatigueScore(
      {
        sessionType: sType,
        exercises: d.exercises.map((e) => ({
          exerciseName: e.exerciseName,
          sets: e.sets,
          reps: e.reps,
          rir: e.rir,
        })),
      },
      "normal"
    );
    return { dayLabel: d.dayLabel, score, classification: classifySessionFatigue(score, sType) };
  });
  const weeklyScore = Number(dayScores.reduce((s, d) => s + d.score, 0).toFixed(1));
  return { dayScores, weeklyScore };
}

export function detectOverfatiguingSession(
  built: BuiltWorkout,
  mode: FatigueMode = "normal"
): boolean {
  const score = getSessionFatigueScore(
    {
      sessionType: built.sessionType,
      exercises: built.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        sets: `${e.sets.min}-${e.sets.max}`,
        reps: `${e.repRange.min}-${e.repRange.max}`,
        rir: `${e.rirRange.min}-${e.rirRange.max}`,
      })),
    },
    mode
  );
  const rule = SESSION_FATIGUE_RULES[built.sessionType];
  return score >= rule.highFatigueThreshold;
}

export function detectJunkVolumeRisk(built: BuiltWorkout): boolean {
  const score = getSessionFatigueScore({
    sessionType: built.sessionType,
    exercises: built.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      sets: `${e.sets.min}-${e.sets.max}`,
      reps: `${e.repRange.min}-${e.repRange.max}`,
      rir: `${e.rirRange.min}-${e.rirRange.max}`,
    })),
  });
  return built.exercises.length >= 7 && classifySessionFatigue(score, built.sessionType) === "high";
}

