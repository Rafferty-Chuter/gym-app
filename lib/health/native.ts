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

type Pick = "first" | "last" | "mean";

/** One scalar per local day: the morning reading for weight and body fat, the day's mean HRV, the latest resting HR. */
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
    const raw = pick === "mean" ? sorted.reduce((sum, x) => sum + x.value, 0) / sorted.length : chosen.value;
    const value = cleanScalar(kind, raw);
    if (value == null) continue;
    out.push({ kind, day, value, at: `${day}T${chosen.at.clock}:00`, source: chosen.source });
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
  const all: HealthSample[] = [
    ...nativeSleep(read.sleep, tz),
    ...perDay("weight", read.weight, tz, "first"),
    ...perDay("bodyFat", read.bodyFat, tz, "first"),
    ...perDay("hrv", read.hrv, tz, "mean"),
    ...perDay("rhr", read.rhr, tz, "last"),
    ...stepsPerDay(read.steps, tz),
  ];
  return fromDay ? all.filter((s) => s.day >= fromDay) : all;
}

/** Samples as the rows `mergeSamples` takes, stamped with when they were read. */
export function toMergeRows(samples: readonly HealthSample[], readAt: string): MergeRow[] {
  return samples.map((s) => ({ metric: s.kind, day: s.day, value: sampleValue(s), source: s.source, received_at: readAt }));
}
