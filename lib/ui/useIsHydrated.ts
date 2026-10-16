"use client";

import { useSyncExternalStore } from "react";

const SUBSCRIBE_NOOP = () => () => {};

/**
 * True once the component has mounted on the client; false during SSR and
 * the hydration render. Lets pages that read browser storage render a
 * stable shell first instead of a hydration mismatch.
 */
export function useIsHydrated(): boolean {
  return useSyncExternalStore(
    SUBSCRIBE_NOOP,
    () => true,
    () => false
  );
}
