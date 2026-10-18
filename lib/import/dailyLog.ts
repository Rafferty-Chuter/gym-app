/**
 * Daily-log CSV import (I1): a day per row of the numbers another app or a
 * spreadsheet keeps (weight, the day's food totals, sleep, steps), plus an
 * optional goal line, so history can be brought in and the app tried with
 * a few months of data. Pure: parsing, checking, building records and
 * writing the same format back out.
 *
 * The format, every column but `date` optional:
 *
 *   # goal start=2026-08-24 target_kg=80 rate_pct_per_week=-0.6 training=intermediate
 *   date,weight_kg,calories,protein_g,carbs_g,fat_g,fibre_g,bedtime,wake,asleep_min,steps
 *   2026-08-10,86.2,2650,170,280,85,28,23:15,07:05,452,8420
 *
 * Imported records carry `source: "import"` and ids made from the date, so
 * importing the same file twice replaces rather than doubles, and a day
 * the user already logged themselves is never overwritten.
 */

import { isLocalDate, type LocalDate } from "@/lib/dates";
import { parseCsv } from "@/lib/csvImport";
import { ASLEEP_OFFSET_MIN, minutesInBed, parseClock } from "@/lib/physique/dayTotals";
import type { DailySteps, FoodEntry, SleepNight, TrainingStatus, WeighIn } from "@/lib/physique/types";

// ── Limits ──

/** Values outside these are typing slips, not data; the field is dropped and counted. OURS. */
export const LIMITS = {
  weightKg: [20, 400],
  kcal: [0, 10000],
  macroG: [0, 1000],
  fibreG: [0, 150],
  asleepMin: [0, 18 * 60],
  steps: [0, 100000],
  targetKg: [30, 300],
  ratePct: [-2, 2],
} as const;
/** Rows per file. OURS: a little over two years of days. */
export const MAX_ROWS = 800;
/** The time a day-total food entry is placed at. OURS: midday, out of the way of real meals. */
export const DAY_TOTAL_TIME = "12:00";
/** The label of an imported day total. */
export const DAY_TOTAL_LABEL = "Day total (imported)";

// ── Types ──

export type DailyRow = {
  date: LocalDate;
  weightKg?: number;
  kcal?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
  fibreG?: number;
  bedtime?: string;
  wake?: string;
  asleepMin?: number;
  steps?: number;
};

export type GoalLine = { start: LocalDate; targetKg: number; ratePctPerWeek: number; training: TrainingStatus };

export type DailyLogParse = {
  rows: DailyRow[];
  goal: GoalLine | null;
  /** One short sentence per problem, at most a handful. */
  issues: string[];
};

const COLUMNS: Record<keyof Omit<DailyRow, "date"> | "date", readonly string[]> = {
  date: ["date", "day"],
  weightKg: ["weight_kg", "weight", "weight (kg)", "bodyweight_kg"],
  kcal: ["calories", "kcal", "energy_kcal", "energy"],
  proteinG: ["protein_g", "protein"],
  carbsG: ["carbs_g", "carbs", "carbohydrate_g", "carbohydrates"],
  fatG: ["fat_g", "fat"],
  fibreG: ["fibre_g", "fiber_g", "fibre", "fiber"],
  bedtime: ["bedtime", "sleep_start", "bed"],
  wake: ["wake", "wake_time", "sleep_end", "woke"],
  asleepMin: ["asleep_min", "asleep_minutes", "sleep_min", "sleep_minutes"],
  steps: ["steps", "step_count"],
};

const TRAINING: readonly TrainingStatus[] = ["novice", "intermediate", "advanced"];

