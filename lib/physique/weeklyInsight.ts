/**
 * The weekly report's analysis (W3): where the user is heading and what
 * to fix, from the engines that already decided everything. The goal ETA
 * and phase plan give the heading; the week report, the judge, the deload
 * read and the recovery read give the fixes. This module only ranks and
 * words them: no new maths, no new thresholds beyond the ranking gates.
 *
 * Pure. Copy rule: state what is, one action per fix, never cheer.
 */

import { dayDiff, type LocalDate } from "@/lib/dates";
import { fmtKcal, fmtSignedRate, joinNames } from "@/lib/physique/copy";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { vsPlanWord, type GoalEta } from "@/lib/physique/goalEta";
import { ADHERENCE_TOLERANCE_KCAL } from "@/lib/physique/intake";
import { PRO2_MIN_G_PER_KG } from "@/lib/physique/judge";
import { planLine, type PhasePlan } from "@/lib/physique/phasePlan";
import type { RecoveryRead } from "@/lib/physique/recovery";
import { REVIEW_LIFT_MOVE_PCT, REVIEW_MIN_FOOD_DAYS, REVIEW_MIN_NIGHTS, REVIEW_SHORT_NIGHTS, REVIEW_SLEEP_SHORTFALL_H } from "@/lib/physique/review";
import type { WeekReport } from "@/lib/physique/weekReport";
import type { PhysiqueAnalysis, PhysiqueGoal, SignalState } from "@/lib/physique/types";
import { bandLabel } from "@/lib/training/volumeTargets";
import type { DeloadRead } from "@/lib/training/deload";

// ── Constants ──

/** Fixes shown at once. OURS: three is what a week can act on; the rest waits. */
export const MAX_FIXES = 3;
/** Days of a food gap before it becomes a fix. OURS: one missed day is noise the engine absorbs. */
export const FIX_FOOD_GAP_DAYS = 2;
/** Missing weigh-ins before they become a fix. OURS: the trend steadies with five or more a week. */
export const FIX_WEIGH_GAP_DAYS = 3;
/** Missing nights before they become a fix. OURS: the sleep read needs four of seven. */
export const FIX_SLEEP_GAP_NIGHTS = 3;
/** Intake this far from target reads as a bigger miss. OURS: about a fifth of a typical deficit or surplus a day. */
export const FIX_INTAKE_FAR_KCAL = 400;
/** Muscles under their band before a fix. OURS: one muscle short is a choice, two is the plan slipping. */
export const FIX_MUSCLES_UNDER = 2;
/** Off the plan's date by more than this, either way, reads "watch" on the heading. OURS: two weeks is past ETA noise. */
export const HEADING_OFF_PLAN_DAYS = 14;
/** A trend rate this close to zero reads "flat", not "moving away". OURS: inside week-to-week trend noise. */
export const HEADING_FLAT_RATE = 0.1;

// ── Types ──

export type Heading = { state: SignalState; title: string; lines: string[] };

export type FixId = "safety" | "gaps" | "intake" | "lifts" | "protein" | "sleep" | "recovery" | "sessions" | "muscles" | "deload";

export type Fix = {
  id: FixId;
  state: "watch" | "attention";
  title: string;
  /** What the numbers say, one sentence. */
  why: string;
  /** The one thing to do. */
  action: string;
  href: string | null;
};

export type WeeklyInsight = {
  /** Null for weeks older than last week: the heading is as of today. */
  heading: Heading | null;
  fixes: Fix[];
  /** Fixes beyond MAX_FIXES, not shown. */
  more: number;
  /** Short phrases for what went to plan; empty when nothing did. */
  goingWell: string[];
};

export type InsightFormat = { kg: (kg: number) => string; date: (d: LocalDate) => string };

export type InsightInputs = {
  report: WeekReport;
  analysis: PhysiqueAnalysis;
  goal: PhysiqueGoal | null;
  eta: GoalEta | null;
  plan: PhasePlan | null;
  deload: DeloadRead;
  recovery: RecoveryRead | null;
  /** Sessions a week from onboarding; the sessions fix stays silent without it. */
  plannedSessions?: number;
  /** Fixes another card on the page already carries (the week's decision starting a deload). */
  exclude?: readonly FixId[];
  today: LocalDate;
  fmt: InsightFormat;
};

// ── Helpers ──

