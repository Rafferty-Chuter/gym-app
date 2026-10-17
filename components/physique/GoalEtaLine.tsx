"use client";

import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { formatRate } from "@/components/physique/WeightChartCard";
import { ETA_MAX_WEEKS, vsPlanWord, type GoalEta } from "@/lib/physique/goalEta";

/**
 * The moving ETA (05-design §9.5 addendum): the date in white, the plan
 * comparison beside it, and the rate and likely window under it. Goes
 * quiet with the rate engine: an early read says what it needs, a trend
 * moving away says so without a date.
 */
export default function GoalEtaLine({ eta }: { eta: GoalEta }) {
  let headline: string;
  let aside: string | null = null;
  let detail: string;
  if (eta.reached) {
    headline = "Target reached";
    detail = "On trend weight. Set the next goal when you are ready.";
  } else if (eta.reason === "away") {
    headline = "No ETA at this rate";
    detail = `The trend is moving away from the target (${formatRate(eta.ratePctPerWeek)}). The verdict above says what to change.`;
  } else if (eta.reason === "slow") {
    headline = "Over a year away";
    detail = `At ${formatRate(eta.ratePctPerWeek)} the target is more than ${ETA_MAX_WEEKS} weeks off.`;
  } else if (eta.basis === "planned") {
    headline = eta.date ? `ETA ${longLocalDate(eta.date)}` : "ETA pending";
    aside = "on the plan";
    detail =
      eta.weighInsNeeded > 0
        ? `Early read · ${eta.weighInsNeeded} more weigh-in${eta.weighInsNeeded === 1 ? "" : "s"} before it follows your actual rate.`
        : "Early read · follows your actual rate after two weeks of weigh-ins.";
  } else {
    headline = `ETA ${longLocalDate(eta.date as string)}`;
    aside = vsPlanWord(eta.daysVsPlan);
    const window = eta.earliest && eta.latest ? ` · likely ${shortLocalDate(eta.earliest)} to ${shortLocalDate(eta.latest)}` : eta.earliest ? ` · ${shortLocalDate(eta.earliest)} at the earliest` : "";
    detail = `At your current ${formatRate(eta.ratePctPerWeek)}${window}.`;
  }
  const asideColor = aside === "on plan" || aside?.includes("ahead") ? "#00e5b0" : aside?.includes("behind") ? "#f5b544" : "#6f6f76";
  return (
    <div className="mt-3 flex flex-col gap-0.5" style={{ borderTop: "1px solid #2a2a2e", paddingTop: 10 }} aria-label="Goal ETA">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[15px] font-semibold" style={{ color: eta.date || eta.reached ? "#f2f2f0" : "#a3a3a8" }}>
          {headline}
        </span>
        {aside && (
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: asideColor }}>
            {aside}
          </span>
        )}
      </div>
      <p className="text-[12px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
        {detail}
      </p>
    </div>
  );
}
