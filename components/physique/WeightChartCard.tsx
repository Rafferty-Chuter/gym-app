"use client";

import { useMemo, useState } from "react";
import TimeSeriesChart, { longLocalDate, type TimeSeriesPoint } from "@/components/charts/TimeSeriesChart";
import { Caption } from "@/components/physique/ui";
import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { formatBodyWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import type { PhysiqueGoal, WeighIn, DayFlags } from "@/lib/physique/types";
import { displayRate, latestTrend, MIN_DAYS_FOR_RATE, segmentStart, trendSeries, weighInsByDate, weighInsNeededForRate } from "@/lib/physique/weight";

/** Range pills (MacroFactor's Weight Trend page). OURS. */
export const RANGES = [
  { id: "1W", days: 7 },
  { id: "1M", days: 30 },
  { id: "3M", days: 91 },
  { id: "6M", days: 182 },
  { id: "All", days: null },
] as const;
export type RangeId = (typeof RANGES)[number]["id"];

/** Days shown by default (one month). OURS. */
export const CHART_WINDOW_DAYS = 30;

type Props = {
  weighIns: readonly WeighIn[];
  goal: PhysiqueGoal | null;
  dayFlags: Readonly<Record<string, DayFlags>>;
  today: LocalDate;
  unit: WeightUnit;
  /**
   * Hero numbers above the chart (Body page): the latest weigh-in, named by
   * its day, then the trend weight labelled as such (C2). The trend is what
   * the engine reads, but the big number is what the scale said, as on Home.
   */
  hero?: boolean;
};

export function formatRate(pctPerWeek: number): string {
  const sign = pctPerWeek > 0 ? "+" : pctPerWeek < 0 ? "−" : "";
  return `${sign}${Math.abs(pctPerWeek).toFixed(2)} %/wk`;
}

/** "Today's weigh-in", "Yesterday's weigh-in", or "Weigh-in on Fri 16 Oct". */
function weighInDay(date: LocalDate, today: LocalDate): string {
  const back = dayDiff(date, today);
  return back === 0 ? "Today's weigh-in" : back === 1 ? "Yesterday's weigh-in" : `Weigh-in on ${longLocalDate(date)}`;
}

export default function WeightChartCard({ weighIns, goal, dayFlags, today, unit, hero = false }: Props) {
  const [range, setRange] = useState<RangeId>("1M");

  const model = useMemo(() => {
    const trend = trendSeries(weighIns);
    const raw = weighInsByDate(weighIns);
    const days = RANGES.find((r) => r.id === range)?.days ?? null;
    const first = trend[0]?.date ?? today;
    const from = days ? addDays(today, -(days - 1)) : first;
    const points: TimeSeriesPoint[] = trend
      .filter((t) => t.date >= from)
      .map((t) => ({ date: t.date, raw: raw.has(t.date) ? kgToDisplay(raw.get(t.date) as number, unit) : null, trend: kgToDisplay(t.trendKg, unit) }));
    const latest = latestTrend(weighIns);
    const seg = segmentStart({ goal, dayFlags, today });
    const rate = displayRate(weighIns, today, seg, dayFlags);
    const needed = weighInsNeededForRate(weighIns, today);
    const maskDaysLeft = seg ? Math.max(0, dayDiff(today, addDays(seg, MIN_DAYS_FOR_RATE - 1))) : 0;
    const inWindow = [...raw.keys()].filter((d) => d >= from && d <= today).length;
    const lastDate = [...raw.keys()].filter((d) => d <= today).sort().at(-1) ?? null;
    const lastWeighIn = lastDate ? { date: lastDate, kg: raw.get(lastDate) as number } : null;
    const projection =
      goal && goal.type !== "maintain" && goal.startDate <= today
        ? (() => {
            const to = addDays(today, 14);
            const weeks = dayDiff(goal.startDate, to) / 7;
            const startInView = goal.startDate < from ? from : goal.startDate;
            return {
              from: startInView,
              fromValue: kgToDisplay(goal.startTrendKg * (1 + (goal.ratePctPerWeek / 100) * (Math.max(0, dayDiff(goal.startDate, startInView)) / 7)), unit),
              to,
              toValue: kgToDisplay(goal.startTrendKg * (1 + (goal.ratePctPerWeek / 100) * weeks), unit),
            };
          })()
        : null;
    return { points, latest, lastWeighIn, rate, needed, inWindow, projection, maskDaysLeft, spanDays: Math.max(1, dayDiff(from, today) + 1) };
  }, [weighIns, goal, dayFlags, today, unit, range]);

  const rateLine = model.latest
    ? model.rate
      ? `${formatRate(model.rate.result.ratePctPerWeek)} over ${model.rate.windowDays} days`
      : model.needed > 0
        ? `Early read · ${model.needed} more weigh-in${model.needed === 1 ? "" : "s"} for a rate`
        : `Early read · first rate read in ${model.maskDaysLeft} day${model.maskDaysLeft === 1 ? "" : "s"}`
    : "Log a weigh-in to start the trend";

  return (
    <section className="rounded-[12px] p-4" style={{ background: "var(--surface)" }} aria-label="Weight trend">
      {hero ? (
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ color: model.lastWeighIn ? "var(--text)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {model.lastWeighIn ? formatBodyWeight(model.lastWeighIn.kg, unit) : "–"}
            </span>
            {model.lastWeighIn && (
              <span className="mt-1 text-[12px] font-medium" style={{ color: "var(--text)" }}>
                {weighInDay(model.lastWeighIn.date, today)}
              </span>
            )}
            <span className="mt-0.5 text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {model.latest ? `Trend ${formatBodyWeight(model.latest.trendKg, unit)} · ${rateLine}` : rateLine}
            </span>
          </div>
          <Caption>{model.inWindow} weigh-ins</Caption>
        </div>
      ) : (
        <div className="flex items-baseline justify-between">
          <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
            Weight
          </span>
          <Caption>{model.inWindow > 0 ? `${Math.min(model.spanDays, model.points.length)} days · ${model.inWindow} weigh-ins` : "no weigh-ins"}</Caption>
        </div>
      )}
      <div className="mt-3">
        <TimeSeriesChart points={model.points} unit={unit} projection={model.projection} ariaLabel={`Weight, ${range}`} emptyText="No weigh-ins yet." height={170} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="flex gap-1" role="tablist" aria-label="Range">
          {RANGES.map((r) => {
            const selected = r.id === range;
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setRange(r.id)}
                className="h-[26px] rounded-full px-2.5 text-[11px] font-medium transition-colors"
                style={{ background: selected ? "var(--primary)" : "var(--surface-raised)", color: selected ? "var(--text-on-primary)" : "var(--text-secondary)" }}
              >
                {r.id}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-tertiary)" }} aria-hidden>
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 rounded" style={{ background: "var(--primary)" }} />Trend</span>
          <span className="flex items-center gap-1"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--chart-raw)" }} />Scale</span>
          {model.projection && <span className="flex items-center gap-1"><span className="inline-block w-3 border-t border-dashed" style={{ borderColor: "var(--text-tertiary)" }} />Goal</span>}
        </div>
      </div>
      {!hero && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {model.latest ? `Trend ${formatBodyWeight(model.latest.trendKg, unit)} · ${rateLine}` : rateLine}
        </p>
      )}
    </section>
  );
}
