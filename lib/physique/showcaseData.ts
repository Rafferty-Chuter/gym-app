/**
 * The showcase history: made-up data built so the app's findings can be
 * shown to strangers (testers, posts) with screenshots. Each screenshot is
 * captioned as example data, never as someone's own log.
 *
 * The person: 84 kg, cutting towards 74 kg at 0.5% a week, squat and bench
 * three times a week, an Apple Watch on every night, carbs swinging from day
 * to day at much the same calories. What is built in (SHOWCASE_EFFECTS):
 * top sets lighter after shorter nights, after lower-carb days, on lower-HRV
 * mornings and after a 2-day break rather than the weekend's 3, each by a
 * few percent; and a last month of nights 48 minutes shorter, with HRV 12%
 * lower and resting HR 3 bpm higher, and strength fading 1.5% over the last
 * 5 weeks of the cut, so the "Short sleep, lifts not progressing" finding
 * has something to catch.
 * Protein, calories against maintenance and the weight trend move nothing,
 * so their rows stay quiet, as most rows do in a real log.
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
import { gaussian, makeScenario, mulberry32, type ScenarioSpec } from "@/lib/physique/fixtures";

export type ShowcaseScenario = ReturnType<typeof makeScenario>;

/** The day the showcase is built to end on, before it is moved to today. */
export const SHOWCASE_REF_END: LocalDate = "2026-10-22";
/** Days of history: the 16 weeks Connections reads. */
export const SHOWCASE_DAYS = 112;
/** Picked from 200 seeds read by the real engine: sleep comes first, the four built-in links show and nothing else does, the finding fires, and the weight stays on plan. */
export const SHOWCASE_SEED = 15;

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
      { name: "Squat", startE1rm: 155, profile: "linear", changePct: 3, perWeek: 3, cv: 0.01 },
      { name: "Bench Press", startE1rm: 112, profile: "linear", changePct: 2, perWeek: 3, cv: 0.01 },
    ],
  };
}

// ── Effects ──

/** How strongly each condition moves the top sets, in % of the set, and the data around them. */
export type ShowcaseEffects = {
  /** % per hour of sleep the night before, against `sleepRefH`, within [`sleepFloorPct`, `sleepCapPct`]. */
  sleepPerHour: number;
  sleepRefH: number;
  sleepFloorPct: number;
  sleepCapPct: number;
  /** % per 100 g of carbs the day before, against the median day, within ±`carbsCapPct`. */
  carbsPer100g: number;
  carbsCapPct: number;
  /** % after 3 or more days since the last session. */
  longBreakPct: number;
  /** % per 1% of HRV that morning against the median morning, within ±`hrvCapPct`. */
  hrvPerPct: number;
  hrvCapPct: number;
  /** The last 4 weeks' nights this many hours shorter. */
  shortMonthH: number;
  /** Strength fading by `fadePct` % over the last `fadeDays`, as it can late in a long cut. */
  fadePct: number;
  fadeDays: number;
  /** Day-to-day swing of carbs at the same calories (fat makes up the difference), SD in g. */
  macroSdG: number;
};

/**
 * The sizes used, the smallest that the engine's strict bar still shows at
 * three sessions a week: a few percent each, within the day-to-day swing of
 * a lifter's top sets, so the list reads like a real person's.
 */
export const SHOWCASE_EFFECTS: ShowcaseEffects = {
  sleepPerHour: 2.2,
  sleepRefH: 7.2,
  sleepFloorPct: -6,
  sleepCapPct: 1.5,
  carbsPer100g: 2.5,
  carbsCapPct: 3,
  longBreakPct: 1,
  hrvPerPct: 0.06,
  hrvCapPct: 2.5,
  shortMonthH: 0.8,
  fadePct: -1.5,
  fadeDays: 35,
  macroSdG: 45,
};

type Effect = (date: LocalDate) => number;

/** Every set of every session scaled by the effects' summed %, rounded once to 2.5 kg plates. */
function applyEffects(sc: ShowcaseScenario, effects: readonly Effect[]): ShowcaseScenario {
  return {
    ...sc,
    workouts: sc.workouts.map((w) => {
      const d = w.completedAt.slice(0, 10);
      const p = effects.reduce((sum, f) => sum + f(d), 0);
      if (!p) return w;
      return { ...w, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((st) => ({ ...st, weight: String(Math.round((parseFloat(st.weight) * (1 + p / 100)) / 2.5) * 2.5) })) })) };
    }),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const medianOf = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;

