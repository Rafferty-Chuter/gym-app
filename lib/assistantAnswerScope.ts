import type { AssistantQuestionKind } from "@/lib/assistantQuestionRouting";

/**
 * Declares where the model should pull evidence from for this turn, and what must not bleed in.
 * Injected into assistant prompts after routing — complements SESSION / EXERCISE anchors.
 */
export type AssistantEvidenceScopeId =
  | "thread_memory"
  | "single_session_anchor"
  | "single_exercise_log"
  | "exercise_trend_window"
  | "weekly_volume_window"
  | "projection_readiness"
  | "coach_output_explain"
  | "template_catalog"
  | "wide_recent_training"
  | "goal_profile"
  | "general_mixed";

function sessionTypeCue(t: string): boolean {
  return /\b(volume|heavy)\s+(day|session|bench)\b/i.test(t) || /\bvolume\s+bench\b/i.test(t);
}

function scopeLabel(id: AssistantEvidenceScopeId): string {
  const m: Record<AssistantEvidenceScopeId, string> = {
    thread_memory: "Recent chat / saved preferences (not training logs as primary)",
    single_session_anchor: "One exact logged session (SESSION ANCHOR)",
    single_exercise_log: "One lift’s log trail (EXERCISE LOG ANCHOR)",
    exercise_trend_window: "That lift across recent sessions (anchor + matching exerciseTrends row only)",
    weekly_volume_window: "Weekly set counts & muscle balance (trainingInsights window, completed sets)",
    projection_readiness: "Projection / readiness (bench projection block + matching pattern — not unrelated sessions)",
    coach_output_explain: "Existing coach output + linked evidence cards",
    template_catalog: "Saved templates / program text in payload",
    wide_recent_training: "Multi-session picture (insights, trends, coach — no single-session override unless asked)",
    goal_profile: "Goals, phase, priorities (profile + logs only if question ties to them)",
    general_mixed: "Question-led mix (narrowest relevant source first)",
  };
  return m[id];
}

function resolveScopeId(
  questionKind: AssistantQuestionKind,
  hasExerciseLogAnchor: boolean
): AssistantEvidenceScopeId {
  switch (questionKind) {
    case "memory_continuity":
      return "thread_memory";
    case "prior_answer_correction":
      return "general_mixed";
    case "session_review":
      return "single_session_anchor";
    case "exact_factual_recall":
      return hasExerciseLogAnchor ? "single_exercise_log" : "general_mixed";
    case "exercise_progression":
      return hasExerciseLogAnchor ? "exercise_trend_window" : "wide_recent_training";
    case "projection_estimate":
      return "projection_readiness";
    case "volume_balance":
      return "weekly_volume_window";
    case "coaching_recommendation":
      return hasExerciseLogAnchor ? "exercise_trend_window" : "wide_recent_training";
    case "coach_explanation":
      return "coach_output_explain";
    case "template_review":
      return "template_catalog";
    case "goal_question":
      return "goal_profile";
    case "recent_training_analysis":
      return "wide_recent_training";
    case "exercise_question":
      return "general_mixed";
    default:
      return "general_mixed";
  }
}

/**
 * Builds the ANSWER EVIDENCE SCOPE block appended to every analysis-mode prompt.
 */
