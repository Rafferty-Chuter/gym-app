/**
 * The showcase history: made-up data built so the app's findings can be
 * shown to strangers (testers, posts) with screenshots. Each screenshot is
 * captioned as example data, never as someone's own log.
 *
 * The person: 84 kg, cutting towards 74 kg at 0.5% a week, squat and bench
 * three times a week, an Apple Watch on every night. What is built in:
 * - top sets about 3% lighter for each hour of sleep under 7h 12m (at most
 *   6% lighter, at most 1.5% heavier), so sleep is the clearest connection;
 * - top sets 2% heavier after a day of above-median carbs (and so calories),
 *   so food shows too;
 * - the last 4 weeks sleep 48 minutes shorter, with HRV 12% lower and resting
 *   HR 3 bpm higher, and strength fading 1.5% over the last 5 weeks, so the
 *   "Short sleep, lifts not progressing" finding has a cut to catch.
 *
 * It is built once for SHOWCASE_REF_END and every date is then moved to end
 * on the day it is loaded. Built for each day instead, the sessions would
 * fall on other weekdays and pair with other nights, and the findings would
 * change from one day to the next; moved whole, every session keeps its
 * night and its meals, so the screenshots can be taken again on any day.
 *
 * Pure: `today` in, a scenario out (seeded, so the same each time).
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { makeScenario, type ScenarioSpec } from "@/lib/physique/fixtures";

export type ShowcaseScenario = ReturnType<typeof makeScenario>;

/** The day the showcase is built to end on, before it is moved to today. */
export const SHOWCASE_REF_END: LocalDate = "2026-10-22";
/** Days of history: the 16 weeks Connections reads. */
export const SHOWCASE_DAYS = 112;
/** Picked from 40 seeds read by the real engine: sleep comes first and the finding fires, with no link that wasn't built in. */
export const SHOWCASE_SEED = 5;

/** The scenario before any effect: 16 weeks of an 84 kg cut, squat and bench three times a week, Apple Watch nights. The target stays ahead of the trend, so the cut is still running at the end. */
export function showcaseSpec(): ScenarioSpec {
  return {
    seed: SHOWCASE_SEED,
    days: SHOWCASE_DAYS,
    startDate: addDays(SHOWCASE_REF_END, -(SHOWCASE_DAYS - 1)),
    bodyweightKg: 84,
    trueTdeeKcal: 2750,
    intake: "toTarget",
    goal: { ratePctPerWeek: -0.5, targetKg: 74 },
    sleep: { meanH: 7.1, sdH: 0.75, source: "healthkit", loggedShare: 1, hrv: { meanMs: 55, sdPct: 12, rhrBpm: 54, dropFromDay: SHOWCASE_DAYS - 28, dropPct: 12, rhrRiseBpm: 3 } },
    lifts: [
      { name: "Squat", startE1rm: 155, profile: "linear", changePct: 3, perWeek: 3, cv: 0.015 },
      { name: "Bench Press", startE1rm: 112, profile: "linear", changePct: 2, perWeek: 3, cv: 0.015 },
    ],
  };
}

// ── Effects ──

/** Every set of every session scaled by `pctFor(date)` %, rounded to 2.5 kg plates. */
function scaleSessions(sc: ShowcaseScenario, pctFor: (date: LocalDate) => number): ShowcaseScenario {
  return {
    ...sc,
    workouts: sc.workouts.map((w) => {
      const p = pctFor(w.completedAt.slice(0, 10));
      if (!p) return w;
      return { ...w, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((st) => ({ ...st, weight: String(Math.round((parseFloat(st.weight) * (1 + p / 100)) / 2.5) * 2.5) })) })) };
    }),
  };
}

/** The last `days` nights `hours` shorter, never under 4h 30m asleep. */
export function shorterNights(sc: ShowcaseScenario, days: number, hours: number): ShowcaseScenario {
  const from = addDays(sc.endDate, -(days - 1));
  const cut = Math.round(hours * 60);
  return { ...sc, sleepNights: sc.sleepNights.map((n) => (n.date >= from ? { ...n, asleepMin: Math.max(270, n.asleepMin - cut), inBedMin: n.inBedMin == null ? n.inBedMin : Math.max(295, n.inBedMin - cut) } : n)) };
}

/** Each session `perHour` % lighter for each hour of the night before under `refH`, within [`floorPct`, `capPct`]. */
export function sleepCost(sc: ShowcaseScenario, perHour: number, refH: number, floorPct: number, capPct: number): ShowcaseScenario {
  const hours = new Map(sc.sleepNights.map((n) => [n.date, n.asleepMin / 60]));
  return scaleSessions(sc, (d) => {
    const h = hours.get(d);
    return h == null ? 0 : Math.max(floorPct, Math.min(capPct, perHour * (h - refH)));
  });
}

/** Each session `pct` % heavier after a day of more carbs than the median day. */
export function higherCarbs(sc: ShowcaseScenario, pct: number): ShowcaseScenario {
  const carbs = new Map<LocalDate, number>();
  for (const e of sc.foodEntries) carbs.set(e.date, (carbs.get(e.date) ?? 0) + e.carbsG);
  const sorted = [...carbs.values()].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return scaleSessions(sc, (d) => {
    const c = carbs.get(addDays(d, -1));
    return c != null && c > mid ? pct : 0;
  });
}

/** Strength fading by `pct` % over the last `days`, reaching it on the last day. */
export function strengthFade(sc: ShowcaseScenario, days: number, pct: number): ShowcaseScenario {
  const from = addDays(sc.endDate, -days);
  return scaleSessions(sc, (d) => Math.max(0, Math.min(1, dayDiff(from, d) / days)) * pct);
}

// ── Moving the dates ──

const DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

/** Every value or key starting with a date, anywhere in `v`, moved by `n` days; times and everything else kept. */
function shiftDeep(v: unknown, n: number): unknown {
  if (typeof v === "string") return DATE_PREFIX.test(v) ? addDays(v.slice(0, 10), n) + v.slice(10) : v;
  if (Array.isArray(v)) return v.map((x) => shiftDeep(x, n));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [DATE_PREFIX.test(k) ? shiftDeep(k, n) : k, shiftDeep(x, n)]));
  return v;
}

/** The whole scenario moved by `n` days, so every record keeps its place against the others. */
export function shiftScenario(sc: ShowcaseScenario, n: number): ShowcaseScenario {
  if (n === 0) return sc;
  const { rand, ...data } = sc;
  return { ...(shiftDeep(data, n) as Omit<ShowcaseScenario, "rand">), rand };
}

/** The showcase history, ending `today`. */
export function showcaseScenario(today: LocalDate): ShowcaseScenario {
  let sc = makeScenario(showcaseSpec());
  sc = shorterNights(sc, 28, 0.8);
  sc = sleepCost(sc, 3, 7.2, -6, 1.5);
  sc = higherCarbs(sc, 2);
  sc = strengthFade(sc, 35, -1.5);
  return shiftScenario(sc, dayDiff(SHOWCASE_REF_END, today));
}
