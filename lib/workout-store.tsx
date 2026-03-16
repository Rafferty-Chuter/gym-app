"use client";

import {
  createContext,
  useContext,
  useState,
  type ReactNode,
} from "react";

/**
 * Simple in-memory store for completed workouts, shared across pages.
 * Data lasts only while the app is running (no database or localStorage).
 */

export type CompletedWorkout = {
  id: number;
  completedAt: string; // ISO date string
  exercises: { name: string; sets: { weight: string; reps: string }[] }[];
  totalExercises: number;
  totalSets: number;
};

type WorkoutStore = {
  workouts: CompletedWorkout[];
  addWorkout: (workout: Omit<CompletedWorkout, "id">) => void;
};

const WorkoutContext = createContext<WorkoutStore | undefined>(undefined);

export function WorkoutStoreProvider({ children }: { children: ReactNode }) {
  const [workouts, setWorkouts] = useState<CompletedWorkout[]>([]);

  function addWorkout(workout: Omit<CompletedWorkout, "id">) {
    setWorkouts((prev) => [
      ...prev,
      {
        ...workout,
        id: Date.now(),
      },
    ]);
  }

  return (
    <WorkoutContext.Provider value={{ workouts, addWorkout }}>
      {children}
    </WorkoutContext.Provider>
  );
}

export function useWorkoutStore(): WorkoutStore {
  const ctx = useContext(WorkoutContext);
  if (!ctx) {
    throw new Error("useWorkoutStore must be used within WorkoutStoreProvider");
  }
  return ctx;
}

