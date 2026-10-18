"use client";

import { useEffect, useState, type ReactNode } from "react";
import PlateRow, { DrawerActions, GramsField, RowDrawer, Stepper } from "@/components/food/PlateRow";
import TimeChip from "@/components/food/TimeChip";
import { CARBS_COLOR, FAT_COLOR, KCAL_COLOR, PROTEIN_COLOR } from "@/components/food/EnergyCharts";
import { PrimaryButton, StatusDot } from "@/components/physique/ui";
import { loadCofid, searchFoods } from "@/lib/food/cofid";
import { MAX_INGREDIENT_GRAMS } from "@/lib/food/describe";
import { GRAMS_STEP, formatAmount, sourceLine } from "@/lib/food/plate";
import { EATEN_STEP, MAX_EATEN, MAX_SERVINGS, MIN_EATEN, eatenMacros, estimateCount, ingredientMacros, type RecipeIngredient } from "@/lib/food/recipe";
import { EATEN_GRAMS_STEP, MAX_TOTAL_GRAMS, NEW_INGREDIENT_GRAMS, draftIssue, draftMacros, eatenServings, ingredientGrams, portionPill, servingGrams, type EatenUnit, type RecipeDraft } from "@/lib/food/recipeDraft";
import type { FoodItem, Macros } from "@/lib/food/types";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const servingsText = (v: number) => `${formatAmount(v)} ${v === 1 ? "serving" : "servings"}`;

export type Eating = { amount: number; unit: EatenUnit };

/** Macros for what is being eaten now. */
export function eatingMacros(d: RecipeDraft, e: Eating): Macros {
  return eatenMacros(d.ingredients, d.servings, eatenServings(d, e.amount, e.unit));
}

