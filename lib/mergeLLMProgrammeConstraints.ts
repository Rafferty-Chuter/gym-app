import { getExerciseById } from "@/lib/exerciseMetadataLibrary";
import type { ProgrammeConstraintsLLMOutput } from "@/lib/extractProgrammeConstraintsLLM";
import type { ParsedProgrammeRequest } from "@/lib/programmePipeline/types";

/** True when the user explicitly names a weekly layout (avoids false positives on "change bench", "want a plan", etc.). */
function userMessageSuggestsSplitChange(message: string): boolean {
  const x = message.toLowerCase();
  return (
    /\b(upper\s*[\/\s-]?\s*lower|\bppl\b|push\s*pull|full[\s_-]?body|bro\s+split)\b/.test(x) ||
    /\b([3-6])\s*day\b/.test(x) ||
    /\b(on\s+day|day\s*1|custom\s+split|split\s+that|weekly\s+split)\b/.test(x)
  );
}

export type MergedProgrammeBuildState = {
  parsed: ParsedProgrammeRequest;
  exclusions: string[];
  requestedIds: string[];
  llm: ProgrammeConstraintsLLMOutput;
};

/** Build builder exclusion strings so workoutBuilder excludedByUser matches id + display name + tag hits. */
export function exclusionStringsForExerciseIds(ids: string[]): string[] {
  const out: string[] = [];
  for (const id of ids) {
    out.push(id);
    const meta = getExerciseById(id);
    if (meta?.name) {
      out.push(meta.name);
      const norm = meta.name.toLowerCase().trim();
      if (norm && !out.includes(norm)) out.push(norm);
    }
  }
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))];
}

/**
 * Merge LLM constraint JSON onto deterministic parse. LLM fills gaps; deterministic wins on conflicts for structural count if already set.
 */
export function mergeLLMIntoProgrammeBuildState(params: {
  parsed: ParsedProgrammeRequest;
  llm: ProgrammeConstraintsLLMOutput;
  baseRequestedIds: string[];
  baseExclusions: string[];
  /** Used to allow LLM split hint to override a prior split type when the user clearly asks for a new layout. */
  userMessage?: string;
}): MergedProgrammeBuildState {
  const { parsed: src, llm, baseRequestedIds, baseExclusions, userMessage } = params;
  const parsed: ParsedProgrammeRequest = {
    ...src,
    requestedExercises: [...(src.requestedExercises?.length ? src.requestedExercises : baseRequestedIds)],
    structuralConstraints: src.structuralConstraints
      ? { ...src.structuralConstraints }
      : undefined,
  };

  const requestedIds = new Set(parsed.requestedExercises ?? baseRequestedIds);
  for (const id of llm.includeExerciseIds) {
    requestedIds.add(id);
  }

  const excludedIds = new Set(parsed.excludedExercises ?? []);
  for (const id of llm.excludeExerciseIds) {
    excludedIds.add(id);
  }
  for (const inc of llm.includeExerciseIds) {
    excludedIds.delete(inc);
  }
  parsed.excludedExercises = [...excludedIds];

  for (const id of excludedIds) {
    requestedIds.delete(id);
  }
  parsed.requestedExercises = [...requestedIds];

  const exclusionExtras = exclusionStringsForExerciseIds(parsed.excludedExercises ?? []);
  const exclusions = [...new Set([...baseExclusions, ...exclusionExtras])];

  if (llm.uniformPerMuscleExerciseCount != null) {
    const existing = parsed.structuralConstraints?.uniformPerMuscleExerciseCount;
    if (existing == null) {
      parsed.structuralConstraints = {
        ...(parsed.structuralConstraints ?? {}),
        uniformPerMuscleExerciseCount: llm.uniformPerMuscleExerciseCount,
      };
    }
  }

  if (llm.splitTypeHint) {
    const existing = parsed.splitType;
    if (!existing || existing === "general") {
      parsed.splitType = llm.splitTypeHint;
    } else if (
      existing !== "custom" &&
      userMessage?.trim() &&
      userMessageSuggestsSplitChange(userMessage) &&
      llm.splitTypeHint !== existing
    ) {
      parsed.splitType = llm.splitTypeHint;
    }
  }

  if (llm.recoveryOrFatigueHint === "low_fatigue") {
    parsed.fatigueMode = "low_fatigue";
  }

  return {
    parsed,
    exclusions,
    requestedIds: [...requestedIds],
    llm,
  };
}
