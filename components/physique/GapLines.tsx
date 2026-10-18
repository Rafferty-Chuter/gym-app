"use client";

import { useMemo } from "react";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { findGaps, gapHref, gapLines } from "@/lib/physique/gaps";
import GapRows from "@/components/physique/GapRows";

/** Rows on Home shown on Home. Fewer than the tabs; the rest is on each tab. OURS. */
export const HOME_GAP_ROWS = 5;

/**
 * Home's gap list (Sprint 0, W2): food and weigh-ins, each row linking into
 * the tab on that day. Sleep is left out since S8: nights come from the
 * watch, and a night it missed is an empty bar on Sleep, not a task.
 */
export default function GapLines() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const data = useBodyData();
  const lines = useMemo(() => {
    if (!hydrated || !now) return [];
    return gapLines(findGaps({ foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: data.weighIns, sleepNights: [] }, now.today, ["food", "weight"]), now.today);
  }, [hydrated, now, data]);
  return <GapRows lines={lines} hrefFor={gapHref} max={HOME_GAP_ROWS} />;
}
