"use client";

import { useEffect, useRef, useState } from "react";
import MacroPad, { macroNumbers, macrosToValues, type MacroField } from "@/components/food/MacroPad";
import PlateRow, { DrawerActions, GramsField, RowDrawer, Stepper } from "@/components/food/PlateRow";
import RecipePlate from "@/components/food/RecipePlate";
import { CARBS_COLOR, FAT_COLOR, PROTEIN_COLOR } from "@/components/food/EnergyCharts";
import { PrimaryButton, StatusDot } from "@/components/physique/ui";
import { MAX_DESCRIBE_CHARS, compactDescription, describeErrorText, errorFromStatus, modeFor } from "@/lib/food/describe";
import { AMOUNT_CHOICES, AMOUNT_STEP, GRAMS_STEP, MAX_AMOUNT, MIN_AMOUNT, amountPill, choiceLabel, formatAmount, plateItemGrams, plateItemMacros, plateServing, plateTotals, sourceLine, toPlate, withAmount, withGrams, withMacros, type PlateItem } from "@/lib/food/plate";
import { eatenMacros, estimateCount, recipeConfidence, servingLabel, type Recipe } from "@/lib/food/recipe";
import { draftFromPlate, draftFromRecipe, type RecipeDraft } from "@/lib/food/recipeDraft";
import { getClientId } from "@/lib/ui/clientId";
import { FOOD_PARSE_ERRORS, type FoodParseError, type FoodParseResponse, type ParseKind, type ParseMode } from "@/lib/physique/food/parseSchema";
import type { Macros } from "@/lib/food/types";
import type { FoodInput } from "@/lib/physique/io/foodData";

/** Past the route's own 60 s limit, so the server's answer wins when there is one. OURS. */
const CLIENT_TIMEOUT_MS = 65_000;

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const servingsText = (v: number) => `${formatAmount(v)} ${v === 1 ? "serving" : "servings"}`;

export type DescribeLoggers = {
  /** Logs one food; true when it was saved. */
  one: (food: FoodInput) => Promise<boolean>;
  /** Logs several foods at the sheet's time; true when all were saved. */
  many: (foods: FoodInput[]) => Promise<boolean>;
  /** Opens Create Recipe with these ingredients in, eating this many servings. */
  makeRecipe: (draft: RecipeDraft, eatingServings: number) => void;
};

type Phase = "input" | "loading" | "result";

/**
 * State for Describe (F5, after MacroFactor's AI Describe): one box for a
 * meal, a takeaway order or a pasted recipe, "Find foods", then a plate to
 * check and adjust before anything is logged. The text is sent as typed,
 * except that a recipe page over the limit loses its method first.
 */
