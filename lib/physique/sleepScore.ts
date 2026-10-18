/**
 * Sleep rev 4 (05-design §9.6 rev 4, after WHOOP and Bevel): a night's
 * score against the sleep goal, the usual wake time read from the nights,
 * wake-time consistency and the last week against the 30 nights before it.
 * The bedtime planner and the debt-inflated "need" went in S9: a running
 * sleep debt has little support as something to pay back hour for hour,
 * and the goal plus a steady wake time is what a person can act on.
 *
 * Pure. Clocks are "HH:MM" local; minutes on the night axis are measured
 * from 18:00 so a 23:30 bedtime sits before a 00:30 one.
 *
 * The score is hours asleep as a share of the goal (after WHOOP's Sleep
 * Performance); waking off your usual time and a restless night
 * take points off. Stages are shown and never scored: a watch's stage
 * split is only moderately accurate against a sleep lab (research C §4.2).
 */

import { addDays, type LocalDate } from "@/lib/dates";
import { mean, median, stdev } from "@/lib/stats";
import { clampSleepGoal, nightsByDate, nightsInWindow, type NormalizedNight } from "@/lib/physique/sleep";
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


/** Trends: the last week against the 30 nights before it, each with its fewest nights. OURS, after WHOOP's "vs previous 30 days". */
export const TREND_RECENT_NIGHTS = 7;
export const TREND_BASELINE_NIGHTS = 30;
export const TREND_RECENT_MIN = 4;
export const TREND_BASELINE_MIN = 10;

/** Changes smaller than these read as steady. OURS: below what a night-to-night wobble moves. */
export const TREND_STEADY = { asleepMin: 10, clockMin: 10, efficiencyPct: 1, hrvPct: 5, rhrBpm: 1 } as const;

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

export type ScorePartId = "duration" | "timing" | "efficiency";

