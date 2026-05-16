"use client";

import Link from "next/link";
import { useState } from "react";

export type ChartPointSet = {
  weight: number;
  reps: number;
  rir?: number;
  e1rm: number;
};

export type ChartPointDetail = {
  completedAt: string;
  heaviest: ChartPointSet;
  /** All sets that session, oldest → newest. Used by the "more sets" expansion. */
  allSets?: ChartPointSet[];
};

/**
 * Format an ISO date as "6 May 2026" (day-month-year, no commas).
 * Locale-aware day/month names; no timezone math beyond what `new Date` does.
 */
export function formatChartDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getDate();
  const month = d.toLocaleString(undefined, { month: "short" });
  const year = d.getFullYear();
  return `${day} ${month} ${year}`;
}

/** "100 kg × 4 @ RIR 0" — or "@ RIR —" when the user didn't log it. */
export function formatSetLine(set: ChartPointSet, unit: "kg" | "lb"): string {
  const rir = typeof set.rir === "number" && Number.isFinite(set.rir) ? `${set.rir}` : "—";
  return `${set.weight}${unit} × ${set.reps} @ RIR ${rir}`;
}

/**
 * Quiet tooltip card rendered after an SVG chart's <svg> sibling, anchored
 * by the parent via CSS positioning. Pure dumb component — the parent owns
 * activeIdx state and renders this conditionally.
 */
export function ChartPointTooltip({
  detail,
  unit,
  showE1RM,
  onClose,
}: {
  detail: ChartPointDetail;
  unit: "kg" | "lb";
  /** When the host chart's Y-axis is working weight, the e1RM line still adds value (shows rep-driven gains). */
  showE1RM: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const heaviest = detail.heaviest;
  const extras = detail.allSets
    ? detail.allSets.filter(
        (s) => !(s.weight === heaviest.weight && s.reps === heaviest.reps && s.rir === heaviest.rir)
      )
    : [];
  const dateLabel = formatChartDate(detail.completedAt);
  const sessionHref = `/history?w=${encodeURIComponent(detail.completedAt)}`;

  return (
    <div
      className="mt-3 rounded-xl px-3 py-2.5 text-[12px] leading-snug"
      style={{
        background: "rgba(14,20,32,0.95)",
        border: "1px solid rgba(0,229,176,0.28)",
        boxShadow: "0 4px 18px rgba(0,0,0,0.45)",
      }}
      role="dialog"
      aria-label={`Session detail for ${dateLabel}`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-app-tertiary">
          {dateLabel}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close tooltip"
          className="-mr-1 -mt-1 h-6 w-6 rounded-md text-app-tertiary hover:text-white hover:bg-white/[0.06] transition flex items-center justify-center"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3.5 w-3.5" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <p className="mt-1 text-[13px] font-semibold text-white tabular-nums">
        {formatSetLine(heaviest, unit)}
      </p>
      {showE1RM && (
        <p className="mt-0.5 text-[11px] text-app-secondary tabular-nums">
          Est. 1RM: <span className="text-white">{heaviest.e1rm.toFixed(1)}{unit}</span>
        </p>
      )}
      {extras.length > 0 && (
        <div className="mt-2">
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="text-[11px] font-semibold text-[color:var(--color-accent)] hover:underline"
            >
              +{extras.length} more set{extras.length === 1 ? "" : "s"}
            </button>
          ) : (
            <ul className="space-y-0.5">
              {extras.map((s, i) => (
                <li key={i} className="text-[11px] text-app-secondary tabular-nums">
                  {formatSetLine(s, unit)}
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-app-tertiary hover:text-white"
                >
                  Hide
                </button>
              </li>
            </ul>
          )}
        </div>
      )}
      <Link
        href={sessionHref}
        className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-[color:var(--color-accent)] hover:underline"
      >
        View session
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-3 w-3" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}

/** ARIA label for a tappable chart dot. */
export function chartPointAriaLabel(
  detail: ChartPointDetail,
  unit: "kg" | "lb"
): string {
  const date = formatChartDate(detail.completedAt);
  const set = detail.heaviest;
  const rirPart =
    typeof set.rir === "number" && Number.isFinite(set.rir)
      ? `, RIR ${set.rir}`
      : "";
  return `${date}, ${set.weight} ${unit === "kg" ? "kilograms" : "pounds"} by ${set.reps} reps${rirPart}`;
}