export function buildAssistantEvidenceScopeBlock(params: {
  questionKind: AssistantQuestionKind;
  message: string;
  hasExerciseLogAnchor: boolean;
  hasSessionReview: boolean;
  hasBenchProjection: boolean;
  activeExerciseTopic: string | null | undefined;
}): string {
  const t = params.message.trim().toLowerCase();
  if (params.questionKind === "prior_answer_correction") {
    const benchNote = params.hasBenchProjection
      ? "\n- If a bench projection block is present: use COACH LINES + SUBSECTION EVIDENCE LOCK only to verify facts (e.g. volume 6+ anchor) — do not rerun the full multi-section bench template in the user reply unless they explicitly ask for it again."
      : "";
    const topic = params.activeExerciseTopic?.trim();
    const topicNote = topic
      ? `\n- Active exercise context: "${topic}" — prefer this lift when the user is steering the dispute (e.g. “I meant bench”).\n`
      : "";
    return `ANSWER EVIDENCE SCOPE (read first — pick sources before writing):
- Scope for this turn: Prior assistant reply — correction, dispute, or clarification
- Primary: the specific claim the user is challenging (from PRIOR ASSISTANT TURN in the prompt) + the narrowest payload source that settles it (SESSION ANCHOR, EXERCISE LOG ANCHOR, bench projection lines, one exerciseTrends row, trainingInsights counts, RECENT CHAT).
- Do not repeat or rephrase your entire prior answer. Answer the narrow point first (see CORRECTION MODE in task).
- If you misstated a logged fact, say you were wrong plainly and correct it with the right numbers from logs; no defensive filler or generic “happy to help.”
- Do not pivot to broad coaching before the repair (A→D) unless the user clearly asked to zoom back out.${benchNote}
- Cross-context bleed: do not “fix” bench with squat data or vice versa; stay on the disputed claim’s lift/topic.
${topicNote}${params.hasSessionReview ? "- SESSION ANCHOR is in play — prefer it for session-level disputes.\n" : ""}${params.hasExerciseLogAnchor ? "- EXERCISE LOG ANCHOR is in play — prefer it for per-lift set disputes.\n" : ""}- Completed performance only: count/quote sets with reps logged as a number > 0. Blank, zero, or missing-rep rows are placeholders — never treat them as work done.`;
  }

  const scopeId = resolveScopeId(params.questionKind, params.hasExerciseLogAnchor);
  const label = scopeLabel(scopeId);
  const topic = params.activeExerciseTopic?.trim() || "";
  const topicLine =
    topic && params.questionKind !== "memory_continuity"
      ? `\n- Active topic lock: "${topic}" — keep the answer on this lift unless the user clearly switches exercises.`
      : "";

  const completedSetsRule =
    "- Completed performance only: count/quote sets with reps logged as a number > 0. Blank, zero, or missing-rep rows are placeholders — never treat them as work done.";

  let primary = "";
  let forbid = "";
  let compare = "";

  switch (scopeId) {
    case "thread_memory":
      primary =
        "- Primary: RECENT CHAT snippet + selective memory. Use training logs only if the user explicitly tied the question to a workout.";
      forbid =
        "- Do not invent prior messages. Do not use exerciseTrends or SESSION ANCHOR to answer “what we said in chat.”";
      compare = "- N/A for log comparisons.";
      break;
    case "single_session_anchor":
      primary =
        "- Primary: SESSION ANCHOR only (exercises, sets, dates, RIR summary, per-exercise prior lines inside the anchor).";
      forbid =
        "- Do not use exerciseTrends, trainingInsights exercise lists, trainingSummary.recentExercises, or coach tab text to name lifts or swap loads from another session.\n- Do not answer as if this were a different session type than the anchor describes (e.g. volume-bench anchor vs a heavy day hidden in trends).";
      compare =
        "- Comparisons: only vs prior lines printed inside SESSION ANCHOR for the same exercise (or “similar prior session” if the anchor provides it) — not “any recent session.”";
      break;
    case "single_exercise_log":
      primary =
        "- Primary: EXERCISE LOG ANCHOR (named lift, dated sessions, completed sets).";
      forbid =
        "- Do not cite another exercise’s trend row or session bests as if they were this lift.";
      compare =
        "- Comparisons: prior exposures of the same exercise in the anchor (same name), not other movements.";
      break;
    case "exercise_trend_window":
      if (params.questionKind === "coaching_recommendation") {
        primary =
          "- Primary: EXERCISE LOG ANCHOR + matching exerciseTrends row for that lift; use coach actionable suggestions only when they clearly apply to this lift or bottleneck.";
      } else {
        primary =
          "- Primary: EXERCISE LOG ANCHOR + the exerciseTrends row whose name matches that lift only.";
      }
      forbid =
        "- Do not blend bench numbers into a squat question or mix two trend rows.\n- If anchor is missing, say so — do not substitute a different exercise’s trend.";
      compare =
        "- Comparisons: earlier sessions for that same exercise in the anchor/trend, under similar intent (e.g. working sets), not random other sessions.";
      break;
    case "weekly_volume_window":
      primary =
        "- Primary: trainingInsights weekly volume + frequency for the stated window (completed sets in app). trainingSummary weekly line should match.";
      forbid =
        "- Do not let one heavy session’s top set redefine weekly muscle volume. Do not use SESSION ANCHOR unless the user asked about that specific session.";
      compare =
        "- Comparisons: week-over-week or target-vs-actual in the same muscle groups, not unrelated lifts.";
      break;
    case "projection_readiness":
      primary =
        "- Primary: Bench projection / COACH LINES in subject block when present; otherwise the lift and benchmarks implied by the question.";
      forbid =
        "- Multi-part answers: scope each sub-question separately (heavy day vs volume day vs “when target” vs session review vs exercise trend). Each subsection may cite only evidence that matches that role.\n- Do not let the single strongest recent benchmark override a narrower anchor for another subsection (e.g. never reuse heavy triples inside a volume-day paragraph unless the block says there is no volume data).\n- Do not replace projection benchmarks with a different session type unless the block explicitly ties them.\n- Do not use unrelated exercises’ trends as the main strength read.";
      compare =
        "- Comparisons: same lift’s recent pattern (heavy vs volume) as encoded in the projection payload and any SUBSECTION EVIDENCE LOCK line — not arbitrary sessions or a blended “best set” story.";
      break;
    case "coach_output_explain":
      primary = "- Primary: coachStructuredOutput + evidenceCards. Rephrase only; do not replace with a fresh week diagnosis.";
      forbid =
        "- Do not contradict coach fields using ad-hoc exerciseTrends stories unless the user asked to reconcile a clear error.";
      compare = "- N/A unless explaining a comparison already inside coach output.";
      break;
    case "template_catalog":
      primary = "- Primary: templates summary / named templates in payload.";
      forbid = "- Do not invent program structure from generic workout history if templates are missing.";
      compare = "- Compare templates to each other or to user goals — not to one random logged day as a program.";
      break;
    case "wide_recent_training":
      if (params.questionKind === "exercise_progression") {
        primary =
          "- Primary: the exerciseTrends row that matches the lift named in the question (match the exercise name carefully).";
        forbid =
          "- Do not use a different exercise’s trend row. If there is no row for that lift, say the payload doesn’t show its history — do not substitute another movement.";
        compare =
          "- Comparisons: sessions listed in that exercise’s trend row only, in chronological order.";
      } else {
        primary =
          "- Primary: trainingInsights + exerciseTrends + coach output as relevant — multi-session allowed.";
        forbid =
          "- If the user asked about one specific session or one lift, do not drown that with unrelated exercises; narrow to what they asked.";
        compare =
          "- Prefer the most relevant prior exposure (same lift, similar session role) when comparing — not only the latest workout in the list.";
      }
      break;
    case "goal_profile":
      primary = "- Primary: profile, stated goal, constraints. Add logs only when the question clearly connects (e.g. bench goal + bench data).";
      forbid = "- Do not default to a full “this week” review unless they asked for weekly training.";
      compare = "- N/A unless they asked how goals compare to logs.";
      break;
    default:
      primary =
        "- Primary: narrowest source that answers the question (specific session > specific exercise > week > general).";
      forbid =
        "- Do not let a broad trend override a more specific ask. Do not cross wires between exercises.";
      compare =
        "- When comparing, prefer same exercise and same session type when the user implied one.";
  }

  const sessionTypeNote =
    sessionTypeCue(t) && !params.hasSessionReview
      ? "\n- User mentioned a session type (volume/heavy): if your evidence is not scoped to that type, say so briefly or stick to data that matches — do not silently substitute the other flavor of day."
      : "";

  const projectionFallback =
    scopeId === "projection_readiness" && !params.hasBenchProjection
      ? "\n- No structured projection block in payload: stay with the lift implied by the question + its exerciseTrends row only — do not borrow another lift’s benchmarks as the main story."
      : "";

  const benchSubsectionLockNote =
    scopeId === "projection_readiness" && params.hasBenchProjection
      ? "\n- Bench block present: obey SUBSECTION EVIDENCE LOCK inside it — each heading uses only its assigned logged anchor; volume must not recycle heavy numbers unless the lock states no 6+ rep data."
      : "";

  return `ANSWER EVIDENCE SCOPE (read first — pick sources before writing):
- Scope for this turn: ${label}
${primary}
${forbid}
${compare}
${completedSetsRule}${topicLine}${sessionTypeNote}${projectionFallback}${benchSubsectionLockNote}
- Cross-context bleed: never let Lift A’s trend or Session B’s numbers answer a question that was about Lift C or Session D unless you label it as optional context and the user asked broadly.`;
}
