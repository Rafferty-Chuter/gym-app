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
  type AssistantThreadTurn,
} from "@/lib/assistantQuestionRouting";
import { buildAssistantEvidenceScopeBlock } from "@/lib/assistantAnswerScope";
import type { BenchContextSummary } from "@/lib/benchContext";
import type { Bench1RMEstimate } from "@/lib/bench1rm";
import {
  buildWorkout,
  type WorkoutBuilderGoal,
  type RecoveryMode,
} from "@/lib/workoutBuilder";
import type { SessionType } from "@/lib/sessionTemplates";

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
    target1RM?: number;
    payloadUnit: "kg" | "lb";
    benchExerciseName: string;
    /** Canonical max-of-recent-sessions e1RM — model must not contradict with a separate “current 1RM”. */
    authoritativeEstimated1RM: number;
    currentEstimated1RM: number;
    estimateBasisLine: string;
    progressionDeltaKgPerSession: number | null;
    progressionDeltaExplanation: string;
    sessionsEstimate: number | null;
    gapToTarget: number | null;
    workingWeights?: Array<{ reps: number; weight: number }>;
    recentBestSets: Array<{ completedAt: string; weight: number; reps: number; e1rm?: number }>;
    heavyDay: {
      topSetKgMin: number;
      topSetKgMax: number;
      repRangeLabel: string;
      loggedTieIn: string;
    };
    heavyAnchor?: { completedAt: string; weight: number; reps: number; rir?: number };
    volumeDay: {
      workingKgMin: number;
      workingKgMax: number;
      repRangeLabel: string;
      setsHint: string;
      loggedTieIn: string;
    };
    volumeAnchor?: { completedAt: string; weight: number; reps: number; rir?: number } | null;
    readinessLines: string[];
    evidenceScopeLine?: string;
    concreteHeavy?: { loggedBenchmark: string; nearerTargetBand: string };
    concreteVolume?: { loggedBenchmark: string; nearerTargetBand: string };
    readinessSignals?: string[];
    coachFacing?: {
      evidenceLead: string;
      bestCurrentRead: string;
      heavyBenchDay: string;
      volumeBenchDay: string;
      whenTargetLooksRealistic: string;
      nextMove: string;
    };
    subsectionEvidenceLock?: string;
  };
  benchContext?: BenchContextSummary;
  benchEstimate?: Bench1RMEstimate;
};