export function useDescribe(loggers: DescribeLoggers) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("input");
  const [error, setError] = useState<FoodParseError | null>(null);
  const [sent, setSent] = useState("");
  const [mode, setMode] = useState<ParseMode>("auto");
  const [methodDropped, setMethodDropped] = useState(false);
  const [kind, setKind] = useState<ParseKind>("meal");
  const [plate, setPlate] = useState<PlateItem[]>([]);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [eating, setEating] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort("closed"), []);

  function fail(code: FoodParseError) {
    setError(code);
    setPhase("input");
  }

  async function find(chosen?: ParseMode) {
    const compact = compactDescription(text);
    if (compact === null) {
      fail("too_long");
      return;
    }
    if (!compact.text) return;
    const m = modeFor(compact.text, chosen);
    abortRef.current?.abort("superseded");
    const ac = new AbortController();
    abortRef.current = ac;
    const timer = setTimeout(() => ac.abort("timeout"), CLIENT_TIMEOUT_MS);
    setPhase("loading");
    setError(null);
    setSent(compact.text);
    setMode(m);
    setMethodDropped(compact.methodDropped);
    try {
      const res = await fetch("/api/food/parse", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ client_id: getClientId(), text: compact.text, mode: m }), signal: ac.signal });
      const json = (await res.json().catch(() => null)) as (Partial<FoodParseResponse> & { error?: string }) | null;
      if (ac.signal.aborted) return;
      if (!res.ok || !json) {
        const code = json?.error && (FOOD_PARSE_ERRORS as readonly string[]).includes(json.error) ? (json.error as FoodParseError) : errorFromStatus(res.status);
        fail(code);
        return;
      }
      if (json.recipe && json.recipe.ingredients.length > 0) {
        setKind("recipe");
        setRecipe(json.recipe);
        setEating(1);
        setPlate([]);
      } else if (json.items && json.items.length > 0) {
        setKind(json.kind ?? "meal");
        setPlate(toPlate(json.items));
        setRecipe(null);
      } else {
        fail("empty");
        return;
      }
      setPhase("result");
    } catch {
      const reason: unknown = ac.signal.reason;
      if (ac.signal.aborted && reason !== "timeout") return;
      fail(reason === "timeout" ? "timeout" : typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "error");
    } finally {
      clearTimeout(timer);
    }
  }

  /** Back to the text, as typed; a request in flight is dropped. */
  function edit() {
    abortRef.current?.abort("superseded");
    setPhase("input");
    setError(null);
  }

  function reset() {
    setText("");
    setPhase("input");
    setPlate([]);
    setRecipe(null);
    setError(null);
  }

  async function logAll() {
    if (kind === "recipe" && recipe && recipe.ingredients.length > 0) {
      const ok = await loggers.one({
        label: recipe.name.trim() || "Recipe",
        ...eatenMacros(recipe.ingredients, recipe.servings, eating),
        serving: servingLabel(eating, recipe.servings),
        method: "ai_text",
        confidence: recipeConfidence(recipe.ingredients),
        recipe: { servings: recipe.servings, ingredients: recipe.ingredients },
      });
      if (ok) reset();
      return;
    }
    if (plate.length === 0) return;
    const ok = await loggers.many(plate.map((p) => ({ label: p.label.trim() || "Food", ...plateItemMacros(p), serving: plateServing(p), method: "ai_text", confidence: p.confidence })));
    if (ok) reset();
  }

  /** "Make recipe": the plate's foods, or the recipe read, into Create Recipe. Nothing is asked of the model again. */
  function makeRecipe() {
    if (kind === "recipe" && recipe) loggers.makeRecipe(draftFromRecipe(recipe), eating);
    else if (plate.length > 0) loggers.makeRecipe(draftFromPlate(plate), 1);
  }

  const total: Macros = kind === "recipe" && recipe ? eatenMacros(recipe.ingredients, recipe.servings, eating) : plateTotals(plate);
  const count = kind === "recipe" ? (recipe?.ingredients.length ?? 0) : plate.length;

  return { text, setText, phase, error, sent, mode, methodDropped, kind, plate, setPlate, recipe, setRecipe, eating, setEating, total, count, find, edit, logAll, makeRecipe, reset };
}

export type DescribeState = ReturnType<typeof useDescribe>;

/** The sheet's footer on Describe: "Find foods" while writing, "Log …" once there is a plate. */
export function DescribeFooter({ d, busy }: { d: DescribeState; busy: boolean }) {
  if (d.phase === "result") {
    if (d.count === 0) return <PrimaryButton disabled>Nothing on the plate</PrimaryButton>;
    const what = d.kind === "recipe" ? servingsText(d.eating) : `${d.count} ${d.count === 1 ? "food" : "foods"}`;
    return (
      <PrimaryButton onClick={() => void d.logAll()} disabled={busy}>
        Log {what} · {n(d.total.kcal)} kcal
      </PrimaryButton>
    );
  }
  return (
    <PrimaryButton onClick={() => void d.find()} disabled={!d.text.trim() || d.phase === "loading"}>
      {d.phase === "loading" ? "Reading…" : "Find foods"}
    </PrimaryButton>
  );
}

/** The Describe tab's content: the box, the reading state, or the plate. */
export default function DescribePanel({ d, consumedKcal, targetKcal }: { d: DescribeState; consumedKcal: number; targetKcal: number | null }) {
  if (d.phase === "input") return <DescribeInput d={d} />;
  return (
    <div className="flex flex-col gap-3">
      <SentLine text={d.sent} onEdit={d.edit} label={d.phase === "loading" ? "Cancel" : "Edit"} />
      {d.phase === "loading" ? <Reading recipe={d.mode === "recipe"} /> : <Result d={d} consumedKcal={consumedKcal} targetKcal={targetKcal} />}
    </div>
  );
}

