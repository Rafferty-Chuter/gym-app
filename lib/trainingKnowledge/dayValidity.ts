import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import { detectRedundantExerciseStacking } from "@/lib/trainingKnowledge/exerciseRedundancy";
import {
  DAY_TYPE_RULES,
  inferDayTypeFromTargets,
  type DayType,
} from "@/lib/trainingKnowledge/sessionTemplates";

type SessionExercise = {
  exerciseName?: string;
  exerciseId?: string;
};

type SessionLike = {
  targetMuscles?: string[];
  exercises?: SessionExercise[];
  dayLabel?: string;
};

function countCompounds(session: SessionLike): number {
  return (session.exercises ?? []).filter((e) => {
    const meta = getExerciseByIdOrName(e.exerciseId ?? e.exerciseName ?? "");
    if (!meta) return false;
    return (
      meta.role === "main_compound" ||
      meta.role === "secondary_compound" ||
      meta.role === "machine_compound"
    );
  }).length;
}

function movementPatterns(session: SessionLike): string[] {
  return (session.exercises ?? [])
    .map((e) => getExerciseByIdOrName(e.exerciseId ?? e.exerciseName ?? ""))
    .filter(Boolean)
    .map((m) => String(m!.movementPattern).toLowerCase());
}

export function detectMissingPrimaryGroupCoverage(
  session: SessionLike,
  targetMuscles: string[]
): string[] {
  const names = (session.exercises ?? [])
    .map((e) => getExerciseByIdOrName(e.exerciseId ?? e.exerciseName ?? ""))
    .filter(Boolean)
    .flatMap((m) => [...m!.primaryMuscles, ...m!.secondaryMuscles])
    .map((m) => m.toLowerCase());
  const out: string[] = [];
  for (const t of targetMuscles.map((x) => x.toLowerCase())) {
    const hit = names.some((m) => m.includes(t) || t.includes(m));
    if (!hit) out.push(t);
  }
  return out;
}

export function detectUnderbuiltDay(session: SessionLike, dayType?: DayType): string[] {
  const inferred = dayType ?? inferDayTypeFromTargets(session.targetMuscles ?? []);
  const rule = DAY_TYPE_RULES[inferred];
  const issues: string[] = [];
  const count = session.exercises?.length ?? 0;
  if (count < rule.typicalExerciseCountRange.min) issues.push(`Too few exercises for ${inferred}.`);
  if (countCompounds(session) < rule.requiredCompoundSlots)
    issues.push(`${inferred} needs at least ${rule.requiredCompoundSlots} compound movement(s).`);
  const patterns = movementPatterns(session);
  for (const p of rule.requiredMovementPatterns) {
    if (p.includes("_or_")) {
      const ok = p.split("_or_").some((x) => patterns.some((mp) => mp.includes(x)));
      if (!ok) issues.push(`Missing movement pattern requirement: ${p}`);
      continue;
    }
    if (!patterns.some((mp) => mp.includes(p))) issues.push(`Missing movement pattern requirement: ${p}`);
  }
  return issues;
}

export function detectBloatedDay(session: SessionLike, dayType?: DayType): string[] {
  const inferred = dayType ?? inferDayTypeFromTargets(session.targetMuscles ?? []);
  const rule = DAY_TYPE_RULES[inferred];
  const count = session.exercises?.length ?? 0;
  if (count > rule.typicalExerciseCountRange.max) {
    return [`${inferred} day looks bloated (${count} exercises).`];
  }
  return [];
}

export function detectDayRedundancy(session: SessionLike): string[] {
  return detectRedundantExerciseStacking({
    exercises: (session.exercises ?? []).map((e) => ({
      exerciseId: e.exerciseId,
      exerciseName: e.exerciseName,
    })),
  });
}

export function suggestFixesForDay(session: SessionLike, dayType?: DayType): string[] {
  const inferred = dayType ?? inferDayTypeFromTargets(session.targetMuscles ?? []);
  const fixes: string[] = [];
  const under = detectUnderbuiltDay(session, inferred);
  const bloated = detectBloatedDay(session, inferred);
  if (under.length) fixes.push("Add one missing primary pattern before adding extra accessories.");
  if (bloated.length) fixes.push("Drop one overlapping movement and keep compounds + one targeted accessory.");
  const redundancy = detectDayRedundancy(session);
  if (redundancy.length) fixes.push("Replace one overlapping movement with a complementary pattern.");
  return fixes;
}

export function validateDayStructure(
  session: SessionLike,
  dayType?: DayType
): { ok: boolean; issues: string[]; warnings: string[] } {
  const inferred = dayType ?? inferDayTypeFromTargets(session.targetMuscles ?? []);
  const issues = [
    ...detectUnderbuiltDay(session, inferred),
    ...detectBloatedDay(session, inferred),
  ];
  const missing = detectMissingPrimaryGroupCoverage(session, session.targetMuscles ?? []);
  const warnings: string[] = [];
  if (missing.length) warnings.push(`Missing clear muscle coverage for: ${missing.join(", ")}.`);
  warnings.push(...detectDayRedundancy(session));
  warnings.push(...suggestFixesForDay(session, inferred));
  return { ok: issues.length === 0, issues, warnings };
}

