"use client";

import { STAGE_COLOR } from "@/components/sleep/parts";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { StageShares, StageSplit } from "@/lib/physique/recovery";

const TILES: Array<{ key: keyof StageShares; min: keyof StageSplit; label: string; stage: "awake" | "rem" | "core" | "deep" }> = [
  { key: "awake", min: "awakeMin", label: "Awake", stage: "awake" },
  { key: "rem", min: "remMin", label: "REM", stage: "rem" },
  { key: "core", min: "coreMin", label: "Core", stage: "core" },
  { key: "deep", min: "deepMin", label: "Deep", stage: "deep" },
];

const fmt = (min: number) => (min < 60 ? `${min} min` : formatHoursMin(min));

/**
 * The night's stages as four tiles (S8, after Bevel): minutes, share of
 * the night and your usual share once five nights carry stages. Shown,
 * never scored (research C §4.2).
 */
export default function StageTiles({ split, typical }: { split: StageSplit; typical: StageShares | null }) {
  const total = split.asleepMin + split.awakeMin;
  if (total <= 0) return null;
  return (
    <div className="grid grid-cols-2 gap-2">
      {TILES.map((t) => {
        const min = split[t.min] as number;
        const share = min / total;
        const usual = typical?.[t.key] ?? null;
        return (
          <div key={t.key} className="flex flex-col gap-2 rounded-[14px] px-3.5 py-3" style={{ background: "var(--sl-surface)" }} aria-label={`${t.label} ${fmt(min)}, ${Math.round(share * 100)} %${usual != null ? `, usually ${Math.round(usual * 100)} %` : ""}`}>
            <span className="flex items-center gap-2 text-[13px]" style={{ color: "var(--sl-text-secondary)" }}>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: STAGE_COLOR[t.stage] }} aria-hidden />
              {t.label}
            </span>
            <span className="text-[20px] font-semibold leading-none" style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmt(min)}
            </span>
            <span className="text-[12px]" style={{ color: "var(--sl-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {Math.round(share * 100)}%{usual != null ? ` · usually ${Math.round(usual * 100)}%` : ""}
            </span>
            <div className="relative h-1 w-full rounded-full" style={{ background: "var(--sl-surface-raised)" }} aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100 * 2)}%`, background: STAGE_COLOR[t.stage] }} />
              {usual != null && <div className="absolute -top-1 h-3 w-[2px] rounded-full" style={{ left: `calc(${Math.min(100, usual * 100 * 2)}% - 1px)`, background: "var(--sl-text)" }} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
