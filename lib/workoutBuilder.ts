import {
  EXERCISE_METADATA_LIBRARY,
  type ExerciseMetadata,
  type ExerciseRole,
} from "@/lib/exerciseMetadataLibrary";
import {
  getRankedSubstitutes,
  type RankedSubstitute,
} from "@/lib/exerciseSubstitutions";
import {
  getPrescriptionForExercise,
  type GoalAdjustment,
} from "@/lib/prescriptionDefaults";
import {
  getSessionTemplateByType,
  validateSessionAgainstTemplate,
  type SessionSlot,
  type SessionType,
} from "@/lib/sessionTemplates";

export type WorkoutBuilderGoal =
  | "build_overall_muscle"
  | "improve_overall_strength"
  | "strength_hypertrophy"
  | "upper_body_emphasis"
  | "chest_emphasis"
  | "bench_strength_emphasis"
  | "balanced";

export type RecoveryMode = "normal" | "low_fatigue";

export type RecentTrainingContext = {
  recentExerciseIds?: string[];
  recentMovementPatterns?: string[];
  recentSessionTypes?: SessionType[];
};

export type WorkoutBuilderInput = {
  sessionType: SessionType;
  goal?: WorkoutBuilderGoal;
  equipmentAvailable?: string[];
  injuriesOrExclusions?: string[];
  recentTrainingContext?: RecentTrainingContext;
  preferredExercises?: string[];
  recoveryMode?: RecoveryMode;
  includeOptionalSlots?: boolean;
  targetExerciseCount?: number;
};

export type WorkoutExercise = {
  slotLabel: string;
  exerciseId: string;
  exerciseName: string;
  sets: { min: number; max: number };
  repRange: { min: number; max: number };
  rirRange: { min: number; max: number };
  restSeconds: { min: number; max: number };
  rationale: string;
};

export type BuiltWorkout = {
  sessionType: SessionType;
  purposeSummary: string;
  exercises: WorkoutExercise[];
  notes: string[];
  warnings: string[];
};

function n(s: string): string {
  return s.toLowerCase().trim();
}

function nList(items: string[]): string[] {
  return items.map(n);
}

function roleAccepted(role: ExerciseRole, acceptable: ExerciseRole[]): boolean {
  return acceptable.includes(role);
}

function tagsAccepted(ex: ExerciseMetadata, acceptableTags: string[]): boolean {
  if (acceptableTags.length === 0) return true;
  return acceptableTags.every((tag) => ex.tags.includes(tag));
}

function slotCompatible(exercise: ExerciseMetadata, slot: SessionSlot): boolean {
  return roleAccepted(exercise.role, slot.acceptableRoles) && tagsAccepted(exercise, slot.acceptableTags);
}

function equipmentCompatible(exercise: ExerciseMetadata, available: string[]): boolean {
  if (available.length === 0) return true;
  const have = new Set(nList(available));
  const needed = nList(exercise.equipment);
  return needed.every((eq) => {
    if (have.has(eq)) return true;
    if (eq.includes("_or_")) {
      return eq
        .split("_or_")
        .map((x) => n(x))
        .some((part) => have.has(part));
    }
    if (eq.includes("or")) {
      return eq
        .split("or")
        .map((x) => n(x))
        .some((part) => have.has(part));
    }
    return false;
  });
}

function excludedByUser(exercise: ExerciseMetadata, exclusions: string[]): boolean {
  if (exclusions.length === 0) return false;
  const ex = new Set(nList(exclusions));
  if (ex.has(n(exercise.id)) || ex.has(n(exercise.name))) return true;
  if (exercise.primaryMuscles.some((m) => ex.has(n(m)))) return true;
  if (exercise.secondaryMuscles.some((m) => ex.has(n(m)))) return true;
  if (ex.has(n(exercise.movementPattern))) return true;
  if (exercise.tags.some((t) => ex.has(n(t)))) return true;
  return false;
}

