/**
 * MacroFactor import (TR7): a switcher's history read from MacroFactor's
 * own export (More → Data Management → Data Export), so Progress has
 * maintenance and a weight trend on the first day instead of after weeks.
 *
 * The format is MacroFactor's export as read by nicholls73/macrofactor-mcp
 * (`src/parse.ts`, built against real exports) and agrees with
 * petravanta/nutrition-helper's importer; MacroFactor's help pages name the
 * export but not its columns. What is read:
 *
 *   workbook (.xlsx)
 *     "Calories & Macros"  Date, Calories (kcal), Protein (g), Carbs (g), Fat (g)
 *     "Scale Weight"       Date, Weight (kg), Fat Percent
 *     "Steps"              Date, Steps
 *     "Micronutrients"     Date, … (fibre, sodium, sugars, saturated fat and alcohol, each when there is a column for it)
 *   food log (.csv)        Date, Time, Food Name, …, Calories (kcal), Fat (g), Carbs (g), Protein (g)
 *   workout log (.csv)     recognised and declined (training comes in from Hevy, Strong or Rep Count)
 *
 * Columns are found by the start of their name and read in the unit their
 * name gives, so "Weight (lbs)" or "Energy (kJ)" still read right. Each day
 * becomes the rows the daily-log import builds, so ids, "your own log
 * wins" and re-imports behave the same. Pure.
 */

import { isLocalDate, type LocalDate } from "@/lib/dates";
import { parseCsv } from "@/lib/csvImport";
import { LIMITS, MAX_ROWS, type DailyLogParse, type DailyRow } from "@/lib/import/dailyLog";
import { serialToDate, type Cell, type XlsxWorkbook } from "@/lib/import/xlsx";
import type { ExtraKey } from "@/lib/food/extras";

// ── Constants ──

/** Sheet names in MacroFactor's workbook (matched ignoring case). */
export const MF_SHEETS = { macros: "Calories & Macros", weight: "Scale Weight", steps: "Steps", micros: "Micronutrients" } as const;

const KCAL_PER_KJ = 1 / 4.184;
const KG_PER_LB = 0.45359237;

export type MacroFactorTables = { macros?: Cell[][] | null; weight?: Cell[][] | null; steps?: Cell[][] | null; micros?: Cell[][] | null };

/** The kinds of MacroFactor CSV the import box can be handed. */
export type MacroFactorCsv = "food-log" | "workout-log";

// ── Detection ──

/** True when a workbook's sheets are MacroFactor's (its food or its weight sheet is there). */
export function isMacroFactorWorkbook(sheetNames: readonly string[]): boolean {
  const names = new Set(sheetNames.map((n) => n.trim().toLowerCase()));
  return names.has(MF_SHEETS.macros.toLowerCase()) || names.has(MF_SHEETS.weight.toLowerCase());
}

/**
 * Which MacroFactor CSV this is, from its header alone, or null. The food
 * log has Food Name and a Calories column; the workout log has Exercise,
 * Set Type and Reps (and a "Weight (kg)" that must never be read as
 * bodyweight by the daily log).
 */
export function macroFactorCsvKind(text: string): MacroFactorCsv | null {
  const first = text.replace(/^﻿/, "").trim().split(/\r?\n/)[0] ?? "";
  const h = (parseCsv(first)[0] ?? []).map((x) => x.trim().toLowerCase());
  if (!h.includes("date")) return null;
  if (h.includes("food name") && h.some((x) => x.startsWith("calories"))) return "food-log";
  if (h.includes("exercise") && h.includes("set type") && h.includes("reps")) return "workout-log";
  return null;
}

// ── Cells and units ──

function numberOf(c: Cell | undefined): number | null {
  if (typeof c === "number") return Number.isFinite(c) ? c : null;
  if (typeof c !== "string") return null;
  const t = c.trim().replace(/,/g, "");
  if (!t) return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

/** The unit in a header's closing brackets, "weight (kg)" → "kg"; "" when there is none. */
function unitOf(header: string): string {
  return /\(([^)]*)\)\s*$/.exec(header)?.[1].trim() ?? "";
}

