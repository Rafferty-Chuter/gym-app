/**
 * Energy balance and expenditure-page helpers (05-design §9.4):
 *   - the 30-day energy balance series (intake bars against the expenditure
 *     or target line) and its "avg intake − line = difference" summary;
 *   - the expenditure page's range average and difference;
 *   - the "Expenditure changes" table (3-, 7-, 14-, 30-day deltas).
 * Pure; numbers come from the engine's series, never recomputed here.
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import { targetInEffect } from "@/lib/physique/intake";
import type { DailyIntake, ExpenditurePoint, PhysiqueProgram, ProgramEntry } from "@/lib/physique/types";

export type EnergyLine = "expenditure" | "targets";

export type EnergyBalancePoint = {
  date: LocalDate;
  /** Logged intake; null when the day is unlogged or a user-flagged partial. */
  intakeKcal: number | null;
  status: DailyIntake["status"] | "none";
  /** Expenditure or target on that day; null when there is none. */
  lineKcal: number | null;
  holding: boolean;
};

export type EnergyBalance = {
  points: EnergyBalancePoint[];
  /** Mean intake over the logged days in the window. */
  avgIntakeKcal: number | null;
  /** Mean of the line over the same logged days, so the difference compares like with like. */
  avgLineKcal: number | null;
  /** avgIntake − avgLine; negative is a deficit. */
  differenceKcal: number | null;
  daysLogged: number;
  days: number;
};

/** The Energy balance widget shows 30 days, like MacroFactor's. PUB. */
export const ENERGY_BALANCE_DAYS = 30;

/** Days that count toward the averages: complete and fasting days (02 §1.2). */
export function countsForBalance(status: DailyIntake["status"] | "none"): boolean {
  return status === "complete" || status === "fasting";
}

export function energyBalance(
  intake: readonly DailyIntake[],
  expenditure: readonly ExpenditurePoint[],
  program: PhysiqueProgram | null | undefined,
  line: EnergyLine,
  to: LocalDate,
  days = ENERGY_BALANCE_DAYS
): EnergyBalance {
  const from = addDays(to, -(days - 1));
  const intakeByDate = new Map(intake.map((d) => [d.date, d]));
  const expByDate = new Map(expenditure.map((p) => [p.date, p]));
  const points: EnergyBalancePoint[] = [];
  let sumIntake = 0;
  let sumLine = 0;
  let n = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(from, i);
    const d = intakeByDate.get(date);
    const status = d?.status ?? "none";
    const intakeKcal = d && countsForBalance(status) ? d.kcal : null;
    const exp = expByDate.get(date);
    const lineKcal = line === "expenditure" ? (exp ? exp.tdee : null) : (targetInEffect(program, date)?.kcal ?? null);
    points.push({ date, intakeKcal, status, lineKcal, holding: exp?.state === "holding" });
    if (intakeKcal != null && lineKcal != null) {
      sumIntake += intakeKcal;
      sumLine += lineKcal;
      n += 1;
    }
  }
  const avgIntakeKcal = n > 0 ? Math.round(sumIntake / n) : null;
  const avgLineKcal = n > 0 ? Math.round(sumLine / n) : null;
  return {
    points,
    avgIntakeKcal,
    avgLineKcal,
    differenceKcal: avgIntakeKcal != null && avgLineKcal != null ? avgIntakeKcal - avgLineKcal : null,
    daysLogged: n,
    days,
  };
}

// ── Expenditure page ──

export type ExpenditureRange = { from: LocalDate; to: LocalDate };

export type ExpenditureSummary = {
  /** Mean displayed expenditure over the range. */
  averageKcal: number | null;
  /** Last minus first value in the range: how far the estimate moved. */
  differenceKcal: number | null;
  points: ExpenditurePoint[];
};

export function expenditureSummary(series: readonly ExpenditurePoint[], range: ExpenditureRange): ExpenditureSummary {
  const points = series.filter((p) => p.date >= range.from && p.date <= range.to);
  if (points.length === 0) return { averageKcal: null, differenceKcal: null, points: [] };
  const mean = points.reduce((s, p) => s + p.tdee, 0) / points.length;
  return {
    averageKcal: Math.round(mean),
    differenceKcal: points.length > 1 ? Math.round(points[points.length - 1].tdee - points[0].tdee) : null,
    points,
  };
}

