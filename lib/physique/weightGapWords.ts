/**
 * The words for why the weight isn't moving as calories predict (IN3).
 * kg a week first; each cause in its own numbers, which point at the
 * person's own lever (B, 08): steps, carbs, logging. Never fat, never
 * advice. Pure.
 */

import { ACTIVE_MIN_CHANGE, type SinceStart, type WeightGapCause, type WeightGapRead, type WorkoutChange } from "@/lib/physique/weightGap";
import { ACTIVITY_PLURAL } from "@/lib/health/extras";
import type { LocalDate } from "@/lib/dates";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const n = (v: number) => Math.round(Math.abs(v)).toLocaleString("en-GB");
const n10 = (v: number) => (Math.round(Math.abs(v) / 10) * 10).toLocaleString("en-GB");
/** Steps to the hundred: "11,100", not "11,087". */
const n100 = (v: number) => (Math.round(Math.abs(v) / 100) * 100).toLocaleString("en-GB");
/** "13 Aug", kept on one line. */
const shortDate = (d: LocalDate) => `${Number(d.slice(8, 10))}\u00a0${MONTHS[Number(d.slice(5, 7)) - 1] ?? ""}`;
const plural = (k: number, one: string) => `${k} ${one}${k === 1 ? "" : "s"}`;

/** Change in steps since the goal began before the short line leads with it. OURS: about 70 kcal a day for most people, as the weekly card's own floor. */
export const SHORT_STEPS_CHANGE = 2000;
/** Change in active energy since the goal began before the short line leads with it, kcal a day. OURS (IN8): half as much again as the window's own floor, as for steps. */
export const SHORT_ACTIVE_CHANGE = 150;
/** What is left over before it is said, kg a week. OURS: under this it rounds to nothing at one decimal. */
export const SAY_LEFT_KG_WK = 0.05;

type Read = { scale: WeightGapRead | null; sinceStart: SinceStart | null };

/** Sessions a week to the half: "3", "1.5". */
const perWeek = (v: number) => String(Math.round(v * 2) / 2);
/** "runs 3 → 1 a week" (IN8). */
const workoutsBit = (w: WorkoutChange) => `${ACTIVITY_PLURAL[w.activity]} ${perWeek(w.fromPerWeek)} → ${perWeek(w.toPerWeek)} a week`;

function causeLine(c: WeightGapCause, kg: (x: number) => string, span: string): string {
  switch (c.kind) {
    case "steps": {
      const fell = c.toSteps < c.fromSteps;
      return `Steps ${fell ? "fell" : "rose"} from ${n100(c.fromSteps)} to ${n100(c.toSteps)} a day over the ${span}: about ${n10(c.kcalPerDay)} kcal a day ${fell ? "less" : "more"} burned, about ${kg(Math.abs(c.kgPerWeek))} a week of it.`;
    }
    case "active": {
      const fell = c.toKcal < c.fromKcal;
      const behind = [c.workouts ? workoutsBit(c.workouts) : null, c.steps ? `steps ${n100(c.steps.from)} → ${n100(c.steps.to)} a day` : null].filter((x): x is string => x != null);
      return `Active energy ${fell ? "fell" : "rose"} from ${n10(c.fromKcal)} to ${n10(c.toKcal)} kcal a day over the ${span}, about ${kg(Math.abs(c.kgPerWeek))} a week of it${behind.length ? ` (${behind.join(", ")})` : ""}.`;
    }
    case "water":
      return c.toCarbsG > c.fromCarbsG
        ? `Carbs rose from ${n(c.fromCarbsG)} to ${n(c.toCarbsG)} g a day over the ${span}; the water they hold adds about ${kg(Math.abs(c.kgPerWeek))} a week to the trend.`
        : `Carbs fell from ${n(c.fromCarbsG)} to ${n(c.toCarbsG)} g a day over the ${span}; the water they held left with them, about ${kg(Math.abs(c.kgPerWeek))} a week off the trend.`;
    case "event":
      return c.type === "creatine_start" ? `Creatine started ${shortDate(c.date)}; it holds water in the first weeks.` : `Carbs changed ${shortDate(c.date)}; a change in carbs moves the water held for a week or two.`;
    case "logging": {
      const bits = [c.unlogged ? `${plural(c.unlogged, "day")} not logged` : null, c.partial ? `${plural(c.partial, "day")} logged in part` : null].filter((x): x is string => x != null);
      const joined = bits.length === 2 ? `${bits[0]} and ${bits[1]}` : bits[0];
      return `${joined.charAt(0).toUpperCase()}${joined.slice(1)} in the last ${span}, so the intake above may read low.`;
    }
  }
}

