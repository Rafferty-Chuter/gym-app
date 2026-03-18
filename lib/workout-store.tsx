"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

const WORKOUT_HISTORY_KEY = "workoutHistory";

export type CompletedWorkout = {
  id: number;
  completedAt: string; // ISO date string
  name?: string;
  exercises: { name: string; sets: { weight: string; reps: string }[] }[];
  totalExercises: number;
  totalSets: number;
};

type StoredWorkout = {
  completedAt: string;
  name?: string;
  exercises: { name: string; sets: { weight: string; reps: string }[] }[];
};

type WorkoutStore = {
  workouts: CompletedWorkout[];
  addWorkout: (workout: Omit<CompletedWorkout, "id">) => void;
};

const WorkoutContext = createContext<WorkoutStore | undefined>(undefined);

function loadFromStorage(): CompletedWorkout[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (!raw) return [];
    const parsed: StoredWorkout[] = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((w, i) => ({
      id: new Date(w.completedAt).getTime() + i,
      completedAt: w.completedAt,
      name: w.name,
      exercises: w.exercises ?? [],
      totalExercises: w.exercises?.length ?? 0,
      totalSets: w.exercises?.reduce((sum, ex) => sum + (ex.sets?.length ?? 0), 0) ?? 0,
    }));
  } catch {
    return [];
  }
}

function saveToStorage(workouts: CompletedWorkout[]) {
  if (typeof window === "undefined") return;
  try {
    const toStore: StoredWorkout[] = workouts.map((w) => ({
      completedAt: w.completedAt,
      name: w.name,
      exercises: w.exercises,
    }));
    localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(toStore));
  } catch {
    // ignore
  }
}

export function WorkoutStoreProvider({ children }: { children: ReactNode }) {
  const [workouts, setWorkouts] = useState<CompletedWorkout[]>([]);

  useEffect(() => {
    setWorkouts(loadFromStorage());
  }, []);

  const addWorkout = useCallback((workout: Omit<CompletedWorkout, "id">) => {
    const withId: CompletedWorkout = {
      ...workout,
      id: Date.now(),
    };
    const stored = loadFromStorage();
    const next = [...stored, withId];
    saveToStorage(next);
    setWorkouts(next);
  }, []);

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

