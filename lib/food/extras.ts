/**
 * The nutrients a food carries beyond energy, macros and fibre (IN6):
 * sodium, total sugars, saturated fat and alcohol. They travel with a food
 * wherever fibre does (B3), so the scale-jump and alcohol reads (IN2, IN9)
 * have them later; nothing targets them. Optional everywhere: absent means
 * the source didn't say, never zero. Pure.
 */

export const EXTRA_KEYS = ["sodiumMg", "sugarG", "satFatG", "alcoholG"] as const;
export type ExtraKey = (typeof EXTRA_KEYS)[number];
export type Extras = Partial<Record<ExtraKey, number>>;

/** Most of each per 100 g a real food has; past this a figure is a slip and is dropped. PUB: table salt is about 39 g sodium per 100 g; fat cannot pass 100 g; pure alcohol is about 79 g per 100 ml; CoFID gives sugars as monosaccharide equivalents, so white sugar reads 105 g. */
export const EXTRA_MAX_PER_100: Readonly<Record<ExtraKey, number>> = { sodiumMg: 40_000, sugarG: 110, satFatG: 100, alcoholG: 80 };

/** Sodium in salt by weight. PUB: sodium chloride is 39.3% sodium; UK labels use salt = sodium × 2.5. */
export const SODIUM_PER_SALT = 0.4;

/** Alcohol in g per 100 ml from % by volume. PUB: ethanol's density is 0.789 g/ml. */
export const ALCOHOL_G_PER_VOL_PCT = 0.789;

/** Energy in a gram of alcohol. PUB: Atwater, 7 kcal/g. */
export const KCAL_PER_G_ALCOHOL = 7;

/** Sodium to the milligram, the rest to 0.1 g. */
function round(key: ExtraKey, v: number): number {
  return key === "sodiumMg" ? Math.round(v) : Math.round(v * 10) / 10;
}

/** The extras found on `o`, finite and not negative, rounded; others left out. */
export function pickExtras(o: Partial<Record<ExtraKey, unknown>> | null | undefined): Extras {
  const out: Extras = {};
  if (!o) return out;
  for (const k of EXTRA_KEYS) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) out[k] = round(k, v);
  }
  return out;
}

/** The extras per 100 g, each dropped when past what a food can hold. */
export function per100Extras(o: Partial<Record<ExtraKey, unknown>> | null | undefined): Extras {
  const e = pickExtras(o);
  for (const k of EXTRA_KEYS) if (e[k] != null && (e[k] as number) > EXTRA_MAX_PER_100[k]) delete e[k];
  return e;
}

/** Each extra times `f` (a share of 100 g, or a number of servings), rounded. */
export function scaleExtras(e: Extras | null | undefined, f: number): Extras {
  const out: Extras = {};
  if (!e || !Number.isFinite(f)) return out;
  for (const k of EXTRA_KEYS) {
    const v = e[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = round(k, v * f);
  }
  return out;
}

/**
 * Totals across parts, each only when every part has it: a recipe with one
 * ingredient's sodium unknown has an unknown sodium, never a low one.
 */
export function sumExtras(parts: ReadonlyArray<Extras | null | undefined>): Extras {
  const out: Extras = {};
  if (!parts.length) return out;
  for (const k of EXTRA_KEYS) {
    let s = 0;
    let all = true;
    for (const p of parts) {
      const v = p?.[k];
      if (typeof v === "number" && Number.isFinite(v)) s += v;
      else all = false;
    }
    if (all) out[k] = round(k, s);
  }
  return out;
}

/**
 * An estimate's extras (the model's, or a chain's) made to fit its own
 * numbers: sugars no more than the carbs, saturated fat no more than the
 * fat, alcohol's energy no more than the calories, sodium no more than
 * `maxSodiumMg`. A slipped figure is brought within, not dropped: the
 * rest of the estimate is usually close.
 */
export function fittedExtras(o: Partial<Record<ExtraKey, unknown>> | null | undefined, m: { kcal: number; carbsG: number; fatG: number }, maxSodiumMg: number): Extras {
  const e = pickExtras(o);
  const cap = (k: ExtraKey, max: number) => {
    if (e[k] != null) e[k] = round(k, Math.min(e[k] as number, Math.max(0, max)));
  };
  cap("sugarG", m.carbsG);
  cap("satFatG", m.fatG);
  cap("alcoholG", m.kcal / KCAL_PER_G_ALCOHOL);
  cap("sodiumMg", maxSodiumMg);
  return e;
}

// ── Display ──

export type NutrientRow = { key: ExtraKey | "fibreG"; label: string; value: string };

/** "12 g", "3.4 g", "0 g": whole grams from 10, one decimal below. */
function grams(v: number): string {
  const r = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${r.toLocaleString("en-GB")} g`;
}

/**
 * A food's other nutrients as rows for its detail, in UK label order
 * (saturates, sugars, fibre, salt), each only when known. Salt is shown
 * as UK labels give it (sodium × 2.5, in g) so it can be checked against
 * the pack; alcohol only when there is some. No targets: these are read
 * later (IN2, IN9), not chased.
 */
export function nutrientRows(e: (Extras & { fibreG?: number }) | null | undefined): NutrientRow[] {
  if (!e) return [];
  const out: NutrientRow[] = [];
  const has = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
  if (has(e.satFatG)) out.push({ key: "satFatG", label: "Saturated fat", value: grams(e.satFatG) });
  if (has(e.sugarG)) out.push({ key: "sugarG", label: "Sugars", value: grams(e.sugarG) });
  if (has(e.fibreG)) out.push({ key: "fibreG", label: "Fibre", value: grams(e.fibreG) });
  if (has(e.sodiumMg)) out.push({ key: "sodiumMg", label: "Salt", value: grams(e.sodiumMg / 1000 / SODIUM_PER_SALT) });
  if (has(e.alcoholG) && e.alcoholG > 0) out.push({ key: "alcoholG", label: "Alcohol", value: grams(e.alcoholG) });
  return out;
}

/** True when `e` has at least one extra. */
export function hasExtras(e: Extras | null | undefined): boolean {
  return !!e && EXTRA_KEYS.some((k) => typeof e[k] === "number");
}
