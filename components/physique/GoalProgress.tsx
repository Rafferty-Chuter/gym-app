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
  // One bar of done against the whole goal (B2). The weekly bars it replaced repeated the weight chart above.
  const share = p.totalKg > 0 ? Math.min(1, Math.max(0, p.doneKg / p.totalKg)) : 0;
  return (
    <section className="rounded-[12px] p-4" style={{ background: "var(--surface)" }} aria-label="Goal progress">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          Goal progress
        </span>
        <Caption>{p.weeks.length} {p.weeks.length === 1 ? "week" : "weeks"}</Caption>
      </div>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: "var(--green)" }} />
      </div>
      <p className="mt-2 text-[13px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        {formatWeight(p.doneKg, unit)} of {formatWeight(p.totalKg, unit)} · {formatWeight(p.remainingKg, unit)} to go
      </p>
      {eta && <GoalEtaLine eta={eta} />}
      {plan && <PhaseStrip plan={plan} today={today} unit={unit} />}
    </section>
  );
}
