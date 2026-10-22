/**
 * Apple Health read on the iPhone app (B11) → the samples the Health Auto
 * Export path already merges (`HealthSample`, lib/health/hae.ts), so both
 * paths store the same nights, weigh-ins and steps. Pure: the plugin's raw
 * samples and the phone's time zone in, local days out.
 *
 * Reading HealthKit directly fixes S12 at the root: each sync reads every
 * stage segment of the window at once, so a night is never split by an
 * upload. Each sleep source (Apple Watch, iPhone, an app such as Bevel) is
 * folded on its own and one night per wake day is kept, so sources that
 * record the same night are never added together.
 */

import { cleanScalar, localMinute, sampleValue, sleepFromSegments, type HealthSample, type ScalarSample, type SleepSample, type StageSeg } from "@/lib/health/hae";

/** The fields of a `@capgo/capacitor-health` sample this reads. */
export type NativeSample = {
  value: number;
  startDate: string;
  endDate: string;
  sourceName?: string;
  sourceId?: string;
  sleepState?: string;
};

/** One day bucket of the plugin's `queryAggregated` (steps summed per day). */
export type NativeDayTotal = { startDate: string; value: number };

/** What one sync read, by kind. */
export type NativeRead = {
  sleep: readonly NativeSample[];
  weight: readonly NativeSample[];
  bodyFat: readonly NativeSample[];
  hrv: readonly NativeSample[];
  rhr: readonly NativeSample[];
  steps: readonly NativeDayTotal[];
};

/** A row as `mergeSamples` (lib/physique/io/healthLink.ts) takes it: the shape the server stores. */
export type MergeRow = { metric: string; day: string; value: Record<string, unknown>; source: string | null; received_at: string };

/** The plugin's sleep states → stages. Apple's "core" sleep arrives as "light". */
const STAGE: Readonly<Record<string, StageSeg["stage"]>> = { inBed: "inbed", asleep: "asleep", awake: "awake", light: "core", deep: "deep", rem: "rem" };

/**
 * Local day and HH:MM of an instant in `tz`; null when either is malformed.
 * A night across a clock change is off by the hour for the segments that
 * cross it, as the Health Auto Export path is (its dates are already local).
 */
export function localStamp(iso: string, tz: string): { day: string; clock: string } | null {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const day = `${get("year")}-${get("month")}-${get("day")}`;
    const clock = `${get("hour")}:${get("minute")}`;
    return /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(clock) ? { day, clock } : null;
  } catch {
    return null;
  }
}

const hasStages = (n: SleepSample) => n.stages.deepMin != null || n.stages.remMin != null;

/**
 * Nights from raw sleep samples: each source folded into nights by
 * `sleepFromSegments` (main sleep per wake day, naps dropped), then per
 * wake day the night with stage data (a watch), else the longest.
 */
export function nativeSleep(samples: readonly NativeSample[], tz: string): SleepSample[] {
  const bySource = new Map<string, StageSeg[]>();
  for (const s of samples) {
    const stage = s.sleepState ? STAGE[s.sleepState] : undefined;
    const a = localStamp(s.startDate, tz);
    const b = localStamp(s.endDate, tz);
    if (!stage || !a || !b) continue;
    const key = s.sourceId ?? s.sourceName ?? "";
    const list = bySource.get(key) ?? [];
    list.push({ stage, start: localMinute(a), end: localMinute(b), source: s.sourceName ?? null });
    bySource.set(key, list);
  }
  const best = new Map<string, SleepSample>();
  for (const segs of bySource.values()) {
    for (const night of sleepFromSegments(segs)) {
      const cur = best.get(night.day);
      const better = !cur || (hasStages(night) !== hasStages(cur) ? hasStages(night) : night.asleepMin > cur.asleepMin);
      if (better) best.set(night.day, night);
    }
  }
  return [...best.values()].sort((a, b) => (a.day < b.day ? -1 : 1));
}

type Pick = "first" | "last";

