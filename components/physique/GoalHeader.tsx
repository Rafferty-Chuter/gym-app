"use client";

import Link from "next/link";
import { Chevron } from "@/components/physique/ui";
import { formatWeight, type WeightUnit } from "@/lib/units";
import type { PhysiqueAnalysis } from "@/lib/physique/types";
import { formatRate } from "@/components/physique/WeightChartCard";

/** Goal summary with a progress bar on trend weight (05-design §3), or the set-goal prompt. */
export default function GoalHeader({ analysis, unit }: { analysis: PhysiqueAnalysis; unit: WeightUnit }) {
  const g = analysis.goal;
  if (!g) return null;
  const trend = analysis.weight.trendKg;
  const span = g.targetKg - g.startTrendKg;
  const progress = trend == null || span === 0 ? 0 : Math.max(0, Math.min(1, (trend - g.startTrendKg) / span));
  const label = g.type === "lose" ? "Cut" : g.type === "gain" ? "Lean gain" : "Maintain";
  const line = `${formatWeight(g.targetKg, unit)} · ${label}${g.type === "maintain" ? "" : ` · ${formatRate(g.ratePctPerWeek)}`}`;
  return (
    <Link href="/body/goal" className="flex flex-col gap-2" aria-label={`Goal ${line}. Edit goal`}>
      <div className="flex items-center justify-between text-[13px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        <span className="flex items-center gap-2">
          <span aria-hidden>→</span>
          <span>{line}</span>
        </span>
        <Chevron />
      </div>
      {g.type !== "maintain" && (
        <div className="flex items-center gap-3">
          <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
            <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: "var(--primary)" }} />
          </div>
          <span className="text-[11px] font-medium" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {trend != null ? `${formatWeight(trend, unit)} → ${formatWeight(g.targetKg, unit)}` : `from ${formatWeight(g.startTrendKg, unit)}`}
          </span>
        </div>
      )}
    </Link>
  );
}
