"use client";

import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { formatRate } from "@/components/physique/WeightChartCard";
import { ETA_MAX_WEEKS, type GoalEta } from "@/lib/physique/goalEta";

/**
 * The goal's date (Z3: facts only): the date the trend reaches the target
 * at the current rate, or why there is none. No plan comparison and no
 * range: one date that follows the trend as it moves.
 */
export default function GoalEtaLine({ eta }: { eta: GoalEta }) {
  let headline: string;
  let detail: string;
  if (eta.reached) {
    headline = "Target reached";
    detail = "On trend weight.";
  } else if (eta.reason === "away") {
    headline = "No date at this rate";
    detail = `The trend is moving away from the target (${formatRate(eta.ratePctPerWeek)}).`;
  } else if (eta.reason === "slow") {
    headline = "Over a year away";
    detail = `At ${formatRate(eta.ratePctPerWeek)} the target is more than ${ETA_MAX_WEEKS} weeks off.`;
  } else if (eta.basis === "planned") {
    headline = "Date pending";
    detail = eta.weighInsNeeded > 0 ? `${eta.weighInsNeeded} more weigh-in${eta.weighInsNeeded === 1 ? "" : "s"} for a date from your own rate.` : "A date follows after two weeks of weigh-ins.";
  } else {
    headline = `Around ${longLocalDate(eta.date as string)}`;
    detail = `At the current ${formatRate(eta.ratePctPerWeek)}.`;
  }
  return (
    <div className="mt-3 flex flex-col gap-0.5" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }} aria-label="Goal date">
      <span className="text-[15px] font-semibold" style={{ color: eta.date || eta.reached ? "var(--text)" : "var(--text-secondary)" }}>
        {headline}
      </span>
      <p className="text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        {detail}
      </p>
    </div>
  );
}