/** One scalar per local day: the morning reading for weight and body fat, the latest resting HR. */
function perDay(kind: ScalarSample["kind"], samples: readonly NativeSample[], tz: string, pick: Pick): ScalarSample[] {
  const days = new Map<string, Array<{ at: { day: string; clock: string }; value: number; source: string | null }>>();
  for (const s of samples) {
    const at = localStamp(s.startDate, tz);
    if (!at || !Number.isFinite(s.value)) continue;
    days.set(at.day, [...(days.get(at.day) ?? []), { at, value: s.value, source: s.sourceName ?? null }]);
  }
  const out: ScalarSample[] = [];
  for (const [day, list] of [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const sorted = [...list].sort((a, b) => (a.at.clock < b.at.clock ? -1 : a.at.clock > b.at.clock ? 1 : 0));
    const chosen = pick === "first" ? sorted[0] : sorted[sorted.length - 1];
    const value = cleanScalar(kind, chosen.value);
    if (value == null) continue;
    out.push({ kind, day, value, at: `${day}T${chosen.at.clock}:00`, source: chosen.source });
  }
  return out;
}

// ── Overnight HRV (IN1) ──

/** Minutes after the wake time that still count as the night. OURS: the watch's last overnight reading can land just after the wake time it reports. */
export const HRV_WAKE_SLACK_MIN = 30;
/** With no night recorded, the stand-in window for a wake day starts at this clock the evening before (minutes after midnight). OURS. */
export const HRV_FALLBACK_FROM_MIN = 21 * 60;
/** ...and ends at this clock on the wake day. OURS: after 09:00 a reading is a daytime one. */
export const HRV_FALLBACK_TO_MIN = 9 * 60;

const dayNumber = (day: string) => Math.round(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
const dayOfNumber = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
const clockMin = (clock: string) => Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/**
 * HRV per wake day from the night's readings only, so the morning read is
 * one method: daytime readings (a walk, a Breathe session) used to be
 * averaged in, and a reading before midnight landed on the night before.
 * A reading counts for the night it falls in, from bedtime to 30 minutes
 * after waking; on a day with no night recorded, from 21:00 the evening
 * before to 09:00. EVID: recovery reads use overnight HRV, and daytime spot
 * values are confounded (research C §1 and the HealthKit table).
 */
function overnightHrv(samples: readonly NativeSample[], nights: readonly SleepSample[], tz: string): ScalarSample[] {
  const windows = new Map<number, readonly [number, number]>();
  for (const n of nights) {
    if (!n.bedtime || !n.wakeTime) continue;
    const d = dayNumber(n.day);
    const wake = d * 1440 + clockMin(n.wakeTime);
    const bed = d * 1440 + clockMin(n.bedtime) - (n.bedtime > n.wakeTime ? 1440 : 0);
    windows.set(d, [bed, wake + HRV_WAKE_SLACK_MIN]);
  }
  const byDay = new Map<number, Array<{ abs: number; at: string; value: number; source: string | null }>>();
  for (const s of samples) {
    const at = localStamp(s.startDate, tz);
    if (!at || !Number.isFinite(s.value)) continue;
    const day = dayNumber(at.day);
    const minute = clockMin(at.clock);
    const abs = day * 1440 + minute;
    let wakeDay = [day, day + 1].find((d) => {
      const w = windows.get(d);
      return w != null && abs >= w[0] && abs <= w[1];
    });
    if (wakeDay == null) {
      const stand = minute >= HRV_FALLBACK_FROM_MIN ? day + 1 : minute <= HRV_FALLBACK_TO_MIN ? day : null;
      if (stand != null && !windows.has(stand)) wakeDay = stand;
    }
    if (wakeDay == null) continue;
    byDay.set(wakeDay, [...(byDay.get(wakeDay) ?? []), { abs, at: `${at.day}T${at.clock}:00`, value: s.value, source: s.sourceName ?? null }]);
  }
  const out: ScalarSample[] = [];
  for (const [d, list] of [...byDay.entries()].sort((a, b) => a[0] - b[0])) {
    const sorted = [...list].sort((a, b) => a.abs - b.abs);
    const value = cleanScalar("hrv", sorted.reduce((sum, x) => sum + x.value, 0) / sorted.length);
    if (value == null) continue;
    out.push({ kind: "hrv", day: dayOfNumber(d), value, at: sorted[0].at, source: sorted[0].source });
  }
  return out;
}

/** Steps per local day from the plugin's day buckets. */
function stepsPerDay(totals: readonly NativeDayTotal[], tz: string): ScalarSample[] {
  const out: ScalarSample[] = [];
  for (const t of totals) {
    const at = localStamp(t.startDate, tz);
    const value = cleanScalar("steps", t.value);
    if (!at || value == null) continue;
    out.push({ kind: "steps", day: at.day, value, at: `${at.day}T00:00:00`, source: "Apple Health" });
  }
  return out;
}

/**
 * Everything one sync read, as the samples the Health Auto Export path
 * produces. Days before `fromDay` are dropped: a read window starts in the
 * small hours, so its first night is cut short and must not replace the
 * whole night already stored.
 */
export function nativeSamples(read: NativeRead, tz: string, fromDay?: string): HealthSample[] {
  const nights = nativeSleep(read.sleep, tz);
  const all: HealthSample[] = [
    ...nights,
    ...perDay("weight", read.weight, tz, "first"),
    ...perDay("bodyFat", read.bodyFat, tz, "first"),
    ...overnightHrv(read.hrv, nights, tz),
    ...perDay("rhr", read.rhr, tz, "last"),
    ...stepsPerDay(read.steps, tz),
  ];
  return fromDay ? all.filter((s) => s.day >= fromDay) : all;
}

// ── Long reads (IN1) ──

/** Longest span read in one query. OURS: a year of a watch's and a phone's sleep samples (about 80 a night) would pass the read limit of 20,000 and lose the latest nights. */
export const READ_CHUNK_DAYS = 60;

/** The window of `days` before `nowIso` as consecutive spans of at most `READ_CHUNK_DAYS`, oldest first. */
export function readChunks(nowIso: string, days: number): Array<{ startDate: string; endDate: string }> {
  const end = Date.parse(nowIso);
  const out: Array<{ startDate: string; endDate: string }> = [];
  for (let from = end - days * 86_400_000; from < end; from += READ_CHUNK_DAYS * 86_400_000) {
    out.push({ startDate: new Date(from).toISOString(), endDate: new Date(Math.min(end, from + READ_CHUNK_DAYS * 86_400_000)).toISOString() });
  }
  return out;
}

/** One copy of each sample: HealthKit returns a sample that crosses a chunk's edge in both chunks. */
export function uniqueSamples(samples: readonly NativeSample[]): NativeSample[] {
  const seen = new Set<string>();
  const out: NativeSample[] = [];
  for (const s of samples) {
    const key = `${s.sourceId ?? s.sourceName ?? ""}|${s.startDate}|${s.endDate}|${s.sleepState ?? ""}|${s.value}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Samples as the rows `mergeSamples` takes, stamped with when they were read. */
export function toMergeRows(samples: readonly HealthSample[], readAt: string): MergeRow[] {
  return samples.map((s) => ({ metric: s.kind, day: s.day, value: sampleValue(s), source: s.source, received_at: readAt }));
}
