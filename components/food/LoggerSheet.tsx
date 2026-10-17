"use client";

import { useEffect, useMemo, useState } from "react";
import Sheet from "@/components/ui/Sheet";
import MacroPad, { EMPTY_MACROS, macroNumbers, macrosToValues, type MacroField, type MacroValues } from "@/components/food/MacroPad";
import TimeChip from "@/components/food/TimeChip";
import { ErrorLine, PrimaryButton } from "@/components/physique/ui";
import { hourLabel, localClock, macroKcal } from "@/lib/physique/food/timeline";
import { filterSaved } from "@/lib/physique/food/goTos";
import FoodSearch from "@/components/food/FoodSearch";
import SavedFoodRow, { PlusButton } from "@/components/food/SavedFoodRow";
import RecipeCard from "@/components/food/RecipeCard";
import { eatenMacros, recipeConfidence, servingLabel, type Recipe } from "@/lib/food/recipe";
import { getClientId } from "@/lib/ui/clientId";
import type { FoodInput } from "@/lib/physique/io/foodData";
import type { SaveResult } from "@/lib/physique/io/bodyData";
import type { FoodParseResponse, ParsedFoodItem } from "@/lib/physique/food/parseSchema";
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
};

const TABS: ReadonlyArray<{ id: LoggerTab; label: string }> = [
  { id: "search", label: "Search" },
  { id: "quick", label: "Quick add" },
  { id: "describe", label: "Describe" },
  { id: "saved", label: "Saved" },
];

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const inputClass = "h-11 rounded-[12px] px-3 text-[15px] outline-none focus:ring-1";
const inputStyle = { background: "#1d1d20", color: "#f2f2f0", border: "1px solid #2a2a2e" };

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

