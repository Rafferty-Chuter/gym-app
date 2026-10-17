"use client";

import { useMemo } from "react";
import TimeSeriesChart, { type TimeSeriesPoint } from "@/components/charts/TimeSeriesChart";
import { Caption } from "@/components/physique/ui";
import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { formatWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import type { PhysiqueGoal, WeighIn, DayFlags } from "@/lib/physique/types";
import { displayRate, latestTrend, MIN_DAYS_FOR_RATE, segmentStart, trendSeries, weighInsByDate, weighInsNeededForRate } from "@/lib/physique/weight";

/** Days shown on the Body page chart (8 weeks). OURS. */
export const CHART_WINDOW_DAYS = 56;

type Props = {
  weighIns: readonly WeighIn[];
  goal: PhysiqueGoal | null;
  dayFlags: Readonly<Record<string, DayFlags>>;
  today: LocalDate;
  unit: WeightUnit;
};

export function formatRate(pctPerWeek: number): string {
  const sign = pctPerWeek > 0 ? "+" : pctPerWeek < 0 ? "−" : "";
  return `${sign}${Math.abs(pctPerWeek).toFixed(2)} %/wk`;
}

export default function WeightChartCard({ weighIns, goal, dayFlags, today, unit }: Props) {
  const model = useMemo(() => {
    const trend = trendSeries(weighIns);
    const raw = weighInsByDate(weighIns);
    const from = addDays(today, -(CHART_WINDOW_DAYS - 1));
    const points: TimeSeriesPoint[] = trend
      .filter((t) => t.date >= from)
      .map((t) => ({ date: t.date, raw: raw.has(t.date) ? kgToDisplay(raw.get(t.date) as number, unit) : null, trend: kgToDisplay(t.trendKg, unit) }));
    const latest = latestTrend(weighIns);
    const seg = segmentStart({ goal, dayFlags, today });
    const rate = displayRate(weighIns, today, seg, dayFlags);
    const needed = weighInsNeededForRate(weighIns, today);
    // With a fresh phase the mask, not the count, is what blocks the first read.
    const maskDaysLeft = seg ? Math.max(0, dayDiff(today, addDays(seg, MIN_DAYS_FOR_RATE - 1))) : 0;
    const inWindow = [...raw.keys()].filter((d) => d >= from && d <= today).length;
    const projection =
      goal && goal.type !== "maintain" && goal.startDate <= today
        ? (() => {
            const to = addDays(today, 14);
            const weeks = dayDiff(goal.startDate, to) / 7;
            return {
              from: goal.startDate < from ? from : goal.startDate,
              fromValue: kgToDisplay(goal.startTrendKg * (1 + (goal.ratePctPerWeek / 100) * (Math.max(0, dayDiff(goal.startDate, from)) / 7)), unit),
              to,
              toValue: kgToDisplay(goal.startTrendKg * (1 + (goal.ratePctPerWeek / 100) * weeks), unit),
            };
          })()
        : null;
    return { points, latest, rate, needed, inWindow, projection, maskDaysLeft };
  }, [weighIns, goal, dayFlags, today, unit]);

  const caption = model.latest
    ? model.rate
      ? `Trend ${formatWeight(model.latest.trendKg, unit)} · ${formatRate(model.rate.result.ratePctPerWeek)} (${model.rate.windowDays} d)`
      : model.needed > 0
        ? `Trend ${formatWeight(model.latest.trendKg, unit)} · Early read · ${model.needed} more weigh-in${model.needed === 1 ? "" : "s"} for a rate`
        : `Trend ${formatWeight(model.latest.trendKg, unit)} · Early read · first rate read in ${model.maskDaysLeft} day${model.maskDaysLeft === 1 ? "" : "s"}`
    : "Log a weigh-in to start the trend.";

  return (
    <section className="rounded-[12px] p-4" style={{ background: "#141416" }} aria-label="Weight trend">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0" }}>
          Weight
        </span>
        <Caption>
          {model.inWindow > 0 ? `${Math.min(CHART_WINDOW_DAYS, model.points.length)} days · ${model.inWindow} weigh-ins` : "8 weeks"}
        </Caption>
      </div>
      <div className="mt-3">
        <TimeSeriesChart points={model.points} unit={unit} projection={model.projection} ariaLabel="Weight over the last 8 weeks" emptyText="No weigh-ins yet." height={170} />
      </div>
      <p className="mt-2 text-[12px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
        {caption}
      </p>
    </section>
  );
}