export type AssistantResponse = {
  reply: string;
  structuredWorkout?: {
    sessionTitle: string;
    sessionGoal: string;
    purposeSummary: string;
    exercises: Array<{
      slot: string;
      exercise: string;
      sets: string;
      reps: string;
      rir: string;
      rest: string;
      rationale: string;
    }>;
    note: string;
  };
  structuredProgramme?: {
    programmeTitle: string;
    programmeGoal: string;
    notes: string;
    days: Array<{
      dayLabel: string;
      sessionType: string;
      purposeSummary: string;
      exercises: Array<{
        slotLabel: string;
        exerciseName: string;
        sets: string;
        reps: string;
        rir: string;
        rest: string;
        rationale: string;
      }>;
    }>;
  };
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

function inferSessionTypeFromMessage(message: string): SessionType | null {
  const t = message.toLowerCase();
  if (/\blegs?\b|\bleg day\b|\blower body\b/.test(t)) return "legs";
  if (/\bpush\b|\bpush day\b/.test(t)) return "push";
  if (/\bpull\b|\bpull day\b/.test(t)) return "pull";
  if (/\bchest\b/.test(t)) return "chest";
  if (/\bback\b/.test(t)) return "back";
  if (/\bshoulders?\b|\bdelts?\b/.test(t)) return "shoulders";
  if (/\barms?\b/.test(t)) return "arms";
  if (/\bupper\b/.test(t)) return "upper";
  if (/\blower\b/.test(t)) return "lower";
  if (/\bfull[\s-_]?body\b|\bfull workout\b/.test(t)) return "full_body";
  return null;
}

function inferSessionTypeFromContext(args: {
  message: string;
  coachingContext?: CoachingContext;
}): SessionType {
  const explicit = inferSessionTypeFromMessage(args.message);
  if (explicit) return explicit;
  const split = args.coachingContext?.inferred?.split ?? "";
  const s = split.toLowerCase();
  if (s.includes("push_pull_legs")) return "push";
  if (s.includes("upper_lower")) return "upper";
  if (s.includes("full_body")) return "full_body";
  return "upper";
}

function inferWorkoutBuilderGoal(
  message: string,
  priorityGoal?: string
): WorkoutBuilderGoal {
  const t = message.toLowerCase();
  const p = (priorityGoal ?? "").toLowerCase();
  if (/\bbench\b/.test(t) || p.includes("bench")) return "bench_strength_emphasis";
  if (/\bchest\b/.test(t) || p.includes("chest")) return "chest_emphasis";
  if (/\bstrength\b/.test(t) || p.includes("strength")) return "improve_overall_strength";
  if (/\bhypertrophy\b|\bmuscle\b/.test(t) || p.includes("hypertrophy")) return "build_overall_muscle";
  if (/\bupper\b/.test(t)) return "upper_body_emphasis";
  return "balanced";
}

function inferEquipmentFromParsed(parsed: ParsedContext): string[] {
  if (parsed.equipment === "minimal") return ["bodyweight", "dumbbells", "bench", "floor"];
  if (parsed.equipment === "home") return ["barbell", "rack", "bench", "dumbbells", "pullup_bar"];
  return [
    "barbell",
    "rack",
    "bench",
    "dumbbells",
    "cable_machine",
    "pullup_bar",
    "leg_curl_machine",
    "leg_extension_machine",
  ];
}

function renderBuiltWorkoutReply(workout: ReturnType<typeof buildWorkout>): string {
  const lines: string[] = [`Session: ${workout.purposeSummary}`, "", "Workout:", ""];
  for (const [idx, ex] of workout.exercises.entries()) {
    lines.push(`${idx + 1}) ${ex.slotLabel}`);
    lines.push(`- Exercise: ${ex.exerciseName}`);
    lines.push(
      `- Prescription: ${ex.sets.min}-${ex.sets.max} sets · ${ex.repRange.min}-${ex.repRange.max} reps · ${ex.rirRange.min}-${ex.rirRange.max} RIR · ${ex.restSeconds.min}-${ex.restSeconds.max}s rest`
    );
    lines.push("");
  }
  const practical =
    workout.notes[0] ??
    workout.warnings[0] ??
    "Run compounds first, then accessories, and keep execution quality high.";
  lines.push(`Practical note: ${practical}`);
  if (workout.warnings.length > 0) {
    lines.push("");
    lines.push("Watch-outs:");
    for (const warning of workout.warnings.slice(0, 2)) {
      lines.push(`- ${warning}`);
    }
  }
  return lines.join("\n");
}

function toStructuredWorkout(workout: ReturnType<typeof buildWorkout>): NonNullable<AssistantResponse["structuredWorkout"]> {
  const sessionTitle = `${workout.sessionType.replace("_", " ")} workout`;
  const sessionGoal = workout.purposeSummary;
  const note =
    workout.notes[0] ??
    workout.warnings[0] ??
    "Run compounds first, then accessories, and keep execution quality high.";
  return {
    sessionTitle,
    sessionGoal,
    purposeSummary: workout.purposeSummary,
    exercises: workout.exercises.map((ex) => ({
      slot: ex.slotLabel,
      exercise: ex.exerciseName,
      sets: `${ex.sets.min}-${ex.sets.max}`,
      reps: `${ex.repRange.min}-${ex.repRange.max}`,
      rir: `${ex.rirRange.min}-${ex.rirRange.max}`,
      rest: `${ex.restSeconds.min}-${ex.restSeconds.max}s`,
      rationale: ex.rationale,
    })),
    note,
  };
}

function isProgrammeBuildRequest(message: string): boolean {
  const t = message.toLowerCase();
  return (
    /\b(program|programme|split|routine|weekly plan|full plan|training plan)\b/.test(t) ||
    /\b(push pull legs|ppl|upper lower)\b/.test(t) ||
    /\b\d+\s*(day|days)\b/.test(t)
  );
}

function buildStructuredProgramme(params: {
  message: string;
  priorityGoal?: string;
  recoveryMode: RecoveryMode;
  equipmentAvailable: string[];
}): NonNullable<AssistantResponse["structuredProgramme"]> | null {
  const t = params.message.toLowerCase();
  const goal = inferWorkoutBuilderGoal(params.message, params.priorityGoal);
  const toDay = (dayLabel: string, sessionType: SessionType) => {
    const built = buildWorkout({
      sessionType,
      goal,
      recoveryMode: params.recoveryMode,
      equipmentAvailable: params.equipmentAvailable,
    });
    return {
      dayLabel,
      sessionType,
      purposeSummary: built.purposeSummary,
      exercises: built.exercises.map((ex) => ({
        slotLabel: ex.slotLabel,
        exerciseName: ex.exerciseName,
        sets: `${ex.sets.min}-${ex.sets.max}`,
        reps: `${ex.repRange.min}-${ex.repRange.max}`,
        rir: `${ex.rirRange.min}-${ex.rirRange.max}`,
        rest: `${ex.restSeconds.min}-${ex.restSeconds.max}s`,
        rationale: ex.rationale,
      })),
    };
  };

  if (/\b(push pull legs|ppl)\b/.test(t)) {
    return {
      programmeTitle: "Push Pull Legs Programme",
      programmeGoal: "Hypertrophy-oriented weekly structure with coherent fatigue and movement coverage.",
      notes: "Run compounds first, isolate after. Keep progression small and repeatable week to week.",
      days: [
        toDay("Day 1 - Push", "push"),
        toDay("Day 2 - Pull", "pull"),
        toDay("Day 3 - Legs", "legs"),
      ],
    };
  }
  if (/\b(upper lower)\b/.test(t)) {
    return {
      programmeTitle: "Upper Lower Split",
      programmeGoal: "Balanced hypertrophy split with repeatable recovery across the week.",
      notes: "Alternate upper and lower days. Keep one rep in reserve on most working sets early in the week.",
      days: [
        toDay("Day 1 - Upper", "upper"),
        toDay("Day 2 - Lower", "lower"),
        toDay("Day 3 - Upper", "upper"),
        toDay("Day 4 - Lower", "lower"),
      ],
    };
  }
  const dayMatch = t.match(/\b([3-6])\s*(day|days)\b/);
  const dayCount = dayMatch ? Number(dayMatch[1]) : 0;
  if (dayCount >= 3) {
    const order: SessionType[] =
      dayCount === 3
        ? ["upper", "lower", "full_body"]
        : dayCount === 4
          ? ["upper", "lower", "upper", "lower"]
          : dayCount === 5
            ? ["push", "pull", "legs", "upper", "lower"]
            : ["push", "pull", "legs", "upper", "lower", "full_body"];
    return {
      programmeTitle: `${dayCount}-Day Training Plan`,
      programmeGoal: "Structured weekly hypertrophy plan with balanced movement coverage.",
      notes: "Keep progression conservative. If fatigue accumulates, reduce one accessory slot before dropping compounds.",
      days: order.map((s, i) => toDay(`Day ${i + 1} - ${s.replace("_", " ")}`, s)),
    };
  }
  return {
    programmeTitle: "Structured Training Programme",
    programmeGoal: "Weekly plan generated from your prompt with coherent fatigue and movement coverage.",
    notes: "Progress with small load/rep jumps and keep execution quality high.",
    days: [toDay("Day 1 - Upper", "upper"), toDay("Day 2 - Lower", "lower")],
  };
}

function renderStructuredProgrammeText(
  programme: NonNullable<AssistantResponse["structuredProgramme"]>
): string {
  const lines: string[] = [
    `${programme.programmeTitle}`,
    programme.programmeGoal,
    "",
  ];
  for (const day of programme.days) {
    lines.push(`${day.dayLabel} (${day.sessionType})`);
    for (const ex of day.exercises) {
      lines.push(
        `- ${ex.slotLabel}: ${ex.exerciseName} — ${ex.sets} sets, ${ex.reps} reps, ${ex.rir} RIR, ${ex.rest} rest`
      );
    }
    lines.push("");
  }
  lines.push(`Note: ${programme.notes}`);
  return lines.join("\n");
}

function hasMinimumViableContext(parsed: ParsedContext): boolean {
  return Boolean(
    parsed.goal &&
      parsed.frequencyPerWeek &&
      parsed.equipment &&
      parsed.injuryStatus
  );
}

type ExplicitEvidenceAnchor = {
  id:
    | "heavy_bench"
    | "volume_bench"
    | "most_recent_session"
    | "named_session_type"
    | "named_exercise";
  label: string;
  detail: string;
};

function normalizeAnchorText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** User-explicit evidence anchor from the message: primary source hint for weighting rules. */
function detectExplicitEvidenceAnchor(
  message: string,
  activeExerciseTopic: string | undefined
): ExplicitEvidenceAnchor | null {
  const t = normalizeAnchorText(message);

  if (
    /\b(last|latest|most recent)\s+(heavy)\s+(bench|bench press|bench session|bench day)\b/.test(t) ||
    /\b(given|based)\b.*\bheavy\s+bench\b/.test(t) ||
    /\bheavy\s+bench\b.*\b(session|day)\b/.test(t)
  ) {
    return {
      id: "heavy_bench",
      label: "Explicit user anchor: heavy bench",
      detail: "Primary = heavy-bench evidence (e.g., top sets in heavy range). Volume bench can support, not replace.",
    };
  }

  if (
    /\b(last|latest|most recent)\s+(volume)\s+(bench|bench press|bench session|bench day)\b/.test(t) ||
    /\b(given|based)\b.*\bvolume\s+bench\b/.test(t) ||
    /\bvolume\s+bench\b.*\b(session|day)\b/.test(t)
  ) {
    return {
      id: "volume_bench",
      label: "Explicit user anchor: volume bench",
      detail: "Primary = volume-bench evidence (6+ rep bench exposures). Heavy bench can support, not replace.",
    };
  }

  if (
    /\b(most recent|latest|last)\s+(workout|session|day)\b/.test(t) ||
    /\bbased on my (most )?recent\b/.test(t)
  ) {
    return {
      id: "most_recent_session",
      label: "Explicit user anchor: most recent session",
      detail: "Primary = exact latest logged session they named. Wider trends only as supporting context.",
    };
  }

  if (/\b(chest and back|push pull|upper lower|legs|pull day|push day|chest day|back day)\b/.test(t)) {
    return {
      id: "named_session_type",
      label: "Explicit user anchor: named session type",
      detail: "Primary = matching session/day type in logs. Other days can support only if clearly labeled secondary.",
    };
  }

  const exerciseMention =
    t.match(
      /\b(bench press|barbell bench|bench|squat|deadlift|row|overhead press|ohp|lat pulldown|pull[- ]?up|chin[- ]?up|curl)\b/
    )?.[1] ?? null;
  if (exerciseMention || activeExerciseTopic?.trim()) {
    const ex = exerciseMention ?? activeExerciseTopic?.trim() ?? "named exercise";
    return {
      id: "named_exercise",
      label: "Explicit user anchor: named exercise",
      detail: `Primary = ${ex} evidence only; other lifts are secondary context.`,
    };
  }

  return null;
}

/**
 * Legacy intent label (logging / compatibility). Prefer `classifyAssistantQuestionKind` for routing.
 */
export function classifyAssistantIntent(message: string): AssistantIntent {
  const t = message.trim().toLowerCase();
  if (!t) return "unknown";
  return mapQuestionKindToLegacyIntent(
    classifyAssistantQuestionKind(message)
  ) as AssistantIntent;
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
- Do not use report-style labels like "A)", "B)", "C)" in user-facing text — including when a task used internal steps A/B/C; write flowing prose instead.
- Do not reuse one generic multi-section template for every question type. Follow the FORMAT HINT for this turn in the task above; only use extra headings when that hint or the Bench projection rules explicitly call for them.
- Exception (bench + projection block only): use exactly these four headings with colons as scan anchors — “Best current read:”, “Why:”, “Supporting evidence:”, “Next move:” — with brief copy under each (see FINAL RESPONSE POLISH).
- Calibrate confidence: thin logs → one short line on what you cannot know.
`.trim();

/** Applied last — writing quality and scan layout; does not override evidence or routing rules above. */
const FINAL_RESPONSE_POLISH_BLOCK = `
FINAL RESPONSE POLISH (apply before you finish — user-visible text only):

Grammar & mechanics:
- Normal sentence capitalization; capitalize exercise names and “I” only where standard English expects it. No random Title Case or mid-sentence capitals for emphasis.
- Clean punctuation (commas, periods, apostrophes); no run-ons; no half-finished trailing clauses.
- Prefer contractions where they sound natural in a coach voice (“you’re”, “it’s”) when they read smoothly.

Digestibility (mobile / in-app):
- Put the direct answer in the first line or first very short paragraph (one to two sentences max).
- Use short paragraphs: one to three sentences each; add a blank line between paragraphs so the reply is easy to scan.
- Use “- ” bullets only when they genuinely help (e.g. a few distinct numbers or takeaways). One idea per bullet; do not bullet every sentence.
- Avoid dense walls of text and avoid stacking many labeled sections unless this turn’s task explicitly requires that structure.
- If you use headings, render them cleanly with a colon (e.g., “Best current read:”) and put the content on the next line or same line consistently.

Tone:
- Sound like a polished coach: calm, specific, human — not robotic, not a slide deck, not a lab report.

Question-type fit (default shapes — tighten further if the task above says otherwise):
- Factual recall: answer first, blank line, then at most one or two short supporting lines (no extra headings).
- Session review: one-line verdict, blank line, three or four “- ” bullets, blank line, one “Next step:” line.
- Recommendation: what to do first, blank line, brief why from logs, optional single “Next:” line.
- Progression: open with improving / stable / mixed / too early to tell (pick one honest read), then two to four short sentences — no fake subsection headers.
- Bench projection (when block present): keep the four headings (“Best current read:”, “Why:”, “Supporting evidence:”, “Next move:”); at most two short sentences each unless the user asked for depth; blank line between sections; keep heavy vs volume evidence separation inside “Why:” and use “Supporting evidence:” for secondary context only.
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
  benchContext: AssistantBody["benchContext"] | undefined,
  benchEstimate: AssistantBody["benchEstimate"] | undefined,
  coachingContext: CoachingContext | undefined,
  exerciseTrends: NonNullable<AssistantBody["exerciseTrends"]>,
  trainingInsights: AssistantBody["trainingInsights"] | undefined,
  priorityGoalExerciseInsight: AssistantBody["priorityGoalExerciseInsight"],
  coachStructuredOutput: AssistantCoachStructuredOutput | undefined,
  evidenceCards: AssistantEvidenceCard[],
  priorAssistantTurnContent: string | null | undefined,
  explicitAnchor: ExplicitEvidenceAnchor | null
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
    questionKind === "coaching_recommendation" ||
    questionKind === "prior_answer_correction";

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

  const correctionTurnRule =
    questionKind === "prior_answer_correction"
      ? "- This turn is PRIOR_ANSWER_CORRECTION: the user is disputing or clarifying your last reply — follow CORRECTION MODE in the task (narrow A→D repair first). Do not repeat or restructure your entire prior answer unless they explicitly ask for the full version again.\n"
      : "";
  const explicitAnchorRule = explicitAnchor
    ? `- EXPLICIT USER ANCHOR: ${explicitAnchor.label}. ${explicitAnchor.detail}\n- Evidence weighting order (mandatory): primary = explicit user anchor; secondary = directly relevant supporting evidence; tertiary = broader recent context.\n- Do not let secondary or tertiary evidence replace the primary anchor benchmark.\n`
    : "";
  const explicitAnchorValidationRule = explicitAnchor
    ? "- Before finalizing any estimate: validate anchor fit in order: (1) identify named anchor, (2) name the exact matching logged benchmark for that anchor, (3) confirm the estimate is anchored to that benchmark. If validation fails, say anchor evidence is missing or ambiguous rather than silently switching anchors.\n"
    : "";

  const routingPreambleBase = `
QUESTION KIND (routing): ${questionKind}
INTENT (legacy label): ${effectiveIntent}

GLOBAL RULES (always):
${correctionTurnRule}- Only use detailed recent-training / coach-log analysis when the user's question is actually about recent training, their week, or coach output—or when explaining coach output in coach_explanation using the blocks provided for that purpose.
${explicitAnchorRule}
${explicitAnchorValidationRule}
- Do not answer a different question just because training data is available.
- Do not pivot unrelated questions into bench/support-volume or generic weekly analysis unless the intent is recent_training_analysis.
- If LOGGED TRAINING above shows workouts exist, never ask the user to describe their whole program from scratch; use the digest and structured fields.
- Multi-part answers: each subsection (e.g. heavy day vs volume day vs one session vs weekly totals) must cite only evidence that matches that subsection. Do not let the strongest global benchmark replace a more specific anchor for another subsection.
`;

  const evidenceScopeBlock = buildAssistantEvidenceScopeBlock({
    questionKind,
    message,
    hasExerciseLogAnchor: Boolean(exerciseLogAnchorBlock),
    hasSessionReview: questionKind === "session_review",
    hasBenchProjection: Boolean(benchProjection),
    activeExerciseTopic,
  });

  const routingPreamble = `${routingPreambleBase}
${evidenceScopeBlock}`;

  const insightsBlock =
    trainingInsights
      ? `trainingInsights (use for specifics — frequencies, volumes, per-exercise signals, findings, logged RIR). Weekly set totals here match app-aggregated logs for the last 7 days:\n- Training frequency (last 7 days): ${insightsFrequency} session${insightsFrequency === 1 ? "" : "s"}\n- Weekly volume (sets per muscle group): ${insightsWeeklyVolumeStr}\n- Key exercise signals: ${keyExerciseSignalsStr || "none"}\n- Global RIR summary: ${globalRirStr || "no RIR logged or insufficient"}\n- Notable findings: ${findingsStr || "none"}\n${goalRirStr ? `- ${goalRirStr}\n` : ""}${volumeCompletenessNote ? `- Completeness: ${volumeCompletenessNote}\n` : ""}`
      : "";

  const trendsBlock = trendsStr
    ? `exerciseTrends (use for progression / plateau language tied to actual loads and reps):\n${
        exerciseLogAnchorBlock
          ? "When EXERCISE LOG ANCHOR is present, use only the trend row for that same exercise — ignore other lifts’ rows for this answer.\n"
          : ""
      }${trendsStr}\n`
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

FORMAT HINT (advisory): use the four labels Split / Reps / RIR / Progression on their own lines, each followed by one or two short sentences — not long paragraphs under each.

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

FORMAT HINT (coach explanation): one short opening line, blank line, then 3–5 short sentences — no extra headings.

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

FORMAT HINT (clarification): direct answer first, then at most one short paragraph; avoid labeled sections.
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

FORMAT HINT (memory / thread): 2–4 short sentences, blank line optional between distinct points — no headings.

Reply in 2–4 short sentences unless they asked for detail.`;
      } else if (questionKind === "prior_answer_correction") {
        const priorRaw = (priorAssistantTurnContent ?? "").trim();
        const priorCapped =
          priorRaw.length > 4500 ? `${priorRaw.slice(0, 4500)}… [truncated]` : priorRaw;
        const priorBlock =
          priorCapped ||
          "(Full prior assistant text not attached to this request — use RECENT CHAT snippet below if it includes that reply; otherwise say you cannot see the exact prior wording and ask them to paste the sentence they dispute.)";
        input = `
You are a careful strength coach repairing a prior reply after the user challenged it, asked what you meant, or pointed out a mistake.

${routingPreamble}

PRIOR ASSISTANT TURN (verbatim — for diagnosis only; do NOT paste this whole block back to the user):
"""
${priorBlock}
"""

CORRECTION / CLARIFICATION MODE — classify their message as: correction request, dispute of a factual claim, or clarification about a prior statement.

Mandatory response order (internal — do not prefix lines with A), B), or “Step” in the user-visible reply; use short paragraphs with blank lines between):
A) One short sentence: name the exact claim they are pushing back on (quote or paraphrase precisely).
B) One short sentence: whether you were wrong, partially wrong, imprecise, or they clarified scope — if you were wrong, say so directly (“I was wrong about …”). No defensiveness. Skip “I’m an AI” / “I’m here to help” filler when the issue is factual.
C) Correct the claim using the best evidence in this request (SESSION ANCHOR, EXERCISE LOG ANCHOR, bench projection COACH LINES, exerciseTrends, trainingInsights, LOGGED TRAINING digest). If logs support the user, agree explicitly.
D) One sentence: what the corrected picture means in plain language.
E) Optional: at most 1–2 sentences of broader coaching only if clearly useful — only after A–D.

