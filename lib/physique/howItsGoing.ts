/**
 * "How it's going" on Home: a rolling read of the last 7 days, one row
 * per pillar, each one number and one plain judgement. It sits between
 * today (the Today strip) and the weekly report: always current, never a
 * list of what was missed. Pure: built from two week reports over rolling
 * windows (lib/physique/weekReport.ts).
 *
 * Silence beats false positives: a row without enough days of its kind is
 * left out rather than shown empty, and nothing here counts missed days.
 */

import { addDays, type LocalDate, type Now } from "@/lib/dates";
import { workoutDate } from "@/lib/physique/strength";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { StrengthStatus } from "@/lib/physique/types";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { WeekReport } from "@/lib/physique/weekReport";
import { INTAKE_ON_TARGET_KCAL, PROTEIN_GOOD_SHARE, SLEEP_GOOD_H, SLEEP_SHORT_H, type Tone } from "@/lib/physique/weekScorecard";

// ── Thresholds ──

/** Days in the rolling window. OURS: one week, the unit every target is set in. */
export const PULSE_DAYS = 7;
/** A row speaks once its kind has this many days in the window. OURS: three of seven, the weekly report's own floor. */
export const PULSE_MIN_DAYS = 3;
/** A week with no sessions is only mentioned for someone who trained within this many days. OURS: four weeks. */
export const TRAINING_RECENT_DAYS = 28;

// ── Types ──

export type PulseId = "calories" | "protein" | "training" | "sleep";

export type PulseRow = {
  id: PulseId;
  label: string;
  /** One number, formatted. */
  value: string;
  /** One short judgement against the target. */
  note: string;
  tone: Tone;
  href: string;
};

export type PulseInputs = {
  /** The 7 days through today: weight, training and sleep (last night belongs to today). */
  recent: WeekReport;
  /** The 7 days through yesterday: food, because today is still being logged. */
  food: WeekReport;
  /** The user has trained in the last four weeks, so a week without sessions is worth saying. */
  trainedRecently: boolean;
  /**
   * The strength engine's read of the main lifts since the phase began, the
   * same one the verdict uses, so Home never says "lifts holding" above
   * "lifts down". Null before there is one.
   */
  strength: StrengthStatus | null;
};

/** The windows' first days: `recent` ends today, `food` ends yesterday. */
export function pulseWindows(today: LocalDate): { recentStart: LocalDate; foodStart: LocalDate } {
  return { recentStart: addDays(today, -(PULSE_DAYS - 1)), foodStart: addDays(today, -PULSE_DAYS) };
}

/** True when a workout falls in the last TRAINING_RECENT_DAYS days. */
export function trainedRecently(workouts: readonly StoredWorkout[], now: Now): boolean {
  const from = addDays(now.today, -TRAINING_RECENT_DAYS);
  return workouts.some((w) => {
    const d = workoutDate(w, now.tz);
    return d != null && d >= from && d <= now.today;
  });
}

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const minutes = (h: number) => {
  const m = Math.round(h * 60);
  return m < 60 ? `${m} min` : formatHoursMin(m);
};

// ── Rows ──

function caloriesRow({ food }: PulseInputs): PulseRow | null {
  const f = food.food;
  if (f.complete < PULSE_MIN_DAYS || f.meanKcal == null) return null;
  const base = { id: "calories" as const, label: "Calories", value: `${n(f.meanKcal)} a day`, href: "/food" };
  if (f.deltaKcal == null) return { ...base, note: "No target set", tone: "neutral" };
  const d = f.deltaKcal;
  if (Math.abs(d) <= INTAKE_ON_TARGET_KCAL) return { ...base, note: "On target", tone: "good" };
  return { ...base, note: `${n(Math.abs(d))} ${d > 0 ? "over" : "under"}`, tone: "watch" };
}

function proteinRow({ food }: PulseInputs): PulseRow | null {
  const f = food.food;
  if (f.complete < PULSE_MIN_DAYS || f.meanProteinG == null || f.proteinDaysHit == null) return null;
  const hit = f.proteinDaysHit;
  return {
    id: "protein",
    label: "Protein",
    value: `${n(f.meanProteinG)} g a day`,
    note: hit === f.complete ? "On target daily" : `${hit} of ${f.complete} days on target`,
    tone: hit / f.complete >= PROTEIN_GOOD_SHARE ? "good" : "watch",
    href: "/food",
  };
}

/** The strength engine's words, as on Body. */
const STRENGTH_NOTE: Record<Exclude<StrengthStatus, "unclear">, { note: string; tone: Tone }> = {
  rising: { note: "Lifts rising", tone: "good" },
  holding: { note: "Lifts holding", tone: "good" },
  "one-lift": { note: "One lift down", tone: "watch" },
  dropping: { note: "Lifts dropping", tone: "watch" },
};

function trainingRow({ recent, trainedRecently, strength }: PulseInputs): PulseRow | null {
  const t = recent.training;
  if (t.sessions === 0) {
    // A rest week is not a failing; it is said once, without a warning colour.
    return trainedRecently ? { id: "training", label: "Training", value: "No sessions", note: "In the last 7 days", tone: "neutral", href: "/train" } : null;
  }
  const value = `${t.sessions} ${t.sessions === 1 ? "session" : "sessions"}`;
  const read = strength && strength !== "unclear" ? STRENGTH_NOTE[strength] : { note: `${t.hardSets} hard sets`, tone: "neutral" as Tone };
  return { id: "training", label: "Training", value, ...read, href: "/train" };
}

function sleepRow({ recent }: PulseInputs): PulseRow | null {
  const s = recent.sleep;
  if (s.nights < PULSE_MIN_DAYS || s.meanH == null) return null;
  const gap = s.goalH - s.meanH;
  const base = { id: "sleep" as const, label: "Sleep", value: `${minutes(s.meanH)} a night`, href: "/sleep" };
  if (gap <= SLEEP_GOOD_H) return { ...base, note: "On goal", tone: "good" };
  return { ...base, note: `${minutes(gap)} short`, tone: gap > SLEEP_SHORT_H ? "watch" : "neutral" };
}

/** The rows with enough data, in reading order: food, training, sleep. Empty when nothing has. */
export function howItsGoing(i: PulseInputs): PulseRow[] {
  return [caloriesRow(i), proteinRow(i), trainingRow(i), sleepRow(i)].filter((r): r is PulseRow => r != null);
}
