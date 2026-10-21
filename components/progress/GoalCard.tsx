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

/** Weeks out past which a date reads as a month: a day a year away is false precision. OURS: half a year. */
const MONTH_ONLY_WEEKS = 26;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Around Sat 7 Nov", "Around Fri 8 Jan 2027" across a new year, "Around Sep 2027" more than MONTH_ONLY_WEEKS out. */
function aroundDate(date: LocalDate, weeksLeft: number | null, today: LocalDate): string {
  if (weeksLeft != null && weeksLeft > MONTH_ONLY_WEEKS) return `Around ${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
  return `Around ${longLocalDate(date)}${date.slice(0, 4) !== today.slice(0, 4) ? ` ${date.slice(0, 4)}` : ""}`;
}

/** The goal's date in a few words, or why there is none. */
function etaWords(eta: GoalEta, today: LocalDate): string {
  if (eta.reached) return "Target reached";
  if (eta.reason === "away") return "No date at this rate";
  if (eta.reason === "slow") return "Over a year away";
  if (eta.basis === "planned") return eta.weighInsNeeded > 0 ? `${eta.weighInsNeeded} more weigh-in${eta.weighInsNeeded === 1 ? "" : "s"} for a date` : "A date after two weeks of weigh-ins";
  return aroundDate(eta.date as LocalDate, eta.weeksLeft, today);
}

/** Verdicts that turn the goal down (a target or a deficit the app won't coach): no date or distance to it is shown. */
const NOT_COACHED = new Set(["SAFE-0", "SAFE-3", "SAFE-4", "SAFE-5"]);

/**
 * The goal (PR3), the top of Progress: where the trend weight is against
 * the target, how much is left and when it lands, the rate in kilos a week
 * against the plan with the judge's word for it, and the way into the
 * weekly report. Facts first; the long reasoning lives in the report and,
 * later, the assistant.
 */
export default function GoalCard({ analysis, goal, weighIns, dayFlags, today, unit, example = false }: { analysis: PhysiqueAnalysis | null; goal: PhysiqueGoal | null; weighIns: readonly WeighIn[]; dayFlags: Readonly<Record<string, DayFlags>>; today: LocalDate; unit: WeightUnit; /** Drawn from the made-up example (PR5): no links into the person's own goal or report. */ example?: boolean }) {
  const active = goal && !goal.completedAt ? goal : null;
  const trend = useMemo(() => latestTrend(weighIns.filter((w) => w.date <= today)), [weighIns, today]);
  const progress = useMemo(() => goalProgress(active, weighIns, today), [active, weighIns, today]);
  const eta = useMemo(() => goalEta(active, weighIns, dayFlags, today), [active, weighIns, dayFlags, today]);
  const reportWeek = defaultReportWeek(today);

  const verdict = analysis?.verdict ?? null;
  const coached = !(verdict && NOT_COACHED.has(verdict.id));
  const trendKg = trend?.trendKg ?? null;
  const ratePct = eta?.basis === "observed" ? eta.ratePctPerWeek : (analysis?.weight.ratePctPerWeek ?? null);
  const rateLine = trendKg != null && ratePct != null ? rateWords((ratePct * trendKg) / 100, unit) : null;
  const planLine = coached && active && active.type !== "maintain" && trendKg != null ? `plan ${formatWeight((Math.abs(active.ratePctPerWeek) * trendKg) / 100, unit)}` : null;
  const safety = [verdict, ...(analysis?.flags ?? [])].filter((v) => v && v.id.startsWith("SAFE-"));
  const heading = active ? `${active.type === "lose" ? "Cut to" : active.type === "gain" ? "Lean gain to" : "Maintain"} ${formatWeight(active.targetKg, unit)}` : "No goal set";
  // The judge's word, unless it only says there is nothing to judge yet ("Calibrating", "No goal set"): the line beside it already says why.
  const word = verdict && analysis && analysis.status.state !== "unknown" ? verdict.title : null;
  const dateLine = coached && eta ? etaWords(eta, today) : null;
  const share = coached && progress && progress.totalKg > 0 ? Math.min(1, Math.max(0, progress.doneKg / progress.totalKg)) : null;

  return (
    <section aria-label="Goal" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="px-4 pb-3.5 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-medium" style={{ color: "var(--text-tertiary)" }}>
            {heading}
          </span>
          {!example && <Link href="/body/goal" className="text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }} aria-label={active ? "Change goal" : "Set goal"}>
            {active ? "Change" : "Set goal"}
          </Link>}
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
          {coached && progress && !eta?.reached && (
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

      {(dateLine || rateLine || word) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={divider}>
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              {dateLine ?? rateLine ?? verdict?.title}
            </span>
            {(dateLine ? rateLine || planLine : rateLine && planLine) && (
              <span className="text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {dateLine ? [rateLine, planLine].filter(Boolean).join(" · ") : planLine}
              </span>
            )}
          </span>
          {word && analysis && (dateLine || rateLine) && (
            <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
              <StatusDot color={STATUS_HEX[analysis.status.state]} />
              {word}
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

      {!example && <Link href={`/report?week=${reportWeek}`} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5 transition-colors active:bg-[var(--surface-raised)]" style={divider} aria-label={`Weekly report, ${shortLocalDate(reportWeek)} to ${shortLocalDate(addDays(reportWeek, 6))}. Open`}>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Weekly report
          </span>
          <span className="truncate text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {shortLocalDate(reportWeek)} to {shortLocalDate(addDays(reportWeek, 6))}
          </span>
        </span>
        <Chevron />
      </Link>}
    </section>
  );
}
