"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useRecordStore, useRepo, useSingleton } from "@/lib/storage/useStored";
import { dayFlagsStore, foodEntriesRepo, goalStore, sleepNightsRepo, weighInsRepo } from "@/lib/physique/io/repos";
import { displayRate, latestTrend, segmentStart } from "@/lib/physique/weight";
import { dayTotals, formatHoursMin } from "@/lib/physique/dayTotals";
import { formatWeight } from "@/lib/units";
import { formatRate } from "@/components/physique/WeightChartCard";
import { addDays } from "@/lib/dates";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { STATUS_HEX } from "@/lib/ui/status";
import { StatusDot } from "@/components/physique/ui";

/**
 * Compact physique card on Home: the verdict title with its status dot and
 * a check-in badge (U2b), then trend weight with its rate, kcal logged
 * today, and last night's sleep. Tap opens /body.
 */
export default function PhysiqueHomeCard() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit: rawUnit } = useUnit();
  const unit = rawUnit === "lb" ? "lb" : "kg";
  const weighIns = useRepo(weighInsRepo);
  const food = useRepo(foodEntriesRepo);
  const nights = useRepo(sleepNightsRepo);
  const dayFlags = useRecordStore(dayFlagsStore);
  const goal = useSingleton(goalStore);
  const analysis = usePhysiqueAnalysis(hydrated ? now : null, unit);

  const stats = useMemo(() => {
    if (!hydrated || !now) return null;
    const today = now.today;
    const trend = latestTrend(weighIns);
    const rate = trend ? displayRate(weighIns, today, segmentStart({ goal, dayFlags, today }), dayFlags) : null;
    const kcal = dayTotals(food, today);
    const night = nights.find((n) => n.date === today) ?? nights.find((n) => n.date === addDays(today, -1)) ?? null;
    return {
      weight: trend ? formatWeight(trend.trendKg, unit) : null,
      weightSub: trend ? (rate ? formatRate(rate.result.ratePctPerWeek) : "Early read") : "Add a weigh-in",
      kcal: kcal.entries > 0 ? `${Math.round(kcal.kcal).toLocaleString("en-GB")} kcal` : null,
      kcalSub: kcal.entries > 0 ? "today" : "Nothing logged",
      sleep: night ? formatHoursMin(night.asleepMin) : null,
      sleepSub: night ? (night.date === today ? "last night" : "night before") : "Add last night",
      hasGoal: goal != null,
    };
  }, [hydrated, now, weighIns, food, nights, dayFlags, goal, unit]);

  return (
    <Link
      href="/body"
      className="block rounded-[12px] px-4 py-3 transition-colors active:bg-[#1d1d20]"
      style={{ background: "#141416", border: "1px solid #2a2a2e" }}
      aria-label="Body: open weight, food and sleep logging"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px]" style={{ color: "#f2f2f0" }}>
          {analysis ? (
            <>
              <StatusDot color={STATUS_HEX[analysis.status.state]} />
              <span className="truncate font-medium">{analysis.verdict.title}</span>
              {analysis.checkInDue && (
                <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "#1d1d20", color: "#a3a3a8" }}>
                  Check-in ready
                </span>
              )}
            </>
          ) : (
            "\u00a0"
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[12px] font-medium" style={{ color: "#6f6f76" }}>
          Open
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <Stat label="Weight" value={stats?.weight ?? null} sub={stats?.weightSub ?? null} />
        <Stat label="Food" value={stats?.kcal ?? null} sub={stats?.kcalSub ?? null} />
        <Stat label="Sleep" value={stats?.sleep ?? null} sub={stats?.sleepSub ?? null} />
      </div>
    </Link>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | null; sub: string | null }) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
        {label}
      </span>
      <span className="truncate text-[17px] font-semibold leading-tight" style={{ color: value ? "#f2f2f0" : "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
        {value ?? "–"}
      </span>
      <span className="truncate text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
        {sub ?? " "}
      </span>
    </div>
  );
}
