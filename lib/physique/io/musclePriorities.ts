"use client";

import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import type { MuscleGroup } from "@/lib/volumeAnalysis";
import type { Priorities, Priority } from "@/lib/training/volumeTargets";

/** Emphasise / Grow / Maintain per muscle (T5). Muscles without an entry grow. In backups. */
export const musclePrioritiesStore = createSingleton<Priorities>("physique.v1.musclePriorities");

export function useMusclePriorities(): Priorities | null {
  return useSingleton(musclePrioritiesStore);
}

export async function setMusclePriority(group: MuscleGroup, priority: Priority): Promise<void> {
  const cur = (await musclePrioritiesStore.get()) ?? {};
  await musclePrioritiesStore.set({ ...cur, [group]: priority });
}
