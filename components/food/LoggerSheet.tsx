"use client";

import { useEffect, useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import MacroPad, { EMPTY_MACROS, macroNumbers, macrosToValues, type MacroField, type MacroValues } from "@/components/food/MacroPad";
import TimeChip from "@/components/food/TimeChip";
import { ErrorLine, PrimaryButton } from "@/components/physique/ui";
import DescribePanel, { DescribeFooter, useDescribe } from "@/components/food/DescribePanel";
import RecipeEditor, { RecipeFooter, RecipeHeader, eatingMacros, type Eating } from "@/components/food/RecipeEditor";
import { draftFromSaved, eatenLabel, emptyDraft, toSavedRecipe, type RecipeDraft } from "@/lib/food/recipeDraft";
import { recipeConfidence } from "@/lib/food/recipe";
import { hourLabel, localClock, macroKcal } from "@/lib/physique/food/timeline";
import { filterSaved } from "@/lib/physique/food/goTos";
import FoodSearch from "@/components/food/FoodSearch";
import SavedFoodRow, { PlusButton } from "@/components/food/SavedFoodRow";
import type { FoodInput } from "@/lib/physique/io/foodData";
import type { SaveResult } from "@/lib/physique/io/bodyData";
import type { FoodEntry, SavedFood } from "@/lib/physique/types";
import type { LocalDate } from "@/lib/dates";

export type LoggerTab = "search" | "quick" | "describe" | "saved";

export type LoggerOpen = { tab?: LoggerTab; hour?: number } | null;

type Props = {
  state: LoggerOpen;
  onClose: () => void;
  date: LocalDate;
  today: LocalDate;
  tz: string;
  consumedKcal: number;
  targetKcal: number | null;
  entries: readonly FoodEntry[];
  saved: readonly SavedFood[];
  onLog: (food: FoodInput, savedFoodId?: string) => Promise<SaveResult>;
  onToggleFavourite: (id: string) => Promise<SaveResult>;
  onRemoveSaved: (id: string) => Promise<SaveResult>;
  /** Saves a recipe from Create Recipe; the id is the saved food's. */
  onSaveRecipe: (draft: RecipeDraft) => Promise<SaveResult & { id?: string }>;
};

/** Create Recipe open over the logger, and where it was opened from. */
type RecipeView = { draft: RecipeDraft; eating: Eating; from: "describe" | "saved" | "new"; back: LoggerTab };

const TABS: ReadonlyArray<{ id: LoggerTab; label: string }> = [
  { id: "search", label: "Search" },
  { id: "quick", label: "Quick add" },
  { id: "describe", label: "Describe" },
  { id: "saved", label: "Saved" },
];

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const inputClass = "h-11 rounded-[12px] px-3 text-[15px] outline-none focus:ring-1";
const inputStyle = { background: "var(--surface-raised)", color: "var(--text)", border: "1px solid var(--border)" };

/** How long the "Logged …" line stays. OURS. */
const TOAST_MS = 2500;

/**
 * The logger sheet (05-design §9.4): full height, header × · time chip ·
 * "539 / 2,041" · ↓, tabs Search · Quick add · Describe · Saved. Search
 * (M4) opens on the go-tos and latest foods, then the UK base list and
 * products as you type. Stays open after a log so several foods go in
 * without reopening.
 */
export default function LoggerSheet(props: Props) {
  const { state } = props;
  return state ? <Inner key={`${props.date}-${state.hour ?? "now"}-${state.tab ?? "search"}`} {...props} state={state} /> : null;
}

function Inner({ state, onClose, date, today, tz, consumedKcal, targetKcal, entries, saved, onLog, onToggleFavourite, onRemoveSaved, onSaveRecipe }: Props & { state: NonNullable<LoggerOpen> }) {
  const [tab, setTab] = useState<LoggerTab>(state.tab ?? "search");
  const [time, setTime] = useState<string>(() => {
    if (state.hour != null) return hourLabel(state.hour);
    if (date === today) return localClock(new Date().toISOString(), tz) ?? "12:00";
    return "12:00";
  });
  const hour = Number(time.slice(0, 2));
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Quick add
  const [values, setValues] = useState<MacroValues>(EMPTY_MACROS);
  const [field, setField] = useState<MacroField>("kcal");
  const [name, setName] = useState("");
  const [serving, setServing] = useState("");
  const [prefillId, setPrefillId] = useState<string | undefined>(undefined);

  // Saved
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState(false);

  // Create Recipe
  const [recipeView, setRecipeView] = useState<RecipeView | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const savedList = useMemo(() => filterSaved(saved, query), [saved, query]);

  async function log(food: FoodInput, savedFoodId?: string) {
    setBusy(true);
    setError(null);
    const r = await onLog({ ...food, time }, savedFoodId);
    setBusy(false);
    if (r.ok) setToast(`Logged ${food.label} · ${n(food.kcal)} kcal`);
    else setError(r.error);
    return r.ok;
  }

  function logSaved(s: SavedFood) {
    void log({ label: s.label, kcal: s.kcal, proteinG: s.proteinG, fatG: s.fatG, carbsG: s.carbsG, fibreG: s.fibreG, serving: s.serving, method: "saved" }, s.id);
  }

  function openRecipe(draft: RecipeDraft, from: RecipeView["from"], eatingServings = 1) {
    setError(null);
    setRecipeView({ draft, eating: { amount: Math.min(eatingServings, draft.servings), unit: "servings" }, from, back: tab });
  }

  function prefill(s: SavedFood) {
    const draft = draftFromSaved(s);
    if (draft) {
      openRecipe(draft, "saved");
      return;
    }
    setValues(macrosToValues(s));
    setName(s.label);
    setServing(s.serving ?? "");
    setPrefillId(s.id);
    setField("kcal");
    setTab("quick");
  }

  const quick = macroNumbers(values);
  const quickKcal = quick.kcal > 0 ? quick.kcal : macroKcal(quick);
  const canQuick = quickKcal > 0;

  async function quickAdd() {
    if (!canQuick) return;
    const ok = await log({ label: name.trim() || "Quick add", kcal: quickKcal, proteinG: quick.proteinG, fatG: quick.fatG, carbsG: quick.carbsG, serving: serving.trim() || undefined, method: prefillId ? "saved" : "quick" }, prefillId);
    if (ok) {
      setValues(EMPTY_MACROS);
      setName("");
      setServing("");
      setPrefillId(undefined);
      setField("kcal");
    }
  }

  async function logMany(foods: FoodInput[]) {
    setBusy(true);
    setError(null);
    let failed: string | null = null;
    for (const f of foods) {
      const r = await onLog({ ...f, time });
      if (!r.ok) failed = r.error;
    }
    setBusy(false);
    if (failed) {
      setError(failed);
      return false;
    }
    setToast(`Logged ${foods.length} ${foods.length === 1 ? "food" : "foods"} · ${n(foods.reduce((s, f) => s + f.kcal, 0))} kcal`);
    return true;
  }

  const describe = useDescribe({ one: (f) => log(f), many: logMany, makeRecipe: (draft, eating) => openRecipe(draft, "describe", eating) });

  /** Leaves Create Recipe for the tab it came from; a recipe made from Describe clears it once saved. */
  function closeRecipe(saved: boolean) {
    if (!recipeView) return;
    if (saved && recipeView.from === "describe") describe.reset();
    setTab(saved && recipeView.from !== "saved" ? (recipeView.from === "describe" ? "describe" : "saved") : recipeView.back);
    setRecipeView(null);
  }

  async function saveRecipeOnly() {
    if (!recipeView) return;
    setBusy(true);
    setError(null);
    const r = await onSaveRecipe(recipeView.draft);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setToast(`Saved ${recipeView.draft.name.trim()} to your recipes`);
    closeRecipe(true);
  }

  async function saveRecipeAndLog() {
    if (!recipeView) return;
    const { draft, eating } = recipeView;
    setBusy(true);
    setError(null);
    const saved = await onSaveRecipe(draft);
    if (!saved.ok) {
      setBusy(false);
      setError(saved.error);
      return;
    }
    const ok = await log(
      {
        label: draft.name.trim(),
        ...eatingMacros(draft, eating),
        serving: eatenLabel(draft, eating.amount, eating.unit),
        method: recipeView.from === "describe" ? "ai_text" : "saved",
        confidence: recipeConfidence(draft.ingredients),
        recipe: toSavedRecipe(draft),
      },
      saved.id
    );
    if (ok) closeRecipe(true);
  }

  const header = (
    <div className="flex items-center justify-between gap-2 pb-2 pt-2">
      <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="flex items-center gap-2">
        <TimeChip value={time} onChange={setTime} compact />
        <span className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ background: "var(--surface-raised)", color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }} aria-label={targetKcal ? `${n(consumedKcal)} of ${n(targetKcal)} kcal` : `${n(consumedKcal)} kcal`}>
          <span style={{ color: "var(--text)" }}>{n(consumedKcal)}</span>
          {targetKcal ? ` / ${n(targetKcal)}` : " kcal"}
        </span>
      </div>
      {/* One close (B2): minimise did the same thing. The spacer keeps the chips centred. */}
      <span className="h-9 w-9" aria-hidden />
    </div>
  );

  const footer =
    tab === "quick" ? (
      <div className="flex flex-col gap-2">
        <ErrorLine text={error} />
        <PrimaryButton onClick={quickAdd} disabled={!canQuick || busy}>
          Quick add
        </PrimaryButton>
      </div>
    ) : tab === "describe" ? (
      <div className="flex flex-col gap-2">
        <ErrorLine text={error} />
        <DescribeFooter d={describe} busy={busy} />
      </div>
    ) : error ? (
      <ErrorLine text={error} />
    ) : undefined;

  const plus = (onClick: () => void, label: string) => <PlusButton onClick={onClick} label={label} disabled={busy} />;
  const foodRow = (f: SavedFood, trailing: React.ReactNode) => <SavedFoodRow key={f.id} food={f} onPrefill={prefill} trailing={trailing} />;

  if (recipeView) {
    const title = recipeView.from === "saved" ? "Edit recipe" : "Create recipe";
    return (
      <Sheet
        open
        onClose={onClose}
        full
        ariaLabel={title}
        header={<RecipeHeader title={title} onBack={() => closeRecipe(false)} time={time} onTime={setTime} />}
        footer={<RecipeFooter draft={recipeView.draft} eating={recipeView.eating} busy={busy} error={error} onSave={() => void saveRecipeOnly()} onSaveAndLog={() => void saveRecipeAndLog()} />}
      >
        <RecipeEditor draft={recipeView.draft} onChange={(draft) => setRecipeView({ ...recipeView, draft })} eating={recipeView.eating} onEating={(eating) => setRecipeView({ ...recipeView, eating })} consumedKcal={consumedKcal} targetKcal={targetKcal} />
      </Sheet>
    );
  }

  return (
    <Sheet open onClose={onClose} header={header} full ariaLabel="Log food" footer={footer}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-1 rounded-[12px] p-1" style={{ background: "var(--surface-raised)" }} role="tablist" aria-label="Logger">
          {TABS.map((t) => {
            const selected = t.id === tab;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={selected} onClick={() => setTab(t.id)} className="h-[32px] rounded-[9px] text-[12px] font-medium transition-colors" style={{ background: selected ? "var(--primary)" : "transparent", color: selected ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="min-h-[16px] text-[12px]" style={{ color: "var(--status-good)" }} aria-live="polite">
          {toast ?? " "}
        </p>

        {tab === "search" && <FoodSearch hour={hour} today={today} tz={tz} entries={entries} saved={saved} busy={busy} onLog={log} onPrefill={prefill} />}

        {tab === "quick" && (
          <div className="flex flex-col gap-3">
            <MacroPad values={values} field={field} onField={setField} onChange={setValues} />
            <div className="flex gap-2">
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className={`${inputClass} min-w-0 flex-1`} style={inputStyle} aria-label="Name" autoComplete="off" />
              <input type="text" value={serving} onChange={(e) => setServing(e.target.value)} placeholder="Serving" className={`${inputClass} w-[120px] shrink-0`} style={inputStyle} aria-label="Serving" autoComplete="off" />
            </div>
          </div>
        )}

        {tab === "describe" && <DescribePanel d={describe} consumedKcal={consumedKcal} targetKcal={targetKcal} />}

        {tab === "saved" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved foods" className={`${inputClass} min-w-0 flex-1`} style={inputStyle} aria-label="Search saved foods" autoComplete="off" />
              <button type="button" onClick={() => openRecipe(emptyDraft(), "new")} className="h-11 shrink-0 rounded-[12px] px-3 text-[13px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
                New recipe
              </button>
              <button type="button" onClick={() => setManaging((m) => !m)} className="h-11 shrink-0 rounded-[12px] px-3 text-[13px] font-medium" style={{ background: "var(--surface-raised)", color: "var(--text-secondary)" }} aria-pressed={managing}>
                {managing ? "Done" : "Edit"}
              </button>
            </div>
            {savedList.length === 0 ? (
              <p className="py-4 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                {saved.length === 0 ? "No saved foods yet. Everything you log is kept here for next time." : "No match."}
              </p>
            ) : (
              <ul className="flex flex-col">
                {savedList.map((s) =>
                  foodRow(
                    s,
                    managing ? (
                      <button type="button" onClick={() => void onRemoveSaved(s.id)} className="h-9 shrink-0 rounded-full px-3 text-[12px] font-medium" style={{ background: "var(--surface-raised)", color: "var(--status-attention)" }} aria-label={`Remove ${s.label} from saved`}>
                        Remove
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => void onToggleFavourite(s.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ color: s.favourite ? "var(--text)" : "var(--border-strong)" }} aria-label={s.favourite ? `Unstar ${s.label}` : `Star ${s.label}`} aria-pressed={Boolean(s.favourite)}>
                          <svg viewBox="0 0 24 24" fill={s.favourite ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                            <path d="M12 3.5l2.6 5.5 6 .7-4.4 4.1 1.2 5.9L12 16.8l-5.4 2.9 1.2-5.9L3.4 9.7l6-.7z" />
                          </svg>
                        </button>
                        {plus(() => logSaved(s), `Log ${s.label}`)}
                      </>
                    )
                  )
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </Sheet>
  );
}
