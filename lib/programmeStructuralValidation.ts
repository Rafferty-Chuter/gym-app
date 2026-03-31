import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import { assignExerciseToDayTarget } from "@/lib/muscleQuotaCounting";
import type { AssistantStructuredProgramme, ParsedProgrammeRequest } from "@/lib/programmePipeline/types";

export type DayMuscleCountReport = {
  dayLabel: string;
  targetMuscles: string[];
  expectedPerTarget: Record<string, number>;
  countedByTarget: Record<string, number>;
  unmatchedExerciseNames: string[];
};

export type StructuralValidationResult = {
  ok: boolean;
  issues: string[];
  dayReports: DayMuscleCountReport[];
};

function expectedQuotasForDay(
  targetMuscles: string[] | undefined,
  uniform: number,
  parsed: ParsedProgrammeRequest
): Record<string, number> {
  const sc = parsed.structuralConstraints;
  const mins = sc?.perMuscleMinimums ?? {};
  const maxs = sc?.perMuscleMaximums ?? {};
  const out: Record<string, number> = {};
  const targets = (targetMuscles ?? []).map((t) => t.toLowerCase());
  for (const t of targets) {
    let n = uniform;
    if (mins[t] != null) n = Math.max(n, mins[t]!);
    if (maxs[t] != null) n = Math.min(n, maxs[t]!);
    out[t] = Math.max(1, Math.min(6, n));
  }
  return out;
}

/**
 * Validate uniform per-muscle counts using primary-muscle assignment (same rules as quota builder).
 */
export function validateUniformPerMuscleStructure(
  programme: AssistantStructuredProgramme,
  parsed: ParsedProgrammeRequest,
  uniform: number
): StructuralValidationResult {
  const issues: string[] = [];
  const dayReports: DayMuscleCountReport[] = [];

  programme.days.forEach((day, idx) => {
    const targets = day.targetMuscles?.length ? day.targetMuscles : [];
    if (targets.length === 0) {
      dayReports.push({
        dayLabel: day.dayLabel,
        targetMuscles: [],
        expectedPerTarget: {},
        countedByTarget: {},
        unmatchedExerciseNames: [],
      });
      return;
    }

    const expected = expectedQuotasForDay(targets, uniform, parsed);
    const counted: Record<string, number> = Object.fromEntries(targets.map((t) => [t.toLowerCase(), 0]));
    const unmatched: string[] = [];

    for (const row of day.exercises ?? []) {
      const name = row.exerciseName?.trim();
      if (!name) continue;
      const meta = getExerciseByIdOrName(name);
      if (!meta) {
        unmatched.push(name);
        continue;
      }
      const bucket = assignExerciseToDayTarget(meta, targets.map((t) => t.toLowerCase()));
      if (!bucket) {
        unmatched.push(name);
        continue;
      }
      const k = bucket.toLowerCase();
      if (counted[k] !== undefined) counted[k] += 1;
    }

    for (const t of targets.map((x) => x.toLowerCase())) {
      const exp = expected[t] ?? uniform;
      const got = counted[t] ?? 0;
      if (got !== exp) {
        issues.push(
          `Day ${idx + 1} (${day.dayLabel}): "${t}" expected ${exp} primary-muscle exercises, got ${got}`
        );
      }
    }

    dayReports.push({
      dayLabel: day.dayLabel,
      targetMuscles: targets,
      expectedPerTarget: expected,
      countedByTarget: counted,
      unmatchedExerciseNames: unmatched,
    });
  });

  const ok = issues.length === 0;
  console.log("[structural-constraints-validation]", {
    ok,
    uniform,
    issues,
    dayReports: dayReports.map((d) => ({
      dayLabel: d.dayLabel,
      expected: d.expectedPerTarget,
      counted: d.countedByTarget,
      unmatched: d.unmatchedExerciseNames,
    })),
  });

  return { ok, issues, dayReports };
}
