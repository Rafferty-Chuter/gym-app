"use client";

import { useMemo, useState } from "react";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { addDays, type LocalDate, type Now } from "@/lib/dates";
import { useExpenditure } from "@/lib/physique/io/expenditure";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { setDayOverride, setDayStatus, useBodyData } from "@/lib/physique/io/bodyData";
import { clearDay, copyDay, logFood, removeFoodEntry, removeSavedFood, saveRecipe, setFoodPrefs, toggleFavourite, updateFoodEntry, useFoodPrefs, type FoodInput } from "@/lib/physique/io/foodData";
import { dayTimeline } from "@/lib/physique/food/timeline";
import { weekDates, weekTotals } from "@/lib/physique/food/week";
import { energyBalance, type EnergyLine } from "@/lib/physique/food/energy";
import { dailyIntake, targetInEffect } from "@/lib/physique/intake";
import PageHeader from "@/components/ui/PageHeader";
import Sheet from "@/components/ui/Sheet";
import WeekStrip from "@/components/food/WeekStrip";
import { knownFibre } from "@/lib/food/fibre";
import FoodWidgets, { type FoodView } from "@/components/food/FoodWidgets";
import FoodTimeline from "@/components/food/FoodTimeline";
import AddFoodBar from "@/components/food/AddFoodBar";
import LoggerSheet, { type LoggerOpen } from "@/components/food/LoggerSheet";
import EntrySheet from "@/components/food/EntrySheet";
import EditDaySheet from "@/components/food/EditDaySheet";
import GapSheet, { type CopySource } from "@/components/food/GapSheet";
import GapRows from "@/components/physique/GapRows";
import { findGaps, gapLines } from "@/lib/physique/gaps";
import { ErrorLine, PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import type { FoodEntry } from "@/lib/physique/types";

/** Food tab (05-design §9.4): week strip, widget carousel, hour timeline, add-food bar and the logger. */
export default function FoodPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <main className="min-h-screen" style={{ background: "var(--page)" }} />;
  return <FoodContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

type DayAction = { kind: "copy"; to: LocalDate } | { kind: "clear" } | { kind: "edit" } | { kind: "gap"; date: LocalDate } | null;

/** `/food?date=YYYY-MM-DD` selects that day; a past unlogged day also opens the gap sheet (Home and the week report link here). Client only. */
function dateFromQuery(today: LocalDate): LocalDate | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search).get("date");
  return q && /^\d{4}-\d{2}-\d{2}$/.test(q) && q <= today ? q : null;
}

/** Days with entries near a gap, nearest first, for the copy option. OURS. */
const COPY_SOURCE_DAYS = 14;