/** IN8: active energy since the goal began, when it moved past its floor the way maintenance did. */
function activeMoved(s: SinceStart, min: number): s is SinceStart & { activeFrom: number; activeTo: number } {
  return s.activeFrom != null && s.activeTo != null && Math.abs(s.activeFrom - s.activeTo) >= min && s.activeTo < s.activeFrom === s.maintTo < s.maintFrom;
}

function sinceStartLine(s: SinceStart): string {
  const fell = s.maintTo < s.maintFrom;
  const head = `Maintenance has gone from about ${n10(s.maintFrom)} to ${n10(s.maintTo)} kcal since ${shortDate(s.since)}`;
  // Active energy in place of steps when both ends have it (IN8); either only when it moved the way maintenance did: less burned, lower maintenance.
  if (s.activeFrom != null && s.activeTo != null) {
    return activeMoved(s, ACTIVE_MIN_CHANGE) ? `${head}; active energy ${fell ? "fell" : "rose"} from ${n10(s.activeFrom)} to ${n10(s.activeTo)} kcal a day in that time.` : `${head}.`;
  }
  const steps = s.stepsKcal != null && s.stepsFrom != null && s.stepsTo != null && (s.stepsKcal > 0) === fell ? `; steps ${s.stepsTo < s.stepsFrom ? "fell" : "rose"} from ${n100(s.stepsFrom)} to ${n100(s.stepsTo)} a day in that time, about ${n10(s.stepsKcal)} kcal of it` : "";
  return `${head}${steps}.`;
}

/**
 * The lines for the weekly card's weight link: the gap between the scale
 * and the calories, its causes, what is left, then maintenance since the
 * goal began. Empty when there is nothing to say.
 */
export function weightGapLines(r: Read, kg: (x: number) => string, span: string): string[] {
  const out: string[] = [];
  const g = r.scale;
  if (g) {
    out.push(`The scale trend is ${kg(Math.abs(g.gapKgWk))} a week ${g.gapKgWk > 0 ? "above" : "below"} what your calories predict.`);
    for (const c of g.causes) out.push(causeLine(c, kg, span));
    if (Math.abs(g.unexplainedKgWk) >= SAY_LEFT_KG_WK) {
      out.push(g.causes.length ? `That leaves about ${kg(Math.abs(g.unexplainedKgWk))} a week nothing logged accounts for; the maintenance estimate takes it in as weeks come in.` : "Nothing logged accounts for it; the maintenance estimate takes it in as weeks come in.");
    }
  }
  if (r.sinceStart) out.push(sinceStartLine(r.sinceStart));
  return out;
}

/**
 * One line under the goal card: steps since the goal began when they moved
 * a lot, else the window's largest cause, else null.
 */
export function weightGapShort(r: Read): string | null {
  const s = r.sinceStart;
  if (s && activeMoved(s, SHORT_ACTIVE_CHANGE)) return `Active energy ${n10(s.activeFrom)} → ${n10(s.activeTo)} kcal a day since ${shortDate(s.since)}`;
  if (s && s.activeFrom == null && s.stepsFrom != null && s.stepsTo != null && Math.abs(s.stepsFrom - s.stepsTo) >= SHORT_STEPS_CHANGE && (s.stepsTo < s.stepsFrom) === (s.maintTo < s.maintFrom)) {
    return `Steps ${n100(s.stepsFrom)} → ${n100(s.stepsTo)} a day since ${shortDate(s.since)}`;
  }
  const c = r.scale?.causes[0];
  if (!c) return null;
  switch (c.kind) {
    case "steps":
      return `Steps ${n100(c.fromSteps)} → ${n100(c.toSteps)} a day`;
    case "active":
      return `Active energy ${n10(c.fromKcal)} → ${n10(c.toKcal)} kcal a day${c.workouts ? ` · ${workoutsBit(c.workouts)}` : ""}`;
    case "water":
      return `Carbs ${n(c.fromCarbsG)} → ${n(c.toCarbsG)} g a day, which holds water`;
    case "event":
      return c.type === "creatine_start" ? `Creatine started ${shortDate(c.date)}` : `Carbs changed ${shortDate(c.date)}`;
    case "logging":
      return `${plural(c.unlogged + c.partial, "day")} not fully logged`;
  }
}
