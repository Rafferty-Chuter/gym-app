/**
 * "How it's going" on Home: a rolling read of the last 7 days, one row
 * per pillar, each one number and one plain judgement. It sits between
 * today (the Today strip) and the weekly report: always current, never a
 * list of what was missed. Pure: built from two week reports over rolling
 * windows (lib/physique/weekReport.ts).
 *
 * The goal picks the rows and their order (B3, as the scorecard): a cut
 * leads with the rate against plan, a lean gain too, a recomp with the
 * waist, and without a physique goal the health reads lead.
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
import { RHR_FLAG_BPM } from "@/lib/physique/recovery";
import { WAKE_SPREAD_MIN } from "@/lib/physique/sleepScore";
import { formatBodyWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import type { GoalType } from "@/lib/physique/types";
import { FIBRE_GOOD_SHARE, FIBRE_TARGET_G, INTAKE_ON_TARGET_KCAL, MAINTAIN_BAND_KG, PROTEIN_GOOD_SHARE, sleepAgainstUsual, STEPS_GOOD, TRAINING_DAYS_GOOD, WAIST_HOLD_CM, focusFor, planMargin, rateVsPlan, type Focus, type Tone } from "@/lib/physique/weekScorecard";

// ── Thresholds ──

/** Days in the rolling window. OURS: one week, the unit every target is set in. */
export const PULSE_DAYS = 7;
/** A row speaks once its kind has this many days in the window. OURS: three of seven, the weekly report's own floor. */
export const PULSE_MIN_DAYS = 3;
/** A week with no sessions is only mentioned for someone who trained within this many days. OURS: four weeks. */
export const TRAINING_RECENT_DAYS = 28;
/** Rows at most. OURS: one glance, the weekly report holds the rest. */
export const PULSE_MAX_ROWS = 6;

// ── Types ──

export type PulseId = "rate" | "waist" | "weight" | "calories" | "protein" | "training" | "priority" | "sleep" | "wake" | "fibre" | "steps" | "rhr";

/** Rows per goal, in order, then the fallbacks that fill in for rows without data. OURS (the purpose audit's B3 table). */
export const FOCUS_ROWS: Record<Focus, readonly PulseId[]> = {
  cut: ["rate", "calories", "protein", "training", "sleep"],
  gain: ["rate", "calories", "training", "priority", "protein", "sleep"],
  recomp: ["waist", "weight", "training", "protein", "sleep"],
  health: ["wake", "training", "protein", "fibre", "steps", "rhr"],
};
export const FOCUS_ROW_FALLBACK: Record<Focus, readonly PulseId[]> = {
  cut: [],
  gain: [],
  recomp: ["calories"],
  health: ["sleep", "calories"],
};

