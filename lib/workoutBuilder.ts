import {
  EXERCISE_METADATA_LIBRARY,
  getExerciseByIdOrName,
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
import type { BuilderStructuralIntent } from "@/lib/builderStructuralIntent";
import { parseBuilderStructuralIntent } from "@/lib/builderStructuralIntent";
import { validateBuiltDayQuality } from "@/lib/dayQuality";
import { areExercisesRedundant } from "@/lib/trainingKnowledge/exerciseRedundancy";
import { getExerciseIntelligence } from "@/lib/trainingKnowledge/exerciseMetadata";
import { suggestSubstitute as suggestSubstituteFromKnowledge } from "@/lib/trainingKnowledge/exerciseSubstitutions";
import { orderExercisesForSession } from "@/lib/trainingKnowledge/exerciseOrder";
import {
  applyLowFatigueAdjustments,
  buildSessionFatigueReview,
  shouldAddAnotherExercise,
} from "@/lib/trainingKnowledge/sessionFatigueReview";

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
  requestedExerciseIds?: string[];
  recoveryMode?: RecoveryMode;
  includeOptionalSlots?: boolean;
  targetExerciseCount?: number;
  /** Parsed from user message when set; merged with explicit structuralIntent. */
  userMessage?: string;
  structuralIntent?: BuilderStructuralIntent;
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
  requestedPlacements?: Array<{
    exerciseId: string;
    exerciseName: string;
    status: "placed_slot" | "unplaced";
    slotId?: string;
    slotLabel?: string;
    reason: string;
  }>;
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
  recoveryMode: RecoveryMode | undefined,
  structuralIntent?: BuilderStructuralIntent
): GoalAdjustment[] {
  const out: GoalAdjustment[] = [];
  if (goal === "improve_overall_strength") out.push("strength_emphasis");
  if (goal === "build_overall_muscle") out.push("hypertrophy_emphasis");
  if (goal === "strength_hypertrophy") out.push("strength_emphasis", "hypertrophy_emphasis");
  if (goal === "upper_body_emphasis") out.push("upper_body_emphasis");
  if (goal === "chest_emphasis") out.push("chest_emphasis");
  if (goal === "bench_strength_emphasis") out.push("bench_strength_emphasis", "strength_emphasis");
  if (recoveryMode === "low_fatigue") out.push("low_fatigue");
  if (structuralIntent?.chestEmphasis) out.push("chest_emphasis");
  return [...new Set(out)];
}

