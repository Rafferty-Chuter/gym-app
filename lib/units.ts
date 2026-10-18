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

/**
 * Decimals a body weight shows (C5, the founder's request): 2 in kg, as
 * scales that read to 0.05 kg show it; 1 in lb, where scales read to 0.2 lb.
 * Goal targets, rates and changes keep their own precision.
 */
export const BODYWEIGHT_DECIMALS: Record<WeightUnit, number> = { kg: 2, lb: 1 };

/** A weigh-in or trend weight: "82.35 kg" / "181.6 lb". */
export function formatBodyWeight(kg: number, unit: WeightUnit): string {
  return formatWeight(kg, unit, BODYWEIGHT_DECIMALS[unit]);
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

// ── Height ──

export type HeightUnit = "cm" | "ft";

/** One inch in centimetres (exact). */
export const CM_PER_INCH = 2.54;

/** Centimetres to whole feet and inches, rounded to the nearest inch: 180 → 5 ft 11 in. */
export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const total = Math.round(cm / CM_PER_INCH);
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

/** Feet and inches to whole centimetres, as stored: 5 ft 11 in → 180. */
export function ftInToCm(ft: number, inch: number): number {
  return Math.round((ft * 12 + inch) * CM_PER_INCH);
}

/** "180 cm" / "5 ft 11 in". */
export function formatHeight(cm: number, unit: HeightUnit): string {
  if (!Number.isFinite(cm)) return "—";
  if (unit === "cm") return `${Math.round(cm)} cm`;
  const { ft, inch } = cmToFtIn(cm);
  return `${ft} ft ${inch} in`;
}