export type PulseRow = {
  id: PulseId;
  label: string;
  /** One number, formatted. */
  value: string;
  /** One short judgement against the target. */
  note: string;
  tone: Tone;
  /** Where the row opens; null when nothing in the app shows more (steps). */
  href: string | null;
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
  /** The active goal's type; null reads health. */
  goalType?: GoalType | null;
  /** The goal's planned rate, signed %/wk. */
  planRatePct?: number | null;
  /** On a gain, the top of the lean-gain band (`rateBands`). */
  gainCeilingPct?: number | null;
  unit?: WeightUnit;
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
  if (f.complete < PULSE_MIN_DAYS || f.meanProteinG == null) return null;
  if (f.proteinDaysHit == null) {
    // No target without a goal: the amount per kg of bodyweight is the plain read.
    return { id: "protein", label: "Protein", value: `${n(f.meanProteinG)} g a day`, note: f.proteinGPerKg != null ? `${f.proteinGPerKg.toFixed(1)} g/kg` : "No target set", tone: "neutral", href: "/food" };
  }
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

function trainingRow({ recent, trainedRecently, strength, goalType }: PulseInputs): PulseRow | null {
  const t = recent.training;
  if (t.sessions === 0) {
    // A rest week is not a failing; it is said once, without a warning colour.
    return trainedRecently ? { id: "training", label: "Training", value: "No sessions", note: "In the last 7 days", tone: "neutral", href: "/train" } : null;
  }
  if (focusFor(goalType) === "health") {
    const good = t.days >= TRAINING_DAYS_GOOD;
    return { id: "training", label: "Training", value: `${t.days} ${t.days === 1 ? "day" : "days"}`, note: good ? "Twice or more" : "Once", tone: good ? "good" : "neutral", href: "/train" };
  }
  const value = `${t.sessions} ${t.sessions === 1 ? "session" : "sessions"}`;
  const base = strength && strength !== "unclear" ? STRENGTH_NOTE[strength] : { note: `${t.hardSets} hard sets`, tone: "neutral" as Tone };
  // A gain or a recomp aims to raise its lifts, so holding is no judgement there, as on the scorecard.
  const focus = focusFor(goalType);
  const read = strength === "holding" && (focus === "gain" || focus === "recomp") ? { ...base, tone: "neutral" as Tone } : base;
  return { id: "training", label: "Training", value, ...read, href: "/train" };
}

function sleepRow({ recent }: PulseInputs): PulseRow | null {
  const s = recent.sleep;
  if (s.nights < PULSE_MIN_DAYS || s.meanH == null) return null;
  const read = sleepAgainstUsual(s.meanH, s.usualH);
  return { id: "sleep", label: "Sleep", value: `${minutes(s.meanH)} a night`, href: "/sleep", note: read.text, tone: read.tone };
}

const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(2)} %/wk`;

function rateRow({ recent, goalType, planRatePct, gainCeilingPct }: PulseInputs): PulseRow | null {
  const rate = recent.weight.ratePctPerWeek;
  const vs = rateVsPlan(rate, planRatePct, focusFor(goalType), gainCeilingPct, planMargin(recent, planRatePct));
  if (!vs || rate == null) return null;
  return { id: "rate", label: "Weight", value: signedPct(rate), note: vs.text, tone: vs.tone, href: "/body" };
}

function waistRow({ recent }: PulseInputs): PulseRow | null {
  const w = recent.waist;
  if (w.deltaCm == null || w.latestCm == null) return null;
  const d = w.deltaCm;
  const base = { id: "waist" as const, label: "Waist", value: `${w.latestCm.toFixed(1)} cm`, href: "/body" };
  if (Math.abs(d) < WAIST_HOLD_CM) return { ...base, note: "Holding", tone: "neutral" };
  return d < 0 ? { ...base, note: `Down ${Math.abs(d).toFixed(1)} cm`, tone: "good" } : { ...base, note: `Up ${d.toFixed(1)} cm`, tone: "watch" };
}

function weightRow({ recent, unit = "kg" }: PulseInputs): PulseRow | null {
  const w = recent.weight;
  if (w.endTrendKg == null || w.deltaKg == null) return null;
  const base = { id: "weight" as const, label: "Weight", value: formatBodyWeight(w.endTrendKg, unit), href: "/body" };
  if (Math.abs(w.deltaKg) <= MAINTAIN_BAND_KG) return { ...base, note: "Holding", tone: "good" };
  const v = kgToDisplay(Math.abs(w.deltaKg), unit).toFixed(1);
  return { ...base, note: `${w.deltaKg > 0 ? "Up" : "Down"} ${v} ${unit}`, tone: "watch" };
}

/** Priority muscles over the 7 days through yesterday: a whole week, so "under" is a read, not "so far". */
function priorityRow({ food }: PulseInputs): PulseRow | null {
  const p = food.training.priority;
  if (!p || food.training.sessions === 0) return null;
  const base = { id: "priority" as const, label: "Priority", value: `${p.inRange} of ${p.muscles} in range`, href: "/signal/volume" };
  if (p.over.length) return { ...base, note: `${p.over[0]}${p.over.length > 1 ? " +" : ""} over`, tone: "watch" };
  if (p.under.length) return { ...base, note: `${p.under[0]}${p.under.length > 1 ? " +" : ""} under`, tone: "watch" };
  return { ...base, note: "All in range", tone: "good" };
}

function wakeRow({ recent }: PulseInputs): PulseRow | null {
  const spread = recent.sleep.wakeSpreadMin;
  if (spread == null) return null;
  const tone: Tone = spread <= WAKE_SPREAD_MIN.good ? "good" : spread > WAKE_SPREAD_MIN.fair ? "watch" : "neutral";
  return { id: "wake", label: "Wake time", value: `±${spread} min`, note: spread <= WAKE_SPREAD_MIN.good ? "Regular" : spread > WAKE_SPREAD_MIN.fair ? "Irregular" : "Fairly regular", tone, href: "/sleep" };
}

function fibreRow({ food }: PulseInputs): PulseRow | null {
  const g = food.food.meanFibreG;
  if (g == null) return null;
  const ok = g >= FIBRE_TARGET_G * FIBRE_GOOD_SHARE;
  return { id: "fibre", label: "Fibre", value: `${n(g)} g a day`, note: ok ? "On target" : `${n(FIBRE_TARGET_G - g)} g under`, tone: ok ? "good" : "watch", href: "/food" };
}

/** Steps through yesterday: today is still counting. */
function stepsRow({ food }: PulseInputs): PulseRow | null {
  const s = food.health.meanSteps;
  if (s == null) return null;
  return { id: "steps", label: "Steps", value: `${n(s)} a day`, note: s >= STEPS_GOOD ? `Over ${n(STEPS_GOOD)}` : `Under ${n(STEPS_GOOD)}`, tone: s >= STEPS_GOOD ? "good" : "neutral", href: null };
}

function rhrRow({ recent }: PulseInputs): PulseRow | null {
  const h = recent.health;
  if (h.meanRhr == null) return null;
  const base = { id: "rhr" as const, label: "Resting HR", value: `${h.meanRhr} bpm`, href: "/sleep" };
  if (h.usualRhr == null) return { ...base, note: "No usual yet", tone: "neutral" };
  const d = h.meanRhr - h.usualRhr;
  return d >= RHR_FLAG_BPM ? { ...base, note: `+${d} vs usual`, tone: "watch" } : { ...base, note: "Near usual", tone: "good" };
}

const ROW: Record<PulseId, (i: PulseInputs) => PulseRow | null> = {
  rate: rateRow,
  waist: waistRow,
  weight: weightRow,
  calories: caloriesRow,
  protein: proteinRow,
  training: trainingRow,
  priority: priorityRow,
  sleep: sleepRow,
  wake: wakeRow,
  fibre: fibreRow,
  steps: stepsRow,
  rhr: rhrRow,
};

/** The goal's rows that have enough data, in its order, then fallbacks, up to PULSE_MAX_ROWS. Empty when nothing has. */
export function howItsGoing(i: PulseInputs): PulseRow[] {
  const focus = focusFor(i.goalType);
  const out: PulseRow[] = [];
  for (const id of new Set([...FOCUS_ROWS[focus], ...FOCUS_ROW_FALLBACK[focus]])) {
    if (out.length >= PULSE_MAX_ROWS) break;
    const r = ROW[id](i);
    if (r) out.push(r);
  }
  return out;
}
