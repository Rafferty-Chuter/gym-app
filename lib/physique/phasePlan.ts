/**
 * The phase planner (G1): the goal as a timeline of phases with the
 * moving ETA per phase. A cut runs to its ETA, then a maintenance phase
 * long enough to measure the new maintenance before anything else (DB-2);
 * a lean bulk runs to its ETA, then a short settle. Diet breaks are not
 * scheduled here: the judge offers one on evidence (DB-1), as an
 * adherence tool only (02 §8). Milestones are stated in kilograms and
 * dates from the same rate the ETA uses. Pure.
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import type { GoalEta } from "@/lib/physique/goalEta";
import type { GoalProgress } from "@/lib/physique/goalProgress";
import type { PhysiqueGoal } from "@/lib/physique/types";

export type PhaseKind = "cut" | "lean_bulk" | "maintain" | "next";

export type PlannedPhase = {
  kind: PhaseKind;
  label: string;
  start: LocalDate;
  /** Null when the phase has no date yet (no ETA at this rate, or an open maintenance). */
  end: LocalDate | null;
  /** Whether today falls inside it. */
  current: boolean;
  /** One line under the label: the rate, the ETA basis, or why there is no date. */
  note: string;
};

export type Milestone = { label: string; kg: number; date: LocalDate | null; reached: boolean };

export type PhasePlan = { phases: PlannedPhase[]; milestones: Milestone[] };

/** Maintenance after a cut before anything else: long enough to measure the new maintenance. EVID (research F DB-2: 2 to 4 weeks; the middle). */
export const MAINTENANCE_AFTER_CUT_WEEKS = 3;
/** A short settle after a bulk before a cut starts, so the first cut week is not a glycogen drop. OURS. */
export const MAINTENANCE_AFTER_BULK_WEEKS = 2;

const weeksToDate = (from: LocalDate, weeks: number): LocalDate => addDays(from, Math.max(0, Math.round(weeks * 7)));

/** The plan as of today, or null without a goal. */
export function phasePlan(goal: PhysiqueGoal | null, progress: GoalProgress | null, eta: GoalEta | null, today: LocalDate): PhasePlan | null {
  if (!goal) return null;
  const phases: PlannedPhase[] = [];
  const milestones: Milestone[] = [];

  if (goal.type === "maintain") {
    phases.push({ kind: "maintain", label: "Maintain", start: goal.startDate, end: null, current: true, note: `Holding ${goal.targetKg.toFixed(1)} kg on trend. Set the next goal when you are ready.` });
    phases.push({ kind: "next", label: "Next goal", start: today, end: null, current: false, note: "Choose it from Body when this phase has done its job." });
    return { phases, milestones };
  }

  const kind: PhaseKind = goal.type === "lose" ? "cut" : "lean_bulk";
  const label = kind === "cut" ? "Cut" : "Lean bulk";
  const end = eta?.reached ? today : (eta?.date ?? null);
  const rate = eta ? `${eta.ratePctPerWeek > 0 ? "+" : ""}${eta.ratePctPerWeek.toFixed(2)} %/wk` : null;
  let note: string;
  if (eta?.reached) note = "Target reached on trend weight.";
  else if (!eta) note = "Log weigh-ins and the ETA follows your trend.";
  else if (eta.reason === "away") note = `No end date at ${rate}: the trend is moving away.`;
  else if (eta.reason === "slow") note = `At ${rate} the target is over a year away.`;
  else if (eta.basis === "planned") note = `ETA on the plan at ${rate}; it follows your actual rate after two weeks of weigh-ins.`;
  else note = `ETA at your current ${rate}.`;
  phases.push({ kind, label, start: goal.startDate, end, current: !eta?.reached, note });

  const settleWeeks = kind === "cut" ? MAINTENANCE_AFTER_CUT_WEEKS : MAINTENANCE_AFTER_BULK_WEEKS;
  const settleStart = end ?? null;
  phases.push({
    kind: "maintain",
    label: "Maintain",
    start: settleStart ?? today,
    end: settleStart ? weeksToDate(settleStart, settleWeeks) : null,
    current: Boolean(eta?.reached),
    note:
      kind === "cut"
        ? `${settleWeeks} weeks at the new maintenance so it can be measured before a bulk.`
        : `${settleWeeks} weeks to settle before a cut, so the first week is not a glycogen drop.`,
  });
  const nextStart = settleStart ? weeksToDate(settleStart, settleWeeks) : null;
  phases.push({ kind: "next", label: "Next goal", start: nextStart ?? today, end: null, current: false, note: kind === "cut" ? "A lean bulk from the measured maintenance, or a longer hold." : "A cut from the settled weight, or a longer hold." });

  // Milestones: halfway and the target, dated from today at the ETA's rate.
  if (progress && eta) {
    const dir = goal.targetKg >= goal.startTrendKg ? 1 : -1;
    const currentKg = goal.startTrendKg + dir * progress.doneKg;
    const weeklyKg = Math.abs(eta.ratePctPerWeek) / 100 * currentKg;
    const toward = eta.ratePctPerWeek * dir > 0;
    const dateFor = (kgFromStart: number): LocalDate | null => {
      const left = kgFromStart - progress.doneKg;
      if (left <= 0) return null;
      if (!toward || weeklyKg <= 0) return null;
      const weeks = left / weeklyKg;
      return weeks <= 52 ? weeksToDate(today, weeks) : null;
    };
    const half = progress.totalKg / 2;
    milestones.push({ label: "Halfway", kg: goal.startTrendKg + dir * half, date: progress.doneKg >= half ? null : dateFor(half), reached: progress.doneKg >= half });
    milestones.push({ label: "Target", kg: goal.targetKg, date: eta.reached ? null : (eta.date ?? null), reached: Boolean(eta.reached) });
  }
  return { phases, milestones };
}

/** Where today sits across the dated phases, 0 to 1, for the strip. Null when the first phase has no end. */
export function planPosition(plan: PhasePlan, today: LocalDate): number | null {
  const first = plan.phases[0];
  const dated = plan.phases.filter((p) => p.end);
  const last = dated[dated.length - 1];
  if (!first || !last?.end) return null;
  const total = dayDiff(first.start, last.end);
  if (total <= 0) return null;
  return Math.max(0, Math.min(1, dayDiff(first.start, today) / total));
}

/** "Cut to 25 Dec · maintain 3 weeks · next from 15 Jan", or the reason there is no date. */
export function planLine(plan: PhasePlan, fmt: (d: LocalDate) => string): string {
  const [first, settle, next] = plan.phases;
  if (!first) return "";
  if (first.kind === "maintain") return "Maintaining · next goal when you choose it";
  if (!first.end) return `${first.label} · no end date yet`;
  const parts = [`${first.label} to ${fmt(first.end)}`];
  if (settle?.end) parts.push(`maintain ${settle.kind === "maintain" ? `${Math.round(dayDiff(settle.start, settle.end) / 7)} weeks` : ""}`.trim());
  if (next?.start && settle?.end) parts.push(`next from ${fmt(next.start)}`);
  return parts.join(" · ");
}
