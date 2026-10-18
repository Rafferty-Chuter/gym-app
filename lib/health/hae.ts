/**
 * Health Auto Export → normalised samples (06-execution Sprint 0, S5).
 * Pure. The app's JSON (research D §2.1) is a `data.metrics[]` list; each
 * metric has a name, units and `data[]` rows with a `date` in
 * `yyyy-MM-dd HH:mm:ss Z`, or on a phone set to 12-hour time
 * `yyyy-MM-dd h:mm:ss a Z` ("2026-10-18 9:30:00 AM +0100", S10). Dates are
 * already local, so the local day is the first ten characters and the
 * clock follows: no timezone maths.
 *
 * Names are mapped defensively: the help page and the vendor's server
 * disagree on body mass (`weight_&_body_mass` vs `weight_body_mass`), and
 * aggregated sleep may carry `totalSleep` or `asleep`.
 *
 * Sleep arrives aggregated (one row per night) or unaggregated (one row
 * per stage segment with `startDate`, `endDate` and `value`, research D
 * §2.1). Unaggregated rows are folded into nights here (S8) and keep their
 * segments for the stage chart.
 */

import { HK_MAIN_SLEEP_END_HOUR, HK_MERGE_GAP_MIN } from "@/lib/physique/sleep";
import type { SleepSegment, SleepStage } from "@/lib/physique/types";

export type SleepSample = {
  kind: "sleep";
  /** Local wake date. */
  day: string;
  asleepMin: number;
  inBedMin: number | null;
  /** HH:MM local, when the export carried the start and end. */
  bedtime: string | null;
  wakeTime: string | null;
  stages: { coreMin: number | null; deepMin: number | null; remMin: number | null; awakeMin: number | null };
  /** Stage segments, only from unaggregated exports. */
  segments?: SleepSegment[];
  source: string | null;
};

export type ScalarSample = {
  kind: "weight" | "bodyFat" | "hrv" | "rhr" | "steps";
  day: string;
  /** kg, %, ms, bpm, count. */
  value: number;
  /** ISO-like local timestamp from the export, for `loggedAt`. */
  at: string;
  source: string | null;
};

export type HealthSample = SleepSample | ScalarSample;

/** Day, hour (one or two digits), minute, optional seconds, optional AM/PM (iOS puts a narrow no-break space before it, which `\s` matches). */
const DATE_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?\s*([AaPp][Mm])?/;

/**
 * Local day and 24-hour clock from an export date; null when malformed.
 * A phone set to 12-hour time exports "9:30:00 AM" and "11:53:00 PM":
 * read before S10 as no time at all and as 11:53, which put wake times at
 * midnight's "12:00" and bedtimes twelve hours early.
 */
