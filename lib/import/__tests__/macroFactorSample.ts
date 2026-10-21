/**
 * A small anonymised MacroFactor export for tests (TR7): made-up numbers in
 * the sheets and columns MacroFactor's workbook has (see
 * `lib/import/macroFactor.ts` for where the format comes from). Seven weeks
 * of a steady cut eating about 2,200 kcal against a maintenance near
 * 2,650, with the awkward parts real exports have: a day with nothing
 * logged (0 kcal), today's half-logged food, two weigh-ins on one day, a
 * missed weigh-in, and sheets the import ignores.
 */

import * as XLSX from "xlsx";
import { addDays, type LocalDate } from "@/lib/dates";
import type { Cell } from "@/lib/import/xlsx";

export const MF_TODAY = "2026-10-18";
export const MF_DAYS = 49;
export const MF_FIRST = addDays(MF_TODAY, -(MF_DAYS - 1));
/** The day with nothing logged, and the day with a missed weigh-in. */
export const MF_UNLOGGED = addDays(MF_TODAY, -20);
export const MF_NO_WEIGH_IN = addDays(MF_TODAY, -10);
export const MF_TWO_WEIGH_INS = addDays(MF_TODAY, -5);

/** Excel's day number for a date (1900 system), as the workbook stores it. */
export function serialOf(date: LocalDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

/** Repeatable noise in ±1. */
const wobble = (i: number) => Math.sin(i * 12.9898) * 0.5 + Math.sin(i * 4.1414) * 0.5;

export type SampleTables = { macros: Cell[][]; weight: Cell[][]; trend: Cell[][]; expenditure: Cell[][]; steps: Cell[][]; micros: Cell[][] };

export function macroFactorSampleTables(): SampleTables {
  const macros: Cell[][] = [["Date", "Calories (kcal)", "Protein (g)", "Fat (g)", "Carbs (g)"]];
  const weight: Cell[][] = [["Date", "Weight (kg)", "Fat Percent"]];
  const trend: Cell[][] = [["Date", "Trend Weight (kg)"]];
  const expenditure: Cell[][] = [["Date", "Expenditure"]];
  const steps: Cell[][] = [["Date", "Steps"]];
  const micros: Cell[][] = [["Date", "Alcohol (g)", "Fiber (g)", "Sodium (mg)"]];
  for (let i = 0; i < MF_DAYS; i++) {
    const date = addDays(MF_FIRST, i);
    const serial = serialOf(date);
    const kcal = date === MF_TODAY ? 640 : date === MF_UNLOGGED ? 0 : Math.round(2200 + 120 * wobble(i));
    macros.push([serial, kcal, kcal ? Math.round(165 + 8 * wobble(i + 3)) : 0, kcal ? Math.round(70 + 6 * wobble(i + 5)) : 0, kcal ? Math.round(225 + 25 * wobble(i + 7)) : 0]);
    micros.push([serial, 0, kcal ? Math.round(28 + 4 * wobble(i + 2)) : 0, kcal ? 2300 : 0]);
    // About 0.4 kg a week down: (2650 − 2200) × 7 / 7716.
    const kg = Math.round((86 - (i * 450) / 7716 + 0.35 * wobble(i + 11)) * 10) / 10;
    if (date !== MF_NO_WEIGH_IN) weight.push([serial, kg, 0.21]);
    if (date === MF_TWO_WEIGH_INS) weight.push([serial, kg + 0.7, 0.21]);
    trend.push([serial, Math.round((86 - (i * 450) / 7716) * 100) / 100]);
    expenditure.push([serial, 2650]);
    steps.push([serial, date === MF_TODAY ? 3100 : Math.round(9000 + 2500 * wobble(i + 13))]);
  }
  return { macros, weight, trend, expenditure, steps, micros };
}

/** The sample as .xlsx bytes, dates as date numbers with a date format, as spreadsheet apps write them. */
export function macroFactorSampleXlsx(opts: { sharedStrings?: boolean; compress?: boolean } = {}): Uint8Array {
  const t = macroFactorSampleTables();
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: Cell[][]) => {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    for (let r = 1; r < rows.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
      if (cell) cell.z = "yyyy-mm-dd";
    }
    XLSX.utils.book_append_sheet(wb, ws, name);
  };
  add("Calories & Macros", t.macros);
  add("Micronutrients", t.micros);
  add("Expenditure", t.expenditure);
  add("Scale Weight", t.weight);
  add("Weight Trend", t.trend);
  add("Steps", t.steps);
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx", bookSST: !!opts.sharedStrings, compression: !!opts.compress }) as ArrayBuffer;
  return new Uint8Array(out);
}