function num(s: string | undefined): number | null {
  const t = (s ?? "").trim().replace(/,/g, "");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function within(v: number | null, [lo, hi]: readonly [number, number]): number | null {
  return v != null && v >= lo && v <= hi ? v : null;
}

function clock(s: string | undefined): string | null {
  const m = parseClock((s ?? "").trim());
  return m == null ? null : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** `# goal start=… target_kg=… rate_pct_per_week=… training=…`, or null when absent or unusable. */
export function parseGoalLine(line: string): GoalLine | null {
  const body = line.replace(/^#\s*goal\b/i, "");
  const kv = new Map(
    body
      .trim()
      .split(/\s+/)
      .map((p) => p.split("="))
      .filter((p) => p.length === 2)
      .map(([k, v]) => [k.toLowerCase(), v])
  );
  const start = kv.get("start") ?? "";
  const targetKg = within(num(kv.get("target_kg")), LIMITS.targetKg);
  const rate = within(num(kv.get("rate_pct_per_week")), LIMITS.ratePct);
  const training = (kv.get("training") ?? "intermediate").toLowerCase() as TrainingStatus;
  if (!isLocalDate(start) || targetKg == null || rate == null) return null;
  return { start, targetKg, ratePctPerWeek: rate, training: TRAINING.includes(training) ? training : "intermediate" };
}

/**
 * Rows and the goal line from the file's text. Rows after `today` are
 * dropped (a log cannot run ahead of the day), the last row wins for a
 * repeated date, and an out-of-range value drops only that field.
 */
export function parseDailyLog(text: string, today: LocalDate): DailyLogParse {
  const issues: string[] = [];
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  let goal: GoalLine | null = null;
  for (const l of lines) {
    if (/^\s*#\s*goal\b/i.test(l)) {
      goal = parseGoalLine(l.trim());
      if (!goal) issues.push("The goal line needs start, target_kg and rate_pct_per_week; it was left out.");
    }
  }
  const body = lines.filter((l) => !/^\s*#/.test(l)).join("\n");
  const table = parseCsv(body).filter((r) => r.some((c) => c.trim() !== ""));
  if (table.length === 0) return { rows: [], goal, issues: [...issues, "No rows found."] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = Object.fromEntries((Object.keys(COLUMNS) as Array<keyof typeof COLUMNS>).map((k) => [k, header.findIndex((h) => COLUMNS[k].includes(h))])) as Record<keyof typeof COLUMNS, number>;
  if (col.date < 0) return { rows: [], goal, issues: [...issues, "The first row needs a date column."] };

  const byDate = new Map<LocalDate, DailyRow>();
  let future = 0;
  let badDate = 0;
  let dropped = 0;
  for (const cells of table.slice(1, MAX_ROWS + 1)) {
    const date = (cells[col.date] ?? "").trim();
    if (!isLocalDate(date)) {
      badDate++;
      continue;
    }
    if (date > today) {
      future++;
      continue;
    }
    const cell = (k: keyof typeof COLUMNS) => (col[k] >= 0 ? cells[col[k]] : undefined);
    const row: DailyRow = { date };
    const set = <K extends keyof DailyRow>(k: K, v: DailyRow[K] | null, raw: string | undefined) => {
      if (v != null) row[k] = v;
      else if ((raw ?? "").trim() !== "") dropped++;
    };
    set("weightKg", within(num(cell("weightKg")), LIMITS.weightKg), cell("weightKg"));
    set("kcal", within(num(cell("kcal")), LIMITS.kcal), cell("kcal"));
    set("proteinG", within(num(cell("proteinG")), LIMITS.macroG), cell("proteinG"));
    set("carbsG", within(num(cell("carbsG")), LIMITS.macroG), cell("carbsG"));
    set("fatG", within(num(cell("fatG")), LIMITS.macroG), cell("fatG"));
    set("fibreG", within(num(cell("fibreG")), LIMITS.fibreG), cell("fibreG"));
    set("bedtime", clock(cell("bedtime")), cell("bedtime"));
    set("wake", clock(cell("wake")), cell("wake"));
    set("asleepMin", within(num(cell("asleepMin")), LIMITS.asleepMin), cell("asleepMin"));
    set("steps", within(num(cell("steps")), LIMITS.steps), cell("steps"));
    byDate.set(date, row);
  }
  if (table.length - 1 > MAX_ROWS) issues.push(`Only the first ${MAX_ROWS} rows were read.`);
  if (badDate) issues.push(`${badDate} ${badDate === 1 ? "row has" : "rows have"} no date in YYYY-MM-DD form and ${badDate === 1 ? "was" : "were"} skipped.`);
  if (future) issues.push(`${future} ${future === 1 ? "row is" : "rows are"} after today and ${future === 1 ? "was" : "were"} skipped.`);
  if (dropped) issues.push(`${dropped} ${dropped === 1 ? "value was" : "values were"} out of range and left out.`);
  const rows = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { rows, goal, issues };
}

// ── Records ──

export type Existing = { weighIns: readonly WeighIn[]; foodEntries: readonly FoodEntry[]; sleepNights: readonly SleepNight[]; steps: readonly DailySteps[] };

export type DailyLogRecords = {
  weighIns: WeighIn[];
  foodEntries: FoodEntry[];
  sleepNights: SleepNight[];
  steps: DailySteps[];
  /** Days skipped per kind because the user had already logged them. */
  kept: { weight: number; food: number; sleep: number; steps: number };
};

/** Dates that already hold a record of this kind that did not come from an import. */
function ownDates(records: ReadonlyArray<{ date: LocalDate; source: string }>): Set<LocalDate> {
  return new Set(records.filter((r) => r.source !== "import").map((r) => r.date));
}

/**
 * Records for the rows. Ids come from the date (`imp-w-2026-08-10`), so a
 * second import of the same days replaces the first. A day the user logged
 * themselves (any source but "import") keeps its own record of that kind.
 */
export function dailyLogRecords(rows: readonly DailyRow[], existing: Existing, nowIso: string): DailyLogRecords {
  const own = { weight: ownDates(existing.weighIns), food: ownDates(existing.foodEntries), sleep: ownDates(existing.sleepNights), steps: ownDates(existing.steps) };
  const kept = { weight: 0, food: 0, sleep: 0, steps: 0 };
  const base = (id: string, date: LocalDate) => ({ id, date, loggedAt: nowIso, source: "import" as const, schemaVersion: 1 as const });
  const out: DailyLogRecords = { weighIns: [], foodEntries: [], sleepNights: [], steps: [], kept };
  for (const r of rows) {
    if (r.weightKg != null) {
      if (own.weight.has(r.date)) kept.weight++;
      else out.weighIns.push({ ...base(`imp-w-${r.date}`, r.date), kg: Math.round(r.weightKg * 100) / 100 });
    }
    if (r.kcal != null) {
      if (own.food.has(r.date)) kept.food++;
      else
        out.foodEntries.push({
          ...base(`imp-f-${r.date}`, r.date),
          label: DAY_TOTAL_LABEL,
          kcal: Math.round(r.kcal),
          proteinG: Math.round(r.proteinG ?? 0),
          carbsG: Math.round(r.carbsG ?? 0),
          fatG: Math.round(r.fatG ?? 0),
          ...(r.fibreG != null ? { fibreG: Math.round(r.fibreG * 10) / 10 } : {}),
          method: "quick",
          time: DAY_TOTAL_TIME,
        });
    }
    const inBed = r.bedtime && r.wake ? minutesInBed(r.bedtime, r.wake) : null;
    const asleep = r.asleepMin ?? (inBed != null && inBed > ASLEEP_OFFSET_MIN ? inBed - ASLEEP_OFFSET_MIN : null);
    if (asleep != null && asleep > 0) {
      if (own.sleep.has(r.date)) kept.sleep++;
      else out.sleepNights.push({ ...base(`imp-n-${r.date}`, r.date), asleepMin: Math.round(asleep), ...(r.bedtime ? { bedtime: r.bedtime } : {}), ...(r.wake ? { wakeTime: r.wake } : {}), ...(inBed != null && inBed >= asleep ? { inBedMin: inBed } : {}) });
    }
    if (r.steps != null) {
      if (own.steps.has(r.date)) kept.steps++;
      else out.steps.push({ ...base(`imp-s-${r.date}`, r.date), steps: Math.round(r.steps) });
    }
  }
  return out;
}

// ── Writing ──

const HEADER = ["date", "weight_kg", "calories", "protein_g", "carbs_g", "fat_g", "fibre_g", "bedtime", "wake", "asleep_min", "steps"] as const;

/** The format above, for the sample file and any export. */
export function dailyLogCsv(rows: readonly DailyRow[], goal: GoalLine | null): string {
  const v = (x: number | string | undefined) => (x == null ? "" : String(x));
  const lines = rows.map((r) => [r.date, v(r.weightKg), v(r.kcal), v(r.proteinG), v(r.carbsG), v(r.fatG), v(r.fibreG), v(r.bedtime), v(r.wake), v(r.asleepMin), v(r.steps)].join(","));
  const head = goal ? [`# goal start=${goal.start} target_kg=${goal.targetKg} rate_pct_per_week=${goal.ratePctPerWeek} training=${goal.training}`] : [];
  return [...head, HEADER.join(","), ...lines].join("\n") + "\n";
}
