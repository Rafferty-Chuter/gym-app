/**
 * Sleep rev 4 (05-design §9.6 rev 4, after WHOOP and Bevel): a night's
 * score against 8 hours, the usual wake time read from the nights,
 * wake-time consistency and plain 14-night averages (S10, in place of the
 * last week against the 30 nights before it).
 * The bedtime planner and the debt-inflated "need" went in S9: a running
 * sleep debt has little support as something to pay back hour for hour,
 * and enough hours plus a steady wake time is what a person can act on.
 *
 * Pure. Clocks are "HH:MM" local; minutes on the night axis are measured
 * from 18:00 so a 23:30 bedtime sits before a 00:30 one.
 *
 * The score is hours asleep as a share of 8 hours (after WHOOP's Sleep
 * Performance); waking off your usual time and a restless night
 * take points off. Stages are shown and never scored: a watch's stage
 * split is only moderately accurate against a sleep lab (research C §4.2).
 */

import { addDays, type LocalDate } from "@/lib/dates";
import { mean, median, stdev } from "@/lib/stats";
import { SLEEP_WINDOW_NIGHTS, SLEEP_REFERENCE_H, nightsByDate, nightsInWindow, type NormalizedNight } from "@/lib/physique/sleep";
import { formatClock, formatHoursMin, parseClock } from "@/lib/physique/dayTotals";
import { EFFICIENCY, efficiencyOf, type RatingWord } from "@/lib/physique/sleepView";
import type { SleepNight } from "@/lib/physique/types";

// ── Constants (tags as in 02-engine-spec) ──

/** Origin of the night axis: 18:00. OURS, the same origin the bedtime spread uses. */
export const NIGHT_ORIGIN_MIN = 18 * 60;

/** Points the other parts can take off the hours-vs-goal score. PUB base (WHOOP's Sleep Performance is hours ÷ need); 15 for waking off your usual time and 10 for a restless night are OURS. A part without data takes nothing off. */
export const SCORE_PENALTY_MAX = { timing: 15, efficiency: 10 } as const;

/** Efficiency that scores 0 and 100. OURS around the 85% clinical cut-off (PUB, Ohayon 2017): 85% scores 80. */
export const SCORE_EFFICIENCY = { zero: 0.65, full: 0.9 } as const;

/** Minutes off the usual wake time that still score 100, and that score 0. EVID anchor: a one-hour swing is the social-jetlag mark (Wittmann 2006) and irregular timing predicts worse health than short sleep alone (Windred 2024); 15 and 90 are OURS. */
export const SCORE_TIMING_MIN = { full: 15, zero: 90 } as const;

/** Score bands for the word. Good ≥ 85 and Fair ≥ 70 follow WHOOP's Sleep Performance bands, optimal and sufficient (PUB); Excellent ≥ 92 is OURS. */
export const SCORE_BANDS = { excellent: 92, good: 85, fair: 70 } as const;

/** What the reason sentence counts as falling short. OURS: 20 min under the need, 30 min off the usual wake, efficiency under the clinical 85% (PUB, Ohayon 2017). */
export const REASON_SHORT_MIN = 20;
export const REASON_OFF_WAKE_MIN = 30;

/** Nights the usual wake time is read from, and the fewest that give one. PUB: WHOOP's planner needs three nights before it suggests times. */
export const USUAL_WAKE_WINDOW_NIGHTS = 14;
export const USUAL_WAKE_MIN_NIGHTS = 3;

/** Wake-time consistency: window and the fewest nights for a word. OURS. */
export const CONSISTENCY_WINDOW_NIGHTS = 7;
export const CONSISTENCY_MIN_NIGHTS = 4;

/** Wake-time spread (sample SD, minutes). Good ≤ 30 keeps most mornings inside the hour that marks social jetlag (EVID, Wittmann 2006); Excellent ≤ 15 and Fair ≤ 60 are OURS. */
export const WAKE_SPREAD_MIN = { excellent: 15, good: 30, fair: 60 } as const;


// ── Helpers ──

/** A clock on the night axis (minutes after 18:00), or null. */
export function nightAxisMin(hhmm: string | undefined): number | null {
  const m = parseClock(hhmm);
  return m === null ? null : (m - NIGHT_ORIGIN_MIN + 1440) % 1440;
}

