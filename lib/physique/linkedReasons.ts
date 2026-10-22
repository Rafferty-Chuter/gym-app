/**
 * Linked reasons (W5): the weekly report tying what happened to why, with
 * the numbers on both ends. The founder's ask: "your sleep and recovery
 * were poor this week, which could explain why your lifts are not
 * growing", and "calories ran high, which shows in the weight not coming
 * down; the expected loss was ...".
 *
 * Three links at most, each an outcome and its likely causes:
 * - Weight against the plan, through energy balance: what the week's
 *   intake against maintenance predicts (7,716 kcal a kg, the engine's own
 *   energy density), what the plan asked for, and what the trend did, then
 *   the cause that fits the gap (intake off target, fewer steps, unlogged
 *   days, or water when intake was on target).
 * - Lifts that are not growing, with the drivers that were off: sleep,
 *   HRV or resting heart rate against usual, protein, a deficit faster
 *   than strength tolerates, missed sessions, muscles short on sets. When
 *   none were off it says so, instead of inventing one.
 * - Recovery below usual, with sleep, when the lifts link has not said it.
 *
 * Pure. Every number comes from the week report, the judge and the
 * recovery read; this module only links and words them. Causes are
 * hedged ("likely", "could"): the data shows they moved together, not
 * that one caused the other. Below each gate the link stays silent.
 */

import { fmtKcal, fmtSignedRate, joinNames } from "@/lib/physique/copy";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { ENERGY_DENSITY_KCAL_PER_KG } from "@/lib/physique/expenditure";
import { ADHERENCE_TOLERANCE_KCAL } from "@/lib/physique/intake";
import { ON_TRACK_TOLERANCE, PRO2_MIN_G_PER_KG } from "@/lib/physique/judge";
import type { RecoveryRead } from "@/lib/physique/recovery";
import { REVIEW_MIN_FOOD_DAYS, REVIEW_MIN_NIGHTS, REVIEW_SHORT_NIGHTS, REVIEW_SLEEP_SHORTFALL_H } from "@/lib/physique/review";
import { CUT_GREEN_MAX, rateBands } from "@/lib/physique/targets";
import { CORROBORATE_MIN_FOOD_SHARE, planMargin, RATE_UNCLEAR, rateVsPlan } from "@/lib/physique/weekScorecard";
import type { WeekReport } from "@/lib/physique/weekReport";
import type { PhysiqueAnalysis, PhysiqueGoal } from "@/lib/physique/types";
import { bandLabel } from "@/lib/training/volumeTargets";

// ── Constants (tags as in 02-engine-spec) ──

/** Links shown at once. OURS: weight, lifts and recovery, the three things a physique week turns on. */
export const MAX_LINKS = 3;
/** Share of the rate's window with intake logged before eating is linked to the rate. OURS, shared with the scorecard's reading of the rate. */
export const LINK_MIN_FOOD_SHARE = CORROBORATE_MIN_FOOD_SHARE;
/** How close to the plan counts as on it, in %/wk of body weight, plus the rate's own margin. PUB-anchored: the judge's ON_TRACK_TOLERANCE, as the scorecard tile uses. */
export const LINK_ON_PLAN_PCT = ON_TRACK_TOLERANCE;
/** Fewer steps a day than last week before steps count as a cause. OURS: about 70 to 100 kcal a day for most people. */
export const LINK_STEPS_DROP = 2000;
/** Net energy of one step per kg of body weight, kcal. EVID: walking's net cost is about 0.5 kcal/kg/km (ACSM) at about 1,300 steps a km. */
export const NET_KCAL_PER_KG_PER_STEP = 0.0004;
/** Unlogged or partial days in the rate's window before logging counts as a cause. OURS: three days hide enough to move a month's mean by about 100 kcal a day. */
export const LINK_LOGGING_DAYS = 3;
/** The week's intake against target this far from the window's before the card says the week too. OURS: the adherence tolerance, so a gap the tiles would show is never hidden. */
export const WEEK_DIFFERS_KCAL = ADHERENCE_TOLERANCE_KCAL;
/** Intake this close to target reads "on" it rather than "close to" it. OURS: inside a day's logging rounding. */
export const ON_TARGET_KCAL = 50;
/** Intake under maintenance that reads as too little to build on, with no gain goal. OURS: about a 0.25 kg a week loss. */
export const LINK_LOW_INTAKE_KCAL = 300;

