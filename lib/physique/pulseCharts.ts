/**
 * The small charts on Home's "Last 7 days" tiles (H2). Each tile already
 * has one number and one judgement from `howItsGoing`; this adds the week
 * behind them, taken from the same two week reports, so a chart can never
 * disagree with the words next to it. Pure: data in, chart spec out; the
 * tile picks the colour.
 *
 * Silence beats false positives: a line needs two points and a bar chart
 * one logged day, otherwise the tile shows no chart rather than an empty
 * frame that looks like a reading.
 */

import { addDays, type LocalDate } from "@/lib/dates";
import type { PulseId } from "@/lib/physique/howItsGoing";
import type { WeekReport } from "@/lib/physique/weekReport";
import { FIBRE_TARGET_G, STEPS_GOOD } from "@/lib/physique/weekScorecard";

// ── Thresholds ──

/** Smallest weight range a trend line is drawn over, kg. OURS: a week's trend moves 0.1 to 0.6 kg, so a flat week reads flat instead of filling the box. */
export const WEIGHT_MIN_SPAN_KG = 0.6;
/** Smallest waist range, cm. OURS: under a centimetre is tape noise (WAIST_HOLD_CM territory). */
export const WAIST_MIN_SPAN_CM = 1.5;
/** Smallest resting heart rate range, bpm. OURS: night-to-night RHR wanders 2 to 3 bpm. */
export const RHR_MIN_SPAN_BPM = 6;
/** Wake dots are drawn within this many minutes of the week's mean. OURS: the Sleep tab's consistency chart scale. */
export const WAKE_DOT_RANGE_MIN = 90;
/** Waist entries are read over this many days to the week's end. EVID: the weekly report's 28-day waist window. */
export const WAIST_CHART_DAYS = 28;

// ── Types ──

export type PulseChart =
  /** One bar a day; null is a day with nothing logged (a stub). `faded` marks partial food days. */
  | { kind: "bars"; values: Array<number | null>; faded: boolean[]; target: number | null; dates: LocalDate[] }
  /** A line through the points in order; null leaves a gap. */
  | { kind: "line"; values: Array<number | null>; minSpan: number; dates: LocalDate[] }
  /** Wake times as minutes from the week's mean wake time; `wakeMin` keeps each on the night axis for its clock time. */
  | { kind: "dots"; values: Array<number | null>; range: number; dates: LocalDate[]; wakeMin: Array<number | null> }
  /** A count of parts in range out of a total (priority muscles). */
  | { kind: "meter"; filled: number; total: number };

export type PulseChartInputs = {
  /** The 7 days through today. */
  recent: WeekReport;
  /** The 7 days through yesterday (food). */
  food: WeekReport;
  /** Waist entries, any order; only the last WAIST_CHART_DAYS to `recent.through` are drawn. */
  waist?: ReadonlyArray<{ date: LocalDate; cm: number }>;
};

const present = (vals: ReadonlyArray<number | null>) => vals.filter((v): v is number => v != null);

function bars(dates: LocalDate[], values: Array<number | null>, target: number | null, faded?: boolean[]): PulseChart | null {
  if (present(values).length === 0) return null;
  return { kind: "bars", values, faded: faded ?? values.map(() => false), target, dates };
}

function line(dates: LocalDate[], values: Array<number | null>, minSpan: number): PulseChart | null {
  return present(values).length >= 2 ? { kind: "line", values, minSpan, dates } : null;
}

/**
 * The chart for one Home row, or null when there is not enough to draw.
 * Food rows read the food week (through yesterday, as their numbers do);
 * the rest read the week through today.
 */
export function pulseChart(id: PulseId, { recent, food, waist = [] }: PulseChartInputs): PulseChart | null {
  const r = recent.days;
  const f = food.days;
  const rd = r.map((d) => d.date);
  const fd = f.map((d) => d.date);
  switch (id) {
    case "rate":
    case "weight":
      return line(rd, r.map((d) => d.trendKg), WEIGHT_MIN_SPAN_KG);
    case "calories":
      return bars(fd, f.map((d) => d.kcal), food.food.targetKcal, f.map((d) => d.foodPartial));
    case "protein":
      return bars(fd, f.map((d) => d.proteinG), food.food.targetProteinG);
    case "fibre":
      return bars(fd, f.map((d) => d.fibreG), FIBRE_TARGET_G);
    case "training":
      // Rest days are zero, not missing: a training week always has seven slots.
      return recent.training.sessions > 0 ? { kind: "bars", values: r.map((d) => d.hardSets), faded: r.map(() => false), target: null, dates: rd } : null;
    case "priority": {
      const p = recent.training.priority;
      return p && p.muscles > 0 ? { kind: "meter", filled: p.inRange, total: p.muscles } : null;
    }
    case "sleep":
      return bars(rd, r.map((d) => d.asleepH), recent.sleep.goalH);
    case "wake": {
      const wakes = present(r.map((d) => d.wakeMin));
      if (wakes.length < 2) return null;
      const mid = wakes.reduce((s, v) => s + v, 0) / wakes.length;
      return { kind: "dots", values: r.map((d) => (d.wakeMin == null ? null : d.wakeMin - mid)), range: WAKE_DOT_RANGE_MIN, dates: rd, wakeMin: r.map((d) => d.wakeMin) };
    }
    case "steps":
      return bars(rd, r.map((d) => d.steps), STEPS_GOOD);
    case "rhr":
      return line(rd, r.map((d) => d.rhr), RHR_MIN_SPAN_BPM);
    case "waist": {
      const from = addDays(recent.through, -(WAIST_CHART_DAYS - 1));
      const pts = waist.filter((w) => w.date >= from && w.date <= recent.through && w.cm > 0).sort((a, b) => (a.date < b.date ? -1 : 1));
      return line(pts.map((w) => w.date), pts.map((w) => w.cm), WAIST_MIN_SPAN_CM);
    }
  }
}