function DescribeInput({ d }: { d: DescribeState }) {
  const len = d.text.length;
  const over = len > MAX_DESCRIBE_CHARS;
  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <textarea
          value={d.text}
          onChange={(e) => d.setText(e.target.value)}
          placeholder={"2 eggs on toast with butter, a flat white\nChicken katsu curry from Wagamama\nOr paste a recipe, method and all"}
          rows={8}
          className="block w-full resize-none rounded-[14px] py-3 pl-3.5 pr-11 text-[15px] leading-relaxed outline-none focus:ring-1"
          style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
          aria-label="Describe what you ate, or paste a recipe"
          aria-describedby="describe-hint"
        />
        {d.text && (
          <button type="button" onClick={() => d.setText("")} className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full" style={{ background: "var(--surface-raised)", color: "var(--text-secondary)" }} aria-label="Clear the text">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 px-1 text-[11px]">
        <span id="describe-hint" style={{ color: "var(--text-tertiary)" }}>
          Meals, takeaway orders and recipes. Numbers come from the UK food database.
        </span>
        <span className="shrink-0" style={{ color: over ? "var(--status-watch)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
          {len.toLocaleString("en-GB")} / {MAX_DESCRIBE_CHARS.toLocaleString("en-GB")}
        </span>
      </div>
      {d.error && (
        <p role="alert" className="flex items-start gap-2 rounded-[12px] px-3 py-2.5 text-[13px] leading-snug" style={{ background: "var(--surface)", color: "var(--text-secondary)" }}>
          <span className="mt-[5px]">
            <StatusDot color="var(--status-watch)" />
          </span>
          {describeErrorText(d.error)}
        </p>
      )}
    </div>
  );
}

/** The text that was read, on one line, with a way back to it. */
function SentLine({ text, onEdit, label }: { text: string; onEdit: () => void; label: string }) {
  const first = text.split("\n").find((l) => l.trim()) ?? text;
  return (
    <div className="flex items-center gap-2 rounded-[12px] py-1.5 pl-3 pr-1.5" style={{ background: "var(--surface)" }}>
      <span className="min-w-0 flex-1 truncate text-[13px]" style={{ color: "var(--text-secondary)" }}>
        {first}
      </span>
      <button type="button" onClick={onEdit} className="h-8 shrink-0 rounded-full px-3 text-[13px] font-semibold" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
        {label}
      </button>
    </div>
  );
}

function PlateHeading({ title, value, action }: { title: string; value?: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1 pt-1">
      <h3 className="flex items-baseline gap-2">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </span>
        {value && (
          <span className="text-[15px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {value}
          </span>
        )}
      </h3>
      {action && (
        <button type="button" onClick={action.onClick} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold transition-colors active:bg-[var(--surface-pressed)]" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
            <path d="M5 17a3 3 0 0 1 3-3h11" />
            <path d="M12 7v4M10 9h4" />
          </svg>
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Skeleton rows while the text is read (MacroFactor shows its plate filling in). */
function Reading({ recipe }: { recipe: boolean }) {
  const bar = (w: string, h = "h-3") => <span className={`block ${h} ${w} rounded-full motion-safe:animate-pulse`} style={{ background: "var(--surface-raised)" }} />;
  return (
    <>
      <PlateHeading title={recipe ? "Reading the recipe" : "Finding foods"} />
      <ul className="flex flex-col overflow-hidden rounded-[14px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }} aria-hidden>
        {[0.62, 0.48, 0.55].map((w, i) => (
          <li key={i} className="flex items-center gap-3 px-3.5 py-3.5">
            <span className="flex flex-1 flex-col gap-2">
              {bar("", "h-3.5")}
              <span style={{ width: `${w * 100}%` }}>{bar("w-full")}</span>
            </span>
            <span className="h-[42px] w-[64px] rounded-[10px] motion-safe:animate-pulse" style={{ background: "var(--surface-raised)" }} />
          </li>
        ))}
      </ul>
      <p className="px-1 text-[12px]" style={{ color: "var(--text-tertiary)" }} aria-live="polite">
        {recipe ? "Matching each ingredient to the UK food database. A long recipe takes up to half a minute." : "Matching each food to the UK food database. This takes a few seconds."}
      </p>
    </>
  );
}

function Result({ d, consumedKcal, targetKcal }: { d: DescribeState; consumedKcal: number; targetKcal: number | null }) {
  const isRecipe = d.kind === "recipe" && d.recipe;
  const estimates = isRecipe && d.recipe ? estimateCount(d.recipe.ingredients) : d.plate.filter((p) => !p.matched).length;
  const note = isRecipe
    ? estimates === 0
      ? "Every ingredient matched the UK food database. Check the grams; logging it keeps one serving under Saved."
      : `${estimates} ${estimates === 1 ? "ingredient is an estimate" : "ingredients are estimates"}, in amber; the rest come from the UK food database. Check the grams; logging it keeps one serving under Saved.`
    : estimates === 0
      ? "Every food matched the UK food database. Check the amounts before logging."
      : `${estimates === d.plate.length ? "These are estimates" : `${estimates} of ${d.plate.length} are estimates, in amber; the rest come from the UK food database`}. Check the amounts before logging.`;
  return (
    <>
      <PlateHeading title={isRecipe ? "Recipe" : "Plate"} value={`${n(d.total.kcal)} kcal`} action={d.count > 0 ? { label: "Make recipe", onClick: d.makeRecipe } : undefined} />
      {isRecipe && d.recipe ? <RecipePlate recipe={d.recipe} onChange={d.setRecipe} eating={d.eating} onEating={d.setEating} /> : <MealPlate items={d.plate} onChange={d.setPlate} />}
      <p className="px-1 text-[11px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
        {note}
        {d.methodDropped ? " The method was left out to fit; it does not change the numbers." : ""}
      </p>
      {d.count > 0 && <DayAfter consumed={consumedKcal} plate={d.total} target={targetKcal} />}
      {isRecipe && (
        <button type="button" onClick={() => void d.find("meal")} className="h-10 self-center rounded-full px-4 text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
          Log it as separate foods instead
        </button>
      )}
    </>
  );
}

/** The plate for a meal or an order: one row per food, its amount in the pill. */
function MealPlate({ items, onChange }: { items: PlateItem[]; onChange: (next: PlateItem[]) => void }) {
  const [open, setOpen] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  if (items.length === 0) {
    return (
      <p className="rounded-[14px] px-3.5 py-4 text-[13px]" style={{ background: "var(--surface)", color: "var(--text-secondary)" }}>
        Everything was removed. Edit the text to read it again.
      </p>
    );
  }
  const set = (idx: number, next: PlateItem) => onChange(items.map((x, j) => (j === idx ? next : x)));
  return (
    <ul className="flex flex-col overflow-hidden rounded-[14px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }} aria-label="Foods found">
      {items.map((p, idx) => {
        const m = plateItemMacros(p);
        const g = plateItemGrams(p);
        const isOpen = open === idx;
        return (
          <PlateRow
            key={idx}
            title={p.label}
            line={`${n(m.kcal)} kcal · ${m.proteinG}P ${m.fatG}F ${m.carbsG}C${p.serving && g != null ? ` · ${p.amount === 1 ? p.serving : `${formatAmount(p.amount)} × ${p.serving}`}` : ""}`}
            source={sourceLine(p)}
            pill={amountPill(p)}
            open={isOpen}
            onToggle={() => {
              setOpen(isOpen ? null : idx);
              setEditing(false);
            }}
            ariaLabel={`${p.label}, ${amountPill(p).value} ${amountPill(p).unit}, ${n(m.kcal)} kcal. Adjust`}
          >
            <RowDrawer>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                  Amount
                </span>
                {g != null ? (
                  <Stepper label={`${p.label}, grams`} onLess={() => set(idx, withGrams(p, g - GRAMS_STEP))} onMore={() => set(idx, withGrams(p, g + GRAMS_STEP))} lessDisabled={g <= GRAMS_STEP}>
                    <GramsField grams={g} onChange={(v) => set(idx, withGrams(p, v))} label={`${p.label}, grams`} />
                  </Stepper>
                ) : (
                  <Stepper label={`${p.label}, portions`} onLess={() => set(idx, withAmount(p, p.amount - AMOUNT_STEP))} onMore={() => set(idx, withAmount(p, p.amount + AMOUNT_STEP))} lessDisabled={p.amount <= MIN_AMOUNT} moreDisabled={p.amount >= MAX_AMOUNT}>
                    <span className="min-w-[68px] text-center text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
                      {formatAmount(p.amount)} ×
                    </span>
                  </Stepper>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-4 gap-1.5" role="group" aria-label="Portions of what you described">
                  {AMOUNT_CHOICES.map((a) => {
                    const selected = Math.abs(p.amount - a) < 0.001;
                    return (
                      <button key={a} type="button" aria-pressed={selected} onClick={() => set(idx, withAmount(p, a))} className="h-8 rounded-full text-[13px] font-semibold transition-colors" style={{ background: selected ? "var(--primary)" : "var(--surface)", color: selected ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
                        {choiceLabel(a)}
                      </button>
                    );
                  })}
                </div>
                {p.serving && (
                  <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                    Times what you described: {p.serving}
                  </span>
                )}
              </div>
              {editing && <ItemEditor item={p} onChange={(next) => set(idx, next)} />}
              <DrawerActions
                onEdit={() => setEditing((e) => !e)}
                editLabel={editing ? "Done" : "Edit name and macros"}
                onRemove={() => {
                  setOpen(null);
                  setEditing(false);
                  onChange(items.filter((_, j) => j !== idx));
                }}
                removeLabel="Remove"
              />
            </RowDrawer>
          </PlateRow>
        );
      })}
    </ul>
  );
}

const fieldStyle = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" };

/** Name, serving and the macros for one row, typed in; the numbers become the user's. */
function ItemEditor({ item, onChange }: { item: PlateItem; onChange: (next: PlateItem) => void }) {
  const [field, setField] = useState<MacroField>("kcal");
  const now = plateItemMacros(item);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input type="text" value={item.label} onChange={(e) => onChange({ ...item, label: e.target.value })} className="h-10 min-w-0 flex-1 rounded-[10px] px-3 text-[15px] outline-none focus:ring-1" style={fieldStyle} aria-label="Name" autoComplete="off" />
        <input type="text" value={item.serving} onChange={(e) => onChange({ ...item, serving: e.target.value })} placeholder="Serving" className="h-10 w-[112px] shrink-0 rounded-[10px] px-3 text-[15px] outline-none focus:ring-1" style={fieldStyle} aria-label="Serving" autoComplete="off" />
      </div>
      <MacroPad values={macrosToValues(now)} field={field} onField={setField} onChange={(v) => onChange(withMacros(item, macroNumbers(v)))} />
    </div>
  );
}

/** Where the day lands if this is logged: the calories bar with the plate added, and the plate's protein, fat and carbs. */
function DayAfter({ consumed, plate, target }: { consumed: number; plate: Macros; target: number | null }) {
  const after = consumed + plate.kcal;
  const scale = target && target > 0 ? Math.max(target, after) : 0;
  const pct = (v: number) => (scale > 0 ? `${(v / scale) * 100}%` : "0%");
  const macro = (label: string, v: number, color: string) => (
    <span className="flex items-center gap-1.5">
      <StatusDot color={color} />
      <span style={{ color: "var(--text)" }}>{Math.round(v)} g</span>
      <span style={{ color: "var(--text-tertiary)" }}>{label}</span>
    </span>
  );
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] px-3.5 py-3" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Day after logging
        </span>
        <span className="text-[15px] font-semibold" style={{ color: target != null && after > target ? "var(--status-watch)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {n(after)}
          <span className="text-[13px] font-normal" style={{ color: "var(--text-secondary)" }}>
            {target ? ` / ${n(target)} kcal` : " kcal"}
          </span>
        </span>
      </div>
      {scale > 0 && (
        <div className="relative flex h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
          <div className="h-full" style={{ width: pct(consumed), background: "var(--text-tertiary)" }} />
          <div className="h-full" style={{ width: pct(plate.kcal), background: "var(--green)" }} />
          {target && after > target && <div className="absolute inset-y-0 w-[2px]" style={{ left: pct(target), background: "var(--text)" }} />}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
        {macro("protein", plate.proteinG, PROTEIN_COLOR)}
        {macro("fat", plate.fatG, FAT_COLOR)}
        {macro("carbs", plate.carbsG, CARBS_COLOR)}
      </div>
    </div>
  );
}
