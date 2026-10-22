/**
 * The day-level reads of what IN6 put on each food (IN9): how much alcohol
 * an evening had, which evenings were drinking ones and which were dry, and
 * a day's sodium. Shared by the alcohol read (`alcohol.ts`), Connections'
 * drinks-the-evening-before condition and the scale-jump drivers, so all
 * three count the same evenings.
 *
 * Absent stays unknown (IN6): an evening is dry only when its day's food is
 * logged in full, and a day's sodium is read only when the foods carrying
 * it make up most of the day. Pure.
 */

import { addDays, type LocalDate } from "@/lib/dates";
import { median } from "@/lib/stats";
import { countsAsLogged, dailyIntakeSeries } from "@/lib/physique/intake";
import type { DayFlags, FoodEntry, WeighIn } from "@/lib/physique/types";

// ── Thresholds (tags as in 02-engine-spec) ──

/** Hour before which a drink counts to the evening before. OURS, after Bevel's "log yesterday's entry on wake-up": a drink at 01:00 is part of the night out before it. */
export const EVENING_CUTOFF_HOUR = 4;
/** Alcohol in an evening that makes it a drinking night, g per kg of body weight. EVID: Pietilä 2018 (n 4,098) saw resting HR +4 bpm and HRV −5.7 ms from 0.25 g/kg, and a fraction of that below it. About a pint and a bit of lager at 80 kg. */
export const DRINK_G_PER_KG = 0.25;
/** Body weight assumed with no weigh-ins, kg. OURS. */
export const DRINK_DEFAULT_KG = 80;
/** Days of weigh-ins the body weight for that line is the median of. OURS. */
export const BODY_KG_DAYS = 60;
/** Most alcohol an evening can carry and still count as dry, g. OURS: a dash of wine in a sauce or a kombucha is not a drink. */
export const DRY_MAX_G = 1;
/** Share of a day's calories whose foods carry sodium before the day's sodium is read. OURS: with more than a fifth unknown, a missing salty food could hide the day's real total. */
export const SODIUM_MIN_COVERAGE = 0.8;

// ── Alcohol ──

/** The evening an entry belongs to: its date, or the day before for one timed before EVENING_CUTOFF_HOUR. */
export function eveningOf(e: Pick<FoodEntry, "date" | "time">): LocalDate {
  const h = e.time && /^\d{2}:\d{2}$/.test(e.time) ? Number(e.time.slice(0, 2)) : null;
  return h != null && h < EVENING_CUTOFF_HOUR ? addDays(e.date, -1) : e.date;
}

/** Grams of alcohol logged for each evening, where any was. */
export function alcoholByEvening(entries: readonly FoodEntry[]): Map<LocalDate, number> {
  const out = new Map<LocalDate, number>();
  for (const e of entries) {
    const g = e.alcoholG;
    if (typeof g !== "number" || !Number.isFinite(g) || g <= 0) continue;
    const d = eveningOf(e);
    out.set(d, (out.get(d) ?? 0) + g);
  }
  return out;
}

/** Body weight for the drinking line: the median weigh-in of the BODY_KG_DAYS to `through`, else of all of them, else DRINK_DEFAULT_KG. */
export function bodyKgAt(weighIns: readonly WeighIn[], through: LocalDate): number {
  const from = addDays(through, -(BODY_KG_DAYS - 1));
  const valid = weighIns.filter((w) => Number.isFinite(w.kg) && w.kg > 0 && w.date <= through);
  const recent = valid.filter((w) => w.date >= from);
  const pick = recent.length ? recent : valid;
  return pick.length ? median(pick.map((w) => w.kg)) : DRINK_DEFAULT_KG;
}

/** The grams of alcohol that make an evening a drinking one at `bodyKg`. */
export function drinkThresholdG(bodyKg: number): number {
  return DRINK_G_PER_KG * bodyKg;
}

export type Evening = { kind: "drink" | "dry"; alcoholG: number };

/**
 * Each evening in [from, to] that was a drinking one (alcohol at or over the
 * person's line) or dry (food logged in full, no more than DRY_MAX_G).
 * Evenings with a little, or with the day's food not logged, are neither,
 * so they never water down either group. `thresholdG` overrides the line.
 */
export function drinkingEvenings(entries: readonly FoodEntry[], dayFlags: Readonly<Record<string, DayFlags>>, weighIns: readonly WeighIn[], from: LocalDate, to: LocalDate, thresholdG?: number): Map<LocalDate, Evening> {
  const line = thresholdG ?? drinkThresholdG(bodyKgAt(weighIns, to));
  const alcohol = alcoholByEvening(entries);
  const out = new Map<LocalDate, Evening>();
  for (const d of dailyIntakeSeries(entries, dayFlags, from, to)) {
    const g = alcohol.get(d.date) ?? 0;
    if (g >= line) out.set(d.date, { kind: "drink", alcoholG: g });
    else if (g <= DRY_MAX_G && countsAsLogged(d.status)) out.set(d.date, { kind: "dry", alcoholG: g });
  }
  return out;
}

// ── Sodium ──

/**
 * Each day's sodium in [from, to], mg: the foods that carry it, scaled up
 * to the whole day's calories, on days where they make up at least
 * SODIUM_MIN_COVERAGE of them. A day with its calories edited by hand is
 * left out (its foods no longer add up to it).
 */
export function sodiumByDay(entries: readonly FoodEntry[], dayFlags: Readonly<Record<string, DayFlags>>, from: LocalDate, to: LocalDate): Map<LocalDate, number> {
  const days = new Map<LocalDate, { kcal: number; knownKcal: number; mg: number }>();
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    const kcal = Number.isFinite(e.kcal) && e.kcal > 0 ? e.kcal : 0;
    const d = days.get(e.date) ?? { kcal: 0, knownKcal: 0, mg: 0 };
    d.kcal += kcal;
    if (typeof e.sodiumMg === "number" && Number.isFinite(e.sodiumMg) && e.sodiumMg >= 0) {
      d.knownKcal += kcal;
      d.mg += e.sodiumMg;
    }
    days.set(e.date, d);
  }
  const out = new Map<LocalDate, number>();
  for (const [date, d] of days) {
    if (dayFlags[date]?.kcalOverride != null || d.kcal <= 0) continue;
    if (d.knownKcal / d.kcal < SODIUM_MIN_COVERAGE) continue;
    out.set(date, Math.round((d.mg * d.kcal) / d.knownKcal));
  }
  return out;
}
