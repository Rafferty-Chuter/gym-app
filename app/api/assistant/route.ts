import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  detectAssistantModeWithReason,
  type AssistantMode,
} from "@/lib/assistantMode";
import type { UserProfile } from "@/lib/userProfile";
import type { AssistantSelectiveMemoryV1, RecentConversationTurn } from "@/lib/assistantMemory";
import { buildSelectiveMemoryBlock } from "@/lib/assistantMemory";
import { buildInferredTrainingProfile } from "@/lib/inferredTrainingProfile";
import type { CoachingContext } from "@/lib/coachingContext";
import { countCompletedLoggedSets } from "@/lib/completedSets";
import { buildSessionReviewAnchorBlock } from "@/lib/sessionReviewAnchor";
import {
  buildExerciseLogAnchorBlock,
  resolveExerciseFromMessage,
} from "@/lib/assistantLogAnchors";
import {
  classifyAssistantQuestionKind,
  mapQuestionKindToLegacyIntent,
  type AssistantQuestionKind,
} from "@/lib/assistantQuestionRouting";

/** Mirrors client `coachStructuredOutput` — deterministic Coach tab output + evidence id hooks. */
export type AssistantCoachStructuredOutput = {
  keyFocus: string | null;
  keyFocusType: "plateau" | "declining" | "low-volume" | "progressing" | "none";
  keyFocusExercise?: string;
  keyFocusGroups?: string[];
  keyFocusEvidenceCardIds: string[];
  whatsGoingWell: Array<{ text: string; evidenceCardIds: string[] }>;
  actionableSuggestions: Array<{ text: string; evidenceCardIds: string[] }>;
};

/** Deduped catalog cards referenced by the current coach output (subset of full EvidenceCard). */
export type AssistantEvidenceCard = {
  id: string;
  title: string;
  summary: string;
  practicalTakeaway: string;
  caution?: string;
  confidence: "low" | "moderate" | "high";
};

/**
 * POST /api/assistant JSON body.
 * Coach evidence: `coachStructuredOutput` carries deterministic text + `evidenceCardIds` per section;
 * `evidenceCards` is the deduped catalog subset for those ids (server filters to referenced ids only).
 */
export type AssistantBody = {
  message: string;
  /** Client-owned active thread id (localStorage). */
  thread_id?: string;
  /** Whether the loaded thread history is exact (truthfulness gating). */
  exactThreadLoaded?: boolean;
  /**
   * Client-owned, ordered thread snippet (used for deterministic "last message" queries
   * and for conversation continuity).
   */
  threadMessages?: Array<{ role: "user" | "assistant"; content: string }>;
  trainingSummary: {
    totalWorkouts: number;
    totalExercises: number;
    totalSets: number;
    weeklyVolume: Record<string, number>;
    recentExercises: string[];
  };
  trainingFocus?: string;
  experienceLevel?: string;
  unit?: string;
  /** Priority goal label (same as Coach). */
  priorityGoal?: string;
  exerciseTrends?: Array<{
    exercise: string;
    trend: string;
    recentPerformances: Array<{ completedAt: string; weight: number; reps: number }>;
  }>;
  trainingInsights?: {
    weeklyVolume: Record<string, number>;
    frequency: number;
    exerciseInsights: Array<{
      exercise: string;
      sessionsTracked: number;
      trend: string;
      changeSummary: string;
      consistency: string;
      hasAdequateExposure: boolean;
      possiblePlateau: boolean;
      possibleFatigue: boolean;
      possibleLowSpecificity: boolean;
      avgRIR?: number;
      latestSessionAvgRIR?: number;
      latestSessionAllSetsToFailure?: boolean;
    }>;
    findings: string[];
    /** Mean RIR over all logged sets in history. */
    averageRIR?: number;
    /** Exercises flagged as high effort from logged RIR. */
    recentHighEffortExercises?: string[];
  };
  /** Per-exercise insight for the user's priority goal lift (same shape as getExerciseInsights). */
  priorityGoalExerciseInsight?: {
    exercise: string;
    sessionsTracked: number;
    trend: string;
    changeSummary: string;
    consistency: string;
    hasAdequateExposure: boolean;
    possiblePlateau: boolean;
    possibleFatigue: boolean;
    possibleLowSpecificity: boolean;
    avgRIR?: number;
    latestSessionAvgRIR?: number;
    latestSessionAllSetsToFailure?: boolean;
  };
  coachStructuredOutput?: AssistantCoachStructuredOutput;
  /** Only cards referenced via evidenceCardIds in coachStructuredOutput. */
  evidenceCards?: AssistantEvidenceCard[];
  /** Optional plain summary of saved templates (names, splits, exercises) for template_review intent. */
  templatesSummary?: string;
  /** High-confidence user constraints only. */
  userProfile?: UserProfile;
  coachingContext?: CoachingContext;
  /** Selective long-term coaching preferences learned from chats (client-owned). */
  assistantMemory?: AssistantSelectiveMemoryV1;
  /** Rolling window of recent chat turns for thread continuity (client-owned). */
  recentConversationMemory?: RecentConversationTurn[];
  /** Client-owned conversation subject locking: exercise topic to anchor follow-ups. */
  activeExerciseTopic?: string;
  /** Exact last-session data for the active exercise (client-owned). */
  activeExerciseLastSession?: {
    exerciseName: string;
    completedAt: string;
    unloggedSetCount?: number;
    bestSet?: { weight: string; reps: string; e1rm?: number };
    lastSet?: { weight: string; reps: string; notes?: string; rir?: number };
    sets?: Array<{ weight: string; reps: string; notes?: string; rir?: number }>;
  };
  /** Optional bench projection estimate (client-owned). */
  benchProjection?: {
    target1RM: number;
    payloadUnit: "kg" | "lb";
    benchExerciseName: string;
    currentEstimated1RM: number;
    deltaE1RMPerSession: number;
    sessionsEstimate: number;
    workingWeights: Array<{ reps: number; weight: number }>;
    recentBestSets: Array<{ completedAt: string; weight: number; reps: number; e1rm?: number }>;
  };
};

export type AssistantResponse = {
  reply: string;
};

export type AssistantIntent =
  | "session_review"
  | "recent_training_analysis"
  | "coach_explanation"
  | "template_review"
  | "exercise_question"
  | "goal_question"
  | "general_training_question"
  | "unknown";

type ParsedContext = {
  goal?: string;
  frequencyPerWeek?: number;
  equipment?: "full_gym" | "home" | "minimal";
  injuryStatus?: "none" | "present";
};

function parseContextFromMessage(message: string): ParsedContext {
  const t = message.trim().toLowerCase();
  const out: ParsedContext = {};

  if (/\bstrength\b/.test(t)) out.goal = "strength";
  else if (/\bhypertrophy\b|\bmuscle\b/.test(t)) out.goal = "hypertrophy";
  else if (/\bboth\b|\bmix\b|\bstrength.*hypertrophy\b|\bhypertrophy.*strength\b/.test(t))
    out.goal = "strength_hypertrophy_mix";

  const freqMatch = t.match(/\b([2-7])\b/);
  if (freqMatch) {
    const n = Number(freqMatch[1]);
    if (Number.isFinite(n)) out.frequencyPerWeek = n;
  }

  if (
    t.includes("full equipment") ||
    t.includes("full gym") ||
    t.includes("commercial gym")
  ) {
    out.equipment = "full_gym";
  } else if (t.includes("home gym")) {
    out.equipment = "home";
  } else if (t.includes("minimal equipment") || t.includes("bodyweight only")) {
    out.equipment = "minimal";
  }

  if (/\bno\b/.test(t) && (t.includes("injury") || t.includes("injuries") || t.endsWith(", no"))) {
    out.injuryStatus = "none";
  } else if (t.includes("injury") || t.includes("pain")) {
    out.injuryStatus = "present";
  }

  return out;
}

function withDefaultsForCoaching(parsed: ParsedContext): Required<ParsedContext> {
  return {
    goal: parsed.goal ?? "strength_hypertrophy_mix",
    frequencyPerWeek: parsed.frequencyPerWeek ?? 4,
    equipment: parsed.equipment ?? "full_gym",
    injuryStatus: parsed.injuryStatus ?? "none",
  };
}

function hasMinimumViableContext(parsed: ParsedContext): boolean {
  return Boolean(
    parsed.goal &&
      parsed.frequencyPerWeek &&
      parsed.equipment &&
      parsed.injuryStatus
  );
}

/**
 * Legacy intent label (logging / compatibility). Prefer `classifyAssistantQuestionKind` for routing.
 */
export function classifyAssistantIntent(message: string): AssistantIntent {
  const t = message.trim().toLowerCase();
  if (!t) return "unknown";
  return mapQuestionKindToLegacyIntent(classifyAssistantQuestionKind(message)) as AssistantIntent;
}

function isStringArray(a: unknown): a is string[] {
  return Array.isArray(a) && a.every((x) => typeof x === "string");
}

