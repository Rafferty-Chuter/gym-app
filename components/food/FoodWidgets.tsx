"use client";

import { MacroBars, NutritionRing } from "@/components/food/NutritionRing";
import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { EnergyBalanceChart, FAT_COLOR, KCAL_COLOR } from "@/components/food/EnergyCharts";
import { signedKcal, type EnergyBalance, type EnergyLine } from "@/lib/physique/food/energy";
import { FIBRE_GOOD_SHARE, FIBRE_TARGET_G } from "@/lib/physique/weekScorecard";
import type { MacroSums } from "@/lib/physique/food/timeline";
import type { ExpenditureState, ProgramTargets } from "@/lib/physique/types";
import type { LocalDate } from "@/lib/dates";

export type FoodView = "consumed" | "remaining";

type Props = {
  date: LocalDate;
  today: LocalDate;
  totals: MacroSums;
  /** The day's fibre when it can be read (lib/food/fibre.ts), else null and the line is hidden. */
  fibreG: number | null;
  target: ProgramTargets | null;
  view: FoodView;
  onViewChange: (v: FoodView) => void;
  energy: EnergyBalance;
  energyLine: EnergyLine;
  onEnergyLineChange: (l: EnergyLine) => void;
  expenditureState: ExpenditureState | null;
  /** The engine's current maintenance estimate (C6); null before it has one. */
  maintenance: { kcal: number | null; state: ExpenditureState; plusMinus: number | null } | null;
};

const n = (v: number) => Math.round(v).toLocaleString("en-GB");

/** How settled the maintenance estimate is, said beside it; nothing once it updates normally. */
const MAINTENANCE_WORD: Record<ExpenditureState, string | null> = { calibrating: "early read", settling: "settling", holding: "holding", stable: null };

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
 * the week strip and the ring already do their jobs. One quiet fibre line
 * sits under the macros once the day's fibre can be read (F7).
 */
export default function FoodWidgets(props: Props) {
  const { date, today, totals, fibreG, target, view, onViewChange, energy, energyLine, onEnergyLineChange, expenditureState, maintenance } = props;
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
            <MacroBars totals={totals} target={target} />
          </div>
          {fibreG != null && (
            <p className="mt-3 flex items-baseline justify-between text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              <span>Fibre</span>
              <span>
                <span className="font-semibold" style={{ color: fibreG >= FIBRE_TARGET_G * FIBRE_GOOD_SHARE ? "var(--status-good)" : "var(--text)" }}>
                  {Math.round(fibreG)}
                </span>{" "}
                of {FIBRE_TARGET_G} g
              </span>
            </p>
          )}
          {maintenance?.kcal != null && (
            <Link href="/food/energy" className={`${fibreG != null ? "mt-1.5" : "mt-3"} flex items-baseline justify-between text-[12px]`} style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }} aria-label={`Maintenance about ${n(maintenance.kcal)} kcal${MAINTENANCE_WORD[maintenance.state] ? `, ${MAINTENANCE_WORD[maintenance.state]}` : ""}. Open maintenance`}>
              <span>
                Maintenance
                {MAINTENANCE_WORD[maintenance.state] && <span style={{ color: "var(--text-tertiary)" }}> · {MAINTENANCE_WORD[maintenance.state]}</span>}
              </span>
              <span className="flex items-center gap-1">
                <span>
                  <span className="font-semibold" style={{ color: "var(--text)" }}>
                    {n(maintenance.kcal)}
                  </span>{" "}
                  kcal
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </span>
            </Link>
          )}
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
            <Link href="/food/energy" className="flex items-center gap-1 text-[15px] font-semibold" style={{ color: "var(--text)" }} aria-label="Energy balance. Open maintenance">
              Energy balance
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
            <Pills value={energyLine} options={[{ id: "expenditure", label: "Maintenance" }, { id: "targets", label: "Targets" }]} onChange={onEnergyLineChange} label="Line" />
          </div>
          <div className="mt-2">
            <EnergyBalanceChart points={energy.points} lineColor={energyLine === "targets" ? FAT_COLOR : "var(--text)"} ariaLabel={`Intake against ${energyLine} over ${energy.days} days`} />
          </div>
          <div className="mt-1 grid grid-cols-3 gap-2">
            {(
              [
                { label: "Intake", value: energy.avgIntakeKcal, color: KCAL_COLOR, prefix: "" },
                { label: energyLine === "targets" ? "Targets" : "Maintenance", value: energy.avgLineKcal, color: energyLine === "targets" ? FAT_COLOR : "var(--text-secondary)", prefix: "− " },
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
              : `Averages over ${energy.daysLogged} logged day${energy.daysLogged === 1 ? "" : "s"}${energyLine === "expenditure" && expenditureState && expenditureState !== "stable" ? ` · maintenance ${expenditureState}` : ""}.`}
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
