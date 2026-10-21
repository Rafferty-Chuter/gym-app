/**
 * Sleep: night normalisation, the 14-night status, acute short sleep, debt,
 * the session-exclusion rule the strength module uses, and the lift
 * corroboration input SLEEP-1 needs.
 * Normative spec: docs/plan/02-engine-spec.md §7.1–7.3. Evidence:
 * research/C-sleep-recovery.md §5–6 and research/F-evidence-rules.md §6.
 *
 * Pure. A night belongs to its local wake date. Hours are decimal hours.
 */

import { addDays, dayDiff, isWeekday, localDateKey, type LocalDate, type Now } from "@/lib/dates";
import { mean, median } from "@/lib/stats";
import type { SleepNight, SleepStatus } from "@/lib/physique/types";
import type { LiftSeries } from "@/lib/physique/strength";

// ── Constants (tags per 02-engine-spec) ──

/** Nights in the status window. OURS (02 §7.2). */
export const SLEEP_WINDOW_NIGHTS = 14;
/** Logged, valid nights the 14-night window needs before any status. OURS (02 §7.2). */
export const MIN_NIGHTS_FOR_STATUS = 10;
/** Nights in the debt window. PUB (WHOOP's structure, research C §6.4). */
export const DEBT_WINDOW_NIGHTS = 7;
/** Self-report overestimates sleep by about this much, so manual thresholds sit higher. EVID (Lauderdale 2008). */
export const MANUAL_THRESHOLD_OFFSET_H = 0.5;
/** 14-night mean below this is `severe`. EVID (Nedeltcheva 2010; Craven 2022 ≤6 h). */
export const SEVERE_MEAN_H = { wearable: 6.0, manual: 6.0 + MANUAL_THRESHOLD_OFFSET_H } as const;
/** 14-night or weekday mean below this is `short`. EVID (Watson 2015 ≥7 h; Wang 2018 weekday loss). */
export const SHORT_MEAN_H = { wearable: 6.5, manual: 6.5 + MANUAL_THRESHOLD_OFFSET_H } as const;
/** Two consecutive nights below this are `acute`. EVID (Knowles 2018; Reilly & Piercy 1994). */
export const ACUTE_NIGHT_H = { wearable: 6.0, manual: 6.0 + MANUAL_THRESHOLD_OFFSET_H } as const;
/** A single night below this excludes the next session from STR-1. EVID (Knowles 2018; Craven 2022). */
export const EXCLUDE_SESSION_NIGHT_H = { wearable: 5.0, manual: 5.0 + MANUAL_THRESHOLD_OFFSET_H } as const;
/** Consecutive nights that exclude the next session use the acute threshold. EVID (Knowles 2018). */
export const EXCLUDE_SESSION_CONSECUTIVE_NIGHTS = 2;
/** Manual thresholds apply when at least this share of the window's nights are manual. OURS (02 §7.2). */
export const MANUAL_SHARE_FOR_MANUAL_THRESHOLDS = 0.5;
/** Nights outside this range are kept but excluded from means. OURS (02 §7.1). */
export const VALID_NIGHT_H = { min: 2, max: 14 } as const;
/** Weekday nights needed before the weekday mean counts. OURS. */
export const MIN_WEEKDAY_NIGHTS = 5;
/**
 * The hours a night is read against. PUB: adults need 7 to 9 hours (AASM and
 * SRS consensus; National Sleep Foundation); 8 is the middle, as WHOOP's
 * baseline need. Fixed since C8: the user-set sleep goal went at the
 * founder's request ("sleep goal, what is this, it should go"), and a value
 * stored before is ignored. Fields and parameters named goalH carry this.
 */