/** The view's header: back to the logger, the title, and the meal time the log goes in at. */
export function RecipeHeader({ title, onBack, time, onTime }: { title: string; onBack: () => void; time: string; onTime: (t: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 pb-2 pt-2">
      <button type="button" onClick={onBack} className="flex h-9 w-9 items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }} aria-label="Back to the logger">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <h2 className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
        {title}
      </h2>
      <TimeChip value={time} onChange={onTime} compact />
    </div>
  );
}

/** "Save" and "Save and log": MacroFactor's Create and Create & Add. The reason it cannot save yet, when there is one, sits above. */
export function RecipeFooter({ draft, eating, busy, error, onSave, onSaveAndLog }: { draft: RecipeDraft; eating: Eating; busy: boolean; error: string | null; onSave: () => void; onSaveAndLog: () => void }) {
  const issue = draftIssue(draft);
  const kcal = eatingMacros(draft, eating).kcal;
  return (
    <div className="flex flex-col gap-2">
      {(error || issue) && (
        <p role={error ? "alert" : undefined} className="text-[13px]" style={{ color: error ? "var(--status-attention)" : "var(--text-tertiary)" }}>
          {error ?? issue}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={onSave} disabled={busy || issue != null} className="h-[48px] shrink-0 rounded-[12px] px-5 text-[15px] font-semibold transition-colors active:bg-[var(--surface-pressed)] disabled:opacity-40" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
          Save
        </button>
        <div className="min-w-0 flex-1">
          <PrimaryButton onClick={onSaveAndLog} disabled={busy || issue != null || kcal <= 0}>
            Save and log · {n(kcal)} kcal
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: ReadonlyArray<{ id: T; label: string; disabled?: boolean }>; onChange: (v: T) => void; label: string }) {
  return (
    <div className="inline-grid auto-cols-fr grid-flow-col gap-1 rounded-[10px] p-0.5" style={{ background: "var(--surface-raised)" }} role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const selected = o.id === value;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={selected} disabled={o.disabled} onClick={() => onChange(o.id)} className="h-[28px] rounded-[8px] px-3 text-[12px] font-semibold transition-colors disabled:opacity-40" style={{ background: selected ? "var(--primary)" : "transparent", color: selected ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Section({ title, aside, sub, children }: { title: string; aside?: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-label={title}>
      <div className="flex items-end justify-between gap-2 px-1">
        <div className="flex min-w-0 flex-col">
          <h3 className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
            {title}
          </h3>
          {sub && (
            <span className="text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {sub}
            </span>
          )}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

const fieldStyle = { background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" };

/**
 * Create Recipe (F6, after MacroFactor's): the name, how many servings it
 * makes and, if weighed, what the whole recipe weighs cooked; then the
 * ingredients with their raw weight, one serving or the whole recipe in
 * numbers, and how much is being eaten now, in servings or in grams of
 * the cooked recipe. Opened from "Make recipe" on a Describe plate with
 * the ingredients already in, from a saved recipe, or empty.
 */
export default function RecipeEditor({ draft, onChange, eating, onEating, consumedKcal, targetKcal }: { draft: RecipeDraft; onChange: (d: RecipeDraft) => void; eating: Eating; onEating: (e: Eating) => void; consumedKcal: number; targetKcal: number | null }) {
  const [open, setOpen] = useState<number | null>(null);
  const [adding, setAdding] = useState(draft.ingredients.length === 0);
  const [per, setPer] = useState<"serving" | "recipe">("serving");
  const sg = servingGrams(draft);
  const raw = ingredientGrams(draft.ingredients);
  const estimates = estimateCount(draft.ingredients);
  const counted = draft.ingredients.some((i) => i.portion);
  const nutrition = draftMacros(draft, per);
  const now = eatingMacros(draft, eating);

  const setServings = (s: number) => {
    const servings = Math.min(MAX_SERVINGS, Math.max(1, s));
    onChange({ ...draft, servings });
    if (eating.unit === "servings" && eating.amount > servings) onEating({ ...eating, amount: servings });
  };
  const setIngredient = (idx: number, next: RecipeIngredient) => onChange({ ...draft, ingredients: draft.ingredients.map((x, j) => (j === idx ? next : x)) });
  const remove = (idx: number) => {
    setOpen(null);
    onChange({ ...draft, ingredients: draft.ingredients.filter((_, j) => j !== idx) });
  };
  const add = (item: FoodItem) => {
    const name = item.name.split(",").slice(0, 2).join(",").trim();
    onChange({ ...draft, ingredients: [...draft.ingredients, { name, grams: NEW_INGREDIENT_GRAMS, per100: item.per100, source: "cofid", matched: item.name }] });
    setAdding(false);
    setOpen(draft.ingredients.length);
  };

  return (
    <div className="flex flex-col gap-5 pb-2">
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="px-1 text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
            Recipe name
          </span>
          <input type="text" value={draft.name} onChange={(e) => onChange({ ...draft, name: e.target.value })} placeholder="Chicken tikka masala" maxLength={60} className="h-11 rounded-[12px] px-3 text-[16px] font-semibold outline-none focus:ring-1" style={fieldStyle} autoComplete="off" />
        </label>
        <div className="flex flex-col overflow-hidden rounded-[14px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }}>
          <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
            <span className="text-[15px]" style={{ color: "var(--text)" }}>
              Servings it makes
            </span>
            <Stepper onSurface label="Servings it makes" onLess={() => setServings(draft.servings - 1)} onMore={() => setServings(draft.servings + 1)} lessDisabled={draft.servings <= 1} moreDisabled={draft.servings >= MAX_SERVINGS}>
              <span className="min-w-[40px] text-center text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
                {draft.servings}
              </span>
            </Stepper>
          </div>
          <div className="flex flex-col gap-1 px-3.5 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="flex flex-col">
                <span className="text-[15px]" style={{ color: "var(--text)" }}>
                  Cooked weight
                </span>
                <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
                  Optional
                </span>
              </span>
              <CookedWeight grams={draft.totalGrams} onChange={(g) => onChange({ ...draft, totalGrams: g })} />
            </div>
            <span className="text-[12px] leading-snug" style={{ color: sg ? "var(--text-secondary)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {sg ? `One serving is ${n(sg)} g, so it can be logged in grams.` : "Weigh the whole pot after cooking to log servings in grams."}
            </span>
          </div>
        </div>
      </div>

      <Section
        title="Ingredients"
        sub={draft.ingredients.length ? `${raw > 0 ? `${n(raw)} g raw` : "Counted, not weighed"}${counted && raw > 0 ? " plus counted portions" : ""}${estimates ? ` · ${estimates} ${estimates === 1 ? "estimate" : "estimates"}` : ""}` : "None yet"}
        aside={
          <button type="button" onClick={() => setAdding((a) => !a)} aria-expanded={adding} className="flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold" style={{ background: adding ? "var(--primary)" : "var(--surface-raised)", color: adding ? "var(--text-on-primary)" : "var(--text)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-3.5 w-3.5" style={{ transform: adding ? "rotate(45deg)" : "none", transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)" }} aria-hidden>
              <path d="M12 5v14M5 12h14" />
            </svg>
            {adding ? "Close" : "Add"}
          </button>
        }
      >
        {adding && <IngredientSearch onPick={add} />}
        {draft.ingredients.length > 0 && (
          <ul className="flex flex-col overflow-hidden rounded-[14px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }} aria-label="Ingredients">
            {draft.ingredients.map((ing, idx) => {
              const m = ingredientMacros(ing);
              const pill = ing.portion ? portionPill(ing) : { value: n(ing.grams), unit: "g" };
              return (
                <PlateRow
                  key={`${ing.name}-${idx}`}
                  title={ing.name}
                  line={`${n(m.kcal)} kcal · ${Math.round(m.proteinG)}P ${Math.round(m.fatG)}F ${Math.round(m.carbsG)}C`}
                  source={sourceLine({ matched: ing.source === "cofid" ? ing.matched : undefined, confidence: "medium" })}
                  pill={pill}
                  open={open === idx}
                  onToggle={() => setOpen(open === idx ? null : idx)}
                  ariaLabel={`${ing.name}, ${pill.value} ${pill.unit}, ${n(m.kcal)} kcal. Adjust`}
                >
                  <RowDrawer>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                        Amount
                      </span>
                      {ing.portion ? (
                        <Stepper label={`${ing.name}, portions`} onLess={() => setIngredient(idx, { ...ing, grams: Math.max(25, ing.grams - 50) })} onMore={() => setIngredient(idx, { ...ing, grams: Math.min(2000, ing.grams + 50) })} lessDisabled={ing.grams <= 25}>
                          <span className="min-w-[68px] text-center text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
                            {formatAmount(ing.grams / 100)} ×
                          </span>
                        </Stepper>
                      ) : (
                        <Stepper label={`${ing.name}, grams`} onLess={() => setIngredient(idx, { ...ing, grams: Math.max(1, ing.grams - GRAMS_STEP) })} onMore={() => setIngredient(idx, { ...ing, grams: Math.min(MAX_INGREDIENT_GRAMS, ing.grams + GRAMS_STEP) })} lessDisabled={ing.grams <= GRAMS_STEP}>
                          <GramsField grams={ing.grams} onChange={(g) => setIngredient(idx, { ...ing, grams: Math.min(MAX_INGREDIENT_GRAMS, g) })} label={`${ing.name}, grams`} />
                        </Stepper>
                      )}
                    </div>
                    <DrawerActions onRemove={() => remove(idx)} removeLabel="Remove ingredient" />
                  </RowDrawer>
                </PlateRow>
              );
            })}
          </ul>
        )}
      </Section>

      {draft.ingredients.length > 0 && (
        <Section title="Nutrition" aside={<Segmented label="Nutrition for" value={per} onChange={setPer} options={[{ id: "serving", label: "Serving" }, { id: "recipe", label: "Recipe" }]} />}>
          <div className="grid grid-cols-4 overflow-hidden rounded-[14px] divide-x divide-[var(--border)]" style={{ background: "var(--surface)" }}>
            {[
              { label: "kcal", value: n(nutrition.kcal), color: KCAL_COLOR },
              { label: "protein", value: `${n(nutrition.proteinG)} g`, color: PROTEIN_COLOR },
              { label: "fat", value: `${n(nutrition.fatG)} g`, color: FAT_COLOR },
              { label: "carbs", value: `${n(nutrition.carbsG)} g`, color: CARBS_COLOR },
            ].map((t) => (
              <div key={t.label} className="flex flex-col items-center gap-1 px-1 py-3">
                <span className="text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                  {t.value}
                </span>
                <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  <StatusDot color={t.color} />
                  {t.label}
                </span>
              </div>
            ))}
          </div>
          <p className="px-1 text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {per === "serving" ? `One of ${draft.servings} ${draft.servings === 1 ? "serving" : "servings"}${sg ? `, ${n(sg)} g cooked` : ""}.` : `The whole recipe${draft.totalGrams ? `, ${n(draft.totalGrams)} g cooked` : ""}.`}
            {estimates ? " Amber ingredients are estimates." : " Every ingredient is from the UK food database."}
          </p>
        </Section>
      )}

      {draft.ingredients.length > 0 && (
        <Section
          title="Eating now"
          aside={
            <Segmented
              label="Count it in"
              value={eating.unit}
              onChange={(unit) => onEating(unit === "grams" && sg ? { unit, amount: Math.round(sg) } : { unit: "servings", amount: 1 })}
              options={[
                { id: "servings", label: "Servings" },
                { id: "grams", label: "Grams", disabled: !sg },
              ]}
            />
          }
        >
          <div className="flex flex-col gap-2 rounded-[14px] px-3.5 py-3" style={{ background: "var(--surface)" }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {n(now.kcal)} kcal · {now.proteinG}P {now.fatG}F {now.carbsG}C
              </span>
              {eating.unit === "servings" ? (
                <Stepper onSurface label="Servings eaten now" onLess={() => onEating({ ...eating, amount: Math.max(MIN_EATEN, eating.amount - EATEN_STEP) })} onMore={() => onEating({ ...eating, amount: Math.min(MAX_EATEN, draft.servings, eating.amount + EATEN_STEP) })} lessDisabled={eating.amount <= MIN_EATEN} moreDisabled={eating.amount >= Math.min(MAX_EATEN, draft.servings)}>
                  <span className="min-w-[88px] text-center text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
                    {servingsText(eating.amount)}
                  </span>
                </Stepper>
              ) : (
                <Stepper onSurface label="Grams eaten now" onLess={() => onEating({ ...eating, amount: Math.max(EATEN_GRAMS_STEP, eating.amount - EATEN_GRAMS_STEP) })} onMore={() => onEating({ ...eating, amount: Math.min(draft.totalGrams ?? MAX_TOTAL_GRAMS, eating.amount + EATEN_GRAMS_STEP) })} lessDisabled={eating.amount <= EATEN_GRAMS_STEP}>
                  <GramsField grams={Math.round(eating.amount)} onChange={(g) => onEating({ ...eating, amount: Math.min(draft.totalGrams ?? MAX_TOTAL_GRAMS, g) })} label="Grams eaten now" />
                </Stepper>
              )}
            </div>
            {targetKcal != null && targetKcal > 0 && (
              <span className="text-[12px]" style={{ color: consumedKcal + now.kcal > targetKcal ? "var(--status-watch)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                Day after logging {n(consumedKcal + now.kcal)} of {n(targetKcal)} kcal
              </span>
            )}
          </div>
        </Section>
      )}
    </div>
  );
}

/** The cooked weight as a gram field; cleared means not weighed. */
function CookedWeight({ grams, onChange }: { grams: number | null; onChange: (g: number | null) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="flex items-center gap-1.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
      <input
        type="text"
        inputMode="numeric"
        value={draft ?? (grams ? String(grams) : "")}
        placeholder="–"
        onChange={(e) => {
          const v = e.target.value.replace(/[^0-9]/g, "").slice(0, 5);
          setDraft(v);
          const g = Number(v);
          onChange(g > 0 ? Math.min(MAX_TOTAL_GRAMS, g) : null);
        }}
        onBlur={() => setDraft(null)}
        className="h-10 w-[96px] rounded-[10px] px-3 text-right text-[15px] font-semibold outline-none focus:ring-1"
        style={{ ...fieldStyle, fontVariantNumeric: "tabular-nums" }}
        aria-label="Cooked weight of the whole recipe, grams"
      />
      g
    </label>
  );
}

/** Search the UK base list for an ingredient; a tap adds it at 100 g. */
function IngredientSearch({ onPick }: { onPick: (item: FoodItem) => void }) {
  const [query, setQuery] = useState("");
  const [base, setBase] = useState<FoodItem[] | null>(null);
  useEffect(() => {
    let live = true;
    void loadCofid().then((items) => {
      if (live) setBase(items);
    });
    return () => {
      live = false;
    };
  }, []);
  const results = base && query.trim().length >= 2 ? searchFoods(base, query, 8) : [];
  return (
    <div className="flex flex-col gap-2">
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the UK food database" className="h-11 rounded-[12px] px-3 text-[15px] outline-none focus:ring-1" style={fieldStyle} aria-label="Search for an ingredient" autoComplete="off" autoFocus />
      {query.trim().length >= 2 && (
        <ul className="flex flex-col overflow-hidden rounded-[14px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }} aria-label="Ingredient results">
          {results.length === 0 ? (
            <li className="px-3.5 py-3 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
              {base ? "No match in the UK food database." : "Loading the food database."}
            </li>
          ) : (
            results.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => onPick(item)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition-colors active:bg-[var(--surface-raised)]" aria-label={`Add ${item.name}`}>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px]" style={{ color: "var(--text)" }}>
                      {item.name}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                      {n(item.per100.kcal)} kcal · {Math.round(item.per100.proteinG)}P {Math.round(item.per100.fatG)}F {Math.round(item.per100.carbsG)}C per 100 g
                    </span>
                  </span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }} aria-hidden>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" className="h-3.5 w-3.5">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