function isCoachStructuredOutput(v: unknown): v is AssistantCoachStructuredOutput {
  if (v == null || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  if (!("keyFocus" in o) || !(o.keyFocus === null || typeof o.keyFocus === "string")) return false;
  if (typeof o.keyFocusType !== "string") return false;
  if (!isStringArray(o.keyFocusEvidenceCardIds)) return false;
  if (!Array.isArray(o.whatsGoingWell) || !Array.isArray(o.actionableSuggestions)) return false;
  for (const row of o.whatsGoingWell) {
    if (row == null || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (typeof r.text !== "string" || !isStringArray(r.evidenceCardIds)) return false;
  }
  for (const row of o.actionableSuggestions) {
    if (row == null || typeof row !== "object") return false;
    const r = row as Record<string, unknown>;
    if (typeof r.text !== "string" || !isStringArray(r.evidenceCardIds)) return false;
  }
  return true;
}

type JsonWorkoutExercise = { name?: string; sets?: unknown[] };
type JsonWorkout = {
  completedAt?: string;
  name?: string;
  exercises?: JsonWorkoutExercise[];
};

function formatRecentWorkoutsDigest(
  workouts: unknown,
  max = 8
): { text: string; count: number } {
  if (!Array.isArray(workouts)) return { text: "(no recent session list in payload)", count: 0 };
  const slice = (workouts as JsonWorkout[]).slice(0, max);
  const lines = slice.map((w, i) => {
    const date =
      typeof w.completedAt === "string" && w.completedAt.length >= 10
        ? w.completedAt.slice(0, 10)
        : "unknown date";
    const title = typeof w.name === "string" && w.name.trim() ? w.name.trim() : "Session";
    const exParts = (w.exercises ?? []).map((e) => {
      const nm = typeof e.name === "string" && e.name.trim() ? e.name.trim() : "Exercise";
      const n = countCompletedLoggedSets(Array.isArray(e.sets) ? (e.sets as Array<{ weight?: string; reps?: string }>) : []);
      return `${nm} (${n} sets)`;
    });
    return `${i + 1}. ${date} — ${title}: ${exParts.length ? exParts.join("; ") : "no exercises listed"}`;
  });
  return { text: lines.join("\n"), count: slice.length };
}

function formatTemplatesDigest(templates: unknown, max = 8): string {
  if (!Array.isArray(templates)) return "none in payload";
  const slice = templates.slice(0, max) as Array<{ name?: string; exercises?: unknown[] }>;
  if (slice.length === 0) return "none in payload";
  return slice
    .map((t) => {
      const n = Array.isArray(t.exercises) ? t.exercises.length : 0;
      const name = typeof t.name === "string" && t.name.trim() ? t.name.trim() : "Unnamed template";
      return `${name} (${n} exercises)`;
    })
    .join("; ");
}

function formatCoachReviewBriefFromContext(ctx: unknown): string {
  if (ctx == null || typeof ctx !== "object") return "not included";
  const c = ctx as { coachReviewBrief?: CoachingContext["coachReviewBrief"] };
  const b = c.coachReviewBrief;
  if (!b) return "not included";
  const lines: string[] = [];
  if (b.keyFocus) lines.push(`Key focus: ${b.keyFocus}`);
  if (b.nextSessionTitle) lines.push(`Next session (coach plan): ${b.nextSessionTitle}`);
  if (b.whatsGoingWell?.length)
    lines.push(`Going well: ${b.whatsGoingWell.filter(Boolean).join(" | ")}`);
  if (b.topSuggestions?.length)
    lines.push(`Top suggestions: ${b.topSuggestions.filter(Boolean).join(" | ")}`);
  return lines.length ? lines.join("\n") : "(empty brief)";
}

function buildLoggedTrainingPreamble(params: {
  hasWorkoutData: boolean;
  totalWorkouts: number;
  recentDigest: string;
  recentCount: number;
  coachingContext: unknown;
}): string {
  if (!params.hasWorkoutData) {
    return `=== LOGGED TRAINING STATUS ===
No completed workouts were included in the summary (0 sessions / 0 sets). It is appropriate to ask what their training looks like or encourage them to log sessions in the app.`;
  }

  const ctx = params.coachingContext as Partial<CoachingContext> | null | undefined;
  const tpl = formatTemplatesDigest(ctx?.templates);
  const brief = formatCoachReviewBriefFromContext(params.coachingContext);

  return `=== LOGGED TRAINING (AUTHORITATIVE — USER LOGS IN THIS APP) ===
The user has already logged workouts. The digest below is their real history; treat it as ground truth.

Totals (all time, from summary): ${params.totalWorkouts} workout(s).
Recent sessions (${params.recentCount} newest in payload):
${params.recentDigest}

Saved templates (names): ${tpl}

Coach review brief (deterministic tab output):
${brief}

STRICT RULES:
- Start from this logged data and the structured trainingSummary / trainingInsights / coach blocks below. Do NOT ask them to paste or restate their full routine.
- Only ask a follow-up if something critical for safety or their exact question is missing from the payload.
- If the log is thin, say so in one short phrase (e.g. "From your few logged sessions…") and still give the clearest next step from what you have.`;
}

function sanitizeEvidenceCards(v: unknown): AssistantEvidenceCard[] {
  if (!Array.isArray(v)) return [];
  const out: AssistantEvidenceCard[] = [];
  for (const item of v) {
    if (item == null || typeof item !== "object") continue;
    const c = item as Record<string, unknown>;
    if (typeof c.id !== "string" || typeof c.title !== "string") continue;
    if (typeof c.summary !== "string" || typeof c.practicalTakeaway !== "string") continue;
    if (c.confidence !== "low" && c.confidence !== "moderate" && c.confidence !== "high") continue;
    out.push({
      id: c.id,
      title: c.title,
      summary: c.summary,
      practicalTakeaway: c.practicalTakeaway,
      caution: typeof c.caution === "string" ? c.caution : undefined,
      confidence: c.confidence,
    });
  }
  return out;
}

function referencedEvidenceIds(coach: AssistantCoachStructuredOutput): Set<string> {
  const ids = new Set<string>();
  for (const id of coach.keyFocusEvidenceCardIds) ids.add(id);
  for (const w of coach.whatsGoingWell) for (const id of w.evidenceCardIds) ids.add(id);
  for (const s of coach.actionableSuggestions) for (const id of s.evidenceCardIds) ids.add(id);
  return ids;
}

function buildAnalysisInputs(
  trainingSummary: AssistantBody["trainingSummary"],
  trainingInsights: AssistantBody["trainingInsights"] | undefined,
  exerciseTrends: NonNullable<AssistantBody["exerciseTrends"]>,
  coachStructuredOutput: AssistantCoachStructuredOutput | undefined
): {
  topPositive: string | null;
  topIssue: string | null;
  nextStep: string | null;
  missing: Array<"positive" | "issue" | "nextStep">;
} {
  const highVolumeGroup = Object.entries(trainingSummary.weeklyVolume ?? {}).sort(
    (a, b) => b[1] - a[1]
  )[0];

  const coachPositive = coachStructuredOutput?.whatsGoingWell?.[0]?.text?.trim();
  const coachIssue =
    coachStructuredOutput?.keyFocus?.trim() ||
    coachStructuredOutput?.actionableSuggestions?.[0]?.text?.trim();
  const coachNext = coachStructuredOutput?.actionableSuggestions?.[0]?.text?.trim();

  const positiveInsight = (trainingInsights?.exerciseInsights ?? []).find(
    (e) => e.trend === "improving" || e.trend === "progressing"
  );
  const positiveTrend = exerciseTrends.find(
    (t) => t.trend === "improving" || t.trend === "progressing"
  );
  const topPositive: string | null =
    positiveInsight?.changeSummary ||
    (positiveTrend?.exercise
      ? `${positiveTrend.exercise} is trending up across recent logged sessions.`
      : "") ||
    coachPositive ||
    (highVolumeGroup
      ? `Your logs show ${highVolumeGroup[1]} sets for ${highVolumeGroup[0]} in the last 7 days (app-counted from completed sets).`
      : null);

  const topIssue: string | null =
    (trainingInsights?.exerciseInsights ?? [])
      .find((e) => e.possiblePlateau || e.possibleFatigue || e.possibleLowSpecificity)
      ?.changeSummary ||
    (trainingInsights?.findings ?? []).find((f) => typeof f === "string" && f.trim().length > 0) ||
    coachIssue ||
    ((trainingInsights?.frequency ?? 0) < 2
      ? "Based on your recent logged sessions, weekly frequency looks on the low side — an early signal, not a verdict."
      : null);

  const issueExercise = (trainingInsights?.exerciseInsights ?? []).find(
    (e) => e.possiblePlateau || e.possibleFatigue || e.possibleLowSpecificity
  );
  const nextStep: string | null = issueExercise
    ? issueExercise.possibleFatigue
      ? `If recovery seems tight (early signal from logs), a useful rule of thumb is easing effort slightly on ${issueExercise.exercise} for a session or two.`
      : issueExercise.possiblePlateau
        ? `For ${issueExercise.exercise}, a small progression tweak next session is often worth trying; treat “no progress for a few sessions” as a heuristic, not a hard rule.`
        : `For ${issueExercise.exercise}, consider raising specificity gradually while keeping effort aligned with your goal.`
    : coachNext ||
      (highVolumeGroup
        ? `Keeping ${highVolumeGroup[0]} volume roughly steady while adding one focused support lift this week is often a solid next move.`
        : null);

  const missing: Array<"positive" | "issue" | "nextStep"> = [];
  if (!topPositive) missing.push("positive");
  if (!topIssue) missing.push("issue");
  if (!nextStep) missing.push("nextStep");

  return { topPositive, topIssue, nextStep, missing };
}

/**
 * Appended to every assistant turn so replies stay data-grounded without fake precision.
 */
const TRUST_AND_CALIBRATION_BLOCK = `
PRECISION & STRENGTH CLAIMS:
- Never state exact strength gains as a percentage (e.g. "~12% stronger") unless the payload explicitly includes that computed figure and how it was derived. The app usually does not — so do not invent percentages or fake precision.
- Prefer qualitative progression language tied to logged reps/load: e.g. "small but real improvement", "modest progression", "clear rep improvement at the same load", "load moved up slightly with similar reps".

CLEAR SIGNAL VS INFERENCE:
- Distinguish direct log facts (sets, reps, weight, session dates, trends from exerciseTrends / exerciseInsights) from interpretations (recovery, fatigue, frequency "quality", plateau risk).
- When you infer recovery, fatigue, or how "good" frequency is, label it: e.g. "based on your recent logged sessions", "this suggests", "this may indicate", "early signal", "still noisy with this much history".
- Do not present heuristics as physical laws.

WEEKLY VOLUME & SET TOTALS:
- Weekly muscle-group set counts and total sets in the payload are app-calculated from completed sets in logged workouts (last 7 days for weekly breakdown). Quote those numbers exactly; do not round into misleading precision.
- If the last-7-days session count is low, or logs may omit outside-gym work, say the volume picture may be incomplete. Avoid sweeping claims about "your training as a whole" unless the logs reasonably support them.

PLATEAUS, FATIGUE, RULES OF THUMB:
- Phrases like "three sessions with no progress" are heuristics, not guarantees. Use wording such as "a useful rule of thumb", "often", "worth considering", "one thing to watch".
- Keep actionable guidance; soften certainty, not usefulness.

STYLE (keep):
- Direct answers, no unnecessary clarifying loops, continuity with prior context, calm practical tone.
- Prefer specific log references over vague "your data" — e.g. "based on your recent logged sessions" when citing the digest or structured fields.
`.trim();

const INFERENCE_CERTAINTY_BLOCK = `
INFERENCE & CERTAINTY (mandatory for all replies):
- Logged numbers (weight, reps, dates, set counts) = state as facts.
- Fatigue, form, technique, recovery, effort quality, or "what went wrong" inferred only from rep drops, load changes, or notes — is NOT a fact. Treat as interpretation.

When interpreting from patterns, use careful language, for example:
- "may suggest fatigue", "could reflect rep quality slipping", "might indicate fatigue or technique breakdown — the log alone can’t separate those"
- "is consistent with accumulating fatigue (guess from the pattern)", "one possible read is…"

Do NOT say (unless the user explicitly logged it in notes or the payload states it):
- "form issues", "poor form", "technique breakdown" as definite facts
- "this shows/proves/demonstrates" recovery problems, poor form, or definite fatigue
- "you have" / "you are" + diagnostic labels (e.g. "overreaching") from thin indirect evidence

RIR / effort:
- If RIR was not logged on those sets, do not state RIR or proximity to failure as fact. Preface with "RIR wasn’t logged — as an estimate…" or avoid RIR entirely and speak in "load/rep pattern" terms.

When one sentence mixes fact + guess, make the split obvious: e.g. "Third set dropped to 6 at 90 (logged). That pattern sometimes suggests fatigue or pacing (interpretation, not proof)."
`.trim();

const GLOBAL_REPLY_DISCIPLINE_BLOCK = `
GLOBAL REPLY DISCIPLINE (all questions):
- In-app replies should feel concise and premium: takeaway first, minimal preamble, no chain-of-thought or debug tone.
- Lead with a direct answer; avoid padded intros and generic summaries when specifics exist in the payload.
- If EXERCISE LOG ANCHOR or SESSION ANCHOR is present, treat it as the primary evidence for names, sets, and loads on this turn.
- A logged set counts as completed performance only when reps are logged as a number > 0; blank, zero, or missing-rep rows are placeholders or incomplete — never quote those as work done.
- Separate "logged fact" vs "coaching inference" visibly; follow INFERENCE & CERTAINTY rules above for hedging.
- Do not name exercises the user did not ask about unless clearly useful; if you add one, label it as optional context.
- Match depth to the question: default to short; expand only when the user asked for detail, breakdown, or "every set".
- Do not use report-style labels like "A)", "B)", "C)" in user-facing text.
- Calibrate confidence: thin logs → one short line on what you cannot know.
`.trim();

async function getAssistantReply(
  loggedDataPreamble: string,
  message: string,
  intent: AssistantIntent,
  questionKind: AssistantQuestionKind,
  mode: AssistantMode,
  templateDataAvailable: boolean,
  templatesSummary: string | undefined,
  trainingSummary: AssistantBody["trainingSummary"],
  profile: { trainingFocus?: string; experienceLevel?: string; unit?: string; priorityGoal?: string },
  userProfile: UserProfile | undefined,
  assistantMemory: AssistantSelectiveMemoryV1 | undefined,
  recentConversationMemory: RecentConversationTurn[] | undefined,
  exactThreadLoaded: boolean | undefined,
  activeExerciseTopic: string | undefined,
  activeExerciseLastSession: AssistantBody["activeExerciseLastSession"] | undefined,
  benchProjection: AssistantBody["benchProjection"] | undefined,
  coachingContext: CoachingContext | undefined,
  exerciseTrends: NonNullable<AssistantBody["exerciseTrends"]>,
  trainingInsights: AssistantBody["trainingInsights"] | undefined,
  priorityGoalExerciseInsight: AssistantBody["priorityGoalExerciseInsight"],
  coachStructuredOutput: AssistantCoachStructuredOutput | undefined,
  evidenceCards: AssistantEvidenceCard[]
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const openai = new OpenAI({ apiKey });

  const weeklyVolumeStr =
    Object.entries(trainingSummary.weeklyVolume ?? {})
      .filter(([, n]) => n > 0)
      .map(([g, n]) => `${g}: ${n} sets`)
      .join("; ") || "none logged";

  const insightsFrequency = trainingInsights?.frequency ?? 0;
  const insightsWeeklyVolume = trainingInsights?.weeklyVolume ?? trainingSummary.weeklyVolume;
  const inferredProfile = buildInferredTrainingProfile({
    weeklyVolume: insightsWeeklyVolume ?? {},
    frequency: insightsFrequency,
    averageRIR: trainingInsights?.averageRIR,
  });
  const effectiveInferred = coachingContext?.inferred ?? {
    split: inferredProfile.inferredSplit,
    weakMuscles: inferredProfile.weakMuscleGroups,
    progressingExercises: [],
    plateauExercises: [],
    avgRIR: inferredProfile.effortStyle.averageRIR,
    volumeByMuscle: inferredProfile.volumeByMuscle,
    frequency: inferredProfile.frequency,
    coachInsight: undefined,
  };
  const insightsWeeklyVolumeStr =
    Object.entries(insightsWeeklyVolume ?? {})
      .filter(([, n]) => n > 0)
      .map(([g, n]) => `${g}: ${n} sets`)
      .join("; ") || "none";

  const volumeCompletenessNote =
    insightsFrequency <= 1
      ? "Volume below reflects only what is logged; with few sessions in the last 7 days, treat weekly totals as a partial snapshot."
      : insightsFrequency <= 2
        ? "Interpret weekly totals cautiously if some training happens outside the app."
        : "";

  const context = `Training data (logged in app): ${trainingSummary.totalWorkouts} total workouts, ${trainingSummary.totalSets} total sets (all-time, counted from completed sets), ${trainingSummary.totalExercises} exercise entries. Last 7 days: ${insightsFrequency} logged session(s). Weekly volume = set counts by muscle group in that window (same calculation as the Coach tab); use these figures verbatim: ${weeklyVolumeStr}. ${volumeCompletenessNote ? `${volumeCompletenessNote} ` : ""}Recent exercise names: ${(trainingSummary.recentExercises ?? []).join(", ") || "none"}.`;
  const findingsStr = (trainingInsights?.findings ?? []).slice(0, 5).join(" ");
  const rirSuffix = (e: {
    avgRIR?: number;
    latestSessionAvgRIR?: number;
    latestSessionAllSetsToFailure?: boolean;
  }) => {
    const parts: string[] = [];
    if (e.avgRIR !== undefined) parts.push(`avgRIR~${e.avgRIR.toFixed(2)}`);
    if (e.latestSessionAvgRIR !== undefined)
      parts.push(`lastSessionAvgRIR~${e.latestSessionAvgRIR.toFixed(2)}`);
    if (e.latestSessionAllSetsToFailure === true) parts.push("lastSessionAllSetsToFailure");
    return parts.length ? ` [RIR: ${parts.join(", ")}]` : "";
  };

  const keyExerciseSignalsStr = (trainingInsights?.exerciseInsights ?? [])
    .slice(0, 4)
    .map(
      (e) =>
        `${e.exercise}: ${e.trend} (${e.changeSummary})${rirSuffix(e)}`
    )
    .join("; ");

  const globalRirStr = [
    trainingInsights?.averageRIR !== undefined &&
      `logged average RIR (all sets): ${trainingInsights.averageRIR.toFixed(2)}`,
    (trainingInsights?.recentHighEffortExercises?.length ?? 0) > 0 &&
      `high-effort exercises (by RIR): ${(trainingInsights?.recentHighEffortExercises ?? []).join(", ")}`,
  ]
    .filter(Boolean)
    .join("; ");

  const goalRirStr = priorityGoalExerciseInsight
    ? `Priority goal lift "${priorityGoalExerciseInsight.exercise}": trend ${priorityGoalExerciseInsight.trend}; ${priorityGoalExerciseInsight.changeSummary}${rirSuffix(priorityGoalExerciseInsight)}`
    : "";
  const trendsStr =
    exerciseTrends.length > 0
      ? exerciseTrends
          .map(
            (t) =>
              `${t.exercise}: ${t.trend} (last ${t.recentPerformances.length} sessions; best set range ${t.recentPerformances[0]?.weight ?? "?"}×${t.recentPerformances[0]?.reps ?? "?"} → ${t.recentPerformances[t.recentPerformances.length - 1]?.weight ?? "?"}×${t.recentPerformances[t.recentPerformances.length - 1]?.reps ?? "?"})`
          )
          .join(". ")
      : "";
  const profileStr =
    [
      profile.trainingFocus && `Training focus: ${profile.trainingFocus}`,
      profile.experienceLevel && `Experience level: ${profile.experienceLevel}`,
      profile.unit && `Preferred units: ${profile.unit}`,
      profile.priorityGoal && `Priority goal: ${profile.priorityGoal}`,
    ]
      .filter(Boolean)
      .join(". ") || "";
  const constraintsStr = userProfile
    ? [
        `Goal: ${userProfile.goal}`,
        `Training days available: ${userProfile.trainingDaysAvailable}`,
        `Equipment: ${(userProfile.equipment ?? []).join(", ") || "full gym"}`,
        userProfile.injuries?.length
          ? `Injuries/limitations: ${userProfile.injuries.join(", ")}`
          : "Injuries/limitations: none reported",
        userProfile.trainingPrioritiesText?.trim()
          ? `Training priorities: ${userProfile.trainingPrioritiesText.trim()}`
          : null,
        `Lower-body priority (inferred): ${userProfile.lowerBodyPriority}`,
      ].filter(Boolean).join("; ")
    : "";
  const inferredStr = `Heuristic inference from logged workout patterns (not direct measurement — say so when you use it; higher priority than profile unless a safety/constraint conflict exists):
- Weekly frequency: ${effectiveInferred.frequency}
- Inferred split: ${effectiveInferred.split ?? inferredProfile.inferredSplit}
- Effort style: ${inferredProfile.effortStyle.label}${
    effectiveInferred.avgRIR !== undefined
      ? ` (avg RIR ${effectiveInferred.avgRIR.toFixed(2)})`
      : ""
  }
- Weak muscle groups: ${effectiveInferred.weakMuscles.join(", ") || "none detected"}
- Progressing exercises: ${effectiveInferred.progressingExercises.join(", ") || "none"}
- Plateau exercises: ${effectiveInferred.plateauExercises.join(", ") || "none"}
- Coach key insight: ${effectiveInferred.coachInsight ?? "none"}
- Volume by muscle: ${
    Object.entries(effectiveInferred.volumeByMuscle ?? {})
      .map(([g, s]) => `${g}:${s}`)
      .join(", ") || "none"
  }`;
  const coachingMemoryStr = coachingContext
    ? `Product memory (persistent app context):
- profile present: ${coachingContext.profile ? "yes" : "no"}
- recent workouts loaded: ${coachingContext.recentWorkouts.length}
- templates loaded: ${coachingContext.templates.length}
Use this memory to avoid asking repeated questions when answers already exist in context.`
    : "Product memory unavailable for this request.";
  const parsedContext = parseContextFromMessage(message);
  const resolvedContext = withDefaultsForCoaching(parsedContext);
  const mvcPresent = hasMinimumViableContext(parsedContext);
  const contextDefaultsNote = [
    !parsedContext.goal && `goal: ${resolvedContext.goal}`,
    !parsedContext.frequencyPerWeek && `frequency: ${resolvedContext.frequencyPerWeek} sessions/week`,
    !parsedContext.equipment && `equipment: ${resolvedContext.equipment}`,
    !parsedContext.injuryStatus && `injury status: ${resolvedContext.injuryStatus}`,
  ]
    .filter(Boolean)
    .join(", ");

  const coachJson = coachStructuredOutput
    ? JSON.stringify(coachStructuredOutput)
    : "";
  const evidenceJson = evidenceCards.length > 0 ? JSON.stringify(evidenceCards) : "[]";
  const hasEvidenceCards = evidenceCards.length > 0;

  const coachAuthorityBlock = coachStructuredOutput
    ? `
Deterministic coach output (authoritative for key focus, positives, and top suggestions — rephrase and explain only; do not contradict or replace with new diagnoses):
${coachJson}

Evidence cards linked to that output (by id). Fields: title, summary, practicalTakeaway, optional caution, confidence — mine summary AND caution for nuance/limitations, not just the title:
${evidenceJson}

Strict rules when coach output is present:
- Do not invent plateaus, injuries, fatigue diagnoses, or problems not stated in coachStructuredOutput.
- Do not introduce new evidence cards or study claims beyond the provided evidenceCards array.
- If the user asks for assessments outside what the structured fields and training summaries support, state the limit and suggest logging more sessions instead of speculating.
`
    : "";

  const evidenceDrivenReasoningBlock = hasEvidenceCards
    ? `
EVIDENCE CARDS (when non-empty — required):
One pass per card: principle + nuance; tie once to their log — same rules as above (short sentences, no stacked outcomes).

Tone guard: avoid alarmist claims. Prefer "this may help", "this may indicate", "a useful rule of thumb", and "a good starting point would be".
`
    : "";

  const reasoningBaseBlock = `
SENTENCE CRAFT (hard rules):
- Max one key idea per sentence. Each sentence should read like a standalone insight.
- Cap sentence length at ~15–18 words. Split if longer.
- Do not stack metrics and interpretation in one sentence (number in one short beat; meaning in the next).
- No stacked concepts in a single sentence — one claim, then move on.
- Clarity beats completeness: omit nice-to-haves before you add length.

SIGNAL DENSITY:
- No repeated ideas: each sentence must add new information. Each outcome once (no stall + plateau + limit progress for one problem).

LENGTH & MERGE:
- Target 3–4 sentences total. Combine two short beats into one sentence only when it stays under ~18 words and stays one clear claim.
- More detail only if the user explicitly asks.

STRUCTURE (default arc — practical coach guidance):
(1) What’s happening — progress or position (from their data).
(2) What to adjust first — clear practical priority.
(3) Why that matters — short cause/effect.
(4) Exact fix — one concise, direct action.

GENERIC PHRASES (ban):
- "maintain progress", "keep progress moving", "balance volume", "find balance", "stay consistent" as empty advice — replace with concrete actions (dose, frequency, effort, recovery).

COACHING LANGUAGE:
- Keep language calm and practical.
- Avoid alarmist phrases like "will stall indefinitely", "will cause injury", "limiting factor is".
- Prefer: "a good starting point would be", "this may help", "this suggests", "early signal", "you can adjust based on how you feel."
- Frame plateau/fatigue/frequency judgments as inference from logs when not a raw number from the payload.

OPENINGS:
- Lead with the point. No: however, since, if you keep, but, generally, it's worth noting.

DEPTH (compressed):
- Keep mechanism, cause→effect, one system link when data support — spread across short sentences, not one dense block.

HOW TO REASON:
- With coach output: coachStructuredOutput + evidenceCards → trainingInsights → exerciseTrends → context. Without: insights + trends + context.

PLAIN LANGUAGE:
- Support muscles; sets, frequency, effort — not lab jargon unless the card uses it. Prefer "system constraint" framing over vague wellness talk.

RIR / EFFORT (when trainingInsights or priorityGoalExerciseInsight include RIR fields):
- When actual RIR data is available, use it directly in your answer.
- Do not answer with generic RIR guidance if session-specific RIR data exists in the payload.
- If a recent session was performed at or near failure (e.g. low avg RIR, or last session all sets @ 0 RIR), mention the tradeoff between stimulus and recoverable volume.
- Do not tell them to reduce to ~1-2 RIR unless the data shows effort is limiting progress or recoverable volume (e.g. plateau/decline or recovery strain with added volume).
- If progress is still positive, prefer: keep current effort for now, monitor recoverability, and use ~1-2 RIR only as the next step if progress stalls.

TONE:
- Clear, concise, actionable, and human.
`;

  const effectiveIntent: AssistantIntent =
    intent === "unknown" ? "general_training_question" : intent;

  const sessionReviewAnchorBlock =
    effectiveIntent === "session_review"
      ? buildSessionReviewAnchorBlock({
          message,
          recentWorkouts: coachingContext?.recentWorkouts,
          unitLabel: profile.unit,
        })
      : "";

  const shouldTryExerciseLock =
    questionKind === "exact_factual_recall" ||
    questionKind === "exercise_progression" ||
    questionKind === "coaching_recommendation";

  const resolvedExercise = shouldTryExerciseLock
    ? resolveExerciseFromMessage(
        message,
        coachingContext?.recentWorkouts,
        trainingSummary.recentExercises ?? [],
        activeExerciseTopic
      )
    : null;

  const exerciseLogAnchorBlock =
    resolvedExercise && shouldTryExerciseLock
      ? buildExerciseLogAnchorBlock({
          workouts: coachingContext?.recentWorkouts,
          exerciseKey: resolvedExercise.key,
          displayName: resolvedExercise.displayName,
        })
      : "";

  const routingPreamble = `
QUESTION KIND (routing): ${questionKind}
INTENT (legacy label): ${effectiveIntent}

GLOBAL RULES (always):
- Only use detailed recent-training / coach-log analysis when the user's question is actually about recent training, their week, or coach output—or when explaining coach output in coach_explanation using the blocks provided for that purpose.
- Do not answer a different question just because training data is available.
- Do not pivot unrelated questions into bench/support-volume or generic weekly analysis unless the intent is recent_training_analysis.
- If LOGGED TRAINING above shows workouts exist, never ask the user to describe their whole program from scratch; use the digest and structured fields.
`;

  const insightsBlock =
    trainingInsights
      ? `trainingInsights (use for specifics — frequencies, volumes, per-exercise signals, findings, logged RIR). Weekly set totals here match app-aggregated logs for the last 7 days:\n- Training frequency (last 7 days): ${insightsFrequency} session${insightsFrequency === 1 ? "" : "s"}\n- Weekly volume (sets per muscle group): ${insightsWeeklyVolumeStr}\n- Key exercise signals: ${keyExerciseSignalsStr || "none"}\n- Global RIR summary: ${globalRirStr || "no RIR logged or insufficient"}\n- Notable findings: ${findingsStr || "none"}\n${goalRirStr ? `- ${goalRirStr}\n` : ""}${volumeCompletenessNote ? `- Completeness: ${volumeCompletenessNote}\n` : ""}`
      : "";

  const trendsBlock = trendsStr
    ? `exerciseTrends (use for progression / plateau language tied to actual loads and reps):\n${trendsStr}\n`
    : "";

  const analysisInputs = buildAnalysisInputs(
    trainingSummary,
    trainingInsights,
    exerciseTrends,
    coachStructuredOutput
  );
  const analysisInputsBlock = `Analysis anchors from workout data (must use):
- Top positive: ${analysisInputs.topPositive ?? "MISSING"}
- Top issue/watch item: ${analysisInputs.topIssue ?? "MISSING"}
- Next step: ${analysisInputs.nextStep ?? "MISSING"}`;

  const templateReviewBlock = templateDataAvailable
    ? `Templates / programs (text provided by user in this request):\n${templatesSummary?.trim() ?? ""}\n`
    : `Templates / programs: NO structured template data was sent with this request. Do not pretend you reviewed their saved templates. Ask them to describe template names, split, days per week, and main exercises—or paste details—before judging or comparing programs.\n`;

  let input = "";
  switch (mode) {
    case "advisory":
      input = `
You are an experienced strength coach in advisory mode.

Hard rules:
- Do NOT run a full week-wide diagnosis unless the user asked for it.
- If LOGGED TRAINING above shows workouts, do NOT ask them to paste or restate their routine; you may mention one concrete detail from the digest when it sharpens your answer.
- If LOGGED TRAINING shows no sessions, do not treat that as failure—answer from principles or encourage logging.
- Use calm, coach-like language. No alarmist framing.
- Anchor recommendations to RIR targets and effort control.
- Adapt guidance to the user's message context (e.g., fatigue, stress, sleep, pain, health conditions, training schedule).
- If the user mentions pain, injury, or a health condition, prioritize safety and suggest professional medical input when appropriate.
- Give practical next-step coaching, not report-style commentary.
- Avoid vague "based on your data"; when citing logs, prefer "based on your recent logged sessions" or a concrete fact from the digest.
- Use supportive language like: "a good starting point would be", "this may help", "you can adjust based on how you feel."
- Do not start with clarifying questions when enough context exists.
- If minor context is missing, use these defaults silently and coach decisively:
  - equipment: full gym
  - goal bias: strength + hypertrophy mix
  - frequency baseline: 3-4 sessions per week
- First response MUST include all of:
  1) training structure/split
  2) rep ranges
  3) RIR guidance
  4) progression guidance
- Optional refinement question is allowed only as one short final line (e.g., "I can refine this further if needed.").
- Behaviour > Profile: prefer inferred behavior patterns unless profile constraints (injury/equipment/time) require overrides.
- Use coachingContext memory first; do not re-ask context already in memory.

RIR guidance defaults (unless user context suggests otherwise):
- Main compounds: usually ~1-3 RIR.
- Isolations/accessories: usually ~0-2 RIR.
- If fatigued or recovery-limited: bias higher RIR and reduce set volume.

${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}.` : ""}
${inferredStr}
${coachingMemoryStr}
Parsed user context:
- goal: ${resolvedContext.goal}
- frequency: ${resolvedContext.frequencyPerWeek} sessions/week
- equipment: ${resolvedContext.equipment}
- injury status: ${resolvedContext.injuryStatus}
${contextDefaultsNote ? `Assumptions used for missing fields: ${contextDefaultsNote}.` : "No assumptions required; full context was provided."}
Minimum viable context explicitly provided in this message: ${mvcPresent ? "yes" : "no"}.

User question:
${message}

Reply in plain language as a coach. 4-8 concise sentences with clear section flow:
"Split:", "Reps:", "RIR:", "Progression:".`;
      break;
    case "explanation":
      input = `
You are an elite strength coach. The user wants an explanation of existing coach output in plain English.

${routingPreamble}

${coachStructuredOutput ? coachAuthorityBlock : "No coach structured output is available; say so briefly and answer from profile + general principles only."}

${evidenceDrivenReasoningBlock}

TASK: Explain the current coach decisions and suggestions clearly. Do not invent new diagnoses.
${profileStr ? `User profile: ${profileStr}.` : ""}
- Keep wording simple and non-alarmist.
- Do not use internal terms like "signal", "interaction", or "limiting factor".
- Avoid vague "based on your data"; when citing logs, prefer "based on your recent logged sessions".

User question:
${message}

Answer in plain language. 3–5 short sentences. Focus on "why" and practical meaning.`;
      break;
    case "clarification":
      input = `
You are an experienced strength coach.

The user's question may be broad or underspecified.
- If LOGGED TRAINING above shows sessions, answer from that data first; do NOT ask them to restate their routine.
- Prefer a practical recommendation grounded in the payload before asking anything.
- Ask at most ONE clarifying question, and only if something critical is missing for safety or their exact question.
- If context is partially missing, assume: full gym equipment; strength + hypertrophy mix; 3-4 sessions/week.
- Avoid clarification loops; do not re-ask what is already in LOGGED TRAINING or structured blocks.
- Keep the tone supportive and concise.
- Avoid vague "based on your data"; when citing logs, prefer "based on your recent logged sessions".

${trainingSummary.totalWorkouts > 0 ? `${context}\n${insightsBlock ? insightsBlock : ""}\n` : ""}
User question:
${message}
`;
      break;
    case "analysis":
    default:
      if (questionKind === "memory_continuity") {
        input = `
You are answering a thread / memory continuity question — training logs are secondary unless the user explicitly linked them.

${routingPreamble}

Hard rules:
- Follow MEMORY CONTEXT and EXACT THREAD ACCESS. Never invent prior chat content.
- If exactThreadLoaded is false, be explicit that you may not have the full prior thread.
- Quote or paraphrase only what appears in RECENT CHAT when the user asked what was said.

User question:
${message}

Reply in 2–4 short sentences unless they asked for detail.`;
      } else if (questionKind === "session_review") {
        input = `
You are an elite strength coach. The user asked about one specific logged session — answer for mobile: scannable, premium, not a written report.

${routingPreamble}

Anchoring (non-negotiable):
- Use SESSION ANCHOR only for lift names and facts: EXERCISES, SESSION STRUCTURE, RIR line, priors, SIMILAR PRIOR SESSION, RECENT SESSION ORDER (titles/dates).
- Do not name exercises outside EXERCISES. Ignore exerciseTrends, trainingInsights lists, digest exercise lines, and chat for naming lifts.
- "Introduced / newly added" only if SESSION ANCHOR explicitly allows vs the immediately prior session; otherwise say "included" or "part of the session".

DEFAULT IN-APP FORMAT (use unless the user explicitly asked for full detail, set-by-set breakdown, or "every set"):
1) Verdict: one short opening line (plain sentence, no "A)" prefix) — session type + headline takeaway.
2) Blank line.
3) Bullets: exactly 3–4 lines, each starting with "- ". One idea per bullet; max ~18 words. Reference only numbers that matter — do not restate every set. Apply INFERENCE & CERTAINTY: separate logged facts from guesses (e.g. rep drop = fact; "fatigue" = hedged).
4) Blank line.
5) Next step: one line starting with "Next step: " — single clear action.