// ── Types ──

export type LinkId = "weight" | "lifts" | "recovery";

/** One of plan, expected and actual: the words shown and the signed kg a week behind them, for the bars. */
export type LinkFigure = { label: string; value: string; kgPerWeek: number };

export type Link = {
  id: LinkId;
  state: "good" | "watch" | "attention";
  /** The outcome: "Weight came down slower than planned". */
  title: string;
  /** The outcome's own numbers, under the title: "Bench press −7.6% and squat −0.8% since the phase began." */
  detail: string | null;
  /** The likely causes, most likely first, each one sentence with its numbers. */
  causes: string[];
  /** Planned, expected and actual, where the engine can put numbers on them. */
  figures: LinkFigure[];
  /** What the figures cover: "Per week, over the last 4 weeks". */
  figuresCaption: string | null;
  /** What it means, hedged, in one sentence; null when the causes say it. */
  note: string | null;
};

export type LinkInputs = {
  report: WeekReport;
  /** Last week, for changes such as steps; null when it holds nothing. */
  prev: WeekReport | null;
  analysis: PhysiqueAnalysis;
  goal: PhysiqueGoal | null;
  recovery: RecoveryRead | null;
  /** Sessions a week from onboarding. */
  plannedSessions?: number;
  /** A weight change in the user's unit, magnitude only, one decimal: "0.3 kg". */
  kg: (kg: number) => string;
  /** False for weeks before last week: the lifts and recovery reads are as of today, so only the weight link applies. */
  current?: boolean;
};

// ── Helpers ──

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** "42 min" under an hour, "1h 54m" from one. */
const dur = (min: number) => (min < 60 ? `${min} min` : formatHoursMin(min));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** kg a week from a daily energy balance, kcal. */
export function kgPerWeekFromKcal(kcalPerDay: number): number {
  return (kcalPerDay * 7) / ENERGY_DENSITY_KCAL_PER_KG;
}

/** "4 weeks" for a whole number of weeks, else "24 days". */
function windowLabel(days: number): string {
  return days % 7 === 0 ? plural(days / 7, "week") : plural(days, "day");
}

function sleepShortfall(r: WeekReport): { meanH: number; shortH: number } | null {
  const s = r.sleep;
  if (s.nights < REVIEW_MIN_NIGHTS || s.meanH == null) return null;
  const shortH = s.goalH - s.meanH;
  return shortH > REVIEW_SLEEP_SHORTFALL_H || s.shortNights >= REVIEW_SHORT_NIGHTS ? { meanH: s.meanH, shortH } : null;
}

function sleepCause(r: WeekReport): string | null {
  const s = sleepShortfall(r);
  if (!s) return null;
  const under = s.shortH > 0 ? `, ${dur(Math.round(s.shortH * 60))} under ${r.sleep.goalH} hours` : "";
  const nights = r.sleep.shortNights ? `, with ${plural(r.sleep.shortNights, "short night")}` : "";
  return `Sleep averaged ${formatHoursMin(Math.round(s.meanH * 60))} a night${under}${nights}.`;
}

/** HRV and resting heart rate against usual, when the recovery read flags them. */
function recoveryCause(rec: RecoveryRead | null): string | null {
  if (!rec || (rec.status !== "amber" && rec.status !== "red")) return null;
  const parts: string[] = [];
  if (rec.flags.includes("hrv") && rec.hrv) parts.push(`HRV ran ${Math.round(Math.abs(1 - rec.hrv.recent / rec.hrv.baseline) * 100)}% below usual (${rec.hrv.recent} ms against ${rec.hrv.baseline})`);
  if (rec.flags.includes("rhr") && rec.rhr) parts.push(`resting heart rate ran ${rec.rhr.recent - rec.rhr.baseline} bpm above usual (${rec.rhr.recent} against ${rec.rhr.baseline})`);
  return parts.length ? `${cap(joinNames(parts))}.` : null;
}

