/**
 * More from Apple Health (IN8): workouts, the day's totals (active energy,
 * water, caffeine, sodium, drinks) and, only when the person opts in, wrist
 * temperature and cycle. Pure: shared by the Health Auto Export parser
 * (`lib/health/hae.ts`), the iPhone app's read (`lib/health/native.ts`) and
 * the ingest route's merge.
 *
 * Units are canonical once they leave here: kcal, ml, mg, minutes, metres,
 * °C, and drinks as a count. Health Auto Export lets the person pick units
 * per metric, so each is converted by the units the export names.
 */

import { addDays, dateRange } from "@/lib/dates";
import type { HealthActivity, HealthWorkout, MenstrualFlow } from "@/lib/physique/types";

// ── Limits ──

/** Most days one cycle entry is spread over. OURS: Health Auto Export sends a period as one entry from its first day to its last; past two weeks it is a malformed entry. */
export const CYCLE_MAX_DAYS = 14;
/** Most workouts kept for one day. OURS: a long day of sport is a handful; the cap only stops a runaway export. */
export const MAX_WORKOUTS_A_DAY = 20;
/** Longest workout kept, minutes. OURS: past a day it is a recording left running. */
export const MAX_WORKOUT_MIN = 24 * 60;
/** A wrist-temperature reading stamped at or after this clock (minutes after midnight) belongs to the night that wakes the next day. OURS: the watch dates the reading at bedtime. */
export const WRIST_TEMP_NEXT_DAY_FROM_MIN = 15 * 60;

const KJ_PER_KCAL = 4.184;
const ML_PER_FL_OZ_US = 29.5735;
const ML_PER_FL_OZ_IMP = 28.4131;
const ML_PER_CUP_US = 236.588;
const M_PER_MILE = 1609.344;

// ── Activities ──

const SPORT = /sport|soccer|football|tennis|basketball|rugby|cricket|hockey|volleyball|badminton|squash|golf|climb|boxing|martial|wrestl|fenc|lacrosse|baseball|softball|handball|pickleball|racquetball|ski|snowboard|skat|surf|dance|danc|polo|curling|bowling|archery|equestrian|disc|frisbee|paddle|sailing|play/;

/**
 * The group a workout belongs to, from HealthKit's activity type as the
 * plugin names it ("traditionalStrengthTraining") or Health Auto Export's
 * display name ("Outdoor Run", "Functional Strength Training").
 */
export function healthActivity(name: string): HealthActivity {
  const n = name
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .trim();
  if (/wheelchair/.test(n)) return "other";
  if (/\brun|running|treadmill|track and field/.test(n)) return "run";
  if (/walk|hik/.test(n)) return "walk";
  if (/cycl|bik|spin/.test(n)) return "cycle";
  if (/swim/.test(n)) return "swim";
  if (/\brow/.test(n)) return "row";
  if (/strength|weight|lift|core training|calisthenic|bench press|deadlift|squat|press|\bcurl\b|pull ?down|lunge|plank|crunch|sit up|back extension|raise|triceps/.test(n)) return "strength";
  if (/high intensity|hiit|interval|cross training|boot ?camp|cardio|elliptical|stair|step training|jump(ing)? (rope|jack)|skipping|burpee|fitness gaming|kickbox/.test(n)) return "cardio";
  if (/yoga|pilates|flexib|stretch|barre|tai chi|mind and body|cooldown|recovery|breath|meditat|twist/.test(n)) return "mobility";
  if (SPORT.test(n)) return "sport";
  return "other";
}

/** The plural noun for a group, for counts in a sentence: "3 runs a week". */
export const ACTIVITY_PLURAL: Readonly<Record<HealthActivity, string>> = {
  run: "runs",
  walk: "walks",
  cycle: "rides",
  swim: "swims",
  row: "rows",
  strength: "strength workouts",
  cardio: "cardio sessions",
  mobility: "yoga and mobility sessions",
  sport: "sport sessions",
  other: "other workouts",
};

// ── Units ──

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** Energy in kcal from a value and the units it came in (kJ converted; kcal and Cal as they are). */
export function toKcal(value: number, units: string): number {
  return /^kj$/i.test(units.trim()) ? value / KJ_PER_KCAL : value;
}

/** Volume in ml from a value and its units (ml by default). */
export function toMl(value: number, units: string): number {
  const u = units.trim().toLowerCase().replace(/\s+/g, "_");
  if (u === "l" || u === "liter" || u === "litre") return value * 1000;
  if (u === "dl") return value * 100;
  if (u === "cl") return value * 10;
  if (u.includes("imp")) return value * ML_PER_FL_OZ_IMP;
  if (u.includes("oz")) return value * ML_PER_FL_OZ_US;
  if (u.includes("cup")) return value * ML_PER_CUP_US;
  return value;
}

/** Mass in mg from a value and its units (mg by default). */
export function toMg(value: number, units: string): number {
  const u = units.trim().toLowerCase();
  if (u === "g") return value * 1000;
  if (u === "mcg" || u === "µg" || u === "ug") return value / 1000;
  return value;
}