Layout: do not output one dense block — use blank lines between verdict, bullet list, and next step. No dash-heavy chains (avoid multiple "—" or mid-sentence "-" clauses in a row). No long paragraphs in the default layer.

Target ~80–160 words for this default block. No A), B), C); no debug tone.

OPTIONAL DEEPER LAYER (only if it adds value — after one blank line following the default block):
Use plain section titles on their own line (works without markdown rendering), then bullets:
Evidence
- Extra numeric detail only if not already implied above.

Compared to last time
- Only if SESSION ANCHOR has prior/similar data; otherwise omit this entire section.

Why this matters
- 1–2 bullets max; keep coaching implications hedged unless a note or metric in the anchor supports a stronger claim.

If the user asked for depth, you may expand within these sections — still avoid wall-of-text and lettered lists.

RIR: if anchor says none logged, do not state RIR as fact; optional "pattern from the log" phrasing for rep/load shape.

Style: direct, coach-like. Ban empty filler ("solid session", "balanced nicely", "complemented well") unless tied to a concrete anchor fact in the same breath.

${profileStr ? `User profile (constraints only): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}

User question:
${message}

If SESSION ANCHOR says data is missing, one short verdict + one bullet + next step to log/sync — no invention.`;
      } else if (questionKind === "exact_factual_recall") {
        input = `
You are answering a precise factual question about logged training.

${routingPreamble}

Hard rules:
- If EXERCISE LOG ANCHOR is present, lead with the exact numbers (date → sets) from completed sets only.
- If no anchor match, say the payload does not show that exercise; do not guess.
- Treat non-completed rows as not performed; never cite blank or zero-rep rows as reps achieved.
- Do not drift to unrelated exercises or weekly narratives unless the user asked.

${profileStr ? `User profile (constraints only): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}

