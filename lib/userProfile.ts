import type { TrainingFocus } from "@/lib/trainingFocus";
import type { ExperienceLevel } from "@/lib/experienceLevel";
import type { PriorityGoal } from "@/lib/priorityGoal";
import { getSelectiveAssistantMemory, type AssistantSelectiveMemoryV1 } from "@/lib/assistantMemory";

export type LowerBodyPriority = "Required" | "Reduced" | "Not a focus";

export type CoachPrioritise =
  | "Balanced development"
  | "Upper-body emphasis"
  | "Strength emphasis"
  | "General muscle gain"
  | "Custom / use my notes";

export type ParsedTrainingPriorities = {
  rawText?: string;
  /** High-level overall focus extracted from the text (future AI parsing). */
  primaryGoal?: string;
  /** Muscles the user wants to bring up (future AI parsing). */
  priorityMuscles?: string[];
  /** Muscles the user wants to keep lower (future AI parsing). */
  deprioritizedMuscles?: string[];
  /** Lift / movement priorities (future AI parsing). */
  liftPriorities?: Array<{ lift: string; priority: "high" | "low" }>;
  /** Free-form training preferences (future AI parsing). */
  trainingPreferences?: string[];
  /** Recovery / irritation concerns inferred from text (future AI parsing). */
  recoveryConcerns?: string[];
  /** Lightweight heuristic inference for now (used by coach logic). */
  lowerBodyPriority?: LowerBodyPriority;
};

export type UserProfile = {
  goal: string;
  trainingDaysAvailable: number;
  equipment: string[];
  injuries?: string[];
  availableSessionTime?: number;
  trainingPrioritiesText?: string;
  coachPrioritise: CoachPrioritise;
  lowerBodyPriority: LowerBodyPriority;
};

const STORAGE_KEY = "userCoachingProfile";

function uniqueLower(values: string[]): string[] {
  return Array.from(new Set(values.map((v) => v.trim()).filter(Boolean)));
}

export function createDefaultUserProfile(
  _focus: TrainingFocus,
  _experienceLevel: ExperienceLevel,
  goal: PriorityGoal
): UserProfile {
  return {
    goal,
    trainingDaysAvailable: 3,
    equipment: ["barbell", "dumbbell", "machine"],
    injuries: [],
    availableSessionTime: 60,
    trainingPrioritiesText: "",
    // No explicit anchor chosen yet; let free-text notes drive any nuanced coaching choices.
    coachPrioritise: "Custom / use my notes",
    lowerBodyPriority: "Required",
  };
}

function normalizeLowerBodyPriority(value: unknown): LowerBodyPriority | undefined {
  if (value === "Required" || value === "Reduced" || value === "Not a focus") return value;
  return undefined;
}

function normalizeCoachPrioritise(value: unknown): CoachPrioritise | undefined {
  if (
    value === "Balanced development" ||
    value === "Upper-body emphasis" ||
    value === "Strength emphasis" ||
    value === "General muscle gain" ||
    value === "Custom / use my notes"
  ) {
    return value;
  }
  return undefined;
}

function normalizeTrainingPrioritiesText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const t = value.trim();
  return t ? t : "";
}

function inferLowerBodyPriorityFromCoachPrioritise(
  _coachPrioritise: CoachPrioritise
): LowerBodyPriority | undefined {
  // The "coach prioritise" anchor was removed from Profile setup.
  // Keep this hook for backward compatibility, but do not override free-text notes.
  return undefined;
}

