/**
 * Verdict copy (05-design §7) and the must-not-claim linter (02 §10).
 * Every number here arrives from the analysis; nothing is computed except
 * formatting. Verdicts cite their own window and n. Calm, specific,
 * hedged; no praise, no exclamation marks.
 *
 * Pure.
 */

import { weekday, type LocalDate } from "@/lib/dates";
import type { GoalType, Recommendation, RuleId, StrengthStatus } from "@/lib/physique/types";

// ── Banned phrases (02 §10) ──

/** Case-insensitive substrings no verdict copy may contain. "REM" is handled separately as a whole word. */
export const BANNED_PHRASES: readonly string[] = [
  "losing muscle",
  "muscle loss",
  "fat loss has stalled",
  "the extra is mostly fat",
  "metabolic damage",
  "starvation mode",
  "deep sleep",
  "testosterone",
  "reverse diet",
  "absorb",
  "cheat",
  "earned",
  "bad food",
  "great job",
  "crushing it",
  "!",
];

/** "REM" matches only as a case-sensitive whole word (02 §10). */
const REM_RE = /\bREM\b/;

/** The banned phrases a piece of copy contains (empty when clean). */
export function bannedPhrasesIn(text: string): string[] {
  const lower = text.toLowerCase();
  const hits = BANNED_PHRASES.filter((p) => lower.includes(p));
  if (REM_RE.test(text)) hits.push("REM");
  return hits;
}

// ── Formatting ──

/** Unsigned rate: cuts to 1 decimal ("0.6"), gains to 2 ("0.24"). */
export function fmtRate(ratePctPerWeek: number): string {
  const r = Math.abs(ratePctPerWeek);
  return ratePctPerWeek > 0 ? r.toFixed(2) : r.toFixed(1);
}

/** Signed rate for goal-relative copy ("−0.6"). */
export function fmtSignedRate(ratePctPerWeek: number): string {
  const s = fmtRate(ratePctPerWeek);
  if (ratePctPerWeek < 0) return `−${s}`;
  if (ratePctPerWeek > 0) return `+${s}`;
  return s;
}

/** "over 28 days (24 weigh-ins)". */
export function fmtWindow(windowDays: number, n: number): string {
  return `over ${windowDays} days (${n} weigh-in${n === 1 ? "" : "s"})`;
}

/** kcal/day delta rounded to 10, signed ("+400", "−150"). */
export function fmtKcalDelta(kcal: number): string {
  const r = Math.round(kcal / 10) * 10;
  if (r === 0) return "0";
  return r > 0 ? `+${r}` : `−${Math.abs(r)}`;
}

export function fmtKcal(kcal: number): string {
  return Math.round(kcal).toLocaleString("en-GB");
}

