"use client";

import { Row, RowGroup } from "@/components/physique/ui";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { PhysiqueAnalysis } from "@/lib/physique/types";
import { STATUS_HEX } from "@/lib/ui/status";

const STRENGTH_WORD: Record<PhysiqueAnalysis["strength"]["status"], string> = {
  dropping: "Dropping",
  holding: "Holding",
  rising: "Rising",
  "one-lift": "One lift down",
  unclear: "Unclear",
};

const SLEEP_WORD: Record<PhysiqueAnalysis["sleep"]["status"], string> = {
  severe: "Very short",
  short: "Short",
  ok: "OK",
  unknown: "Not enough nights",
};

function pct(v: number | null): string {
  if (v == null) return "n/a";
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(0)}%`;
}

/** Main lifts since the phase started, and the 14-night sleep read. */
export default function StrengthSleepRows({ analysis, showSleep = true }: { analysis: PhysiqueAnalysis; showSleep?: boolean }) {
  const s = analysis.strength;
  const sl = analysis.sleep;
  const liftsLine =
    s.lifts.length > 0
      ? s.lifts
          .slice(0, 4)
          .map((l) => `${l.name} ${pct(l.changePct)}`)
          .join(" · ")
      : s.mainLifts === 0
        ? "No main lifts logged yet"
        : s.baselineMissing
          ? "No pre-phase baseline yet"
          : "Not enough sessions yet";
  const strengthColor = s.status === "dropping" ? STATUS_HEX.attention : s.status === "one-lift" ? STATUS_HEX.watch : s.status === "unclear" ? "var(--text-tertiary)" : "var(--text)";
  const sleepColor = sl.status === "severe" ? STATUS_HEX.attention : sl.status === "short" ? STATUS_HEX.watch : sl.status === "unknown" ? "var(--text-tertiary)" : "var(--text)";
  return (
    <RowGroup>
      <Row
        label={analysis.goal && analysis.goal.type !== "maintain" ? "Lifts since phase start" : "Lifts"}
        value={<span style={{ color: strengthColor }}>{STRENGTH_WORD[s.status]}</span>}
        sub={liftsLine}
      />
      {showSleep && <Row
        label={`Sleep · ${sl.nightsLogged14} of 14 nights`}
        value={<span style={{ color: sleepColor }}>{sl.mean14h == null ? SLEEP_WORD[sl.status] : formatHoursMin(sl.mean14h * 60)}</span>}
        sub={
          sl.mean14h == null
            ? "Log 10 of 14 nights for a read"
            : `${SLEEP_WORD[sl.status]}${sl.debt7h != null && sl.debt7h > 0.5 ? ` · ${sl.debt7h.toFixed(1)} h behind this week` : ""}${sl.acute ? " · short night" : ""}`
        }
      />}
    </RowGroup>
  );
}