/** Temperature in °C from a value and its units (°C by default). */
export function toCelsius(value: number, units: string): number {
  return /f/i.test(units) && !/cel/i.test(units) ? ((value - 32) * 5) / 9 : value;
}

/** Distance in metres from a value and its units (km, mi, m). */
export function toMetres(value: number, units: string): number | null {
  const u = units.trim().toLowerCase();
  if (u === "km") return value * 1000;
  if (u === "mi") return value * M_PER_MILE;
  if (u === "m") return value;
  return null;
}

// ── Workouts ──

/** A workout cleaned to the stored shape; null when its length can't be real. */
export function cleanWorkout(w: { name: string; start: string; durationMin: number; activeKcal?: number | null; distanceM?: number | null; app?: string | null }): HealthWorkout | null {
  if (!/^\d{2}:\d{2}$/.test(w.start) || !Number.isFinite(w.durationMin) || w.durationMin <= 0 || w.durationMin > MAX_WORKOUT_MIN) return null;
  const name = w.name.trim().slice(0, 60) || "Workout";
  const kcal = w.activeKcal != null && Number.isFinite(w.activeKcal) && w.activeKcal > 0 && w.activeKcal < 10_000 ? Math.round(w.activeKcal) : null;
  const metres = w.distanceM != null && Number.isFinite(w.distanceM) && w.distanceM > 0 && w.distanceM < 1_000_000 ? Math.round(w.distanceM) : null;
  return {
    activity: healthActivity(name),
    name,
    start: w.start,
    durationMin: Math.round(w.durationMin),
    ...(kcal != null ? { activeKcal: kcal } : {}),
    ...(metres != null ? { distanceM: metres } : {}),
    ...(w.app ? { app: w.app.slice(0, 60) } : {}),
  };
}

/** A day's workouts in start order, one per start time and activity, capped. */
export function sortWorkouts(list: readonly HealthWorkout[]): HealthWorkout[] {
  const byKey = new Map<string, HealthWorkout>();
  for (const w of list) byKey.set(`${w.start}|${w.activity}`, w);
  return [...byKey.values()].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0)).slice(0, MAX_WORKOUTS_A_DAY);
}

/**
 * A day's workouts merged with the ones already stored for it: Health Auto
 * Export sends only what is new since its last sync, so a second workout
 * on a day must not replace the first. One per start time and activity,
 * the newer copy winning.
 */
export function mergeWorkoutDay(stored: readonly HealthWorkout[] | null, incoming: readonly HealthWorkout[]): HealthWorkout[] {
  return sortWorkouts([...(stored ?? []), ...incoming]);
}

/** Workouts from a stored row's value, kept only when each is well formed. */
export function workoutsFromValue(v: unknown): HealthWorkout[] | null {
  const list = (v as { workouts?: unknown } | null)?.workouts;
  if (!Array.isArray(list)) return null;
  const out: HealthWorkout[] = [];
  for (const x of list) {
    const r = x as Record<string, unknown> | null;
    if (!r || typeof r.name !== "string" || typeof r.start !== "string") continue;
    const w = cleanWorkout({ name: r.name, start: r.start, durationMin: num(r.durationMin) ?? NaN, activeKcal: num(r.activeKcal), distanceM: num(r.distanceM), app: typeof r.app === "string" ? r.app : null });
    if (w) out.push(w);
  }
  return sortWorkouts(out);
}

// ── Cycle ──

const FLOWS: Readonly<Record<string, MenstrualFlow>> = { none: "none", unspecified: "unspecified", light: "light", medium: "medium", heavy: "heavy" };

/** Flow from Health Auto Export's word ("Medium") or HealthKit's category value (1 unspecified, 2 light, 3 medium, 4 heavy, 5 none). */
export function menstrualFlow(v: unknown): MenstrualFlow | null {
  if (typeof v === "string") return FLOWS[v.trim().toLowerCase()] ?? null;
  const n = num(v);
  return n === 1 ? "unspecified" : n === 2 ? "light" : n === 3 ? "medium" : n === 4 ? "heavy" : n === 5 ? "none" : null;
}

/**
 * The local days an entry covers, from its first day to its last. An end at
 * midnight belongs to the day before (HealthKit ends a day's entry at the
 * next midnight). Null past `CYCLE_MAX_DAYS`.
 */
export function entryDays(start: { day: string; clock: string }, end: { day: string; clock: string } | null): string[] | null {
  let last = end?.day ?? start.day;
  if (end && end.day > start.day && end.clock === "00:00") last = addDays(end.day, -1);
  if (last < start.day) last = start.day;
  const days = dateRange(start.day, last);
  return days.length > CYCLE_MAX_DAYS ? null : days;
}

/** The wake day a wrist-temperature reading belongs to: readings stamped in the evening are the night that ends the next morning. */
export function wristTempDay(at: { day: string; clock: string }): string {
  const [h, m] = at.clock.split(":").map(Number);
  return h * 60 + m >= WRIST_TEMP_NEXT_DAY_FROM_MIN ? addDays(at.day, 1) : at.day;
}