/** Decimal hours as "6h04m". */
export function fmtHours(h: number): string {
  const total = Math.round(h * 60);
  const hh = Math.floor(total / 60);
  const mm = total % 60;
  return `${hh}h${String(mm).padStart(2, "0")}m`;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export function fmtWeekday(date: LocalDate): string {
  return DAY_NAMES[weekday(date)] ?? date;
}

/** "a", "a and b", "a, b and c". */
export function joinNames(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

const COUNT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven"] as const;

export function countWord(n: number): string {
  return COUNT_WORDS[n] ?? String(n);
}

/** "down 8%" or "down 3 to 4%" from signed change percentages. */
export function fmtDrop(changes: readonly number[]): string {
  const drops = changes.map((c) => Math.round(Math.abs(c)));
  const lo = Math.min(...drops);
  const hi = Math.max(...drops);
  return lo === hi ? `down ${lo}%` : `down ${lo} to ${hi}%`;
}

export function fmtRise(changes: readonly number[]): string {
  const ups = changes.map((c) => Math.round(c));
  const lo = Math.min(...ups);
  const hi = Math.max(...ups);
  return lo === hi ? `up ${lo}%` : `up ${lo} to ${hi}%`;
}

// ── Facts the copy reads ──

export type RateFacts = { ratePctPerWeek: number; windowDays: number; n: number };

export type LiftFact = { name: string; changePct: number };

/**
 * Everything a verdict's copy may cite. The judge fills the fields a rule
 * needs; the copy functions read only their own.
 */
export type VerdictFacts = {
  phase: GoalType | "none";
  /** Signed goal rate. */
  goalRate?: number | null;
  /** The rule's own window. */
  rate?: RateFacts | null;
  /** NO-CHANGE with a rate off plan: whether it is confidently outside goal ± 0.25 (research H). */
  rateClear?: boolean;
  strength?: StrengthStatus;
  /** Main lifts the rule points at (down for LOSS-1/4, up for RECOMP/GAIN-3, the one lift for STR-2). */
  lifts?: readonly LiftFact[];
  /** Whether the goal itself sits outside the rule's in-range value (02 §8.2 A). */
  goalOutOfRange?: boolean;
  nearGoal?: boolean;
  advanced?: boolean;
  adherent?: boolean | null;
  adherenceDeltaKcal?: number | null;
  recommendation?: Recommendation | null;
  sleepMeanH?: number | null;
  sleepNights?: number;
  sleepIntakeDiffKcal?: number | null;
  proteinGPerKg?: number | null;
  proteinTargetG?: number | null;
  proteinWeeksLow?: number;
  fatGPerKg?: number | null;
  fatShare?: number | null;
  waistDeltaCm?: number | null;
  waistWeeks?: number;
  weighInsNeeded?: number;
  updatingDays?: number;
  foodDaysNeeded?: number;
  weighInNeeded?: boolean;
  partialDays?: ReadonlyArray<{ date: LocalDate; kcal: number }>;
  trendKg?: number | null;
  targetKg?: number | null;
  floorKcal?: number | null;
  bmiTarget?: number | null;
  phaseAgeDays?: number | null;
  intakeDropShare?: number | null;
  /** SAFE-4 variant. */
  safeReason?: "bmi" | "rate";
};

export type VerdictCopy = { title: string; detail: string };

// ── Shared clauses ──

function rateClause(f: VerdictFacts, verb?: string): string {
  const r = f.rate;
  if (!r) return "";
  const v = verb ?? (r.ratePctPerWeek < 0 ? "Losing" : r.ratePctPerWeek > 0 ? "Gaining" : "Holding");
  return `${v} ${fmtRate(r.ratePctPerWeek)} %/wk ${fmtWindow(r.windowDays, r.n)}`;
}

function liftsHoldingClause(f: VerdictFacts): string {
  if (f.strength === "holding") return ", lifts holding";
  if (f.strength === "rising") return ", lifts rising";
  return "";
}

function sinceClause(f: VerdictFacts): string {
  return f.phase === "lose" || f.phase === "gain" ? " since your goal started" : "";
}

// ── Per-rule copy ──

type CopyFn = (f: VerdictFacts) => VerdictCopy;

const COPY: Record<RuleId, CopyFn> = {
  // Z3: every verdict states what happened, in numbers. No advice, no plans, no causes from studies.
  "NO-GOAL": () => ({ title: "No goal set", detail: "Add a target weight in Progress to read the trend against it." }),

  "DATA-RATE": (f) => {
    const n = Math.max(1, f.weighInsNeeded ?? 1);
    return { title: "Calibrating", detail: `${n} more weigh-in${n === 1 ? "" : "s"} for a first read on your rate.` };
  },

  "DATA-EXP": (f) => ({ title: "Calibrating", detail: `Maintenance estimate: day ${Math.max(1, (f.updatingDays ?? 0) + 1)} of about 21.` }),

  "DATA-HOLD": (f) => {
    const k = f.foodDaysNeeded ?? 0;
    const food = k > 0 ? `${k} more day${k === 1 ? "" : "s"} of food` : "";
    const weigh = f.weighInNeeded ? "a weigh-in" : "";
    const what = food && weigh ? `${food} and ${weigh}` : food || weigh || "food";
    return { title: "Targets on hold", detail: `Targets update after ${what} this week.` };
  },

  "DATA-PARTIAL": (f) => {
    const days = f.partialDays ?? [];
    const names = joinNames(days.map((d) => fmtWeekday(d.date)));
    const kcals = joinNames(days.map((d) => fmtKcal(d.kcal)));
    const plural = days.length !== 1;
    return {
      title: `Confirm ${countWord(days.length)} day${plural ? "s" : ""}`,
      detail: `${names} look${plural ? "" : "s"} incomplete (${kcals} kcal). Confirm ${plural ? "them" : "it"} first.`,
    };
  },

  "G-EXP-2": (f) => {
    const pct = f.intakeDropShare != null ? `${Math.round(f.intakeDropShare * 100)}%` : "sharply";
    return {
      title: "Logged intake fell",
      detail: `Logged intake fell ${pct} over 14 days with no matching change in the weight trend. Targets hold until it settles.`,
    };
  },

  "ADH-1": (f) => {
    const d = f.adherenceDeltaKcal ?? 0;
    const dir = d < 0 ? "under" : "over";
    return { title: `${Math.round(Math.abs(d) / 10) * 10} kcal ${dir} target`, detail: "On average over the last 14 days." };
  },

  "DB-1": () => ({ title: "Over target 3 or more days a week", detail: "For the last 2 weeks, six weeks into the cut." }),

  "LOSS-1": (f) => {
    const down = f.lifts?.length ? `, and ${joinNames(f.lifts.map((l) => l.name))} ${f.lifts.length > 1 ? "are" : "is"} ${fmtDrop(f.lifts.map((l) => l.changePct))}${sinceClause(f)}` : "";
    const adherent = f.adherent ? ", while eating to target" : "";
    return { title: "Losing faster than planned", detail: `${rateClause(f)} against a ${fmtRate(f.goalRate ?? 0)} goal${adherent}${down}.` };
  },

  "LOSS-3": (f) => ({ title: "Losing very fast", detail: `${rateClause(f)}.` }),

  "LOSS-4": (f) => {
    const down = f.lifts?.length ? `, and ${joinNames(f.lifts.map((l) => l.name))} ${f.lifts.length > 1 ? "are" : "is"} ${fmtDrop(f.lifts.map((l) => l.changePct))}${sinceClause(f)}` : "";
    return { title: f.lifts?.length ? "Losing fast, lifts down" : "Losing fast", detail: `${rateClause(f)}${down}.` };
  },

  "LOSS-2": (f) => ({ title: "Losing faster than planned", detail: `${rateClause(f)} against a ${fmtRate(f.goalRate ?? 0)} goal, lifts holding.` }),

  "LOSS-2u": (f) => ({ title: "Losing faster than planned", detail: `${rateClause(f)} against a ${fmtRate(f.goalRate ?? 0)} goal.` }),

  "LOSS-6": (f) => {
    const adherent = f.adherent ? ", while eating to target" : "";
    const r = f.rate;
    const lead = r ? `${fmtSignedRate(r.ratePctPerWeek)} %/wk ${fmtWindow(r.windowDays, r.n)}` : "The trend is flat";
    return {
      title: "Weight loss has stalled",
      detail: `${lead} against a ${fmtSignedRate(f.goalRate ?? 0)} goal${adherent}.`,
    };
  },

  "GAIN-1": (f) => ({ title: "Gaining faster than planned", detail: `${rateClause(f)} against a ${fmtRate(f.goalRate ?? 0)} goal.` }),

  "GAIN-2": (f) => {
    const adherent = f.adherent ? ", while eating to target" : "";
    return { title: "Not gaining, lifts flat", detail: `${rateClause(f)} against a ${fmtRate(f.goalRate ?? 0)} goal${adherent}.` };
  },

  "GAIN-3": (f) => {
    const up = f.lifts?.length ? `, but lifts are ${fmtRise(f.lifts.map((l) => l.changePct))}` : "";
    return { title: "Gaining slower than planned", detail: `${rateClause(f)}, below your ${fmtRate(f.goalRate ?? 0)} goal${up}.` };
  },

  "GAIN-4": (f) => ({
    title: "Waist is up",
    detail: `Waist is up ${(f.waistDeltaCm ?? 0).toFixed(1)} cm over ${f.waistWeeks ?? 4} weeks while ${rateClause(f, "gaining").replace(/^gaining/, "gaining")}.`,
  }),

  "RECOMP-1": (f) => {
    const up = f.lifts?.length ? `, lifts ${fmtRise(f.lifts.map((l) => l.changePct))}` : "";
    const r = f.rate;
    return { title: "Scale flat, waist down", detail: `Scale flat ${r ? fmtWindow(r.windowDays, r.n) : "over 28 days"}${up}, waist down ${Math.abs(f.waistDeltaCm ?? 0).toFixed(1)} cm.` };
  },

  "RECOMP-WAIST": () => ({ title: "Lifts up, scale flat", detail: "No waist measurement in the last 4 weeks." }),

  "STR-1": (f) => ({
    title: "Lifts are dropping",
    detail: f.lifts?.length ? `${joinNames(f.lifts.map((l) => l.name))} ${f.lifts.length > 1 ? "are" : "is"} ${fmtDrop(f.lifts.map((l) => l.changePct))}${sinceClause(f)}.` : "Two or more main lifts are down 5% or more.",
  }),

  "STR-2": (f) => {
    const l = f.lifts?.[0];
    return {
      title: "One lift is down",
      detail: `${l ? `${l.name} is ${fmtDrop([l.changePct])}${sinceClause(f)}` : "One main lift is down 5% or more"} while the others hold.`,
    };
  },

  "SLEEP-1": (f) => {
    const down = f.lifts?.length ? `, and ${joinNames(f.lifts.map((l) => l.name))} ${f.lifts.length > 1 ? "are" : "is"} ${fmtDrop(f.lifts.map((l) => l.changePct))}` : "";
    return { title: "Sleep is short", detail: `Averaging ${fmtHours(f.sleepMeanH ?? 0)} over ${f.sleepNights ?? 14} nights${down}.` };
  },

  "SLEEP-1i": (f) => ({
    title: "Sleep is short",
    detail: `Averaging ${fmtHours(f.sleepMeanH ?? 0)} over ${f.sleepNights ?? 14} nights.`,
  }),

  "SLEEP-2": (f) => ({
    title: "Short nights, bigger days",
    detail: `On days after short nights you eat about ${Math.round((f.sleepIntakeDiffKcal ?? 0) / 10) * 10} kcal more.`,
  }),

  "SLEEP-3": () => ({
    title: "Two short nights",
    detail: "Two nights in a row under 6 hours.",
  }),

  "PRO-1": (f) => ({
    title: "Protein is low for a cut",
    detail: `${(f.proteinGPerKg ?? 0).toFixed(1)} g/kg in ${f.proteinWeeksLow ?? 2} of the last 3 weeks${f.proteinTargetG ? `; your target is ${f.proteinTargetG} g` : ""}.`,
  }),

  "PRO-2": (f) => ({
    title: "Protein is low",
    detail: `${(f.proteinGPerKg ?? 0).toFixed(1)} g/kg over 14 days${f.proteinTargetG ? `; your target is ${f.proteinTargetG} g` : ""}.`,
  }),

  "FAT-1": (f) => ({
    title: "Fat is low",
    detail: `${(f.fatGPerKg ?? 0).toFixed(1)} g/kg over 14 days, ${Math.round((f.fatShare ?? 0) * 100)}% of calories, under 0.5 g/kg.`,
  }),

  "ON-TRACK": (f) => {
    if (f.phase === "maintain") {
      const t = f.trendKg;
      const g = f.targetKg;
      return { title: "On track", detail: t != null && g != null ? `Holding ${t.toFixed(1)} kg, within ${Math.abs(t - g).toFixed(1)} kg of your target.` : "Holding within the maintenance band." };
    }
    return { title: "On track", detail: `${rateClause(f)}${liftsHoldingClause(f)}.` };
  },

  "NO-CHANGE": (f) => {
    // A rate off plan with no rule to act on (research H): shown as it is, never called on track.
    if (f.rate && f.goalRate != null) {
      return { title: f.rateClear ? "Off the planned rate" : "Not clear yet", detail: `${rateClause(f)} against a ${fmtSignedRate(f.goalRate)} %/wk goal.` };
    }
    return { title: "Steady", detail: "Nothing new this week." };
  },

  "SAFE-0": () => ({ title: "No deficit targets under 18", detail: "Calorie targets for a deficit aren't available under 18. Targets stay at maintenance." }),

  "SAFE-1": (f) => ({
    title: "At the calorie floor",
    detail: `Your target won't go under ${fmtKcal(f.floorKcal ?? 0)} kcal. Consider maintenance, and a registered dietitian if the goal still matters.`,
  }),

  "SAFE-2": () => ({ title: "Energy availability looks low", detail: "Energy availability looks low enough to affect health. Raise calories or pause the cut, and talk to a professional." }),

  "SAFE-3": () => ({
    title: "Let's pause the cut",
    detail: "What you described can be a sign of under-fuelling. Move to maintenance and talk to a GP or registered dietitian.",
  }),

  "SAFE-4": (f) => {
    if (f.safeReason === "rate" && f.rate) {
      return {
        title: "Not coaching this rate",
        detail: `${rateClause(f)}, and above 1.5 %/wk for three weeks. Move to maintenance and talk to a GP or registered dietitian.`,
      };
    }
    return {
      title: "Not coaching this goal",
      detail: `A target of ${(f.targetKg ?? 0).toFixed(1)} kg puts you at a BMI of ${(f.bmiTarget ?? 0).toFixed(1)}, under the WHO healthy range. Choose a higher target, and talk to a GP or registered dietitian.`,
    };
  },

  "SAFE-5": () => ({
    title: "Keeping this at maintenance",
    detail: "Given what you told us, we won't coach a deficit. Targets stay at maintenance; a GP or registered dietitian can help with the next step.",
  }),
};

/** Title and detail for a rule from the facts the judge gathered. */
export function verdictCopy(id: RuleId, facts: VerdictFacts): VerdictCopy {
  return COPY[id](facts);
}

// ── Recommendation row ──

/** The recommendation row's copy (05-design §7). */
export function recommendationLabel(rec: Recommendation | null, opts: { sleepGoalH?: number } = {}): string | null {
  if (!rec) return null;
  switch (rec.kind) {
    case "change_rate": {
      const easing = Math.abs(rec.toPctPerWeek) < Math.abs(rec.fromPctPerWeek);
      const verb = easing ? "Ease" : "Raise";
      return `${verb} goal to ${fmtRate(rec.toPctPerWeek)} %/wk (about ${fmtKcalDelta(rec.kcalDeltaAtCurrentBW)} kcal/day)`;
    }
    case "refresh_targets":
      return `Update targets now (${fmtKcalDelta(rec.toKcal - rec.fromKcal)} kcal/day)`;
    case "eat_to_target": {
      const d = Math.round(Math.abs(rec.deltaKcal) / 10) * 10;
      return `Eat to target (about ${d} kcal/day ${rec.deltaKcal < 0 ? "more" : "less"})`;
    }
    case "protein":
      return `Aim for ${rec.toG} g a day`;
    case "sleep":
      return `Aim for 45 to 60 min more a night (toward ${rec.targetHours.toFixed(rec.targetHours % 1 === 0 ? 0 : 1)} h)`;
    case "diet_break":
      return `Take a ${rec.weeks}-week break at maintenance`;
    case "maintenance_first":
      return `Hold maintenance for ${rec.weeks} week${rec.weeks === 1 ? "" : "s"}`;
    case "log_more":
      if (rec.what === "weight") return `Log ${rec.needed} more weigh-in${rec.needed === 1 ? "" : "s"}`;
      if (rec.what === "food") return `Log ${rec.needed} more day${rec.needed === 1 ? "" : "s"} of food`;
      if (rec.what === "sleep") return `Log ${rec.needed} more night${rec.needed === 1 ? "" : "s"}`;
      return "Log your waist weekly";
    case "confirm_days":
      return `Confirm ${countWord(rec.dates.length)} day${rec.dates.length === 1 ? "" : "s"}`;
    case "pause_and_seek_help":
      return "Move to maintenance and talk to a professional";
    default: {
      void opts;
      return null;
    }
  }
}

// ── Status labels (home tile) ──

/** Short label per rule for the home tile and the status line. */
export const STATUS_LABEL: Readonly<Record<RuleId, string>> = {
  "SAFE-0": "Maintenance",
  "SAFE-1": "At the floor",
  "SAFE-2": "Pause the cut",
  "SAFE-3": "Pause the cut",
  "SAFE-4": "Not coaching this",
  "SAFE-5": "Maintenance",
  "NO-GOAL": "Set a goal",
  "DATA-PARTIAL": "Confirm days",
  "DATA-HOLD": "Holding",
  "DATA-RATE": "Calibrating",
  "DATA-EXP": "Calibrating",
  "G-EXP-2": "Check logging",
  "DB-1": "Diet break offer",
  "ADH-1": "Eat to target",
  "LOSS-1": "Slow the cut",
  "LOSS-2": "Faster than needed",
  "LOSS-2u": "Faster than needed",
  "LOSS-3": "Losing very fast",
  "LOSS-4": "Slow the cut",
  "LOSS-6": "Stalled",
  "GAIN-1": "Gaining fast",
  "GAIN-2": "Not gaining",
  "GAIN-3": "Lifts progressing",
  "GAIN-4": "Waist up",
  "RECOMP-1": "Recomposition",
  "RECOMP-WAIST": "Log waist",
  "STR-1": "Lifts dropping",
  "STR-2": "One lift down",
  "SLEEP-1": "Sleep first",
  "SLEEP-1i": "Sleep short",
  "SLEEP-2": "Sleep short",
  "SLEEP-3": "Short nights",
  "PRO-1": "Protein low",
  "PRO-2": "Protein low",
  "FAT-1": "Fat low",
  "ON-TRACK": "On track",
  "NO-CHANGE": "No change",
};
