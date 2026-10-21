"use client";

import { useMemo } from "react";
import { Caption } from "@/components/physique/ui";
import { goalProgress } from "@/lib/physique/goalProgress";
import { goalEta } from "@/lib/physique/goalEta";
import GoalEtaLine from "@/components/physique/GoalEtaLine";
import type { DayFlags, PhysiqueGoal, WeighIn } from "@/lib/physique/types";
import { formatWeight, type WeightUnit } from "@/lib/units";
import type { LocalDate } from "@/lib/dates";

/** MacroFactor's goal waterfall: one bar per week, light toward the goal, dark away, grey remaining. */
export default function GoalProgress({ goal, weighIns, dayFlags = {}, today, unit, bare = false }: { goal: PhysiqueGoal | null; weighIns: readonly WeighIn[]; dayFlags?: Readonly<Record<string, DayFlags>>; today: LocalDate; unit: WeightUnit; /** Inside a panel that draws the surface (Body's progress group). */ bare?: boolean }) {
  const p = useMemo(() => goalProgress(goal, weighIns, today), [goal, weighIns, today]);
  const eta = useMemo(() => goalEta(goal, weighIns, dayFlags, today), [goal, weighIns, dayFlags, today]);
  if (!p) return null;
  // One bar of done against the whole goal (B2). The weekly bars it replaced repeated the weight chart above.
  const share = p.totalKg > 0 ? Math.min(1, Math.max(0, p.doneKg / p.totalKg)) : 0;
  return (
    <section className={bare ? "p-4" : "rounded-[16px] p-4"} style={bare ? undefined : { background: "var(--surface)" }} aria-label="Goal progress">
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
    </section>
  );
}