export type ScorePart = {
  id: ScorePartId;
  label: string;
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
  /** The sleep goal the night was scored against. */
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
export function nightScore(nights: readonly SleepNight[], date: LocalDate, sleepGoalH?: number): NightScore | null {
  const byDate = nightsByDate(nights);
  const n = byDate.get(date);
  if (!n || !n.valid) return null;
  const night = n.night;
  const goalH = clampSleepGoal(sleepGoalH);
  const parts: ScorePart[] = [];

  const ratio = night.asleepMin / (goalH * 60);
  const dScore = Math.round(100 * clamp01(ratio));
  const short = goalH * 60 - night.asleepMin;
  parts.push({
    id: "duration",
    label: "Hours vs goal",
    score: dScore,
    word: rate(dScore),
    detail: short > 1 ? `${formatHoursMin(night.asleepMin)} of the ${formatHoursMin(goalH * 60)} goal` : `${formatHoursMin(night.asleepMin)}, the ${formatHoursMin(goalH * 60)} goal met`,
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
      label: "Wake time",
      score: tScore,
      word: rate(tScore),
      detail: off < 5 ? `${night.wakeTime}, your usual time` : `${night.wakeTime}, ${shortMin(off)} ${offset > 0 ? "later" : "earlier"} than your usual ${usual.hhmm}`,
    });
  }

  const eff = efficiencyOf(night);
  if (eff !== null) {
    const eScore = Math.round(100 * clamp01((eff - SCORE_EFFICIENCY.zero) / (SCORE_EFFICIENCY.full - SCORE_EFFICIENCY.zero)));
    parts.push({ id: "efficiency", label: "Efficiency", score: eScore, word: rate(eScore), detail: `${Math.round(eff * 100)}% of the night asleep` });
  }

  const penalty = parts.reduce((sum, p) => (p.id === "duration" ? sum : sum + SCORE_PENALTY_MAX[p.id] * (1 - p.score / 100)), 0);
  const score = Math.max(0, Math.min(100, Math.round(dScore - penalty)));

  // The reason names the weakest part that falls short; otherwise what went right.
  const fallsShort = (p: ScorePart) =>
    p.id === "duration" ? short >= REASON_SHORT_MIN : p.id === "timing" ? offset !== null && Math.abs(offset) > REASON_OFF_WAKE_MIN : eff !== null && eff < EFFICIENCY.good;
  const weakest = [...parts].filter(fallsShort).sort((a, b) => a.score - b.score)[0];
  let reason: string;
  if (!weakest) {
    reason = parts.some((p) => p.id === "timing") ? "The goal met, and up at your usual time." : "The goal met.";
  } else if (weakest.id === "duration") {
    reason = `${shortMin(short)} short of the ${formatHoursMin(goalH * 60)} goal.`;
  } else if (weakest.id === "timing" && offset !== null && usual) {
    reason = `Up ${shortMin(Math.abs(offset))} ${offset > 0 ? "later" : "earlier"} than your usual ${usual.hhmm}. A steady wake time does more than a lie-in.`;
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

// ── Trends ──

export type TrendId = "asleep" | "bedtime" | "wake" | "efficiency" | "hrv" | "rhr";

export type TrendRow = {
  id: TrendId;
  label: string;
  recent: number;
  baseline: number;
  /** recent − baseline, in the metric's unit (minutes for clocks and hours, points for efficiency). */
  delta: number;
  direction: "up" | "down" | "steady";
  /** Whether the change is good, bad or neither (clock shifts are neither). */
  tone: "good" | "bad" | "neutral";
  recentText: string;
  deltaText: string;
};

type Picker = (n: NormalizedNight) => number | null;

const PICK: Record<TrendId, Picker> = {
  asleep: (n) => n.night.asleepMin,
  bedtime: (n) => nightAxisMin(n.night.bedtime),
  wake: (n) => nightAxisMin(n.night.wakeTime),
  efficiency: (n) => {
    const e = efficiencyOf(n.night);
    return e === null ? null : e * 100;
  },
  hrv: (n) => (typeof n.night.hrvMs === "number" && n.night.hrvMs > 0 ? n.night.hrvMs : null),
  rhr: (n) => (typeof n.night.restingHr === "number" && n.night.restingHr > 0 ? n.night.restingHr : null),
};

const LABEL: Record<TrendId, string> = { asleep: "Time asleep", bedtime: "Bedtime", wake: "Wake time", efficiency: "Efficiency", hrv: "HRV", rhr: "Resting heart rate" };

/**
 * The last TREND_RECENT_NIGHTS nights against the TREND_BASELINE_NIGHTS
 * before them, one row per measure that has enough nights in both. Clock
 * shifts are neutral; more sleep, efficiency and HRV and a lower resting
 * heart rate are good.
 */
export function sleepTrends(nights: readonly SleepNight[], today: LocalDate): TrendRow[] {
  const byDate = nightsByDate(nights);
  const recent = nightsInWindow(byDate, today, TREND_RECENT_NIGHTS).filter((n) => n.valid);
  const base = nightsInWindow(byDate, addDays(today, -TREND_RECENT_NIGHTS), TREND_BASELINE_NIGHTS).filter((n) => n.valid);
  const out: TrendRow[] = [];
  for (const id of ["asleep", "bedtime", "wake", "efficiency", "hrv", "rhr"] as const) {
    const r = recent.map(PICK[id]).filter((x): x is number => x !== null);
    const b = base.map(PICK[id]).filter((x): x is number => x !== null);
    if (r.length < TREND_RECENT_MIN || b.length < TREND_BASELINE_MIN) continue;
    const rv = mean(r);
    const bv = mean(b);
    const delta = rv - bv;
    const steady =
      id === "asleep" ? Math.abs(delta) < TREND_STEADY.asleepMin
      : id === "bedtime" || id === "wake" ? Math.abs(delta) < TREND_STEADY.clockMin
      : id === "efficiency" ? Math.abs(delta) < TREND_STEADY.efficiencyPct
      : id === "hrv" ? Math.abs(delta) / bv * 100 < TREND_STEADY.hrvPct
      : Math.abs(delta) < TREND_STEADY.rhrBpm;
    const direction = steady ? "steady" : delta > 0 ? "up" : "down";
    const better = id === "rhr" ? delta < 0 : delta > 0;
    const tone = steady || id === "bedtime" || id === "wake" ? "neutral" : better ? "good" : "bad";
    let recentText: string;
    let deltaText: string;
    if (id === "asleep") {
      recentText = formatHoursMin(rv);
      deltaText = steady ? "Steady" : `${shortMin(Math.abs(delta))} ${delta > 0 ? "more" : "less"}`;
    } else if (id === "bedtime" || id === "wake") {
      recentText = fromNightAxis(rv);
      deltaText = steady ? "Steady" : `${shortMin(Math.abs(delta))} ${delta > 0 ? "later" : "earlier"}`;
    } else if (id === "efficiency") {
      recentText = `${Math.round(rv)}%`;
      deltaText = steady ? "Steady" : `${Math.abs(Math.round(delta))} pts ${delta > 0 ? "up" : "down"}`;
    } else if (id === "hrv") {
      recentText = `${Math.round(rv)} ms`;
      deltaText = steady ? "Steady" : `${Math.abs(Math.round(delta))} ms ${delta > 0 ? "up" : "down"}`;
    } else {
      recentText = `${Math.round(rv)} bpm`;
      deltaText = steady ? "Steady" : `${Math.abs(Math.round(delta))} bpm ${delta > 0 ? "up" : "down"}`;
    }
    out.push({ id, label: LABEL[id], recent: rv, baseline: bv, delta, direction, tone, recentText, deltaText });
  }
  return out;
}
