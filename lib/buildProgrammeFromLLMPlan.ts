import { randomUUID } from "crypto";
import { formatIntRange } from "@/lib/formatPrescriptionDisplay";
import { scoreDayForExercise } from "@/lib/muscleDayBuilder";
import { getPrescriptionForExercise } from "@/lib/prescriptionDefaults";
import { getExerciseById } from "@/lib/exerciseMetadataLibrary";
import type { AssistantStructuredProgramme } from "@/lib/programmePipeline/types";
import type { ProgrammeStructureLLMOutput } from "@/lib/extractProgrammeStructureLLM";

export type BuildProgrammeFromLLMPlanParams = {
  plan: ProgrammeStructureLLMOutput;
  message: string;
  programmeTitleHint?: string;
  requestedExerciseIds: string[];
  excludedExerciseIds: string[];
};

export type BuildProgrammeFromLLMPlanResult = {
  programme: AssistantStructuredProgramme | null;
  issues: string[];
};

function splitTitle(splitType: ProgrammeStructureLLMOutput["splitType"]): string {
  if (splitType === "ppl") return "Push / Pull / Legs";
  if (splitType === "upper_lower") return "Upper / Lower";
  if (splitType === "full_body") return "Full body";
  if (splitType === "custom") return "Custom split";
  return "Structured programme";
}

export function buildProgrammeFromLLMPlan(
  params: BuildProgrammeFromLLMPlanParams
): BuildProgrammeFromLLMPlanResult {
  const issues: string[] = [];
  const excluded = new Set(params.excludedExerciseIds);
  const seenGlobal = new Set<string>();
  const days = params.plan.days.map((d, idx) => {
    const dayExercises = d.exerciseIds
      .filter((id) => !excluded.has(id))
      .map((id) => getExerciseById(id))
      .filter((ex): ex is NonNullable<ReturnType<typeof getExerciseById>> => Boolean(ex))
      .slice(0, 10)
      .map((ex, i) => {
        seenGlobal.add(ex.id);
        const p = getPrescriptionForExercise(ex).adjusted;
        return {
          slotLabel: `Exercise ${i + 1}`,
          exerciseName: ex.name,
          sets: formatIntRange(p.sets),
          reps: formatIntRange(p.repRange),
          rir: formatIntRange(p.rirRange),
          rest: `${formatIntRange(p.restSeconds)}s`,
          rationale: "Planned by LLM structure and mapped to library prescriptions.",
        };
      });
    return {
      dayLabel: `Day ${idx + 1} - ${d.dayLabel}`,
      sessionType: d.dayLabel.toLowerCase(),
      purposeSummary: `LLM-planned ${d.dayLabel} session mapped to deterministic prescriptions.`,
      targetMuscles: d.targetMuscles,
      exercises: dayExercises,
    };
  });

  if (days.length < 2) issues.push("Need at least 2 programme days.");
  for (const d of days) {
    if (!d.targetMuscles || d.targetMuscles.length === 0) issues.push(`${d.dayLabel} has no target muscles.`);
    if (d.exercises.length < 3) issues.push(`${d.dayLabel} has too few exercises (${d.exercises.length}).`);
  }

  const requestedMissing = params.requestedExerciseIds.filter((id) => !excluded.has(id) && !seenGlobal.has(id));
  if (requestedMissing.length > 0 && days.length > 0) {
    for (const id of requestedMissing) {
      const ex = getExerciseById(id);
      if (!ex) continue;
      let best = 0;
      let bestScore = -1;
      for (let i = 0; i < days.length; i++) {
        const s = scoreDayForExercise(days[i].targetMuscles, ex);
        if (s > bestScore) {
          best = i;
          bestScore = s;
        }
      }
      const p = getPrescriptionForExercise(ex).adjusted;
      days[best].exercises.unshift({
        slotLabel: "Requested exercise",
        exerciseName: ex.name,
        sets: formatIntRange(p.sets),
        reps: formatIntRange(p.repRange),
        rir: formatIntRange(p.rirRange),
        rest: `${formatIntRange(p.restSeconds)}s`,
        rationale: "Injected to satisfy explicit requested exercise.",
      });
      seenGlobal.add(id);
    }
  }

  const afterRequestMissing = params.requestedExerciseIds.filter((id) => !excluded.has(id) && !seenGlobal.has(id));
  if (afterRequestMissing.length > 0) {
    issues.push(`Missing requested ids: ${afterRequestMissing.join(", ")}`);
  }

  const excludedPresent = days.flatMap((d) => d.exercises).some((e) => {
    const ex = params.excludedExerciseIds
      .map((id) => getExerciseById(id))
      .find((meta) => meta?.name === e.exerciseName);
    return Boolean(ex);
  });
  if (excludedPresent) issues.push("Excluded exercises still present after deterministic mapping.");

  if (issues.length > 0) {
    return { programme: null, issues };
  }

  return {
    programme: {
      programmeTitle: params.programmeTitleHint?.trim() || splitTitle(params.plan.splitType),
      programmeGoal:
        "Each day is built from LLM-structured targets and exercise ids, then mapped to deterministic prescriptions.",
      notes: `Hybrid v2 generation. ${params.plan.briefRationale || "Validated against catalog constraints."}`,
      debugSource: "new_programme_pipeline_v1",
      debugRequestId: randomUUID(),
      debugBuiltAt: new Date().toISOString(),
      days,
    },
    issues: [],
  };
}
