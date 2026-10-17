/**
 * Moving ETA for the goal: when the target is reached at the rate the
 * trend is actually moving, with a likely range from the rate's margin,
 * against the date the plan promised. Pure. Reuses the rate engine, so
 * the ETA goes quiet exactly when the rate does (02 §2: no rate read
 * before MIN_DAYS_FOR_RATE days and MIN_WEIGHINS_FOR_RATE weigh-ins).
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import type { DayFlags, PhysiqueGoal, WeighIn } from "@/lib/physique/types";
import { displayRate, latestTrend, segmentStart, weighInsNeededForRate } from "@/lib/physique/weight";

/** Beyond this the date is noise; the UI says "over a year away". OURS. */
export const ETA_MAX_WEEKS = 52;

/** Within ±this many days of the plan the ETA reads "on plan". OURS. */
export const ON_PLAN_DAYS = 3;

export type GoalEta = {
  /** Observed: from the trend's own rate. Planned: the goal rate, while the rate has no read yet. */
  basis: "observed" | "planned";
  /** Expected arrival; null when the current rate cannot get there. */
  date: LocalDate | null;
  /** Likely window from the rate's one-sided 95 % margin; `latest` is null when the slow edge never arrives. */
  earliest: LocalDate | null;
  latest: LocalDate | null;
  weeksLeft: number | null;
  /** Signed %BW/wk the ETA used (observed or planned). */
  ratePctPerWeek: number;
  /** The date the plan promised when the goal was set: start plus total ÷ (rate × start weight). */
  planDate: LocalDate | null;
  /** Positive when later than the plan. Null without both dates. */
  daysVsPlan: number | null;
  remainingKg: number;
  reached: boolean;
  /** Set when there is no observed date: too few weigh-ins for a rate, or the trend is moving away. */
  reason: "early" | "away" | "slow" | null;
  /** Weigh-ins still needed for a first rate read (basis planned only). */
  weighInsNeeded: number;
};

function weeksToDate(today: LocalDate, weeks: number): LocalDate {
  return addDays(today, Math.max(0, Math.round(weeks * 7)));
}

/**
 * ETA as of `today`. Null without a non-maintenance goal or a trend. The
 * weekly kg at a %BW rate is taken on the current trend weight, as the
 * targets engine does.
 */
export function goalEta(goal: PhysiqueGoal | null, weighIns: readonly WeighIn[], dayFlags: Readonly<Record<string, DayFlags>>, today: LocalDate): GoalEta | null {
  if (!goal || goal.type === "maintain") return null;
  const latest = latestTrend(weighIns.filter((w) => w.date <= today));
  if (!latest) return null;
  const current = latest.trendKg;
  const dir = Math.sign(goal.targetKg - goal.startTrendKg) || 1;
  const remainingKg = Math.max(0, (goal.targetKg - current) * dir);
  const plannedPct = Math.abs(goal.ratePctPerWeek);
  const planWeeks = plannedPct > 0 ? Math.abs(goal.targetKg - goal.startTrendKg) / ((plannedPct / 100) * goal.startTrendKg) : null;
  const planDate = planWeeks != null && Number.isFinite(planWeeks) ? weeksToDate(goal.startDate, planWeeks) : null;

  const base = { planDate, remainingKg, weighInsNeeded: 0 };
  if (remainingKg <= 0) {
    return { ...base, basis: "observed", date: today, earliest: today, latest: today, weeksLeft: 0, ratePctPerWeek: 0, daysVsPlan: planDate ? dayDiff(planDate, today) : null, reached: true, reason: null };
  }

  const seg = segmentStart({ goal, dayFlags, today });
  const pick = displayRate(weighIns, today, seg, dayFlags);
  const weeksAt = (towardPct: number): number | null => (towardPct > 0 ? remainingKg / ((towardPct / 100) * current) : null);

  if (!pick) {
    const weeks = weeksAt(plannedPct);
    const date = weeks != null ? weeksToDate(today, weeks) : null;
    return {
      ...base,
      basis: "planned",
      date,
      earliest: null,
      latest: null,
      weeksLeft: weeks,
      ratePctPerWeek: goal.ratePctPerWeek,
      daysVsPlan: date && planDate ? dayDiff(planDate, date) : null,
      reached: false,
      reason: "early",
      weighInsNeeded: weighInsNeededForRate(weighIns, today),
    };
  }

  const r = pick.result;
  const toward = r.ratePctPerWeek * dir;
  const weeks = weeksAt(toward);
  if (weeks == null) {
    return { ...base, basis: "observed", date: null, earliest: null, latest: null, weeksLeft: null, ratePctPerWeek: r.ratePctPerWeek, daysVsPlan: null, reached: false, reason: "away" };
  }
  if (weeks > ETA_MAX_WEEKS) {
    return { ...base, basis: "observed", date: null, earliest: null, latest: null, weeksLeft: weeks, ratePctPerWeek: r.ratePctPerWeek, daysVsPlan: null, reached: false, reason: "slow" };
  }
  const fast = weeksAt(toward + r.margin);
  const slow = weeksAt(toward - r.margin);
  const date = weeksToDate(today, weeks);
  return {
    ...base,
    basis: "observed",
    date,
    earliest: fast != null ? weeksToDate(today, fast) : date,
    latest: slow != null && slow <= ETA_MAX_WEEKS ? weeksToDate(today, slow) : null,
    weeksLeft: weeks,
    ratePctPerWeek: r.ratePctPerWeek,
    daysVsPlan: planDate ? dayDiff(planDate, date) : null,
    reached: false,
    reason: null,
  };
}

/** "on plan", "6 days behind plan", "2 weeks ahead of plan". */
export function vsPlanWord(daysVsPlan: number | null): string | null {
  if (daysVsPlan == null) return null;
  if (Math.abs(daysVsPlan) <= ON_PLAN_DAYS) return "on plan";
  const n = Math.abs(daysVsPlan);
  const unit = n >= 14 ? `${Math.round(n / 7)} weeks` : `${n} day${n === 1 ? "" : "s"}`;
  return `${unit} ${daysVsPlan > 0 ? "behind" : "ahead of"} plan`;
}
