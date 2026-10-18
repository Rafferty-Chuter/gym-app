"use client";

import { MacroBars, NutritionRing } from "@/components/food/NutritionRing";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { EnergyBalanceChart, FAT_COLOR, KCAL_COLOR } from "@/components/food/EnergyCharts";
import { signedKcal, type EnergyBalance, type EnergyLine } from "@/lib/physique/food/energy";
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
};

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

function Card({ children, ariaLabel }: { children: ReactNode; ariaLabel: string }) {
  return (
    <section className="flex w-full shrink-0 snap-start flex-col rounded-[12px] p-4" style={{ background: "var(--surface)", scrollSnapAlign: "start" }} aria-label={ariaLabel}>
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
          <button key={o.id} type="button" role="tab" aria-selected={selected} onClick={() => onChange(o.id)} className="h-[26px] rounded-full px-2.5 text-[11px] font-medium transition-colors" style={{ background: selected ? "var(--primary)" : "var(--surface-raised)", color: selected ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Widget carousel (05-design §9.4): Today · Energy balance, as horizontal
 * scroll-snap pages with dots. Tapping the ring switches eaten and
 * remaining. The week card and the Consumed / Remaining pills went in B2:
 * the week strip and the ring already do their jobs.
 */
export default function FoodWidgets(props: Props) {
  const { date, today, totals, target, view, onViewChange, energy, energyLine, onEnergyLineChange, expenditureState } = props;
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

  return (
    <div className="flex flex-col gap-2">
      <div ref={scroller} onScroll={onScroll} className="-mx-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 sm:-mx-6 sm:px-6" style={{ scrollbarWidth: "none", scrollSnapType: "x mandatory", scrollPaddingInline: 20 }} aria-roledescription="carousel">
        {/* Today */}
        <Card ariaLabel={isToday ? "Today" : "Selected day"}>
          <NutritionRing eatenKcal={totals.kcal} targetKcal={target?.kcal ?? null} view={view} onToggleView={() => onViewChange(remaining ? "consumed" : "remaining")} />
          <div className="mt-4">
            <MacroBars totals={totals} target={target} view={view} />
          </div>
          {!target && (
            <p className="mt-3 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              No targets yet.{" "}
              <Link href="/body/goal" className="underline" style={{ color: "var(--text-secondary)" }}>
                Set a goal
              </Link>{" "}
              to get them.
            </p>
          )}
        </Card>

        {/* Energy balance */}
        <Card ariaLabel="Energy balance">
          <div className="flex items-center justify-between gap-2">
            <Link href="/food/energy" className="flex items-center gap-1 text-[15px] font-semibold" style={{ color: "var(--text)" }} aria-label="Energy balance. Open expenditure">
              Energy balance
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
            <Pills value={energyLine} options={[{ id: "expenditure", label: "Expenditure" }, { id: "targets", label: "Targets" }]} onChange={onEnergyLineChange} label="Line" />
          </div>
          <div className="mt-2">
            <EnergyBalanceChart points={energy.points} lineColor={energyLine === "targets" ? FAT_COLOR : "var(--text)"} ariaLabel={`Intake against ${energyLine} over ${energy.days} days`} />
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(
              [
                { label: "Intake", value: energy.avgIntakeKcal, color: KCAL_COLOR, prefix: "" },
                { label: energyLine === "targets" ? "Targets" : "Expenditure", value: energy.avgLineKcal, color: energyLine === "targets" ? FAT_COLOR : "var(--text-secondary)", prefix: "− " },
                { label: "Difference", value: energy.differenceKcal, color: "var(--text)", prefix: "= " },
              ] as const
            ).map((t) => (
              <div key={t.label} className="flex flex-col">
                <span className="text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  <span style={{ color: "var(--text-tertiary)" }}>{t.prefix}</span>
                  {t.value == null ? "–" : t.label === "Difference" ? signedKcal(t.value) : n(t.value)}
                </span>
                <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: t.color }} aria-hidden />
                  {t.label}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            {energy.daysLogged === 0
              ? `No full days logged in the last ${energy.days}.`
              : `Averages over ${energy.daysLogged} logged day${energy.daysLogged === 1 ? "" : "s"}${energyLine === "expenditure" && expenditureState && expenditureState !== "stable" ? ` · expenditure ${expenditureState}` : ""}.`}
          </p>
        </Card>
      </div>

      <div className="flex gap-1.5 pl-1" aria-hidden>
        {[0, 1].map((i) => (
          <button key={i} type="button" tabIndex={-1} onClick={() => goTo(i)} className="h-1.5 w-1.5 rounded-full" style={{ background: i === page ? "var(--text)" : "var(--border-strong)" }} />
        ))}
      </div>
    </div>
  );
}
