"use client";

import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { StageSplit } from "@/lib/physique/recovery";

const SEGMENTS: Array<{ key: keyof Omit<StageSplit, "asleepMin">; label: string; color: string }> = [
  { key: "deepMin", label: "Deep", color: "#f2f2f0" },
  { key: "remMin", label: "REM", color: "#a3a3a8" },
  { key: "coreMin", label: "Core", color: "#6f6f76" },
  { key: "awakeMin", label: "Awake", color: "#2a2a2e" },
];

/**
 * Last night's stages from the watch (S6): one thin bar, deep to awake,
 * and the minutes under it. Shown, never scored: wearable stage accuracy
 * is moderate (research C §4.2), so no colour means good or bad here.
 */
export default function StageBar({ split }: { split: StageSplit }) {
  const total = split.asleepMin + split.awakeMin;
  if (total <= 0) return null;
  const parts = SEGMENTS.filter((s) => split[s.key] > 0);
  const fmt = (min: number) => (min < 60 ? `${min} min` : formatHoursMin(min));
  const legend = parts.map((s) => `${s.label} ${fmt(split[s.key])}`).join(" · ");
  return (
    <div role="img" aria-label={`Sleep stages. ${legend}`}>
      <div className="flex h-1.5 w-full gap-px overflow-hidden rounded-full" style={{ background: "#1d1d20" }} aria-hidden>
        {parts.map((s) => (
          <div key={s.key} className="h-full" style={{ width: `${(split[s.key] / total) * 100}%`, background: s.color }} />
        ))}
      </div>
      <p className="mt-1.5 text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
        {legend}
      </p>
    </div>
  );
}