export function splitLocalDate(s: unknown): { day: string; clock: string } | null {
  if (typeof s !== "string") return null;
  const m = DATE_RE.exec(s.trim());
  if (!m) return null;
  let hour = Number(m[2]);
  const minute = Number(m[3]);
  const half = m[4]?.toLowerCase();
  if (half) {
    if (hour < 1 || hour > 12) return null;
    hour = (hour % 12) + (half === "pm" ? 12 : 0);
  }
  if (hour > 23 || minute > 59) return null;
  return { day: m[1], clock: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

const LB_TO_KG = 0.45359237;

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function hoursToMin(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n * 60);
}

function metricKind(name: string): ScalarSample["kind"] | "sleep" | null {
  const n = name.trim().toLowerCase();
  if (n === "sleep_analysis") return "sleep";
  if (n === "weight_body_mass" || n === "weight_&_body_mass" || n === "body_mass" || n === "weight") return "weight";
  if (n === "body_fat_percentage" || n === "body_fat") return "bodyFat";
  if (n === "heart_rate_variability" || n === "hrv") return "hrv";
  if (n === "resting_heart_rate") return "rhr";
  if (n === "step_count" || n === "steps") return "steps";
  return null;
}

// ── Unaggregated sleep (S8) ──

/** Segments kept per night. OURS: a long night has a few hundred at most. */
export const MAX_SEGMENTS = 500;

type Seg = { stage: SleepStage | "inbed"; start: number; end: number; source: string | null };

/** Minutes since 1970-01-01 on the local clock: day and clock as written, no timezone maths. */
function localMinute(d: { day: string; clock: string }): number {
  const [y, m, dd] = d.day.split("-").map(Number);
  const [hh, mm] = d.clock.split(":").map(Number);
  return Math.round(Date.UTC(y, m - 1, dd) / 60_000) + hh * 60 + mm;
}

function dayOf(localMin: number): string {
  return new Date(Math.floor(localMin / 1440) * 86_400_000).toISOString().slice(0, 10);
}

function clockOf(localMin: number): string {
  const m = ((localMin % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function stageOf(value: unknown): Seg["stage"] | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v.includes("deep")) return "deep";
  if (v.includes("rem")) return "rem";
  if (v.includes("core")) return "core";
  if (v.includes("awake")) return "awake";
  if (v.includes("in bed") || v === "inbed") return "inbed";
  if (v.includes("asleep") || v.includes("unspecified")) return "asleep";
  return null;
}

/**
 * Fold stage segments into nights, as `nightsFromHealthKitSamples` does
 * for HealthKit: asleep and awake segments merge into sessions across gaps
 * of at most HK_MERGE_GAP_MIN; per wake day the main sleep is the session
 * with the most sleep ending between 03:00 and 14:00. Naps are dropped.
 */
export function sleepFromSegments(segs: readonly Seg[]): SleepSample[] {
  const body = segs.filter((s) => s.stage !== "inbed" && s.end > s.start).sort((a, b) => a.start - b.start);
  type Session = { start: number; end: number; segs: Seg[]; asleep: number };
  const sessions: Session[] = [];
  for (const s of body) {
    const last = sessions[sessions.length - 1];
    const asleep = s.stage === "awake" ? 0 : s.end - s.start;
    if (last && s.start - last.end <= HK_MERGE_GAP_MIN) {
      last.end = Math.max(last.end, s.end);
      last.segs.push(s);
      last.asleep += asleep;
    } else {
      sessions.push({ start: s.start, end: s.end, segs: [s], asleep });
    }
  }
  const main = new Map<string, Session>();
  for (const ses of sessions) {
    const asleepSegs = ses.segs.filter((x) => x.stage !== "awake");
    if (asleepSegs.length === 0) continue;
    const end = Math.max(...asleepSegs.map((x) => x.end));
    const hour = Math.floor((((end % 1440) + 1440) % 1440) / 60);
    if (hour < HK_MAIN_SLEEP_END_HOUR.min || hour >= HK_MAIN_SLEEP_END_HOUR.max) continue;
    const day = dayOf(end);
    const cur = main.get(day);
    if (!cur || ses.asleep > cur.asleep) main.set(day, ses);
  }
  const out: SleepSample[] = [];
  for (const [day, ses] of [...main.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const asleepSegs = ses.segs.filter((x) => x.stage !== "awake");
    const start = Math.min(...asleepSegs.map((x) => x.start));
    const end = Math.max(...asleepSegs.map((x) => x.end));
    const totals = { core: 0, deep: 0, rem: 0, awake: 0, asleep: 0 };
    const segments: SleepSegment[] = [];
    for (const x of [...ses.segs].sort((a, b) => a.start - b.start)) {
      const a = Math.max(start, x.start);
      const b = Math.min(end, x.end);
      if (b <= a) continue;
      totals[x.stage as keyof typeof totals] += b - a;
      const prev = segments[segments.length - 1];
      if (prev && prev.s === x.stage && prev.o + prev.d >= a - start) prev.d = Math.max(prev.d, b - start - prev.o);
      else segments.push({ s: x.stage as SleepStage, o: a - start, d: b - a });
    }
    const asleepMin = totals.core + totals.deep + totals.rem + totals.asleep;
    if (asleepMin <= 0) continue;
    const beds = segs.filter((x) => x.stage === "inbed" && x.end > start - 120 && x.start < end + 120);
    const inBed = beds.length ? Math.max(...beds.map((x) => x.end)) - Math.min(...beds.map((x) => x.start)) : null;
    out.push({
      kind: "sleep",
      day,
      asleepMin,
      inBedMin: inBed && inBed >= asleepMin ? inBed : null,
      bedtime: clockOf(start),
      wakeTime: clockOf(end),
      stages: { coreMin: totals.core || null, deepMin: totals.deep || null, remMin: totals.rem || null, awakeMin: totals.awake },
      segments: segments.slice(0, MAX_SEGMENTS),
      source: ses.segs[0]?.source ?? null,
    });
  }
  return out;
}

/**
 * Every recognised sample in a payload. Unknown metrics and malformed rows
 * are skipped silently; the caller reports the count it kept.
 */
export function parseHaePayload(payload: unknown): HealthSample[] {
  const metrics = (payload as { data?: { metrics?: unknown } } | null)?.data?.metrics;
  if (!Array.isArray(metrics)) return [];
  const out: HealthSample[] = [];
  const segs: Seg[] = [];
  for (const metric of metrics) {
    if (!metric || typeof metric !== "object") continue;
    const m = metric as { name?: unknown; units?: unknown; data?: unknown };
    const kind = typeof m.name === "string" ? metricKind(m.name) : null;
    if (!kind || !Array.isArray(m.data)) continue;
    const units = typeof m.units === "string" ? m.units.trim().toLowerCase() : "";
    for (const row of m.data) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const source = typeof r.source === "string" ? r.source : null;
      if (kind === "sleep" && r.startDate !== undefined && r.endDate !== undefined && typeof r.value === "string") {
        const a = splitLocalDate(r.startDate);
        const b = splitLocalDate(r.endDate);
        const stage = stageOf(r.value);
        if (a && b && stage) segs.push({ stage, start: localMinute(a), end: localMinute(b), source });
        continue;
      }
      if (kind === "sleep") {
        // The row's own date names the day, never the wake time: it is midnight.
        const endExact = splitLocalDate(r.sleepEnd) ?? splitLocalDate(r.inBedEnd);
        const end = endExact ?? splitLocalDate(r.date);
        if (!end) continue;
        const start = splitLocalDate(r.sleepStart) ?? splitLocalDate(r.inBedStart);
        const total = hoursToMin(r.totalSleep);
        const asleepField = hoursToMin(r.asleep);
        const core = hoursToMin(r.core);
        const deep = hoursToMin(r.deep);
        const rem = hoursToMin(r.rem);
        const awake = hoursToMin(r.awake);
        const stages = [core, deep, rem].filter((x): x is number => x != null);
        const asleepMin = total && total > 0 ? total : asleepField && asleepField > 0 ? asleepField : stages.length ? stages.reduce((a, b) => a + b, 0) : null;
        if (asleepMin == null || asleepMin <= 0) continue;
        out.push({
          kind: "sleep",
          day: end.day,
          asleepMin,
          inBedMin: hoursToMin(r.inBed),
          bedtime: start?.clock ?? null,
          wakeTime: endExact?.clock ?? null,
          stages: { coreMin: core, deepMin: deep, remMin: rem, awakeMin: awake },
          source,
        });
        continue;
      }
      const at = splitLocalDate(r.date);
      let value = num(r.qty ?? r.value ?? r.avg);
      if (!at || value == null) continue;
      if (kind === "weight") {
        if (units === "lb" || units === "lbs") value *= LB_TO_KG;
        if (value <= 0 || value > 500) continue;
        value = Math.round(value * 100) / 100;
      } else if (kind === "bodyFat") {
        if (value > 0 && value <= 1) value *= 100;
        if (value <= 0 || value > 80) continue;
        value = Math.round(value * 10) / 10;
      } else if (kind === "hrv") {
        if (value <= 0 || value > 500) continue;
        value = Math.round(value * 10) / 10;
      } else if (kind === "rhr") {
        if (value < 25 || value > 200) continue;
        value = Math.round(value);
      } else {
        value = Math.round(value);
      }
      out.push({ kind, day: at.day, value, at: `${at.day}T${at.clock}:00`, source });
    }
  }
  if (segs.length) out.push(...sleepFromSegments(segs));
  return out;
}
