import type { StructuralProgrammeConstraints } from "@/lib/parseStructuralProgrammeConstraints";

export type AssistantStructuredProgrammeDebugSource =
  | "new_programme_pipeline_v1"
  | "new_programme_pipeline"
  | "template_fallback";

/** Mirrors `AssistantResponse["structuredProgramme"]` without importing the route (avoids cycles). */
export type AssistantStructuredProgramme = {
  programmeTitle: string;
  programmeGoal: string;
  notes: string;
  /** Mechanical proof: which generator built this programme. */
  debugProgrammeGenerator?:
    | "assistant_unified_path"
    | "ui_builder_path"
    | "programme_structure_llm_path"
    | "error_fallback";
  /** Set only by `buildProgramme` (new pipeline). */
  debugSource?: AssistantStructuredProgrammeDebugSource;
  /** Correlates one assistant request with the built programme object. */
  debugRequestId?: string;
  /** ISO timestamp when the programme object was built. */
  debugBuiltAt?: string;
  days: Array<{
    dayLabel: string;
    sessionType: string;
    purposeSummary: string;
    /** Per-day generator tag when mixed sources are needed for debugging. */
    debugDayGenerator?: string;
    targetMuscles?: string[];
    exercises: Array<{
      slotLabel: string;
      exerciseName: string;
      sets: string;
      reps: string;
      rir: string;
      rest: string;
      rationale: string;
    }>;
  }>;
};

export type StructuredProgramme = AssistantStructuredProgramme;

export type ProgrammeIntent =
  | "single_workout_build"
  | "programme_build"
  | "programme_modify"
  | "programme_compare"
  | "programme_explain"
  | "non_programme";

export type ParsedProgrammeRequest = {
  intent: ProgrammeIntent;
  splitType?: "ppl" | "upper_lower" | "full_body" | "custom" | "general";
  customDayGroups?: Array<{
    dayLabel: string;
    targetMuscles: string[];
  }>;
  requestedExercises?: string[];
  excludedExercises?: string[];
  emphasis?: string[];
  fatigueMode?: "normal" | "low_fatigue" | "strength_bias" | "hypertrophy_bias";
  frequency?: number;
  requestedChanges?: string[];
  comparisonTargets?: string[];
  structuralConstraints?: StructuralProgrammeConstraints;
};

export type ActiveProgrammeState = {
  programme: AssistantStructuredProgramme;
  parsedRequest: ParsedProgrammeRequest;
  createdAt: string;
  updatedAt: string;
};

export type ProgrammePipelineContext = {
  message: string;
  /** Thread contains an assistant message with structured programme. */
  hasThreadProgramme: boolean;
  clientActiveProgramme?: ActiveProgrammeState | null;
};

export type ProgrammeValidationResult = {
  ok: boolean;
  requestSatisfaction: { ok: boolean; issues: string[] };
  dayValidity: { ok: boolean; issues: string[] };
  programmeValidity: { ok: boolean; issues: string[] };
  allIssues: string[];
};
