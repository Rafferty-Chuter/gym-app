"use client";

import { useMemo } from "react";
import { Caption } from "@/components/physique/ui";
import { goalProgress } from "@/lib/physique/goalProgress";
import type { PhysiqueGoal, WeighIn } from "@/lib/physique/types";
import { formatWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import type { LocalDate } from "@/lib/dates";

/** MacroFactor's goal waterfall: one bar per week, light toward the goal, dark away, grey remaining. */
export default function GoalProgress({ goal, weighIns, today, unit }: { goal: PhysiqueGoal | null; weighIns: readonly WeighIn[]; today: LocalDate; unit: WeightUnit }) {
  const p = useMemo(() => goalProgress(goal, weighIns, today), [goal, weighIns, today]);
  if (!p) return null;
  const maxKg = Math.max(p.totalKg, ...p.weeks.map((w) => Math.abs(w.deltaKg)), 0.1);
  const h = 56;
  const barH = (kg: number) => Math.max(2, (Math.abs(kg) / maxKg) * h);
  const bars = [...p.weeks.map((w) => ({ key: `w${w.week}`, kg: w.deltaKg, color: w.toward ? "#f2f2f0" : "#6f6f76", label: `${w.week}`, dim: !w.complete })), { key: "rest", kg: p.remainingKg, color: "#2a2a2e", label: "left", dim: false }];
  return (
    <section className="rounded-[12px] p-4" style={{ background: "#141416" }} aria-label="Goal progress">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0" }}>
          Goal progress
        </span>
        <Caption>{p.weeks.length} {p.weeks.length === 1 ? "week" : "weeks"}</Caption>
      </div>
      <div className="mt-3 flex items-end gap-1 overflow-hidden" style={{ height: h + 18 }} aria-hidden>
        {bars.map((b) => (
          <div key={b.key} className="flex min-w-[10px] flex-1 flex-col items-center justify-end gap-1" style={{ maxWidth: 28 }}>
            <div className="w-full rounded-[3px]" style={{ height: barH(b.kg), background: b.color, opacity: b.dim ? 0.5 : 1 }} />
            <span className="text-[9px] font-medium" style={{ color: "#6f6f76" }}>
              {b.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[13px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
        {formatWeight(p.doneKg, unit)} of {formatWeight(p.totalKg, unit)}
        {p.weeksLeft != null && Number.isFinite(p.weeksLeft) ? ` · about ${Math.max(1, Math.round(p.weeksLeft))} weeks left` : ""}
        {kgToDisplay(0, unit) === 0 ? "" : ""}
      </p>
    </section>
  );
}
