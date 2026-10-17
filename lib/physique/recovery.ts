/**
 * Recovery status (02 §7.4, S6): overnight HRV and resting heart rate
 * against the user's own baseline, as a word, never a 0 to 100 score.
 * Each metric's last 7 days are compared with the 60 days before them;
 * a flag has to hold on 3 of the last 5 days before it counts. Sleep
 * stages are only ever split for display: wearable stage accuracy is
 * moderate (research C §4.2), so nothing here judges deep or REM.
 *
 * Pure. The caller passes the nights and today; the Sleep tab renders
 * the word and the detail line.
 */

import { addDays, type LocalDate } from "@/lib/dates";
import { mean, stdev } from "@/lib/stats";
import { nightsByDate } from "@/lib/physique/sleep";
import type { SignalState, SleepNight } from "@/lib/physique/types";

// ── Constants ──

/** The recent window each metric is averaged over. PUB: Oura and WHOOP use 7 to 14 days for the short window. */
export const RECENT_DAYS = 7;
/** Valid days the recent window needs before a read. PUB: WHOOP shows nothing before four days. */
export const RECENT_MIN_VALID = 4;
/** The baseline window, the days before the recent one. OURS (02 §7.4): long enough to steady, short enough for a 60-day backfill. */
export const BASELINE_DAYS = 60;
/** Valid days the baseline needs. OURS (02 §7.4). */
export const BASELINE_MIN_VALID = 14;
/** HRV flag: the recent mean of ln(HRV) this many baseline SDs below the baseline mean. OURS (02 §7.4). */
export const HRV_Z_FLAG = -0.75;
/** RHR flag: recent mean above the baseline by at least this many bpm... EVID: night-to-night RHR noise is about 2 to 3 bpm. */
export const RHR_FLAG_BPM = 3;
/** ...or this many baseline SDs, whichever is larger. OURS (02 §7.4). */
export const RHR_FLAG_SD = 0.75;
/** A flag counts only when it held on this many of the last FLAG_DAYS days. OURS (02 §7.4): one odd night is not a trend. */
export const FLAG_DAYS = 5;
export const FLAG_DAYS_MIN = 3;

// ── Types ──

export type RecoveryFlag = "hrv" | "rhr" | "sleep";
export type RecoveryStatus = "none" | "calibrating" | "green" | "amber" | "red";

export type RecoveryMetric = {
  /** Recent and baseline on the display scale (ms or bpm). */
  recent: number;
  baseline: number;
  /** Recent mean minus baseline mean in baseline SDs, on the analysed scale. */
  z: number;
  recentDays: number;
  baselineDays: number;
};

export type RecoveryRead = {
  status: RecoveryStatus;
  state: SignalState;
  word: string;
  flags: RecoveryFlag[];
  hrv: (RecoveryMetric & { method: "sdnn" | "rmssd" }) | null;
  rhr: RecoveryMetric | null;
  /** Nights with HRV or RHR inside the two windows. */
  validNights: number;
  detail: string;
};

export type StageSplit = { deepMin: number; remMin: number; coreMin: number; awakeMin: number; asleepMin: number };

// ── Helpers ──

type Series = ReadonlyMap<LocalDate, number>;

function valuesIn(series: Series, from: LocalDate, to: LocalDate): number[] {
  const out: number[] = [];
  for (const [date, v] of series) if (date >= from && date <= to) out.push(v);
  return out;
}

type Window = { recentMean: number; baseMean: number; baseSd: number; recentDays: number; baselineDays: number };

/** The recent and baseline means as of `asOf`, or null when either gate fails. */
function windowAsOf(series: Series, asOf: LocalDate): Window | null {
  const recent = valuesIn(series, addDays(asOf, -(RECENT_DAYS - 1)), asOf);
  if (recent.length < RECENT_MIN_VALID) return null;
  const base = valuesIn(series, addDays(asOf, -(RECENT_DAYS + BASELINE_DAYS - 1)), addDays(asOf, -RECENT_DAYS));
  if (base.length < BASELINE_MIN_VALID) return null;
  return { recentMean: mean(recent), baseMean: mean(base), baseSd: stdev(base), recentDays: recent.length, baselineDays: base.length };
}

/** True when `flagOn(day)` held on FLAG_DAYS_MIN of the last FLAG_DAYS days. */
function holds(today: LocalDate, flagOn: (day: LocalDate) => boolean | null): boolean {
  let n = 0;
  for (let i = 0; i < FLAG_DAYS; i++) if (flagOn(addDays(today, -i)) === true) n += 1;
  return n >= FLAG_DAYS_MIN;
}

const hrvFlag = (w: Window): boolean => w.baseSd > 0 && (w.recentMean - w.baseMean) / w.baseSd <= HRV_Z_FLAG;
const rhrFlag = (w: Window): boolean => w.recentMean - w.baseMean >= Math.max(RHR_FLAG_BPM, RHR_FLAG_SD * w.baseSd);

