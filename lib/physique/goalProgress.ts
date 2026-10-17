/**
 * Goal progress as MacroFactor's waterfall (research A §B10): one bar per
 * week since the goal started, each the week's change in trend weight,
 * light when it moved toward the target and dark when away, then a grey
 * bar for what remains. Pure.
 */

import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import type { PhysiqueGoal, WeighIn } from "@/lib/physique/types";
import { trendSeries } from "@/lib/physique/weight";

export type GoalWeekBar = {
  week: number;
  start: LocalDate;
  end: LocalDate;
  /** Signed change in trend weight over the week, kg. */
  deltaKg: number;
  toward: boolean;
  /** False while the week is still running. */
  complete: boolean;
};

export type GoalProgress = {
  totalKg: number;
  doneKg: number;
  remainingKg: number;
  /** Share of the way there, 0..1, on trend weight. */
  share: number;
  weeks: GoalWeekBar[];
  /** Weeks to go at the goal rate; null when the rate can't get there. */
  weeksLeft: number | null;
};

/** Weekly bars and totals for the goal, as of `today`. Null without a goal or a trend. */
export function goalProgress(goal: PhysiqueGoal | null, weighIns: readonly WeighIn[], today: LocalDate): GoalProgress | null {
  if (!goal || goal.type === "maintain") return null;
  const trend = trendSeries(weighIns.filter((w) => w.date <= today));
  if (trend.length === 0) return null;
  const byDate = new Map(trend.map((t) => [t.date, t.trendKg] as const));
  const trendOn = (date: LocalDate): number | null => {
    if (byDate.has(date)) return byDate.get(date) as number;
    // Before the first point or after the last: clamp to the ends.
    if (date < trend[0].date) return trend[0].trendKg;
    return trend[trend.length - 1].trendKg;
  };
  const dir = Math.sign(goal.targetKg - goal.startTrendKg) || 1;
  const totalKg = Math.abs(goal.targetKg - goal.startTrendKg);
  const current = trend[trend.length - 1].trendKg;
  const doneKg = Math.max(0, Math.min(totalKg, (current - goal.startTrendKg) * dir));
  const remainingKg = Math.max(0, totalKg - doneKg);
  const weeks: GoalWeekBar[] = [];
  const days = Math.max(0, dayDiff(goal.startDate, today));
  const n = Math.floor(days / 7) + (days % 7 === 0 && days > 0 ? 0 : 1);
  for (let i = 0; i < Math.max(1, n); i++) {
    const start = addDays(goal.startDate, i * 7);
    const end = addDays(start, 7);
    const a = trendOn(start);
    const b = trendOn(end > today ? today : end);
    if (a == null || b == null) continue;
    const delta = b - a;
    weeks.push({ week: i + 1, start, end, deltaKg: delta, toward: delta * dir > 0, complete: end <= today });
  }
  const ratePerWeek = Math.abs(goal.ratePctPerWeek) > 0 ? (Math.abs(goal.ratePctPerWeek) / 100) * current : 0;
  const weeksLeft = ratePerWeek > 0 ? remainingKg / ratePerWeek : null;
  return { totalKg, doneKg, remainingKg, share: totalKg > 0 ? doneKg / totalKg : 0, weeks, weeksLeft };
}
