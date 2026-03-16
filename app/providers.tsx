"use client";

import type { ReactNode } from "react";
import { WorkoutStoreProvider } from "@/lib/workout-store";

export function AppProviders({ children }: { children: ReactNode }) {
  return <WorkoutStoreProvider>{children}</WorkoutStoreProvider>;
}

