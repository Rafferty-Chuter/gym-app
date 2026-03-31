import { getExerciseByIdOrName, type ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";
import { validateUniformPerMuscleStructure } from "@/lib/programmeStructuralValidation";
import { MUSCLE_GROUP_RULES } from "@/lib/muscleGroupRules";
import type { ParsedProgrammeRequest, ProgrammeValidationResult, StructuredProgramme } from "./types";
import {
  countDirectMuscleSetsByStimulusForStructuredProgramme,
  countMuscleSetsByStimulusForStructuredProgramme,
} from "@/lib/muscleSetCounting";
import { mapExerciseToMuscleStimulus } from "@/lib/muscleGroupMapper";
import type { MuscleGroupId } from "@/lib/muscleGroupRules";
import {
  validateSessionAgainstTargetMuscles,
} from "@/lib/trainingKnowledge/muscleCoverage";
import { detectRedundantExerciseStacking } from "@/lib/trainingKnowledge/exerciseRedundancy";
import { validateDayStructure } from "@/lib/trainingKnowledge/dayValidity";
import {
  detectSkewedMuscleEmphasis,
  detectUnrealisticSplit,
  suggestSplitFixes,
} from "@/lib/trainingKnowledge/splitValidation";
import { getProgrammeFatigueProfile } from "@/lib/trainingKnowledge/fatigueScoring";

const MIN_EXERCISES_PER_DAY = 2;

function exerciseNameMatchesRequestedId(exerciseName: string, requestedId: string): boolean {
  const n = exerciseName.toLowerCase().trim();
  const meta = getExerciseByIdOrName(requestedId);
  if (!meta) return false;
  if (n === meta.name.toLowerCase()) return true;
  if (requestedId === "incline_dumbbell_press") {
    return /\bincline\b/.test(n) && /\bpress\b/.test(n);
  }
  if (requestedId === "flat_barbell_bench_press") {
    const flatLike =
      /\bflat\b.*\bbarbell\b.*\bbench\b|\bbarbell\b.*\bbench\b|\bbench press\b|\bbarbell bench\b/.test(n);
    return flatLike && !/\bincline\b/.test(n);
  }
  if (requestedId === "overhead_press") {
    return /\b(overhead|ohp|military)\b/.test(n) && /\bpress\b/.test(n);
  }
  if (requestedId === "jm_press") {
    return /\bjm\s*press\b/.test(n) || /\bj\.m\.\s*press\b/.test(n);
  }
  return false;
}

function requestedIdsPresent(programme: StructuredProgramme, ids: string[]): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const id of ids) {
    const hit = programme.days.some((d) => {
      const exs = Array.isArray(d.exercises) ? d.exercises : [];
      return exs.some((e) => {
        const ex = e as { exerciseName?: string };
        return typeof ex.exerciseName === "string" && exerciseNameMatchesRequestedId(ex.exerciseName, id);
      });
    });
    if (!hit) missing.push(id);
  }
  return { ok: missing.length === 0, missing };
}

function countTricepSlots(programme: StructuredProgramme): number {
  let n = 0;
  for (const d of programme.days) {
    const exs = Array.isArray(d.exercises) ? d.exercises : [];
    for (const ex of exs) {
      const row = ex as { exerciseName?: string; rationale?: string };
      const blob = `${row.exerciseName ?? ""} ${row.rationale ?? ""}`.toLowerCase();
      if (/\btriceps?\b|pushdown|skull|extension\b/.test(blob)) n += 1;
    }
  }
  return n;
}

/**
 * Validation before render: request satisfaction, per-day structure, whole programme.
 */
