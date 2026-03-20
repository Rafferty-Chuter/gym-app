"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";

const STORAGE_KEY = "priorityGoal";

export type PriorityGoal =
  | "Increase Bench Press"
  | "Increase Squat"
  | "Increase Deadlift"
  | "Build Chest"
  | "Build Back"
  | "Build Overall Muscle"
  | "Improve Overall Strength";

export const PRIORITY_GOAL_OPTIONS: PriorityGoal[] = [
  "Increase Bench Press",
  "Increase Squat",
  "Increase Deadlift",
  "Build Chest",
  "Build Back",
  "Build Overall Muscle",
  "Improve Overall Strength",
];

function readPriorityGoal(): PriorityGoal {
  if (typeof window === "undefined") return "Improve Overall Strength";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (PRIORITY_GOAL_OPTIONS.includes(raw as PriorityGoal)) return raw as PriorityGoal;
    return "Improve Overall Strength";
  } catch {
    return "Improve Overall Strength";
  }
}

type PriorityGoalContextValue = {
  goal: PriorityGoal;
  setGoal: (g: PriorityGoal) => void;
};

const PriorityGoalContext = createContext<PriorityGoalContextValue | undefined>(undefined);

export function PriorityGoalProvider({ children }: { children: ReactNode }) {
  const [goal, setGoalState] = useState<PriorityGoal>("Improve Overall Strength");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setGoalState(readPriorityGoal());
    setMounted(true);
  }, []);

  function setGoal(g: PriorityGoal) {
    setGoalState(g);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, g);
      } catch {
        /* ignore */
      }
    }
  }

  const value = mounted ? { goal, setGoal } : { goal: "Improve Overall Strength" as PriorityGoal, setGoal };
  return <PriorityGoalContext.Provider value={value}>{children}</PriorityGoalContext.Provider>;
}

export function usePriorityGoal(): PriorityGoalContextValue {
  const ctx = useContext(PriorityGoalContext);
  if (!ctx) throw new Error("usePriorityGoal must be used within PriorityGoalProvider");
  return ctx;
}

