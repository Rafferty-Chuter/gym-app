"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "experienceLevel";

export type ExperienceLevel = "Beginner" | "Intermediate" | "Advanced";

export const EXPERIENCE_LEVEL_OPTIONS: ExperienceLevel[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

function readExperienceLevel(): ExperienceLevel {
  if (typeof window === "undefined") return "Intermediate";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (EXPERIENCE_LEVEL_OPTIONS.includes(raw as ExperienceLevel)) return raw as ExperienceLevel;
    return "Intermediate";
  } catch {
    return "Intermediate";
  }
}

type ExperienceLevelContextValue = {
  experienceLevel: ExperienceLevel;
  setExperienceLevel: (e: ExperienceLevel) => void;
};

const ExperienceLevelContext = createContext<ExperienceLevelContextValue | undefined>(undefined);

export function ExperienceLevelProvider({ children }: { children: ReactNode }) {
  const [experienceLevel, setState] = useState<ExperienceLevel>("Intermediate");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setState(readExperienceLevel());
    setMounted(true);
  }, []);

  function setExperienceLevel(e: ExperienceLevel) {
    setState(e);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, e);
      } catch {
        /* ignore */
      }
    }
  }

  const value = mounted
    ? { experienceLevel, setExperienceLevel }
    : { experienceLevel: "Intermediate" as ExperienceLevel, setExperienceLevel };

  return (
    <ExperienceLevelContext.Provider value={value}>
      {children}
    </ExperienceLevelContext.Provider>
  );
}

export function useExperienceLevel(): ExperienceLevelContextValue {
  const ctx = useContext(ExperienceLevelContext);
  if (!ctx) throw new Error("useExperienceLevel must be used within ExperienceLevelProvider");
  return ctx;
}