Repetition ban (critical):
- Do NOT reproduce your prior answer at length or re-run the same multi-section structure (e.g. all five bench headings, full session review essay) unless the user explicitly asks you to repeat the full answer.
- Ignore other instructions in this prompt that ask for ~150–190 words or five bench section headings on this turn — this is a surgical fix unless they ask to regenerate everything.

Length: default ~60–120 words unless they asked for more detail.

${coachStructuredOutput ? `If the dispute is about Coach-tab output, treat coachStructuredOutput + evidenceCards as authoritative for what the coach said; repair any mismatch between that and your prior free-text reply.\n${coachAuthorityBlock}` : ""}

${trainingSummary.totalWorkouts > 0 ? `${context}\n` : ""}${insightsBlock ? `${insightsBlock}\n` : ""}${trendsStr ? `${trendsBlock}\n` : ""}
${profileStr ? `User profile (constraints only): ${profileStr}.\n` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}\n` : ""}

User follow-up (challenge / clarification):
${message}
`;
      } else if (questionKind === "session_review") {
        input = `
You are a sharp, practical strength coach texting feedback after one session. Sound human and confident, not like an analytics export.

${routingPreamble}

Anchoring (non-negotiable — logic stays strict):
- Use SESSION ANCHOR only: EXERCISES, SESSION STRUCTURE, RIR line, PER-EXERCISE PRIOR LOGS, COMPARISON GROUNDING, SIMILAR PRIOR SESSION, RECENT SESSION ORDER (titles/dates).
- Do not name exercises outside EXERCISES. Ignore exerciseTrends, trainingInsights lists, digest exercise lines, and chat for naming lifts.
- "Introduced / newly added" only if SESSION ANCHOR explicitly allows vs the immediately prior session; otherwise say "included" or "part of the session".

COMPARISON SAFETY (mandatory — same accuracy rules, natural wording out):
- NEW BASELINE / NO TREND DATA lifts: never imply usual, typical, trend, better/worse vs history. Say it like a coach: e.g. "First time this lift shows up in what I can see — repeat it next time and we’ll know more" or "This gives you a starting point for next week."
- COMPARABLE TO PRIOR LOG ONLY: improved / held steady / dipped slightly only vs those prior dated lines; if messy, say it in plain language ("harder to call — looks mixed").

COACH VOICE (default session reviews — avoid report tone):
- Do NOT sound like a spreadsheet: avoid "max X reps, min Y reps", "average RIR ~0.42 across N sets", or lab-style summaries unless the user explicitly asked for detailed analytics.
- When RIR is logged in the anchor, prefer everyday coaching lines: e.g. "most work was very close to failure", "effort looked controlled", "RIR was mostly logged on the low side" — not decimal averages unless they asked.
- Weave in weights/reps where they help the story ("same 90 as last time, last set just fell off one rep") instead of listing every set mechanically.
- Keep COMPARISON GROUNDING rules but phrase them warmly: e.g. "matched what you did last session" not "metrics aligned with prior observation".

FORMAT HINT (session review — use only this shape; no extra titled blocks like “Summary” or “Overview”):
1) One opening line: verdict — what kind of day + main takeaway (coach tone, no “Verdict:” label).
2) Blank line.
3) Bullets: 3–4 lines with "- " (use a 5th only if the anchor clearly needs it). One clear point per bullet; natural language, not metrics soup. Max ~18 words per bullet when possible.
4) Blank line.
5) One line starting with "Next step: " — one specific action (load, reps, sets, rest, or repeat to confirm). Avoid vague "monitor recovery" unless the anchor supports it.

Layout: blank lines between verdict, bullets, and next step. No dense wall of text. No dash-stacking beyond these bullets.

Length: ~80–150 words default. Premium and concise.

Style bans: "solid", "fits well", "balanced", empty hype — unless tied to a concrete fact from the anchor in the same breath.

OPTIONAL DEEPER LAYER (only after a blank line, if useful):
Evidence / Compared to last time / Why this matters — short bullets only; still coach voice, not a data dump.

RIR: if anchor says none logged, do not invent RIR numbers; you may reference load/rep feel in hedged coach language.

${profileStr ? `User profile (constraints only): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}

