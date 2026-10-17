/**
 * The Sleep tab's view model (05-design §9.6): the contributor words, the
 * bedtime planner, the last-night word and the one-sentence insight.
 * Everything reads the engine's night normalisation and debt from
 * `lib/physique/sleep.ts` and never re-derives a status.
 *
 * Pure. Words only, never a score (DESIGN.md). Hours are decimal hours and
 * clocks are "HH:MM" local.
 */

import { addDays, type LocalDate, type Now } from "@/lib/dates";
import { mean, stdev } from "@/lib/stats";
import {
  DEBT_WINDOW_NIGHTS,
  MIN_NIGHTS_FOR_STATUS,
  SLEEP_WINDOW_NIGHTS,
  clampSleepGoal,
  debt7,
  nightsByDate,
  nightsInWindow,
  type NormalizedNight,
} from "@/lib/physique/sleep";
import { ASLEEP_OFFSET_MIN, DEFAULT_WAKE, formatClock, formatHoursMin, parseClock } from "@/lib/physique/dayTotals";
import type { PhysiqueAnalysis, SleepNight } from "@/lib/physique/types";

// ── Constants (tags as in 02-engine-spec) ──

/** Nights a contributor needs in its 7-night window before it shows a word. OURS: with fewer, one odd night sets the word. */
export const CONTRIBUTOR_MIN_NIGHTS = 3;

/** Duration: the 7-night mean as a share of the goal. OURS, anchored to the goal (itself clamped 7–9 h, PUB): within 10% is Good, within 20% Fair. */
export const DURATION_RATIO = { excellent: 1.0, good: 0.9, fair: 0.8 } as const;

/** Efficiency (asleep ÷ in bed). Good ≥ 85% is the usual clinical cut-off (PUB, Ohayon 2017 NSF consensus); Excellent ≥ 90% and Fair ≥ 75% are OURS. */
export const EFFICIENCY = { excellent: 0.9, good: 0.85, fair: 0.75 } as const;

/** The three wake-up bands as a count per night. EVID (Ohayon 2017: one awakening a night or fewer is appropriate, four or more is not). */
export const WAKEUP_COUNT = { "0": 0, "1-2": 1.5, "3+": 3.5 } as const;
/** Mean wake-ups a night, at or below. Good follows Ohayon 2017 (EVID); Excellent and Fair are OURS. */
export const WAKEUPS = { excellent: 0.5, good: 2, fair: 3 } as const;
/** Mean wake-ups that empties the bar. OURS. */
export const WAKEUP_FILL_MAX = 4;

/** Consistency: sample SD of bedtime in minutes over 7 nights. Good ≤ 60 is the one-hour window in sleep-hygiene guidance and the social-jetlag cut-off (EVID, Wittmann 2006); Excellent ≤ 30 and Fair ≤ 90 are OURS. */
export const CONSISTENCY_SD_MIN = { excellent: 30, good: 60, fair: 90 } as const;
/** Spread that empties the bar. OURS. */
export const CONSISTENCY_FILL_MAX_MIN = 120;

/** Debt: hours short of the goal over the last 7 nights (`debt7`). OURS: 2 h is a quarter-night over a week, 5 h is most of a night. */
export const DEBT_H = { excellent: 0.5, good: 2, fair: 5 } as const;
/** Debt that empties the bar: an hour a night. OURS. */
export const DEBT_FILL_MAX_H = 7;

/** Planner: minutes to fall asleep, the same offset the logging prefill uses. OURS. */
export const FALL_ASLEEP_MIN = ASLEEP_OFFSET_MIN;
/** Tonight's need = goal + min(debt7 × share, cap), clamped. OURS: pay debt back over about three nights, never more than an hour extra. */
export const NEED_DEBT_SHARE = 1 / 3;
export const NEED_EXTRA_MAX_H = 1;
export const NEED_RANGE_H = { min: 7, max: 9.5 } as const;

/** Bedtimes wrap midnight, so they are measured from 18:00 (as the prefill does) before any spread is taken. */
const BEDTIME_ORIGIN_MIN = 18 * 60;

// ── Words ──

