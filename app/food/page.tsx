"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { addDays, type LocalDate, type Now } from "@/lib/dates";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { useExpenditure } from "@/lib/physique/io/expenditure";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { clearDay, copyDay, logFood, removeFoodEntry, removeSavedFood, setFoodPrefs, toggleFavourite, updateFoodEntry, useFoodPrefs, type FoodInput } from "@/lib/physique/io/foodData";
import { dayTimeline } from "@/lib/physique/food/timeline";
import { weekDates, weekTotals } from "@/lib/physique/food/week";
import { energyBalance, type EnergyLine } from "@/lib/physique/food/energy";
import { targetInEffect } from "@/lib/physique/intake";
import PageHeader from "@/components/ui/PageHeader";
import Sheet from "@/components/ui/Sheet";
import WeekStrip from "@/components/food/WeekStrip";
import FoodWidgets, { type FoodView } from "@/components/food/FoodWidgets";
import FoodTimeline from "@/components/food/FoodTimeline";
import AddFoodBar from "@/components/food/AddFoodBar";
import LoggerSheet, { type LoggerOpen } from "@/components/food/LoggerSheet";
import EntrySheet from "@/components/food/EntrySheet";
import { ErrorLine, PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import type { FoodEntry } from "@/lib/physique/types";

/** Food tab (05-design §9.4): week strip, widget carousel, hour timeline, add-food bar and the logger. */
export default function FoodPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "#0a0a0b" }} />;
  return <FoodContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

type DayAction = { kind: "copy"; to: LocalDate } | { kind: "clear" } | null;

