import type { SessionType } from "@/lib/sessionTemplates";

export type FatigueMode = "normal" | "low_fatigue";

export type FatigueRule = {
  id: string;
  baseSetCost: number;
  failureMultiplier: number;
  heavyLoadMultiplier: number;
  notes: string[];
};

export type SessionFatigueRule = {
  sessionType: SessionType;
  softCap: number;
  highFatigueThreshold: number;
  stopAddingThreshold: number;
};

export type MuscleRecoveryRule = {
  muscle: string;
  typicalRecoveryHours: { min: number; max: number };
};

export const EXERCISE_FATIGUE_RULES: Record<string, FatigueRule> = {
  main_compound: {
    id: "main_compound",
    baseSetCost: 3.0,
    failureMultiplier: 1.35,
    heavyLoadMultiplier: 1.2,
    notes: ["High systemic fatigue driver, especially at low RIR."],
  },
  secondary_compound: {
    id: "secondary_compound",
    baseSetCost: 2.2,
    failureMultiplier: 1.25,
    heavyLoadMultiplier: 1.15,
    notes: ["Moderate-high fatigue, lower than primary compounds."],
  },
  machine_compound: {
    id: "machine_compound",
    baseSetCost: 1.8,
    failureMultiplier: 1.15,
    heavyLoadMultiplier: 1.1,
    notes: ["Lower systemic cost than free-weight compounds."],
  },
  isolation: {
    id: "isolation",
    baseSetCost: 1.2,
    failureMultiplier: 1.1,
    heavyLoadMultiplier: 1.0,
    notes: ["Usually safer to push hard with lower systemic cost."],
  },
  accessory: {
    id: "accessory",
    baseSetCost: 1.0,
    failureMultiplier: 1.05,
    heavyLoadMultiplier: 1.0,
    notes: ["Supportive work, usually low fatigue."],
  },
};

export const SESSION_FATIGUE_RULES: Record<SessionType, SessionFatigueRule> = {
  chest: { sessionType: "chest", softCap: 20, highFatigueThreshold: 26, stopAddingThreshold: 28 },
  back: { sessionType: "back", softCap: 22, highFatigueThreshold: 28, stopAddingThreshold: 30 },
  legs: { sessionType: "legs", softCap: 24, highFatigueThreshold: 30, stopAddingThreshold: 34 },
  shoulders: { sessionType: "shoulders", softCap: 18, highFatigueThreshold: 24, stopAddingThreshold: 26 },
  arms: { sessionType: "arms", softCap: 16, highFatigueThreshold: 22, stopAddingThreshold: 24 },
  push: { sessionType: "push", softCap: 22, highFatigueThreshold: 28, stopAddingThreshold: 31 },
  pull: { sessionType: "pull", softCap: 22, highFatigueThreshold: 28, stopAddingThreshold: 31 },
  upper: { sessionType: "upper", softCap: 24, highFatigueThreshold: 30, stopAddingThreshold: 33 },
  lower: { sessionType: "lower", softCap: 24, highFatigueThreshold: 30, stopAddingThreshold: 34 },
  full_body: { sessionType: "full_body", softCap: 26, highFatigueThreshold: 33, stopAddingThreshold: 36 },
};

export const MUSCLE_RECOVERY_RULES: MuscleRecoveryRule[] = [
  { muscle: "chest", typicalRecoveryHours: { min: 48, max: 72 } },
  { muscle: "lats_upper_back", typicalRecoveryHours: { min: 48, max: 72 } },
  { muscle: "quads", typicalRecoveryHours: { min: 48, max: 72 } },
  { muscle: "hamstrings", typicalRecoveryHours: { min: 48, max: 72 } },
  { muscle: "glutes", typicalRecoveryHours: { min: 48, max: 72 } },
  { muscle: "delts", typicalRecoveryHours: { min: 36, max: 60 } },
  { muscle: "biceps", typicalRecoveryHours: { min: 24, max: 48 } },
  { muscle: "triceps", typicalRecoveryHours: { min: 24, max: 48 } },
  { muscle: "calves", typicalRecoveryHours: { min: 24, max: 48 } },
];

