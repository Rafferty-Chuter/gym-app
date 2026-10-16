"use client";

import { useSyncExternalStore } from "react";
import type { Entity, RecordStore, Repo, Singleton } from "@/lib/storage/repo";

const EMPTY_LIST: readonly never[] = Object.freeze([]);
const EMPTY_RECORD: Readonly<Record<string, never>> = Object.freeze({});

/** Live list from a repo. Empty during SSR and before hydration. */
export function useRepo<T extends Entity>(repo: Repo<T>): readonly T[] {
  return useSyncExternalStore(repo.subscribe, repo.snapshot, () => EMPTY_LIST as readonly T[]);
}

export function useSingleton<T>(store: Singleton<T>): T | null {
  return useSyncExternalStore(store.subscribe, store.snapshot, () => null);
}

export function useRecordStore<T>(store: RecordStore<T>): Readonly<Record<string, T>> {
  return useSyncExternalStore(store.subscribe, store.snapshot, () => EMPTY_RECORD as Readonly<Record<string, T>>);
}

export { useIsHydrated } from "@/lib/ui/useIsHydrated";