function stepsCause(r: WeekReport, prev: WeekReport | null, bodyKg: number): { text: string; kcal: number } | null {
  const now = r.health.meanSteps;
  const before = prev?.health.meanSteps ?? null;
  if (now == null || before == null || before - now < LINK_STEPS_DROP) return null;
  const kcal = Math.round(((before - now) * NET_KCAL_PER_KG_PER_STEP * bodyKg) / 10) * 10;
  return { text: `Steps fell to ${fmtKcal(now)} a day from ${fmtKcal(before)} last week, about ${fmtKcal(kcal)} kcal a day less burned.`, kcal };
}

function loggingCause(r: WeekReport): string | null {
  const w = r.rateWindow;
  if (!w || w.unlogged + w.partial < LINK_LOGGING_DAYS) return null;
  const bits = [w.unlogged ? `${plural(w.unlogged, "day")} not logged` : null, w.partial ? `${plural(w.partial, "day")} logged in part` : null].filter((x): x is string => x != null);
  return `${cap(joinNames(bits))} in the last ${windowLabel(w.days)}, so the intake above may read low.`;
}

// ── Weight ──

/**
 * Weight against the plan through energy balance. Needs a goal, the week's
 * trend on both ends, four days of food and a maintenance estimate.
 */
export function weightLink(i: LinkInputs): Link | null {
  const { report: r, goal, kg } = i;
  if (!goal || i.analysis.verdict.id.startsWith("SAFE-")) return null;
  const w = r.rateWindow;
  const rate = r.weight.ratePctPerWeek;
  const bodyKg = r.weight.endTrendKg;
  if (!w || rate == null || bodyKg == null || w.meanKcal == null || w.meanMaintenanceKcal == null || w.foodDays < LINK_MIN_FOOD_SHARE * w.days) return null;

  const intake = w.meanKcal;
  const maint = w.meanMaintenanceKcal;
  const target = w.meanTargetKcal;
  const margin = planMargin(r, goal.type === "maintain" ? 0 : goal.ratePctPerWeek);
  const planned = goal.type === "maintain" ? 0 : (goal.ratePctPerWeek / 100) * bodyKg;
  const actual = (rate / 100) * bodyKg;
  const expected = kgPerWeekFromKcal(intake - maint);
  const tol = ((LINK_ON_PLAN_PCT + margin) / 100) * bodyKg;
  const delta = target != null ? intake - target : null;
  const offTarget = delta != null && Math.abs(delta) > ADHERENCE_TOLERANCE_KCAL ? delta : null;
  // The same call the scorecard's weight tile makes, so the card and the tile never disagree.
  let slower = false;
  let faster = false;
  let drift = false;
  // TR12: inside the plan only thanks to the rate's margin is "not clear yet", as the scorecard and the judge say, never "as planned".
  let unclear = false;
  if (goal.type === "maintain") drift = Math.abs(rate) > LINK_ON_PLAN_PCT + margin;
  else {
    const vs = rateVsPlan(rate, goal.ratePctPerWeek, goal.type === "lose" ? "cut" : "gain", goal.type === "gain" ? rateBands(goal.trainingStatusAtCreation).gain.ceiling : null, margin);
    slower = vs?.text === "Slower than plan";
    faster = vs?.text === "Faster than plan" || vs?.text === "Above lean range";
    unclear = vs?.text === RATE_UNCLEAR;
  }
  const gap = actual - planned;
  const span = windowLabel(w.days);

  const signedKg = (x: number) => `${x < 0 ? "−" : x > 0 ? "+" : ""}${kg(Math.abs(x))}`;
  const figures: LinkFigure[] = [
    { label: "Planned", value: signedKg(planned), kgPerWeek: planned },
    { label: "Calories predict", value: signedKg(expected), kgPerWeek: expected },
    { label: "Scale trend", value: signedKg(actual), kgPerWeek: actual },
  ];
  const figuresCaption = `Per week, over the last ${span}`;
  const balance = intake - maint;
  const balanceWord = balance < 0 ? `a ${fmtKcal(-balance)} kcal deficit` : balance > 0 ? `a ${fmtKcal(balance)} kcal surplus` : "even";
  const targetWords = target == null ? "" : offTarget != null ? `, ${fmtKcal(Math.abs(offTarget))} ${offTarget > 0 ? "over" : "under"} the ${fmtKcal(target)} target` : `, ${Math.abs(delta ?? 0) <= ON_TARGET_KCAL ? "on" : "close to"} the ${fmtKcal(target)} target`;
  const intakeLine = `Over the last ${span} you ate ${fmtKcal(intake)} kcal a day${targetWords}. Against maintenance of about ${fmtKcal(maint)}, that is ${balanceWord}, about ${kg(Math.abs(expected))} of ${expected <= 0 ? "fat loss" : "gain"} a week.`;
  const matches = Math.abs(actual - expected) <= tol;
  // The week's own intake, when it tells a different story from the window: the report's calorie tile shows the week, so the card says it too.
  const wk = r.food;
  const weekLine =
    wk.meanKcal != null && wk.deltaKcal != null && wk.targetKcal != null && wk.daysLogged >= REVIEW_MIN_FOOD_DAYS && delta != null && Math.abs(wk.deltaKcal - delta) >= WEEK_DIFFERS_KCAL
      ? `This week alone averaged ${fmtKcal(wk.meanKcal)} kcal a day, ${Math.abs(wk.deltaKcal) <= ADHERENCE_TOLERANCE_KCAL ? "close to target" : `${fmtKcal(Math.abs(wk.deltaKcal))} ${wk.deltaKcal > 0 ? "over" : "under"} target`}.`
      : null;
  const intakeCauses = weekLine ? [intakeLine, weekLine] : [intakeLine];

  if (unclear) {
    return {
      id: "weight",
      state: "watch",
      title: "Weight against the plan: not clear yet",
      detail: "The gap is inside the trend's margin of error.",
      causes: intakeCauses,
      figures,
      figuresCaption,
      note: null,
    };
  }

  if (!slower && !faster && !drift) {
    return {
      id: "weight",
      state: "good",
      title: goal.type === "maintain" ? "Weight holding, as planned" : "Weight moving as planned",
      detail: null,
      causes: intakeCauses,
      figures,
      figuresCaption,
      note: matches ? "The scale trend matches what your calories predict." : null,
    };
  }

  const causes: string[] = [];
  let note: string | null = null;
  const tooMuch = goal.type === "lose" ? slower : goal.type === "gain" ? faster : gap > 0;
  // Intake on the wrong side of the target is the first suspect, and the numbers say how much of the gap it explains.
  const intakeExplains = offTarget != null && (tooMuch ? offTarget > 0 : offTarget < 0);
  causes.push(...intakeCauses);
  if (intakeExplains) {
    note = matches
      ? `The scale trend matches what your calories predict, so the plan works when the target is hit${goal.type === "gain" && faster ? "; faster gain than planned adds more fat than muscle" : goal.type === "lose" && faster ? "; losing faster than planned costs more muscle and strength" : ""}.`
      : "Intake explains part of the gap; the trend lags the scale by a few days.";
  } else {
    // The target itself can sit off the plan once maintenance has moved since it was set; the Monday review moves it.
    const targetPace = target != null ? kgPerWeekFromKcal(target - maint) : null;
    const targetExplains = offTarget == null && target != null && targetPace != null && Math.abs(targetPace - planned) > tol && Math.sign(targetPace - planned) === Math.sign(gap);
    const steps = tooMuch && goal.type !== "gain" ? stepsCause(r, i.prev, bodyKg) : null;
    const logging = tooMuch && goal.type === "lose" ? loggingCause(r) : null;
    if (targetExplains) {
      causes.push(`The ${fmtKcal(target)} target now sits ${fmtKcal(Math.abs(target - maint))} kcal ${target < maint ? "under" : "over"} maintenance, a ${signedKg(targetPace)} a week pace against the plan's ${signedKg(planned)}.`);
      note = "Eating to the target was right; the target is what needs moving, and the Monday review moves it.";
    } else if (steps || logging) {
      if (steps) causes.push(steps.text);
      if (logging) causes.push(logging);
    } else {
      const lead = offTarget != null ? `You ate ${offTarget > 0 ? "over" : "under"} the target, so intake does not explain this.` : "Intake was on target, so it does not explain this.";
      note =
        goal.type === "lose" && slower
          ? `${lead} Weight can hold for one to two weeks before it drops, and unlogged extras add up. If it holds another week, the maintenance estimate lowers and the target with it.`
          : goal.type === "lose" && faster
            ? `${lead} Early water loss or a maintenance estimate running low is likely. It corrects as weeks come in.`
            : goal.type === "gain" && slower
              ? `${lead} Water swings hide gain week to week. If it holds another week, the maintenance estimate rises and the target with it.`
              : `${lead} Water or a maintenance estimate still settling is likely. It corrects as weeks come in.`;
    }
  }

  const title =
    goal.type === "lose"
      ? slower
        ? actual >= 0
          ? "Weight did not come down"
          : "Weight came down slower than planned"
        : "Weight came down faster than planned"
      : goal.type === "gain"
        ? slower
          ? "Weight went up slower than planned"
          : "Weight went up faster than planned"
        : gap > 0
          ? "Weight drifted up"
          : "Weight drifted down";
  return { id: "weight", state: "watch", title, detail: null, causes, figures, figuresCaption, note };
}

