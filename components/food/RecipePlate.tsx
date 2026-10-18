"use client";

import { useState } from "react";
import PlateRow, { DrawerActions, GramsField, RowDrawer, Stepper } from "@/components/food/PlateRow";
import { EATEN_STEP, MAX_EATEN, MAX_SERVINGS, MIN_EATEN, eatenMacros, ingredientMacros, type Recipe } from "@/lib/food/recipe";
import { GRAMS_STEP, formatAmount, sourceLine } from "@/lib/food/plate";
import { MAX_INGREDIENT_GRAMS } from "@/lib/food/describe";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const macroLine = (m: { kcal: number; proteinG: number; fatG: number; carbsG: number }) => `${n(m.kcal)} kcal · ${Math.round(m.proteinG)}P ${Math.round(m.fatG)}F ${Math.round(m.carbsG)}C`;
const servings = (v: number) => `${formatAmount(v)} ${v === 1 ? "serving" : "servings"}`;

/**
 * A recipe read from text, laid out like MacroFactor's AI Plate: the dish
 * on top with what is being eaten as its amount, then its ingredients,
 * each with grams in a pill and where its numbers came from. Tapping the
 * dish sets the name, how many it makes and how much is eaten now;
 * tapping an ingredient sets its grams or removes it. The macros follow
 * from the base-list rows by plain arithmetic.
 */
export default function RecipePlate({ recipe, onChange, eating, onEating }: { recipe: Recipe; onChange: (r: Recipe) => void; eating: number; onEating: (n: number) => void }) {
  const [open, setOpen] = useState<number | "dish" | null>(null);
  const [showAll, setShowAll] = useState(true);
  const eaten = eatenMacros(recipe.ingredients, recipe.servings, eating);
  const setGrams = (idx: number, grams: number) => onChange({ ...recipe, ingredients: recipe.ingredients.map((x, j) => (j === idx ? { ...x, grams: Math.min(MAX_INGREDIENT_GRAMS, Math.max(1, Math.round(grams))) } : x)) });
  const drop = (idx: number) => {
    setOpen(null);
    onChange({ ...recipe, ingredients: recipe.ingredients.filter((_, j) => j !== idx) });
  };
  const toggle = (k: number | "dish") => setOpen(open === k ? null : k);
  const count = recipe.ingredients.length;

  return (
    <ul className="flex flex-col overflow-hidden rounded-[14px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }} aria-label="Recipe">
      <PlateRow
        emphasis
        title={recipe.name.trim() || "Recipe"}
        line={macroLine(eaten)}
        source={{ text: `${servings(eating)} of ${recipe.servings} · ${count} ${count === 1 ? "ingredient" : "ingredients"}`, estimate: false }}
        pill={{ value: formatAmount(eating), unit: eating === 1 ? "serving" : "servings" }}
        open={open === "dish"}
        onToggle={() => toggle("dish")}
        ariaLabel={`${recipe.name}, ${servings(eating)} of ${recipe.servings}, ${n(eaten.kcal)} kcal. Adjust`}
      >
        <RowDrawer>
          <input type="text" value={recipe.name} onChange={(e) => onChange({ ...recipe, name: e.target.value })} className="h-10 rounded-[10px] px-3 text-[15px] font-semibold outline-none focus:ring-1" style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }} aria-label="Recipe name" autoComplete="off" />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
              Recipe makes
            </span>
            <Stepper label="Servings the recipe makes" onLess={() => {
                const next = recipe.servings - 1;
                onChange({ ...recipe, servings: next });
                if (eating > next) onEating(next);
              }} onMore={() => onChange({ ...recipe, servings: recipe.servings + 1 })} lessDisabled={recipe.servings <= 1} moreDisabled={recipe.servings >= MAX_SERVINGS}>
              <span className="min-w-[88px] text-center text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
                {servings(recipe.servings)}
              </span>
            </Stepper>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
              Eating now
            </span>
            <Stepper label="Servings eaten now" onLess={() => onEating(Math.max(MIN_EATEN, eating - EATEN_STEP))} onMore={() => onEating(Math.min(MAX_EATEN, recipe.servings, eating + EATEN_STEP))} lessDisabled={eating <= MIN_EATEN} moreDisabled={eating >= Math.min(MAX_EATEN, recipe.servings)}>
              <span className="min-w-[88px] text-center text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
                {servings(eating)}
              </span>
            </Stepper>
          </div>
        </RowDrawer>
      </PlateRow>

      <li>
        <button type="button" onClick={() => setShowAll((s) => !s)} aria-expanded={showAll} className="flex w-full items-center justify-between px-3.5 py-2.5 text-[13px] font-medium" style={{ color: "var(--text-secondary)" }}>
          {showAll ? "Hide ingredients" : `Show ${count} ${count === 1 ? "ingredient" : "ingredients"}`}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" style={{ transform: showAll ? "rotate(180deg)" : "none", transition: "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)" }} aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </li>

      {showAll &&
        recipe.ingredients.map((ing, idx) => {
          const m = ingredientMacros(ing);
          return (
            <PlateRow
              key={`${ing.name}-${idx}`}
              title={ing.name}
              line={`${n(m.kcal)} kcal · ${Math.round(m.proteinG)}P ${Math.round(m.fatG)}F ${Math.round(m.carbsG)}C`}
              source={sourceLine({ matched: ing.source === "cofid" ? ing.matched : undefined, confidence: "medium" })}
              pill={{ value: ing.grams.toLocaleString("en-GB"), unit: "g" }}
              open={open === idx}
              onToggle={() => toggle(idx)}
              ariaLabel={`${ing.name}, ${ing.grams} grams, ${n(m.kcal)} kcal. Adjust`}
            >
              <RowDrawer>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px]" style={{ color: "var(--text-secondary)" }}>
                    Amount
                  </span>
                  <Stepper label={`${ing.name}, grams`} onLess={() => setGrams(idx, ing.grams - GRAMS_STEP)} onMore={() => setGrams(idx, ing.grams + GRAMS_STEP)} lessDisabled={ing.grams <= GRAMS_STEP}>
                    <GramsField grams={ing.grams} onChange={(g) => setGrams(idx, g)} label={`${ing.name}, grams`} />
                  </Stepper>
                </div>
                <DrawerActions onRemove={() => drop(idx)} removeLabel="Remove ingredient" />
              </RowDrawer>
            </PlateRow>
          );
        })}
    </ul>
  );
}
