import { getCompletedLoggedSets } from "@/lib/completedSets";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

export type SessionBodyTag = "chest" | "back" | "legs" | "shoulders" | "arms";

/** How to choose which logged session to anchor for session-review questions. */
export type SessionReviewSelection =
  | { mode: "most_recent" }
  | { mode: "volume_bench" }
  | { mode: "body_day"; tags: SessionBodyTag[] };

/** @deprecated use SessionReviewSelection via parseSessionReviewSelection */
export type SessionReviewVariant = "most_recent" | "volume_bench";

function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function sortWorkoutsNewestFirst(workouts: StoredWorkout[]): StoredWorkout[] {
  return [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
}

function exerciseTextBlob(w: StoredWorkout): string {
  return (w.exercises ?? [])
    .map((e) => (e.name ?? "").toLowerCase())
    .join(" ");
}

function workoutMatchesBodyTag(w: StoredWorkout, tag: SessionBodyTag): boolean {
  const blob = exerciseTextBlob(w);
  switch (tag) {
    case "chest":
      return /\b(bench|incline|decline|chest|fly|pec|dip)\b/.test(blob);
    case "back":
      return /\b(row|pull[\s-]?up|pullup|chin[\s-]?up|pulldown|lat pulldown|t[\s-]?bar)\b/.test(blob);
    case "legs":
      return /\b(squat|leg press|lunge|rdl|romanian|leg curl|leg extension|calf|hack squat)\b/.test(blob);
    case "shoulders":
      return /\b(shoulder|ohp|overhead|lateral raise|rear delt|face pull)\b/.test(blob);
    case "arms":
      return /\b(curl|tricep|bicep|pushdown|skull|hammer curl)\b/.test(blob);
    default:
      return false;
  }
}

function pickBodyDayWorkout(sorted: StoredWorkout[], tags: SessionBodyTag[]): StoredWorkout | null {
  const uniq = [...new Set(tags)];
  for (const w of sorted) {
    if (uniq.every((tag) => workoutMatchesBodyTag(w, tag))) return w;
  }
  return null;
}

/** First matching rule wins — keep in sync with `classifyAssistantQuestionKind` session_review branch. */
export function parseSessionReviewSelection(message: string): SessionReviewSelection | null {
  const t = message.trim().toLowerCase();
  if (!t) return null;

  const hasSessionOrWorkout = /\b(session|workouts?|day)\b/.test(t);
  const recencyOrWhat =
    /\b(last|latest|most recent|previous)\b/.test(t) || /\bwhat happened\b/.test(t);

  const reviewLike =
    /\breview\b/.test(t) ||
    /\bthoughts\b/.test(t) ||
    /\brecap\b/.test(t) ||
    /\bwalk me through\b/.test(t) ||
    /\bwhat happened\b/.test(t) ||
    /\bhow was\b/.test(t);

  if (
    hasSessionOrWorkout &&
    /\bvolume\b/.test(t) &&
    /\bbench\b/.test(t) &&
    recencyOrWhat
  ) {
    return { mode: "volume_bench" };
  }

  if (
    (reviewLike || /\bhow was\b/.test(t)) &&
    recencyOrWhat &&
    /\bchest\b/.test(t) &&
    /\bback\b/.test(t) &&
    /\b(session|workout|day)\b/.test(t)
  ) {
    return { mode: "body_day", tags: ["chest", "back"] };
  }

  const anchoredSession =
    /\b(this|that)\s+session\b/.test(t) ||
    (/\bsession\b/.test(t) && /\b(last|latest|most recent|previous)\b/.test(t)) ||
    /\brecent\s+session\b/.test(t);

  const anchoredWorkout =
    /\bworkouts?\b/.test(t) &&
    /\b(last|latest|most recent|previous)\b/.test(t) &&
    !/\bworkout\s+plan\b/.test(t);

  if (reviewLike && (anchoredSession || anchoredWorkout)) return { mode: "most_recent" };

  return null;
}

/** Back-compat: volume_bench | most_recent only (body_day → most_recent fallback unused — use parseSessionReviewSelection). */
export function parseSessionReviewVariant(message: string): SessionReviewVariant | null {
  const s = parseSessionReviewSelection(message);
  if (!s) return null;
  if (s.mode === "volume_bench") return "volume_bench";
  return "most_recent";
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

function pickWorkoutForSelection(
  workouts: StoredWorkout[] | undefined,
  selection: SessionReviewSelection
): StoredWorkout | null {
  if (!workouts?.length) return null;
  const sorted = sortWorkoutsNewestFirst(workouts);
  if (selection.mode === "volume_bench") return pickVolumeBenchWorkout(sorted);
  if (selection.mode === "body_day") return pickBodyDayWorkout(sorted, selection.tags);
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

function normalizedExerciseKeys(w: StoredWorkout): string[] {
  const keys = (w.exercises ?? [])
    .map((e) => normalizeExerciseName(e.name))
    .filter(Boolean);
  return [...new Set(keys)];
}

function jaccardExerciseOverlap(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

function sharedExerciseCount(a: string[], b: string[]): number {
  const B = new Set(b);
  return a.filter((k) => B.has(k)).length;
}

/**
 * Pick one older session in the payload to compare for progression/structure.
 * 1) Same logged session `name` as current (newest older match).
 * 2) Else best Jaccard overlap on exercise names with ≥2 shared lifts and Jaccard ≥ 0.4.
 */
function findSimilarPriorWorkout(
  sorted: StoredWorkout[],
  current: StoredWorkout
): { workout: StoredWorkout; reason: string } | null {
  const currentKeys = normalizedExerciseKeys(current);
  const cn = current.name?.trim().toLowerCase() ?? "";

  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i];
    if (cn && w.name?.trim().toLowerCase() === cn) {
      return {
        workout: w,
        reason: `Same logged session name as current ("${current.name?.trim()}") — newest older occurrence in payload.`,
      };
    }
  }

  let best: StoredWorkout | null = null;
  let bestJac = 0;
  for (let i = 1; i < sorted.length; i++) {
    const w = sorted[i];
    const wk = normalizedExerciseKeys(w);
    const shared = sharedExerciseCount(currentKeys, wk);
    const jac = jaccardExerciseOverlap(currentKeys, wk);
    if (shared >= 2 && jac >= 0.4 && jac > bestJac) {
      bestJac = jac;
      best = w;
    }
  }
  if (best) {
    const sh = sharedExerciseCount(currentKeys, normalizedExerciseKeys(best));
    return {
      workout: best,
      reason: `Best exercise overlap among older sessions in payload (Jaccard ${bestJac.toFixed(2)}, ${sh} shared exercise name(s), min 2 required).`,
    };
  }
  return null;
}

function primaryMovementTag(name: string): string {
  const n = name.toLowerCase();
  if (
    /\b(squat|deadlift|leg press|lunge|\brdl\b|romanian|hamstring curl|leg curl|leg extension|calf raise|hip thrust|glute bridge|split squat|step[\s-]?up)\b/.test(
      n
    )
  ) {
    return "legs";
  }
  if (/\b(pull[\s-]?up|chin[\s-]?up|lat pull|pulldown)\b/.test(n)) {
    return "vertical_pull";
  }
  if (/\b(row|t[\s-]?bar|pendlay|seal row|cable row|machine row|barbell row)\b/.test(n)) {
    return "horizontal_pull";
  }
  if (
    /\b(ohp|overhead press|shoulder press|military press|arnold press|z press|push press)\b/.test(n)
  ) {
    return "vertical_push";
  }
  if (
    /\b(bench|incline|decline|fly|chest press|push[\s-]?up|dip)\b/.test(n) &&
    !/\bshoulder\b.*\bpress\b/.test(n)
  ) {
    return "horizontal_push";
  }
  return "other";
}

function sessionStructureSummary(workout: StoredWorkout): {
  exerciseCount: number;
  totalCompletedSets: number;
  setCountByTag: Record<string, number>;
  exerciseCountByTag: Record<string, number>;
} {
  const setCountByTag: Record<string, number> = {};
  const exerciseCountByTag: Record<string, number> = {};
  let totalCompletedSets = 0;
  const exercises = workout.exercises ?? [];
  for (const ex of exercises) {
    const tag = primaryMovementTag(ex.name ?? "");
    exerciseCountByTag[tag] = (exerciseCountByTag[tag] ?? 0) + 1;
    const done = getCompletedLoggedSets(ex.sets ?? []);
    totalCompletedSets += done.length;
    setCountByTag[tag] = (setCountByTag[tag] ?? 0) + done.length;
  }
  return {
    exerciseCount: exercises.length,
    totalCompletedSets,
    setCountByTag,
    exerciseCountByTag,
  };
}

function formatTagRecord(r: Record<string, number>): string {
  return Object.entries(r)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${k}:${n}`)
    .join(", ");
}

function collectRirSummaryForWorkout(workout: StoredWorkout): string {
  const rirs: number[] = [];
  for (const ex of workout.exercises ?? []) {
    for (const s of getCompletedLoggedSets(ex.sets ?? [])) {
      if (typeof s.rir === "number" && Number.isFinite(s.rir)) rirs.push(s.rir);
    }
  }
  if (rirs.length === 0) {
    return "No RIR logged on any completed set in this session — do not imply you know RIR; you may infer effort only from load/rep patterns and label as estimate.";
  }
  const min = Math.min(...rirs);
  const max = Math.max(...rirs);
  const avg = rirs.reduce((a, b) => a + b, 0) / rirs.length;
  return `RIR logged on ${rirs.length} completed set(s): min ${min}, max ${max}, avg ${avg.toFixed(1)}.`;
}

function priorPerformancesForExercise(
  sorted: StoredWorkout[],
  currentIdx: number,
  exerciseNameNorm: string,
  maxSessions: number
): Array<{ date: string; rawName: string; line: string }> {
  const out: Array<{ date: string; rawName: string; line: string }> = [];
  for (let i = currentIdx + 1; i < sorted.length && out.length < maxSessions; i++) {
    const w = sorted[i];
    const ex = (w.exercises ?? []).find((e) => normalizeExerciseName(e.name) === exerciseNameNorm);
    if (!ex) continue;
    const line = formatSetLine(ex.sets ?? []);
    if (line === "(no completed sets logged)") continue;
    out.push({
      date: w.completedAt.length >= 10 ? w.completedAt.slice(0, 10) : w.completedAt,
      rawName: ex.name?.trim() || "Exercise",
      line,
    });
  }
  return out;
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
  const selection = parseSessionReviewSelection(params.message);
  if (!selection) {
    return "=== SESSION ANCHOR ===\n(internal: no session-review variant parsed — treat as normal coaching request)\n";
  }

  const workouts = params.recentWorkouts;
  if (!workouts?.length) {
    return `=== SESSION ANCHOR ===
No recent workouts were included in this request. You cannot review a specific logged session. Say so briefly and suggest they log or sync a workout, or retry from the app.`;
  }

  const sorted = sortWorkoutsNewestFirst(workouts);
  const workout = pickWorkoutForSelection(workouts, selection);
  if (!workout) {
    const hint =
      selection.mode === "body_day"
        ? `No logged session in the payload contains both ${selection.tags.join(" and ")} patterns (keyword match on exercise names).`
        : "No workout in the payload matched this request (e.g. volume bench session not found).";
    return `=== SESSION ANCHOR ===
${hint} Say what is missing in one short phrase; do not invent session details.`;
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
    "Use ONLY EXERCISES below for lift names. Ignore exerciseTrends, trainingInsights, trainingSummary.recentExercises, coach tab summaries, and chat for naming lifts. RECENT SESSION ORDER is dates/session titles only (no extra exercises)."
  );
  lines.push(
    `Review selection: ${
      selection.mode === "volume_bench"
        ? "last volume-style bench session in payload"
        : selection.mode === "body_day"
          ? `newest session whose exercises match body tags: ${selection.tags.join(" + ")} (keyword heuristic on names)`
          : "most recent session in payload"
    }`
  );
  lines.push(`Unit label (display): ${params.unitLabel?.trim() || "kg"}`);
  lines.push(`Session date: ${workout.completedAt.length >= 10 ? workout.completedAt.slice(0, 10) : workout.completedAt}`);
  if (workout.name?.trim()) lines.push(`Logged session name: ${workout.name.trim()}`);
  if (typeof workout.durationSec === "number" && workout.durationSec > 0) {
    lines.push(`Logged duration: ${workout.durationSec} seconds`);
  }

  const currentIdx = sorted.indexOf(workout);
  const structure = sessionStructureSummary(workout);
  lines.push(
    `SESSION STRUCTURE (computed from this session only): ${structure.exerciseCount} exercise slot(s), ${structure.totalCompletedSets} completed set(s).`
  );
  lines.push(`Sets by movement heuristic: ${formatTagRecord(structure.setCountByTag) || "n/a"}.`);
  lines.push(
    `Exercises by movement heuristic: ${formatTagRecord(structure.exerciseCountByTag) || "n/a"}.`
  );
  lines.push(
    "Movement tags are keyword guesses from exercise names — use as soft structure hints, not anatomy claims."
  );
  lines.push(collectRirSummaryForWorkout(workout));

  lines.push("RECENT SESSION ORDER IN PAYLOAD (dates + logged names only — no other exercises; use for where this day may sit in the week):");
  for (let i = 0; i < Math.min(8, sorted.length); i++) {
    const w = sorted[i];
    const d = w.completedAt.length >= 10 ? w.completedAt.slice(0, 10) : w.completedAt;
    const label = i === 0 ? " ← ANCHORED (this question)" : "";
    lines.push(`  ${i + 1}. ${d}: ${w.name?.trim() || "(unnamed session)"}${label}`);
  }

  const exerciseLines: string[] = [];
  for (const ex of workout.exercises ?? []) {
    const name = ex.name?.trim() || "Exercise";
    const setStr = formatSetLine(ex.sets ?? []);
    exerciseLines.push(`- ${name}: ${setStr}`);
  }
  lines.push(`Total completed sets (this session, counted): ${structure.totalCompletedSets}`);
  lines.push("EXERCISES (only mention these by name in your answer):");
  lines.push(exerciseLines.length ? exerciseLines.join("\n") : "- (none listed)");

  lines.push(
    "PER-EXERCISE PRIOR LOGS (older sessions in payload, same normalized exercise name — use for progression; do not name lifts that are not in EXERCISES above):"
  );
  const newBaselineExerciseNames: string[] = [];
  const comparableExerciseNames: string[] = [];
  for (const ex of workout.exercises ?? []) {
    const raw = ex.name?.trim() || "Exercise";
    const key = normalizeExerciseName(raw);
    if (!key) continue;
    const priors = priorPerformancesForExercise(sorted, currentIdx, key, 2);
    if (priors.length === 0) {
      lines.push(`- ${raw}: no older logged performances of this name in payload.`);
      newBaselineExerciseNames.push(raw);
    } else {
      for (const p of priors) {
        lines.push(`- ${raw}: on ${p.date} → ${p.line}`);
      }
      comparableExerciseNames.push(raw);
    }
  }

  lines.push("COMPARISON GROUNDING (mandatory — your reply must respect this):");
  if (newBaselineExerciseNames.length > 0) {
    lines.push(
      `NEW BASELINE / NO TREND DATA for these lifts (no older log lines above for this name): ${newBaselineExerciseNames.join(
        ", "
      )}.`
    );
    lines.push(
      "For each of those: this session establishes a baseline only. Do NOT imply usual, typical, normal, trend, decline, progress, better/worse vs history, or “compared to what you normally do” — there is no prior performance in the payload to support that."
    );
    lines.push(
      'Allowed phrasing: "first logged session for this lift in the data here", "sets a baseline", "no direct trend yet", "trend confidence is limited until more sessions are logged".'
    );
  }
  if (comparableExerciseNames.length > 0) {
    lines.push(
      `COMPARABLE TO PRIOR LOG ONLY: ${comparableExerciseNames.join(
        ", "
      )}. For these, you may say improved / held steady / dipped slightly ONLY versus the specific prior dates and set lines above — hedge if mixed or ambiguous.`
    );
  }
  if (newBaselineExerciseNames.length === 0 && comparableExerciseNames.length === 0) {
    lines.push("(No named exercises in session for comparison grouping.)");
  }

  const similar = findSimilarPriorWorkout(sorted, workout);
  if (similar) {
    const pw = similar.workout;
    const ps = sessionStructureSummary(pw);
    const sharedKeys = normalizedExerciseKeys(workout).filter((k) =>
      normalizedExerciseKeys(pw).includes(k)
    );
    lines.push("SIMILAR PRIOR SESSION (for comparison — logic described on next line):");
    lines.push(`Selection: ${similar.reason}`);
    lines.push(
      `That session: ${pw.completedAt.slice(0, 10)}; name: ${pw.name?.trim() || "(unnamed)"}; ${ps.exerciseCount} exercise slots; ${ps.totalCompletedSets} completed sets; sets-by-tag: ${formatTagRecord(ps.setCountByTag)}.`
    );
    lines.push("Shared exercises only (performance from that prior session) — quote when comparing:");
    for (const key of sharedKeys) {
      const ex = (pw.exercises ?? []).find((e) => normalizeExerciseName(e.name) === key);
      if (!ex) continue;
      const disp = ex.name?.trim() || key;
      lines.push(`- ${disp}: ${formatSetLine(ex.sets ?? [])}`);
    }
  } else {
    lines.push(
      "SIMILAR PRIOR SESSION: none identified in payload (need same session name, or ≥2 shared exercise names with Jaccard ≥ 0.4 vs current). Compare using PER-EXERCISE PRIOR LOGS only, or say history is thin."
    );
  }

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

  lines.push("HOW TO USE THIS ANCHOR (reasoning vs what the user sees):");
  lines.push(
    "Use SESSION STRUCTURE, PER-EXERCISE PRIOR LOGS, SIMILAR PRIOR SESSION, and EXERCISES internally to reason — but speak to the user like a sharp coach in plain language, not an analyst exporting stats."
  );
  lines.push(
    "Default shape: (A) one-line verdict, blank line, (B) 3–4 bullets covering progressed vs prior / stable vs slight dip / new-baseline-only per COMPARISON GROUNDING, blank line, (C) one direct Next step — ~80–160 words; blank lines between sections. Do not restate every set unless asked. Hedge fatigue/form per INFERENCE & CERTAINTY. Avoid sounding like a lab report (no min/max rep summaries, no average RIR decimals) unless the user asked for that level of detail."
  );
  lines.push(
    "Optional deeper layer (after one blank line, only if useful): section titles Evidence / Compared to last time / Why this matters (plain lines), each followed by short bullets; no A), B), C) labels."
  );
  lines.push("Never name a lift outside EXERCISES. No vague praise without a concrete anchor fact.");

  return lines.join("\n");
}