export const SLEEP_REFERENCE_H = 8;
/** Adults sleeping less than this are short of sleep. EVID: AASM and SRS consensus, 7 hours or more (Watson 2015). The read when there is no usual yet. */
export const SLEEP_ADULT_MIN_H = 7;
/** Nights before a date whose median is the person's usual sleep (C7: what a night is read against, not a fixed 8 hours). OURS: four weeks, so one bad week does not move it. */
export const SLEEP_USUAL_DAYS = 28;
/** Valid nights a usual needs. OURS: a week's worth. */
export const SLEEP_USUAL_MIN_NIGHTS = 7;
/** SLEEP-1 corroboration: ≥2 main lifts down at least this much, last 2 weeks vs the 3 before. OURS (02 §7.3). */
export const SLEEP1_LIFT_DROP_PCT = 2.5;
export const SLEEP1_RECENT_DAYS = 14;
export const SLEEP1_PRIOR_DAYS = 21;
/** Exposures per lift each block needs, and the main-lift history SLEEP-1 needs. OURS (02 §7.3). */
export const SLEEP1_MIN_EXPOSURES_PER_BLOCK = 2;
export const SLEEP1_MIN_LIFT_HISTORY_DAYS = 35;
/** HealthKit sessions: merge gaps up to this, main sleep must end in this local hour range, naps are this long. PUB (research C §4.4, Apple). */
export const HK_MERGE_GAP_MIN = 15;
export const HK_MAIN_SLEEP_END_HOUR = { min: 3, max: 14 } as const;
export const HK_NAP_MIN = { min: 15, max: 180 } as const;

// ── Night normalisation ──

export type SleepSourceKind = "manual" | "wearable";

export type NormalizedNight = {
  date: LocalDate;
  asleepH: number;
  source: SleepSourceKind;
  /** Inside VALID_NIGHT_H; invalid nights are kept but never averaged. */
  valid: boolean;
  night: SleepNight;
};

/** HealthKit is the only wearable source in M1; everything else is self-reported. */
export function sourceKind(source: SleepNight["source"]): SleepSourceKind {
  return source === "healthkit" ? "wearable" : "manual";
}

export function normalizeNight(night: SleepNight): NormalizedNight {
  const asleepH = Number.isFinite(night.asleepMin) ? night.asleepMin / 60 : NaN;
  const valid = Number.isFinite(asleepH) && asleepH >= VALID_NIGHT_H.min && asleepH <= VALID_NIGHT_H.max;
  return { date: night.date, asleepH, source: sourceKind(night.source), valid, night };
}

/**
 * One night per wake date (02 §7.1): HealthKit beats manual, then the
 * earliest logged entry wins.
 */
export function nightsByDate(nights: readonly SleepNight[]): Map<LocalDate, NormalizedNight> {
  const rank = (n: SleepNight) => (n.source === "healthkit" ? 0 : 1);
  const sorted = [...nights].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0;
  });
  const out = new Map<LocalDate, NormalizedNight>();
  for (const n of sorted) {
    if (!out.has(n.date)) out.set(n.date, normalizeNight(n));
  }
  return out;
}

/** Nights with wake dates in the `nights`-long window ending on `endDate`, ascending. */
export function nightsInWindow(byDate: ReadonlyMap<LocalDate, NormalizedNight>, endDate: LocalDate, nights = SLEEP_WINDOW_NIGHTS): NormalizedNight[] {
  const from = addDays(endDate, -(nights - 1));
  return [...byDate.values()].filter((n) => n.date >= from && n.date <= endDate).sort((a, b) => (a.date < b.date ? -1 : 1));
}

// ── Thresholds ──

export type SleepThresholds = { kind: SleepSourceKind; severeH: number; shortH: number; acuteH: number };

export function thresholdsForKind(kind: SleepSourceKind): SleepThresholds {
  return { kind, severeH: SEVERE_MEAN_H[kind], shortH: SHORT_MEAN_H[kind], acuteH: ACUTE_NIGHT_H[kind] };
}

export type WindowSource = "manual" | "wearable" | "mixed";

export function windowSource(nights: readonly NormalizedNight[]): WindowSource | null {
  if (nights.length === 0) return null;
  const manual = nights.filter((n) => n.source === "manual").length;
  if (manual === 0) return "wearable";
  if (manual === nights.length) return "manual";
  return "mixed";
}

