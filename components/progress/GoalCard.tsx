"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Chevron, StatusDot } from "@/components/physique/ui";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { addDays, type LocalDate } from "@/lib/dates";
import { goalEta, type GoalEta } from "@/lib/physique/goalEta";
import { goalProgress } from "@/lib/physique/goalProgress";
import { latestTrend } from "@/lib/physique/weight";
import { defaultReportWeek } from "@/lib/physique/weekReport";
import type { DayFlags, PhysiqueAnalysis, PhysiqueGoal, WeighIn } from "@/lib/physique/types";
import { STATUS_HEX } from "@/lib/ui/status";
import { formatBodyWeight, formatWeight, type WeightUnit } from "@/lib/units";

const divider = { borderTop: "1px solid var(--border)" };

/** A weekly change under this reads as holding. OURS: 0.05 kg rounds to 0.0 at one decimal. */
const HOLDING_KG = 0.05;

/** "Losing 0.2 kg a week", "Gaining 0.1 lb a week", "Holding steady": the rate in kilos (PR3, the founder: kilos read at a glance). */
function rateWords(kgPerWeek: number, unit: WeightUnit): string {
  if (Math.abs(kgPerWeek) < HOLDING_KG) return "Holding steady";
  return `${kgPerWeek < 0 ? "Losing" : "Gaining"} ${formatWeight(Math.abs(kgPerWeek), unit)} a week`;
}

/** The goal's date in two or three words, or why there is none. */
function etaWords(eta: GoalEta): string {
  if (eta.reached) return "Target reached";
  if (eta.reason === "away") return "Moving away from the target";
  if (eta.reason === "slow") return "Over a year away";
  if (eta.basis === "planned") return eta.weighInsNeeded > 0 ? `${eta.weighInsNeeded} more weigh-in${eta.weighInsNeeded === 1 ? "" : "s"} for a date` : "Date in two weeks";
  return `Around ${longLocalDate(eta.date as string)}`;
}

/**
 * The goal (PR3), the top of Progress: where the trend weight is against
 * the target, how much is left and when it lands, the rate in kilos a week
 * against the plan with the judge's word for it, and the way into the
 * weekly report. Facts first; the long reasoning lives in the report and,
 * later, the assistant.
 */
export default function GoalCard({ analysis, goal, weighIns, dayFlags, today, unit }: { analysis: PhysiqueAnalysis | null; goal: PhysiqueGoal | null; weighIns: readonly WeighIn[]; dayFlags: Readonly<Record<string, DayFlags>>; today: LocalDate; unit: WeightUnit }) {
  const active = goal && !goal.completedAt ? goal : null;
  const trend = useMemo(() => latestTrend(weighIns.filter((w) => w.date <= today)), [weighIns, today]);
  const progress = useMemo(() => goalProgress(active, weighIns, today), [active, weighIns, today]);
  const eta = useMemo(() => goalEta(active, weighIns, dayFlags, today), [active, weighIns, dayFlags, today]);
  const reportWeek = defaultReportWeek(today);

  const trendKg = trend?.trendKg ?? null;
  const ratePct = eta?.basis === "observed" ? eta.ratePctPerWeek : (analysis?.weight.ratePctPerWeek ?? null);
  const rateLine = trendKg != null && ratePct != null ? rateWords((ratePct * trendKg) / 100, unit) : null;
  const planLine = active && active.type !== "maintain" && trendKg != null ? `plan ${formatWeight((Math.abs(active.ratePctPerWeek) * trendKg) / 100, unit)}` : null;
  const verdict = analysis?.verdict ?? null;
  const safety = [verdict, ...(analysis?.flags ?? [])].filter((v) => v && v.id.startsWith("SAFE-"));
  const heading = active ? `${active.type === "lose" ? "Cut to" : active.type === "gain" ? "Lean gain to" : "Maintain"} ${formatWeight(active.targetKg, unit)}` : "No goal set";
  const share = progress && progress.totalKg > 0 ? Math.min(1, Math.max(0, progress.doneKg / progress.totalKg)) : null;

  return (
    <section aria-label="Goal" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-medium" style={{ color: "var(--text-tertiary)" }}>
            {heading}
          </span>
          <Link href="/body/goal" className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }} aria-label={active ? "Change goal" : "Set goal"}>
            {active ? "Change" : "Set goal"}
          </Link>
        </div>

        <div className="mt-1.5 flex items-end justify-between gap-3">
          <span className="flex flex-col">
            <span className="text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {trendKg != null ? formatBodyWeight(trendKg, unit) : "—"}
            </span>
            <span className="mt-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              {trendKg != null ? "Trend weight" : "No weigh-ins yet"}
            </span>
          </span>
          {progress && !eta?.reached && (
            <span className="flex flex-col items-end">
              <span className="text-[20px] font-semibold leading-none" style={{ color: "var(--chart-trend)", fontVariantNumeric: "tabular-nums" }}>
                {formatWeight(progress.remainingKg, unit)}
              </span>
              <span className="mt-1 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                to go
              </span>
            </span>
          )}
        </div>

        {progress && share != null && active && (
          <>
            <div className="mt-3.5 h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${share * 100}%`, background: "var(--chart-trend)" }} />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              <span>
                {formatWeight(active.startTrendKg, unit)} on {shortLocalDate(active.startDate)}
              </span>
              <span>
                {formatWeight(progress.doneKg, unit).replace(` ${unit}`, "")} of {formatWeight(progress.totalKg, unit)} {active.type === "lose" ? "lost" : "gained"}
              </span>
            </div>
          </>
        )}
      </div>

      {(eta || rateLine || verdict) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={divider}>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              {eta ? etaWords(eta) : (rateLine ?? "Weight trend")}
            </span>
            {(eta ? rateLine : planLine) && (
              <span className="text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {eta ? [rateLine, planLine].filter(Boolean).join(" · ") : planLine}
              </span>
            )}
          </span>
          {verdict && analysis && (
            <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
              <StatusDot color={STATUS_HEX[analysis.status.state]} />
              {verdict.title}
            </span>
          )}
        </div>
      )}

      {/* Safety notes stay in full: the one place the app says more than the facts. */}
      {safety.map((v) => (
        <p key={v!.id} className="px-4 py-3 text-[15px] leading-snug" style={{ ...divider, color: "var(--text-secondary)" }}>
          {v!.detail}
        </p>
      ))}

      <Link href={`/report?week=${reportWeek}`} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5 transition-colors active:bg-[var(--surface-raised)]" style={divider} aria-label={`Weekly report, ${shortLocalDate(reportWeek)} to ${shortLocalDate(addDays(reportWeek, 6))}. Open`}>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Weekly report
          </span>
          <span className="truncate text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {shortLocalDate(reportWeek)} to {shortLocalDate(addDays(reportWeek, 6))}
          </span>
        </span>
        <Chevron />
      </Link>
    </section>
  );
}