// ── Lifts ──

/**
 * Lifts that are not growing, from the judge's own read since the phase
 * began, linked to whatever was off this week. On a cut, holding is the
 * aim and only a drop links; elsewhere holding counts as not growing.
 */
export function liftsLink(i: LinkInputs): Link | null {
  const { report: r, analysis, goal } = i;
  const s = analysis.strength;
  const cut = goal?.type === "lose";
  const notGrowing = s.status === "dropping" || s.status === "one-lift" || (s.status === "holding" && !cut);
  const rising = s.status === "rising";
  if (!notGrowing && !rising) return null;

  const moved = s.lifts
    .filter((l) => l.changePct != null)
    .sort((a, b) => (rising ? (b.changePct ?? 0) - (a.changePct ?? 0) : (a.changePct ?? 0) - (b.changePct ?? 0)))
    .slice(0, 2)
    .map((l) => `${l.name.toLowerCase()} ${(l.changePct ?? 0) > 0 ? "+" : (l.changePct ?? 0) < 0 ? "−" : ""}${Math.abs(l.changePct ?? 0).toFixed(1)}%`);
  const detail = moved.length ? `${cap(joinNames(moved))} since your goal started.` : null;

  const causes: string[] = [];
  const sleep = sleepCause(r);
  const rec = recoveryCause(i.recovery);
  if (sleep) causes.push(sleep);
  if (rec) causes.push(rec);
  const p = r.food.proteinGPerKg;
  if (p != null && p < PRO2_MIN_G_PER_KG) causes.push(`Protein averaged ${p.toFixed(1)} g per kg a day, under the ${PRO2_MIN_G_PER_KG} that supports strength.`);
  const rate = analysis.weight.ratePctPerWeek;
  if (cut && rate != null && rate < -CUT_GREEN_MAX) causes.push(`Weight is coming off at ${fmtSignedRate(rate)} %/wk, faster than the ${CUT_GREEN_MAX} %/wk that keeps strength.`);
  const f = r.food;
  if (goal?.type === "gain" && f.deltaKcal != null && f.deltaKcal < -ADHERENCE_TOLERANCE_KCAL && f.daysLogged >= REVIEW_MIN_FOOD_DAYS) causes.push(`Intake ran ${fmtKcal(-f.deltaKcal)} kcal a day under target, less surplus to build on.`);
  if (!cut && goal?.type !== "gain" && f.meanKcal != null && r.expenditure.endKcal != null && r.expenditure.endKcal - f.meanKcal > LINK_LOW_INTAKE_KCAL && f.daysLogged >= REVIEW_MIN_FOOD_DAYS) causes.push(`Intake ran ${fmtKcal(r.expenditure.endKcal - f.meanKcal)} kcal a day under maintenance.`);
  if (r.complete && i.plannedSessions && r.training.sessions < i.plannedSessions) causes.push(`${r.training.sessions} of ${i.plannedSessions} planned sessions.`);
  const under = r.training.byMuscle.filter((m) => m.read === "under" && m.band);
  if (r.complete && under.length) causes.push(`Hard sets under target: ${joinNames(under.slice(0, 3).map((m) => `${m.label.toLowerCase()} ${m.sets} of ${bandLabel(m.band!)}`))}.`);

  if (rising) {
    // Say what supported it only when the week was clean on the usual suspects.
    if (causes.length) return null;
    const good: string[] = [];
    if (r.sleep.nights >= REVIEW_MIN_NIGHTS && r.sleep.meanH != null) good.push(`sleep ${formatHoursMin(Math.round(r.sleep.meanH * 60))} a night`);
    if (p != null) good.push(`protein ${p.toFixed(1)} g/kg`);
    if (r.training.sessions) good.push(plural(r.training.sessions, "session"));
    if (good.length < 2) return null;
    return { id: "lifts", state: "good", title: "Lifts rising", detail, causes: [`${cap(joinNames(good))}.`], figures: [], figuresCaption: null, note: null };
  }

  const title = s.status === "dropping" ? "Lifts are down" : s.status === "one-lift" ? "One lift is down" : "Lifts holding, not yet growing";
  if (!causes.length) {
    // Only claim what was checked: a week without sleep or food data cannot clear them.
    const checked = [r.sleep.nights >= REVIEW_MIN_NIGHTS ? "sleep" : null, p != null ? "protein" : null, r.complete && i.plannedSessions ? "sessions" : null].filter((x): x is string => x != null);
    if (checked.length < 2) {
      return { id: "lifts", state: "watch", title, detail, causes: ["Too little sleep or food logged this week to say why."], figures: [], figuresCaption: null, note: null };
    }
    return {
      id: "lifts",
      state: "watch",
      title,
      detail,
      causes: [`${cap(joinNames(checked))} ${checked.length === 1 ? "was" : "were"} on plan this week.`],
      figures: [],
      figuresCaption: null,
      note: "Nothing obvious explains it, so the program is the next thing to look at: a deload, or more sets for the lifts that stalled.",
    };
  }
  const recoveryLed = Boolean(sleep || rec);
  return {
    id: "lifts",
    state: s.status === "dropping" ? "attention" : "watch",
    title,
    detail,
    causes,
    figures: [],
    figuresCaption: null,
    note: recoveryLed ? "Short sleep and poor recovery commonly stall strength; fix those before changing the program." : "These could explain it; fix them before changing the program.",
  };
}