/** Mixed windows use manual thresholds when ≥50% of the nights are manual (02 §7.2). */
export function thresholdsForWindow(nights: readonly NormalizedNight[]): SleepThresholds {
  if (nights.length === 0) return thresholdsForKind("manual");
  const manual = nights.filter((n) => n.source === "manual").length;
  return thresholdsForKind(manual / nights.length >= MANUAL_SHARE_FOR_MANUAL_THRESHOLDS ? "manual" : "wearable");
}

// ── Means, acute, debt ──

/** Mean asleep hours over valid nights in the 14-night window; null below the minimum. */
export function mean14h(byDate: ReadonlyMap<LocalDate, NormalizedNight>, endDate: LocalDate): number | null {
  const valid = nightsInWindow(byDate, endDate).filter((n) => n.valid);
  if (valid.length < MIN_NIGHTS_FOR_STATUS) return null;
  return mean(valid.map((n) => n.asleepH));
}

/** Mean over Monday–Friday wake dates in the window (Wang 2018: weekday loss matters); null below MIN_WEEKDAY_NIGHTS. */
export function weekdayMeanH(byDate: ReadonlyMap<LocalDate, NormalizedNight>, endDate: LocalDate): number | null {
  const valid = nightsInWindow(byDate, endDate).filter((n) => n.valid && isWeekday(n.date));
  if (valid.length < MIN_WEEKDAY_NIGHTS) return null;
  return mean(valid.map((n) => n.asleepH));
}

function underAcute(n: NormalizedNight | undefined): boolean {
  return !!n && n.valid && n.asleepH < ACUTE_NIGHT_H[n.source];
}

/**
 * Acute short sleep on `date`: the nights waking on `date` and the day
 * before are both logged and both under the acute threshold (02 §7.2).
 */
export function acute(byDate: ReadonlyMap<LocalDate, NormalizedNight>, date: LocalDate): boolean {
  for (let i = 0; i < EXCLUDE_SESSION_CONSECUTIVE_NIGHTS; i++) {
    if (!underAcute(byDate.get(addDays(date, -i)))) return false;
  }
  return true;
}


/**
 * Hours short of the goal, summed over the logged valid nights of the last 7
 * (02 §7.2). Unlogged nights add nothing. Null when no night is logged.
 */
export function debt7(byDate: ReadonlyMap<LocalDate, NormalizedNight>, endDate: LocalDate, goalH: number): number | null {
  const valid = nightsInWindow(byDate, endDate, DEBT_WINDOW_NIGHTS).filter((n) => n.valid);
  if (valid.length === 0) return null;
  let debt = 0;
  for (const n of valid) debt += Math.max(0, goalH - n.asleepH);
  return debt;
}

// ── Status ──

export type SleepRead = {
  status: SleepStatus;
  mean14h: number | null;
  weekdayMeanH: number | null;
  /** Nights logged in the window, including invalid ones. */
  nightsLogged14: number;
  /** Nights inside VALID_NIGHT_H; the status gate counts these. */
  nightsValid14: number;
  source: WindowSource | null;
  thresholds: SleepThresholds;
  acute: boolean;
  debt7h: number | null;
  /** The night that woke on `today`, when logged. */
  lastNightH: number | null;
  goalH: number;
};

export type SleepStatusInput = {
  nights: readonly SleepNight[];
  now: Now;
};

/** The 14-night sleep status (02 §7.2) and everything the analysis shows beside it. */
export function sleepStatus({ nights, now }: SleepStatusInput): SleepRead {
  const byDate = nightsByDate(nights);
  const windowNights = nightsInWindow(byDate, now.today);
  const valid = windowNights.filter((n) => n.valid);
  const thresholds = thresholdsForWindow(valid);
  const goalH = SLEEP_REFERENCE_H;
  const m14 = mean14h(byDate, now.today);
  const wk = weekdayMeanH(byDate, now.today);
  const last = byDate.get(now.today);
  const base = {
    mean14h: m14,
    weekdayMeanH: wk,
    nightsLogged14: windowNights.length,
    nightsValid14: valid.length,
    source: windowSource(valid),
    thresholds,
    acute: acute(byDate, now.today),
    debt7h: debt7(byDate, now.today, goalH),
    lastNightH: last && last.valid ? last.asleepH : null,
    goalH,
  };
  if (m14 === null) return { status: "unknown", ...base };
  if (m14 < thresholds.severeH) return { status: "severe", ...base };
  if (m14 < thresholds.shortH || (wk !== null && wk < thresholds.shortH)) return { status: "short", ...base };
  return { status: "ok", ...base };
}

