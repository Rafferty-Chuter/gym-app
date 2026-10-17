"use client";

/**
 * Live workout history for the physique layer. `getWorkoutHistory()` parses
 * localStorage on every call, so the snapshot is cached by the raw string to
 * keep `useSyncExternalStore` stable.
 */

import { useSyncExternalStore } from "react";
import { getWorkoutHistory, type StoredWorkout } from "@/lib/trainingAnalysis";
import { subscribeKey } from "@/lib/storage/kv";

const WORKOUT_HISTORY_KEY = "workoutHistory";
const EMPTY: readonly StoredWorkout[] = Object.freeze([]);

let cachedRaw: string | null | undefined;
let cachedList: readonly StoredWorkout[] = EMPTY;

function snapshot(): readonly StoredWorkout[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(WORKOUT_HISTORY_KEY);
  } catch {
    raw = null;
  }
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  cachedList = Object.freeze(getWorkoutHistory());
  return cachedList;
}

function subscribe(cb: () => void) {
  const unsubKey = subscribeKey(WORKOUT_HISTORY_KEY, cb);
  window.addEventListener("workoutHistoryChanged", cb);
  window.addEventListener("focus", cb);
  return () => {
    unsubKey();
    window.removeEventListener("workoutHistoryChanged", cb);
    window.removeEventListener("focus", cb);
  };
}

export function useWorkouts(): readonly StoredWorkout[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