export type RatingWord = "Poor" | "Fair" | "Good" | "Excellent";

type Bands = { excellent: number; good: number; fair: number };

/** Higher is better: the first band the value reaches. */
function rateHigh(value: number, b: Bands): RatingWord {
  if (value >= b.excellent) return "Excellent";
  if (value >= b.good) return "Good";
  if (value >= b.fair) return "Fair";
  return "Poor";
}

/** Lower is better. */
function rateLow(value: number, b: Bands): RatingWord {
  if (value <= b.excellent) return "Excellent";
  if (value <= b.good) return "Good";
  if (value <= b.fair) return "Fair";
  return "Poor";
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function nightsN(n: number): string {
  return `${n} ${n === 1 ? "night" : "nights"}`;
}

function earlyDetail(n: number): string {
  return `${n} of ${DEBT_WINDOW_NIGHTS} nights · ${CONTRIBUTOR_MIN_NIGHTS} give a read`;
}

// ── Contributors ──

export type ContributorId = "duration" | "efficiency" | "wakeups" | "consistency" | "debt";

export type Contributor = {
  id: ContributorId;
  label: string;
  /** Null below the data gate; the UI shows "Early read". */
  word: RatingWord | null;
  /** 0..1, more is better; drives the 4px bar. */
  fill: number;
  detail: string;
};

/** Sample SD of bedtimes in minutes, measured from 18:00 so a 00:30 night sits next to a 23:30 one; null with fewer than two bedtimes. */
export function bedtimeSpreadMin(nights: readonly NormalizedNight[]): number | null {
  const beds = nights
    .map((n) => parseClock(n.night.bedtime))
    .filter((x): x is number => x !== null)
    .map((x) => (x - BEDTIME_ORIGIN_MIN + 1440) % 1440);
  if (beds.length < 2) return null;
  return stdev(beds);
}

const WAKEUP_DETAIL: Record<RatingWord, string> = {
  Excellent: "Rarely any",
  Good: "About 1 to 2 a night",
  Fair: "Often 3 or more",
  Poor: "3 or more most nights",
};

/**
 * The five contributor rows from the last 7 nights (05-design §9.6). Each
 * needs CONTRIBUTOR_MIN_NIGHTS nights with the field it reads; below that the
 * word is null and the detail says how many nights give a read.
 */
export function sleepContributors(nights: readonly SleepNight[], now: Now, sleepGoalH?: number): Contributor[] {
  const goalH = clampSleepGoal(sleepGoalH);
  const byDate = nightsByDate(nights);
  const week = nightsInWindow(byDate, now.today, DEBT_WINDOW_NIGHTS).filter((n) => n.valid);
  const n = week.length;
  const enough = n >= CONTRIBUTOR_MIN_NIGHTS;

  // Duration: the 7-night mean against the goal.
  const meanH = n > 0 ? mean(week.map((x) => x.asleepH)) : null;
  const duration: Contributor =
    enough && meanH !== null
      ? {
          id: "duration",
          label: "Duration",
          word: rateHigh(meanH / goalH, DURATION_RATIO),
          fill: clamp01(meanH / goalH),
          detail: `Avg ${formatHoursMin(meanH * 60)} of ${formatHoursMin(goalH * 60)} · ${nightsN(n)}`,
        }
      : { id: "duration", label: "Duration", word: null, fill: 0, detail: earlyDetail(n) };

  // Efficiency: asleep ÷ in bed, over the nights that logged time in bed.
  const effs = week
    .filter((x) => (x.night.inBedMin ?? 0) > 0)
    .map((x) => clamp01(x.night.asleepMin / (x.night.inBedMin as number)));
  let efficiency: Contributor;
  if (effs.length >= CONTRIBUTOR_MIN_NIGHTS) {
    const e = mean(effs);
    efficiency = {
      id: "efficiency",
      label: "Efficiency",
      word: rateHigh(e, EFFICIENCY),
      fill: clamp01(e),
      detail: `${Math.round(e * 100)}% of time in bed asleep · ${nightsN(effs.length)}`,
    };
  } else {
    efficiency = { id: "efficiency", label: "Efficiency", word: null, fill: 0, detail: earlyDetail(effs.length) };
  }

  // Wake-ups: the logged band as a count.
  const counts = week
    .map((x) => x.night.wakeups)
    .filter((w): w is NonNullable<SleepNight["wakeups"]> => w != null)
    .map((w) => WAKEUP_COUNT[w]);
  let wakeups: Contributor;
  if (counts.length >= CONTRIBUTOR_MIN_NIGHTS) {
    const c = mean(counts);
    const word = rateLow(c, WAKEUPS);
    wakeups = {
      id: "wakeups",
      label: "Wake-ups",
      word,
      fill: 1 - clamp01(c / WAKEUP_FILL_MAX),
      detail: `${WAKEUP_DETAIL[word]} · ${nightsN(counts.length)}`,
    };
  } else {
    wakeups = { id: "wakeups", label: "Wake-ups", word: null, fill: 0, detail: earlyDetail(counts.length) };
  }

  // Consistency: bedtime spread.
  const withBed = week.filter((x) => parseClock(x.night.bedtime) !== null);
  const spread = bedtimeSpreadMin(withBed);
  let consistency: Contributor;
  if (withBed.length >= CONTRIBUTOR_MIN_NIGHTS && spread !== null) {
    consistency = {
      id: "consistency",
      label: "Consistency",
      word: rateLow(spread, CONSISTENCY_SD_MIN),
      fill: 1 - clamp01(spread / CONSISTENCY_FILL_MAX_MIN),
      detail: `Bedtime spread ±${Math.round(spread)} min · ${nightsN(withBed.length)}`,
    };
  } else {
    consistency = { id: "consistency", label: "Consistency", word: null, fill: 0, detail: earlyDetail(withBed.length) };
  }

  // Debt: the engine's 7-night shortfall.
  const d = debt7(byDate, now.today, goalH);
  let debt: Contributor;
  if (enough && d !== null) {
    debt = {
      id: "debt",
      label: "Debt",
      word: rateLow(d, DEBT_H),
      fill: 1 - clamp01(d / DEBT_FILL_MAX_H),
      detail: d < 1 / 60 ? `On the goal · ${nightsN(n)}` : `${formatHoursMin(d * 60)} short of the goal · ${nightsN(n)}`,
    };
  } else {
    debt = { id: "debt", label: "Debt", word: null, fill: 0, detail: earlyDetail(n) };
  }

  return [duration, efficiency, wakeups, consistency, debt];
}

// ── Last night ──

export type NightWord = "Very short" | "Short" | "OK" | "Good";

/** One night against the goal, on the same bands as Duration. OURS. */
export function nightWord(asleepH: number, sleepGoalH?: number): NightWord {
  const r = asleepH / clampSleepGoal(sleepGoalH);
  if (r >= DURATION_RATIO.excellent) return "Good";
  if (r >= DURATION_RATIO.good) return "OK";
  if (r >= DURATION_RATIO.fair) return "Short";
  return "Very short";
}

// ── Bedtime planner ──

export type BedtimePlan = {
  wake: string;
  goalH: number;
  /** Tonight's need: the goal plus a share of this week's debt. */
  needH: number;
  /** Lights out for the goal: wake − goal − FALL_ASLEEP_MIN. */
  lightsOut: string;
  /** Lights out for tonight's need. */
  lightsOutForNeed: string;
  debtH: number;
};

/** Goal plus a third of the 7-night debt, at most an hour extra, clamped to NEED_RANGE_H. */
export function tonightNeedH(sleepGoalH: number | undefined, debt7h: number | null): number {
  const goalH = clampSleepGoal(sleepGoalH);
  const extra = Math.min(NEED_EXTRA_MAX_H, Math.max(0, (debt7h ?? 0) * NEED_DEBT_SHARE));
  return Math.min(NEED_RANGE_H.max, Math.max(NEED_RANGE_H.min, goalH + extra));
}

/** The clock to switch the lights off for `hoursAsleep` before `wakeHHMM`, leaving FALL_ASLEEP_MIN to drop off; wraps midnight. */
export function lightsOutFor(wakeHHMM: string, hoursAsleep: number): string {
  const wake = parseClock(wakeHHMM) ?? parseClock(DEFAULT_WAKE) ?? 7 * 60;
  return formatClock(wake - hoursAsleep * 60 - FALL_ASLEEP_MIN);
}

export function bedtimePlan(wakeHHMM: string, sleepGoalH: number | undefined, debt7h: number | null): BedtimePlan {
  const goalH = clampSleepGoal(sleepGoalH);
  const wake = parseClock(wakeHHMM) !== null ? wakeHHMM : DEFAULT_WAKE;
  const needH = tonightNeedH(goalH, debt7h);
  return {
    wake,
    goalH,
    needH,
    lightsOut: lightsOutFor(wake, goalH),
    lightsOutForNeed: lightsOutFor(wake, needH),
    debtH: Math.max(0, debt7h ?? 0),
  };
}

// ── Insight ──

export type SleepReadLike = Pick<PhysiqueAnalysis["sleep"], "status" | "mean14h" | "nightsLogged14" | "debt7h" | "acute">;

/** Debt under this is not worth a sentence. OURS. */
export const INSIGHT_DEBT_MENTION_H = 0.5;
/** Debt over this on an `ok` read earns a nudge. OURS. */
export const INSIGHT_DEBT_NUDGE_H = 1;

/**
 * One calm sentence from the engine's read (rule copy, no AI). Never a
 * number the engine did not produce, never a banned phrase.
 */
export function sleepInsight(read: SleepReadLike, sleepGoalH?: number): string {
  const goal = formatHoursMin(clampSleepGoal(sleepGoalH) * 60);
  const n = read.nightsLogged14;
  if (n === 0) return `${MIN_NIGHTS_FOR_STATUS} of ${SLEEP_WINDOW_NIGHTS} nights give a first read.`;
  if (read.status === "unknown" || read.mean14h === null) {
    const more = Math.max(1, MIN_NIGHTS_FOR_STATUS - n);
    return `${n} of ${SLEEP_WINDOW_NIGHTS} nights logged. ${more} more ${more === 1 ? "gives" : "give"} a read.`;
  }
  const avg = formatHoursMin(read.mean14h * 60);
  const debt = read.debt7h ?? 0;
  if (read.acute && read.status !== "severe") {
    return `Two short nights in a row. Tonight matters more than the ${SLEEP_WINDOW_NIGHTS}-night average; aim for the lights-out below.`;
  }
  if (read.status === "severe") {
    return `Averaging ${avg} over ${SLEEP_WINDOW_NIGHTS} nights, well under the ${goal} goal; keeping to the lights-out below closes that gap.`;
  }
  if (read.status === "short") {
    const tail = debt > INSIGHT_DEBT_MENTION_H ? `, with ${formatHoursMin(debt * 60)} to make up this week` : "";
    return `Averaging ${avg} over ${SLEEP_WINDOW_NIGHTS} nights, under the ${goal} goal${tail}.`;
  }
  if (debt > INSIGHT_DEBT_NUDGE_H) {
    return `Averaging ${avg} over ${SLEEP_WINDOW_NIGHTS} nights, on the goal, but ${formatHoursMin(debt * 60)} behind over the last ${DEBT_WINDOW_NIGHTS}; an earlier night or two makes it up.`;
  }
  return `Averaging ${avg} over ${SLEEP_WINDOW_NIGHTS} nights, on the ${goal} goal. Nothing to change.`;
}

// ── Trend ──

export type TrendBar = { date: LocalDate; asleepH: number | null };

/** One slot per night of the 14-night window ending today; unlogged nights are null so no bar is drawn. */
export function trendBars(nights: readonly SleepNight[], now: Now): TrendBar[] {
  const byDate = nightsByDate(nights);
  const out: TrendBar[] = [];
  for (let i = SLEEP_WINDOW_NIGHTS - 1; i >= 0; i--) {
    const date = addDays(now.today, -i);
    const n = byDate.get(date);
    out.push({ date, asleepH: n && Number.isFinite(n.asleepH) ? n.asleepH : null });
  }
  return out;
}
