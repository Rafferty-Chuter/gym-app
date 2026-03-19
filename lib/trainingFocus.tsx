"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "trainingFocus";

export type TrainingFocus = "Hypertrophy" | "Powerlifting" | "General Strength" | "General Fitness";

export const TRAINING_FOCUS_OPTIONS: TrainingFocus[] = [
  "Hypertrophy",
  "Powerlifting",
  "General Strength",
  "General Fitness",
];

function readFocus(): TrainingFocus {
  if (typeof window === "undefined") return "General Fitness";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (TRAINING_FOCUS_OPTIONS.includes(raw as TrainingFocus)) return raw as TrainingFocus;
    return "General Fitness";
  } catch {
    return "General Fitness";
  }
}

type TrainingFocusContextValue = { focus: TrainingFocus; setFocus: (f: TrainingFocus) => void };

const TrainingFocusContext = createContext<TrainingFocusContextValue | undefined>(undefined);

export function TrainingFocusProvider({ children }: { children: ReactNode }) {
  const [focus, setFocusState] = useState<TrainingFocus>("General Fitness");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setFocusState(readFocus());
    setMounted(true);
  }, []);

  function setFocus(f: TrainingFocus) {
    setFocusState(f);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, f);
      } catch {
        /* ignore */
      }
    }
  }

  const value = mounted ? { focus, setFocus } : { focus: "General Fitness" as TrainingFocus, setFocus };

  return (
    <TrainingFocusContext.Provider value={value}>
      {children}
    </TrainingFocusContext.Provider>
  );
}

export function useTrainingFocus(): TrainingFocusContextValue {
  const ctx = useContext(TrainingFocusContext);
  if (!ctx) throw new Error("useTrainingFocus must be used within TrainingFocusProvider");
  return ctx;
}

/** Read focus from localStorage without React (e.g. in non-React code). */
export function getStoredTrainingFocus(): TrainingFocus {
  return readFocus();
}
