/**
 * Extract structured workouts the assistant previously returned (thread payload)
 * and format them for model prompts — full detail, not chat truncation.
 */

export type ThreadStructuredWorkout = {
  sessionTitle?: string;
  sessionGoal?: string;
  purposeSummary?: string;
  note?: string;
  exercises?: Array<{
    slotLabel?: string;
    slot?: string;
    exerciseName?: string;
    exercise?: string;
    sets?: string;
    reps?: string;
    rir?: string;
    rest?: string;
    rationale?: string;
  }>;
};

export type ThreadMessageWithWorkout = {
  role: string;
  workout?: ThreadStructuredWorkout;
};

function hasUsableExercises(w: ThreadStructuredWorkout): boolean {
  const ex = w.exercises;
  return Array.isArray(ex) && ex.length > 0;
}

/** Most recent first: walks thread from newest assistant messages backward. */
export function extractRecentAssistantWorkoutsFromThread(
  threadMessages: ThreadMessageWithWorkout[] | undefined,
  maxSessions = 5
): ThreadStructuredWorkout[] {
  if (!threadMessages?.length) return [];
  const out: ThreadStructuredWorkout[] = [];
  for (let i = threadMessages.length - 1; i >= 0 && out.length < maxSessions; i--) {
    const m = threadMessages[i];
    if (m?.role !== "assistant" || !m.workout) continue;
    if (!hasUsableExercises(m.workout)) continue;
    out.push(m.workout);
  }
  return out;
}

function exerciseLine(ex: NonNullable<ThreadStructuredWorkout["exercises"]>[number]): string {
  const name = (ex.exerciseName ?? ex.exercise ?? "").trim() || "Exercise";
  const slot = (ex.slotLabel ?? ex.slot ?? "").trim();
  const slotPart = slot ? `${slot}: ` : "";
  const sets = (ex.sets ?? "").trim();
  const reps = (ex.reps ?? "").trim();
  const rir = (ex.rir ?? "").trim();
  const rest = (ex.rest ?? "").trim();
  const rat = (ex.rationale ?? "").trim();
  const dose = [sets && `sets ${sets}`, reps && `reps ${reps}`, rir && `RIR ${rir}`, rest && `rest ${rest}`]
    .filter(Boolean)
    .join(", ");
  const tail = rat ? ` — ${rat}` : "";
  return `- ${slotPart}${name}${dose ? ` (${dose})` : ""}${tail}`;
}

export function formatAssistantBuiltWorkoutsForPrompt(sessions: ThreadStructuredWorkout[]): string {
  if (!sessions.length) return "";
  const parts: string[] = [
    "BUILT SESSIONS FROM THIS CHAT (authoritative — the assistant generated these; use them for any question about “this workout”, “that session”, “what you gave me”, exercise order, or prescriptions below):",
  ];
  sessions.forEach((w, idx) => {
    const label = idx === 0 ? "Most recent built session" : `Earlier built session ${idx + 1}`;
    const title = (w.sessionTitle ?? "").trim() || "Workout";
    const goal = (w.sessionGoal ?? w.purposeSummary ?? "").trim();
    const note = (w.note ?? "").trim();
    parts.push(`\n## ${label}: ${title}`);
    if (goal) parts.push(`Goal: ${goal}`);
    if (note) parts.push(`Session note: ${note}`);
    parts.push("Exercises:");
    for (const ex of w.exercises ?? []) {
      parts.push(exerciseLine(ex));
    }
  });
  parts.push(
    "\nRules: When the user asks about a workout from this chat, ground your answer in the blocks above. If they refer to “the last” or “this” workout, use the most recent block unless they clearly mean an earlier one."
  );
  return parts.join("\n");
}
