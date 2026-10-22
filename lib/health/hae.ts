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
 *
 * IN8 adds the day's totals (active energy, water, caffeine, sodium,
 * drinks), wrist temperature, and the payload's `workouts` and
 * `cycleTracking` lists, which Health Auto Export sends from their own
 * automations (data types Workouts and Cycle Tracking).
 */

import { HK_MAIN_SLEEP_END_HOUR, HK_MERGE_GAP_MIN } from "@/lib/physique/sleep";
import { cleanWorkout, entryDays, menstrualFlow, sortWorkouts, toCelsius, toKcal, toMetres, toMg, toMl, wristTempDay } from "@/lib/health/extras";
import type { HealthWorkout, MenstrualFlow, SleepSegment, SleepStage } from "@/lib/physique/types";

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

/** IN8: a day's total from Apple Health: kcal, ml, mg, mg, drinks. */
export type DayTotalKind = "activeEnergy" | "water" | "caffeine" | "sodium" | "alcohol";

export type ScalarSample = {
  kind: "weight" | "bodyFat" | "hrv" | "rhr" | "steps" | DayTotalKind | "wristTemp";
  day: string;
  /** kg, %, ms, bpm, count; IN8: the day totals' units above, °C for wrist temperature. */
  value: number;
  /** ISO-like local timestamp from the export, for `loggedAt`. */
  at: string;
  source: string | null;
};

/** IN8: the workouts that started on a local day. */
export type WorkoutsSample = { kind: "workouts"; day: string; workouts: HealthWorkout[]; source: null };

/** IN8 (opt-in): one day of a recorded period. */
export type CycleSample = { kind: "cycle"; day: string; flow: MenstrualFlow; cycleStart: boolean; source: string | null };

export type HealthSample = SleepSample | ScalarSample | WorkoutsSample | CycleSample;

/** IN8: the kinds read only when the person opts in. */
export const OPT_IN_KINDS: ReadonlySet<string> = new Set(["wristTemp", "cycle"]);

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
  // IN8. Health Auto Export names a metric after Apple Health's, so each takes the spellings seen for it.
  if (n === "active_energy" || n === "active_energy_burned") return "activeEnergy";
  if (n === "dietary_water" || n === "water") return "water";
  if (n === "dietary_caffeine" || n === "caffeine") return "caffeine";
  if (n === "dietary_sodium" || n === "sodium") return "sodium";
  if (n === "number_of_alcoholic_beverages" || n === "alcoholic_beverages" || n === "alcohol_consumption") return "alcohol";
  if (n === "apple_sleeping_wrist_temperature" || n === "sleeping_wrist_temperature" || n === "wrist_temperature") return "wristTemp";
  return null;
}

/** A metric's value in its stored unit, from the units the export names (IN8; weight in lb before). */
function canonical(kind: ScalarSample["kind"], raw: number, units: string): number {
  if (kind === "weight") return units === "lb" || units === "lbs" ? raw * LB_TO_KG : raw;
  if (kind === "activeEnergy") return toKcal(raw, units);
  if (kind === "water") return toMl(raw, units);
  if (kind === "caffeine" || kind === "sodium") return toMg(raw, units);
  if (kind === "wristTemp") return toCelsius(raw, units);
  return raw;
}

// ── Unaggregated sleep (S8) ──

/** Segments kept per night. OURS: a long night has a few hundred at most. */
export const MAX_SEGMENTS = 500;

/** One stage segment on the local clock (minutes since 1970-01-01, local), as `sleepFromSegments` folds them. */
export type StageSeg = { stage: SleepStage | "inbed"; start: number; end: number; source: string | null };
type Seg = StageSeg;

