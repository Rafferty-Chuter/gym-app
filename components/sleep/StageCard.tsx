"use client";

import { Caption } from "@/components/physique/ui";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { StageShares, StageSplit } from "@/lib/physique/recovery";

const ROWS: Array<{ key: keyof StageShares; min: keyof StageSplit; label: string }> = [
  { key: "awake", min: "awakeMin", label: "Awake" },
  { key: "rem", min: "remMin", label: "REM" },
  { key: "core", min: "coreMin", label: "Core" },
  { key: "deep", min: "deepMin", label: "Deep" },
];

const fmt = (min: number) => (min < 60 ? `${min} min` : formatHoursMin(min));

/**
 * The night's stages from the watch (S6, after WHOOP's stage bars): each
 * stage's minutes and share, with a tick at the user's usual share once
 * five nights carry stages. Shown, never scored: wearable stage accuracy
 * is moderate (research C §4.2), so the bars stay grey.
 */
export default function StageCard({ split, typical }: { split: StageSplit; typical: StageShares | null }) {
  const total = split.asleepMin + split.awakeMin;
  if (total <= 0) return null;
  return (
    <section aria-label="Stages">
      <div className="mb-2 flex items-baseline justify-between">
        <Caption>Stages</Caption>
        <Caption>{typical ? "Tick is your usual" : "From the watch"}</Caption>
      </div>
      <ul className="flex flex-col gap-3 rounded-[12px] px-4 py-3.5" style={{ background: "#141416" }}>
        {ROWS.map((r) => {
          const min = split[r.min] as number;
          const share = min / total;
          const usual = typical?.[r.key] ?? null;
          return (
            <li key={r.key} aria-label={`${r.label} ${fmt(min)}, ${Math.round(share * 100)} %${usual != null ? `, usually ${Math.round(usual * 100)} %` : ""}`}>
              <div className="flex items-baseline justify-between text-[13px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                <span style={{ color: "#a3a3a8" }}>
                  {r.label} <span style={{ color: "#6f6f76" }}>{Math.round(share * 100)} %</span>
                </span>
                <span className="font-semibold" style={{ color: "#f2f2f0" }}>
                  {fmt(min)}
                </span>
              </div>
              <div className="relative mt-1.5 h-1 w-full rounded-full" style={{ background: "#1d1d20" }} aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.min(100, share * 100)}%`, background: "#a3a3a8" }} />
                {usual != null && <div className="absolute -top-1 h-3 w-[2px] rounded-full" style={{ left: `calc(${Math.min(100, usual * 100)}% - 1px)`, background: "#f2f2f0" }} />}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
