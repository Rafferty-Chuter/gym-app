/**
 * The Monday review (06-execution A7, G3): one week of nutrition, training
 * and sleep as three reads, and one decision. The decision is built from
 * the weekly check-in plan (02 §9), the judge's recommendation and the
 * deload read, so accepting it updates the food targets and the training
 * week together. The io layer gathers the inputs and writes the answers.
 *
 * Pure. Copy rule: state what is, never cheer. Every read has a data gate
 * and reads "Early read" below it.
 */

import type { LocalDate } from "@/lib/dates";
import type { CheckInModule, CheckInPlan } from "@/lib/physique/checkIn";
import { fmtKcal } from "@/lib/physique/copy";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { ADHERENCE_TOLERANCE_KCAL } from "@/lib/physique/intake";
import { PRO2_MIN_G_PER_KG } from "@/lib/physique/judge";
import type { WeekReport } from "@/lib/physique/weekReport";
import type { DayEventType, PhysiqueAnalysis, ProgramTargets, Recommendation, SignalState } from "@/lib/physique/types";
import { deloadLine, type DeloadRead } from "@/lib/training/deload";

// ── Constants ──

/** Fewer logged food days than this and the nutrition read stays "Early read". OURS: four days is the least that averages out one odd day. */
export const REVIEW_MIN_FOOD_DAYS = 4;
/** Fewer nights than this and the sleep read stays "Early read". OURS: same reasoning as food. */
export const REVIEW_MIN_NIGHTS = 4;
/** A week's mean this far under 8 hours (SLEEP_REFERENCE_H) reads "watch". OURS: half an hour a night is the smallest shortfall worth a sentence. */
export const REVIEW_SLEEP_SHORTFALL_H = 0.5;
/** This many short nights in one week reads "watch" whatever the mean. OURS: three is a pattern, two can be a weekend. */
export const REVIEW_SHORT_NIGHTS = 3;
/** An e1RM change smaller than this reads "flat": it sits within session-to-session noise. EVID (research B: e1RM test-retest about 2 %). */
export const REVIEW_LIFT_MOVE_PCT = 2;
/** Sessions a week assumed when onboarding gave no answer. OURS: the smallest split the program generator offers. */
export const REVIEW_DEFAULT_SESSIONS = 3;

// ── Types ──

export type ReviewRead = { state: SignalState; title: string; detail: string };

export type ReviewChange =
  /** The check-in's capped program update (02 §5.3). */
  | { kind: "targets"; from: ProgramTargets | null; to: ProgramTargets }
  /** The judge's rate change or uncapped refresh; applied through `applyRecommendation`. */
  | { kind: "recommendation"; recommendation: Extract<Recommendation, { kind: "change_rate" | "refresh_targets" }> }
  /** A deload is due (T6): accepting starts it today. */
  | { kind: "deload"; reason: "scheduled" | "triggered" };

export type ReviewDecision =
  /** Something changes. One tap accepts all of it; "Keep current" records the review and changes nothing. */
  | { kind: "accept"; title: string; lines: string[]; changes: ReviewChange[] }
  /** Nothing to change this week; the review is recorded as is. */
  | { kind: "keep"; title: string; lines: string[] }
  /** Targets hold: a safety verdict or a logging break. Recorded, nothing applied. */
  | { kind: "hold"; title: string; lines: string[] };

export type ReviewQuestions = {
  partialDays: Array<{ date: LocalDate; kcal: number }>;
  unloggedDays: LocalDate[];
  weighIn: { lastWeighInDate: LocalDate | null } | null;
  waterEvents: Array<{ date: LocalDate; type: DayEventType }>;
  waist: { lastCm: number | null; lastDate: LocalDate | null } | null;
};

export type Review = {
  week: { start: LocalDate; end: LocalDate; complete: boolean; daysCovered: number };
  /** The judge's verdict as of today, with the recommendation row's copy when there is one. */
  verdict: { title: string; detail: string; state: SignalState; recommendationLabel: string | null };
  reads: { nutrition: ReviewRead; training: ReviewRead; sleep: ReviewRead };
  questions: ReviewQuestions;
  decision: ReviewDecision;
};

export type ReviewInputs = {
  plan: CheckInPlan;
  report: WeekReport;
  analysis: PhysiqueAnalysis;
  deload: DeloadRead;
  /** Sessions a week planned at onboarding; the training read compares against it. */
  plannedSessions?: number;
};

