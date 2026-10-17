"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { CARBS_COLOR, EnergyBalanceChart, FAT_COLOR, KCAL_COLOR, PROTEIN_COLOR } from "@/components/food/EnergyCharts";
import { signedKcal, type EnergyBalance, type EnergyLine } from "@/lib/physique/food/energy";
import { targetMet, WEEKDAY_LETTERS, type WeekDay } from "@/lib/physique/food/week";
import type { MacroSums } from "@/lib/physique/food/timeline";
import type { ExpenditureState, ProgramTargets } from "@/lib/physique/types";
import type { LocalDate } from "@/lib/dates";

export type FoodView = "consumed" | "remaining";

type Props = {
  date: LocalDate;
  today: LocalDate;
  totals: MacroSums;
  target: ProgramTargets | null;
  view: FoodView;
  onViewChange: (v: FoodView) => void;
  energy: EnergyBalance;
  energyLine: EnergyLine;
  onEnergyLineChange: (l: EnergyLine) => void;
  expenditureState: ExpenditureState | null;
  week: readonly WeekDay[];
  onSelectDay: (date: LocalDate) => void;
};

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

function Card({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  return (
    <section className="flex w-full shrink-0 snap-start flex-col rounded-[12px] p-4" style={{ background: "#141416", scrollSnapAlign: "start" }} aria-label={ariaLabel}>
      {children}
    </section>
  );
}

function Pills<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<{ id: T; label: string }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex gap-1" role="tablist" aria-label={label}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button key={o.id} type="button" role="tab" aria-selected={selected} onClick={() => onChange(o.id)} className="h-[26px] rounded-full px-2.5 text-[11px] font-medium transition-colors" style={{ background: selected ? "#f2f2f0" : "#1d1d20", color: selected ? "#0a0a0b" : "#a3a3a8" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Widget carousel (05-design §9.4): Today · Energy balance · Week, as
 * horizontal scroll-snap pages with dots, and the Consumed / Remaining
 * toggle under it.
 */
export default function FoodWidgets(props: Props) {
  const { date, today, totals, target, view, onViewChange, energy, energyLine, onEnergyLineChange, expenditureState, week, onSelectDay } = props;
  const scroller = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const remaining = view === "remaining";
  const isToday = date === today;

  function onScroll() {
    const el = scroller.current;
    if (!el) return;
    const next = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
    if (next !== page) setPage(next);
  }
  function goTo(i: number) {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  }

  const macros = [
    { key: "proteinG", label: "P", value: totals.proteinG, target: target?.proteinG ?? null, color: PROTEIN_COLOR },
    { key: "fatG", label: "F", value: totals.fatG, target: target?.fatG ?? null, color: FAT_COLOR },
    { key: "carbsG", label: "C", value: totals.carbsG, target: target?.carbsG ?? null, color: CARBS_COLOR },
  ] as const;

  const kcalLeft = target ? target.kcal - totals.kcal : null;
  const hero = target ? (remaining ? Math.max(0, Math.round(kcalLeft ?? 0)) : Math.round(totals.kcal)) : Math.round(totals.kcal);
  const heroWord = target ? (remaining ? (kcalLeft != null && kcalLeft < 0 ? "over" : "left") : "eaten") : "kcal";
  const overBy = kcalLeft != null && kcalLeft < 0 ? Math.round(-kcalLeft) : 0;
  const selectedWeek = week.find((d) => d.date === date) ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div ref={scroller} onScroll={onScroll} className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 sm:-mx-6 sm:px-6" style={{ scrollbarWidth: "none", scrollSnapType: "x mandatory", scrollPaddingInline: 20 }} aria-roledescription="carousel">
        {/* Today */}
        <Card ariaLabel={isToday ? "Today" : "Selected day"}>
          <div className="my-auto flex items-end justify-between gap-2">
            <div className="flex min-w-[60px] flex-col">
              <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
                {remaining ? "Eaten" : "Left"}
              </span>
              <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
                {target ? n(remaining ? totals.kcal : Math.max(0, kcalLeft ?? 0)) : "–"}
              </span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-[40px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
                {remaining && overBy > 0 ? n(overBy) : n(hero)}
              </span>
              <span className="mt-1 text-[12px]" style={{ color: "#a3a3a8" }}>
                {heroWord}
              </span>
            </div>
            <div className="flex min-w-[60px] flex-col items-end">
              <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
                Target
              </span>
              <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
                {target ? n(target.kcal) : "–"}
              </span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {macros.map((m) => {
              const shown = m.target != null && remaining ? Math.max(0, m.target - m.value) : m.value;
              const pct = m.target && m.target > 0 ? Math.min(1, m.value / m.target) : 0;
              return (
                <div key={m.key} className="flex flex-col gap-1.5">
                  <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: "#1d1d20" }} aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${pct * 100}%`, background: m.color, transition: "width 150ms" }} />
                  </div>
                  <span className="text-[12px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: m.color }}>{m.label}</span> {Math.round(shown)}
                    {m.target != null ? ` / ${m.target}` : ""} g
                  </span>
                </div>
              );
            })}
          </div>
          {!target && (
            <p className="mt-3 text-[12px]" style={{ color: "#6f6f76" }}>
              No targets yet.{" "}
              <Link href="/body/goal" className="underline" style={{ color: "#a3a3a8" }}>
                Set a goal
              </Link>{" "}
              to get them.
            </p>
          )}
        </Card>

        {/* Energy balance */}
        <Card ariaLabel="Energy balance">
          <div className="flex items-center justify-between gap-2">
            <Link href="/food/energy" className="flex items-center gap-1 text-[15px] font-semibold" style={{ color: "#f2f2f0" }} aria-label="Energy balance. Open expenditure">
              Energy balance
              <svg viewBox="0 0 24 24" fill="none" stroke="#6f6f76" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
            <Pills value={energyLine} options={[{ id: "expenditure", label: "Expenditure" }, { id: "targets", label: "Targets" }]} onChange={onEnergyLineChange} label="Line" />
          </div>
          <div className="mt-2">
            <EnergyBalanceChart points={energy.points} lineColor={energyLine === "targets" ? FAT_COLOR : "#f2f2f0"} ariaLabel={`Intake against ${energyLine} over ${energy.days} days`} />
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(
              [
                { label: "Intake", value: energy.avgIntakeKcal, color: KCAL_COLOR, prefix: "" },
                { label: energyLine === "targets" ? "Targets" : "Expenditure", value: energy.avgLineKcal, color: energyLine === "targets" ? FAT_COLOR : "#a3a3a8", prefix: "− " },
                { label: "Difference", value: energy.differenceKcal, color: "#f2f2f0", prefix: "= " },
              ] as const
            ).map((t) => (
              <div key={t.label} className="flex flex-col">
                <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: "#6f6f76" }}>{t.prefix}</span>
                  {t.value == null ? "–" : t.label === "Difference" ? signedKcal(t.value) : n(t.value)}
                </span>
                <span className="flex items-center gap-1 text-[11px]" style={{ color: "#6f6f76" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: t.color }} aria-hidden />
                  {t.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "#6f6f76" }}>
            {energy.daysLogged === 0
              ? `No full days logged in the last ${energy.days}.`
              : `Averages over ${energy.daysLogged} logged day${energy.daysLogged === 1 ? "" : "s"}${energyLine === "expenditure" && expenditureState && expenditureState !== "stable" ? ` · expenditure ${expenditureState}` : ""}.`}
          </p>
        </Card>

        {/* Week */}
        <Card ariaLabel="This week">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
              This week
            </span>
            <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
              {selectedWeek ? shortLocalDate(selectedWeek.date) : ""}
            </span>
          </div>
          <div className="my-auto flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-end justify-between gap-0.5" role="group" aria-label="Days">
              {week.map((d, i) => {
                const selected = d.date === date;
                const bars = [
                  { v: d.kcal, t: d.target?.kcal ?? null, c: KCAL_COLOR },
                  { v: d.proteinG, t: d.target?.proteinG ?? null, c: PROTEIN_COLOR },
                  { v: d.fatG, t: d.target?.fatG ?? null, c: FAT_COLOR },
                  { v: d.carbsG, t: d.target?.carbsG ?? null, c: CARBS_COLOR },
                ];
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => onSelectDay(d.date)}
                    disabled={d.future}
                    aria-pressed={selected}
                    aria-label={`${WEEKDAY_LETTERS[i]} ${Number(d.date.slice(8, 10))}, ${d.logged ? `${n(d.kcal)} kcal` : "nothing logged"}`}
                    className="flex flex-col items-center gap-1 rounded-[8px] px-0.5 pb-1 pt-1.5 disabled:opacity-40"
                    style={{ border: `1px solid ${selected ? "#3a3a40" : "transparent"}` }}
                  >
                    <div className="flex h-[52px] items-end gap-[2px]">
                      {bars.map((b, j) => {
                        const max = b.t && b.t > 0 ? b.t * 1.3 : Math.max(1, b.v);
                        const h = Math.max(d.logged ? 2 : 0, Math.min(52, (b.v / max) * 52));
                        const tick = b.t && b.t > 0 ? Math.min(52, (b.t / max) * 52) : null;
                        const met = targetMet(b.v, b.t);
                        return (
                          <div key={j} className="relative flex h-full w-[4px] items-end">
                            {tick != null && <span className="absolute left-0 right-0 h-px" style={{ bottom: tick, background: met ? "#f2f2f0" : "#3a3a40" }} aria-hidden />}
                            <span className="w-full rounded-[1px]" style={{ height: h, background: b.c, opacity: d.logged ? 1 : 0.25 }} aria-hidden />
                          </div>
                        );
                      })}
                    </div>
                    <span className="text-[10px] font-medium" style={{ color: selected ? "#f2f2f0" : "#6f6f76" }}>
                      {WEEKDAY_LETTERS[i]}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex w-[88px] shrink-0 flex-col gap-1.5" aria-label="Selected day">
              {(
                [
                  { l: "kcal", v: selectedWeek?.kcal ?? 0, t: selectedWeek?.target?.kcal ?? null, c: KCAL_COLOR },
                  { l: "P", v: selectedWeek?.proteinG ?? 0, t: selectedWeek?.target?.proteinG ?? null, c: PROTEIN_COLOR },
                  { l: "F", v: selectedWeek?.fatG ?? 0, t: selectedWeek?.target?.fatG ?? null, c: FAT_COLOR },
                  { l: "C", v: selectedWeek?.carbsG ?? 0, t: selectedWeek?.target?.carbsG ?? null, c: CARBS_COLOR },
                ] as const
              ).map((r) => (
                <div key={r.l} className="flex items-baseline justify-between gap-1 whitespace-nowrap text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: r.c }}>{r.l}</span>
                  <span className="flex flex-col items-end leading-tight">
                    <span style={{ color: "#f2f2f0" }}>{n(r.v)}</span>
                    {r.t != null && <span className="text-[10px]" style={{ color: "#6f6f76" }}>of {n(r.t)}</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1.5 pl-1" aria-hidden>
          {[0, 1, 2].map((i) => (
            <button key={i} type="button" tabIndex={-1} onClick={() => goTo(i)} className="h-1.5 w-1.5 rounded-full" style={{ background: i === page ? "#f2f2f0" : "#3a3a40" }} />
          ))}
        </div>
        <Pills value={view} options={[{ id: "consumed", label: "Consumed" }, { id: "remaining", label: "Remaining" }]} onChange={onViewChange} label="Numbers" />
      </div>
    </div>
  );
}