User question:
${message}

Reply: number-first, 2–5 short sentences.`;
      } else if (questionKind === "exercise_progression") {
        input = `
You are analyzing progression for one lift using logs.

${routingPreamble}

Hard rules:
- EXERCISE LOG ANCHOR is primary: compare the most recent sessions shown there (dates + loads/reps).
- You may supplement with exerciseTrends / exerciseInsights rows ONLY for the same exercise name if present; do not switch to a different lift.
- State what changed (load, reps, set count) or that the log is too thin — label inference vs fact.
- Mention consistency or within-session rep fall-off only when visible in the anchor/trends.

${trendsStr ? `${trendsBlock}` : ""}
${insightsBlock ? `\n${insightsBlock}` : ""}
${profileStr ? `User profile (constraints only): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}

User question:
${message}

Reply in plain language: specific, coach-like, minimal filler.`;
      } else if (questionKind === "projection_estimate") {
        input = `
You are answering a projection / estimate question (e.g. 1RM, timelines, working weights).

${routingPreamble}

Hard rules:
- Ground the answer in real logged performances from the payload (digest, exerciseTrends, bench projection block in subject when present).
- Frame timelines and maxes as estimates, not promises. Avoid overconfident dates.
- If data are sparse, say confidence is low and what extra logging would help.

${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${context}
${trendsStr ? trendsBlock : ""}

User question:
${message}

Reply: direct estimate + brief reasoning tied to logged numbers.`;
      } else if (questionKind === "volume_balance") {
        input = `
You are answering a weekly volume / balance question.

${routingPreamble}

Hard rules:
- Use trainingInsights weekly volume / frequency and trainingSummary figures verbatim where provided; those counts reflect completed logged sets in the app window.
- Name muscle groups with very low or zero logged sets as potentially under-sampled in the app, not necessarily "weak".
- Tie recommendations to the user’s stated goal/profile when available; avoid generic "watch recovery" unless logs justify it.

${insightsBlock ? `${insightsBlock}` : ""}
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${context}

User question:
${message}

Reply: specific numbers first, then 1–2 practical implications.`;
      } else if (questionKind === "coaching_recommendation") {
        input = `
You are giving a coaching recommendation grounded in their logs.

${routingPreamble}

Hard rules:
- Start with a clear recommendation (what to do next session or how to adjust load/intensity).
- Explain why in 1–2 sentences using log facts; if EXERCISE LOG ANCHOR exists, prioritize it over unrelated trends.
- Calibrate confidence: sparse history → say what you are unsure about.
- Do not list unrelated exercises unless they are clearly tied to the same bottleneck.

${coachAuthorityBlock}
${evidenceDrivenReasoningBlock}
${insightsBlock ? `${insightsBlock}` : ""}
${trendsStr ? trendsBlock : ""}
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}
${context}

User question:
${message}

Reply: decisive, specific, calm tone — no vague praise without numbers.`;
      } else if (effectiveIntent === "recent_training_analysis") {
        input = `
You are an elite strength coach: diagnose system constraints, prescribe fixes — not generic fitness explanation.

${routingPreamble}
${reasoningBaseBlock}
${coachAuthorityBlock}
${evidenceDrivenReasoningBlock}
${insightsBlock}
${trendsBlock}
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints (use only as hard constraints): ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Training context (totals and recent exercise names):
${context}

User question:
${message}

Answer in plain language. 3–4 sentences; ~15–18 words each; one new idea per sentence; structure: progress → limiter → if unchanged → fix.
Answer format:
- one thing going well
- one limiting factor or watch item
- one next step
- use the three analysis anchors below explicitly; do not replace them with generic RIR advice unless the top issue is RIR/effort related.
- Stay on the user’s question; cite the smallest set of exercises that actually answers it — avoid unrelated “also your X” drift.

Target style example:
"Your training is progressing well overall. Bench press is improving and frequency is consistent. Back volume is slightly low relative to your goal, so increasing it gradually would help keep progress balanced."

${analysisInputsBlock}
`;
      } else if (effectiveIntent === "coach_explanation") {
        input = `
You are an elite strength coach. The user wants an explanation of what the coach output means—not a fresh week-wide diagnosis.

${routingPreamble}

${coachStructuredOutput ? coachAuthorityBlock : "No coach structured output is available; say so briefly and answer from profile + general principles only."}

${evidenceDrivenReasoningBlock}

TASK: Explain the existing coach decisions and suggestions using the evidence cards when present. Tie mechanisms to evidence. Do not invent new diagnoses beyond coachStructuredOutput + evidence.
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}
${context}

User question:
${message}

Answer in plain language. 3–5 short sentences. Focus on "why" the coach said what it said.
`;
      } else if (effectiveIntent === "template_review") {
        input = `
You are an elite strength coach. The user is asking about workout templates, programs, splits, or routines.

${routingPreamble}

${templateReviewBlock}
${profileStr ? `User profile (may inform recommendations): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Optional context — only reference if it helps compare template ideas to their setup (do not replace answering their template question):
${context}

User question:
${message}

Answer directly about templates/programs. If template data was missing above, ask clearly for the missing details before reviewing. Do not default to recent-session training analysis.
`;
      } else if (effectiveIntent === "exercise_question") {
        input = `
You are an elite strength coach.

${routingPreamble}

Answer the exercise question directly. Use profile and training log only when clearly relevant; do not force unrelated weekly-volume commentary.
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Training context (use only if relevant):
${context}
${insightsBlock ? `${insightsBlock}` : ""}
${trendsStr ? trendsBlock : ""}

User question:
${message}

Reply in plain language, concise (3–5 sentences unless they asked for detail).
`;
      } else if (effectiveIntent === "goal_question") {
        input = `
You are an elite strength coach.

${routingPreamble}

Answer about goals, phases (bulk/cut), strength vs hypertrophy, or priorities. Use profile when helpful. Do not open with unrelated weekly log analysis unless the question ties to it.
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Training context (optional, only if relevant):
${context}

User question:
${message}

Reply in plain language, concise.
`;
      } else {
        /* general_training_question */
        input = `
You are an elite strength coach.

${routingPreamble}

Answer the question normally. You may use training context below only when it directly helps—do not lead with or default to "your training this week" unless the question calls for it.
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Training context (optional reference):
${context}
${insightsBlock ? `\n${insightsBlock}` : ""}
${trendsStr ? trendsBlock : ""}

User question:
${message}

Reply in plain language. Prefer 3–5 concise sentences unless the user asks for more.
`;
      }
      break;
  }

  const profileHint = userProfile
    ? {
        lowerBodyPriority: userProfile.lowerBodyPriority,
        trainingPrioritiesText: userProfile.trainingPrioritiesText,
      }
    : undefined;

  const selectiveMemoryBlock =
    assistantMemory != null
      ? buildSelectiveMemoryBlock({ memory: assistantMemory, profileHint })
      : "- None saved yet";

  const recentChatLines =
    (recentConversationMemory ?? [])
      .slice(-6)
      .map((t) => {
        const c = (t.content ?? "").replace(/\s+/g, " ").trim();
        const trimmed = c.length > 220 ? `${c.slice(0, 220)}…` : c;
        return `${t.role}: ${trimmed}`;
      })
      .filter(Boolean) ?? [];

  const recentConversationBlock = recentChatLines.length
    ? recentChatLines.join("\n")
    : "- None";

  const exactThreadAccessBlock = `
EXACT THREAD ACCESS (truthfulness gating):
- exactThreadLoaded = ${exactThreadLoaded === true ? "true" : "false"}

Rules:
- If exactThreadLoaded is false, do NOT claim you remember verbatim details from a previous thread that is not loaded.
- For questions like "Do you remember our last chat about X?":
  - If exactThreadLoaded is true: you may answer only if the RECENT CHAT snippet contains X (or clearly references it).
  - If exactThreadLoaded is false: say you don't have the exact prior thread loaded right now, but you can still help using saved preferences + current training/profile context.
`.trim();

  const memoryContextBlock =
    effectiveIntent === "session_review"
      ? `
MEMORY CONTEXT (session review — saved preferences only):
${selectiveMemoryBlock}

RECENT CHAT: intentionally omitted for this request so prior topics cannot add exercises that are not in SESSION ANCHOR.

${exactThreadAccessBlock}
`.trim()
      : questionKind === "memory_continuity"
        ? `
MEMORY CONTEXT (thread / continuity mode):
${selectiveMemoryBlock}

RECENT CHAT (authoritative for thread-memory questions — quote only what appears here):
${recentConversationBlock}

${exactThreadAccessBlock}

Rules:
- Do not claim exact prior-chat memory unless exactThreadLoaded is true and the snippet supports it.
- App training logs are separate from chat memory; do not conflate them when the user asked about the conversation.
`.trim()
        : `
MEMORY CONTEXT (preferences only; workout + profile override):
${selectiveMemoryBlock}

RECENT CHAT (thread continuity; brief):
${recentConversationBlock}

${exactThreadAccessBlock}
`.trim();

  console.log("[memory-debug] retrieved for request", {
    selectiveMemoryBlock,
    recentConversationTurns: (recentConversationMemory ?? []).slice(-6).map((t) => t.role),
  });

  const activeExerciseBlock = activeExerciseTopic
    ? `Active exercise topic (lock): ${activeExerciseTopic}\n${
        activeExerciseLastSession
          ? `Last logged session for this exercise: ${activeExerciseLastSession.completedAt}\n- Best set: ${
              activeExerciseLastSession.bestSet
                ? `${activeExerciseLastSession.bestSet.weight}×${activeExerciseLastSession.bestSet.reps}`
                : "n/a"
            }\n- Last set: ${
              activeExerciseLastSession.lastSet
                ? `${activeExerciseLastSession.lastSet.weight}×${activeExerciseLastSession.lastSet.reps}`
                : "n/a"
            }${
              (activeExerciseLastSession.unloggedSetCount ?? 0) > 0
                ? `\n- Unlogged/incomplete sets in that session: ${activeExerciseLastSession.unloggedSetCount}`
                : ""
            }`
          : "- Last session data: missing"
      }`
    : "Active exercise topic (lock): none\n- Last session data: missing";

  const benchProjectionBlock = benchProjection
    ? `Bench projection data (rough estimate; use as inference from recent logs):\n- Target: ${benchProjection.target1RM}${benchProjection.payloadUnit}\n- Current estimated 1RM: ~${benchProjection.currentEstimated1RM}${benchProjection.payloadUnit}\n- Recent e1RM step: ~${benchProjection.deltaE1RMPerSession}${benchProjection.payloadUnit} per progression signal\n- Sessions estimate: ${benchProjection.sessionsEstimate}\n- Working-weight guide for a ${benchProjection.payloadUnit} target:\n${benchProjection.workingWeights
        .map((w) => `  - ${w.reps} reps: ${w.weight}${benchProjection.payloadUnit}`)
        .join("\n")}`
    : "Bench projection data: none";

  const conversationSubjectBlock =
    effectiveIntent === "session_review"
      ? `
SESSION REVIEW — ANCHOR (overrides active exercise lock, bench projection, and normal conversation subject lock):

${sessionReviewAnchorBlock}
`.trim()
      : exerciseLogAnchorBlock
        ? `
EXERCISE LOG — ANCHOR (overrides active exercise topic lock and bench projection for this turn when they conflict with the named exercise below):

${exerciseLogAnchorBlock}

Rules:
- The user’s message + EXERCISE LOG ANCHOR outrank stale UI topic carryover: answer for the locked exercise above.
- Use only completed sets as performance; cite dates from the anchor when comparing to prior sessions.
`.trim()
        : `
CONVERSATION SUBJECT LOCK (prevents topic drift):
${activeExerciseBlock}
Rule: If the user asks a follow-up about the current active exercise, anchor your entire answer to it. Do not switch to another exercise just because it has a recent signal.

If the user requests exact last-session reps/weights for the active exercise and the payload includes last-session data, answer using the exact best/last set values (no vague summary).

${benchProjectionBlock}`.trim();

  const finalInput = `${loggedDataPreamble.trim()}\n\n${conversationSubjectBlock}\n\n${input.trim()}\n\n${memoryContextBlock}\n\n---\nTRUST & CALIBRATION (apply to your reply):\n${TRUST_AND_CALIBRATION_BLOCK}\n\n---\nINFERENCE & CERTAINTY (apply to your reply):\n${INFERENCE_CERTAINTY_BLOCK}\n\n---\n${GLOBAL_REPLY_DISCIPLINE_BLOCK}`;

  const response = await openai.responses.create({
    model: "gpt-4.1-mini",
    input: finalInput,
  });

  const reply = response.output_text?.trim();
  if (!reply) throw new Error("Empty response from model");
  return reply;
}

function formatIsoDate(iso: string | undefined): string {
  if (!iso) return "unknown date";
  if (typeof iso !== "string") return "unknown date";
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

type ThreadMessageForDeterministic = { role: "user" | "assistant"; content: string };

function normalizeForThreadMatch(s: string): string {
  return (s ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tryBuildDeterministicThreadReferenceReply(params: {
  message: string;
  threadMessages: ThreadMessageForDeterministic[] | undefined;
  exactThreadLoaded: boolean | undefined;
}): string | null {
  const m = normalizeForThreadMatch(params.message);
  const history = (params.threadMessages ?? []).filter(
    (t): t is ThreadMessageForDeterministic => Boolean(t && t.role && typeof t.content === "string")
  );
  if (!history.length) return null;

  const exactThreadLoaded = Boolean(params.exactThreadLoaded);

  // Helper: locate where the "current question" sits in the history snippet.
  const currentUserIdx = (() => {
    const target = normalizeForThreadMatch(params.message);
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user" && normalizeForThreadMatch(history[i].content) === target) return i;
    }
    // Fallback: assume the last user message is the current question.
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === "user") return i;
    }
    return -1;
  })();

  const getLastUserBefore = (idx: number): ThreadMessageForDeterministic | undefined => {
    for (let i = idx - 1; i >= 0; i--) if (history[i].role === "user") return history[i];
    return undefined;
  };
  const getSecondLastUserBefore = (idx: number): ThreadMessageForDeterministic | undefined => {
    let seen = 0;
    for (let i = idx - 1; i >= 0; i--) {
      if (history[i].role === "user") {
        seen += 1;
        if (seen === 2) return history[i];
      }
    }
    return undefined;
  };
  const getLastAssistantBefore = (idx: number): ThreadMessageForDeterministic | undefined => {
    for (let i = idx - 1; i >= 0; i--) if (history[i].role === "assistant") return history[i];
    return undefined;
  };

  const asksLastMessage = /\bwhat\s+was\s+my\s+last\s+message\b/.test(m) || /\blast\s+message\b/.test(m);
  const asksBeforeThat = /\bone\s+before\s+that\b|\bthe\s+one\s+before\s+that\b/.test(m);
  const asksWhatWereWeDiscussing = /\bwhat\s+were\s+we\s+just\s+discussing\b|\bwhat\s+were\s+we\s+discussing\b/.test(m);

  if (asksLastMessage || asksBeforeThat || asksWhatWereWeDiscussing) {
    if (currentUserIdx < 0) return null;
    if (asksBeforeThat) {
      const second = getSecondLastUserBefore(currentUserIdx);
      if (!second) return "I can’t see that far back in the loaded thread snippet.";
      return `The one before that (your message): ${second.content}`;
    }
    if (asksWhatWereWeDiscussing) {
      const lastAssistant = getLastAssistantBefore(currentUserIdx);
      if (!lastAssistant) return "I don’t see an assistant reply just before that in the loaded thread snippet.";
      return `We were just discussing (assistant’s last message): ${lastAssistant.content}`;
    }
    // default: last message
    const lastUser = getLastUserBefore(currentUserIdx);
    if (!lastUser) return "I can’t see your previous message in the loaded thread snippet.";
    return `Your last message: ${lastUser.content}`;
  }

  // Truthful memory question: "Do you remember our last chat about RIR?"
  const asksRememberLastChat = /\bdo\s+you\s+remember\b/.test(m) && /\b(last\s+chat|our\s+last\s+chat|previous\s+chat)\b/.test(m);
  if (asksRememberLastChat) {
    // Extract a coarse topic after "about ..."
    const topicMatch = params.message.match(/about\s+([^?]+)/i);
    const topicRaw = topicMatch?.[1]?.trim() ?? "";
    const topicLower = normalizeForThreadMatch(topicRaw);

    // Also search for a few common training-keywords if we didn't get "about X".
    const fallbackTopics = ["rir", "rpe", "reps in reserve", "bench", "pb", "squat", "deadlift", "hammer curl"];
    const inferredTopic =
      topicLower ||
      fallbackTopics.find((k) => m.includes(normalizeForThreadMatch(k))) ||
      "";

    const includesTopic = inferredTopic
      ? history.some((t) => normalizeForThreadMatch(t.content).includes(inferredTopic))
      : false;

    if (!exactThreadLoaded) {
      return inferredTopic
        ? `I don’t have the exact previous thread loaded here, so I can’t confirm verbatim—but I can still help using your saved preferences and your current training data (if it relates to "${topicRaw.trim() || inferredTopic}").`
        : `I don’t have the exact previous thread loaded here, so I can’t confirm verbatim—but I can still help using your saved preferences and your current training data.`;
    }

    if (includesTopic) {
      const snippet = history
        .map((t) => t.content)
        .find((c) => (inferredTopic ? normalizeForThreadMatch(c).includes(inferredTopic) : false));
      const trimmedSnippet = snippet ? snippet.slice(0, 160).trim() : undefined;
      return trimmedSnippet
        ? `Yes. In our loaded chat snippet, you mentioned something about "${topicRaw.trim() || inferredTopic}". ${trimmedSnippet}${
            trimmedSnippet.length >= 160 ? "…" : ""
          }`
        : `Yes—you mentioned "${topicRaw.trim() || inferredTopic}" in the loaded thread snippet.`;
    }

    return `I can see the loaded thread snippet here, but I don’t see "${topicRaw.trim() || inferredTopic}" in the snippet I have access to right now.`;
  }

  return null;
}

function tryBuildDeterministicExerciseReply(params: {
  message: string;
  activeExerciseLastSession: AssistantBody["activeExerciseLastSession"] | undefined;
}): string | null {
  const m = params.message.toLowerCase();
  const lastTimeRequested =
    /(last time|last session|most recent|last logged)/.test(m) ||
    (m.includes("last") && (m.includes("reps") || m.includes("weight")));

  const asksForExact =
    /(what reps|what weight|weight and reps|what did i|i did|i achieve)/.test(m) ||
    /(reps?\s+(did|i)|weight.*reps|weight and reps)/.test(m) ||
    (/(what happened|how did it go)/.test(m) && /(last|most recent)/.test(m));

  if (!lastTimeRequested || !asksForExact) return null;
  const data = params.activeExerciseLastSession;
  if (!data) return null;
  const best = data.bestSet;
  const lastSet = data.lastSet;
  if (!best || !lastSet) return null;

  const date = formatIsoDate(data.completedAt);
  const unloggedLine =
    (data.unloggedSetCount ?? 0) > 0
      ? `\nC) ${data.unloggedSetCount} set${data.unloggedSetCount === 1 ? "" : "s"} in that session appear unlogged/incomplete, so they are not counted as completed performance.`
      : "";
  return `A) Your last ${data.exerciseName} session was logged on ${date}.\nB) Logged completed sets: best set ${best.weight}×${best.reps}; last completed set ${lastSet.weight}×${lastSet.reps}.${unloggedLine}\nD) Use the completed logged sets as your baseline for progression.`;
}

function tryBuildDeterministicBenchProjectionReply(params: {
  message: string;
  benchProjection: AssistantBody["benchProjection"] | undefined;
}): string | null {
  const m = params.message.toLowerCase();
  const benchish = /\bbench\b|pb|bench press|barbell bench/.test(m);
  const asksWhen =
    /(when|expect|timeline|when can i|how soon|can i expect)/.test(m) ||
    (m.includes("expect") && m.includes("bench"));
  const asksWorking =
    /(working weight|working weights|what would my working weights|what weight.*reps|reps need|working weights\/reps)/.test(m) ||
    m.includes("working weights") ||
    m.includes("working weight");

  if (!benchish || !(asksWhen || asksWorking)) return null;
  const p = params.benchProjection;
  if (!p) return null;

  const target = `${p.target1RM}${p.payloadUnit}`;
  const current = `${p.currentEstimated1RM}${p.payloadUnit}`;
  const sessions = p.sessionsEstimate;

  const working = p.workingWeights
    .slice(0, 3)
    .map((w) => `${w.weight}${p.payloadUnit}×${w.reps} reps`)
    .join(", ");

  const mentionsTemplates = /template|templates|program|routine|split/.test(m);
  const templateLine = mentionsTemplates
    ? `D) Apply this to your template’s bench working sets: aim for those rep targets at those weights (still an estimate).`
    : "";

  return `A) Best current read (estimate): based on your recent logged bench best sets, your estimated 1RM is ~${current}.\nB) To reach ${target}, a rough estimate is about ${sessions} more bench sessions with similar progression and recovery.\nC) Working-weight guide (estimate): ${working}.${templateLine}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as AssistantBody;
    const {
      message,
      trainingSummary,
      trainingFocus,
      experienceLevel,
      unit,
      priorityGoal,
      exerciseTrends,
      trainingInsights,
      priorityGoalExerciseInsight: rawPriorityGoalInsight,
      coachStructuredOutput: rawCoach,
      evidenceCards: rawEvidence,
      templatesSummary: rawTemplatesSummary,
      userProfile,
      coachingContext,
      assistantMemory,
      recentConversationMemory,
      thread_id,
      threadMessages,
      exactThreadLoaded,
      activeExerciseTopic,
      activeExerciseLastSession,
      benchProjection,
    } = body;

    const templatesSummary =
      typeof rawTemplatesSummary === "string" ? rawTemplatesSummary : undefined;
    const templateDataAvailable = Boolean(templatesSummary?.trim());

    const coachStructuredOutput = isCoachStructuredOutput(rawCoach) ? rawCoach : undefined;
    const evidenceCards =
      coachStructuredOutput != null
        ? sanitizeEvidenceCards(rawEvidence).filter((c) =>
            referencedEvidenceIds(coachStructuredOutput).has(c.id)
          )
        : [];

    if (typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "message is required and must be a non-empty string." },
        { status: 400 }
      );
    }
    if (trainingSummary == null || typeof trainingSummary !== "object") {
      return NextResponse.json(
        { error: "trainingSummary is required." },
        { status: 400 }
      );
    }

    const trimmedMessage = message.trim();
    console.log("[thread-debug] assistant request", {
      threadId: thread_id,
      exactThreadLoaded: Boolean(exactThreadLoaded),
      threadMessagesLength: Array.isArray(threadMessages) ? threadMessages.length : 0,
      recentConversationTurnsLength: Array.isArray(recentConversationMemory) ? recentConversationMemory.length : 0,
    });
    // Deterministic fast-paths for exact exercise questions + bench projections.
    const deterministic =
      tryBuildDeterministicThreadReferenceReply({
        message: trimmedMessage,
        threadMessages,
        exactThreadLoaded,
      }) ??
      tryBuildDeterministicExerciseReply({
        message: trimmedMessage,
        activeExerciseLastSession,
      }) ??
      tryBuildDeterministicBenchProjectionReply({
        message: trimmedMessage,
        benchProjection,
      });
    if (deterministic) {
      return NextResponse.json({ reply: deterministic } satisfies AssistantResponse);
    }
    const questionKind = classifyAssistantQuestionKind(trimmedMessage);
    const intent = mapQuestionKindToLegacyIntent(questionKind) as AssistantIntent;
    const hasWorkoutData =
      (Number(trainingSummary.totalWorkouts) || 0) > 0 ||
      (Number(trainingSummary.totalSets) || 0) > 0;
    const hasCoachAnalysis = coachStructuredOutput != null;
    const hardAnalysisPhrases = [
      "how is my training",
      "how is my training looking",
      "how is this week",
      "how am i doing",
      "how are my workouts",
      "thoughts on my training",
      "thoughts on my volume",
      "overall volume",
    ];
    const hardAnalysisMatch =
      hasWorkoutData &&
      hardAnalysisPhrases.some((phrase) =>
        trimmedMessage.toLowerCase().includes(phrase)
      );
    const modeDetection = detectAssistantModeWithReason({
      message: trimmedMessage,
      hasWorkoutData,
      hasCoachAnalysis,
    });
    const parsedContext = parseContextFromMessage(trimmedMessage);
    const minimumContextPresent = hasMinimumViableContext(parsedContext);
    const seemsProgramRequest =
      /\b(split|program|plan|routine|training plan|workout plan|how should i train|what should i do)\b/.test(
        trimmedMessage.toLowerCase()
      );
    const shouldForceAdvisory =
      !hasWorkoutData && (minimumContextPresent || seemsProgramRequest);
    let mode: AssistantMode = hardAnalysisMatch
      ? "analysis"
      : shouldForceAdvisory
        ? "advisory"
        : modeDetection.mode;
    const analysisPreferredKinds: AssistantQuestionKind[] = [
      "session_review",
      "exact_factual_recall",
      "exercise_progression",
      "projection_estimate",
      "volume_balance",
      "coaching_recommendation",
      "memory_continuity",
    ];
    if (intent === "session_review" || analysisPreferredKinds.includes(questionKind)) {
      mode = "analysis";
    }
    console.log("[assistant] intent:", intent, "questionKind:", questionKind, "templateDataAvailable:", templateDataAvailable);
    console.log("[assistant mode]", mode);
    console.log("[assistant mode check]", {
      message: trimmedMessage,
      detectedMode: mode,
      hasWorkoutData,
    });
    console.log("[assistant mode detail]", {
      mode,
      reason: modeDetection.reason,
      hasWorkoutData,
      minimumContextPresent,
      shouldForceAdvisory,
    });
    if (hardAnalysisMatch) {
      console.log("[assistant mode override]", {
        message: trimmedMessage,
        override: "analysis",
        reason: "hard_analysis_phrase_match_with_workout_data",
      });
    }

    const recentDigest = formatRecentWorkoutsDigest(
      coachingContext && typeof coachingContext === "object" && "recentWorkouts" in coachingContext
        ? (coachingContext as { recentWorkouts?: unknown }).recentWorkouts
        : undefined
    );
    const loggedDataPreamble = buildLoggedTrainingPreamble({
      hasWorkoutData,
      totalWorkouts: Number(trainingSummary.totalWorkouts) || 0,
      recentDigest: recentDigest.text,
      recentCount: recentDigest.count,
      coachingContext,
    });

    console.log("[assistant-context-debug]", {
      hasWorkoutData,
      totalWorkouts: Number(trainingSummary.totalWorkouts) || 0,
      recentWorkoutsDigestCount: recentDigest.count,
      priorityGoalIncluded: Boolean(priorityGoal),
      userProfileIncluded: Boolean(userProfile),
      coachingContextIncluded: Boolean(coachingContext),
      inferredIncluded: Boolean(
        coachingContext &&
          typeof coachingContext === "object" &&
          "inferred" in coachingContext &&
          (coachingContext as { inferred?: unknown }).inferred
      ),
      coachReviewBriefIncluded: Boolean(
        coachingContext &&
          typeof coachingContext === "object" &&
          "coachReviewBrief" in coachingContext &&
          (coachingContext as { coachReviewBrief?: unknown }).coachReviewBrief
      ),
      trainingInsightsIncluded: Boolean(trainingInsights),
      exerciseTrendsCount: Array.isArray(exerciseTrends) ? exerciseTrends.length : 0,
      coachStructuredIncluded: Boolean(coachStructuredOutput),
      intent,
      questionKind,
      mode,
    });

    const priorityGoalExerciseInsight =
      rawPriorityGoalInsight != null &&
      typeof rawPriorityGoalInsight === "object" &&
      typeof (rawPriorityGoalInsight as { exercise?: unknown }).exercise === "string"
        ? (rawPriorityGoalInsight as NonNullable<AssistantBody["priorityGoalExerciseInsight"]>)
        : undefined;

    console.log("[assistant-debug] payload RIR fields:", {
      averageRIR: trainingInsights?.averageRIR,
      recentHighEffortExercises: trainingInsights?.recentHighEffortExercises,
      priorityGoalExerciseRir: priorityGoalExerciseInsight && {
        exercise: priorityGoalExerciseInsight.exercise,
        avgRIR: priorityGoalExerciseInsight.avgRIR,
        latestSessionAvgRIR: priorityGoalExerciseInsight.latestSessionAvgRIR,
        latestSessionAllSetsToFailure: priorityGoalExerciseInsight.latestSessionAllSetsToFailure,
      },
    });

    const reply = await getAssistantReply(
      loggedDataPreamble,
      trimmedMessage,
      intent,
      questionKind,
      mode,
      templateDataAvailable,
      templatesSummary,
      {
        totalWorkouts: Number(trainingSummary.totalWorkouts) || 0,
        totalExercises: Number(trainingSummary.totalExercises) || 0,
        totalSets: Number(trainingSummary.totalSets) || 0,
        weeklyVolume: trainingSummary.weeklyVolume ?? {},
        recentExercises: Array.isArray(trainingSummary.recentExercises)
          ? trainingSummary.recentExercises
          : [],
      },
      { trainingFocus, experienceLevel, unit, priorityGoal },
      userProfile,
      assistantMemory,
      recentConversationMemory,
      exactThreadLoaded,
      activeExerciseTopic,
      activeExerciseLastSession,
      benchProjection,
      coachingContext,
      exerciseTrends ?? [],
      trainingInsights,
      priorityGoalExerciseInsight,
      coachStructuredOutput,
      evidenceCards
    );

    return NextResponse.json({ reply } satisfies AssistantResponse);
  } catch (err) {
    console.error("Assistant route error:", err);
  
    const message = err instanceof Error ? err.message : "Invalid request.";
    const status =
      message.includes("OPENAI") || message.includes("Empty response") ? 500 : 400;
  
    return NextResponse.json({ error: message }, { status });
  }
}
