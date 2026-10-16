"use client";

import { useSyncExternalStore } from "react";
import { clientNow, type LocalDate, type Now } from "@/lib/dates";

function subscribe(cb: () => void) {
  // The date can roll over while the app sits in the background.
  window.addEventListener("focus", cb);
  document.addEventListener("visibilitychange", cb);
  return () => {
    window.removeEventListener("focus", cb);
    document.removeEventListener("visibilitychange", cb);
  };
}

let cached: Now | null = null;
function snapshot(): Now {
  const n = clientNow();
  if (!cached || cached.today !== n.today || cached.tz !== n.tz) cached = n;
  return cached;
}

/**
 * The client's `now = {today, tz}`; `null` on the server and during
 * hydration so dates never come from the server clock (CLAUDE.md rule 1).
 */
export function useNow(): Now | null {
  return useSyncExternalStore(subscribe, snapshot, () => null);
}

export function useToday(): LocalDate | null {
  return useNow()?.today ?? null;
}
