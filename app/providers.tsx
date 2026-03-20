"use client";

import type { ReactNode } from "react";
import { WorkoutStoreProvider } from "@/lib/workout-store";
import { UnitProvider } from "@/lib/unit-preference";
import { TrainingFocusProvider } from "@/lib/trainingFocus";
import { ExperienceLevelProvider } from "@/lib/experienceLevel";
import { PriorityGoalProvider } from "@/lib/priorityGoal";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <UnitProvider>
      <TrainingFocusProvider>
        <ExperienceLevelProvider>
          <PriorityGoalProvider>
            <WorkoutStoreProvider>{children}</WorkoutStoreProvider>
          </PriorityGoalProvider>
        </ExperienceLevelProvider>
      </TrainingFocusProvider>
    </UnitProvider>
  );
}

