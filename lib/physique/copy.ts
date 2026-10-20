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

/** Case 2/3 of 02 §8.2 A: the coach is lagging, or still settling. */
function coachClause(f: VerdictFacts, direction: "low" | "high"): string {
  if (f.recommendation?.kind === "refresh_targets") return ` Your maintenance estimate is ${direction}.`;
  return " Your maintenance estimate is still catching up.";
}

function sinceClause(f: VerdictFacts): string {
  return f.phase === "lose" ? " since the cut began" : f.phase === "gain" ? " since the bulk began" : "";
}

// ── Per-rule copy ──

type CopyFn = (f: VerdictFacts) => VerdictCopy;

const COPY: Record<RuleId, CopyFn> = {
  "NO-GOAL": () => ({ title: "Set a goal", detail: "Set a target weight to get a verdict." }),

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
    return { title: "Holding", detail: `Log ${what} this week to resume updates.` };
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
      title: "Logging gap likely",
      detail: `Logged intake fell ${pct} over 14 days with no matching change in the trend. Check your logging; targets hold until it settles.`,
    };
  },

  "ADH-1": (f) => {
    const d = f.adherenceDeltaKcal ?? 0;
    const dir = d < 0 ? "under" : "over";
    return {
      title: "Eat to target first",
      detail: `You've averaged ${Math.round(Math.abs(d) / 10) * 10} kcal ${dir} target over 14 days. Eat to target before we change your goal.`,
    };
  },

  "DB-1": () => ({
    title: "A diet break may help",
    detail:
      "Six weeks in, you've been over target on 3 or more days a week for 2 weeks. A one-week break at maintenance may help adherence. In trials it did not slow fat loss; expect 0.5 to 1.5 kg of water back.",
  }),

  "LOSS-1": (f) => {
    const down = f.lifts?.length ? `, and ${joinNames(f.lifts.map((l) => l.name))} ${f.lifts.length > 1 ? "are" : "is"} ${fmtDrop(f.lifts.map((l) => l.changePct))}${sinceClause(f)}` : "";
    if (f.goalOutOfRange) {
      return {
        title: "Slow the cut",
        detail: `${rateClause(f)}${down}. A ${fmtRate(f.goalRate ?? 0)} %/wk goal is above the range that protects strength.`,
      };
    }
    const adherent = f.adherent ? ", while eating to target" : "";
    return {
      title: "Losing faster than planned",
      detail: `${rateClause(f)} against a ${fmtRate(f.goalRate ?? 0)} goal${adherent}${down}.${coachClause(f, "low")}`,
    };
  },

  "LOSS-3": (f) => {
    const tail = f.goalOutOfRange
      ? ` A ${fmtRate(f.goalRate ?? 0)} %/wk goal is above the range that protects strength.`
      : f.adherent
        ? coachClause(f, "low")
        : "";
    return {
      title: "Losing very fast",
      detail: `${rateClause(f)}. Rates above 1.5 %/wk are linked in studies to strength and hormone losses.${tail}`,
    };
  },

  "LOSS-4": (f) => {
    const down = f.lifts?.length ? `, and ${joinNames(f.lifts.map((l) => l.name))} ${f.lifts.length > 1 ? "are" : "is"} ${fmtDrop(f.lifts.map((l) => l.changePct))}${sinceClause(f)}` : "";
    const stage = f.nearGoal ? "Near your goal" : "At your training stage";
    const tail = f.goalOutOfRange ? ` ${stage}, a ${fmtRate(f.goalRate ?? 0)} %/wk goal is above the range that protects strength.` : ` ${stage}, a slower rate protects strength.${coachClause(f, "low")}`;
    return { title: "Slow the cut at your stage", detail: `${rateClause(f)}${down}.${tail}` };
  },

  "LOSS-2": (f) => {
    const near = f.nearGoal ? " Near your goal, a slower rate is the safer choice." : " No change unless this continues.";
    return { title: "Faster than needed", detail: `${rateClause(f)} with lifts holding.${near}` };
  },

  "LOSS-2u": (f) => {
    const near = f.nearGoal ? " Near your goal, a slower rate is the safer choice." : " No change unless this continues.";
    return { title: "Faster than needed", detail: `${rateClause(f)}; no lift data to judge retention.${near}` };
  },

  "LOSS-6": (f) => {
    const adherent = f.adherent ? ", while eating to target" : "";
    const r = f.rate;
    const lead = r ? `${fmtSignedRate(r.ratePctPerWeek)} %/wk ${fmtWindow(r.windowDays, r.n)}` : "The trend is flat";
    return {
      title: "Weight loss has stalled",
      detail: `${lead} against a ${fmtSignedRate(f.goalRate ?? 0)} goal${adherent}.${coachClause(f, "high")}`,
    };
  },

  "GAIN-1": (f) => {
    const tail = f.goalOutOfRange
      ? ` A ${fmtRate(f.goalRate ?? 0)} %/wk goal is above the lean-gain band for your training status.`
      : f.adherent
        ? coachClause(f, "high")
        : "";
    return { title: "Gaining faster than a lean bulk needs", detail: `${rateClause(f)}. In studies, gains this fast mostly add fat.${tail}` };
  },

  "GAIN-2": (f) => {
    const adherent = f.adherent ? ", while eating to target" : "";
    const tail = f.goalOutOfRange ? ` A ${fmtRate(f.goalRate ?? 0)} %/wk goal sits under the lean-gain band for your training status.` : coachClause(f, "low");
    return {
      title: "Not gaining, and lifts have stalled",
      detail: `${rateClause(f)} against a ${fmtRate(f.goalRate ?? 0)} goal${adherent}, with lifts flat.${tail}`,
    };
  },

  "GAIN-3": (f) => {
    const up = f.lifts?.length ? `, but lifts are ${fmtRise(f.lifts.map((l) => l.changePct))}` : "";
    return {
      title: "Lifts still progressing",
      detail: `${rateClause(f)}, below your ${fmtRate(f.goalRate ?? 0)} goal${up}. Gains near maintenance are similar in studies, so no change is needed.`,
    };
  },

  "GAIN-4": (f) => ({
    title: "Waist is up",
    detail: `Waist is up ${(f.waistDeltaCm ?? 0).toFixed(1)} cm over ${f.waistWeeks ?? 4} weeks while ${rateClause(f, "gaining").replace(/^gaining/, "gaining")}.`,
  }),

  "RECOMP-1": (f) => {
    const up = f.lifts?.length ? `, lifts ${fmtRise(f.lifts.map((l) => l.changePct))}` : "";
    const r = f.rate;
    return {
      title: "Looks like recomposition",
      detail: `Scale flat ${r ? fmtWindow(r.windowDays, r.n) : "over 28 days"}${up}, waist down ${Math.abs(f.waistDeltaCm ?? 0).toFixed(1)} cm. No change needed.`,
    };
  },

  "RECOMP-WAIST": () => ({
    title: "Log your waist",
    detail: "Lifts are up while the scale is flat. A weekly waist measurement tells recomposition from a stall.",
  }),

  "STR-1": (f) => ({
    title: "Lifts are dropping",
    detail: f.lifts?.length ? `${joinNames(f.lifts.map((l) => l.name))} ${f.lifts.length > 1 ? "are" : "is"} ${fmtDrop(f.lifts.map((l) => l.changePct))}${sinceClause(f)}.` : "Two or more main lifts are down 5% or more.",
  }),

  "STR-2": (f) => {
    const l = f.lifts?.[0];
    return {
      title: "One lift is down",
      detail: `${l ? `${l.name} is ${fmtDrop([l.changePct])}${sinceClause(f)}` : "One main lift is down 5% or more"} while the others hold. That usually points to programming, technique or fatigue, not nutrition.`,
    };
  },

  "SLEEP-1": (f) => {
    const down = f.lifts?.length ? `, and ${joinNames(f.lifts.map((l) => l.name))} ${f.lifts.length > 1 ? "are" : "is"} ${fmtDrop(f.lifts.map((l) => l.changePct))}` : "";
    return {
      title: "Don't cut calories further",
      detail: `Sleep is averaging ${fmtHours(f.sleepMeanH ?? 0)} over ${f.sleepNights ?? 14} nights${down}. Get sleep back first.`,
    };
  },

  "SLEEP-1i": (f) => ({
    title: "Sleep is short",
    detail: `Sleep is averaging ${fmtHours(f.sleepMeanH ?? 0)} over ${f.sleepNights ?? 14} nights. In studies, short sleep during a cut shifted more of the loss to lean tissue.`,
  }),

  "SLEEP-2": (f) => ({
    title: "Short nights, bigger days",
    detail: `On days after short nights you eat about ${Math.round((f.sleepIntakeDiffKcal ?? 0) / 10) * 10} kcal more.`,
  }),

  "SLEEP-3": () => ({
    title: "Two short nights",
    detail: "Expect reps at a fixed load to be down. Keep the top set; drop a back-off set if RIR collapses.",
  }),

  "PRO-1": (f) => ({
    title: "Protein is low for a cut",
    detail: `${(f.proteinGPerKg ?? 0).toFixed(1)} g/kg in ${f.proteinWeeksLow ?? 2} of the last 3 weeks${f.proteinTargetG ? `; your target is ${f.proteinTargetG} g` : ""}. Under 1.8 g/kg is below the range shown to keep lean mass in a deficit.`,
  }),

  "PRO-2": (f) => ({
    title: "Protein is low",
    detail: `${(f.proteinGPerKg ?? 0).toFixed(1)} g/kg over 14 days${f.proteinTargetG ? `; your target is ${f.proteinTargetG} g` : ""}. Gains in studies plateau around 1.6 g/kg.`,
  }),

  "FAT-1": (f) => ({
    title: "Fat is low",
    detail: `${(f.fatGPerKg ?? 0).toFixed(1)} g/kg over 14 days, ${Math.round((f.fatShare ?? 0) * 100)}% of calories. That is under the usual minimum of 0.5 g/kg.`,
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
      const tail = f.rateClear ? "Targets stay as they are for now." : "Not clear enough yet to change anything.";
      return { title: "Nothing to change yet", detail: `${rateClause(f)} against a ${fmtSignedRate(f.goalRate)} %/wk goal. ${tail}` };
    }
    return { title: "Nothing to change", detail: "Nothing to change this week." };
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