User question:
${message}

If SESSION ANCHOR says data is missing, brief coach line + one bullet + next step to log — no invention.`;
      } else if (questionKind === "exact_factual_recall") {
        input = `
You are answering a precise factual question about logged training.

${routingPreamble}

Hard rules:
- If EXERCISE LOG ANCHOR is present, lead with the exact numbers (date → sets) from completed sets only.
- If no anchor match, say the payload does not show that exercise; do not guess.
- Treat non-completed rows as not performed; never cite blank or zero-rep rows as reps achieved.
- Do not drift to unrelated exercises or weekly narratives unless the user asked.

FORMAT HINT (factual recall): first line = the direct answer (the numbers/dates they asked for). Blank line. Then at most two short supporting sentences. No section headings. Bullets only if you are listing several distinct logged facts.

${profileStr ? `User profile (constraints only): ${profileStr}.` : ""}
${constraintsStr ? `User constraints (hard overrides): ${constraintsStr}` : ""}

User question:
${message}

Reply: number-first, tight and scannable.`;
      } else if (questionKind === "exercise_progression") {
        input = `
You are analyzing progression for one lift using logs.

${routingPreamble}

Hard rules:
- EXERCISE LOG ANCHOR is primary: compare the most recent sessions shown there (dates + loads/reps).
- You may supplement with exerciseTrends / exerciseInsights rows ONLY for the same exercise name if present; do not switch to a different lift.
- State what changed (load, reps, set count) or that the log is too thin — label inference vs fact.
- Mention consistency or within-session rep fall-off only when visible in the anchor/trends.