type Factor = (header: string) => number | null;

/** To kg. MacroFactor writes kg, so a bare name is kg; a unit that isn't mass leaves the column out. */
const toKg: Factor = (h) => ({ "": 1, kg: 1, lb: KG_PER_LB, lbs: KG_PER_LB })[unitOf(h)] ?? null;
/** To kcal; a kJ column is converted. */
const toKcal: Factor = (h) => ({ "": 1, kcal: 1, cal: 1, kj: KCAL_PER_KJ })[unitOf(h)] ?? null;
/** Grams only: a macro in another unit is left out rather than guessed. */
const toG: Factor = (h) => ({ "": 1, g: 1 })[unitOf(h)] ?? null;
/** To mg, for sodium: MacroFactor writes mg, so a bare name is mg; a gram column is converted. */
const toMg: Factor = (h) => ({ "": 1, mg: 1, g: 1000 })[unitOf(h)] ?? null;
const plain: Factor = () => 1;

function within(v: number | null, [lo, hi]: readonly [number, number]): number | null {
  return v != null && v >= lo && v <= hi ? v : null;
}

// ── Dates ──

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:$|[T\s])/;
const SLASH_RE = /^(\d{1,2})[/.](\d{1,2})[/.](\d{4})(?:$|\s)/;

type SlashOrder = "dmy" | "mdy" | null;

/**
 * Day-first or month-first for a column of "03/04/2026" dates, decided by
 * any date that can only be one (13 or more in that place). Null when none
 * decides, or both appear.
 */
