import type { BuiltWorkout } from "@/lib/workoutBuilder";
import {
  detectOverstackedMuscles,
  detectUndercoveredMuscles,
} from "@/lib/trainingKnowledge/muscleCoverage";
import { MUSCLE_RULES } from "@/lib/trainingKnowledge/muscleRules";
import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import { assessSessionValidity } from "@/lib/trainingKnowledge/sessionValidity";
import { detectRedundantExerciseStacking as detectExerciseRedundancy } from "@/lib/trainingKnowledge/exerciseRedundancy";
import { buildSessionFatigueReview } from "@/lib/trainingKnowledge/sessionFatigueReview";

function defaultTargetsForSession(sessionType: string): MuscleRuleId[] {
  const s = sessionType.toLowerCase();
  if (s === "push") return ["chest", "delts", "triceps"];
  if (s === "pull") return ["lats_upper_back", "delts", "biceps"];
  if (s === "legs" || s === "lower") return ["quads", "hamstrings", "glutes", "calves"];
  if (s === "upper") return ["chest", "lats_upper_back", "delts", "biceps", "triceps"];
  return [];
}

export function buildSessionFeedbackFromBuiltWorkout(built: BuiltWorkout): string[] {
  const targetIds = defaultTargetsForSession(built.sessionType);
  const targetNames = targetIds.map((m) => MUSCLE_RULES[m].displayName);
  const baseSession = {
    targetMuscles: targetIds,
    exercises: built.exercises.map((e) => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
      sets: e.sets,
    })),
  };
  const validity = assessSessionValidity(baseSession);
  const under = detectUndercoveredMuscles(baseSession).filter((m) => targetIds.includes(m));
  const over = detectOverstackedMuscles(baseSession).filter((m) => targetIds.includes(m));

  const out: string[] = [];
  if (targetNames.length) out.push(`Target coverage focus: ${targetNames.join(", ")}.`);
  if (!validity.ok) out.push(`Coverage gaps: ${validity.issues.join(" ")}`);
  if (validity.warnings.length) out.push(validity.warnings[0]);
  if (under.length) out.push(`Likely under-covered: ${under.map((m) => MUSCLE_RULES[m].displayName).join(", ")}.`);
  if (over.length) out.push(`Potential overstack: ${over.map((m) => MUSCLE_RULES[m].displayName).join(", ")}.`);
  const redundancy = detectExerciseRedundancy({
    exercises: built.exercises.map((e) => ({ exerciseId: e.exerciseId })),
  });
  if (redundancy.length) out.push(redundancy[0]);
  const fatigueNotes = buildSessionFatigueReview(built);
  if (fatigueNotes.length) out.push(fatigueNotes[0]);
  return out;
}