FORMAT HINT (progression): first sentence = honest headline — improving, roughly stable, mixed, or too early to tell from the log. Then two to four short sentences with specifics (loads/reps/dates). No subsection headers or bullet list unless the user asked for a breakdown.

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
- If the user explicitly named an anchor context (heavy bench / volume bench / most recent session / named day / named exercise), open from that anchor first, then add other evidence as supporting context.
${
  benchProjection
    ? `
BENCH GOAL / PROJECTION (when the Bench projection block appears above):
- DEFAULT REPLY = sharp coach note (~120–170 words). Follow the COACH LINES in the block; paraphrase lightly in a warm, readable voice.
- STRUCTURE: use exactly these four headings with colons, each on its own line with a blank line between sections: “Best current read:” → “Why:” → “Supporting evidence:” → “Next move:”.
- Under each heading: at most two short sentences unless the user asked for more depth.
- In “Why:”, enforce evidence weighting: explicit user anchor first, directly relevant support second, broader context last.
- In “Supporting evidence:”, include only secondary evidence and label it as supporting context (never as the primary benchmark).
- NUMBERS: Stick to what COACH LINES already give — one best-current max read, one heavy-day range, one volume-day range. Do not stack extra formula bands, session tables, or “working weight” grids unless the user explicitly asks for detail.
- EVIDENCE: If COACH LINES open with broader-context wording, keep that one light sentence — do not lecture about methodology.
- SUBSECTION EVIDENCE: Obey SUBSECTION EVIDENCE LOCK in the bench block — “Volume bench day” must never recycle the heavy-day anchor numbers unless the lock explicitly says there is no volume data (then say so, don’t copy heavy).
- BANNED in user-facing text: “authoritative”, “Epley”, “inverse”, “app window”, “estimate — not a promise”, long liability disclaimers, “interpretation… diagnosis”, or sounding like an internal calculation dump.
- TIMELINES: Skip vague “a few months” unless you tie one short clause to their actual log trend and uncertainty; prefer readiness signs over dates.
- For direct timeline/readiness questions (“when can I hit 120”, “how long until 120”), use this dedicated format instead: “Best current read:” → “Timeline (rough):” → “Readiness markers:” → “Next move:”.
- Ban filler (“gradually increase intensity and volume”) unless the same breath includes specific loads/reps from COACH LINES.
`
    : ""
}

