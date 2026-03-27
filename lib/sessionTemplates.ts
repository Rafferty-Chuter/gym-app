import type { ExerciseMetadata, ExerciseRole, FatigueCost } from "@/lib/exerciseMetadataLibrary";

export type SessionType =
  | "chest"
  | "back"
  | "legs"
  | "shoulders"
  | "arms"
  | "push"
  | "pull"
  | "upper"
  | "lower"
  | "full_body";

export type SessionGoal =
  | "hypertrophy"
  | "strength_hypertrophy"
  | "balanced"
  | "low_fatigue";

export type SessionWarningKind = "too_low_stimulus" | "too_bloated";

export type SessionSlot = {
  slotId: string;
  slotLabel: string;
  acceptableRoles: ExerciseRole[];
  acceptableTags: string[];
  preferredLengthBias?: Array<"stretch_biased" | "neutral" | "shortened_biased">;
  preferredFatigue: FatigueCost[];
  preferredOrder: number;
  required: boolean;
};

export type CoverageRule = {
  id: string;
  description: string;
  minMatches: number;
  maxMatches?: number;
  requiredTagsAny?: string[];
  requiredTagsAll?: string[];
  requiredRolesAny?: ExerciseRole[];
};

export type SessionWarningRule = {
  kind: SessionWarningKind;
  message: string;
  triggers: {
    exerciseCountLessThan?: number;
    exerciseCountGreaterThan?: number;
    missingCoverageRuleIdsAny?: string[];
    missingRequiredSlotsAny?: string[];
  };
};

export type SessionTemplate = {
  sessionType: SessionType;
  goal: SessionGoal;
  minExercises: number;
  maxExercises: number;
  requiredSlots: SessionSlot[];
  optionalSlots: SessionSlot[];
  coverageRules: CoverageRule[];
  warnings: SessionWarningRule[];
};

export type CoverageRuleResult = {
  ruleId: string;
  matchedCount: number;
  passed: boolean;
};

export type SlotValidationResult = {
  slotId: string;
  required: boolean;
  satisfied: boolean;
};

export type TemplateValidationResult = {
  template: SessionType;
  exerciseCount: number;
  withinExerciseRange: boolean;
  requiredSlots: SlotValidationResult[];
  coverageRules: CoverageRuleResult[];
  warnings: { kind: SessionWarningKind; message: string }[];
};

function hasAnyTag(ex: ExerciseMetadata, tags?: string[]): boolean {
  if (!tags || tags.length === 0) return true;
  return tags.some((tag) => ex.tags.includes(tag));
}

function hasAllTags(ex: ExerciseMetadata, tags?: string[]): boolean {
  if (!tags || tags.length === 0) return true;
  return tags.every((tag) => ex.tags.includes(tag));
}

function hasAnyRole(ex: ExerciseMetadata, roles?: ExerciseRole[]): boolean {
  if (!roles || roles.length === 0) return true;
  return roles.includes(ex.role);
}

function matchesSlot(ex: ExerciseMetadata, slot: SessionSlot): boolean {
  return hasAnyRole(ex, slot.acceptableRoles) && hasAnyTag(ex, slot.acceptableTags);
}

function matchesCoverageRule(ex: ExerciseMetadata, rule: CoverageRule): boolean {
  return (
    hasAnyTag(ex, rule.requiredTagsAny) &&
    hasAllTags(ex, rule.requiredTagsAll) &&
    hasAnyRole(ex, rule.requiredRolesAny)
  );
}

function countCoverageMatches(
  selectedExercises: ExerciseMetadata[],
  rule: CoverageRule
): number {
  return selectedExercises.filter((ex) => matchesCoverageRule(ex, rule)).length;
}