function inferLowerBodyPriorityFromText(text: string | undefined): LowerBodyPriority | undefined {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return undefined;

  const mentionsLegs = /(leg(s)?|lower body|quads|hamstrings|glutes|calves|squat|lunge|hinge|rdl)/.test(t);
  if (!mentionsLegs) return undefined;

  // Explicitly avoid/skip/deprioritize legs.
  if (
    /(not a focus|no legs|skip legs|avoid legs|deprioritiz(e|ing)? legs|don't do legs|dont do legs|upper body only)/.test(t)
  ) {
    return "Not a focus";
  }

  // Keep legs ticking over / maintain / reduced effort.
  if (
    /(ticking over|tick(ing)? over|keep legs|maintain legs|light legs|light on legs|reduced legs|minimal legs)/.test(t)
  ) {
    return "Reduced";
  }

  // If they explicitly want to bring legs up.
  if (/(prioritize legs|bring up legs|more leg work|leg day|grow legs)/.test(t)) {
    return "Required";
  }

  return undefined;
}

export function parseTrainingPrioritiesText(text?: string): ParsedTrainingPriorities {
  return {
    rawText: text,
    lowerBodyPriority: inferLowerBodyPriorityFromText(text),
    // Other fields are intentionally left for future AI parsing.
  };
}

export function getStoredUserProfile(
  focus: TrainingFocus,
  experienceLevel: ExperienceLevel,
  goal: PriorityGoal
): UserProfile {
  const fallback = createDefaultUserProfile(focus, experienceLevel, goal);
  if (typeof window === "undefined") return fallback;

  function inferLowerBodyPriorityFromAssistantMemory(memory: AssistantSelectiveMemoryV1): LowerBodyPriority | undefined {
    const deprior = memory.stablePreferences.deprioritizedMuscles.value ?? [];
    if (deprior.some((m) => m.trim().toLowerCase() === "legs")) return "Not a focus";
    const priority = memory.stablePreferences.priorityMuscles.value ?? [];
    if (priority.some((m) => m.trim().toLowerCase() === "legs")) return "Required";
    return undefined;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const coachPrioritise =
      normalizeCoachPrioritise(parsed.coachPrioritise) ?? fallback.coachPrioritise;
    const legacy = parsed as {
      goals?: { primaryGoal?: string };
      constraints?: {
        daysPerWeekAvailable?: number;
        equipmentAvailable?: string[];
        injuriesOrLimitations?: string[];
        sessionLengthMinutes?: number;
      };
    };
    const trainingPrioritiesText = normalizeTrainingPrioritiesText(parsed.trainingPrioritiesText) ?? fallback.trainingPrioritiesText;
    const lowerFromText = inferLowerBodyPriorityFromText(trainingPrioritiesText);
    const lowerFromLegacy = normalizeLowerBodyPriority(parsed.lowerBodyPriority);
    const memory = getSelectiveAssistantMemory();
    const lowerFromMemory = inferLowerBodyPriorityFromAssistantMemory(memory);

    return {
      goal:
        (typeof parsed.goal === "string" ? parsed.goal : legacy.goals?.primaryGoal) ??
        fallback.goal,
      trainingDaysAvailable:
        (typeof parsed.trainingDaysAvailable === "number"
          ? parsed.trainingDaysAvailable
          : legacy.constraints?.daysPerWeekAvailable) ?? fallback.trainingDaysAvailable,
      equipment: uniqueLower(
        (Array.isArray(parsed.equipment) ? (parsed.equipment as string[]) : legacy.constraints?.equipmentAvailable) ??
          fallback.equipment
      ),
      injuries: uniqueLower(
        (Array.isArray(parsed.injuries) ? (parsed.injuries as string[]) : legacy.constraints?.injuriesOrLimitations) ??
          fallback.injuries ??
          []
      ),
      availableSessionTime:
        (typeof parsed.availableSessionTime === "number"
          ? parsed.availableSessionTime
          : legacy.constraints?.sessionLengthMinutes) ?? fallback.availableSessionTime,
      trainingPrioritiesText,
      coachPrioritise,
      // App data outranks memory: only use assistant memory when profile notes didn't specify leg intent.
      lowerBodyPriority: lowerFromText ?? lowerFromLegacy ?? lowerFromMemory ?? fallback.lowerBodyPriority,
    };
  } catch {
    return fallback;
  }
}