/** Minutes since 1970-01-01 on the local clock: day and clock as written, no timezone maths. */
export function localMinute(d: { day: string; clock: string }): number {
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
 * A scalar in its stored unit and rounding, or null when it can't be real:
 * kg (2 dp), body fat % (1 dp; a fraction like 0.18 is read as 18 %), HRV
 * ms (1 dp), resting HR bpm, steps. Shared by both Apple Health paths.
 */
export function cleanScalar(kind: ScalarSample["kind"], value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (kind === "weight") return value <= 0 || value > 500 ? null : Math.round(value * 100) / 100;
  if (kind === "bodyFat") {
    const pct = value > 0 && value <= 1 ? value * 100 : value;
    return pct <= 0 || pct > 80 ? null : Math.round(pct * 10) / 10;
  }
  if (kind === "hrv") return value <= 0 || value > 500 ? null : Math.round(value * 10) / 10;
  if (kind === "rhr") return value < 25 || value > 200 ? null : Math.round(value);
  // IN8: a day total of zero is a day nothing was logged, so unknown; the caps are past anything a person logs in a day.
  if (kind === "activeEnergy") return value <= 0 || value > 10_000 ? null : Math.round(value);
  if (kind === "water") return value <= 0 || value > 20_000 ? null : Math.round(value);
  if (kind === "caffeine") return value <= 0 || value > 5_000 ? null : Math.round(value);
  if (kind === "sodium") return value <= 0 || value > 50_000 ? null : Math.round(value);
  if (kind === "alcohol") return value <= 0 || value > 50 ? null : Math.round(value * 10) / 10;
  if (kind === "wristTemp") return value < 30 || value > 42 ? null : Math.round(value * 100) / 100;
  return value < 0 ? null : Math.round(value);
}

/** The stored `value` of a sample: the night's fields, or `{value, at}`. Shared by the ingest route and the iPhone app's merge (B11). */
export function sampleValue(s: HealthSample): Record<string, unknown> {
  if (s.kind === "sleep") return { asleepMin: s.asleepMin, inBedMin: s.inBedMin, bedtime: s.bedtime, wakeTime: s.wakeTime, stages: s.stages, ...(s.segments?.length ? { segments: s.segments } : {}) };
  if (s.kind === "workouts") return { workouts: s.workouts };
  if (s.kind === "cycle") return { flow: s.flow, cycleStart: s.cycleStart };
  return { value: s.value, at: s.at };
}

// ── Workouts and cycle (IN8) ──

const unitsOf = (v: unknown): string => (v && typeof v === "object" && typeof (v as { units?: unknown }).units === "string" ? (v as { units: string }).units : "");
const qtyOf = (v: unknown): number | null => (v && typeof v === "object" ? num((v as { qty?: unknown }).qty) : num(v));

/**
 * Workouts from the payload's `workouts` list, one sample per local start
 * day. Version 2 rows carry `duration` in seconds and `activeEnergyBurned`
 * as `{qty, units}`; version 1 rows only `start` and `end` and
 * `activeEnergy`.
 */
function parseWorkouts(list: readonly unknown[]): WorkoutsSample[] {
  const days = new Map<string, HealthWorkout[]>();
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const start = splitLocalDate(r.start);
    if (!start || typeof r.name !== "string") continue;
    const end = splitLocalDate(r.end);
    const seconds = num(r.duration);
    const durationMin = seconds != null ? seconds / 60 : end ? localMinute(end) - localMinute(start) : NaN;
    const energy = r.activeEnergyBurned ?? r.activeEnergy;
    const kcal = qtyOf(energy);
    const dist = qtyOf(r.distance);
    const w = cleanWorkout({
      name: r.name,
      start: start.clock,
      durationMin,
      activeKcal: kcal != null ? toKcal(kcal, unitsOf(energy)) : null,
      distanceM: dist != null ? toMetres(dist, unitsOf(r.distance)) : null,
      app: typeof r.source === "string" ? r.source : null,
    });
    if (w) days.set(start.day, [...(days.get(start.day) ?? []), w]);
  }
  return [...days.entries()].map(([day, ws]) => ({ kind: "workouts", day, workouts: sortWorkouts(ws), source: null }));
}

/** Days of a recorded period from the payload's `cycleTracking` list; other cycle entries (ovulation tests and the like) are not read. */
function parseCycle(list: readonly unknown[]): CycleSample[] {
  const out = new Map<string, CycleSample>();
  for (const row of list) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (typeof r.name !== "string" || !/menstrua/i.test(r.name)) continue;
    const flow = menstrualFlow(r.value);
    const start = splitLocalDate(r.start ?? r.date);
    if (!flow || !start) continue;
    const days = entryDays(start, splitLocalDate(r.end));
    if (!days) continue;
    days.forEach((day, i) => out.set(day, { kind: "cycle", day, flow, cycleStart: i === 0 && r.isCycleStart === true, source: typeof r.source === "string" ? r.source : null }));
  }
  return [...out.values()];
}

/**
 * Every recognised sample in a payload. Unknown metrics and malformed rows
 * are skipped silently; the caller reports the count it kept.
 */
export function parseHaePayload(payload: unknown): HealthSample[] {
  const data = (payload as { data?: { metrics?: unknown; workouts?: unknown; cycleTracking?: unknown } } | null)?.data;
  const metrics = Array.isArray(data?.metrics) ? data.metrics : [];
  const out: HealthSample[] = [];
  const segs: Seg[] = [];
  if (Array.isArray(data?.workouts)) out.push(...parseWorkouts(data.workouts));
  if (Array.isArray(data?.cycleTracking)) out.push(...parseCycle(data.cycleTracking));
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
      const raw = num(r.qty ?? r.value ?? r.avg);
      if (!at || raw == null) continue;
      const value = cleanScalar(kind, canonical(kind, raw, units));
      if (value == null) continue;
      const day = kind === "wristTemp" ? wristTempDay(at) : at.day;
      out.push({ kind, day, value, at: `${at.day}T${at.clock}:00`, source });
    }
  }
  if (segs.length) out.push(...sleepFromSegments(segs));
  return out;
}
