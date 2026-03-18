"use client";

import type { ReactNode } from "react";
import { WorkoutStoreProvider } from "@/lib/workout-store";
import { UnitProvider } from "@/lib/unit-preference";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <UnitProvider>
      <WorkoutStoreProvider>{children}</WorkoutStoreProvider>
    </UnitProvider>
  );
}

