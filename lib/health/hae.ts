/**
 * Health Auto Export → normalised samples (06-execution Sprint 0, S5).
 * Pure. The app's JSON (research D §2.1) is a `data.metrics[]` list; each
 * metric has a name, units and `data[]` rows with a `date` in
 * `yyyy-MM-dd HH:mm:ss Z`. Dates are already local, so the local day is
 * the first ten characters and the clock the next five: no timezone maths.
 *
 * Names are mapped defensively: the help page and the vendor's server
 * disagree on body mass (`weight_&_body_mass` vs `weight_body_mass`), and
 * aggregated sleep may carry `totalSleep` or `asleep`.
 */

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

const DATE_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::\d{2})?/;

/** Local day and clock from an export date; null when malformed. */
export function splitLocalDate(s: unknown): { day: string; clock: string } | null {
  if (typeof s !== "string") return null;
  const m = DATE_RE.exec(s.trim());
  return m ? { day: m[1], clock: m[2] } : null;
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

/**
 * Every recognised sample in a payload. Unknown metrics and malformed rows
 * are skipped silently; the caller reports the count it kept.
 */
export function parseHaePayload(payload: unknown): HealthSample[] {
  const metrics = (payload as { data?: { metrics?: unknown } } | null)?.data?.metrics;
  if (!Array.isArray(metrics)) return [];
  const out: HealthSample[] = [];
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
      if (kind === "sleep") {
        const end = splitLocalDate(r.sleepEnd) ?? splitLocalDate(r.inBedEnd) ?? splitLocalDate(r.date);
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
          wakeTime: end.clock,
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
  return out;
}
