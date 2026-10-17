/**
 * The program: the calorie and macro targets in effect, and how they change
 * at goal start, at the weekly check-in and on a refresh.
 * Normative spec: docs/plan/02-engine-spec.md §1.1 (program), §5.3–5.4.
 *
 * Pure. Each history entry records its `source`. Nothing here writes
 * storage; the caller accepts an update by storing the returned program.
 */

import { dayDiff, type LocalDate, type Now } from "@/lib/dates";
import { computeExpenditure, type ExpenditureInputs, type ExpenditureResult } from "@/lib/physique/expenditure";
import { targetInEffect } from "@/lib/physique/intake";
import { macros, weeklyTarget, UNSMOOTHED_DAYS_AFTER_START, type WeeklyTarget } from "@/lib/physique/targets";
import { latestTrend } from "@/lib/physique/weight";
import type { PhysiqueGoal, PhysiqueProgram, ProgramEntry, ProgramSource } from "@/lib/physique/types";

export { targetInEffect };

// ── Types ──

export type ProgramInputs = ExpenditureInputs;

export type ProgramUpdate = {
  /** The proposed entry (already appended in `program`). */
  entry: ProgramEntry;
  /** The program with the entry accepted. */
  program: PhysiqueProgram;
  /** The entry in effect before this one. */
  from: ProgramEntry | null;
  target: WeeklyTarget;
  tdee: number;
  trendKg: number;
  expenditure: ExpenditureResult;
};

export type ProgramOptions = {
  /** ISO timestamp recorded on the entry; defaults to midnight UTC of `now.today`. */
  acceptedAt?: string;
  /** Program id for a new program; defaults to `program-<goalId>`. */
  id?: string;
};

// ── Helpers ──

function defaultAcceptedAt(today: LocalDate): string {
  return `${today}T00:00:00.000Z`;
}

/** Trend weight on `today` (the trend ends at the last weigh-in on or before it), else the goal's start trend. */
export function trendWeightOn(inputs: Pick<ProgramInputs, "weighIns">, goal: PhysiqueGoal, today: LocalDate): number {
  const upToToday = inputs.weighIns.filter((w) => w.date <= today);
  return latestTrend(upToToday)?.trendKg ?? goal.startTrendKg;
}

/** Has the goal's rate changed after `date`, or is it a different goal from the program's? */
export function goalChangedSince(goal: PhysiqueGoal, program: PhysiqueProgram, date: LocalDate): boolean {
  if (goal.id !== program.goalId) return true;
  return (goal.rateHistory ?? []).some((c) => c.date > date);
}

function buildUpdate(args: {
  goal: PhysiqueGoal;
  inputs: ProgramInputs;
  now: Now;
  program: PhysiqueProgram | null;
  source: ProgramSource;
  unsmoothed: boolean;
  opts: ProgramOptions;
}): ProgramUpdate | null {
  const { goal, inputs, now, source, opts } = args;
  const expenditure = computeExpenditure(inputs, now);
  if (!expenditure) return null;
  const last = expenditure.series[expenditure.series.length - 1];
  const tdee = last.tdee;
  const trendKg = trendWeightOn(inputs, goal, now.today);
  const from = targetInEffect(args.program, now.today);
  const target = weeklyTarget({
    tdee,
    trendKg,
    goal,
    prevTargetKcal: from ? from.kcal : null,
    unsmoothed: args.unsmoothed || !from,
    sex: inputs.profile.sex,
  });
  const split = macros({
    kcal: target.kcal,
    trendKg,
    heightCm: inputs.profile.heightCm ?? 0,
    sex: inputs.profile.sex,
    phase: goal.type,
    proteinLevel: inputs.profile.proteinLevel,
    dietType: inputs.profile.dietType,
    bodyFatCategory: inputs.profile.bodyFatCategory,
    bodyFatPctMeasured: inputs.profile.bodyFatPctMeasured,
  });
  const entry: ProgramEntry = {
    ...split,
    startDate: now.today,
    source,
    acceptedAt: opts.acceptedAt ?? defaultAcceptedAt(now.today),
    tdeeAtAccept: tdee,
  };
  const program: PhysiqueProgram = args.program
    ? { ...args.program, goalId: goal.id, history: [...args.program.history, entry] }
    : { id: opts.id ?? `program-${goal.id}`, goalId: goal.id, history: [entry], schemaVersion: 1 };
  return { entry, program, from, target, tdee, trendKg, expenditure };
}

// ── Program changes ──

/**
 * The initial program for a goal (02 §5.3): unsmoothed, from today's
 * expenditure and trend weight. Null when expenditure can't be seeded.
 */
export function newProgram(goal: PhysiqueGoal, inputs: ProgramInputs, now: Now, opts: ProgramOptions = {}): ProgramUpdate | null {
  return buildUpdate({ goal, inputs, now, program: null, source: "goal_start", unsmoothed: true, opts });
}

/**
 * The weekly check-in's proposed program (02 §5.3): capped at max(100, 5%
 * of tdee) per week, unless fewer than 28 days have passed since the
 * expenditure start or the goal changed since the last entry. The caller
 * keeps `update.program` on accept, or the old program on decline.
 */
export function checkInProgram(program: PhysiqueProgram, goal: PhysiqueGoal, inputs: ProgramInputs, now: Now, opts: ProgramOptions = {}): ProgramUpdate | null {
  const last = targetInEffect(program, now.today);
  const startDate = inputs.profile.expenditureStartDate ?? inputs.profile.expenditureSeed?.date ?? now.today;
  const unsmoothed = !last || dayDiff(startDate, now.today) < UNSMOOTHED_DAYS_AFTER_START || goalChangedSince(goal, program, last.startDate);
  return buildUpdate({ goal, inputs, now, program, source: "check_in", unsmoothed, opts });
}

/**
 * Start a new entry now with the raw, uncapped target (02 §0.3b): the
 * judge's `refresh_targets`, or `apply_now` after an accepted rate change.
 */
export function refreshProgram(
  program: PhysiqueProgram,
  goal: PhysiqueGoal,
  inputs: ProgramInputs,
  now: Now,
  opts: ProgramOptions & { source?: "refresh" | "apply_now" } = {}
): ProgramUpdate | null {
  return buildUpdate({ goal, inputs, now, program, source: opts.source ?? "refresh", unsmoothed: true, opts });
}