/** The last `days` nights `hours` shorter, never under 4h 30m asleep. */
export function shorterNights(sc: ShowcaseScenario, days: number, hours: number): ShowcaseScenario {
  const from = addDays(sc.endDate, -(days - 1));
  const cut = Math.round(hours * 60);
  return { ...sc, sleepNights: sc.sleepNights.map((n) => (n.date >= from ? { ...n, asleepMin: Math.max(270, n.asleepMin - cut), inBedMin: n.inBedMin == null ? n.inBedMin : Math.max(295, n.inBedMin - cut) } : n)) };
}

/**
 * Carbs swinging from day to day at the same calories, fat making up the
 * difference, as a real log does. Without it carbs are a fixed share of
 * calories, and the two can't be told apart.
 */
export function varyMacros(sc: ShowcaseScenario, sdG: number): ShowcaseScenario {
  const rand = mulberry32(sc.spec.seed + 7919);
  return {
    ...sc,
    foodEntries: sc.foodEntries.map((e) => {
      const carbsG = Math.max(60, Math.round(e.carbsG + gaussian(rand) * sdG));
      const fatG = Math.max(25, Math.round(e.fatG - ((carbsG - e.carbsG) * 4) / 9));
      return { ...e, carbsG, fatG };
    }),
  };
}

/** Sleep the night before: `sleepPerHour` % for each hour against `sleepRefH`. */
export function sleepEffect(sc: ShowcaseScenario, e: ShowcaseEffects): Effect {
  const hours = new Map(sc.sleepNights.map((n) => [n.date, n.asleepMin / 60]));
  return (d) => {
    const h = hours.get(d);
    return h == null ? 0 : clamp(e.sleepPerHour * (h - e.sleepRefH), e.sleepFloorPct, e.sleepCapPct);
  };
}

/** Carbs the day before: `carbsPer100g` % for each 100 g against the median day. */
export function carbsEffect(sc: ShowcaseScenario, e: ShowcaseEffects): Effect {
  const carbs = new Map<LocalDate, number>();
  for (const f of sc.foodEntries) carbs.set(f.date, (carbs.get(f.date) ?? 0) + f.carbsG);
  const mid = medianOf([...carbs.values()]);
  return (d) => {
    const c = carbs.get(addDays(d, -1));
    return c == null ? 0 : clamp((e.carbsPer100g * (c - mid)) / 100, -e.carbsCapPct, e.carbsCapPct);
  };
}

/** Days since the last session: `longBreakPct` % after 3 or more. */
export function breakEffect(sc: ShowcaseScenario, e: ShowcaseEffects): Effect {
  const dates = [...new Set(sc.workouts.map((w) => w.completedAt.slice(0, 10)))].sort();
  const long = new Set(dates.filter((d, i) => i > 0 && dayDiff(dates[i - 1], d) >= 3));
  return (d) => (long.has(d) ? e.longBreakPct : 0);
}

/** HRV that morning: `hrvPerPct` % for each 1% against the median morning. */
export function hrvEffect(sc: ShowcaseScenario, e: ShowcaseEffects): Effect {
  const hrv = new Map(sc.sleepNights.filter((n) => typeof n.hrvMs === "number").map((n) => [n.date, n.hrvMs as number]));
  const mid = medianOf([...hrv.values()]);
  return (d) => {
    const h = hrv.get(d);
    return h == null || !(mid > 0) ? 0 : clamp(e.hrvPerPct * (h / mid - 1) * 100, -e.hrvCapPct, e.hrvCapPct);
  };
}

/** Strength fading by `fadePct` % over the last `fadeDays`, reaching it on the last day. */
export function fadeEffect(sc: ShowcaseScenario, e: ShowcaseEffects): Effect {
  const from = addDays(sc.endDate, -e.fadeDays);
  return (d) => clamp(dayDiff(from, d) / e.fadeDays, 0, 1) * e.fadePct;
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

/** The history as built, ending SHOWCASE_REF_END: the spec's data with the month of short nights, the swinging macros and every effect. */
export function buildShowcase(spec: ScenarioSpec, e: ShowcaseEffects): ShowcaseScenario {
  let sc = makeScenario(spec);
  sc = shorterNights(sc, 28, e.shortMonthH);
  sc = varyMacros(sc, e.macroSdG);
  return applyEffects(sc, [sleepEffect(sc, e), carbsEffect(sc, e), breakEffect(sc, e), hrvEffect(sc, e), fadeEffect(sc, e)]);
}

/** The showcase history, ending `today`. */
export function showcaseScenario(today: LocalDate): ShowcaseScenario {
  return shiftScenario(buildShowcase(showcaseSpec(), SHOWCASE_EFFECTS), dayDiff(SHOWCASE_REF_END, today));
}
