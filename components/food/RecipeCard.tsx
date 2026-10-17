"use client";

import { EATEN_STEP, MAX_EATEN, MAX_SERVINGS, MIN_EATEN, eatenMacros, estimateCount, ingredientMacros, perServing, type Recipe } from "@/lib/food/recipe";

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const inputStyle = { background: "#1d1d20", color: "#f2f2f0", border: "1px solid #2a2a2e" };

function Stepper({ value, onChange, min, max, step, label, format }: { value: number; onChange: (v: number) => void; min: number; max: number; step: number; label: string; format?: (v: number) => string }) {
  const btn = "flex h-9 w-9 items-center justify-center rounded-full text-[18px] leading-none transition-colors active:bg-[#2a2a2e] disabled:opacity-40";
  const show = format ? format(value) : String(value);
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      <button type="button" onClick={() => onChange(Math.max(min, Math.round((value - step) * 100) / 100))} disabled={value <= min} className={btn} style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label={`${label}: less`}>
        −
      </button>
      <span className="min-w-[40px] text-center text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
        {show}
      </span>
      <button type="button" onClick={() => onChange(Math.min(max, Math.round((value + step) * 100) / 100))} disabled={value >= max} className={btn} style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label={`${label}: more`}>
        +
      </button>
    </div>
  );
}

/**
 * A parsed recipe (M4b), after MacroFactor's Create Recipe: the name, how
 * many servings it makes, one row per ingredient with its grams editable,
 * then one serving and the whole recipe in numbers, then how much of it
 * is being eaten now. Grams and servings are the only things to adjust;
 * the macros follow from the base-list rows.
 */
export default function RecipeCard({ recipe, onChange, eating, onEating }: { recipe: Recipe; onChange: (r: Recipe) => void; eating: number; onEating: (n: number) => void }) {
  const one = perServing(recipe.ingredients, recipe.servings);
  const all = eatenMacros(recipe.ingredients, recipe.servings, recipe.servings);
  const estimates = estimateCount(recipe.ingredients);
  const setIng = (idx: number, grams: number) => onChange({ ...recipe, ingredients: recipe.ingredients.map((x, j) => (j === idx ? { ...x, grams } : x)) });
  const drop = (idx: number) => onChange({ ...recipe, ingredients: recipe.ingredients.filter((_, j) => j !== idx) });
  return (
    <div className="flex flex-col gap-3" aria-label="Recipe">
      <div className="flex items-center gap-2">
        <input type="text" value={recipe.name} onChange={(e) => onChange({ ...recipe, name: e.target.value })} className="h-11 min-w-0 flex-1 rounded-[12px] px-3 text-[15px] font-semibold outline-none focus:ring-1" style={inputStyle} aria-label="Recipe name" autoComplete="off" />
      </div>
      <div className="flex items-center justify-between rounded-[12px] px-3 py-2" style={{ background: "#141416" }}>
        <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
          Makes
        </span>
        <Stepper value={recipe.servings} onChange={(v) => onChange({ ...recipe, servings: v })} min={1} max={MAX_SERVINGS} step={1} label="Servings the recipe makes" format={(v) => `${v} ${v === 1 ? "serving" : "servings"}`} />
      </div>

      <ul className="flex flex-col overflow-hidden rounded-[12px] divide-y divide-[#2a2a2e]" style={{ background: "#141416" }} aria-label="Ingredients">
        {recipe.ingredients.map((ing, idx) => {
          const m = ingredientMacros(ing);
          return (
            <li key={`${ing.name}-${idx}`} className="flex items-center gap-2 px-3 py-2">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[15px]" style={{ color: "#f2f2f0" }}>
                  {ing.name}
                </span>
                <span className="truncate text-[11px]" style={{ color: ing.source === "estimate" ? "#f5b544" : "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                  {n(m.kcal)} kcal · {ing.source === "cofid" ? ing.matched : "estimate"}
                </span>
              </div>
              <label className="flex shrink-0 items-center gap-1 text-[12px]" style={{ color: "#6f6f76" }}>
                <input type="number" inputMode="numeric" min={0} max={10000} value={ing.grams} onChange={(e) => setIng(idx, Math.max(0, Math.min(10000, Number(e.target.value) || 0)))} className="h-9 w-[64px] rounded-[10px] px-2 text-right text-[14px] outline-none focus:ring-1" style={{ ...inputStyle, fontVariantNumeric: "tabular-nums" }} aria-label={`${ing.name}, grams`} />
                g
              </label>
              <button type="button" onClick={() => drop(idx)} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ background: "#1d1d20", color: "#a3a3a8" }} aria-label={`Drop ${ing.name}`}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col overflow-hidden rounded-[12px] divide-y divide-[#2a2a2e]" style={{ background: "#141416" }}>
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
            One serving
          </span>
          <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
            {n(one.kcal)} kcal · {one.proteinG}P {one.fatG}F {one.carbsG}C
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2.5">
          <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
            Whole recipe
          </span>
          <span className="text-[13px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
            {n(all.kcal)} kcal · {all.proteinG}P {all.fatG}F {all.carbsG}C
          </span>
        </div>
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
            Eating now
          </span>
          <Stepper value={eating} onChange={onEating} min={MIN_EATEN} max={Math.min(MAX_EATEN, recipe.servings)} step={EATEN_STEP} label="Servings eaten now" format={(v) => `${Number.isInteger(v) ? v : v.toFixed(1)} ${v === 1 ? "serving" : "servings"}`} />
        </div>
      </div>
      <p className="text-[11px]" style={{ color: "#6f6f76" }}>
        {estimates === 0
          ? "Every ingredient matched the UK food database. Adjust grams if the amounts are off."
          : `${estimates} ${estimates === 1 ? "ingredient is an estimate" : "ingredients are estimates"}, in amber. The rest come from the UK food database. Logging it keeps one serving under Saved.`}
      </p>
    </div>
  );
}
