import { getCompletedLoggedSets } from "@/lib/completedSets";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

export type SessionReviewVariant = "most_recent" | "volume_bench";

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortWorkoutsNewestFirst(workouts: StoredWorkout[]): StoredWorkout[] {
  return [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
}

/** First matching rule wins — keep in sync with `classifyAssistantIntent` session_review branch. */
export function parseSessionReviewVariant(message: string): SessionReviewVariant | null {
  const t = message.trim().toLowerCase();
  if (!t) return null;

  const hasSessionOrWorkout = /\b(session|workouts?)\b/.test(t);
  const recencyOrWhat =
    /\b(last|latest|most recent|previous)\b/.test(t) || /\bwhat happened\b/.test(t);

  if (
    hasSessionOrWorkout &&
    /\bvolume\b/.test(t) &&
    /\bbench\b/.test(t) &&
    recencyOrWhat
  ) {
    return "volume_bench";
  }

  const reviewLike =
    /\breview\b/.test(t) ||
    /\brecap\b/.test(t) ||
    /\bwalk me through\b/.test(t) ||
    /\bwhat happened\b/.test(t);

  const anchoredSession =
    /\b(this|that)\s+session\b/.test(t) ||
    (/\bsession\b/.test(t) && /\b(last|latest|most recent|previous)\b/.test(t)) ||
    /\brecent\s+session\b/.test(t);

  const anchoredWorkout =
    /\bworkouts?\b/.test(t) &&
    /\b(last|latest|most recent|previous)\b/.test(t) &&
    !/\bworkout\s+plan\b/.test(t);

  if (reviewLike && (anchoredSession || anchoredWorkout)) return "most_recent";

  return null;
}

function workoutHasBenchLike(exercises: StoredWorkout["exercises"]): boolean {
  return (exercises ?? []).some((ex) => /\bbench\b/i.test(ex.name ?? ""));
}

function pickVolumeBenchWorkout(sorted: StoredWorkout[]): StoredWorkout | null {
  const withBench = sorted.filter((w) => workoutHasBenchLike(w.exercises));
  if (withBench.length === 0) return null;
  const volumeNamed = withBench.find((w) => /\bvolume\b|\bvol\b/i.test(w.name ?? ""));
  return volumeNamed ?? withBench[0];
}

function pickMostRecentWorkout(sorted: StoredWorkout[]): StoredWorkout | null {
  return sorted[0] ?? null;
}

function pickWorkout(
  workouts: StoredWorkout[] | undefined,
  variant: SessionReviewVariant
): StoredWorkout | null {
  if (!workouts?.length) return null;
  const sorted = sortWorkoutsNewestFirst(workouts);
  if (variant === "volume_bench") return pickVolumeBenchWorkout(sorted);
  return pickMostRecentWorkout(sorted);
}

function findPreviousWorkout(sorted: StoredWorkout[], current: StoredWorkout): StoredWorkout | undefined {
  const idx = sorted.indexOf(current);
  if (idx < 0 || idx + 1 >= sorted.length) return undefined;
  return sorted[idx + 1];
}

function formatSetLine(
  sets: { weight: string; reps: string; notes?: string; rir?: number }[]
): string {
  const done = getCompletedLoggedSets(sets ?? []);
  if (done.length === 0) return "(no completed sets logged)";
  return done
    .map((s) => {
      const w = String(s.weight ?? "").trim() || "—";
      const r = String(s.reps ?? "").trim() || "—";
      const parts: string[] = [`${w}×${r}`];
      if (typeof s.rir === "number" && Number.isFinite(s.rir)) parts.push(`RIR ${s.rir}`);
      if (s.notes?.trim()) parts.push(`notes: ${s.notes.trim()}`);
      return parts.join(" ");
    })
    .join("; ");
}

export type BuildSessionReviewAnchorParams = {
  message: string;
  recentWorkouts: StoredWorkout[] | undefined;
  /** Shown in anchor for clarity — does not convert weights */
  unitLabel?: string;
};

/**
 * Authoritative text block for session-review prompts: exact exercises, completed sets only,
 * and evidence-gated wording for "introduced" vs prior session.
 */
export function buildSessionReviewAnchorBlock(params: BuildSessionReviewAnchorParams): string {
  const variant = parseSessionReviewVariant(params.message);
  if (!variant) {
    return "=== SESSION ANCHOR ===\n(internal: no session-review variant parsed — treat as normal coaching request)\n";
  }

  const workouts = params.recentWorkouts;
  if (!workouts?.length) {
    return `=== SESSION ANCHOR ===
No recent workouts were included in this request. You cannot review a specific logged session. Say so briefly and suggest they log or sync a workout, or retry from the app.`;
  }

  const sorted = sortWorkoutsNewestFirst(workouts);
  const workout = pickWorkout(workouts, variant);
  if (!workout) {
    return `=== SESSION ANCHOR ===
No workout in the payload matched this request (e.g. volume bench session not found). Say what is missing in one short phrase; do not invent session details.`;
  }

  const previous = findPreviousWorkout(sorted, workout);
  const prevNames = new Set(
    (previous?.exercises ?? [])
      .map((e) => normalizeExerciseName(e.name))
      .filter(Boolean)
  );

  const lines: string[] = [];
  lines.push("=== SESSION ANCHOR (AUTHORITATIVE FOR THIS QUESTION) ===");
  lines.push(
    "Use ONLY the exercises and set lines below for session review. Ignore exerciseTrends, trainingInsights, trainingSummary.recentExercises, coach tab summaries, and chat history for naming lifts."
  );
  lines.push(`Review variant: ${variant === "volume_bench" ? "last volume-style bench session in payload" : "most recent session in payload"}`);
  lines.push(`Unit label (display): ${params.unitLabel?.trim() || "kg"}`);
  lines.push(`Session date: ${workout.completedAt.length >= 10 ? workout.completedAt.slice(0, 10) : workout.completedAt}`);
  if (workout.name?.trim()) lines.push(`Logged session name: ${workout.name.trim()}`);
  if (typeof workout.durationSec === "number" && workout.durationSec > 0) {
    lines.push(`Logged duration: ${workout.durationSec} seconds`);
  }

  const exerciseLines: string[] = [];
  let totalCompletedSets = 0;
  for (const ex of workout.exercises ?? []) {
    const name = ex.name?.trim() || "Exercise";
    const done = getCompletedLoggedSets(ex.sets ?? []);
    totalCompletedSets += done.length;
    const setStr = formatSetLine(ex.sets ?? []);
    exerciseLines.push(`- ${name}: ${setStr}`);
  }
  lines.push(`Total completed sets (this session, counted): ${totalCompletedSets}`);
  lines.push("EXERCISES (only mention these by name):");
  lines.push(exerciseLines.length ? exerciseLines.join("\n") : "- (none listed)");

  const currentKeys = (workout.exercises ?? [])
    .map((e) => normalizeExerciseName(e.name))
    .filter(Boolean);
  const introduced = currentKeys.filter((k) => !prevNames.has(k));
  if (previous) {
    lines.push(
      `Immediately prior logged session (for name comparison only): ${previous.completedAt.slice(0, 10)}${previous.name?.trim() ? ` — ${previous.name.trim()}` : ""}`
    );
    if (introduced.length) {
      lines.push(
        `OK to describe as "new vs that immediately prior session" (by name match only): ${introduced.join(", ")}`
      );
      lines.push(
        "For any other exercise, use safer wording: included, featured, or part of the session — not introduced/newly added."
      );
    } else {
      lines.push(
        'No exercise names in this session are absent from the immediately prior session (normalized string match). Do NOT say any lift was "introduced", "newly added", or "newly included".'
      );
    }
  } else {
    lines.push(
      "No immediately prior logged session in payload for comparison. Do NOT claim any exercise was introduced, newly added, or newly included."
    );
  }

  lines.push("ANSWER STRUCTURE (required):");
  lines.push("A) Session focus/type (from logged name + movement pattern in the list only).");
  lines.push("B) Key exercises and performance — quote the set lines above verbatim for weights×reps.");
  lines.push("C) One or two implications tied only to those numbers.");
  lines.push("D) Stay specific; do not drift to other sessions or trends.");

  return lines.join("\n");
}