/** The windows in MacroFactor's "Expenditure Changes" table, minus 90 days (we rarely have it). PUB. */
export const CHANGE_WINDOWS_DAYS = [3, 7, 14, 30] as const;

/** Below ±this the word is "Steady" rather than Increase/Decrease. OURS. */
export const STEADY_KCAL = 10;

export type ExpenditureChange = {
  days: number;
  deltaKcal: number | null;
  word: "Increase" | "Decrease" | "Steady" | "Waiting";
  /** Daily values over the window for a sparkline, oldest first. */
  spark: number[];
};

/**
 * Change over each window ending today: today's value minus the value
 * `days` ago. "Waiting" until the series covers the whole window with
 * updating days at both ends, since a holding series cannot have changed.
 */
export function expenditureChanges(series: readonly ExpenditurePoint[], today: LocalDate): ExpenditureChange[] {
  const byDate = new Map(series.map((p) => [p.date, p]));
  const last = byDate.get(today) ?? series[series.length - 1];
  return CHANGE_WINDOWS_DAYS.map((days) => {
    if (!last) return { days, deltaKcal: null, word: "Waiting", spark: [] };
    const startDate = addDays(last.date, -days);
    const first = byDate.get(startDate);
    const spark: number[] = [];
    for (let i = days; i >= 0; i--) {
      const p = byDate.get(addDays(last.date, -i));
      if (p) spark.push(p.tdee);
    }
    if (!first || dayDiff(series[0].date, last.date) < days || first.state === "holding" && last.state === "holding") {
      return { days, deltaKcal: null, word: "Waiting", spark };
    }
    const delta = Math.round(last.tdee - first.tdee);
    return { days, deltaKcal: delta, word: Math.abs(delta) < STEADY_KCAL ? "Steady" : delta > 0 ? "Increase" : "Decrease", spark };
  });
}

/** Signed kcal with a true minus sign: "−35", "+120", "0". */
export function signedKcal(n: number): string {
  const r = Math.round(n);
  if (r === 0) return "0";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString("en-GB")}`;
}

// ── Targets history ──

export type TargetsHistoryRow = {
  entry: ProgramEntry;
  /** Change in kcal from the previous entry; null for the first. */
  deltaKcal: number | null;
  /** One plain sentence on why this entry exists. */
  reason: string;
  current: boolean;
};

const SOURCE_WORD: Record<ProgramEntry["source"], string> = {
  goal_start: "Goal started",
  check_in: "Weekly check-in",
  refresh: "Targets refreshed",
  apply_now: "Applied after a rate change",
};

/**
 * Every program entry, newest first, with the one-sentence reason the
 * energy page shows: what triggered it and how expenditure moved. The
 * numbers are the entry's own; nothing is recomputed.
 */
export function targetsHistory(program: PhysiqueProgram | null | undefined, today: LocalDate): TargetsHistoryRow[] {
  if (!program || program.history.length === 0) return [];
  const sorted = [...program.history].sort((a, b) => (a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : 0));
  const currentStart = sorted.filter((e) => e.startDate <= today).at(-1)?.startDate ?? sorted[0].startDate;
  const rows: TargetsHistoryRow[] = sorted.map((entry, i) => {
    const prev = i > 0 ? sorted[i - 1] : null;
    let reason: string;
    let deltaKcal: number | null = null;
    if (!prev) reason = `${SOURCE_WORD[entry.source]} from a maintenance estimate of ${Math.round(entry.tdeeAtAccept).toLocaleString("en-GB")} kcal.`;
    else {
      deltaKcal = entry.kcal - prev.kcal;
      const tdeeMove = Math.round(entry.tdeeAtAccept - prev.tdeeAtAccept);
      const moved = tdeeMove === 0 ? "held" : `moved ${signedKcal(tdeeMove)}`;
      reason =
        deltaKcal === 0
          ? `${SOURCE_WORD[entry.source]}: maintenance ${moved}, targets unchanged.`
          : `${SOURCE_WORD[entry.source]}: maintenance ${moved}, so the target went ${deltaKcal > 0 ? "up" : "down"} ${Math.abs(deltaKcal).toLocaleString("en-GB")} kcal.`;
    }
    return { entry, deltaKcal, reason, current: entry.startDate === currentStart };
  });
  return rows.reverse();
}