function mapAdjustments(
  goal: WorkoutBuilderGoal,
  recoveryMode: RecoveryMode | undefined
): GoalAdjustment[] {
  const out: GoalAdjustment[] = [];
  if (goal === "improve_overall_strength") out.push("strength_emphasis");
  if (goal === "build_overall_muscle") out.push("hypertrophy_emphasis");
  if (goal === "strength_hypertrophy") out.push("strength_emphasis", "hypertrophy_emphasis");
  if (goal === "upper_body_emphasis") out.push("upper_body_emphasis");
  if (goal === "chest_emphasis") out.push("chest_emphasis");
  if (goal === "bench_strength_emphasis") out.push("bench_strength_emphasis", "strength_emphasis");
  if (recoveryMode === "low_fatigue") out.push("low_fatigue");
  return [...new Set(out)];
}

function sourceScoreForSlot(
  exercise: ExerciseMetadata,
  slot: SessionSlot,
  preferred: Set<string>,
  recentExerciseIds: Set<string>,
  recentPatterns: Set<string>,
  equipmentAvailable: string[],
  recoveryMode: RecoveryMode
): number {
  let score = 0;
  score += 40; // slot already matched, base confidence
  if (slot.preferredFatigue.includes(exercise.fatigueCost)) score += 8;
  if (slot.preferredLengthBias?.includes(exercise.lengthBias)) score += 6;
  // Long-length preference where especially useful for hypertrophy.
  if (
    exercise.lengthBias === "stretch_biased" &&
    (exercise.tags.includes("hamstring") ||
      exercise.tags.includes("triceps") ||
      exercise.tags.includes("quad_dominant"))
  ) {
    score += 4;
  }
  if (preferred.has(n(exercise.id)) || preferred.has(n(exercise.name))) score += 25;
  if (recentExerciseIds.has(exercise.id)) score -= 14; // variation bias
  if (recentPatterns.has(exercise.movementPattern)) score -= 4;
  if (recoveryMode === "low_fatigue") {
    if (exercise.fatigueCost === "very_high") score -= 16;
    else if (exercise.fatigueCost === "high") score -= 8;
    if (exercise.role === "machine_compound" || exercise.role === "isolation") score += 6;
  }
  if (!equipmentCompatible(exercise, equipmentAvailable)) score -= 18; // still selectable, but likely needs substitution
  return score;
}

function bestDirectOrSubstituteForSlot(args: {
  slot: SessionSlot;
  selectedIds: Set<string>;
  preferred: Set<string>;
  recentExerciseIds: Set<string>;
  recentPatterns: Set<string>;
  equipmentAvailable: string[];
  exclusions: string[];
  library: ExerciseMetadata[];
  recoveryMode: RecoveryMode;
}): {
  chosen?: ExerciseMetadata;
  substitution?: RankedSubstitute;
  rationale: string;
} {
  const {
    slot,
    selectedIds,
    preferred,
    recentExerciseIds,
    recentPatterns,
    equipmentAvailable,
    exclusions,
    library,
    recoveryMode,
  } = args;
  const slotCandidates = library
    .filter((ex) => slotCompatible(ex, slot))
    .filter((ex) => !selectedIds.has(ex.id))
    .filter((ex) => !excludedByUser(ex, exclusions))
    .sort(
      (a, b) =>
        sourceScoreForSlot(b, slot, preferred, recentExerciseIds, recentPatterns, equipmentAvailable, recoveryMode) -
        sourceScoreForSlot(a, slot, preferred, recentExerciseIds, recentPatterns, equipmentAvailable, recoveryMode)
    );
  if (slotCandidates.length === 0) {
    return { rationale: "No slot-compatible movement found after exclusions." };
  }

  // Pick highest scoring ideal candidate first.
  const ideal = slotCandidates[0];
  if (equipmentCompatible(ideal, equipmentAvailable)) {
    return {
      chosen: ideal,
      rationale: "Selected best slot match with compatible equipment.",
    };
  }

  // Equipment unavailable: substitute from ideal.
  const ranked = getRankedSubstitutes(ideal.id, equipmentAvailable, library, {
    minScore: 15,
    maxResults: 8,
  });
  const fallback = ranked.find(
    (r) =>
      !selectedIds.has(r.exercise.id) &&
      !excludedByUser(r.exercise, exclusions) &&
      slotCompatible(r.exercise, slot)
  );
  if (fallback) {
    return {
      chosen: fallback.exercise,
      substitution: fallback,
      rationale: `Substituted from ${ideal.name} due to equipment constraints.`,
    };
  }

  // Last resort: pick next direct candidate that is compatible.
  const direct = slotCandidates.find((ex) => equipmentCompatible(ex, equipmentAvailable));
  if (direct) {
    return {
      chosen: direct,
      rationale: "Used next-best direct candidate that fits available equipment.",
    };
  }

  return {
    rationale: `No coherent substitute found for ${ideal.name} with current constraints.`,
  };
}

