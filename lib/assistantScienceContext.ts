import type { AssistantQuestionKind } from "@/lib/assistantQuestionRouting";
import { MUSCLE_RULES, type MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";

/** Same shape as AssistantEvidenceCard in the API route (avoid circular imports). */
export type ServerEvidenceCard = {
  id: string;
  title: string;
  summary: string;
  practicalTakeaway: string;
  caution?: string;
  confidence: "low" | "moderate" | "high";
};

const CATALOG: ServerEvidenceCard[] = [
  {
    id: "server-hypertrophy-volume-baseline",
    title: "Hypertrophy volume baseline",
    summary:
      "Per-muscle weekly sets in a ~10–20 range are a common practical band; below ~10 direct sets/week a muscle is often under-stimulated for growth goals.",
    practicalTakeaway:
      "When prescribing or reviewing volume, compare logged weekly sets per muscle to that band and adjust gradually.",
    confidence: "moderate",
  },
  {
    id: "server-frequency-recovery",
    title: "Frequency and recovery spacing",
    summary:
      "Major muscle groups often tolerate ~2 sessions/week with hard training; 48–72h between heavy same-muscle sessions is a useful default spacing.",
    practicalTakeaway:
      "If frequency is high but recovery is poor, bias fewer hard exposures per week or reduce per-session volume before dropping effort to zero.",
    caution: "Individual recovery varies; use symptoms and performance trends.",
    confidence: "moderate",
  },
  {
    id: "server-effort-rir",
    title: "Effort and proximity to failure",
    summary:
      "Hypertrophy generally benefits from sets taken close to failure; RIR ~0–3 on working sets is a practical coaching band depending on exercise type and fatigue.",
    practicalTakeaway:
      "Match RIR guidance to exercise class (compounds vs isolations) and the user’s recovery; avoid blanket ‘always train to failure’.",
    confidence: "moderate",
  },
  {
    id: "server-movement-pattern-coverage",
    title: "Multi-pattern coverage",
    summary:
      "Most muscles respond well to more than one movement pattern across the week (e.g. vertical + horizontal pull; flat + incline press).",
    practicalTakeaway:
      "When reviewing a session or split, check pattern diversity before adding redundant similar movements.",
    confidence: "moderate",
  },
  {
    id: "server-progression-dose",
    title: "Progression and dose stability",
    summary:
      "Progress when reps/load are stable at target effort; if performance dips across several sessions, consider fatigue, sleep, or excessive volume before forcing overload.",
    practicalTakeaway:
      "Prefer small, repeatable progression (e.g. +1 rep or +2.5% load) when technique and recovery are solid.",
    confidence: "moderate",
  },
];

export function shouldAttachScienceContext(kind: AssistantQuestionKind): boolean {
  const skip = new Set<AssistantQuestionKind>([
    "memory_continuity",
    "prior_answer_correction",
    "single_session_construction",
    "multi_day_programme_construction",
    "session_review",
    "exact_factual_recall",
  ]);
  return !skip.has(kind);
}

function detectMuscleIds(text: string): MuscleRuleId[] {
  const t = text.toLowerCase();
  const found: MuscleRuleId[] = [];
  const tests: [RegExp, MuscleRuleId][] = [
    [/\b(chest|pecs?)\b/, "chest"],
    [/\b(lats?|upper back|mid back|back day|rowing|rows?)\b/, "lats_upper_back"],
    [/\b(shoulders?|delts?|side delt|rear delt)\b/, "delts"],
    [/\bbiceps?\b/, "biceps"],
    [/\btriceps?\b/, "triceps"],
    [/\bquads?\b|\bquad\b|\bleg press\b|\bsquat\b/, "quads"],
    [/\bhamstrings?\b|\bhams?\b|\brdl\b|\bromanian\b/, "hamstrings"],
    [/\bglutes?\b|\bhip thrust\b/, "glutes"],
    [/\bcalves?\b|\bcalf\b/, "calves"],
    [/\b(core|abs?)\b/, "abs_core"],
  ];
  for (const [re, id] of tests) {
    if (re.test(t) && !found.includes(id)) found.push(id);
  }
  return found.slice(0, 5);
}

/** Compact deterministic muscle rules for prompts when the user names specific muscles. */
export function buildMuscleRulesSnippetFromMessage(message: string): string {
  const ids = detectMuscleIds(message);
  if (ids.length === 0) return "";
  const lines = ids.map((id) => {
    const r = MUSCLE_RULES[id];
    return `- ${r.displayName}: typical weekly direct sets ~${r.typicalWeeklySetRange.min}–${r.typicalWeeklySetRange.high} (target ~${r.typicalWeeklySetRange.target}); per-session ~${r.typicalPerSessionSetRange.min}–${r.typicalPerSessionSetRange.high}; key patterns: ${r.keyMovementPatterns.join(", ")}; recovery spacing ~${r.typicalRecoveryWindowHours.min}–${r.typicalRecoveryWindowHours.max}h. ${r.programmingNotes.join(" ")}`;
  });
  return `APP MUSCLE RULES (deterministic — use for muscle-specific programming in this turn):\n${lines.join("\n")}`;
}

function catalogById(id: string): ServerEvidenceCard | undefined {
  return CATALOG.find((c) => c.id === id);
}

/**
 * Topic-tagged server evidence cards merged into the assistant prompt (with coach cards when present).
 * Always includes a small baseline set for training-related kinds; adds topic cards from keywords.
 */
export function selectServerEvidenceCards(
  message: string,
  questionKind: AssistantQuestionKind
): ServerEvidenceCard[] {
  if (!shouldAttachScienceContext(questionKind)) return [];

  const t = message.toLowerCase();
  const trainingish =
    /\b(workout|session|training|lift|muscle|sets?|reps?|split|programme|program|hypertrophy|strength|volume|frequency|rir|progress|plateau|recovery|rest day)\b/.test(
      t
    );

  const refersToBuiltChatWorkout =
    /\b(you (gave|built|prescribed)|this session|that session|that workout|the workout you|last workout you|from this chat)\b/.test(
      t
    );

  if (
    !trainingish &&
    !refersToBuiltChatWorkout &&
    questionKind !== "coach_explanation" &&
    questionKind !== "projection_estimate" &&
    questionKind !== "exercise_progression" &&
    questionKind !== "exercise_question" &&
    questionKind !== "goal_question"
  ) {
    return [];
  }

  const picks = new Map<string, ServerEvidenceCard>();

  const add = (id: string) => {
    const c = catalogById(id);
    if (c) picks.set(c.id, c);
  };

  add("server-hypertrophy-volume-baseline");

  if (/\b(frequency|times per week|days per week|how many days|sessions per week)\b/.test(t)) {
    add("server-frequency-recovery");
  }
  if (/\b(rir|failure|effort|intensity|to failure|rpe)\b/.test(t)) {
    add("server-effort-rir");
  }
  if (/\b(pattern|angle|vertical|horizontal|redundant|overlap|balance|push pull)\b/.test(t)) {
    add("server-movement-pattern-coverage");
  }
  if (/\b(progress|stall|plateau|overload|increase weight|add weight|linear)\b/.test(t)) {
    add("server-progression-dose");
  }
  if (
    questionKind === "volume_balance" ||
    /\b(volume|sets per week|weekly sets|direct sets|too much|too little)\b/.test(t)
  ) {
    add("server-frequency-recovery");
  }
  if (questionKind === "split_comparison_or_recommendation" || questionKind === "split_explanation_education") {
    add("server-movement-pattern-coverage");
    add("server-frequency-recovery");
  }
  if (questionKind === "coaching_recommendation" || questionKind === "recent_training_analysis") {
    add("server-effort-rir");
    add("server-progression-dose");
  }

  return [...picks.values()];
}
