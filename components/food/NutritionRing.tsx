"use client";

import { CARBS_COLOR, FAT_COLOR, KCAL_COLOR, PROTEIN_COLOR } from "@/components/food/EnergyCharts";
import type { ProgramTargets } from "@/lib/physique/types";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

export type NutritionView = "remaining" | "consumed";

/** Ring geometry. OURS. */
export const RING_SIZE = 132;
export const RING_STROKE = 9;

type RingProps = {
  eatenKcal: number;
  targetKcal: number | null;
  view: NutritionView;
  /** Tapping the ring flips between what is left and what was eaten. */
  onToggleView?: () => void;
  size?: number;
};

/**
 * The day's energy as one ring (R7, after MacroFactor's dashboard): the
 * big number is what is left or what was eaten, the small numbers either
 * side are the other one and the target. Without a target the ring is
 * empty and the number is plain kcal eaten.
 */
export function NutritionRing({ eatenKcal, targetKcal, view, onToggleView, size = RING_SIZE }: RingProps) {
  const remaining = view === "remaining";
  const left = targetKcal != null ? targetKcal - eatenKcal : null;
  const over = left != null && left < 0 ? -left : 0;
  const hero = targetKcal == null ? eatenKcal : remaining ? (over > 0 ? over : Math.max(0, left ?? 0)) : eatenKcal;
  const word = targetKcal == null ? "kcal" : remaining ? (over > 0 ? "over" : "left") : "eaten";
  const pct = targetKcal && targetKcal > 0 ? Math.min(1, eatenKcal / targetKcal) : 0;
  const r = (size - RING_STROKE) / 2;
  const c = 2 * Math.PI * r;
  const label = targetKcal == null ? `${n(eatenKcal)} kcal eaten` : `${n(eatenKcal)} of ${n(targetKcal)} kcal, ${n(Math.abs(left ?? 0))} ${over > 0 ? "over" : "left"}`;
  const ring = (
    <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-raised)" strokeWidth={RING_STROKE} />
        {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={KCAL_COLOR} strokeWidth={RING_STROKE} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} style={{ transition: "stroke-dasharray 300ms" }} />}
      </svg>
      <span className="relative flex flex-col items-center">
        <span className="text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {n(hero)}
        </span>
        <span className="mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {word}
        </span>
      </span>
    </span>
  );
  const side = (caption: string, value: string, align: "start" | "end") => (
    <span className={`flex min-w-[56px] flex-col ${align === "end" ? "items-end" : "items-start"}`}>
      <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
        {caption}
      </span>
      <span className="text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </span>
  );
  return (
    // Without a target the ring already says what was eaten, so the sides (two dashes) are left out.
    <div className={`flex items-center gap-2 ${targetKcal == null ? "justify-center" : "justify-between"}`}>
      {targetKcal != null && side(remaining ? "Eaten" : "Left", remaining ? n(eatenKcal) : n(Math.max(0, left ?? 0)), "start")}
      {onToggleView ? (
        <button type="button" onClick={onToggleView} className="rounded-full" aria-label={`${label}. Tap to show ${remaining ? "eaten" : "what is left"}`}>
          {ring}
        </button>
      ) : (
        <span role="img" aria-label={label}>
          {ring}
        </span>
      )}
      {targetKcal != null && side("Target", n(targetKcal), "end")}
    </div>
  );
}

type BarsProps = { totals: { proteinG: number; fatG: number; carbsG: number }; target: ProgramTargets | null };

/**
 * Protein · Fat · Carbs as thin bars in the macro colours, each as eaten
 * of its target ("120 / 165 g") whichever way the ring reads: a remainder
 * written over a target reads as an amount eaten.
 */
export function MacroBars({ totals, target }: BarsProps) {
  const macros = [
    { key: "p", label: "Protein", value: totals.proteinG, target: target?.proteinG ?? null, color: PROTEIN_COLOR },
    { key: "f", label: "Fat", value: totals.fatG, target: target?.fatG ?? null, color: FAT_COLOR },
    { key: "c", label: "Carbs", value: totals.carbsG, target: target?.carbsG ?? null, color: CARBS_COLOR },
  ];
  return (
    <div className="grid grid-cols-3 gap-3" role="group" aria-label="Macros">
      {macros.map((m) => {
        const pct = m.target && m.target > 0 ? Math.min(1, m.value / m.target) : 0;
        return (
          <div key={m.key} className="flex flex-col gap-1.5" aria-label={`${m.label} ${Math.round(m.value)}${m.target != null ? ` of ${m.target}` : ""} g`}>
            <span className="text-[11px] font-medium" style={{ color: m.color }}>
              {m.label}
            </span>
            <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: m.color, transition: "width 150ms" }} />
            </div>
            <span className="text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {Math.round(m.value)}
              {m.target != null ? ` / ${m.target}` : ""} g
            </span>
          </div>
        );
      })}
    </div>
  );
}