function makePurposeSummary(
  sessionType: SessionType,
  goal: WorkoutBuilderGoal,
  recoveryMode: RecoveryMode
): string {
  const focus =
    goal === "bench_strength_emphasis"
      ? "bench-strength biased"
      : goal === "improve_overall_strength"
      ? "strength-biased"
      : goal === "build_overall_muscle"
      ? "hypertrophy-biased"
      : goal === "upper_body_emphasis"
      ? "upper-body biased"
      : goal === "chest_emphasis"
      ? "chest-biased"
      : "balanced";
  const fatigue = recoveryMode === "low_fatigue" ? "lower-fatigue execution" : "normal fatigue budget";
  return `${sessionType} session with ${focus} construction and ${fatigue}.`;
}

export function buildWorkout(input: WorkoutBuilderInput): BuiltWorkout {
  const template = getSessionTemplateByType(input.sessionType);
  if (!template) {
    return {
      sessionType: input.sessionType,
      purposeSummary: "No session template available.",
      exercises: [],
      notes: [],
      warnings: [`Missing template for session type: ${input.sessionType}`],
    };
  }

  const goal = input.goal ?? "balanced";
  const recoveryMode = input.recoveryMode ?? "normal";
  const equipmentAvailable = input.equipmentAvailable ?? [];
  const exclusions = input.injuriesOrExclusions ?? [];
  const preferred = new Set(nList(input.preferredExercises ?? []));
  const recentExerciseIds = new Set(input.recentTrainingContext?.recentExerciseIds ?? []);
  const recentPatterns = new Set(input.recentTrainingContext?.recentMovementPatterns ?? []);
  const includeOptional = input.includeOptionalSlots ?? true;
  const targetCount = input.targetExerciseCount ?? template.maxExercises;
  const library = EXERCISE_METADATA_LIBRARY;
  const adjustments = mapAdjustments(goal, recoveryMode);

  const selectedExercises: WorkoutExercise[] = [];
  const selectedIds = new Set<string>();
  const notes: string[] = [];

  const orderedRequired = [...template.requiredSlots].sort(
    (a, b) => a.preferredOrder - b.preferredOrder
  );
  const orderedOptional = [...template.optionalSlots].sort(
    (a, b) => a.preferredOrder - b.preferredOrder
  );

  // 1) Fill required slots first.
  for (const slot of orderedRequired) {
    const result = bestDirectOrSubstituteForSlot({
      slot,
      selectedIds,
      preferred,
      recentExerciseIds,
      recentPatterns,
      equipmentAvailable,
      exclusions,
      library,
      recoveryMode,
    });
    if (!result.chosen) {
      notes.push(`Could not fill required slot: ${slot.slotLabel}. ${result.rationale}`);
      continue;
    }

    const exercise = result.chosen;
    selectedIds.add(exercise.id);
    const prescription = getPrescriptionForExercise(exercise, adjustments).adjusted;
    const rationaleBits = [result.rationale];
    if (result.substitution) {
      rationaleBits.push(
        `Replacement quality score ${result.substitution.score} (${result.substitution.reasons
          .slice(0, 2)
          .map((r) => r.detail)
          .join(" ")})`
      );
    }
    if (exercise.lengthBias === "stretch_biased") {
      rationaleBits.push("Stretch-biased option selected for long-length stimulus.");
    }
    if (recentExerciseIds.has(exercise.id)) {
      rationaleBits.push("Recently repeated; selected due to slot constraints.");
    }

    selectedExercises.push({
      slotLabel: slot.slotLabel,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      sets: prescription.sets,
      repRange: prescription.repRange,
      rirRange: prescription.rirRange,
      restSeconds: prescription.restSeconds,
      rationale: rationaleBits.join(" "),
    });
  }

  // 2) Fill optional slots if needed.
  if (includeOptional && selectedExercises.length < Math.min(targetCount, template.maxExercises)) {
    for (const slot of orderedOptional) {
      if (selectedExercises.length >= Math.min(targetCount, template.maxExercises)) break;
      const result = bestDirectOrSubstituteForSlot({
        slot,
        selectedIds,
        preferred,
        recentExerciseIds,
        recentPatterns,
        equipmentAvailable,
        exclusions,
        library,
        recoveryMode,
      });
      if (!result.chosen) continue;

      const exercise = result.chosen;
      selectedIds.add(exercise.id);
      const prescription = getPrescriptionForExercise(exercise, adjustments).adjusted;
      selectedExercises.push({
        slotLabel: slot.slotLabel,
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        sets: prescription.sets,
        repRange: prescription.repRange,
        rirRange: prescription.rirRange,
        restSeconds: prescription.restSeconds,
        rationale: result.rationale,
      });
    }
  }

  // 3) Keep within sensible limits.
  if (selectedExercises.length > template.maxExercises) {
    selectedExercises.splice(template.maxExercises);
    notes.push("Trimmed optional slots to stay within template max exercise count.");
  }

  // 4) Validate final output against coverage + warning rules.
  const selectedMeta = selectedExercises
    .map((x) => EXERCISE_METADATA_LIBRARY.find((e) => e.id === x.exerciseId))
    .filter((x): x is ExerciseMetadata => Boolean(x));
  const validation = validateSessionAgainstTemplate(template, selectedMeta);

  const warnings = [
    ...validation.warnings.map((w) => w.message),
    ...validation.requiredSlots
      .filter((s) => !s.satisfied)
      .map((s) => `Required slot missing: ${s.slotId}`),
    ...validation.coverageRules
      .filter((r) => !r.passed)
      .map((r) => `Coverage rule not met: ${r.ruleId}`),
  ];

  return {
    sessionType: input.sessionType,
    purposeSummary: makePurposeSummary(input.sessionType, goal, recoveryMode),
    exercises: selectedExercises,
    notes,
    warnings,
  };
}

// Convenience helper for quick checks/dev previews.
export function buildExampleWorkouts(): {
  legs: BuiltWorkout;
  push: BuiltWorkout;
  upper: BuiltWorkout;
} {
  const commonEquipment = [
    "barbell",
    "rack",
    "bench",
    "dumbbells",
    "cable_machine",
    "leg_curl_machine",
    "leg_extension_machine",
    "pullup_bar",
  ];
  return {
    legs: buildWorkout({
      sessionType: "legs",
      goal: "build_overall_muscle",
      equipmentAvailable: commonEquipment,
      preferredExercises: ["back_squat", "romanian_deadlift", "leg_curl"],
    }),
    push: buildWorkout({
      sessionType: "push",
      goal: "bench_strength_emphasis",
      equipmentAvailable: commonEquipment,
      preferredExercises: ["flat_barbell_bench_press", "overhead_press"],
    }),
    upper: buildWorkout({
      sessionType: "upper",
      goal: "balanced",
      equipmentAvailable: commonEquipment,
      recentTrainingContext: {
        recentExerciseIds: ["flat_barbell_bench_press", "chest_supported_row"],
        recentMovementPatterns: ["horizontal_push", "horizontal_pull"],
      },
    }),
  };
}