// ── Session exclusion (used by strength.ts) ──

export type SessionSleepExclusion = "single_night" | "consecutive_nights";

/**
 * Whether a session on `date` is excluded from STR-1 (02 §6.2): the night
 * before it was under 5 h (manual 5.5 h), or the two nights before it were
 * both under 6 h (manual 6.5 h). Each night uses its own source's threshold.
 */
export function sessionSleepExclusion(byDate: ReadonlyMap<LocalDate, NormalizedNight>, date: LocalDate): SessionSleepExclusion | null {
  const n0 = byDate.get(date);
  if (n0 && n0.valid && n0.asleepH < EXCLUDE_SESSION_NIGHT_H[n0.source]) return "single_night";
  if (acute(byDate, date)) return "consecutive_nights";
  return null;
}

// ── SLEEP-1 corroboration ──

export type SleepCorroborationLift = {
  key: string;
  name: string;
  recentMedian: number | null;
  priorMedian: number | null;
  recentN: number;
  priorN: number;
  changePct: number | null;
  /** Both blocks met the exposure minimum and the lift has ≥5 weeks of history. */
  eligible: boolean;
};

export type SleepCorroboration = {
  /** ≥2 eligible main lifts are down by SLEEP1_LIFT_DROP_PCT or more. */
  corroborated: boolean;
  liftsDown: number;
  liftsEligible: number;
  lifts: SleepCorroborationLift[];
  recentFrom: LocalDate;
  priorFrom: LocalDate;
};

/**
 * The lift half of SLEEP-1 (02 §7.3): per main lift, the median e1RM_adj of
 * the last 2 weeks against the 3 weeks before. Sessions after short nights
 * are deliberately kept, since they are the evidence. `series` comes from
 * `mainLiftSeries` in strength.ts.
 */
export function sleepCorroboration(series: readonly LiftSeries[], now: Now): SleepCorroboration {
  const recentFrom = addDays(now.today, -(SLEEP1_RECENT_DAYS - 1));
  const priorFrom = addDays(recentFrom, -SLEEP1_PRIOR_DAYS);
  const lifts: SleepCorroborationLift[] = series.map((s) => {
    const recent = s.exposures.filter((e) => e.date >= recentFrom && e.date <= now.today).map((e) => e.e1rm);
    const prior = s.exposures.filter((e) => e.date >= priorFrom && e.date < recentFrom).map((e) => e.e1rm);
    const first = s.exposures[0]?.date;
    const historyDays = first ? dayDiff(first, now.today) + 1 : 0;
    const eligible =
      recent.length >= SLEEP1_MIN_EXPOSURES_PER_BLOCK && prior.length >= SLEEP1_MIN_EXPOSURES_PER_BLOCK && historyDays >= SLEEP1_MIN_LIFT_HISTORY_DAYS;
    const recentMedian = recent.length ? median(recent) : null;
    const priorMedian = prior.length ? median(prior) : null;
    const changePct = recentMedian !== null && priorMedian !== null && priorMedian > 0 ? (recentMedian / priorMedian - 1) * 100 : null;
    return { key: s.key, name: s.name, recentMedian, priorMedian, recentN: recent.length, priorN: prior.length, changePct, eligible };
  });
  const eligibleLifts = lifts.filter((l) => l.eligible && l.changePct !== null);
  const liftsDown = eligibleLifts.filter((l) => (l.changePct as number) <= -SLEEP1_LIFT_DROP_PCT).length;
  return { corroborated: liftsDown >= 2, liftsDown, liftsEligible: eligibleLifts.length, lifts, recentFrom, priorFrom };
}

// ── HealthKit input (M3; shape stubbed so S5 can target it) ──

