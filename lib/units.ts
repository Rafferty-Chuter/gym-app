/**
 * Unit conversion and formatting. Storage is canonical (kg, cm, kcal, g, min);
 * these helpers convert for display and parse user input back to canonical.
 */

export type WeightUnit = "kg" | "lb";

/** One pound in kilograms (exact). */
export const KG_PER_LB = 0.45359237;

export function kgToDisplay(kg: number, unit: WeightUnit): number {
  return unit === "lb" ? kg / KG_PER_LB : kg;
}

export function displayToKg(value: number, unit: WeightUnit): number {
  return unit === "lb" ? value * KG_PER_LB : value;
}

/** "82.4 kg" / "181.7 lb". `decimals` defaults to 1. */
export function formatWeight(kg: number, unit: WeightUnit, decimals = 1): string {
  if (!Number.isFinite(kg)) return "—";
  const v = kgToDisplay(kg, unit);
  return `${v.toFixed(decimals)} ${unit}`;
}

/** "2,950 kcal" */
export function formatKcal(kcal: number): string {
  if (!Number.isFinite(kcal)) return "—";
  return `${Math.round(kcal).toLocaleString("en-GB")} kcal`;
}

/**
 * Parse a workout set's weight text (which is stored in the display unit)
 * into kg. Returns null for blank, "BW", or non-numeric text, so callers
 * can skip bodyweight-only sets instead of treating them as 0 kg.
 */
export function parseWeightText(text: string | number | null | undefined, unit: WeightUnit): number | null {
  if (text === null || text === undefined) return null;
  const s = String(text).trim();
  if (!s) return null;
  if (/^bw$/i.test(s) || /^bodyweight$/i.test(s)) return null;
  const n = Number.parseFloat(s.replace(/,/g, "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return displayToKg(n, unit);
}

/** Round to a step (e.g. 0.1 kg). */
export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