// ── Helpers ──

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function module<K extends CheckInModule["kind"]>(plan: CheckInPlan, kind: K): Extract<CheckInModule, { kind: K }> | null {
  return (plan.modules.find((m) => m.kind === kind) as Extract<CheckInModule, { kind: K }> | undefined) ?? null;
}

function sameTargets(a: ProgramTargets | null, b: ProgramTargets): boolean {
  return a != null && a.kcal === b.kcal && a.proteinG === b.proteinG && a.fatG === b.fatG && a.carbsG === b.carbsG;
}

// ── Reads ──

/** Intake against target over the logged days, with protein per kg. */
export function nutritionRead(r: WeekReport): ReviewRead {
  const f = r.food;
  if (f.daysLogged < REVIEW_MIN_FOOD_DAYS || f.meanKcal == null) {
    return {
      state: "unknown",
      title: "Early read",
      detail: f.daysLogged === 0 ? "No food logged this week." : `${f.daysLogged} of ${r.daysCovered} days logged. Four or more give a usable average.`,
    };
  }
  const logged = `${f.daysLogged} of ${r.daysCovered} days logged`;
  const lowProtein = f.proteinGPerKg != null && f.proteinGPerKg < PRO2_MIN_G_PER_KG;
  const protein = f.proteinGPerKg != null ? `protein ${f.proteinGPerKg.toFixed(1)} g/kg${lowProtein ? ", low" : ""}` : f.meanProteinG != null ? `protein ${f.meanProteinG} g` : null;
  if (f.targetKcal == null || f.deltaKcal == null) {
    return { state: lowProtein ? "watch" : "good", title: `${fmtKcal(f.meanKcal)} kcal a day`, detail: [logged, "no target set", protein].filter(Boolean).join(" · ") };
  }
  const over = f.deltaKcal > ADHERENCE_TOLERANCE_KCAL;
  const under = f.deltaKcal < -ADHERENCE_TOLERANCE_KCAL;
  const title = over ? `${fmtKcal(f.deltaKcal)} kcal over target` : under ? `${fmtKcal(-f.deltaKcal)} kcal under target` : "On target";
  return {
    state: over || under || lowProtein ? "watch" : "good",
    title,
    detail: [`${fmtKcal(f.meanKcal)} of ${fmtKcal(f.targetKcal)} kcal a day`, logged, protein].filter(Boolean).join(" · "),
  };
}

/** Sessions against the plan, hard sets, lifts up or down beyond noise, muscles outside their band, and the deload state. */
export function trainingRead(r: WeekReport, deload: DeloadRead, plannedSessions = REVIEW_DEFAULT_SESSIONS): ReviewRead {
  const t = r.training;
  const sets = `${plural(t.hardSets, "hard set")}`;
  if (deload.state === "active") {
    return { state: "good", title: "Deload week", detail: `${plural(t.sessions, "session")} · ${sets}. Trends skip this week.` };
  }
  if (t.sessions === 0) {
    return { state: "unknown", title: "No sessions logged", detail: r.complete ? "Nothing to read for this week." : "Nothing logged yet this week." };
  }
  const read = t.lifts.filter((l) => l.changePct != null);
  const up = read.filter((l) => (l.changePct ?? 0) >= REVIEW_LIFT_MOVE_PCT).length;
  const down = read.filter((l) => (l.changePct ?? 0) <= -REVIEW_LIFT_MOVE_PCT).length;
  const flat = read.length - up - down;
  const under = t.byMuscle.filter((m) => m.read === "under").length;
  const over = t.byMuscle.filter((m) => m.read === "over").length;
  const parts: string[] = [];
  if (read.length > 0) {
    const bits = [up > 0 ? `${up} up` : null, down > 0 ? `${down} down` : null, flat > 0 ? `${flat} flat` : null].filter(Boolean);
    parts.push(`${plural(read.length, "lift")}: ${bits.join(", ")}`);
  }
  if (under > 0) parts.push(`${plural(under, "muscle")} under band`);
  if (over > 0) parts.push(`${plural(over, "muscle")} over band`);
  const title = `${t.sessions} of ${plannedSessions} sessions · ${sets}`;
  if (deload.state === "due") {
    return { state: "watch", title, detail: [deloadLine(deload), ...parts].filter(Boolean).join(" · ") };
  }
  return {
    state: t.sessions < plannedSessions || down > up ? "watch" : "good",
    title,
    detail: parts.length > 0 ? parts.join(" · ") : "No main lifts to compare with the previous weeks yet.",
  };
}