function slashOrder(cells: readonly Cell[]): SlashOrder {
  let dmy = false;
  let mdy = false;
  for (const c of cells) {
    const m = typeof c === "string" ? SLASH_RE.exec(c.trim()) : null;
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  return dmy === mdy ? null : dmy ? "dmy" : "mdy";
}

const pad = (n: string) => n.padStart(2, "0");

/** A real calendar day from a date cell (a spreadsheet date number, ISO text or slash text), else null. */
function dateOf(c: Cell | undefined, date1904: boolean, order: SlashOrder): LocalDate | null {
  if (typeof c === "number") return serialToDate(c, date1904);
  if (typeof c !== "string") return null;
  const s = c.trim();
  const iso = ISO_RE.exec(s);
  const sl = SLASH_RE.exec(s);
  const d = iso ? `${iso[1]}-${pad(iso[2])}-${pad(iso[3])}` : sl && order === "dmy" ? `${sl[3]}-${pad(sl[2])}-${pad(sl[1])}` : sl && order === "mdy" ? `${sl[3]}-${pad(sl[1])}-${pad(sl[2])}` : null;
  if (!d || !isLocalDate(d)) return null;
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toISOString().slice(0, 10) === d ? d : null;
}

// ── Reading a table ──

type Tally = { badDate: number; ambiguous: number; dropped: number; future: Set<LocalDate> };

/** A table's rows by date, with a reader that finds a column by name and returns its value in canonical units. */
type Visit = (date: LocalDate, read: (name: RegExp, factor: Factor) => number | null) => void;

function eachDay(table: Cell[][] | null | undefined, date1904: boolean, tally: Tally, visit: Visit): void {
  if (!table || table.length < 2) return;
  const header = table[0].map((c) => (c == null ? "" : String(c).trim().toLowerCase()));
  const iDate = header.indexOf("date");
  if (iDate < 0) return;
  const columns = new Map<RegExp, { index: number; factor: number } | null>();
  const columnFor = (name: RegExp, factor: Factor) => {
    if (!columns.has(name)) {
      const index = header.findIndex((h) => name.test(h));
      const f = index < 0 ? null : factor(header[index]);
      columns.set(name, f == null ? null : { index, factor: f });
    }
    return columns.get(name)!;
  };
  const order = slashOrder(table.slice(1).map((r) => r[iDate] ?? null));
  for (const row of table.slice(1)) {
    const raw = row[iDate];
    const date = dateOf(raw, date1904, order);
    if (!date) {
      if (!order && typeof raw === "string" && SLASH_RE.test(raw.trim())) tally.ambiguous++;
      else if (raw != null && raw !== "") tally.badDate++;
      continue;
    }
    visit(date, (name, factor) => {
      const col = columnFor(name, factor);
      const v = col ? numberOf(row[col.index]) : null;
      return v == null ? null : v * col!.factor;
    });
  }
}

const COL = {
  kcal: /^(calories|energy)\b/,
  protein: /^protein\b/,
  carbs: /^carb/,
  fat: /^fat\s*(\(|$)/,
  fibre: /^fib(er|re)\b/,
  sodium: /^sodium\b/,
  sugars: /^(total\s+)?sugars?\s*(\(|$)/,
  satFat: /^saturated(\s+fat)?\b/,
  alcohol: /^alcohol\b/,
  weight: /^weight\b/,
  steps: /^steps\b/,
};

type MacroKey = "kcal" | "proteinG" | "carbsG" | "fatG" | "fibreG";
type FoodKey = MacroKey | ExtraKey;
const MACRO_KEYS: readonly MacroKey[] = ["kcal", "proteinG", "carbsG", "fatG", "fibreG"];

/** IN6: the extras on the micronutrient sheet, each with its column and unit. */
const MICROS: ReadonlyArray<readonly [ExtraKey, RegExp, Factor]> = [
  ["sodiumMg", COL.sodium, toMg],
  ["sugarG", COL.sugars, toG],
  ["satFatG", COL.satFat, toG],
  ["alcoholG", COL.alcohol, toG],
];

function readFood(read: (name: RegExp, factor: Factor) => number | null): Record<MacroKey, number | null> {
  return { kcal: read(COL.kcal, toKcal), proteinG: read(COL.protein, toG), carbsG: read(COL.carbs, toG), fatG: read(COL.fat, toG), fibreG: read(COL.fibre, toG) };
}

const FOOD_LIMITS: ReadonlyArray<readonly [FoodKey, readonly [number, number]]> = [
  ["kcal", LIMITS.kcal],
  ["proteinG", LIMITS.macroG],
  ["carbsG", LIMITS.macroG],
  ["fatG", LIMITS.macroG],
  ["fibreG", LIMITS.fibreG],
  ["sodiumMg", LIMITS.sodiumMg],
  ["sugarG", LIMITS.macroG],
  ["satFatG", LIMITS.macroG],
  ["alcoholG", LIMITS.alcoholG],
];

/**
 * Range checks, as the daily log makes them, then the rows that still say
 * something, oldest first, the latest `MAX_ROWS` at most, with one
 * sentence per kind of problem. A day with no calories is a day nothing
 * was logged, so its macros go with it.
 */
function finish(days: Map<LocalDate, DailyRow>, tally: Tally): DailyLogParse {
  const issues: string[] = [];
  let rows = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const r of rows) {
    for (const [k, range] of FOOD_LIMITS) {
      if (r[k] != null && within(r[k]!, range) == null) {
        delete r[k];
        tally.dropped++;
      }
    }
    if (r.kcal == null || r.kcal <= 0) for (const [k] of FOOD_LIMITS) delete r[k];
  }
  rows = rows.filter((r) => r.kcal != null || r.weightKg != null || r.steps != null);
  if (rows.length > MAX_ROWS) {
    rows = rows.slice(-MAX_ROWS);
    issues.push(`Only the latest ${MAX_ROWS} days were read, from ${rows[0].date}.`);
  }
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (tally.ambiguous) issues.push(`${n(tally.ambiguous, "row has a date", "rows have dates")} that could be day-first or month-first, so ${tally.ambiguous === 1 ? "it was" : "they were"} skipped.`);
  if (tally.badDate) issues.push(`${n(tally.badDate, "row has no date that could be read and was", "rows have no date that could be read and were")} skipped.`);
  if (tally.future.size) issues.push(`${n(tally.future.size, "day is", "days are")} after today and ${tally.future.size === 1 ? "was" : "were"} skipped.`);
  if (tally.dropped) issues.push(`${n(tally.dropped, "value was", "values were")} out of range and left out.`);
  return { rows, goal: null, issues };
}

const newTally = (): Tally => ({ badDate: 0, ambiguous: 0, dropped: 0, future: new Set() });

// ── Workbook ──

/**
 * Days from MacroFactor's sheets. Food is the day's total; today's food
 * and steps are left for the person to log here (the day isn't over).
 * Weight is the day's first reading, as the app keeps one a day.
 */
export function macroFactorDays(t: MacroFactorTables, opts: { today: LocalDate; date1904?: boolean }): DailyLogParse {
  const tally = newTally();
  const date1904 = !!opts.date1904;
  const days = new Map<LocalDate, DailyRow>();
  const day = (date: LocalDate) => days.get(date) ?? days.set(date, { date }).get(date)!;
  const past = (date: LocalDate) => {
    if (date > opts.today) tally.future.add(date);
    return date < opts.today;
  };

  eachDay(t.macros, date1904, tally, (date, read) => {
    if (!past(date)) return;
    const food = readFood(read);
    if (food.kcal == null || food.kcal <= 0) return;
    const r = day(date);
    for (const k of MACRO_KEYS) if (food[k] != null) r[k] = food[k]!;
  });

  // Fibre and the extras (IN6) sit with the micronutrients; they join a day that has food.
  eachDay(t.micros, date1904, newTally(), (date, read) => {
    const r = days.get(date);
    if (r?.kcal == null) return;
    const fibre = read(COL.fibre, toG);
    if (r.fibreG == null && fibre != null) r.fibreG = fibre;
    for (const [k, name, factor] of MICROS) {
      const v = read(name, factor);
      if (r[k] == null && v != null) r[k] = v;
    }
  });

  eachDay(t.weight, date1904, tally, (date, read) => {
    if (date > opts.today) return void tally.future.add(date);
    const kg = read(COL.weight, toKg);
    if (kg == null || days.get(date)?.weightKg != null) return;
    const ok = within(kg, LIMITS.weightKg);
    if (ok == null) tally.dropped++;
    else day(date).weightKg = Math.round(ok * 100) / 100;
  });

  eachDay(t.steps, date1904, tally, (date, read) => {
    if (!past(date)) return;
    const steps = read(COL.steps, plain);
    if (steps == null || steps <= 0) return;
    const ok = within(steps, LIMITS.steps);
    if (ok == null) tally.dropped++;
    else day(date).steps = ok;
  });

  return finish(days, tally);
}

/** Days from MacroFactor's workbook, reading only the sheets used. */
export async function macroFactorWorkbookDays(wb: XlsxWorkbook, today: LocalDate): Promise<DailyLogParse> {
  const [macros, weight, steps, micros] = await Promise.all([wb.sheet(MF_SHEETS.macros), wb.sheet(MF_SHEETS.weight), wb.sheet(MF_SHEETS.steps), wb.sheet(MF_SHEETS.micros)]);
  const p = macroFactorDays({ macros, weight, steps, micros }, { today, date1904: wb.date1904 });
  return p.rows.length ? p : { ...p, issues: [...p.issues, "No logged days found in that MacroFactor export."] };
}

// ── Food log CSV ──

/** Day totals from MacroFactor's food log CSV, every food of a day added up. It has no weight: that is in the workbook. */
export function macroFactorFoodLogDays(text: string, today: LocalDate): DailyLogParse {
  const table: Cell[][] = parseCsv(text.replace(/^﻿/, "")).filter((r) => r.some((c) => c.trim() !== ""));
  const tally = newTally();
  const days = new Map<LocalDate, DailyRow>();
  eachDay(table, false, tally, (date, read) => {
    if (date > today) return void tally.future.add(date);
    if (date === today) return;
    const food = readFood(read);
    if (food.kcal == null) return;
    const r = days.get(date) ?? days.set(date, { date }).get(date)!;
    for (const k of MACRO_KEYS) if (food[k] != null) r[k] = (r[k] ?? 0) + food[k]!;
  });
  const p = finish(days, tally);
  return p.rows.length ? p : { ...p, issues: [...p.issues, "No logged days found in that MacroFactor food log."] };
}
