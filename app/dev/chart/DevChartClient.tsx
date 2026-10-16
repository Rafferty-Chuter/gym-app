"use client";

import { useMemo, useState } from "react";
import TimeSeriesChart, { type TimeSeriesPoint } from "@/components/charts/TimeSeriesChart";
import Sheet from "@/components/ui/Sheet";
import NumberPad, { NumberPadValue } from "@/components/ui/NumberPad";
import { makeScenario } from "@/lib/physique/fixtures";
import { trendSeries, weighInsByDate, displayRate, segmentStart } from "@/lib/physique/weight";
import { addDays } from "@/lib/dates";

export default function DevChartClient() {
  const [seed, setSeed] = useState(7);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pad, setPad] = useState("82.4");

  const data = useMemo(() => {
    const sc = makeScenario({ seed, days: 56, bodyweightKg: 85, goal: { ratePctPerWeek: -0.6, targetKg: 80 }, weighInDays: "4x" });
    const trend = trendSeries(sc.weighIns);
    const raw = weighInsByDate(sc.weighIns);
    const points: TimeSeriesPoint[] = trend.map((t) => ({ date: t.date, raw: raw.get(t.date) ?? null, trend: t.trendKg }));
    const goal = sc.goal;
    const projection = goal
      ? {
          from: goal.startDate,
          fromValue: goal.startTrendKg,
          to: addDays(goal.startDate, 56),
          toValue: goal.startTrendKg * (1 + (goal.ratePctPerWeek / 100) * 8),
        }
      : null;
    const seg = segmentStart({ goal, dayFlags: sc.dayFlags, today: sc.today });
    const rate = displayRate(sc.weighIns, sc.today, seg, sc.dayFlags);
    return { sc, points, projection, rate, last: trend[trend.length - 1] };
  }, [seed]);

  const caption = data.rate
    ? `Trend ${data.last.trendKg.toFixed(1)} kg · ${data.rate.result.ratePctPerWeek >= 0 ? "+" : "−"}${Math.abs(data.rate.result.ratePctPerWeek).toFixed(2)} %/wk (${data.rate.windowDays} d)`
    : `Trend ${data.last.trendKg.toFixed(1)} kg · Early read`;

  return (
    <main className="mx-auto max-w-[560px] px-4 pb-28 pt-6" style={{ background: "#0a0a0b", color: "#f2f2f0", minHeight: "100dvh" }}>
      <p className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
        Dev · U1 primitives
      </p>
      <h1 className="mt-1 text-[20px] font-semibold tracking-[-0.01em]">Weight chart</h1>

      <section className="mt-4 rounded-[12px] p-4" style={{ background: "#141416" }}>
        <div className="flex items-baseline justify-between">
          <span className="text-[17px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
            {data.last.trendKg.toFixed(1)} <span className="text-[13px] font-medium" style={{ color: "#a3a3a8" }}>kg</span>
          </span>
          <span className="text-[11px] font-medium tracking-[0.04em]" style={{ color: "#6f6f76" }}>
            8 WEEKS · {data.sc.weighIns.length} WEIGH-INS
          </span>
        </div>
        <div className="mt-3">
          <TimeSeriesChart points={data.points} unit="kg" projection={data.projection} ariaLabel="Weight over 8 weeks" />
        </div>
        <p className="mt-2 text-[12px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
          {caption}
        </p>
      </section>

      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setSeed((s) => s + 1)}
          className="h-[44px] rounded-[12px] px-4 text-[15px] font-semibold"
          style={{ background: "#1d1d20", color: "#f2f2f0" }}
        >
          Next seed ({seed})
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="h-[44px] rounded-[12px] px-4 text-[15px] font-semibold"
          style={{ background: "#f2f2f0", color: "#0a0a0b" }}
        >
          Open sheet
        </button>
      </div>

      <h2 className="mt-8 text-[20px] font-semibold tracking-[-0.01em]">Empty state</h2>
      <section className="mt-3 rounded-[12px] p-4" style={{ background: "#141416" }}>
        <TimeSeriesChart points={[]} unit="kg" emptyText="No weigh-ins yet." height={120} />
      </section>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Weight"
        footer={
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="h-[48px] w-full rounded-[12px] text-[17px] font-semibold"
            style={{ background: "#f2f2f0", color: "#0a0a0b" }}
          >
            Save
          </button>
        }
      >
        <NumberPadValue value={pad} unit="kg" hint="This morning" />
        <NumberPad value={pad} onChange={setPad} decimals={1} step={0.1} />
      </Sheet>
    </main>
  );
}