const round10 = (n: number) => Math.round(n / 10) * 10;
const pct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)} %`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function liftsRead(r: WeekReport) {
  const read = r.training.lifts.filter((l) => l.changePct != null);
  const down = read.filter((l) => (l.changePct ?? 0) <= -REVIEW_LIFT_MOVE_PCT);
  const up = read.filter((l) => (l.changePct ?? 0) >= REVIEW_LIFT_MOVE_PCT);
  return { read, down, up };
}

function sleepShort(r: WeekReport): boolean {
  const s = r.sleep;
  return s.nights >= REVIEW_MIN_NIGHTS && s.meanH != null && (s.meanH < s.goalH - REVIEW_SLEEP_SHORTFALL_H || s.shortNights >= REVIEW_SHORT_NIGHTS);
}

// ── Heading ──

/**
 * The lifts line, from the judge's own read (lifts against their pre-phase
 * medians, deloads and short nights excluded), so the report never says
 * something the verdict does not. Null while that read is unclear.
 */
export function strengthLine(analysis: PhysiqueAnalysis): string | null {
  const s = analysis.strength;
  const moved = s.lifts
    .filter((l) => l.changePct != null)
    .sort((a, b) => Math.abs(b.changePct ?? 0) - Math.abs(a.changePct ?? 0))
    .slice(0, 2)
    .map((l) => `${l.name.toLowerCase()} ${pct(l.changePct ?? 0)}`);
  switch (s.status) {
    case "holding":
      return "Lifts holding since the phase started.";
    case "rising":
      return `Lifts up since the phase started: ${joinNames(moved)}.`;
    case "dropping":
      return `Lifts down since the phase started: ${joinNames(moved)}.`;
    case "one-lift":
      return `One lift down since the phase started: ${moved[0] ?? "see Body"}.`;
    default:
      return null;
  }
}

/** Where the goal is heading as of today: the ETA against the plan, what is left, the phases after, and the lifts. */
export function heading(i: InsightInputs): Heading {
  const { goal, eta, plan, analysis, fmt } = i;
  const lines: string[] = [];
  const liftsLine = strengthLine(analysis);

  if (analysis.verdict.id.startsWith("SAFE-")) {
    return { state: "attention", title: "Goal on hold", lines: ["Targets stay where they are. The note on Body says why."] };
  }
  if (!goal) {
    return { state: "unknown", title: "No goal yet", lines: ["Set a target weight and this shows where you're heading and when you get there."] };
  }
  if (goal.type === "maintain") {
    const trend = analysis.weight.trendKg;
    if (trend != null) lines.push(`Trend ${fmt.kg(trend)} against a ${fmt.kg(goal.targetKg)} target.`);
    if (liftsLine) lines.push(liftsLine);
    const onTrack = analysis.verdict.id === "ON-TRACK";
    return { state: onTrack ? "good" : trend == null ? "unknown" : "watch", title: onTrack ? "Holding steady" : "Maintaining", lines };
  }
  if (!eta) {
    return { state: "unknown", title: "Early read", lines: ["Weigh in most mornings. The first estimate needs a week or two of weigh-ins."] };
  }
  const target = fmt.kg(goal.targetKg);
  const rate = `${fmtSignedRate(eta.ratePctPerWeek)} %/wk`;
  const goalRate = `${fmtSignedRate(goal.ratePctPerWeek)} %/wk`;
  if (eta.reached) {
    return { state: "good", title: "Target reached", lines: [`Trend at ${target}. Choose what comes next from Body.`] };
  }
  if (eta.reason === "away") {
    const flat = Math.abs(eta.ratePctPerWeek) < HEADING_FLAT_RATE;
    lines.push(`The trend is moving ${rate} against a ${goalRate} goal.`, `${fmt.kg(eta.remainingKg)} still to go.`);
    if (liftsLine) lines.push(liftsLine);
    return flat ? { state: "watch", title: "Weight is flat", lines } : { state: "attention", title: "Moving away from the target", lines };
  }
  if (eta.basis === "planned") {
    lines.push(`${plural(eta.weighInsNeeded, "more weigh-in")} for a first rate.`);
    if (eta.date) lines.push(`At the plan's ${goalRate}: ${target} around ${fmt.date(eta.date)}.`);
    if (liftsLine) lines.push(liftsLine);
    return { state: "unknown", title: "Early read", lines };
  }
  if (eta.reason === "slow" || !eta.date) {
    lines.push(`At ${rate} the target is over a year away. The plan is ${goalRate}.`, `${fmt.kg(eta.remainingKg)} still to go.`);
    if (liftsLine) lines.push(liftsLine);
    return { state: "watch", title: "Too slow to reach the target this year", lines };
  }
  const vs = vsPlanWord(eta.daysVsPlan);
  lines.push(`At ${rate}${vs ? `, ${vs}` : ""}. ${fmt.kg(eta.remainingKg)} to go.`);
  if (plan) lines.push(`${planLine(plan, fmt.date)}.`);
  if (liftsLine) lines.push(liftsLine);
  const offPlan = eta.daysVsPlan != null && Math.abs(eta.daysVsPlan) > HEADING_OFF_PLAN_DAYS;
  return { state: offPlan ? "watch" : "good", title: `${target} around ${fmt.date(eta.date)}`, lines };
}