function mergeStructuralIntent(
  input: WorkoutBuilderInput
): BuilderStructuralIntent | undefined {
  const fromMsg = input.userMessage ? parseBuilderStructuralIntent(input.userMessage) : {};
  const explicit = input.structuralIntent ?? {};
  const merged: BuilderStructuralIntent = { ...fromMsg, ...explicit };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function structuralIntentSlotBonus(
  exercise: ExerciseMetadata,
  slot: SessionSlot,
  intent?: BuilderStructuralIntent
): number {
  if (!intent) return 0;
  let b = 0;
  if (intent.chestEmphasis && exercise.tags.includes("chest")) b += 12;
  if (intent.tricepsEmphasis && exercise.tags.includes("triceps")) b += 14;
  if (intent.sideDeltEmphasis && exercise.tags.includes("shoulders") && exercise.role === "isolation") {
    b += 16;
  }
  if (intent.moreIsolation && (exercise.role === "isolation" || exercise.role === "accessory")) {
    b += 10;
  }
  return b;
}

function sourceScoreForSlot(
  exercise: ExerciseMetadata,
  slot: SessionSlot,
  preferred: Set<string>,
  recentExerciseIds: Set<string>,
  recentPatterns: Set<string>,
  selectedExerciseIds: Set<string>,
  equipmentAvailable: string[],
  recoveryMode: RecoveryMode,
  structuralIntent?: BuilderStructuralIntent
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
  // Shared exercise-intelligence layer: penalize stacking highly redundant picks.
  for (const already of selectedExerciseIds) {
    const redundancy = areExercisesRedundant(already, exercise.id);
    if (redundancy.redundant) score -= 12;
  }
  const intel = getExerciseIntelligence(exercise.id);
  if (intel?.exerciseRole === "isolation" && slot.acceptableRoles.includes("isolation")) score += 3;
  if (!equipmentCompatible(exercise, equipmentAvailable)) score -= 18; // still selectable, but likely needs substitution
  if (slot.slotId === "upper_horizontal_push" && exercise.tags.includes("horizontal_push")) score += 12;
  if (slot.slotId === "upper_horizontal_pull" && exercise.tags.includes("horizontal_pull")) score += 12;
  if (slot.slotId === "upper_horizontal_pull" && exercise.tags.includes("vertical_pull")) score += 4;
  score += structuralIntentSlotBonus(exercise, slot, structuralIntent);
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
  structuralIntent?: BuilderStructuralIntent;
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
    structuralIntent,
  } = args;
  const slotCandidates = library
    .filter((ex) => slotCompatible(ex, slot))
    .filter((ex) => !selectedIds.has(ex.id))
    .filter((ex) => !excludedByUser(ex, exclusions))
    .sort(
      (a, b) =>
        sourceScoreForSlot(b, slot, preferred, recentExerciseIds, recentPatterns, selectedIds, equipmentAvailable, recoveryMode, structuralIntent) -
        sourceScoreForSlot(a, slot, preferred, recentExerciseIds, recentPatterns, selectedIds, equipmentAvailable, recoveryMode, structuralIntent)
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

  const knowledgeFallback = suggestSubstituteFromKnowledge(
    ideal.id,
    equipmentAvailable,
    [...selectedIds]
  );
  if (knowledgeFallback) {
    const meta = getExerciseByIdOrName(knowledgeFallback);
    if (meta && !selectedIds.has(meta.id) && !excludedByUser(meta, exclusions) && slotCompatible(meta, slot)) {
      return {
        chosen: meta,
        rationale: `Shared exercise-intelligence substitution selected (${knowledgeFallback}).`,
      };
    }
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

  const structuralIntent = mergeStructuralIntent(input);
  const goal = input.goal ?? "balanced";
  const recoveryMode: RecoveryMode =
    input.recoveryMode === "low_fatigue" || structuralIntent?.reduceFatigue ? "low_fatigue" : "normal";
  const equipmentAvailable = input.equipmentAvailable ?? [];
  const exclusions = input.injuriesOrExclusions ?? [];
  const preferred = new Set(nList(input.preferredExercises ?? []));
  const recentExerciseIds = new Set(input.recentTrainingContext?.recentExerciseIds ?? []);
  const recentPatterns = new Set(input.recentTrainingContext?.recentMovementPatterns ?? []);
  const includeOptional = input.includeOptionalSlots ?? true;
  const isoBoost =
    structuralIntent?.moreIsolation &&
    (input.sessionType === "push" ||
      input.sessionType === "pull" ||
      input.sessionType === "legs" ||
      input.sessionType === "lower")
      ? 2
      : structuralIntent?.moreIsolation
        ? 1
        : 0;
  const targetFloor = template.minExercises + isoBoost;
  const requestedTarget = input.targetExerciseCount ?? template.maxExercises;
  const targetCount = Math.min(template.maxExercises, Math.max(requestedTarget, targetFloor));
  const library = EXERCISE_METADATA_LIBRARY;
  const adjustments = mapAdjustments(goal, recoveryMode, structuralIntent);

  const selectedExercises: WorkoutExercise[] = [];
  const selectedIds = new Set<string>();
  const notes: string[] = [];

  const orderedRequired = [...template.requiredSlots].sort(
    (a, b) => a.preferredOrder - b.preferredOrder
  );
  const orderedOptional = [...template.optionalSlots].sort(
    (a, b) => a.preferredOrder - b.preferredOrder
  );
  const allOrderedSlots = [...orderedRequired, ...orderedOptional];
  const slotForcedExerciseById = new Map<string, ExerciseMetadata>();
  const requestedPlacements: BuiltWorkout["requestedPlacements"] = [];

  const requestedExercises = Array.from(
    new Set(input.requestedExerciseIds ?? [])
  )
    .map((id) => getExerciseByIdOrName(id))
    .filter((e): e is ExerciseMetadata => Boolean(e));

  for (const requested of requestedExercises) {
    if (selectedIds.has(requested.id)) {
      requestedPlacements.push({
        exerciseId: requested.id,
        exerciseName: requested.name,
        status: "unplaced",
        reason: "Already selected by a prior request.",
      });
      continue;
    }
    if (excludedByUser(requested, exclusions)) {
      requestedPlacements.push({
        exerciseId: requested.id,
        exerciseName: requested.name,
        status: "unplaced",
        reason: "Excluded by user constraints.",
      });
      continue;
    }
    const candidateSlot = allOrderedSlots
      .filter((slot) => !slotForcedExerciseById.has(slot.slotId))
      .filter((slot) => slotCompatible(requested, slot))
      .sort((a, b) => a.preferredOrder - b.preferredOrder)[0];
    if (!candidateSlot) {
      requestedPlacements.push({
        exerciseId: requested.id,
        exerciseName: requested.name,
        status: "unplaced",
        reason: "No compatible template slot for this requested exercise.",
      });
      continue;
    }
    slotForcedExerciseById.set(candidateSlot.slotId, requested);
    requestedPlacements.push({
      exerciseId: requested.id,
      exerciseName: requested.name,
      status: "placed_slot",
      slotId: candidateSlot.slotId,
      slotLabel: candidateSlot.slotLabel,
      reason: "Placed before normal slot filling as an explicit user request.",
    });
  }

  // 1) Fill required slots first.
  for (const slot of orderedRequired) {
    const forced = slotForcedExerciseById.get(slot.slotId);
    const result = forced
      ? {
          chosen: forced,
          substitution: undefined as RankedSubstitute | undefined,
          rationale: "Requested exercise locked into this slot before normal fill.",
        }
      : bestDirectOrSubstituteForSlot({
          slot,
          selectedIds,
          preferred,
          recentExerciseIds,
          recentPatterns,
          equipmentAvailable,
          exclusions,
          library,
          recoveryMode,
          structuralIntent,
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
      const forced = slotForcedExerciseById.get(slot.slotId);
      const result = forced
        ? {
            chosen: forced,
            substitution: undefined as RankedSubstitute | undefined,
            rationale: "Requested exercise locked into this slot before normal fill.",
          }
        : bestDirectOrSubstituteForSlot({
            slot,
            selectedIds,
            preferred,
            recentExerciseIds,
            recentPatterns,
            equipmentAvailable,
            exclusions,
            library,
            recoveryMode,
            structuralIntent,
          });
      if (!result.chosen) continue;

      const exercise = result.chosen;
      const allowAdd = shouldAddAnotherExercise({
        built: {
          sessionType: input.sessionType,
          purposeSummary: "",
          exercises: selectedExercises,
          notes: [],
          warnings: [],
        },
        candidateIsCompound:
          exercise.role === "main_compound" ||
          exercise.role === "secondary_compound" ||
          exercise.role === "machine_compound",
        lowFatigueMode: recoveryMode === "low_fatigue",
      });
      if (!allowAdd) {
        notes.push("Stopped adding optional movements due to fatigue/recovery cap.");
        break;
      }
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
  // Apply shared exercise-order logic before final validation/render.
  const ordered = orderExercisesForSession(
    selectedExercises.map((e) => ({ exerciseId: e.exerciseId, exerciseName: e.exerciseName })),
    { priorityExerciseIds: input.requestedExerciseIds ?? [] }
  );
  const orderIdx = new Map(ordered.map((o, i) => [o.exerciseId ?? o.exerciseName, i]));
  selectedExercises.sort(
    (a, b) =>
      (orderIdx.get(a.exerciseId ?? a.exerciseName) ?? 999) -
      (orderIdx.get(b.exerciseId ?? b.exerciseName) ?? 999)
  );

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

  let out: BuiltWorkout = {
    sessionType: input.sessionType,
    purposeSummary: makePurposeSummary(input.sessionType, goal, recoveryMode),
    exercises: selectedExercises,
    notes,
    warnings,
    requestedPlacements,
  };
  if (recoveryMode === "low_fatigue") {
    out = applyLowFatigueAdjustments(out);
  }
  out.warnings = [...out.warnings, ...buildSessionFatigueReview(out, { lowFatigueMode: recoveryMode === "low_fatigue" })];
  return out;
}

/**
 * Build then validate minimum viable day quality; if needed, one repair pass with full equipment catalog.
 */
export function buildWorkoutWithQualityPasses(input: WorkoutBuilderInput): BuiltWorkout {
  const intent = mergeStructuralIntent(input);
  let built = buildWorkout(input);
  let quality = validateBuiltDayQuality(built, intent);
  if (!quality.ok) {
    const template = getSessionTemplateByType(input.sessionType);
    const repairInput: WorkoutBuilderInput = {
      ...input,
      equipmentAvailable: [],
      targetExerciseCount: Math.max(
        input.targetExerciseCount ?? 0,
        quality.suggestedTargetCount,
        template?.minExercises ?? 4
      ),
      includeOptionalSlots: true,
    };
    built = buildWorkout(repairInput);
    quality = validateBuiltDayQuality(built, intent);
    if (quality.ok) {
      built.notes = [
        ...built.notes,
        "Regenerated using the full exercise catalog to meet minimum movement coverage (equipment may be idealized).",
      ];
    }
  }
  built.warnings = [...built.warnings, ...quality.warnings];
  if (!quality.ok) {
    built.warnings.push(
      "Quality check: session may still be below target structure — try relaxing exclusions or confirming gym equipment."
    );
  }
  return built;
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