export const SESSION_TEMPLATES: SessionTemplate[] = [
  {
    sessionType: "chest",
    goal: "hypertrophy",
    minExercises: 4,
    maxExercises: 6,
    requiredSlots: [
      {
        slotId: "chest_main_press",
        slotLabel: "Main chest press",
        acceptableRoles: ["main_compound", "secondary_compound"],
        acceptableTags: ["chest", "horizontal_push"],
        preferredFatigue: ["high", "very_high"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "chest_secondary_press",
        slotLabel: "Secondary chest press",
        acceptableRoles: ["secondary_compound", "machine_compound"],
        acceptableTags: ["chest", "horizontal_push"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "chest_isolation",
        slotLabel: "Chest isolation",
        acceptableRoles: ["isolation"],
        acceptableTags: ["chest"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 3,
        required: true,
      },
    ],
    optionalSlots: [
      {
        slotId: "chest_triceps_accessory",
        slotLabel: "Triceps accessory",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["arms", "push"],
        preferredFatigue: ["low"],
        preferredOrder: 4,
        required: false,
      },
    ],
    coverageRules: [
      {
        id: "chest_horizontal_push_volume",
        description: "At least two horizontal push movements",
        minMatches: 2,
        requiredTagsAll: ["chest", "horizontal_push"],
      },
      {
        id: "chest_isolation_presence",
        description: "At least one chest isolation",
        minMatches: 1,
        requiredTagsAny: ["chest"],
        requiredRolesAny: ["isolation"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Chest session lacks pressing and/or isolation volume.",
        triggers: {
          exerciseCountLessThan: 4,
          missingCoverageRuleIdsAny: ["chest_horizontal_push_volume", "chest_isolation_presence"],
        },
      },
      {
        kind: "too_bloated",
        message: "Chest session has too many exercises for quality output.",
        triggers: { exerciseCountGreaterThan: 7 },
      },
    ],
  },
  {
    sessionType: "back",
    goal: "hypertrophy",
    minExercises: 4,
    maxExercises: 6,
    requiredSlots: [
      {
        slotId: "back_vertical_pull",
        slotLabel: "Vertical pull",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["back", "vertical_pull"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "back_horizontal_pull_1",
        slotLabel: "Primary horizontal pull",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["back", "horizontal_pull"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "back_rear_delt_midback",
        slotLabel: "Rear delt/mid-back accessory",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["back", "shoulders"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 4,
        required: true,
      },
    ],
    optionalSlots: [
      {
        slotId: "back_horizontal_pull_2",
        slotLabel: "Second horizontal pull",
        acceptableRoles: ["secondary_compound", "machine_compound"],
        acceptableTags: ["back", "horizontal_pull"],
        preferredFatigue: ["moderate"],
        preferredOrder: 3,
        required: false,
      },
      {
        slotId: "back_biceps",
        slotLabel: "Biceps accessory",
        acceptableRoles: ["isolation"],
        acceptableTags: ["arms", "pull"],
        preferredFatigue: ["low"],
        preferredOrder: 5,
        required: false,
      },
    ],
    coverageRules: [
      {
        id: "back_vertical_pull_presence",
        description: "At least one vertical pull",
        minMatches: 1,
        requiredTagsAll: ["back", "vertical_pull"],
      },
      {
        id: "back_horizontal_pull_volume",
        description: "One to two horizontal pulls",
        minMatches: 1,
        maxMatches: 2,
        requiredTagsAll: ["back", "horizontal_pull"],
      },
      {
        id: "back_rear_delt_or_midback",
        description: "At least one rear delt or mid-back accessory",
        minMatches: 1,
        requiredTagsAny: ["shoulders", "back"],
        requiredRolesAny: ["isolation", "accessory"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Back session misses key pull patterns.",
        triggers: {
          missingCoverageRuleIdsAny: [
            "back_vertical_pull_presence",
            "back_horizontal_pull_volume",
            "back_rear_delt_or_midback",
          ],
        },
      },
      {
        kind: "too_bloated",
        message: "Back session likely too long; remove redundant rows or pull-downs.",
        triggers: { exerciseCountGreaterThan: 7 },
      },
    ],
  },
  {
    sessionType: "legs",
    goal: "strength_hypertrophy",
    minExercises: 5,
    maxExercises: 7,
    requiredSlots: [
      {
        slotId: "legs_quad_compound",
        slotLabel: "Quad-dominant compound",
        acceptableRoles: ["main_compound", "machine_compound"],
        acceptableTags: ["legs", "quad_dominant"],
        preferredFatigue: ["high", "very_high"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "legs_hinge",
        slotLabel: "Posterior-chain hinge",
        acceptableRoles: ["main_compound", "secondary_compound"],
        acceptableTags: ["legs", "hip_hinge"],
        preferredFatigue: ["high", "very_high"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "legs_extra_quad",
        slotLabel: "Extra quad movement",
        acceptableRoles: ["secondary_compound", "machine_compound", "isolation"],
        acceptableTags: ["legs", "quad_dominant"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 3,
        required: true,
      },
      {
        slotId: "legs_ham_iso",
        slotLabel: "Hamstring isolation",
        acceptableRoles: ["isolation"],
        acceptableTags: ["legs", "hamstring"],
        preferredLengthBias: ["stretch_biased"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 4,
        required: true,
      },
      {
        slotId: "legs_calf",
        slotLabel: "Calves",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["legs", "calf"],
        preferredFatigue: ["low"],
        preferredOrder: 5,
        required: true,
      },
    ],
    optionalSlots: [
      {
        slotId: "legs_glute_accessory",
        slotLabel: "Glute accessory",
        acceptableRoles: ["secondary_compound", "accessory"],
        acceptableTags: ["legs", "glute"],
        preferredFatigue: ["moderate"],
        preferredOrder: 6,
        required: false,
      },
    ],
    coverageRules: [
      {
        id: "legs_quad_presence",
        description: "At least two quad movements total",
        minMatches: 2,
        requiredTagsAll: ["legs", "quad_dominant"],
      },
      {
        id: "legs_hinge_presence",
        description: "At least one hinge movement",
        minMatches: 1,
        requiredTagsAll: ["legs", "hip_hinge"],
      },
      {
        id: "legs_hamstring_isolation",
        description: "At least one hamstring isolation",
        minMatches: 1,
        requiredTagsAll: ["legs", "hamstring"],
        requiredRolesAny: ["isolation"],
      },
      {
        id: "legs_calf_presence",
        description: "At least one calf movement",
        minMatches: 1,
        requiredTagsAll: ["legs", "calf"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Leg session lacks either hinge, hamstring isolation, or calf work.",
        triggers: {
          exerciseCountLessThan: 5,
          missingCoverageRuleIdsAny: [
            "legs_quad_presence",
            "legs_hinge_presence",
            "legs_hamstring_isolation",
            "legs_calf_presence",
          ],
        },
      },
      {
        kind: "too_bloated",
        message: "Leg session may be too fatiguing; reduce overlap compounds.",
        triggers: { exerciseCountGreaterThan: 8 },
      },
    ],
  },
  {
    sessionType: "shoulders",
    goal: "hypertrophy",
    minExercises: 4,
    maxExercises: 6,
    requiredSlots: [
      {
        slotId: "shoulders_vertical_press",
        slotLabel: "Vertical press",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["shoulders", "vertical_push"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "shoulders_lateral_raise",
        slotLabel: "Lateral delt slot",
        acceptableRoles: ["isolation"],
        acceptableTags: ["shoulders"],
        preferredFatigue: ["low"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "shoulders_rear_delt",
        slotLabel: "Rear delt slot",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["shoulders", "back"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 3,
        required: true,
      },
    ],
    optionalSlots: [
      {
        slotId: "shoulders_front_delt_or_triceps",
        slotLabel: "Front delt/triceps accessory",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["shoulders", "arms", "push"],
        preferredFatigue: ["low"],
        preferredOrder: 4,
        required: false,
      },
    ],
    coverageRules: [
      {
        id: "shoulders_press_presence",
        description: "At least one vertical push",
        minMatches: 1,
        requiredTagsAll: ["shoulders", "vertical_push"],
      },
      {
        id: "shoulders_isolation_volume",
        description: "At least two shoulder isolation/accessory movements",
        minMatches: 2,
        requiredTagsAny: ["shoulders"],
        requiredRolesAny: ["isolation", "accessory"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Shoulder session needs both pressing and delt isolation.",
        triggers: { missingCoverageRuleIdsAny: ["shoulders_press_presence", "shoulders_isolation_volume"] },
      },
      {
        kind: "too_bloated",
        message: "Shoulder session has excessive overlap and volume.",
        triggers: { exerciseCountGreaterThan: 7 },
      },
    ],
  },
  {
    sessionType: "arms",
    goal: "hypertrophy",
    minExercises: 4,
    maxExercises: 6,
    requiredSlots: [
      {
        slotId: "arms_biceps",
        slotLabel: "Biceps isolation",
        acceptableRoles: ["isolation"],
        acceptableTags: ["arms", "biceps"],
        preferredFatigue: ["low"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "arms_biceps_2",
        slotLabel: "Second curl pattern",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["arms", "biceps"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "arms_triceps_pushdown",
        slotLabel: "Triceps isolation",
        acceptableRoles: ["isolation"],
        acceptableTags: ["arms", "triceps"],
        preferredFatigue: ["low"],
        preferredOrder: 3,
        required: true,
      },
      {
        slotId: "arms_triceps_long_length",
        slotLabel: "Overhead/long-length triceps",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["arms", "triceps"],
        preferredLengthBias: ["stretch_biased"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 4,
        required: true,
      },
    ],
    optionalSlots: [
      // Keep room for one extra slot in high-volume arm days.
      {
        slotId: "arms_optional_extra",
        slotLabel: "Optional extra arm movement",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["arms"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 5,
        required: false,
      }
    ],
    coverageRules: [
      {
        id: "arms_biceps_presence",
        description: "At least one biceps movement",
        minMatches: 1,
        requiredTagsAll: ["arms", "biceps"],
      },
      {
        id: "arms_triceps_presence",
        description: "At least one triceps movement",
        minMatches: 1,
        requiredTagsAll: ["arms", "triceps"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Arm session needs at least one direct biceps and triceps movement.",
        triggers: { missingCoverageRuleIdsAny: ["arms_biceps_presence", "arms_triceps_presence"] },
      },
      {
        kind: "too_bloated",
        message: "Arm session has excessive isolation redundancy.",
        triggers: { exerciseCountGreaterThan: 7 },
      },
    ],
  },
  {
    sessionType: "push",
    goal: "strength_hypertrophy",
    minExercises: 4,
    maxExercises: 6,
    requiredSlots: [
      {
        slotId: "push_horizontal_press",
        slotLabel: "Horizontal press",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["push", "horizontal_push"],
        preferredFatigue: ["high", "moderate"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "push_vertical_press",
        slotLabel: "Vertical press",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["push", "vertical_push"],
        preferredFatigue: ["high", "moderate"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "push_isolation_1",
        slotLabel: "Chest/triceps isolation 1",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["push"],
        preferredFatigue: ["low"],
        preferredOrder: 3,
        required: true,
      },
    ],
    optionalSlots: [
      {
        slotId: "push_isolation_2",
        slotLabel: "Chest/triceps isolation 2",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["push"],
        preferredFatigue: ["low"],
        preferredOrder: 4,
        required: false,
      },
    ],
    coverageRules: [
      {
        id: "push_horizontal_press_presence",
        description: "At least one horizontal press",
        minMatches: 1,
        requiredTagsAll: ["push", "horizontal_push"],
      },
      {
        id: "push_vertical_press_presence",
        description: "At least one vertical press",
        minMatches: 1,
        requiredTagsAll: ["push", "vertical_push"],
      },
      {
        id: "push_isolation_volume",
        description: "One to two push isolations/accessories",
        minMatches: 1,
        maxMatches: 2,
        requiredTagsAll: ["push"],
        requiredRolesAny: ["isolation", "accessory"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Push session missing key push patterns or direct work.",
        triggers: {
          missingCoverageRuleIdsAny: [
            "push_horizontal_press_presence",
            "push_vertical_press_presence",
            "push_isolation_volume",
          ],
        },
      },
      {
        kind: "too_bloated",
        message: "Push session over-stuffed; trim duplicate isolations.",
        triggers: { exerciseCountGreaterThan: 7 },
      },
    ],
  },
  {
    sessionType: "pull",
    goal: "hypertrophy",
    minExercises: 4,
    maxExercises: 6,
    requiredSlots: [
      {
        slotId: "pull_vertical",
        slotLabel: "Vertical pull",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["pull", "vertical_pull"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "pull_horizontal",
        slotLabel: "Horizontal pull",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["pull", "horizontal_pull"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "pull_rear_or_biceps",
        slotLabel: "Rear delt or biceps accessory",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["pull"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 3,
        required: true,
      },
    ],
    optionalSlots: [
      {
        slotId: "pull_extra_row_or_curl",
        slotLabel: "Extra row/curl",
        acceptableRoles: ["secondary_compound", "machine_compound", "isolation"],
        acceptableTags: ["pull"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 4,
        required: false,
      },
    ],
    coverageRules: [
      {
        id: "pull_vertical_presence",
        description: "At least one vertical pull",
        minMatches: 1,
        requiredTagsAll: ["pull", "vertical_pull"],
      },
      {
        id: "pull_horizontal_presence",
        description: "At least one horizontal pull",
        minMatches: 1,
        requiredTagsAll: ["pull", "horizontal_pull"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Pull session should include both vertical and horizontal pulling.",
        triggers: { missingCoverageRuleIdsAny: ["pull_vertical_presence", "pull_horizontal_presence"] },
      },
      {
        kind: "too_bloated",
        message: "Pull session may be too dense; remove overlapping pulls.",
        triggers: { exerciseCountGreaterThan: 7 },
      },
    ],
  },
  {
    sessionType: "upper",
    goal: "balanced",
    minExercises: 4,
    maxExercises: 6,
    requiredSlots: [
      {
        slotId: "upper_horizontal_push",
        slotLabel: "Horizontal push",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["upper", "horizontal_push"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "upper_horizontal_pull",
        slotLabel: "Horizontal pull",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["upper", "horizontal_pull"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "upper_vertical_push_or_pull",
        slotLabel: "Vertical push or pull",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["upper"],
        preferredFatigue: ["moderate"],
        preferredOrder: 3,
        required: true,
      },
    ],
    optionalSlots: [
      {
        slotId: "upper_arms_or_delts",
        slotLabel: "Arms or delts accessory",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["upper"],
        preferredFatigue: ["low"],
        preferredOrder: 4,
        required: false,
      },
    ],
    coverageRules: [
      {
        id: "upper_push_pull_balance_push",
        description: "At least one push movement",
        minMatches: 1,
        requiredTagsAny: ["push"],
      },
      {
        id: "upper_push_pull_balance_pull",
        description: "At least one pull movement",
        minMatches: 1,
        requiredTagsAny: ["pull"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Upper session needs a better push/pull balance.",
        triggers: {
          exerciseCountLessThan: 4,
          missingCoverageRuleIdsAny: ["upper_push_pull_balance_push", "upper_push_pull_balance_pull"],
        },
      },
      {
        kind: "too_bloated",
        message: "Upper session should usually stay in the 4-6 range.",
        triggers: { exerciseCountGreaterThan: 7 },
      },
    ],
  },
  {
    sessionType: "lower",
    goal: "balanced",
    minExercises: 4,
    maxExercises: 6,
    requiredSlots: [
      {
        slotId: "lower_squat_pattern",
        slotLabel: "Squat/leg press pattern",
        acceptableRoles: ["main_compound", "machine_compound"],
        acceptableTags: ["lower", "quad_dominant"],
        preferredFatigue: ["high", "very_high"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "lower_hinge_pattern",
        slotLabel: "Hinge pattern",
        acceptableRoles: ["main_compound", "secondary_compound"],
        acceptableTags: ["lower", "hip_hinge"],
        preferredFatigue: ["high"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "lower_leg_iso",
        slotLabel: "Leg isolation",
        acceptableRoles: ["isolation"],
        acceptableTags: ["lower"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 3,
        required: true,
      },
    ],
    optionalSlots: [
      {
        slotId: "lower_calf_or_glute",
        slotLabel: "Calf or glute accessory",
        acceptableRoles: ["isolation", "accessory", "secondary_compound"],
        acceptableTags: ["lower"],
        preferredFatigue: ["low", "moderate"],
        preferredOrder: 4,
        required: false,
      },
    ],
    coverageRules: [
      {
        id: "lower_quad_presence",
        description: "At least one quad-dominant movement",
        minMatches: 1,
        requiredTagsAll: ["lower", "quad_dominant"],
      },
      {
        id: "lower_hinge_presence",
        description: "At least one hinge movement",
        minMatches: 1,
        requiredTagsAll: ["lower", "hip_hinge"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Lower session needs both quad and hinge patterns.",
        triggers: { missingCoverageRuleIdsAny: ["lower_quad_presence", "lower_hinge_presence"] },
      },
      {
        kind: "too_bloated",
        message: "Lower session likely too fatiguing for quality work.",
        triggers: { exerciseCountGreaterThan: 7 },
      },
    ],
  },
  {
    sessionType: "full_body",
    goal: "balanced",
    minExercises: 6,
    maxExercises: 8,
    requiredSlots: [
      {
        slotId: "fullbody_squat_or_legpress",
        slotLabel: "Squat or leg press",
        acceptableRoles: ["main_compound", "machine_compound"],
        acceptableTags: ["full_body", "quad_dominant"],
        preferredFatigue: ["high", "very_high"],
        preferredOrder: 1,
        required: true,
      },
      {
        slotId: "fullbody_hinge",
        slotLabel: "Hinge",
        acceptableRoles: ["main_compound", "secondary_compound"],
        acceptableTags: ["full_body", "hip_hinge"],
        preferredFatigue: ["high"],
        preferredOrder: 2,
        required: true,
      },
      {
        slotId: "fullbody_horizontal_push",
        slotLabel: "Horizontal push",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["full_body", "horizontal_push"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 3,
        required: true,
      },
      {
        slotId: "fullbody_horizontal_pull",
        slotLabel: "Horizontal pull",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["full_body", "horizontal_pull"],
        preferredFatigue: ["moderate", "high"],
        preferredOrder: 4,
        required: true,
      },
      {
        slotId: "fullbody_vertical_push",
        slotLabel: "Vertical push",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["full_body", "vertical_push"],
        preferredFatigue: ["moderate"],
        preferredOrder: 5,
        required: true,
      },
      {
        slotId: "fullbody_vertical_pull",
        slotLabel: "Vertical pull",
        acceptableRoles: ["main_compound", "secondary_compound", "machine_compound"],
        acceptableTags: ["full_body", "vertical_pull"],
        preferredFatigue: ["moderate"],
        preferredOrder: 6,
        required: true,
      },
    ],
    optionalSlots: [
      {
        slotId: "fullbody_core_or_arms",
        slotLabel: "Core or arms accessory",
        acceptableRoles: ["isolation", "accessory"],
        acceptableTags: ["upper", "lower", "arms", "push", "pull"],
        preferredFatigue: ["low"],
        preferredOrder: 7,
        required: false,
      },
    ],
    coverageRules: [
      {
        id: "fullbody_lower_patterns",
        description: "Contains both squat and hinge patterns",
        minMatches: 2,
        requiredTagsAny: ["quad_dominant", "hip_hinge"],
      },
      {
        id: "fullbody_push_patterns",
        description: "Contains horizontal and vertical push",
        minMatches: 2,
        requiredTagsAny: ["horizontal_push", "vertical_push"],
      },
      {
        id: "fullbody_pull_patterns",
        description: "Contains horizontal and vertical pull",
        minMatches: 2,
        requiredTagsAny: ["horizontal_pull", "vertical_pull"],
      },
    ],
    warnings: [
      {
        kind: "too_low_stimulus",
        message: "Full-body session is missing one or more key movement patterns.",
        triggers: {
          exerciseCountLessThan: 6,
          missingCoverageRuleIdsAny: [
            "fullbody_lower_patterns",
            "fullbody_push_patterns",
            "fullbody_pull_patterns",
          ],
        },
      },
      {
        kind: "too_bloated",
        message: "Full-body session likely too long to keep output quality high.",
        triggers: { exerciseCountGreaterThan: 9 },
      },
    ],
  },
];

const templateByType = new Map<SessionType, SessionTemplate>(
  SESSION_TEMPLATES.map((t) => [t.sessionType, t])
);

export function getSessionTemplateByType(
  sessionType: SessionType
): SessionTemplate | undefined {
  return templateByType.get(sessionType);
}

export function listSessionTemplates(): SessionTemplate[] {
  return SESSION_TEMPLATES;
}

export function validateCoverageRules(
  template: SessionTemplate,
  selectedExercises: ExerciseMetadata[]
): CoverageRuleResult[] {
  return template.coverageRules.map((rule) => {
    const matchedCount = countCoverageMatches(selectedExercises, rule);
    const minOk = matchedCount >= rule.minMatches;
    const maxOk = typeof rule.maxMatches === "number" ? matchedCount <= rule.maxMatches : true;
    return {
      ruleId: rule.id,
      matchedCount,
      passed: minOk && maxOk,
    };
  });
}

export function validateSlots(
  template: SessionTemplate,
  selectedExercises: ExerciseMetadata[]
): SlotValidationResult[] {
  const required = template.requiredSlots.map((slot) => ({
    slotId: slot.slotId,
    required: true,
    satisfied: selectedExercises.some((ex) => matchesSlot(ex, slot)),
  }));
  const optional = template.optionalSlots.map((slot) => ({
    slotId: slot.slotId,
    required: false,
    satisfied: selectedExercises.some((ex) => matchesSlot(ex, slot)),
  }));
  return [...required, ...optional];
}

function evaluateWarnings(
  template: SessionTemplate,
  selectedExercises: ExerciseMetadata[],
  coverageResults: CoverageRuleResult[],
  slotResults: SlotValidationResult[]
): { kind: SessionWarningKind; message: string }[] {
  const count = selectedExercises.length;
  const missingCoverageIds = coverageResults.filter((r) => !r.passed).map((r) => r.ruleId);
  const missingRequiredSlots = slotResults
    .filter((s) => s.required && !s.satisfied)
    .map((s) => s.slotId);

  return template.warnings
    .filter((rule) => {
      const t = rule.triggers;
      const minCountOk =
        typeof t.exerciseCountLessThan === "number" ? count < t.exerciseCountLessThan : false;
      const maxCountOk =
        typeof t.exerciseCountGreaterThan === "number" ? count > t.exerciseCountGreaterThan : false;
      const missingCoverageOk = (t.missingCoverageRuleIdsAny ?? []).some((id) =>
        missingCoverageIds.includes(id)
      );
      const missingSlotsOk = (t.missingRequiredSlotsAny ?? []).some((id) =>
        missingRequiredSlots.includes(id)
      );
      return minCountOk || maxCountOk || missingCoverageOk || missingSlotsOk;
    })
    .map((rule) => ({ kind: rule.kind, message: rule.message }));
}

export function validateSessionAgainstTemplate(
  template: SessionTemplate,
  selectedExercises: ExerciseMetadata[]
): TemplateValidationResult {
  const coverage = validateCoverageRules(template, selectedExercises);
  const slots = validateSlots(template, selectedExercises);
  const exerciseCount = selectedExercises.length;
  const withinExerciseRange =
    exerciseCount >= template.minExercises && exerciseCount <= template.maxExercises;
  const warnings = evaluateWarnings(template, selectedExercises, coverage, slots);

  return {
    template: template.sessionType,
    exerciseCount,
    withinExerciseRange,
    requiredSlots: slots.filter((s) => s.required),
    coverageRules: coverage,
    warnings,
  };
}

