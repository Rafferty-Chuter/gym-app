"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import type { Now } from "@/lib/dates";
import { deleteFoodEntry, saveFoodEntry, useBodyData, type QuickFood } from "@/lib/physique/io/bodyData";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { dayTotals, recentFoods } from "@/lib/physique/dayTotals";
import { targetInEffect } from "@/lib/physique/intake";
import PageHeader from "@/components/ui/PageHeader";
import FoodQuickAddSheet from "@/components/physique/FoodQuickAddSheet";
import EnergyCard from "@/components/physique/EnergyCard";
import { Caption, MacroBar } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

/** R1 placeholder for the Food tab: today's totals, entries and the energy card. R2 brings the timeline, widgets and logger. */
export default function FoodPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "#0a0a0b" }} />;
  return <FoodContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

function FoodContent({ now, unit }: { now: Now; unit: "kg" | "lb" }) {
  const today = now.today;
  const data = useBodyData();
  const analysis = usePhysiqueAnalysis(now, unit);
  const [open, setOpen] = useState(false);
  const day = useMemo(() => {
    const entries = data.foodEntries.filter((e) => e.date === today).sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : 1));
    return { entries, totals: dayTotals(data.foodEntries, today), target: targetInEffect(data.program, today) };
  }, [data, today]);
  const nowIso = () => new Date().toISOString();
  const left = day.target ? Math.max(0, Math.round(day.target.kcal - day.totals.kcal)) : null;

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption={`Today · ${longLocalDate(today)}`} title="Food" action={{ label: "Add food", onClick: () => setOpen(true) }} />

        <section className="rounded-[12px] p-4" style={{ background: "#141416" }} aria-label="Today's nutrition">
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col">
              <span className="text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
                {left != null ? left.toLocaleString("en-GB") : Math.round(day.totals.kcal).toLocaleString("en-GB")}
              </span>
              <span className="mt-1 text-[12px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
                {left != null ? `kcal left · ${Math.round(day.totals.kcal).toLocaleString("en-GB")} of ${day.target!.kcal.toLocaleString("en-GB")}` : day.totals.entries > 0 ? "kcal today · set a goal for targets" : "nothing logged yet"}
              </span>
            </div>
            <Caption>{day.totals.entries} {day.totals.entries === 1 ? "entry" : "entries"}</Caption>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {(
              [
                { label: "Protein", v: day.totals.proteinG, t: day.target?.proteinG ?? null, c: "#e8736f" },
                { label: "Fat", v: day.totals.fatG, t: day.target?.fatG ?? null, c: "#f0c36a" },
                { label: "Carbs", v: day.totals.carbsG, t: day.target?.carbsG ?? null, c: "#6fcf9f" },
              ] as const
            ).map((m) => (
              <div key={m.label} className="flex flex-col gap-1.5">
                <span className="text-[11px] font-medium" style={{ color: "#6f6f76" }}>{m.label}</span>
                <MacroBar value={m.v} target={m.t} color={m.c} />
                <span className="text-[12px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
                  {Math.round(m.v)}{m.t != null ? ` / ${m.t}` : ""} g
                </span>
              </div>
            ))}
          </div>
        </section>

        {day.entries.length > 0 ? (
          <ul className="divide-y divide-[#2a2a2e] overflow-hidden rounded-[12px]" style={{ background: "#141416" }} aria-label="Entries">
            {day.entries.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[15px]" style={{ color: "#f2f2f0" }}>{e.label}</span>
                  <span className="text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                    {e.loggedAt.slice(11, 16)} · P {Math.round(e.proteinG)} · F {Math.round(e.fatG)} · C {Math.round(e.carbsG)} g{e.method === "ai_text" ? " · est." : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>{Math.round(e.kcal)}</span>
                  <button type="button" onClick={() => void deleteFoodEntry(e.id)} className="flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "#1d1d20", color: "#a3a3a8" }} aria-label={`Remove ${e.label}`}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
            Nothing logged today. Tap + to add a food; recents re-log in one tap.
          </p>
        )}

        {analysis && <EnergyCard analysis={analysis} />}
      </div>
      <FoodQuickAddSheet open={open} onClose={() => setOpen(false)} recent={recentFoods(data.savedFoods, 8)} dateLabel="today" onSave={(food: QuickFood, savedFoodId?: string) => saveFoodEntry(today, food, nowIso(), savedFoodId)} />
    </main>
  );
}
