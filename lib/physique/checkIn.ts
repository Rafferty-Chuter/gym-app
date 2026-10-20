/**
 * Weekly check-in (02 §9): the ordered plan of modules the stepper or the
 * assistant walks through, and the pure application of the answers into
 * `DayFlags` and `WaistEntry` writes plus the accepted program.
 * Module order copies MacroFactor (research A §B8).
 *
 * Pure. The io layer writes what `applyCheckInAnswers` returns; ids and the
 * ISO timestamp are passed in, never generated here.
 */

import { addDays, dateRange, type LocalDate, type Now } from "@/lib/dates";
import { dailyIntakeSeries } from "@/lib/physique/intake";
import { recommendationLabel } from "@/lib/physique/copy";
import { checkInWeekStart, WEIGH_IN_PROMPT_DAYS } from "@/lib/physique/judge";
import { checkInProgram, type ProgramInputs, type ProgramUpdate } from "@/lib/physique/program";
import { weighInDates } from "@/lib/physique/weight";
import type {
  CheckInRecord,
  DayEventType,
  DayFlags,
  PhysiqueAnalysis,
  PhysiqueGoal,
  PhysiqueProgram,
  ProgramTargets,
  Recommendation,
  Verdict,
  WaistEntry,
} from "@/lib/physique/types";

// ── Constants ──

/** Days of the week the unlogged-days module asks about (the check-in week). PUB (MacroFactor). */
export const UNLOGGED_LOOKBACK_DAYS = 7;
/** Water events this recent offer "skip this week's update?". PUB (MacroFactor KB#26). */
export const WATER_EVENT_LOOKBACK_DAYS = 14;
/** A waist entry this recent skips the waist prompt. OURS (weekly protocol). */
export const WAIST_PROMPT_DAYS = 7;
/** Days of intake history the plan builds, enough for partial-day suggestions. OURS. */
export const CHECK_IN_INTAKE_LOOKBACK_DAYS = 28;

// ── Types ──

export type CheckInModule =
  | { kind: "partial_days"; days: Array<{ date: LocalDate; kcal: number }> }
  | { kind: "weigh_in"; lastWeighInDate: LocalDate | null }
  | { kind: "unlogged_days"; dates: LocalDate[] }
  | { kind: "logging_break"; foodDaysNeeded: number; weighInNeeded: boolean }
  | { kind: "water_event"; events: Array<{ date: LocalDate; type: DayEventType }> }
  | { kind: "waist"; lastCm: number | null; lastDate: LocalDate | null }
  | { kind: "program_update"; from: ProgramTargets | null; to: ProgramTargets; update: ProgramUpdate }
  | { kind: "verdict"; verdict: Verdict; recommendation: Recommendation | null; label: string | null };

export type CheckInPlan = {
  today: LocalDate;
  /** The check-in weekday on or before today. */
  weekStart: LocalDate;
  modules: CheckInModule[];
  /** A fast check-in is possible: there is a program update to accept. */
  fastAvailable: boolean;
};

export type CheckInInputs = ProgramInputs & {
  analysis: PhysiqueAnalysis;
  goal: PhysiqueGoal | null;
  program: PhysiqueProgram | null;
  waist: readonly WaistEntry[];
};

export type CheckInAnswers = {
  /** Suspected partial days: confirm (`partial`) or dismiss (`full`). */
  partialDays?: Readonly<Record<LocalDate, "partial" | "full">>;
  /** Unlogged days: fasted (0 kcal) or skipped. */
  unloggedDays?: Readonly<Record<LocalDate, "fasting" | "skip">>;
  /** Water event: keep the current targets this week. */
  skipUpdate?: boolean;
  waistCm?: number | null;
  acceptProgram: boolean;
  /** One tap: accept the program update, skip the questions. */
  fast?: boolean;
};

export type CheckInResult = {
  /** Full `DayFlags` records to write (merged over the existing ones). */
  dayFlags: DayFlags[];
  waist: WaistEntry | null;
  /** The accepted program, or null to keep the current one. */
  program: PhysiqueProgram | null;
  checkIn: CheckInRecord;
};

// ── Plan ──