function FoodContent({ now, unit }: { now: Now; unit: "kg" | "lb" }) {
  const today = now.today;
  const tz = now.tz;
  const data = useBodyData();
  const prefs = useFoodPrefs();
  const expenditure = useExpenditure(now);
  const analysis = usePhysiqueAnalysis(now, unit);
  const [date, setDate] = useState<LocalDate>(today);
  const [logger, setLogger] = useState<LoggerOpen>(null);
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [energyLine, setEnergyLine] = useState<EnergyLine>("expenditure");
  const [dayAction, setDayAction] = useState<DayAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const week = useMemo(() => weekDates(date), [date]);
  const model = useMemo(() => {
    const timeline = dayTimeline(data.foodEntries, date, tz, { start: prefs.hourStart, end: prefs.hourEnd });
    const target = targetInEffect(data.program, date);
    const weekRows = weekTotals(week, data.foodEntries, data.dayFlags, data.program, today);
    const logged = new Set(weekRows.filter((d) => d.logged).map((d) => d.date));
    const energy = energyBalance(expenditure?.intake ?? [], expenditure?.series ?? [], data.program, energyLine, today);
    return { timeline, target, weekRows, logged, energy };
  }, [data, date, tz, prefs.hourStart, prefs.hourEnd, week, today, expenditure, energyLine]);

  const nowIso = () => new Date().toISOString();
  const isToday = date === today;
  const caption = isToday ? `Today · ${longLocalDate(today)}` : date === addDays(today, -1) ? `Yesterday · ${longLocalDate(date)}` : longLocalDate(date);
  const editingLive = editing ? (data.foodEntries.find((e) => e.id === editing.id) ?? null) : null;

  async function runDayAction() {
    if (!dayAction) return;
    setActionError(null);
    const r = dayAction.kind === "copy" ? await copyDay(date, dayAction.to, nowIso(), tz) : await clearDay(date);
    if (r.ok) setDayAction(null);
    else setActionError(r.error);
  }

  return (
    <main className="min-h-screen pb-40" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 sm:px-6">
        <PageHeader caption={caption} title="Food" action={{ label: "Add food", onClick: () => setLogger({}) }} />

        <WeekStrip dates={week} selected={date} today={today} logged={model.logged} onSelect={setDate} onPrevWeek={() => setDate(addDays(date, -7))} onNextWeek={() => setDate((d) => (addDays(d, 7) > today ? today : addDays(d, 7)))} />

        <FoodWidgets
          date={date}
          today={today}
          totals={model.timeline.totals}
          target={model.target}
          view={prefs.view}
          onViewChange={(view: FoodView) => void setFoodPrefs({ view })}
          energy={model.energy}
          energyLine={energyLine}
          onEnergyLineChange={setEnergyLine}
          expenditureState={analysis?.expenditure.state ?? null}
          week={model.weekRows}
          onSelectDay={setDate}
        />

        <FoodTimeline
          timeline={model.timeline}
          tz={tz}
          hideEmpty={prefs.hideEmptyHours}
          onAddAt={(hour) => setLogger({ hour })}
          onEdit={setEditing}
          onCopyDay={() => setDayAction({ kind: "copy", to: isToday ? addDays(today, -1) : today })}
          onClearDay={() => setDayAction({ kind: "clear" })}
          onToggleHideEmpty={() => void setFoodPrefs({ hideEmptyHours: !prefs.hideEmptyHours })}
        />
      </div>

      <AddFoodBar onOpen={() => setLogger({})} onDescribe={() => setLogger({ tab: "describe" })} />

      <LoggerSheet
        state={logger}
        onClose={() => setLogger(null)}
        date={date}
        today={today}
        tz={tz}
        consumedKcal={model.timeline.totals.kcal}
        targetKcal={model.target?.kcal ?? null}
        entries={data.foodEntries}
        saved={data.savedFoods}
        onLog={(food: FoodInput, savedFoodId?: string) => logFood(date, food, nowIso(), savedFoodId)}
        onToggleFavourite={toggleFavourite}
        onRemoveSaved={removeSavedFood}
      />

      <EntrySheet entry={editingLive} tz={tz} onClose={() => setEditing(null)} onSave={(patch) => (editingLive ? updateFoodEntry(editingLive.id, patch) : Promise.resolve({ ok: true as const }))} onRemove={() => (editingLive ? removeFoodEntry(editingLive.id) : Promise.resolve({ ok: true as const }))} />

      <Sheet open={dayAction != null} onClose={() => setDayAction(null)} title={dayAction?.kind === "copy" ? "Copy day" : "Clear day"}>
        {dayAction?.kind === "copy" && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
              Copy the {model.timeline.entries} {model.timeline.entries === 1 ? "entry" : "entries"} from {shortLocalDate(date)}, with their times, onto:
            </p>
            <div className="flex items-center justify-between rounded-[12px] px-3 py-2" style={{ background: "#1d1d20" }}>
              <button type="button" onClick={() => setDayAction({ kind: "copy", to: addDays(dayAction.to, -1) })} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "#a3a3a8" }} aria-label="Earlier day">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
                {dayAction.to === today ? "Today" : dayAction.to === addDays(today, -1) ? "Yesterday" : dayAction.to === addDays(today, 1) ? "Tomorrow" : longLocalDate(dayAction.to)}
              </span>
              <button type="button" onClick={() => setDayAction({ kind: "copy", to: addDays(dayAction.to, 1) })} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "#a3a3a8" }} aria-label="Later day">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>
            <ErrorLine text={actionError} />
            <PrimaryButton onClick={runDayAction} disabled={dayAction.to === date}>
              Copy
            </PrimaryButton>
          </div>
        )}
        {dayAction?.kind === "clear" && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
              Remove all {model.timeline.entries} {model.timeline.entries === 1 ? "entry" : "entries"} from {shortLocalDate(date)}. This cannot be undone.
            </p>
            <ErrorLine text={actionError} />
            <PrimaryButton onClick={runDayAction}>Clear day</PrimaryButton>
            <SecondaryButton onClick={() => setDayAction(null)}>Keep them</SecondaryButton>
          </div>
        )}
      </Sheet>
    </main>
  );
}