/** Mean against 8 hours and short nights. */
export function sleepRead(r: WeekReport): ReviewRead {
  const s = r.sleep;
  if (s.nights < REVIEW_MIN_NIGHTS || s.meanH == null) {
    return {
      state: "unknown",
      title: "Early read",
      detail: s.nights === 0 ? "No nights logged this week." : `${s.nights} of ${r.daysCovered} nights logged. Four or more give a usable average.`,
    };
  }
  const shortMean = s.meanH < s.goalH - REVIEW_SLEEP_SHORTFALL_H;
  const manyShort = s.shortNights >= REVIEW_SHORT_NIGHTS;
  const detail = [
    `${plural(s.nights, "night")}`,
    s.shortNights > 0 ? `${s.shortNights} short` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return { state: shortMean || manyShort ? "watch" : "good", title: `${formatHoursMin(s.meanH * 60)} a night`, detail };
}

// ── Decision ──

function targetsLine(from: ProgramTargets | null, to: ProgramTargets): string {
  const macros = `protein ${to.proteinG} g · fat ${to.fatG} g · carbs ${to.carbsG} g`;
  if (!from) return `Targets ${fmtKcal(to.kcal)} kcal · ${macros}`;
  if (from.kcal === to.kcal) return `Targets stay at ${fmtKcal(to.kcal)} kcal · ${macros}`;
  return `Targets ${fmtKcal(from.kcal)} → ${fmtKcal(to.kcal)} kcal · ${macros}`;
}

/** The one decision (02 §9 steps 4 and 5), in priority: safety, logging break, then whatever changes. */
export function decide(inputs: ReviewInputs): ReviewDecision {
  const { plan, analysis, deload } = inputs;
  const v = analysis.verdict;
  if (v.id.startsWith("SAFE-")) {
    return { kind: "hold", title: v.title, lines: ["Targets stay where they are. Nothing changes this week."] };
  }
  const brk = module(plan, "logging_break");
  if (brk) {
    const line = brk.foodDaysNeeded > 0 ? `The estimate picks up again after ${plural(brk.foodDaysNeeded, "more day")} of food.` : "The estimate picks up again after a weigh-in.";
    return { kind: "hold", title: "Targets on hold", lines: [line] };
  }

  // Z3: the review only moves food targets to the new maintenance estimate. No goal changes and no deloads are offered.
  const changes: ReviewChange[] = [];
  const lines: string[] = [];
  const rec = analysis.recommendation;
  const update = module(plan, "program_update");
  if (rec && rec.kind === "refresh_targets") {
    changes.push({ kind: "recommendation", recommendation: rec });
    lines.push(`Targets ${fmtKcal(rec.fromKcal)} → ${fmtKcal(rec.toKcal)} kcal`);
  } else if (update) {
    lines.push(targetsLine(update.from, update.to));
    if (!sameTargets(update.from, update.to)) changes.push({ kind: "targets", from: update.from, to: update.to });
  }
  void deload;
  if (changes.length === 0) {
    return { kind: "keep", title: "Targets stay the same", lines: lines.length > 0 ? lines : [] };
  }
  return { kind: "accept", title: "New targets", lines: lines.filter(Boolean), changes };
}

// ── Review ──

export function buildReview(inputs: ReviewInputs): Review {
  const { plan, report, analysis, deload } = inputs;
  const partial = module(plan, "partial_days");
  const unlogged = module(plan, "unlogged_days");
  const weighIn = module(plan, "weigh_in");
  const water = module(plan, "water_event");
  const waist = module(plan, "waist");
  return {
    week: { start: report.start, end: report.end, complete: report.complete, daysCovered: report.daysCovered },
    verdict: { title: analysis.verdict.title, detail: analysis.verdict.detail, state: analysis.status.state, recommendationLabel: analysis.recommendationLabel },
    reads: {
      nutrition: nutritionRead(report),
      training: trainingRead(report, deload, inputs.plannedSessions),
      sleep: sleepRead(report),
    },
    questions: {
      partialDays: partial ? partial.days : [],
      unloggedDays: unlogged ? unlogged.dates : [],
      weighIn: weighIn ? { lastWeighInDate: weighIn.lastWeighInDate } : null,
      waterEvents: water ? water.events : [],
      waist: waist ? { lastCm: waist.lastCm, lastDate: waist.lastDate } : null,
    },
    decision: decide(inputs),
  };
}

/** True when the review has anything to ask before the decision. */
export function hasQuestions(q: ReviewQuestions): boolean {
  return q.partialDays.length > 0 || q.unloggedDays.length > 0 || q.weighIn != null || q.waist != null;
}
