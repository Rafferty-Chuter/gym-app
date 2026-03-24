"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "weightUnit";

export type WeightUnit = "kg" | "lb";
const WORKOUT_HISTORY_KEY = "workoutHistory";
const ACTIVE_WORKOUT_KEY = "activeWorkout";
const KG_TO_LB = 2.2046226218;

function readUnit(): WeightUnit {
  if (typeof window === "undefined") return "kg";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "lb" || raw === "kg") return raw;
    return "kg";
  } catch {
    return "kg";
  }
}

type UnitContextValue = { unit: WeightUnit; setUnit: (u: WeightUnit) => void };

const UnitContext = createContext<UnitContextValue | undefined>(undefined);

function formatConvertedWeight(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  if (!Number.isFinite(rounded)) return "";
  if (Math.abs(rounded - Math.round(rounded)) < 0.000001) return String(Math.round(rounded));
  return rounded.toFixed(1).replace(/\.0$/, "");
}

function convertWeightText(weight: string, from: WeightUnit, to: WeightUnit): string {
  const raw = String(weight ?? "");
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  const n = Number.parseFloat(trimmed);
  if (!Number.isFinite(n)) return raw;
  const converted = from === "kg" && to === "lb" ? n * KG_TO_LB : n / KG_TO_LB;
  return formatConvertedWeight(converted);
}

function convertStoredLoggedWeights(from: WeightUnit, to: WeightUnit) {
  if (typeof window === "undefined" || from === to) return;
  try {
    const rawHistory = localStorage.getItem(WORKOUT_HISTORY_KEY);
    if (rawHistory) {
      const history = JSON.parse(rawHistory) as Array<{
        exercises?: Array<{ sets?: Array<{ weight?: string }> }>;
      }>;
      if (Array.isArray(history)) {
        const convertedHistory = history.map((workout) => ({
          ...workout,
          exercises: (workout.exercises ?? []).map((exercise) => ({
            ...exercise,
            sets: (exercise.sets ?? []).map((set) => ({
              ...set,
              weight:
                typeof set.weight === "string"
                  ? convertWeightText(set.weight, from, to)
                  : set.weight,
            })),
          })),
        }));
        localStorage.setItem(WORKOUT_HISTORY_KEY, JSON.stringify(convertedHistory));
      }
    }
  } catch {
    // ignore malformed history
  }

  try {
    const rawDraft = localStorage.getItem(ACTIVE_WORKOUT_KEY);
    if (rawDraft) {
      const draft = JSON.parse(rawDraft) as {
        exercises?: Array<{ sets?: Array<{ weight?: string }> }>;
      };
      if (draft && typeof draft === "object") {
        const convertedDraft = {
          ...draft,
          exercises: (draft.exercises ?? []).map((exercise) => ({
            ...exercise,
            sets: (exercise.sets ?? []).map((set) => ({
              ...set,
              weight:
                typeof set.weight === "string"
                  ? convertWeightText(set.weight, from, to)
                  : set.weight,
            })),
          })),
        };
        localStorage.setItem(ACTIVE_WORKOUT_KEY, JSON.stringify(convertedDraft));
      }
    }
  } catch {
    // ignore malformed draft
  }
}

export function UnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>("kg");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUnitState(readUnit());
    setMounted(true);
  }, []);

  function setUnit(u: WeightUnit) {
    if (u === unit) return;
    const previousUnit = unit;
    setUnitState(u);
    if (typeof window !== "undefined") {
      try {
        convertStoredLoggedWeights(previousUnit, u);
        localStorage.setItem(STORAGE_KEY, u);
        window.dispatchEvent(
          new CustomEvent("weightUnitConverted", {
            detail: { from: previousUnit, to: u },
          })
        );
      } catch {
        /* ignore */
      }
    }
  }

  const value = mounted ? { unit, setUnit } : { unit: "kg" as WeightUnit, setUnit };

  return <UnitContext.Provider value={value}>{children}</UnitContext.Provider>;
}

export function useUnit(): UnitContextValue {
  const ctx = useContext(UnitContext);
  if (!ctx) throw new Error("useUnit must be used within UnitProvider");
  return ctx;
}
