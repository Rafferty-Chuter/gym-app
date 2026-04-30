import type { SessionType } from "@/lib/sessionTemplates";

export type WorkoutBuilderGoal =
  | "build_overall_muscle"
  | "improve_overall_strength"
  | "strength_hypertrophy"
  | "upper_body_emphasis"
  | "chest_emphasis"
  | "bench_strength_emphasis"
  | "balanced";

export type RecoveryMode = "normal" | "low_fatigue";

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

export type WeeklyFrequencyRecommendation = {
  timesPerWeek: number;
  restDaysBetween: number;
  rationale: string;
};

export type BuiltWorkout = {
  sessionType: SessionType;
  purposeSummary: string;
  exercises: WorkoutExercise[];
  notes: string[];
  warnings: string[];
  weeklyFrequency?: WeeklyFrequencyRecommendation;
  pairingNote?: string;
  requestedPlacements?: Array<{
    exerciseId: string;
    exerciseName: string;
    status: "placed_slot" | "unplaced";
    slotId?: string;
    slotLabel?: string;
    reason: string;
  }>;
};
