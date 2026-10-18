"use client";

import { useMemo } from "react";
import { Caption } from "@/components/physique/ui";
import { goalProgress } from "@/lib/physique/goalProgress";
import { goalEta } from "@/lib/physique/goalEta";
import GoalEtaLine from "@/components/physique/GoalEtaLine";
import PhaseStrip from "@/components/physique/PhaseStrip";
import { phasePlan } from "@/lib/physique/phasePlan";
import type { DayFlags, PhysiqueGoal, WeighIn } from "@/lib/physique/types";
import { formatWeight, type WeightUnit } from "@/lib/units";
import type { LocalDate } from "@/lib/dates";

/** MacroFactor's goal waterfall: one bar per week, light toward the goal, dark away, grey remaining. */
export default function GoalProgress({ goal, weighIns, dayFlags = {}, today, unit }: { goal: PhysiqueGoal | null; weighIns: readonly WeighIn[]; dayFlags?: Readonly<Record<string, DayFlags>>; today: LocalDate; unit: WeightUnit }) {
  const p = useMemo(() => goalProgress(goal, weighIns, today), [goal, weighIns, today]);
  const eta = useMemo(() => goalEta(goal, weighIns, dayFlags, today), [goal, weighIns, dayFlags, today]);
  const plan = useMemo(() => phasePlan(goal, p, eta, today), [goal, p, eta, today]);
  if (!p) return null;
  const maxKg = Math.max(p.totalKg, ...p.weeks.map((w) => Math.abs(w.deltaKg)), 0.1);
  const h = 56;
  const barH = (kg: number) => Math.max(2, (Math.abs(kg) / maxKg) * h);
  const bars = [...p.weeks.map((w) => ({ key: `w${w.week}`, kg: w.deltaKg, color: w.toward ? "var(--text)" : "var(--text-tertiary)", label: `${w.week}`, dim: !w.complete })), { key: "rest", kg: p.remainingKg, color: "var(--border)", label: "left", dim: false }];
  return (
    <section className="rounded-[12px] p-4" style={{ background: "var(--surface)" }} aria-label="Goal progress">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          Goal progress
        </span>
        <Caption>{p.weeks.length} {p.weeks.length === 1 ? "week" : "weeks"}</Caption>
      </div>
      <div className="mt-3 flex items-end gap-1 overflow-hidden" style={{ height: h + 18 }} aria-hidden>
        {bars.map((b) => (
          <div key={b.key} className="flex min-w-[10px] flex-1 flex-col items-center justify-end gap-1" style={{ maxWidth: 28 }}>
            <div className="w-full rounded-[3px]" style={{ height: barH(b.kg), background: b.color, opacity: b.dim ? 0.5 : 1 }} />
            <span className="text-[9px] font-medium" style={{ color: "var(--text-tertiary)" }}>
              {b.label}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[13px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        {formatWeight(p.doneKg, unit)} of {formatWeight(p.totalKg, unit)} · {formatWeight(p.remainingKg, unit)} to go
      </p>
      {eta && <GoalEtaLine eta={eta} />}
      {plan && <PhaseStrip plan={plan} today={today} unit={unit} />}
    </section>
  );
}
