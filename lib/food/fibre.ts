/**
 * Fibre totals (B3, F7). Fibre is the one number not every source carries:
 * CoFID leaves it blank on some rows, quick adds never have it, and older
 * saved foods were stored without it. A total is only given when the parts
 * with a known value carry most of the energy, so a day of mostly unknown
 * foods never reads as a low-fibre day. Pure.
 */

/** A total's fibre is given only when parts with a known value carry this share of its energy. OURS: below it the sum would undercount. */
export const FIBRE_KNOWN_SHARE = 0.8;

type Part = { kcal: number; fibreG?: number };

/**
 * The fibre in grams summed over parts, rounded to 0.1 g, or undefined
 * when parts with a known value carry under FIBRE_KNOWN_SHARE of the
 * energy. Parts with no energy (water, black coffee) count only when all
 * parts have none.
 */
export function knownFibre(parts: readonly Part[]): number | undefined {
  if (parts.length === 0) return undefined;
  const known = parts.filter((p) => typeof p.fibreG === "number" && Number.isFinite(p.fibreG));
  const kcal = parts.reduce((s, p) => s + Math.max(0, p.kcal), 0);
  const knownKcal = known.reduce((s, p) => s + Math.max(0, p.kcal), 0);
  if (kcal > 0 ? knownKcal / kcal < FIBRE_KNOWN_SHARE : known.length < parts.length) return undefined;
  return Math.round(known.reduce((s, p) => s + Math.max(0, p.fibreG as number), 0) * 10) / 10;
}
