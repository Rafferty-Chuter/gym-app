"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { addDays, type Now } from "@/lib/dates";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useExpenditure } from "@/lib/physique/io/expenditure";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { expenditureSummary, signedKcal, targetsHistory } from "@/lib/physique/food/energy";
import { RANGES, type RangeId } from "@/components/physique/WeightChartCard";
import { ExpenditureChart } from "@/components/food/EnergyCharts";
import { Caption, Row, RowGroup } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

/** The expenditure page (05-design §9.4): MacroFactor's "maintenance adjustment", explained. */
export default function EnergyPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "var(--page)" }} />;
  return <EnergyContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

const n = (v: number) => Math.round(v).toLocaleString("en-GB");


function EnergyContent({ now, unit }: { now: Now; unit: "kg" | "lb" }) {
  const today = now.today;
  const data = useBodyData();
  const expenditure = useExpenditure(now);
  const analysis = usePhysiqueAnalysis(now, unit);
  const [range, setRange] = useState<RangeId>("1M");

  const model = useMemo(() => {
    const series = expenditure?.series ?? [];
    const days = RANGES.find((r) => r.id === range)?.days ?? null;
    const first = series[0]?.date ?? today;
    const from = days ? addDays(today, -(days - 1)) : first;
    const summary = expenditureSummary(series, { from, to: today });
    const history = targetsHistory(data.program, today);
    const maturity = expenditure?.maturity ?? null;
    return { summary, history, maturity, from };
  }, [expenditure, range, today, data.program]);

  const e = analysis?.expenditure ?? null;
  const state = e?.state ?? "calibrating";
  const strategy =
    state === "holding"
      ? model.maturity?.resume
        ? `Holding. Resumes after ${model.maturity.resume.foodDaysNeeded} more complete food day${model.maturity.resume.foodDaysNeeded === 1 ? "" : "s"}${model.maturity.resume.weighInNeeded ? " and a weigh-in" : ""}.`
        : "Holding until logging resumes."
      : state === "calibrating"
        ? `Calibrating · day ${Math.min(21, analysis?.data.updatingDays ?? 0)} of about 21. Moves faster while it learns.`
        : state === "settling"
          ? "Settling. Updating daily; typical error about ±400 kcal until four weeks are in."
          : "Updating daily from logged food and the weight trend. Typical error about ±300 kcal.";

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <header className="sticky top-0 z-30 -mx-5 px-5 pb-3 pt-4 sm:-mx-6 sm:px-6" style={{ background: "var(--background)" }}>
          <Link href="/food" className="flex items-center gap-1 text-[13px]" style={{ color: "var(--text-secondary)" }} aria-label="Back to Food">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Food
          </Link>
          <h1 className="mt-1 text-[34px] font-semibold leading-none tracking-[-0.02em]">Maintenance</h1>
        </header>

        {/* One panel (polish): today's estimate first, then the range under a hairline. */}
        <section className="rounded-[16px] p-4" style={{ background: "var(--surface)" }} aria-label="Maintenance">
          <div className="flex flex-col gap-1">
            <Caption>Maintenance now</Caption>
            <span className="text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ color: e?.kcal != null ? "var(--text)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {e?.kcal != null ? n(e.kcal) : "–"}
              {e?.kcal != null && (
                <span className="text-[13px] font-medium tracking-normal" style={{ color: "var(--text-secondary)" }}>
                  {" "}
                  kcal a day
                </span>
              )}
            </span>
            <span className="mt-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {e?.kcal != null ? strategy : "Needs food and weigh-ins on the same days"}
            </span>
          </div>
          <div className="-mx-4 mt-4 grid grid-cols-2 gap-3 px-4 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <div className="flex flex-col">
              <Caption>Average</Caption>
              <span className="text-[22px] font-semibold leading-tight tracking-[-0.02em]" style={{ color: model.summary.averageKcal != null ? "var(--text)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                {model.summary.averageKcal != null ? n(model.summary.averageKcal) : "–"}
                <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {" "}
                  kcal
                </span>
              </span>
            </div>
            <div className="flex flex-col">
              <Caption>Change</Caption>
              <span className="text-[22px] font-semibold leading-tight tracking-[-0.02em]" style={{ color: model.summary.differenceKcal != null ? "var(--text)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                {model.summary.differenceKcal != null ? signedKcal(model.summary.differenceKcal) : "–"}
                <span className="text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
                  {" "}
                  kcal
                </span>
              </span>
            </div>
          </div>
          <div className="mt-3">
            <ExpenditureChart points={model.summary.points} plusMinus={e?.plusMinus ?? null} ariaLabel={`Maintenance, ${range}`} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-1" role="tablist" aria-label="Range">
              {RANGES.map((r) => {
                const selected = r.id === range;
                return (
                  <button key={r.id} type="button" role="tab" aria-selected={selected} onClick={() => setRange(r.id)} className="h-[26px] rounded-full px-2.5 text-[11px] font-medium transition-colors" style={{ background: selected ? "var(--primary)" : "var(--surface-raised)", color: selected ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
                    {r.id}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-3 text-[11px]" style={{ color: "var(--text-tertiary)" }} aria-hidden>
              {model.summary.points.some((p) => p.state === "holding") && (
                <>
                  <span className="flex items-center gap-1">
                    <span className="inline-block h-0.5 w-3 rounded" style={{ background: "var(--macro-kcal)" }} />
                    Updating
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 border-t border-dashed" style={{ borderColor: "var(--text-tertiary)" }} />
                    Holding
                  </span>
                </>
              )}
              {e?.plusMinus && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded-sm" style={{ background: "color-mix(in srgb, var(--macro-kcal) 12%, transparent)" }} />±{e.plusMinus}
                </span>
              )}
            </div>
          </div>
          <p className="mt-2 text-[12px]" style={{ color: "var(--text-secondary)" }}>
            {model.summary.points.length === 0
              ? "The maintenance estimate starts once there is a weigh-in and a day of food."
              : `Change since ${longLocalDate(model.summary.points[0].date)}.`}
          </p>
        </section>


        <section aria-label="Targets history">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[17px] font-semibold">Targets history</span>
            <Caption>{model.history.length === 0 ? "no program" : `${model.history.length} ${model.history.length === 1 ? "entry" : "entries"}`}</Caption>
          </div>
          {model.history.length === 0 ? (
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Targets appear here once a goal is set. Each weekly check-in adds a line with its reason.{" "}
              <Link href="/body/goal" className="underline" style={{ color: "var(--text)" }}>
                Set a goal
              </Link>
            </p>
          ) : (
            <RowGroup>
              {model.history.map((h) => (
                <Row
                  key={`${h.entry.startDate}-${h.entry.acceptedAt}`}
                  label={`${longLocalDate(h.entry.startDate)}${h.current ? " · current" : ""}`}
                  value={
                    <span>
                      {n(h.entry.kcal)}
                      {h.deltaKcal != null && h.deltaKcal !== 0 && (
                        <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
                          {" "}
                          {signedKcal(h.deltaKcal)}
                        </span>
                      )}
                    </span>
                  }
                  sub={`P ${h.entry.proteinG} · F ${h.entry.fatG} · C ${h.entry.carbsG} g`}
                  below={
                    <p className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
                      {h.reason}
                    </p>
                  }
                />
              ))}
            </RowGroup>
          )}
        </section>
      </div>
    </main>
  );
}