/** The check-in modules in MacroFactor's order (02 §9). */
export function buildCheckInPlan(inputs: CheckInInputs, now: Now): CheckInPlan {
  const { today } = now;
  const { analysis, goal, program, profile, dayFlags } = inputs;
  const weekStart = checkInWeekStart(today, profile.checkInWeekday);
  const modules: CheckInModule[] = [];

  const intake = dailyIntakeSeries(inputs.foodEntries, dayFlags, addDays(today, -(CHECK_IN_INTAKE_LOOKBACK_DAYS - 1)), today);

  // 1. Partial days: no longer asked (C11); the intake series leaves suspected ones out.

  // 2. Weigh-in prompt: nothing in the last 3 days plus today.
  const recentWeighIns = weighInDates(inputs.weighIns, addDays(today, -WEIGH_IN_PROMPT_DAYS), today);
  if (recentWeighIns.length === 0) {
    const all = weighInDates(inputs.weighIns, "0000-01-01", today);
    modules.push({ kind: "weigh_in", lastWeighInDate: all.length ? all[all.length - 1] : null });
  }

  // 3. Unlogged days in the check-in week (not today).
  const unlogged = intake.filter((d) => d.date >= addDays(today, -UNLOGGED_LOOKBACK_DAYS) && d.date < today && d.status === "unlogged").map((d) => d.date);
  if (unlogged.length > 0) modules.push({ kind: "unlogged_days", dates: unlogged });

  // 4. Logging break.
  if (analysis.expenditure.state === "holding") {
    const rec = analysis.verdict.id === "DATA-HOLD" ? analysis.recommendation : null;
    const needed = rec && rec.kind === "log_more" && rec.what === "food" ? rec.needed : 0;
    modules.push({ kind: "logging_break", foodDaysNeeded: needed, weighInNeeded: !(rec && rec.kind === "log_more" && rec.what === "food") });
  }

  // 5. Water event.
  const events: Array<{ date: LocalDate; type: DayEventType }> = [];
  for (const date of dateRange(addDays(today, -(WATER_EVENT_LOOKBACK_DAYS - 1)), today)) {
    for (const e of dayFlags[date]?.events ?? []) events.push({ date, type: e.type });
  }
  if (events.length > 0) modules.push({ kind: "water_event", events });

  // 6. Waist, weekly.
  const waistSorted = [...inputs.waist].filter((w) => w.date <= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  const lastWaist = waistSorted.length ? waistSorted[waistSorted.length - 1] : null;
  if (!lastWaist || lastWaist.date < addDays(today, -(WAIST_PROMPT_DAYS - 1))) {
    modules.push({ kind: "waist", lastCm: lastWaist?.cm ?? null, lastDate: lastWaist?.date ?? null });
  }

  // 7. Program update.
  let fastAvailable = false;
  if (goal && program && program.goalId === goal.id) {
    const update = checkInProgram(program, goal, inputs, now);
    if (update) {
      const from = update.from ? { kcal: update.from.kcal, proteinG: update.from.proteinG, fatG: update.from.fatG, carbsG: update.from.carbsG } : null;
      const to = { kcal: update.entry.kcal, proteinG: update.entry.proteinG, fatG: update.entry.fatG, carbsG: update.entry.carbsG };
      modules.push({ kind: "program_update", from, to, update });
      fastAvailable = true;
    }
  }

  // 8. Verdict and recommendation.
  modules.push({
    kind: "verdict",
    verdict: analysis.verdict,
    recommendation: analysis.recommendation,
    label: recommendationLabel(analysis.recommendation),
  });

  return { today, weekStart, modules, fastAvailable };
}

// ── Answers ──

export type ApplyContext = {
  now: Now;
  /** ISO timestamp for `loggedAt` / `completedAt`. */
  nowIso: string;
  /** Stable id generator (the io layer passes `newId`). */
  newId: () => string;
  /** Existing flags, so answers merge rather than overwrite. */
  dayFlags: Readonly<Record<string, DayFlags>>;
};

/**
 * Turn the answers into writes (02 §9 steps 3–5). Declining keeps the
 * current program (`program: null`). A fast check-in accepts the update and
 * skips every question.
 */
export function applyCheckInAnswers(plan: CheckInPlan, answers: CheckInAnswers, ctx: ApplyContext): CheckInResult {
  const { today } = ctx.now;
  const fast = answers.fast === true;
  const flags = new Map<LocalDate, DayFlags>();
  const flagFor = (date: LocalDate): DayFlags => flags.get(date) ?? { ...(ctx.dayFlags[date] ?? { date }), date };

  if (!fast) {
    for (const [date, answer] of Object.entries(answers.partialDays ?? {})) {
      const f = flagFor(date);
      if (answer === "partial") {
        f.status = "partial";
        delete f.partialDismissed;
      } else {
        delete f.status;
        f.partialDismissed = true;
      }
      flags.set(date, f);
    }
    for (const [date, answer] of Object.entries(answers.unloggedDays ?? {})) {
      if (answer !== "fasting") continue;
      const f = flagFor(date);
      f.status = "fasting";
      flags.set(date, f);
    }
  }

  let waist: WaistEntry | null = null;
  if (!fast && typeof answers.waistCm === "number" && Number.isFinite(answers.waistCm) && answers.waistCm > 0) {
    waist = { id: ctx.newId(), date: today, loggedAt: ctx.nowIso, source: "manual", schemaVersion: 1, cm: Math.round(answers.waistCm * 10) / 10 };
  }

  const update = plan.modules.find((m): m is Extract<CheckInModule, { kind: "program_update" }> => m.kind === "program_update");
  const accept = (fast || answers.acceptProgram) && !(answers.skipUpdate === true && !fast);
  const program = accept && update ? update.update.program : null;

  const checkIn: CheckInRecord = {
    id: ctx.newId(),
    date: today,
    weekStart: plan.weekStart,
    accepted: !!program,
    fast,
    completedAt: ctx.nowIso,
    schemaVersion: 1,
  };

  return { dayFlags: [...flags.values()], waist, program, checkIn };
}