const WORD: Record<RecoveryStatus, string> = { none: "", calibrating: "Calibrating", green: "As usual", amber: "Below usual", red: "Well below usual" };
const STATE: Record<RecoveryStatus, SignalState> = { none: "unknown", calibrating: "unknown", green: "good", amber: "watch", red: "attention" };

// ── Read ──

/**
 * The recovery read for `today`. `sleepShort` is §7.2's `short` or
 * `severe` from the judge, the third flag. HRV uses one method per
 * baseline: samples of a different method from the latest are dropped,
 * so a watch or app change restarts calibration.
 */
export function recoveryRead(nights: readonly SleepNight[], today: LocalDate, sleepShort = false): RecoveryRead {
  const byDate = nightsByDate(nights);
  const from = addDays(today, -(RECENT_DAYS + BASELINE_DAYS - 1));
  const hrvAll = new Map<LocalDate, { ms: number; method: "sdnn" | "rmssd" }>();
  const rhr = new Map<LocalDate, number>();
  for (const [date, n] of byDate) {
    if (date < from || date > today) continue;
    const s = n.night;
    if (typeof s.hrvMs === "number" && Number.isFinite(s.hrvMs) && s.hrvMs > 0) hrvAll.set(date, { ms: s.hrvMs, method: s.hrvMethod ?? "sdnn" });
    if (typeof s.restingHr === "number" && Number.isFinite(s.restingHr) && s.restingHr > 0) rhr.set(date, s.restingHr);
  }
  const dates = new Set([...hrvAll.keys(), ...rhr.keys()]);
  const validNights = dates.size;
  const none: RecoveryRead = { status: "none", state: "unknown", word: "", flags: [], hrv: null, rhr: null, validNights, detail: "" };
  if (validNights === 0) return none;

  // One HRV method per baseline: the latest sample's.
  const latest = [...hrvAll.keys()].sort().at(-1);
  const method = latest ? hrvAll.get(latest)!.method : "sdnn";
  const lnHrv = new Map<LocalDate, number>();
  for (const [date, v] of hrvAll) if (v.method === method) lnHrv.set(date, Math.log(v.ms));

  const hw = windowAsOf(lnHrv, today);
  const rw = windowAsOf(rhr, today);
  if (!hw && !rw) {
    const needed = BASELINE_MIN_VALID + RECENT_MIN_VALID;
    return { ...none, status: "calibrating", word: WORD.calibrating, detail: `${validNights} of ${needed} nights with watch data` };
  }

  const flags: RecoveryFlag[] = [];
  if (hw && holds(today, (d) => (windowAsOf(lnHrv, d) ? hrvFlag(windowAsOf(lnHrv, d)!) : null))) flags.push("hrv");
  if (rw && holds(today, (d) => (windowAsOf(rhr, d) ? rhrFlag(windowAsOf(rhr, d)!) : null))) flags.push("rhr");
  if (sleepShort) flags.push("sleep");
  const status: RecoveryStatus = flags.length === 0 ? "green" : flags.length === 1 ? "amber" : "red";

  const hrvRead = hw
    ? { recent: Math.round(Math.exp(hw.recentMean)), baseline: Math.round(Math.exp(hw.baseMean)), z: hw.baseSd > 0 ? round2((hw.recentMean - hw.baseMean) / hw.baseSd) : 0, recentDays: hw.recentDays, baselineDays: hw.baselineDays, method }
    : null;
  const rhrRead = rw ? { recent: Math.round(rw.recentMean), baseline: Math.round(rw.baseMean), z: rw.baseSd > 0 ? round2((rw.recentMean - rw.baseMean) / rw.baseSd) : 0, recentDays: rw.recentDays, baselineDays: rw.baselineDays } : null;
  const parts: string[] = [];
  if (hrvRead) parts.push(`HRV ${hrvRead.recent} ms, usually ${hrvRead.baseline}`);
  if (rhrRead) parts.push(`resting HR ${rhrRead.recent}, usually ${rhrRead.baseline}`);
  if (sleepShort) parts.push("sleep short");
  return { status, state: STATE[status], word: WORD[status], flags, hrv: hrvRead, rhr: rhrRead, validNights, detail: `${parts.join(" · ")} · last ${RECENT_DAYS} days` };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Stages (display only) ──

/** Deep, REM, core and awake minutes for one night, or null when the night carries no stage. Never scored. */
export function stageSplit(night: SleepNight): StageSplit | null {
  const s = night.stages;
  if (!s) return null;
  const take = (v: number | undefined) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  const deepMin = take(s.deepMin);
  const remMin = take(s.remMin);
  const coreMin = take(s.coreMin);
  const awakeMin = take(s.awakeMin);
  if (deepMin + remMin + coreMin === 0) return null;
  return { deepMin, remMin, coreMin, awakeMin, asleepMin: deepMin + remMin + coreMin };
}
