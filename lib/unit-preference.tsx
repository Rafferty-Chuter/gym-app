"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const STORAGE_KEY = "weightUnit";

export type WeightUnit = "kg" | "lb";

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

export function UnitProvider({ children }: { children: ReactNode }) {
  const [unit, setUnitState] = useState<WeightUnit>("kg");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setUnitState(readUnit());
    setMounted(true);
  }, []);

  function setUnit(u: WeightUnit) {
    setUnitState(u);
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, u);
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
