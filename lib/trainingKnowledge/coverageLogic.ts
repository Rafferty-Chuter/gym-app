import type { MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import { MUSCLE_RULES } from "@/lib/trainingKnowledge/muscleRules";
import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import { mapExerciseToMuscleStimulus, mapTargetTokenToMuscleGroup } from "@/lib/muscleGroupMapper";

type ExerciseLike = {
  exerciseName?: string;
  exerciseId?: string;
  sets?: { min: number; max: number } | string;
};

type SessionLike = {
  targetMuscles?: string[];
  exercises?: ExerciseLike[];
};

type ProgrammeLike = {
  days?: SessionLike[];
};

export type CoverageSummary = {
  directSetsByMuscle: Record<MuscleRuleId, number>;
  indirectSetsByMuscle: Record<MuscleRuleId, number>;
  totalSetsByMuscle: Record<MuscleRuleId, number>;
  undercovered: MuscleRuleId[];
  overstacked: MuscleRuleId[];
};

function emptyMap(): Record<MuscleRuleId, number> {
  return Object.fromEntries(
    (Object.keys(MUSCLE_RULES) as MuscleRuleId[]).map((k) => [k, 0])
  ) as Record<MuscleRuleId, number>;
}

function parseSetCount(sets: ExerciseLike["sets"]): number {
  if (!sets) return 0;
  if (typeof sets === "string") {
    const nums = sets.match(/\d+/g)?.map(Number).filter(Number.isFinite) ?? [];
    return nums.length ? Math.max(...nums) : 0;
  }
  return Math.max(sets.min ?? 0, sets.max ?? 0);
}

function sessionsFromInput(input: SessionLike | ProgrammeLike): SessionLike[] {
  if (Array.isArray((input as ProgrammeLike).days)) return (input as ProgrammeLike).days ?? [];
  return [input as SessionLike];
}

export function evaluateMuscleCoverage(input: SessionLike | ProgrammeLike): CoverageSummary {
  const direct = emptyMap();
  const indirect = emptyMap();
  for (const session of sessionsFromInput(input)) {
    for (const row of session.exercises ?? []) {
      const key = row.exerciseId ?? row.exerciseName ?? "";
      const meta = getExerciseByIdOrName(key);
      if (!meta) continue;
      const sets = parseSetCount(row.sets);
      if (!sets) continue;
      const stim = mapExerciseToMuscleStimulus(meta);
      for (const m of stim.direct as MuscleRuleId[]) direct[m] += sets / Math.max(1, stim.direct.length);
      for (const m of stim.indirect as MuscleRuleId[])
        indirect[m] += (sets / Math.max(1, stim.indirect.length)) * 0.5;
    }
  }

  const total = emptyMap();
  for (const m of Object.keys(MUSCLE_RULES) as MuscleRuleId[]) total[m] = direct[m] + indirect[m];
  const undercovered: MuscleRuleId[] = [];
  const overstacked: MuscleRuleId[] = [];
  for (const m of Object.keys(MUSCLE_RULES) as MuscleRuleId[]) {
    const rule = MUSCLE_RULES[m];
    const base = rule.directWorkUsuallyNeeded ? direct[m] : total[m];
    if (base < rule.typicalWeeklySetRange.min) undercovered.push(m);
    if (total[m] > rule.typicalWeeklySetRange.high * 1.25) overstacked.push(m);
  }
  return {
    directSetsByMuscle: direct,
    indirectSetsByMuscle: indirect,
    totalSetsByMuscle: total,
    undercovered,
    overstacked,
  };
}

export function getDirectWorkForMuscle(input: SessionLike | ProgrammeLike, muscle: MuscleRuleId): number {
  return evaluateMuscleCoverage(input).directSetsByMuscle[muscle] ?? 0;
}

export function getIndirectWorkForMuscle(input: SessionLike | ProgrammeLike, muscle: MuscleRuleId): number {
  return evaluateMuscleCoverage(input).indirectSetsByMuscle[muscle] ?? 0;
}

export function detectUndercoveredMuscles(input: SessionLike | ProgrammeLike): MuscleRuleId[] {
  return evaluateMuscleCoverage(input).undercovered;
}

export function detectOverstackedMuscles(input: SessionLike | ProgrammeLike): MuscleRuleId[] {
  return evaluateMuscleCoverage(input).overstacked;
}

export function detectRedundantExerciseStacking(input: SessionLike | ProgrammeLike): string[] {
  const out: string[] = [];
  for (const session of sessionsFromInput(input)) {
    const seen = new Map<string, number>();
    for (const row of session.exercises ?? []) {
      const key = row.exerciseId ?? row.exerciseName ?? "";
      const meta = getExerciseByIdOrName(key);
      if (!meta?.redundancyGroup) continue;
      const n = (seen.get(meta.redundancyGroup) ?? 0) + 1;
      seen.set(meta.redundancyGroup, n);
    }
    for (const [group, n] of seen) {
      if (n >= 3) out.push(`Potential redundancy: ${n} exercises from ${group} group in one session.`);
    }
  }
  return out;
}

export function suggestMissingWorkForMuscle(input: SessionLike | ProgrammeLike, muscle: MuscleRuleId): string {
  const rule = MUSCLE_RULES[muscle];
  const direct = getDirectWorkForMuscle(input, muscle);
  if (direct >= rule.typicalPerSessionSetRange.min) {
    return `${rule.displayName}: coverage is reasonable; prioritize progression quality before adding more volume.`;
  }
  return `${rule.displayName}: likely under-covered. Add direct work using patterns like ${rule.keyMovementPatterns.join(
    ", "
  )}.`;
}

export function validateSessionAgainstTargetMuscles(
  session: SessionLike,
  targetMuscles: string[]
): { ok: boolean; issues: string[] } {
  const issues: string[] = [];
  const coverage = evaluateMuscleCoverage(session);
  const targets = targetMuscles
    .map((t) => mapTargetTokenToMuscleGroup(t))
    .filter((m): m is MuscleRuleId => Boolean(m));
  for (const t of targets) {
    const rule = MUSCLE_RULES[t];
    const base = rule.directWorkUsuallyNeeded
      ? coverage.directSetsByMuscle[t]
      : coverage.totalSetsByMuscle[t];
    if (base < rule.typicalPerSessionSetRange.min) {
      issues.push(`${rule.displayName} is below practical per-session coverage.`);
    }
  }
  return { ok: issues.length === 0, issues };
}

