"use client";

/**
 * IN8: what the person chose to let Liftworks read from Apple Health beyond
 * the standard kinds. Wrist temperature and cycle are read only after they
 * turn them on here; both Apple Health paths check it (the iPhone app asks
 * HealthKit for them only then, and the merge drops them otherwise).
 * Turning one off removes what was read for it. Kept on this device, as the
 * HealthKit permission is.
 */

import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { vitalsRepo } from "@/lib/physique/io/repos";
import type { DailyVitals } from "@/lib/physique/types";

export type HealthOptIn = {
  wristTemp?: boolean;
  cycle?: boolean;
  /** When the choice last changed. */
  changedAt?: string;
};

export type OptInKind = "wristTemp" | "cycle";

export const healthOptInStore = createSingleton<HealthOptIn>("physique.v1.healthOptIn");

export function useHealthOptIn(): HealthOptIn | null {
  return useSingleton(healthOptInStore);
}

/** The stored fields each opt-in covers. */
const FIELDS: Readonly<Record<OptInKind, ReadonlyArray<keyof DailyVitals>>> = {
  wristTemp: ["wristTempC"],
  cycle: ["menstrualFlow", "cycleStart"],
};

/** A day's record without the fields of the kinds turned off; null when it had none of them. */
export function withoutKind(v: DailyVitals, kind: OptInKind): DailyVitals | null {
  const fields = FIELDS[kind];
  if (!fields.some((f) => v[f] !== undefined)) return null;
  const copy: DailyVitals = { ...v };
  for (const f of fields) delete copy[f];
  return copy;
}

/** Turn an opt-in on or off. Off removes every value read for it. */
export async function setHealthOptIn(kind: OptInKind, on: boolean, nowIso: string): Promise<void> {
  const cur = (await healthOptInStore.get()) ?? {};
  await healthOptInStore.set({ ...cur, [kind]: on, changedAt: nowIso });
  if (on) return;
  const stripped = vitalsRepo
    .snapshot()
    .map((v) => withoutKind(v, kind))
    .filter((v): v is DailyVitals => v != null);
  if (stripped.length) await vitalsRepo.bulkUpsert(stripped);
}
