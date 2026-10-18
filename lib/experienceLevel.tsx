"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "experienceLevel";
/** Fired when the level is set outside the provider (goal setup), so open screens pick it up. */
export const EXPERIENCE_LEVEL_CHANGED_EVENT = "experienceLevelChanged";

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
    const reread = () => setState(readExperienceLevel());
    window.addEventListener(EXPERIENCE_LEVEL_CHANGED_EVENT, reread);
    return () => window.removeEventListener(EXPERIENCE_LEVEL_CHANGED_EVENT, reread);
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

/** Goal setup's training status, in this setting's words. */
const FROM_STATUS = { novice: "Beginner", intermediate: "Intermediate", advanced: "Advanced" } as const;

/**
 * The training status chosen in goal setup becomes the experience level
 * (B2): the question is asked once, there, and Profile no longer asks it
 * again. Wrapped like every storage write; a failure leaves the old level.
 */
export function syncExperienceFromStatus(status: keyof typeof FROM_STATUS): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, FROM_STATUS[status]);
    window.dispatchEvent(new Event(EXPERIENCE_LEVEL_CHANGED_EVENT));
  } catch {
    /* ignore */
  }
}