export function validateProgrammeAgainstRequest(
  programme: StructuredProgramme,
  parsed: ParsedProgrammeRequest,
  requestedExerciseIds: string[],
  hardExerciseRequirement: boolean
): ProgrammeValidationResult {
  const requestIssues: string[] = [];
  const softIssues: string[] = [];
  const effectiveWeeklySessions = Math.max(parsed.frequency ?? 0, programme.days.length);
  // Low-frequency plans (e.g. 2-day upper/lower) should not be hard-failed by full-week hypertrophy minima.
  const isLowFrequencyPlan = effectiveWeeklySessions > 0 && effectiveWeeklySessions <= 3;

  if (requestedExerciseIds.length > 0) {
    const pres = requestedIdsPresent(programme, requestedExerciseIds);
    if (hardExerciseRequirement && !pres.ok) {
      requestIssues.push(`Missing requested exercises: ${pres.missing.join(", ")}`);
    }
  }

  const u = parsed.structuralConstraints?.uniformPerMuscleExerciseCount;
  if (u != null && u > 0) {
    const sv = validateUniformPerMuscleStructure(programme, parsed, u);
    if (!sv.ok) {
      requestIssues.push(...sv.issues);
    }
  }

  if (parsed.fatigueMode === "low_fatigue") {
    const totalSetsApprox = programme.days.reduce((acc, d) => {
      const exercises = Array.isArray(d.exercises) ? d.exercises : [];
      return (
        acc +
        exercises.reduce((sum: number, ex) => {
          const row = ex as { sets?: string };
          const m = typeof row.sets === "string" ? row.sets.match(/\d+/g) : null;
          const n = m ? Math.max(...m.map(Number)) : 3;
          return sum + n;
        }, 0)
      );
    }, 0);
    if (totalSetsApprox > 120) {
      requestIssues.push("Programme still looks high-volume for a low-fatigue request");
    }
  }

  if (parsed.emphasis?.includes("triceps") || parsed.requestedChanges?.includes("triceps")) {
    if (countTricepSlots(programme) < 2) {
      requestIssues.push("Triceps emphasis requested but few triceps-pattern slots detected");
    }
  }

  const dayIssues: string[] = [];
  programme.days.forEach((d, i) => {
    if (!d.exercises || d.exercises.length < MIN_EXERCISES_PER_DAY) {
      dayIssues.push(`Day ${i + 1} (${d.dayLabel}) has fewer than ${MIN_EXERCISES_PER_DAY} exercises`);
    }
    const sessionCoverage = validateSessionAgainstTargetMuscles(
      {
        targetMuscles: d.targetMuscles,
        exercises: d.exercises?.map((e) => ({
          exerciseName: e.exerciseName,
          sets: e.sets,
        })),
      },
      d.targetMuscles ?? []
    );
    if (!sessionCoverage.ok) {
      dayIssues.push(`Day ${i + 1} (${d.dayLabel}) coverage gaps: ${sessionCoverage.issues.join("; ")}`);
    }
    const dayStructure = validateDayStructure({
      dayLabel: d.dayLabel,
      targetMuscles: d.targetMuscles,
      exercises: d.exercises?.map((e) => ({ exerciseName: e.exerciseName })),
    });
    if (!dayStructure.ok) {
      dayIssues.push(`Day ${i + 1} (${d.dayLabel}) structure issues: ${dayStructure.issues.join("; ")}`);
    } else if (dayStructure.warnings.length) {
      softIssues.push(`Day ${i + 1} (${d.dayLabel}) warnings: ${dayStructure.warnings.slice(0, 1).join("; ")}`);
    }
  });
  softIssues.push(
    ...detectRedundantExerciseStacking({
      days: programme.days.map((d) => ({
        exercises: d.exercises?.map((e) => ({ exerciseName: e.exerciseName, sets: e.sets })),
      })),
    })
  );

  // v1 hypertrophy validation: per-muscle direct/total set-count checks.
  // This is a heuristic: we rebuild once if a muscle is likely under-covered or overstacked.
  const directWeeklySets = countDirectMuscleSetsByStimulusForStructuredProgramme(programme);
  const totalWeeklySets = countMuscleSetsByStimulusForStructuredProgramme(programme);
  const allExercisesMeta: ExerciseMetadata[] = programme.days
    .flatMap((day) => day.exercises ?? [])
    .map((ex) => getExerciseByIdOrName(ex.exerciseName))
    .filter((m): m is ExerciseMetadata => Boolean(m));
  const intendedMuscles = new Set<string>();
  for (const day of programme.days ?? []) {
    for (const t of day.targetMuscles ?? []) {
      // programme pipeline uses tokens like "back", "shoulders", "quads"... map these via exercise mapping logic
      // by reusing mapExerciseToMuscleStimulus token mapping: do it through a synthetic exercise is overkill;
      // instead, use a small token-to-rule mapping based on existing split tokens.
      const norm = String(t).toLowerCase().trim();
      if (norm === "back" || norm === "lats_upper_back") intendedMuscles.add("lats_upper_back");
      else if (norm === "shoulders" || norm === "delts") intendedMuscles.add("delts");
      else if (norm === "chest") intendedMuscles.add("chest");
      else if (norm === "biceps") intendedMuscles.add("biceps");
      else if (norm === "triceps") intendedMuscles.add("triceps");
      else if (norm === "quads") intendedMuscles.add("quads");
      else if (norm === "hamstrings") intendedMuscles.add("hamstrings");
      else if (norm === "glutes") intendedMuscles.add("glutes");
      else if (norm === "calves") intendedMuscles.add("calves");
      else if (norm === "abs" || norm === "core" || norm === "abs_core") intendedMuscles.add("abs_core");
    }
  }

  for (const g of Array.from(intendedMuscles)) {
    const rule = (MUSCLE_GROUP_RULES as Record<string, any>)[g];
    if (!rule) continue;
    const direct = directWeeklySets[g as MuscleGroupId] ?? 0;
    const total = totalWeeklySets[g as MuscleGroupId] ?? 0;

    if (rule.directWorkUsuallyNeeded) {
      if (direct < rule.typicalWeeklySetRange.min) {
        const msg = `${rule.displayName} is under-covered for hypertrophy: ~${Math.round(
          direct
        )} direct sets (practical min ${rule.typicalWeeklySetRange.min}).`;
        if (isLowFrequencyPlan) softIssues.push(msg);
        else requestIssues.push(msg);
      }
    } else {
      if (total < rule.typicalWeeklySetRange.min) {
        const msg = `${rule.displayName} is under-covered for hypertrophy: ~${Math.round(
          total
        )} total sets (practical min ${rule.typicalWeeklySetRange.min}).`;
        if (isLowFrequencyPlan) softIssues.push(msg);
        else requestIssues.push(msg);
      }
    }

    if (total > rule.typicalWeeklySetRange.high * 1.25) {
      requestIssues.push(
        `${rule.displayName} volume looks overstacked: ~${Math.round(total)} total sets (practical high ${rule.typicalWeeklySetRange.high}).`
      );
    }

    // v1 long-length bias heuristic: if a muscle is under-covered and it benefits from long-length work,
    // require at least one stretch-biased direct exercise.
    if (rule.longLengthBias === "high" && direct < rule.typicalWeeklySetRange.target) {
      let hasStretch = false;
      for (const day of programme.days ?? []) {
        for (const ex of day.exercises ?? []) {
          const meta = getExerciseByIdOrName(ex.exerciseName);
          if (!meta) continue;
          if (meta.lengthBias !== "stretch_biased") continue;
          const stim = mapExerciseToMuscleStimulus(meta);
          if (stim.direct.includes(g as MuscleGroupId)) {
            hasStretch = true;
            break;
          }
        }
        if (hasStretch) break;
      }
      if (!hasStretch) {
        const msg = `${rule.displayName} likely benefits from long-length work (stretch-biased patterns) but none were detected.`;
        if (isLowFrequencyPlan) softIssues.push(msg);
        else requestIssues.push(msg);
      }
    }
  }

  // v1 movement-pattern coverage checks (heuristic; only fires when a muscle is at least somewhat present).
  const hasStim = (group: MuscleGroupId) =>
    allExercisesMeta.some((m) => mapExerciseToMuscleStimulus(m).direct.includes(group));

  const hasVerticalPull = allExercisesMeta.some((m) => m.tags.includes("vertical_pull") || m.movementPattern.includes("vertical_pull"));
  const hasHorizontalPull = allExercisesMeta.some((m) => m.tags.includes("horizontal_pull") || m.movementPattern.includes("horizontal_pull"));

  if (intendedMuscles.has("lats_upper_back") && hasStim("lats_upper_back")) {
    if (!hasVerticalPull) {
      const msg = "Upper back/lats: missing a vertical pull pattern (pulldown / pull-up).";
      if (isLowFrequencyPlan) softIssues.push(msg);
      else requestIssues.push(msg);
    }
    if (!hasHorizontalPull) {
      const msg = "Upper back/lats: missing a horizontal pull pattern (row).";
      if (isLowFrequencyPlan) softIssues.push(msg);
      else requestIssues.push(msg);
    }
  }

  const hasHamHinge = allExercisesMeta.some((m) => m.tags.includes("hip_hinge") || m.movementPattern.includes("hip_hinge"));
  const hasHamCurl = allExercisesMeta.some((m) => m.role === "isolation" && mapExerciseToMuscleStimulus(m).direct.includes("hamstrings"));
  if (intendedMuscles.has("hamstrings") && hasStim("hamstrings")) {
    if (!hasHamHinge) {
      const msg = "Hamstrings: missing a hinge/RDL-style pattern for hip hinge work.";
      if (isLowFrequencyPlan) softIssues.push(msg);
      else requestIssues.push(msg);
    }
    if (!hasHamCurl) {
      const msg = "Hamstrings: missing a knee-curl / hamstring isolation pattern.";
      if (isLowFrequencyPlan) softIssues.push(msg);
      else requestIssues.push(msg);
    }
  }

  const hasQuadCompound = allExercisesMeta.some(
    (m) => (m.role === "main_compound" || m.role === "machine_compound" || m.role === "secondary_compound") && mapExerciseToMuscleStimulus(m).direct.includes("quads")
  );
  const hasQuadIso = allExercisesMeta.some((m) => m.role === "isolation" && mapExerciseToMuscleStimulus(m).direct.includes("quads"));
  if (intendedMuscles.has("quads") && hasStim("quads")) {
    if (!hasQuadCompound) {
      const msg = "Quads: missing a quad compound (squat/leg press family).";
      if (isLowFrequencyPlan) softIssues.push(msg);
      else requestIssues.push(msg);
    }
    if (!hasQuadIso) {
      const msg =
        "Quads: missing a direct quad isolation pattern (leg extension / quad-focused isolation).";
      if (isLowFrequencyPlan) softIssues.push(msg);
      else requestIssues.push(msg);
    }
  }

  const hasCalfStanding = allExercisesMeta.some((m) => m.id.includes("standing") || m.name.toLowerCase().includes("standing") || m.name.toLowerCase().includes("standing / seated"));
  const hasCalfSeated = allExercisesMeta.some((m) => m.id.includes("seated") || m.name.toLowerCase().includes("seated calf"));
  if (intendedMuscles.has("calves") && hasStim("calves")) {
    if (!hasCalfStanding) {
      const msg = "Calves: missing standing calf raise style work (gastroc bias).";
      if (isLowFrequencyPlan) softIssues.push(msg);
      else requestIssues.push(msg);
    }
    if (!hasCalfSeated) {
      const msg = "Calves: missing seated calf raise style work (soleus bias).";
      if (isLowFrequencyPlan) softIssues.push(msg);
      else requestIssues.push(msg);
    }
  }

  const progIssues: string[] = [];
  if (!programme.days.length) progIssues.push("Programme has no days");
  if (programme.days.some((d) => !Array.isArray(d.exercises) || d.exercises.length === 0)) {
    progIssues.push("One or more days are empty");
  }
  const splitUnrealistic = detectUnrealisticSplit(programme);
  if (splitUnrealistic.length) softIssues.push(...splitUnrealistic);
  const skewed = detectSkewedMuscleEmphasis(programme);
  if (skewed.length) softIssues.push(`Potential skewed split emphasis: ${skewed.join(", ")}`);
  const splitFixes = suggestSplitFixes(programme);
  if (splitFixes.length) softIssues.push(`Split fix suggestions: ${splitFixes.slice(0, 2).join(" ")}`);
  const fatigueProfile = getProgrammeFatigueProfile(programme);
  const highDays = fatigueProfile.dayScores.filter((d) => d.classification === "high");
  if (highDays.length >= 2) {
    softIssues.push(
      `Fatigue/recovery warning: multiple high-fatigue days detected (${highDays
        .map((d) => d.dayLabel)
        .join(", ")}).`
    );
  }

  const allIssues = [...requestIssues, ...dayIssues, ...progIssues];
  const ok = allIssues.length === 0;

  const result: ProgrammeValidationResult = {
    ok,
    requestSatisfaction: { ok: requestIssues.length === 0, issues: requestIssues },
    dayValidity: { ok: dayIssues.length === 0, issues: dayIssues },
    programmeValidity: { ok: progIssues.length === 0, issues: progIssues },
    allIssues,
  };

  console.log("[programme-validated]", {
    ok: result.ok,
    requestSatisfaction: result.requestSatisfaction.ok,
    dayValidity: result.dayValidity.ok,
    programmeValidity: result.programmeValidity.ok,
    issues: result.allIssues,
    softIssues,
    effectiveWeeklySessions,
    isLowFrequencyPlan,
  });
  return result;
}