function FoodContent({ now, unit }: { now: Now; unit: "kg" | "lb" }) {
  const today = now.today;
  const tz = now.tz;
  const data = useBodyData();
  const prefs = useFoodPrefs();
  const expenditure = useExpenditure(now);
  const analysis = usePhysiqueAnalysis(now, unit);
  const [date, setDate] = useState<LocalDate>(() => dateFromQuery(today) ?? today);
  const [logger, setLogger] = useState<LoggerOpen>(() => (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("log") === "1" ? {} : null));
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [energyLine, setEnergyLine] = useState<EnergyLine>("expenditure");
  const [dayAction, setDayAction] = useState<DayAction>(() => {
    const q = dateFromQuery(today);
    if (!q || q >= today) return null;
    const status = dailyIntake(q, data.foodEntries.filter((e) => e.date === q), data.dayFlags[q]).status;
    return status === "unlogged" ? { kind: "gap", date: q } : null;
  });
  const [actionError, setActionError] = useState<string | null>(null);

  const week = useMemo(() => weekDates(date), [date]);
  const model = useMemo(() => {
    const timeline = dayTimeline(data.foodEntries, date, tz, { start: prefs.hourStart, end: prefs.hourEnd });
    const flags = data.dayFlags[date];
    // The day's status and override (Edit day) beat the raw sum, as they do in the engine.
    const intake = dailyIntake(date, data.foodEntries.filter((e) => e.date === date), flags);
    const totals = { kcal: intake.kcal, proteinG: intake.proteinG, carbsG: intake.carbsG, fatG: intake.fatG };
    // Fibre only when the entries are the day (no edited total) and most of their energy has a fibre value (F7).
    const fibreG = intake.status !== "fasting" && typeof flags?.kcalOverride !== "number" ? (knownFibre(data.foodEntries.filter((e) => e.date === date)) ?? null) : null;
    const dayNote =
      intake.status === "fasting"
        ? "Fasting day · counts as 0 kcal"
        : intake.status === "partial"
          ? "Partial day · skipped by the engine"
          : typeof flags?.kcalOverride === "number"
            ? `Total set to ${Math.round(flags.kcalOverride).toLocaleString("en-GB")} kcal · entries add up to ${Math.round(timeline.totals.kcal).toLocaleString("en-GB")}`
            : intake.suggestedPartial
              ? "Looks like a partial day · tap to confirm or keep it"
              : null;
    const target = targetInEffect(data.program, date);
    const weekRows = weekTotals(week, data.foodEntries, data.dayFlags, data.program, today);
    const logged = new Set(weekRows.filter((d) => d.logged).map((d) => d.date));
    const energy = energyBalance(expenditure?.intake ?? [], expenditure?.series ?? [], data.program, energyLine, today);
    const gapRows = gapLines(findGaps({ foodEntries: data.foodEntries, dayFlags: data.dayFlags, weighIns: [], sleepNights: [] }, today, ["food"]), today);
    return { timeline, totals, fibreG, flags, dayNote, target, weekRows, logged, energy, gapRows };
  }, [data, date, tz, prefs.hourStart, prefs.hourEnd, week, today, expenditure, energyLine]);

  const nowIso = () => new Date().toISOString();
  const isToday = date === today;
  const caption = isToday ? `Today · ${longLocalDate(today)}` : date === addDays(today, -1) ? `Yesterday · ${longLocalDate(date)}` : longLocalDate(date);
  const editingLive = editing ? (data.foodEntries.find((e) => e.id === editing.id) ?? null) : null;
  const gapDate = dayAction?.kind === "gap" ? dayAction.date : null;
  const copySources = useMemo<CopySource[]>(() => {
    if (!gapDate) return [];
    const from = addDays(gapDate, -COPY_SOURCE_DAYS);
    const counts = new Map<LocalDate, number>();
    for (const e of data.foodEntries) if (e.date >= from && e.date <= today && e.date !== gapDate) counts.set(e.date, (counts.get(e.date) ?? 0) + 1);
    const dist = (d: LocalDate) => Math.abs(Date.parse(d) - Date.parse(gapDate));
    return [...counts.entries()].map(([d, n]) => ({ date: d, entries: n })).sort((a, b) => dist(a.date) - dist(b.date) || (a.date < b.date ? -1 : 1));
  }, [gapDate, data.foodEntries, today]);

  async function runDayAction() {
    if (!dayAction) return;
    setActionError(null);
    const r = dayAction.kind === "copy" ? await copyDay(date, dayAction.to, nowIso(), tz) : await clearDay(date);
    if (r.ok) setDayAction(null);
    else setActionError(r.error);
  }

  return (
    <main className="min-h-screen pb-40" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 sm:px-6">
        {/* No header plus: the "Add a food" bar at thumb height opens the same search (B2). */}
        <PageHeader caption={caption} title="Food" />

        <WeekStrip dates={week} selected={date} today={today} logged={model.logged} onSelect={setDate} onPrevWeek={() => setDate(addDays(date, -7))} onNextWeek={() => setDate((d) => (addDays(d, 7) > today ? today : addDays(d, 7)))} />

        <GapRows lines={model.gapRows} onSelect={(l) => setDayAction({ kind: "gap", date: l.date })} />

        <FoodWidgets
          date={date}
          today={today}
          totals={model.totals}
          fibreG={model.fibreG}
          target={model.target}
          view={prefs.view}
          onViewChange={(view: FoodView) => void setFoodPrefs({ view })}
          energy={model.energy}
          energyLine={energyLine}
          onEnergyLineChange={setEnergyLine}
          expenditureState={analysis?.expenditure.state ?? null}
          maintenance={analysis?.expenditure ?? null}
        />

        <FoodTimeline
          timeline={model.timeline}
          tz={tz}
          onAddAt={(hour) => setLogger({ hour })}
          onEdit={setEditing}
          onCopyDay={() => setDayAction({ kind: "copy", to: isToday ? addDays(today, -1) : today })}
          onEditDay={() => setDayAction({ kind: "edit" })}
          dayNote={model.dayNote}
        />
      </div>

      <AddFoodBar onOpen={() => setLogger({})} onDescribe={() => setLogger({ tab: "describe" })} />

      <LoggerSheet
        state={logger}
        onClose={() => setLogger(null)}
        date={date}
        today={today}
        tz={tz}
        consumedKcal={model.totals.kcal}
        targetKcal={model.target?.kcal ?? null}
        entries={data.foodEntries}
        saved={data.savedFoods}
        onLog={(food: FoodInput, savedFoodId?: string) => logFood(date, food, nowIso(), savedFoodId)}
        onToggleFavourite={toggleFavourite}
        onRemoveSaved={removeSavedFood}
        onSaveRecipe={(draft) => saveRecipe(draft, nowIso())}
      />

      <EntrySheet entry={editingLive} tz={tz} onClose={() => setEditing(null)} onSave={(patch) => (editingLive ? updateFoodEntry(editingLive.id, patch) : Promise.resolve({ ok: true as const }))} onRemove={() => (editingLive ? removeFoodEntry(editingLive.id) : Promise.resolve({ ok: true as const }))} />

      <EditDaySheet
        open={dayAction?.kind === "edit"}
        onClose={() => setDayAction(null)}
        dateLabel={caption}
        flags={model.flags}
        entriesKcal={model.timeline.totals.kcal}
        onClear={model.timeline.entries > 0 ? () => setDayAction({ kind: "clear" }) : undefined}
        onSave={async ({ status, overrideKcal }) => {
          const a = await setDayStatus(date, status === "complete" ? null : status);
          if (!a.ok) return a;
          return setDayOverride(date, status === "fasting" ? null : overrideKcal);
        }}
      />

      <GapSheet
        date={gapDate}
        today={today}
        onClose={() => setDayAction(null)}
        sources={copySources}
        onLog={() => {
          if (gapDate) setDate(gapDate);
          setDayAction(null);
          setLogger({});
        }}
        onCopy={async (from) => {
          if (!gapDate) return { ok: true as const };
          const r = await copyDay(from, gapDate, nowIso(), tz);
          if (r.ok) {
            setDate(gapDate);
            setDayAction(null);
          }
          return r;
        }}
        onEditDay={() => {
          if (gapDate) setDate(gapDate);
          setDayAction({ kind: "edit" });
        }}
      />

      <Sheet open={dayAction?.kind === "copy" || dayAction?.kind === "clear"} onClose={() => setDayAction(null)} title={dayAction?.kind === "copy" ? "Copy day" : "Clear day"}>
        {dayAction?.kind === "copy" && (
          <div className="flex flex-col gap-3">
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              Copy the {model.timeline.entries} {model.timeline.entries === 1 ? "entry" : "entries"} from {shortLocalDate(date)}, with their times, onto:
            </p>
            <div className="flex items-center justify-between rounded-[12px] px-3 py-2" style={{ background: "var(--surface-raised)" }}>
              <button type="button" onClick={() => setDayAction({ kind: "copy", to: addDays(dayAction.to, -1) })} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }} aria-label="Earlier day">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                  <path d="M15 6l-6 6 6 6" />
                </svg>
              </button>
              <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                {dayAction.to === today ? "Today" : dayAction.to === addDays(today, -1) ? "Yesterday" : dayAction.to === addDays(today, 1) ? "Tomorrow" : longLocalDate(dayAction.to)}
              </span>
              <button type="button" onClick={() => setDayAction({ kind: "copy", to: addDays(dayAction.to, 1) })} disabled={dayAction.to >= today} className="flex h-9 w-9 items-center justify-center rounded-full disabled:opacity-30" style={{ color: "var(--text-secondary)" }} aria-label="Later day">
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
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
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