// ── Fixes ──

/** Every fix that applies, in priority order: safety, gaps, intake, lifts, protein, sleep, recovery, sessions, muscles, deload. */
export function allFixes(i: InsightInputs): Fix[] {
  const { report: r, analysis, goal, deload, recovery } = i;
  const v = analysis.verdict;
  if (v.id.startsWith("SAFE-")) {
    return [{ id: "safety", state: "attention", title: v.title, why: v.detail, action: "Read the full note on Body.", href: "/body" }];
  }
  const out: Fix[] = [];

  // Gaps: everything else reads from them.
  const foodGap = r.food.unlogged.length >= FIX_FOOD_GAP_DAYS ? r.food.unlogged : [];
  const weighGap = r.weight.missing.length >= FIX_WEIGH_GAP_DAYS ? r.weight.missing : [];
  const sleepGap = r.sleep.missing.length >= FIX_SLEEP_GAP_NIGHTS ? r.sleep.missing : [];
  if (foodGap.length + weighGap.length + sleepGap.length > 0) {
    const parts = [
      foodGap.length ? `${plural(foodGap.length, "day")} with no food` : null,
      weighGap.length ? `${plural(weighGap.length, "day")} without a weigh-in` : null,
      sleepGap.length ? `${plural(sleepGap.length, "night")} without sleep` : null,
    ].filter((x): x is string => x != null);
    const first = foodGap[0] ? `/food?date=${foodGap[0]}` : weighGap[0] ? `/body?date=${weighGap[0]}` : `/sleep?date=${sleepGap[0]}`;
    out.push({
      id: "gaps",
      state: foodGap.length + weighGap.length >= 4 ? "attention" : "watch",
      title: "Fill the gaps",
      why: `${joinNames(parts)} this week. The estimates lean on most days being logged.`,
      action: "Log what you can remember; skip the rest.",
      href: first,
    });
  }

  // Intake against target, on logged days.
  const f = r.food;
  if (f.daysLogged >= REVIEW_MIN_FOOD_DAYS && f.deltaKcal != null && f.targetKcal != null && Math.abs(f.deltaKcal) > ADHERENCE_TOLERANCE_KCAL) {
    const under = f.deltaKcal < 0;
    out.push({
      id: "intake",
      state: Math.abs(f.deltaKcal) > FIX_INTAKE_FAR_KCAL ? "attention" : "watch",
      title: "Eat closer to target",
      why: `Averaged ${fmtKcal(Math.abs(f.deltaKcal))} kcal ${under ? "under" : "over"} the ${fmtKcal(f.targetKcal)} kcal target on logged days.`,
      action: `About ${fmtKcal(round10(Math.abs(f.deltaKcal)))} kcal ${under ? "more" : "less"} a day.`,
      href: "/food",
    });
  }

  // Lifts down: only on the judge's own read (STR-1), never on one week's noise.
  const short = sleepShort(r);
  if (analysis.strength.status === "dropping") {
    const down = analysis.strength.lifts.filter((l) => l.changePct != null && l.changePct < 0).sort((a, b) => (a.changePct ?? 0) - (b.changePct ?? 0));
    const names = joinNames(down.slice(0, 3).map((l) => `${l.name.toLowerCase()} ${pct(l.changePct ?? 0)}`));
    const action =
      deload.state === "due"
        ? "Take the deload week, then see where they land."
        : short
          ? "Sleep first: short nights cost reps at the same load."
          : goal?.type === "lose"
            ? "Hold loads and keep the top sets. Some drop is common on a cut."
            : "Hold loads. If they stay down another week, take a deload.";
    out.push({ id: "lifts", state: "watch", title: "Lifts are down", why: `${names.charAt(0).toUpperCase()}${names.slice(1)} since the phase started.`, action, href: deload.state === "due" ? "/train" : null });
  }

  // Protein.
  if (f.proteinGPerKg != null && f.proteinGPerKg < PRO2_MIN_G_PER_KG) {
    const target = f.targetProteinG ?? (r.weight.endTrendKg ? Math.round(PRO2_MIN_G_PER_KG * r.weight.endTrendKg) : null);
    out.push({
      id: "protein",
      state: "watch",
      title: "Get more protein",
      why: `${f.proteinGPerKg.toFixed(1)} g per kg a day. At least ${PRO2_MIN_G_PER_KG} supports training${goal?.type === "lose" ? " on a cut" : ""}.`,
      action: target ? `Aim for ${target} g a day.` : `Add a protein source to two meals.`,
      href: "/food",
    });
  }

  // Sleep, with recovery as supporting evidence.
  const recLow = recovery && (recovery.status === "amber" || recovery.status === "red") && (recovery.flags.includes("hrv") || recovery.flags.includes("rhr"));
  if (short && r.sleep.meanH != null) {
    out.push({
      id: "sleep",
      state: r.sleep.meanH < r.sleep.goalH - 1 ? "attention" : "watch",
      title: "Sleep more",
      why: `${formatHoursMin(r.sleep.meanH * 60)} a night against the ${formatHoursMin(r.sleep.goalH * 60)} goal${r.sleep.shortNights ? `, ${plural(r.sleep.shortNights, "short night")}` : ""}${recLow ? ". Recovery is below your usual too" : ""}.`,
      action: "Lights out 30 to 45 minutes earlier this week.",
      href: "/sleep",
    });
  } else if (recovery?.status === "red") {
    out.push({ id: "recovery", state: "watch", title: "Recovery well below usual", why: `${recovery.detail}.`, action: "Keep sessions, skip anything extra, and sleep longer for a few nights.", href: "/sleep" });
  }

  // Sessions against the plan, on a finished week.
  if (r.complete && i.plannedSessions && r.training.sessions < i.plannedSessions && deload.state !== "active") {
    out.push({ id: "sessions", state: "watch", title: "Fit in every session", why: `${r.training.sessions} of ${i.plannedSessions} sessions this week.`, action: `Book ${i.plannedSessions} sessions into next week now.`, href: "/train" });
  }

  // Muscles under their weekly band, on a finished week.
  const under = r.training.byMuscle.filter((m) => m.read === "under" && m.band);
  if (r.complete && under.length >= FIX_MUSCLES_UNDER && deload.state !== "active") {
    out.push({
      id: "muscles",
      state: "watch",
      title: "Some muscles are short on sets",
      why: `${joinNames(under.slice(0, 3).map((m) => `${m.label.toLowerCase()} ${m.sets} of ${bandLabel(m.band!)}`))}.`.replace(/^./, (c) => c.toUpperCase()),
      action: "Add 2 to 4 hard sets for each next week.",
      href: "/train",
    });
  }

  // A due deload, when the lifts fix has not already said it.
  if (deload.state === "due" && !out.some((x) => x.id === "lifts")) {
    const why = deload.reason === "triggered" ? `${deload.liftsDown} of ${deload.liftsCompared} lifts could not match last week.` : `${plural(deload.weeksAccumulated, "week")} of training since the last one.`;
    out.push({ id: "deload", state: "watch", title: "Deload due", why, action: "Start it from Train: half the sets, loads 10 % lighter.", href: "/train" });
  }
  return out;
}

