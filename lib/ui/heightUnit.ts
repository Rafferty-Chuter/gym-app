/**
 * Height shown in centimetres or feet and inches (C5). Display only:
 * the profile always stores whole centimetres.
 */

import { useSyncExternalStore } from "react";
import { kvGet, kvSet, subscribeKey } from "@/lib/storage/kv";
import type { HeightUnit } from "@/lib/units";

export const HEIGHT_UNIT_KEY = "heightUnit";

export function readHeightUnit(): HeightUnit {
  if (typeof window === "undefined") return "cm";
  try {
    return kvGet<string>(HEIGHT_UNIT_KEY) === "ft" ? "ft" : "cm";
  } catch {
    return "cm";
  }
}

export function setHeightUnit(u: HeightUnit): void {
  if (typeof window === "undefined") return;
  try {
    kvSet(HEIGHT_UNIT_KEY, u);
  } catch {
    // Storage blocked: centimetres stay.
  }
}

/** The current height unit, following changes from any screen. */
export function useHeightUnit(): HeightUnit {
  return useSyncExternalStore(
    (cb) => subscribeKey(HEIGHT_UNIT_KEY, cb),
    readHeightUnit,
    () => "cm",
  );
}