/** One HKCategoryTypeIdentifierSleepAnalysis sample, as Health Auto Export sends it. */
export type HealthKitSleepSample = {
  /** ISO instants. */
  start: string;
  end: string;
  value: "inBed" | "asleep" | "asleepCore" | "asleepDeep" | "asleepREM" | "asleepUnspecified" | "awake";
};

type Session = { startMs: number; endMs: number; asleepMs: number };

function localClock(date: Date, tz: string): { hour: number; minute: number } {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? NaN);
    const hour = get("hour");
    const minute = get("minute");
    if (Number.isFinite(hour) && Number.isFinite(minute)) return { hour, minute };
  } catch {
    /* fall through */
  }
  return { hour: date.getUTCHours(), minute: date.getUTCMinutes() };
}

function hhmm(date: Date, tz: string): string {
  const { hour, minute } = localClock(date, tz);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/**
 * Nights from raw HealthKit sleep samples (02 §7.1): asleep samples are
 * merged into sessions across gaps of ≤15 min; per wake date the main sleep
 * is the longest session ending between 03:00 and 14:00 local. Sessions of
 * 15 min to 3 h that are not the main sleep are naps and are dropped here
 * (SleepNight has no nap field yet). Everything else is ignored.
 */
export function nightsFromHealthKitSamples(samples: readonly HealthKitSleepSample[], tz: string): SleepNight[] {
  const asleep = samples
    .filter((s) => s.value.startsWith("asleep"))
    .map((s) => ({ startMs: Date.parse(s.start), endMs: Date.parse(s.end) }))
    .filter((s) => Number.isFinite(s.startMs) && Number.isFinite(s.endMs) && s.endMs > s.startMs)
    .sort((a, b) => a.startMs - b.startMs);
  const sessions: Session[] = [];
  for (const s of asleep) {
    const last = sessions[sessions.length - 1];
    if (last && s.startMs - last.endMs <= HK_MERGE_GAP_MIN * 60_000) {
      last.endMs = Math.max(last.endMs, s.endMs);
      last.asleepMs += s.endMs - s.startMs;
    } else {
      sessions.push({ startMs: s.startMs, endMs: s.endMs, asleepMs: s.endMs - s.startMs });
    }
  }
  const byWakeDate = new Map<LocalDate, Session>();
  for (const s of sessions) {
    const end = new Date(s.endMs);
    const { hour } = localClock(end, tz);
    if (hour < HK_MAIN_SLEEP_END_HOUR.min || hour >= HK_MAIN_SLEEP_END_HOUR.max) continue;
    const date = localDateKey(end, tz);
    const cur = byWakeDate.get(date);
    if (!cur || s.asleepMs > cur.asleepMs) byWakeDate.set(date, s);
  }
  const out: SleepNight[] = [];
  for (const [date, s] of [...byWakeDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const start = new Date(s.startMs);
    const end = new Date(s.endMs);
    out.push({
      id: `hk-${date}`,
      date,
      loggedAt: end.toISOString(),
      source: "healthkit",
      schemaVersion: 1,
      bedtime: hhmm(start, tz),
      wakeTime: hhmm(end, tz),
      asleepMin: Math.round(s.asleepMs / 60_000),
      inBedMin: Math.round((s.endMs - s.startMs) / 60_000),
    });
  }
  return out;
}

/**
 * The person's usual sleep before `before` (C7): the median of the valid
 * nights in the SLEEP_USUAL_DAYS before it, or null with fewer than
 * SLEEP_USUAL_MIN_NIGHTS. Nights are read against this rather than a fixed
 * number, as 8 hours is not everyone's need and not everyone can get it.
 */
export function usualSleepH(byDate: ReadonlyMap<LocalDate, NormalizedNight>, before: LocalDate): number | null {
  const from = addDays(before, -SLEEP_USUAL_DAYS);
  const hours: number[] = [];
  for (const [d, n] of byDate) if (d >= from && d < before && n.valid) hours.push(n.asleepH);
  return hours.length >= SLEEP_USUAL_MIN_NIGHTS ? median(hours) : null;
}