/** What went to plan, as short phrases. */
export function goingWell(i: InsightInputs): string[] {
  const r = i.report;
  const out: string[] = [];
  if (r.daysCovered >= 5 && r.weight.weighIns >= r.daysCovered - 1) out.push(`weighed in ${r.weight.weighIns} of ${r.daysCovered} days`);
  if (r.food.daysLogged >= REVIEW_MIN_FOOD_DAYS && r.food.deltaKcal != null && Math.abs(r.food.deltaKcal) <= ADHERENCE_TOLERANCE_KCAL) out.push("intake on target");
  if (r.food.proteinGPerKg != null && r.food.proteinGPerKg >= PRO2_MIN_G_PER_KG) out.push(`protein ${r.food.proteinGPerKg.toFixed(1)} g/kg`);
  const { down, up } = liftsRead(r);
  if (up.length > 0 && down.length === 0) out.push(up.length === 1 ? `${up[0].name.toLowerCase()} up` : "lifts up");
  if (r.sleep.nights >= REVIEW_MIN_NIGHTS && !sleepShort(r)) out.push("sleep on goal");
  if (r.complete && i.plannedSessions && r.training.sessions >= i.plannedSessions) out.push("every session done");
  return out;
}

/** The report's analysis. The heading shows for this week and last week only, since it is as of today. */
export function buildWeeklyInsight(i: InsightInputs): WeeklyInsight {
  const fixes = allFixes(i).filter((f) => !(i.exclude ?? []).includes(f.id));
  const recent = dayDiff(i.report.end, i.today) <= 7;
  const safety = fixes[0]?.id === "safety";
  return { heading: recent ? heading(i) : null, fixes: fixes.slice(0, MAX_FIXES), more: Math.max(0, fixes.length - MAX_FIXES), goingWell: safety ? [] : goingWell(i) };
}