function Inner({ state, onClose, date, today, tz, consumedKcal, targetKcal, entries, saved, onLog, onToggleFavourite, onRemoveSaved }: Props & { state: NonNullable<LoggerOpen> }) {
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

  // Describe
  const [text, setText] = useState("");
  const [items, setItems] = useState<ParsedFoodItem[] | null>(null);
  const [describeStatus, setDescribeStatus] = useState<"idle" | "loading" | "error" | "unavailable" | "limit">("idle");
  const [editing, setEditing] = useState<number | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [eating, setEating] = useState(1);

  // Saved
  const [query, setQuery] = useState("");
  const [managing, setManaging] = useState(false);

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
    void log({ label: s.label, kcal: s.kcal, proteinG: s.proteinG, fatG: s.fatG, carbsG: s.carbsG, serving: s.serving, method: "saved" }, s.id);
  }

  function prefill(s: SavedFood) {
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

  async function describe() {
    const t = text.trim();
    if (!t) return;
    setDescribeStatus("loading");
    setItems(null);
    setRecipe(null);
    try {
      const res = await fetch("/api/food/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: getClientId(), text: t }) });
      if (res.status === 503) {
        setDescribeStatus("unavailable");
        return;
      }
      if (res.status === 429) {
        setDescribeStatus("limit");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const json = (await res.json()) as Partial<FoodParseResponse>;
      if (json.recipe && json.recipe.ingredients.length > 0) {
        setRecipe(json.recipe);
        setEating(1);
      } else {
        setItems(json.items ?? []);
      }
      setDescribeStatus("idle");
    } catch {
      setDescribeStatus("error");
    }
  }

  async function logRecipe() {
    if (!recipe || recipe.ingredients.length === 0) return;
    const m = eatenMacros(recipe.ingredients, recipe.servings, eating);
    const ok = await log({
      label: recipe.name.trim() || "Recipe",
      ...m,
      serving: servingLabel(eating, recipe.servings),
      method: "ai_text",
      confidence: recipeConfidence(recipe.ingredients),
      recipe: { servings: recipe.servings, ingredients: recipe.ingredients },
    });
    if (ok) {
      setRecipe(null);
      setText("");
    }
  }

  async function logItems() {
    if (!items || items.length === 0) return;
    setBusy(true);
    let failed: string | null = null;
    for (const i of items) {
      const r = await onLog({ label: i.label, kcal: i.kcal, proteinG: i.proteinG, fatG: i.fatG, carbsG: i.carbsG, serving: i.serving || undefined, method: "ai_text", confidence: i.confidence, time });
      if (!r.ok) failed = r.error;
    }
    setBusy(false);
    if (failed) setError(failed);
    else {
      setToast(`Logged ${items.length} item${items.length === 1 ? "" : "s"} · ${n(items.reduce((s, i) => s + i.kcal, 0))} kcal`);
      setItems(null);
      setText("");
    }
  }

  const header = (
    <div className="flex items-center justify-between gap-2 pb-2 pt-2">
      <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "#a3a3a8" }} aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      <div className="flex items-center gap-2">
        <TimeChip value={time} onChange={setTime} compact />
        <span className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ background: "#1d1d20", color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }} aria-label={targetKcal ? `${n(consumedKcal)} of ${n(targetKcal)} kcal` : `${n(consumedKcal)} kcal`}>
          <span style={{ color: "#f2f2f0" }}>{n(consumedKcal)}</span>
          {targetKcal ? ` / ${n(targetKcal)}` : " kcal"}
        </span>
      </div>
      <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "#a3a3a8" }} aria-label="Minimise">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
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
    ) : tab === "describe" && recipe && recipe.ingredients.length > 0 ? (
      <div className="flex flex-col gap-2">
        <ErrorLine text={error} />
        <PrimaryButton onClick={logRecipe} disabled={busy}>
          Log {Number.isInteger(eating) ? eating : eating.toFixed(1)} {eating === 1 ? "serving" : "servings"} · {n(eatenMacros(recipe.ingredients, recipe.servings, eating).kcal)} kcal
        </PrimaryButton>
      </div>
    ) : tab === "describe" && items && items.length > 0 ? (
      <div className="flex flex-col gap-2">
        <ErrorLine text={error} />
        <PrimaryButton onClick={logItems} disabled={busy}>
          Log {items.length} item{items.length === 1 ? "" : "s"} · {n(items.reduce((s, i) => s + i.kcal, 0))} kcal
        </PrimaryButton>
      </div>
    ) : error ? (
      <ErrorLine text={error} />
    ) : undefined;

  const plus = (onClick: () => void, label: string) => <PlusButton onClick={onClick} label={label} disabled={busy} />;
  const foodRow = (f: SavedFood, trailing: React.ReactNode) => <SavedFoodRow key={f.id} food={f} onPrefill={prefill} trailing={trailing} />;

  return (
    <Sheet open onClose={onClose} header={header} full ariaLabel="Log food" footer={footer}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-4 gap-1 rounded-[12px] p-1" style={{ background: "#1d1d20" }} role="tablist" aria-label="Logger">
          {TABS.map((t) => {
            const selected = t.id === tab;
            return (
              <button key={t.id} type="button" role="tab" aria-selected={selected} onClick={() => setTab(t.id)} className="h-[32px] rounded-[9px] text-[12px] font-medium transition-colors" style={{ background: selected ? "#f2f2f0" : "transparent", color: selected ? "#0a0a0b" : "#a3a3a8" }}>
                {t.label}
              </button>
            );
          })}
        </div>
        <p className="min-h-[16px] text-[12px]" style={{ color: "#00e5b0" }} aria-live="polite">
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

        {tab === "describe" && (
          <div className="flex flex-col gap-3">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What did you eat? 2 eggs on toast with butter. Or a recipe with amounts and how many it makes. Or an order: chicken katsu curry from Wagamama"
              rows={4}
              maxLength={2000}
              className="w-full resize-none rounded-[12px] px-3 py-2.5 text-[15px] outline-none focus:ring-1"
              style={inputStyle}
              aria-label="Describe what you ate"
            />
            <PrimaryButton onClick={describe} disabled={!text.trim() || describeStatus === "loading"}>
              {describeStatus === "loading" ? "Estimating…" : "Estimate"}
            </PrimaryButton>
            {describeStatus === "unavailable" && (
              <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
                Describe needs the AI key on the server. Add ANTHROPIC_API_KEY to the deployment to use it. Quick add works without it.
              </p>
            )}
            {describeStatus === "limit" && (
              <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
                Daily limit reached for AI estimates. Quick add still works.
              </p>
            )}
            {describeStatus === "error" && (
              <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
                Couldn&apos;t estimate that. Try again, or quick add it.
              </p>
            )}
            {items && items.length === 0 && (
              <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
                Nothing recognisable in that. Try naming the foods.
              </p>
            )}
            {recipe && recipe.ingredients.length > 0 && <RecipeCard recipe={recipe} onChange={setRecipe} eating={eating} onEating={setEating} />}
            {recipe && recipe.ingredients.length === 0 && (
              <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
                Every ingredient was dropped. Describe it again or quick add the total.
              </p>
            )}
            {items && items.length > 0 && (
              <ul className="flex flex-col gap-1.5" aria-label="Estimated items">
                {items.map((i, idx) => (
                  <li key={idx} className="rounded-[12px]" style={{ background: "#141416", border: "1px solid #2a2a2e" }}>
                    <div className="flex items-center gap-2 px-3 py-2.5">
                      <button type="button" onClick={() => setEditing(editing === idx ? null : idx)} className="flex min-w-0 flex-1 flex-col text-left" aria-label={`${i.label}, ${n(i.kcal)} kcal. Adjust`}>
                        <span className="truncate text-[15px]" style={{ color: "#f2f2f0" }}>
                          {i.label}
                        </span>
                        <span className="truncate text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                          {n(i.kcal)} kcal · {i.proteinG}P {i.fatG}F {i.carbsG}C{i.serving ? ` · ${i.serving}` : ""}
                          {i.confidence !== "high" ? ` · ${i.confidence === "low" ? "rough guess" : "estimate"}` : ""}
                        </span>
                      </button>
                      <button type="button" onClick={() => setItems(items.filter((_, j) => j !== idx))} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "#1d1d20", color: "#a3a3a8" }} aria-label={`Drop ${i.label}`}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    </div>
                    {editing === idx && (
                      <div className="px-3 pb-3">
                        <ItemEditor item={i} onChange={(next) => setItems(items.map((x, j) => (j === idx ? next : x)))} />
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {tab === "saved" && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved foods" className={`${inputClass} min-w-0 flex-1`} style={inputStyle} aria-label="Search saved foods" autoComplete="off" />
              <button type="button" onClick={() => setManaging((m) => !m)} className="h-11 shrink-0 rounded-[12px] px-3 text-[13px] font-medium" style={{ background: "#1d1d20", color: "#a3a3a8" }} aria-pressed={managing}>
                {managing ? "Done" : "Edit"}
              </button>
            </div>
            {savedList.length === 0 ? (
              <p className="py-4 text-[13px]" style={{ color: "#6f6f76" }}>
                {saved.length === 0 ? "No saved foods yet. Anything you quick add is kept here." : "No match."}
              </p>
            ) : (
              <ul className="flex flex-col">
                {savedList.map((s) =>
                  foodRow(
                    s,
                    managing ? (
                      <button type="button" onClick={() => void onRemoveSaved(s.id)} className="h-9 shrink-0 rounded-full px-3 text-[12px] font-medium" style={{ background: "#1d1d20", color: "#f26d7d" }} aria-label={`Remove ${s.label} from saved`}>
                        Remove
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => void onToggleFavourite(s.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ color: s.favourite ? "#f2f2f0" : "#3a3a40" }} aria-label={s.favourite ? `Unstar ${s.label}` : `Star ${s.label}`} aria-pressed={Boolean(s.favourite)}>
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

/** Inline editor for one Describe row: macros via the pad, serving as text. */
function ItemEditor({ item, onChange }: { item: ParsedFoodItem; onChange: (next: ParsedFoodItem) => void }) {
  const [field, setField] = useState<MacroField>("kcal");
  const values = macrosToValues(item);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input type="text" value={item.label} onChange={(e) => onChange({ ...item, label: e.target.value })} className={`${inputClass} min-w-0 flex-1`} style={inputStyle} aria-label="Name" autoComplete="off" />
        <input type="text" value={item.serving} onChange={(e) => onChange({ ...item, serving: e.target.value })} placeholder="Serving" className={`${inputClass} w-[120px] shrink-0`} style={inputStyle} aria-label="Serving" autoComplete="off" />
      </div>
      <MacroPad values={values} field={field} onField={setField} onChange={(v) => onChange({ ...item, ...macroNumbers(v) })} />
    </div>
  );
}
