"use client";

import { STAGE_COLOR } from "@/components/sleep/parts";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { StageShares, StageSplit } from "@/lib/physique/recovery";

/** Rows top to bottom, in the hypnogram's lane order. */
const ROWS: Array<{ key: keyof StageShares; min: keyof StageSplit; label: string }> = [
  { key: "awake", min: "awakeMin", label: "Awake" },
  { key: "rem", min: "remMin", label: "REM" },
  { key: "core", min: "coreMin", label: "Core" },
  { key: "deep", min: "deepMin", label: "Deep" },
];

const fmt = (min: number) => (min < 60 ? `${min}m` : formatHoursMin(min));

/**
 * The night's stages as a bar chart (C3, in place of the split bar and
 * four tiles): one bar per stage on a shared scale, the time and share on
 * the right, and a tick at your usual share once enough nights carry
 * stages. Shown, never scored (research C §4.2).
 */
export default function StageBars({ split, typical }: { split: StageSplit; typical: StageShares | null }) {
  const total = split.asleepMin + split.awakeMin;
  if (total <= 0) return null;
  const shares = ROWS.map((r) => (split[r.min] as number) / total);
  // The widest bar or usual tick fills the track, so short stages still read.
  const scale = Math.max(...shares, ...(typical ? ROWS.map((r) => typical[r.key]) : [0]), 0.01);
  return (
    <div className="flex flex-col gap-3">
      {ROWS.map((r, i) => {
        const min = split[r.min] as number;
        const share = shares[i];
        const usual = typical?.[r.key] ?? null;
        return (
          <div
            key={r.key}
            className="grid grid-cols-[3rem_1fr_auto] items-center gap-3"
            aria-label={`${r.label} ${fmt(min)}, ${Math.round(share * 100)}%${usual != null ? `, usually ${Math.round(usual * 100)}%` : ""}`}
          >
            <span className="text-[13px]" style={{ color: "var(--sl-text-secondary)" }}>
              {r.label}
            </span>
            <div className="relative h-3 w-full rounded-full" style={{ background: "var(--sl-surface-raised)" }} aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${(share / scale) * 100}%`, minWidth: min > 0 ? 4 : 0, background: STAGE_COLOR[r.key] }} />
              {usual != null && <div className="absolute -top-1 h-5 w-[2px] rounded-full" style={{ left: `calc(${(usual / scale) * 100}% - 1px)`, background: "var(--sl-text)" }} />}
            </div>
            <span className="flex w-[6.5rem] items-baseline justify-end gap-1.5 text-right" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span className="text-[15px] font-semibold">{fmt(min)}</span>
              <span className="w-[2.25rem] text-[12px]" style={{ color: "var(--sl-text-tertiary)" }}>
                {Math.round(share * 100)}%
              </span>
            </span>
          </div>
        );
      })}
      {typical && (
        <span className="flex items-center gap-2 text-[12px]" style={{ color: "var(--sl-text-tertiary)" }}>
          <span className="h-3 w-[2px] rounded-full" style={{ background: "var(--sl-text)" }} aria-hidden />
          Your usual share
        </span>
      )}
    </div>
  );
}