// ── Recovery ──

/** Recovery below usual, linked to sleep and the deficit, when the lifts link has not carried it. */
export function recoveryLink(i: LinkInputs, liftsCovered: boolean): Link | null {
  if (liftsCovered) return null;
  const rec = recoveryCause(i.recovery);
  if (!rec) return null;
  const causes = [rec];
  const sleep = sleepCause(i.report);
  if (sleep) causes.push(sleep);
  const rate = i.analysis.weight.ratePctPerWeek;
  if (i.goal?.type === "lose" && rate != null && rate < -CUT_GREEN_MAX) causes.push(`Weight is coming off at ${fmtSignedRate(rate)} %/wk, faster than the ${CUT_GREEN_MAX} %/wk band.`);
  return {
    id: "recovery",
    state: i.recovery?.status === "red" ? "attention" : "watch",
    title: "Recovery below usual",
    detail: null,
    causes,
    figures: [],
    figuresCaption: null,
    note: sleep ? "Short sleep is the likeliest driver; more sleep usually brings HRV back within a week." : "Illness, alcohol, travel or a hard block of training can do this too. Watch it for a few more days.",
  };
}

/** The week's links, weight first, then lifts, then recovery. */
export function linkedReasons(i: LinkInputs): Link[] {
  const out: Link[] = [];
  const w = weightLink(i);
  if (w) out.push(w);
  if (i.current === false) return out;
  const l = liftsLink(i);
  if (l) out.push(l);
  const liftsCovered = Boolean(l && l.state !== "good" && l.causes.some((c) => /HRV|resting heart rate/.test(c)));
  const r = recoveryLink(i, liftsCovered);
  if (r) out.push(r);
  return out.slice(0, MAX_LINKS);
}
