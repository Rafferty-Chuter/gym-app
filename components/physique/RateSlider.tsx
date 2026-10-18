"use client";

import { useMemo } from "react";
import { validateRate } from "@/lib/physique/targets";
import type { GoalType, TrainingStatus } from "@/lib/physique/types";
import { STATUS_HEX } from "@/lib/ui/status";

/** Slider resolution in %BW/wk. OURS. */
export const RATE_STEP = 0.05;

type Props = {
  type: Exclude<GoalType, "maintain">;
  /** Unsigned %BW/wk; the sign comes from `type`. */
  magnitude: number;
  onChange: (magnitude: number) => void;
  status: TrainingStatus;
  trendKg: number;
  tdee0: number;
  nearGoal?: boolean;
  minMag: number;
  maxMag: number;
};

type Segment = { from: number; to: number; color: string; band: "green" | "confirm" | "refused" };

/**
 * The rate slider (05-design §4): a native range input over flat colour
 * bands sampled from `validateRate`, so the bands always agree with the
 * engine. Mint = green band, amber = needs a confirmation, rose = refused.
 * Left is slower, right is faster, for cuts and gains alike.
 */
export default function RateSlider({ type, magnitude, onChange, status, trendKg, tdee0, nearGoal, minMag, maxMag }: Props) {
  const sign = type === "lose" ? -1 : 1;
  const segments = useMemo(() => {
    const out: Segment[] = [];
    const steps = Math.round((maxMag - minMag) / RATE_STEP);
    for (let i = 0; i < steps; i++) {
      const from = minMag + i * RATE_STEP;
      const mid = from + RATE_STEP / 2;
      const v = validateRate({ type, ratePctPerWeek: sign * mid, status, trendKg, tdee0, nearGoal });
      const band: Segment["band"] = !v.ok ? "refused" : v.band;
      const color = band === "refused" ? STATUS_HEX.attention : band === "green" ? STATUS_HEX.good : STATUS_HEX.watch;
      const last = out[out.length - 1];
      if (last && last.band === band) last.to = from + RATE_STEP;
      else out.push({ from, to: from + RATE_STEP, color, band });
    }
    return out;
  }, [type, sign, status, trendKg, tdee0, nearGoal, minMag, maxMag]);

  const span = maxMag - minMag;
  const pct = (x: number) => ((x - minMag) / span) * 100;

  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-11">
        <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
          {segments.map((s) => (
            <div key={s.from} className="absolute top-0 h-full" style={{ left: `${pct(s.from)}%`, width: `${pct(s.to) - pct(s.from)}%`, background: s.color, opacity: s.band === "green" ? 0.7 : 0.45 }} />
          ))}
        </div>
        <input
          type="range"
          min={minMag}
          max={maxMag}
          step={RATE_STEP}
          value={magnitude}
          onChange={(e) => onChange(Number(e.target.value))}
          className="rate-slider absolute inset-0 h-full w-full"
          aria-label="Weekly rate as a percentage of bodyweight"
          aria-valuetext={`${magnitude.toFixed(2)} percent per week`}
        />
      </div>
      <div className="flex justify-between text-[11px] font-medium tracking-[0.04em]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
        <span>Slower</span>
        <span>
          {segments.filter((s) => s.band === "green").map((s) => `${s.from.toFixed(2)}–${s.to.toFixed(2)}`).join(", ") || "–"} %/wk in the green band
        </span>
        <span>Faster</span>
      </div>
    </div>
  );
}