/** Back from the night axis to "HH:MM". */
export function fromNightAxis(min: number): string {
  return formatClock(Math.round(min) + NIGHT_ORIGIN_MIN);
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function rate(score: number): RatingWord {
  if (score >= SCORE_BANDS.excellent) return "Excellent";
  if (score >= SCORE_BANDS.good) return "Good";
  if (score >= SCORE_BANDS.fair) return "Fair";
  return "Poor";
}

function rateSpread(sd: number): RatingWord {
  if (sd <= WAKE_SPREAD_MIN.excellent) return "Excellent";
  if (sd <= WAKE_SPREAD_MIN.good) return "Good";
  if (sd <= WAKE_SPREAD_MIN.fair) return "Fair";
  return "Poor";
}

function byDateOf(nights: readonly SleepNight[] | ReadonlyMap<LocalDate, NormalizedNight>): ReadonlyMap<LocalDate, NormalizedNight> {
  return nights instanceof Map ? nights : nightsByDate(nights as readonly SleepNight[]);
}

function shortMin(min: number): string {
  return min < 60 ? `${Math.round(min)} min` : formatHoursMin(min);
}

// ── Usual wake ──

export type UsualWake = { hhmm: string; axisMin: number; nights: number };

/**
 * The usual wake time: the median wake over the USUAL_WAKE_WINDOW_NIGHTS
 * nights ending `endDate`, from nights that carry one. Null below
 * USUAL_WAKE_MIN_NIGHTS.
 */
export function usualWake(nights: readonly SleepNight[] | ReadonlyMap<LocalDate, NormalizedNight>, endDate: LocalDate): UsualWake | null {
  const wakes = nightsInWindow(byDateOf(nights), endDate, USUAL_WAKE_WINDOW_NIGHTS)
    .filter((n) => n.valid)
    .map((n) => nightAxisMin(n.night.wakeTime))
    .filter((x): x is number => x !== null);
  if (wakes.length < USUAL_WAKE_MIN_NIGHTS) return null;
  const m = Math.round(median(wakes));
  return { hhmm: fromNightAxis(m), axisMin: m, nights: wakes.length };
}

// ── Score ──

/** "8 hours", the reference as words. */
const hoursWord = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)} hours`;
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);

/** Whole points a part takes off: its share of the most it can take, by how far its own 0..100 falls short. */
function penaltyFor(id: "timing" | "efficiency", partScore: number): number {
  return Math.round(SCORE_PENALTY_MAX[id] * (1 - partScore / 100));
}

export type ScorePartId = "duration" | "timing" | "efficiency";

export type ScorePart = {
  id: ScorePartId;
  label: string;
  /** The night's data for this part, plainly: "7h 12m of 8h 00m", "08:33 · usual 08:15", "92% asleep". */
  value: string;
  /** What the part adds to the score: the hours give the base, the others only take off. The parts sum to the score before the 0..100 clamp. */
  points: number;
  /** 0..100. */
  score: number;
  word: RatingWord;
  detail: string;
};

export type NightScore = {
  date: LocalDate;
  /** 0..100, rounded. */
  score: number;
  word: RatingWord;
  /** The hours the night was scored against (SLEEP_REFERENCE_H). */
  goalH: number;
  asleepMin: number;
  /** The parts that had data, in display order. */
  parts: ScorePart[];
  /** One plain sentence on the weakest part, or why the night went well. */
  reason: string;
  usual: UsualWake | null;
};

/**
 * Score one night (dated by the morning it ended). Null when there is no
 * valid night: silence beats a score from a stray entry.
 */
export function nightScore(nights: readonly SleepNight[], date: LocalDate): NightScore | null {
  const byDate = nightsByDate(nights);
  const n = byDate.get(date);
  if (!n || !n.valid) return null;
  const night = n.night;
  const goalH = SLEEP_REFERENCE_H;
  const parts: ScorePart[] = [];

  const ratio = night.asleepMin / (goalH * 60);
  const dScore = Math.round(100 * clamp01(ratio));
  const short = goalH * 60 - night.asleepMin;
  parts.push({
    id: "duration",
    label: "Asleep",
    value: formatHoursMin(night.asleepMin),
    points: dScore,
    score: dScore,
    word: rate(dScore),
    detail: short > 1 ? `${formatHoursMin(night.asleepMin)}, under ${hoursWord(goalH)}` : `${formatHoursMin(night.asleepMin)}, ${hoursWord(goalH)} or more`,
  });

  // The usual wake is read from the nights before this one, so one late morning cannot move its own yardstick.
  const usual = usualWake(byDate, addDays(date, -1));
  const wake = nightAxisMin(night.wakeTime);
  let offset: number | null = null;
  if (usual && wake !== null) {
    offset = wake - usual.axisMin;
    const off = Math.abs(offset);
    const tScore = Math.round(100 * (1 - clamp01((off - SCORE_TIMING_MIN.full) / (SCORE_TIMING_MIN.zero - SCORE_TIMING_MIN.full))));
    parts.push({
      id: "timing",
      label: "Woke",
      value: `${night.wakeTime} · usual ${usual.hhmm}`,
      points: -penaltyFor("timing", tScore),
      score: tScore,
      word: rate(tScore),
      detail: off < 5 ? `${night.wakeTime}, your usual time` : `${night.wakeTime}, ${shortMin(off)} ${offset > 0 ? "later" : "earlier"} than your usual ${usual.hhmm}`,
    });
  }

  const eff = efficiencyOf(night);
  if (eff !== null) {
    const eScore = Math.round(100 * clamp01((eff - SCORE_EFFICIENCY.zero) / (SCORE_EFFICIENCY.full - SCORE_EFFICIENCY.zero)));
    parts.push({ id: "efficiency", label: "Efficiency", value: `${Math.round(eff * 100)}% asleep`, points: -penaltyFor("efficiency", eScore), score: eScore, word: rate(eScore), detail: `${Math.round(eff * 100)}% of the night asleep` });
  }

  // Whole points per part, so the breakdown on the night page adds up to the score shown.
  const score = Math.max(0, Math.min(100, parts.reduce((sum, p) => sum + p.points, 0)));

  // The reason names the weakest part that falls short; otherwise what went right.
  const fallsShort = (p: ScorePart) =>
    p.id === "duration" ? short >= REASON_SHORT_MIN : p.id === "timing" ? offset !== null && Math.abs(offset) > REASON_OFF_WAKE_MIN : eff !== null && eff < EFFICIENCY.good;
  const weakest = [...parts].filter(fallsShort).sort((a, b) => a.score - b.score)[0];
  let reason: string;
  if (!weakest) {
    reason = parts.some((p) => p.id === "timing") ? `${cap(hoursWord(goalH))} or more, and up at your usual time.` : `${cap(hoursWord(goalH))} or more.`;
  } else if (weakest.id === "duration") {
    reason = `${shortMin(short)} under ${hoursWord(goalH)}.`;
  } else if (weakest.id === "timing" && offset !== null && usual) {
    reason = `Up ${shortMin(Math.abs(offset))} ${offset > 0 ? "later" : "earlier"} than your usual ${usual.hhmm}.`;
  } else {
    reason = `${Math.round((eff ?? 0) * 100)}% of the night asleep, under the ${Math.round(EFFICIENCY.good * 100)}% that counts as good.`;
  }

  return { date, score, word: rate(score), goalH, asleepMin: night.asleepMin, parts, reason, usual };
}

// ── Consistency ──

export type ConsistencyDay = { date: LocalDate; wake: string | null; /** Minutes from the usual wake; later is positive. */ offsetMin: number | null };

export type ConsistencyRead = {
  /** Null below CONSISTENCY_MIN_NIGHTS. */
  word: RatingWord | null;
  /** Sample SD of wake times, minutes. */
  spreadMin: number | null;
  usual: UsualWake | null;
  days: ConsistencyDay[];
  nights: number;
};

/**
 * Wake-time consistency over the last CONSISTENCY_WINDOW_NIGHTS mornings:
 * each morning's offset from the usual wake time and the spread of wake
 * times, worded. A fixed wake time is the anchor sleep medicine starts
 * from (CBT-I's first rule), so this reads wake time, not bedtime.
 */
export function wakeConsistency(nights: readonly SleepNight[], today: LocalDate): ConsistencyRead {
  const byDate = nightsByDate(nights);
  const usual = usualWake(byDate, today);
  const days: ConsistencyDay[] = [];
  const wakes: number[] = [];
  for (let i = CONSISTENCY_WINDOW_NIGHTS - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const n = byDate.get(date);
    const w = n && n.valid ? nightAxisMin(n.night.wakeTime) : null;
    if (w !== null) wakes.push(w);
    days.push({ date, wake: w !== null ? (n?.night.wakeTime ?? null) : null, offsetMin: w !== null && usual ? w - usual.axisMin : null });
  }
  const spread = wakes.length >= 2 ? stdev(wakes) : null;
  const enough = wakes.length >= CONSISTENCY_MIN_NIGHTS && spread !== null;
  return { word: enough ? rateSpread(spread) : null, spreadMin: spread, usual, days, nights: wakes.length };
}

// ── Averages ──

/** Nights an average needs before it shows. OURS: the same three nights the usual wake time needs. */
export const AVERAGE_MIN_NIGHTS = USUAL_WAKE_MIN_NIGHTS;

export type NightAverages = {
  /** Valid nights in the window. */
  nights: number;
  asleepH: number | null;
  /** Mean clocks, read on the night axis so 23:30 and 00:30 average to midnight; null below AVERAGE_MIN_NIGHTS nights that carry one. */
  bedtime: string | null;
  wake: string | null;
};

/**
 * Plain averages over the SLEEP_WINDOW_NIGHTS ending `today` (S10): hours
 * asleep, bedtime and wake time. Data, not a judgement; the weekly report
 * does the reading.
 */
export function nightAverages(nights: readonly SleepNight[], today: LocalDate): NightAverages {
  const valid = nightsInWindow(nightsByDate(nights), today, SLEEP_WINDOW_NIGHTS).filter((n) => n.valid);
  const clock = (pick: (n: NormalizedNight) => string | undefined): string | null => {
    const xs = valid.map((n) => nightAxisMin(pick(n))).filter((x): x is number => x !== null);
    return xs.length >= AVERAGE_MIN_NIGHTS ? fromNightAxis(mean(xs)) : null;
  };
  return {
    nights: valid.length,
    asleepH: valid.length >= AVERAGE_MIN_NIGHTS ? mean(valid.map((n) => n.asleepH)) : null,
    bedtime: clock((n) => n.night.bedtime),
    wake: clock((n) => n.night.wakeTime),
  };
}