${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${context}
${trendsStr ? trendsBlock : ""}

User question:
${message}

FORMAT HINT: if no Bench projection block, use a short opening answer plus one blank line and two or three sentences — no multi-heading template. If the block is present, use the four-heading layout above (or timeline format when explicitly asked).

Reply: follow the structure rules above when the Bench projection block is present; otherwise direct estimate + brief reasoning tied to logged numbers.`;
      } else if (questionKind === "volume_balance") {
        input = `
You are answering a weekly volume / balance question.

${routingPreamble}

Hard rules:
- Use trainingInsights weekly volume / frequency and trainingSummary figures verbatim where provided; those counts reflect completed logged sets in the app window.
- Name muscle groups with very low or zero logged sets as potentially under-sampled in the app, not necessarily "weak".
- Tie recommendations to the user’s stated goal/profile when available; avoid generic "watch recovery" unless logs justify it.

FORMAT HINT (volume / balance): lead with the key numbers in one or two sentences, blank line, then one short paragraph of implications (optional “- ” bullets if comparing 2–3 muscle groups).

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

FORMAT HINT (recommendation): paragraph 1 = clear directive (what to do). Blank line. Paragraph 2 = why, tied to log facts in one or two sentences. Optional final line starting with "Next: " for the single best follow-up. No extra labeled sections.

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

FORMAT HINT (week / training analysis): either (a) three short paragraphs with blank lines between — what’s going well, what to watch, next step — or (b) three “- ” bullets for those same beats plus one closing line. Keep sentences short; one idea per sentence. Do not add extra headers beyond what scan needs.

Answer in plain language. 3–4 sentences; ~15–18 words each; one new idea per sentence; cover: progress → limiter → fix.
- Use the three analysis anchors below explicitly; do not replace them with generic RIR advice unless the top issue is RIR/effort related.
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

FORMAT HINT: one short opening line, blank line, then 3–5 short sentences — no extra headings; optional closing takeaway line.

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

FORMAT HINT: direct answer first, then short supporting detail; use “- ” bullets only if comparing days or options.

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

FORMAT HINT: opening answer in one or two sentences, blank line, then brief context if needed — no multi-section template unless bench projection rules apply above.

Reply in plain language, concise (3–5 sentences unless they asked for detail).
`;
      } else if (effectiveIntent === "goal_question") {
        input = `
You are an elite strength coach.

${routingPreamble}

Answer about goals, phases (bulk/cut), strength vs hypertrophy, or priorities. Use profile when helpful. Do not open with unrelated weekly log analysis unless the question ties to it.
${
  benchProjection
    ? `
Bench projection block is available: if the question is how bench sessions should look for a target max, follow the block’s COACH LINES (premium coach tone, no technical jargon in the user reply) — same density rules as projection_estimate.
`
    : ""
}
${profileStr ? `User profile: ${profileStr}.` : ""}
${constraintsStr ? `User constraints: ${constraintsStr}` : ""}
${inferredStr}
${coachingMemoryStr}

Training context (optional, only if relevant):
${context}

User question:
${message}

FORMAT HINT: match the question shape — short Q gets a short reply; avoid extra headings unless the bench projection block rules apply.

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

FORMAT HINT: default = one short paragraph or two with a blank line between; no invented section headers.

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
    ? (() => {
        const p = benchProjection;
        const auth = p.authoritativeEstimated1RM ?? p.currentEstimated1RM;
        const explicitAnchorLine =
          explicitAnchor?.id === "heavy_bench" && p.heavyAnchor
            ? `PRIMARY ANCHOR FOR THIS TURN (mandatory): heavy bench ${p.heavyAnchor.weight}×${p.heavyAnchor.reps} (${formatIsoDate(
                p.heavyAnchor.completedAt
              )}) is the main estimate anchor.`
            : explicitAnchor?.id === "volume_bench" && p.volumeAnchor
              ? `PRIMARY ANCHOR FOR THIS TURN (mandatory): volume bench ${p.volumeAnchor.weight}×${p.volumeAnchor.reps} (${formatIsoDate(
                  p.volumeAnchor.completedAt
                )}) is the main estimate anchor.`
              : explicitAnchor?.id === "most_recent_session"
                ? "PRIMARY ANCHOR FOR THIS TURN (mandatory): use the most recent logged session as the main estimate anchor."
                : "";
        const parts: string[] = [
          `BENCH — Reply like a premium in-app coach (~120–170 words). Readable, specific, calm — not a lab report. Blank line between the five sections; 1–2 short sentences per section unless the user asked for depth.`,
          ...(explicitAnchorLine ? [explicitAnchorLine, ``] : []),
          ...(p.subsectionEvidenceLock ? [p.subsectionEvidenceLock, ``] : []),
          `Use these section headings (with colons): “Best current read:” / “Why:” / “Supporting evidence:” / “Next move:”.`,
          `In “Why:”, cite primary anchor first. In “Supporting evidence:”, mention secondary context only; it must not replace the primary anchor.`,
          `COACH LINES (primary — light paraphrase only; do not add extra number bands or formulas in the user reply):`,
          p.coachFacing?.evidenceLead ?? "",
          p.coachFacing?.bestCurrentRead ?? `About ${auth}${p.payloadUnit} max strength from logged bench tops (rough estimate).`,
          `Heavy bench day: ${p.coachFacing?.heavyBenchDay ?? ""}`,
          `Volume bench day: ${p.coachFacing?.volumeBenchDay ?? ""}`,
          `When target looks realistic:\n${p.coachFacing?.whenTargetLooksRealistic ?? ""}`,
          `Next move: ${p.coachFacing?.nextMove ?? ""}`,
          ``,
          `INTERNAL (stay consistent; do not read jargon aloud): ${p.estimateBasisLine}`,
          ...(p.evidenceScopeLine ? [p.evidenceScopeLine] : []),
          ...(p.readinessSignals?.length ? p.readinessSignals : []),
        ];
        const tail = p.recentBestSets
          .slice(-4)
          .map((s) => `${s.weight}×${s.reps}`)
          .join(" → ");
        if (tail) {
          parts.push(
            `Optional — only if user asks for history: recent bench bests chain ${tail} (${p.benchExerciseName}).`
          );
        }
        return `Bench projection block:\n${parts.filter(Boolean).join("\n")}`;
      })()
    : "Bench projection data: none";
  const benchEstimateBlock = benchEstimate
    ? `Bench 1RM estimate object (deterministic):
- estimated1RM: ${benchEstimate.estimated1RM}
- estimateLow: ${benchEstimate.estimateLow}
- estimateHigh: ${benchEstimate.estimateHigh}
- confidence: ${benchEstimate.confidence}
- primaryAnchorUsed: ${benchEstimate.primaryAnchorUsed.kind} | ${
        benchEstimate.primaryAnchorUsed.set.weight
      }x${benchEstimate.primaryAnchorUsed.set.reps}${
        benchEstimate.primaryAnchorUsed.set.rir !== undefined
          ? ` @~${benchEstimate.primaryAnchorUsed.set.rir} RIR`
          : ""
      } | effectiveRTF ${benchEstimate.primaryAnchorUsed.effectiveRTF} | ${benchEstimate.primaryAnchorUsed.formulaUsed}
- supportingEvidenceUsed: ${benchEstimate.supportingEvidenceUsed.used ? "yes" : "no"} | agreement ${benchEstimate.supportingEvidenceUsed.agreement}${
        benchEstimate.supportingEvidenceUsed.set
          ? ` | ${benchEstimate.supportingEvidenceUsed.set.weight}x${benchEstimate.supportingEvidenceUsed.set.reps}`
          : ""
      }
- reasoningSummary: ${benchEstimate.reasoningSummary}
Rules:
- Prefer this object for estimate numbers/ranges/confidence.
- Keep primary vs supporting evidence separation from this object.
`
    : "Bench 1RM estimate object: none";
  const benchContextBlock = benchContext
    ? `Bench context (structured, completed sets only):
- latest heavy bench session: ${
        benchContext.latestHeavyBenchSession
          ? `${formatIsoDate(benchContext.latestHeavyBenchSession.completedAt)} | ${benchContext.latestHeavyBenchSession.sessionName} | ${benchContext.latestHeavyBenchSession.exerciseName} | sets ${benchContext.latestHeavyBenchSession.sets.map((s) => `${s.weight}x${s.reps}`).join(", ")} | best ${benchContext.latestHeavyBenchSession.bestSet.weight}x${benchContext.latestHeavyBenchSession.bestSet.reps}${benchContext.latestHeavyBenchSession.avgRIR !== undefined ? ` | avgRIR~${benchContext.latestHeavyBenchSession.avgRIR.toFixed(2)}` : ""}`
          : "none found"
      }
- latest volume bench session: ${
        benchContext.latestVolumeBenchSession
          ? `${formatIsoDate(benchContext.latestVolumeBenchSession.completedAt)} | ${benchContext.latestVolumeBenchSession.sessionName} | ${benchContext.latestVolumeBenchSession.exerciseName} | sets ${benchContext.latestVolumeBenchSession.sets.map((s) => `${s.weight}x${s.reps}`).join(", ")} | best ${benchContext.latestVolumeBenchSession.bestSet.weight}x${benchContext.latestVolumeBenchSession.bestSet.reps}${benchContext.latestVolumeBenchSession.avgRIR !== undefined ? ` | avgRIR~${benchContext.latestVolumeBenchSession.avgRIR.toFixed(2)}` : ""}`
          : "none found"
      }
Rules:
- Use these summaries as authoritative heavy-vs-volume context when the user asks about heavy/volume bench explicitly.
- Do not swap heavy and volume anchors.
`
    : "Bench context: none";

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

${benchProjectionBlock}

${benchContextBlock}

${benchEstimateBlock}`.trim();

  const finalInput = `${loggedDataPreamble.trim()}\n\n${conversationSubjectBlock}\n\n${input.trim()}\n\n${memoryContextBlock}\n\n---\nTRUST & CALIBRATION (apply to your reply):\n${TRUST_AND_CALIBRATION_BLOCK}\n\n---\nINFERENCE & CERTAINTY (apply to your reply):\n${INFERENCE_CERTAINTY_BLOCK}\n\n---\n${GLOBAL_REPLY_DISCIPLINE_BLOCK}\n\n---\n${FINAL_RESPONSE_POLISH_BLOCK}`;

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

function stripHeadingPrefix(text: string, labels: string[]): string {
  let out = (text ?? "").trim();
  for (const label of labels) {
    const re = new RegExp(`^${label}\\s*:?\\s*`, "i");
    out = out.replace(re, "").trim();
  }
  return out;
}

type ThreadMessageForDeterministic = { role: "user" | "assistant"; content: string };

/** Prior assistant message when the user’s latest turn is a challenge/clarification (user, assistant, user). */
function extractPriorAssistantTurnForCorrection(
  threadMessages: ThreadMessageForDeterministic[] | undefined
): string | null {
  if (!threadMessages?.length) return null;
  const history = threadMessages.filter(
    (t): t is ThreadMessageForDeterministic =>
      Boolean(t?.content?.trim() && (t.role === "user" || t.role === "assistant"))
  );
  if (history.length < 2) return null;
  const last = history[history.length - 1];
  const prev = history[history.length - 2];
  if (last.role !== "user" || prev.role !== "assistant") return null;
  return prev.content.trim();
}

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
      ? `\n\n${data.unloggedSetCount} set${data.unloggedSetCount === 1 ? "" : "s"} in that session look unlogged or incomplete, so they don’t count as completed performance.`
      : "";
  return `Your last ${data.exerciseName} session was logged on ${date}.

Logged completed sets: best set ${best.weight}×${best.reps}; last completed set ${lastSet.weight}×${lastSet.reps}.${unloggedLine}

Use those completed sets as your baseline for progression.`;
}

function tryBuildDeterministicBenchProjectionReply(params: {
  message: string;
  benchProjection: AssistantBody["benchProjection"] | undefined;
  explicitAnchor: ExplicitEvidenceAnchor | null;
  benchContext: AssistantBody["benchContext"] | undefined;
  benchEstimate: AssistantBody["benchEstimate"] | undefined;
}): string | null {
  const m = params.message.toLowerCase();
  const oneRm = /\b(1rm|e1rm|one rep max)\b/.test(m);
  const benchish =
    /\bbench\b|pb|bench press|barbell bench/.test(m) ||
    (params.benchProjection != null && oneRm);

  const asksWhen =
    /(when|expect|timeline|when can i|how soon|can i expect)/.test(m) ||
    (m.includes("expect") && m.includes("bench"));
  const asksTimelineReadiness =
    /\b(when|how long|timeline|how soon|realistic)\b/.test(m) &&
    (/\b\d{2,3}\s*(kg|kgs|lb|lbs)?\b/.test(m) || /\btarget\b/.test(m) || /\b(hit|reach|get|expect)\b/.test(m));
  const asksWorking =
    /(working weight|working weights|what would my working weights|what weight.*reps|reps need|working weights\/reps)/.test(m) ||
    m.includes("working weights") ||
    m.includes("working weight");
  const asksHeavyVolumeSessions =
    /\b(heavy|volume)\b/.test(m) &&
    /\b(session|sessions|day)\b/.test(m) &&
    (/what can i expect/.test(m) || /look like/.test(m) || /should my/.test(m));
  const asksBenchGoalSessions =
    /what should my session/.test(m) ||
    /when this is possible/.test(m) ||
    /need to look/.test(m) ||
    /based on my (most )?recent/.test(m) ||
    /how can i expect/.test(m) ||
    /increase to\b/.test(m);

  if (!benchish) return null;
  const p = params.benchProjection;
  if (!p?.heavyDay || !p.volumeDay || !p.recentBestSets.length) return null;

  const wantsProjection =
    asksWhen ||
    asksWorking ||
    asksHeavyVolumeSessions ||
    asksBenchGoalSessions ||
    (oneRm && p.target1RM != null);

  if (!wantsProjection) return null;

  const u = p.payloadUnit;
  const cf = p.coachFacing;
  if (!cf) return null;

  const mentionsTemplates = /template|templates|program|routine|split/.test(m);
  const templateLine = mentionsTemplates
    ? `\n\nIf you use a template, keep heavy bench on your heavy day and volume bench on your lighter slot.`
    : "";
  const heavyAnchor = params.benchContext?.latestHeavyBenchSession?.bestSet
    ? {
        weight: params.benchContext.latestHeavyBenchSession.bestSet.weight,
        reps: params.benchContext.latestHeavyBenchSession.bestSet.reps,
        completedAt: params.benchContext.latestHeavyBenchSession.completedAt,
      }
    : (p.heavyAnchor ?? null);
  const volumeAnchor = params.benchContext?.latestVolumeBenchSession?.bestSet
    ? {
        weight: params.benchContext.latestVolumeBenchSession.bestSet.weight,
        reps: params.benchContext.latestVolumeBenchSession.bestSet.reps,
        completedAt: params.benchContext.latestVolumeBenchSession.completedAt,
      }
    : (p.volumeAnchor ?? null);
  const heavySessionRir = params.benchContext?.latestHeavyBenchSession?.avgRIR;

  // Validation gate: if user explicitly named heavy/volume as primary anchor, the chosen benchmark must match.
  if (params.explicitAnchor?.id === "heavy_bench" && (!heavyAnchor || heavyAnchor.reps > 5)) return null;
  if (params.explicitAnchor?.id === "volume_bench" && (!volumeAnchor || volumeAnchor.reps < 6)) return null;

  const primaryEvidence =
    params.explicitAnchor?.id === "heavy_bench"
      ? heavyAnchor
        ? `Primary anchor: heavy bench ${heavyAnchor.weight}×${heavyAnchor.reps} (${formatIsoDate(heavyAnchor.completedAt)})${
            heavySessionRir !== undefined ? `, with logged effort around ${heavySessionRir.toFixed(1)} RIR` : ""
          }.`
        : "Primary anchor: your heavy bench work."
      : params.explicitAnchor?.id === "volume_bench"
        ? volumeAnchor
          ? `Primary anchor: volume bench ${volumeAnchor.weight}×${volumeAnchor.reps} (${formatIsoDate(volumeAnchor.completedAt)}).`
          : "Primary anchor: your volume bench work."
        : params.explicitAnchor?.id === "most_recent_session"
          ? "Primary anchor: your most recent logged session."
          : heavyAnchor
            ? `Primary anchor: heavy bench around ${heavyAnchor.weight}×${heavyAnchor.reps}.`
            : volumeAnchor
              ? `Primary anchor: volume bench around ${volumeAnchor.weight}×${volumeAnchor.reps}.`
              : "Primary anchor: your recent logged bench work.";

  const supportingEvidence =
    params.explicitAnchor?.id === "heavy_bench"
      ? volumeAnchor
        ? `Supporting evidence: volume bench around ${volumeAnchor.weight}×${volumeAnchor.reps} keeps the read honest without replacing the heavy anchor.`
        : "Supporting evidence: no separate 6+ rep volume anchor was found in this payload."
      : heavyAnchor
        ? `Supporting evidence: heavy bench around ${heavyAnchor.weight}×${heavyAnchor.reps} gives the top-end context.`
        : "Supporting evidence: broader bench trend context only.";

  const readinessLine = cf.whenTargetLooksRealistic
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  const estimateLine = params.benchEstimate
    ? `About ${params.benchEstimate.estimateLow}–${params.benchEstimate.estimateHigh} ${u} (center ~${params.benchEstimate.estimated1RM} ${u}, ${params.benchEstimate.confidence} confidence).`
    : cf.bestCurrentRead;
  const supportLine = params.benchEstimate
    ? `${supportingEvidence} ${params.benchEstimate.reasoningSummary}`
    : supportingEvidence;
  const cleanSupportLine = stripHeadingPrefix(supportLine, ["Supporting evidence"]);
  const cleanNextMove = stripHeadingPrefix(cf.nextMove, ["Next move"]);
  const readinessLines = cf.whenTargetLooksRealistic
    .split("\n")
    .map((line) => stripHeadingPrefix(line, ["When target looks realistic", "When"]))
    .map((line) => line.trim())
    .filter(Boolean);

  if (asksTimelineReadiness) {
    const est = params.benchEstimate;
    const target = p.target1RM ?? null;
    const gap = est && target != null ? Number((target - est.estimated1RM).toFixed(1)) : null;
    const progressRate = p.progressionDeltaKgPerSession;

    let closenessLine: string;
    if (gap != null && gap <= 0) {
      closenessLine = `Your current estimated range already covers ${target} ${u} — you may be ready to attempt it now or very soon.`;
    } else if (gap != null) {
      closenessLine = `You're roughly ${gap} ${u} short of ${target} ${u} on this read.`;
    } else {
      closenessLine = "Current position relative to target is unclear from the data available.";
    }

    let timelineText: string;
    if (gap != null && gap <= 0) {
      timelineText = "Near-term: a peaking session or a strong heavy day could confirm it.";
    } else if (gap != null && progressRate != null && progressRate > 0) {
      const sessions = Math.ceil(gap / progressRate);
      const weeksLow = Math.ceil(sessions * 0.7);
      const weeksHigh = Math.ceil(sessions * 1.5);
      timelineText = `At your recent rate (~${progressRate} ${u} per bench exposure), roughly ${sessions} focused bench sessions — so roughly ${weeksLow}–${weeksHigh} weeks if benching 1–2 times a week. Treat this as an order-of-magnitude guess, not a guarantee.`;
    } else if (est) {
      timelineText = est.confidence === "high"
        ? "Rough estimate: the next 4–8 focused bench exposures if recovery and execution stay consistent."
        : est.confidence === "medium"
          ? "Rough estimate: the next 6–12 focused bench exposures, with normal week-to-week variability."
          : "Timeline is uncertain from current data — likely measured in training blocks rather than individual sessions.";
    } else {
      timelineText = "Not enough progression data to give a specific timeline.";
    }

    const heavyLine = heavyAnchor
      ? `Heavy triples around ${heavyAnchor.weight}×${heavyAnchor.reps} should start to feel repeatable, not near-max every week.`
      : "Heavy triples at your current top weight should feel repeatable.";
    const volumeLine = volumeAnchor
      ? `Volume bench around ${volumeAnchor.weight}×${volumeAnchor.reps} should keep pace without hurting the next heavy session.`
      : "Volume bench should keep pace without hurting the next heavy session.";
    const markerLines = [
      readinessLines[0] ?? heavyLine,
      readinessLines[1] ?? volumeLine,
    ];

    return `Where you are now:
${closenessLine} ${estimateLine}

Timeline:
${timelineText}

What would make ${target ?? "the target"} ${u ?? ""} realistic:
- ${markerLines[0]}
- ${markerLines[1]}

Next move:
${cleanNextMove}${templateLine}`.trim();
  }

  return `Best current read:
${estimateLine}

Why:
${primaryEvidence}

${readinessLine ?? ""}

Supporting evidence:
${cleanSupportLine}

Next move:
${cleanNextMove}${templateLine}`.trim();
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
      benchContext,
      benchEstimate,
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
    const explicitAnchor = detectExplicitEvidenceAnchor(trimmedMessage, activeExerciseTopic);
    const wantsBenchEstimateDebug =
      /\b(1rm|e1rm|one rep max|one-rep max|estimated 1rm|current 1rm)\b/i.test(trimmedMessage) &&
      /\bbench\b|bench press|barbell bench/i.test(trimmedMessage);
    const questionKind = classifyAssistantQuestionKind(trimmedMessage, {
      threadMessages: Array.isArray(threadMessages)
        ? (threadMessages as AssistantThreadTurn[])
        : undefined,
    });
    // Deterministic fast-paths are gated by freshly computed intent each turn.
    const deterministicByKind =
      (questionKind === "memory_continuity"
        ? tryBuildDeterministicThreadReferenceReply({
            message: trimmedMessage,
            threadMessages,
            exactThreadLoaded,
          })
        : null) ??
      (questionKind === "exact_factual_recall"
        ? tryBuildDeterministicExerciseReply({
            message: trimmedMessage,
            activeExerciseLastSession,
          })
        : null) ??
      (questionKind === "projection_estimate"
        ? tryBuildDeterministicBenchProjectionReply({
            message: trimmedMessage,
            benchProjection,
            explicitAnchor,
            benchContext,
            benchEstimate,
          })
        : null);
    if (deterministicByKind) {
      return NextResponse.json({ reply: deterministicByKind } satisfies AssistantResponse);
    }
    if (questionKind === "single_session_construction") {
      const parsed = parseContextFromMessage(trimmedMessage);
      const sessionType = inferSessionTypeFromContext({
        message: trimmedMessage,
        coachingContext,
      });
      const built = buildWorkout({
        sessionType,
        goal: inferWorkoutBuilderGoal(trimmedMessage, priorityGoal),
        equipmentAvailable: inferEquipmentFromParsed(parsed),
        injuriesOrExclusions:
          parsed.injuryStatus === "present" ? ["injury", "pain"] : [],
        recentTrainingContext: {
          recentExerciseIds:
            coachingContext?.recentWorkouts?.flatMap((w) =>
              Array.isArray(w.exercises) ? w.exercises.map((e) => e.name || e.exerciseId || "") : []
            ) ?? [],
        },
        preferredExercises:
          Array.isArray(activeExerciseTopic) && activeExerciseTopic.length > 0
            ? activeExerciseTopic
            : activeExerciseTopic
              ? [activeExerciseTopic]
              : [],
        recoveryMode: /\b(low fatigue|recovery|deload|easy)\b/i.test(trimmedMessage)
          ? ("low_fatigue" as RecoveryMode)
          : ("normal" as RecoveryMode),
      });
      if (!built.exercises.length) {
        const fallbackStructured = {
          sessionTitle: `${sessionType.replace("_", " ")} workout`,
          sessionGoal: "Structured fallback after generator issue",
          purposeSummary: "Could not fully build this session from current constraints.",
          exercises: [],
          note: "I couldn't generate exercises with current constraints. Try adding equipment or removing exclusions.",
        };
        return NextResponse.json({
          reply: "I couldn't generate this session from the current constraints.",
          structuredWorkout: fallbackStructured,
        } satisfies AssistantResponse);
      }
      return NextResponse.json({
        reply: renderBuiltWorkoutReply(built),
        structuredWorkout: toStructuredWorkout(built),
      } satisfies AssistantResponse);
    }
    if (questionKind === "multi_day_programme_construction" || (questionKind === "template_review" && isProgrammeBuildRequest(trimmedMessage))) {
      const parsed = parseContextFromMessage(trimmedMessage);
      const programme = buildStructuredProgramme({
        message: trimmedMessage,
        priorityGoal: priorityGoal ?? undefined,
        recoveryMode: /\b(low fatigue|recovery|deload|easy)\b/i.test(trimmedMessage)
          ? ("low_fatigue" as RecoveryMode)
          : ("normal" as RecoveryMode),
        equipmentAvailable: inferEquipmentFromParsed(parsed),
      });
      if (programme) {
        return NextResponse.json({
          reply: renderStructuredProgrammeText(programme),
          structuredProgramme: programme,
        } satisfies AssistantResponse);
      }
      const fallbackProgramme: NonNullable<AssistantResponse["structuredProgramme"]> = {
        programmeTitle: "Programme builder unavailable",
        programmeGoal: "Structured fallback",
        notes: "I couldn't generate a full programme from current constraints. Try specifying split and available equipment.",
        days: [],
      };
      return NextResponse.json({
        reply: "I couldn't generate a full programme from current constraints.",
        structuredProgramme: fallbackProgramme,
      } satisfies AssistantResponse);
    }
    const priorAssistantTurnContent =
      questionKind === "prior_answer_correction"
        ? extractPriorAssistantTurnForCorrection(threadMessages)
        : null;
    const intent = mapQuestionKindToLegacyIntent(questionKind) as AssistantIntent;
    console.log("[assistant-anchor]", {
      explicitAnchor: explicitAnchor?.id ?? null,
      label: explicitAnchor?.label ?? null,
      primaryHeavyFromContext: benchContext?.latestHeavyBenchSession
        ? `${benchContext.latestHeavyBenchSession.bestSet.weight}x${benchContext.latestHeavyBenchSession.bestSet.reps}`
        : null,
      primaryVolumeFromContext: benchContext?.latestVolumeBenchSession
        ? `${benchContext.latestVolumeBenchSession.bestSet.weight}x${benchContext.latestVolumeBenchSession.bestSet.reps}`
        : null,
    });
    if (wantsBenchEstimateDebug) {
      console.log("[assistant-bench-debug] context payload", {
        message: trimmedMessage,
        explicitAnchor: explicitAnchor?.id ?? null,
        benchContext,
        benchProjectionInputs: benchProjection
          ? {
              benchExerciseName: benchProjection.benchExerciseName,
              payloadUnit: benchProjection.payloadUnit,
              authoritativeEstimated1RM: benchProjection.authoritativeEstimated1RM,
              heavyAnchor: benchProjection.heavyAnchor ?? null,
              volumeAnchor: benchProjection.volumeAnchor ?? null,
              recentBestSets: benchProjection.recentBestSets,
              progressionDeltaKgPerSession: benchProjection.progressionDeltaKgPerSession,
            }
          : null,
        benchEstimate,
      });
    }
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
      "single_session_construction",
      "multi_day_programme_construction",
      "prior_answer_correction",
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
      benchContext,
      benchEstimate,
      coachingContext,
      exerciseTrends ?? [],
      trainingInsights,
      priorityGoalExerciseInsight,
      coachStructuredOutput,
      evidenceCards,
      priorAssistantTurnContent,
      explicitAnchor
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
