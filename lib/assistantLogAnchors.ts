import { getCompletedLoggedSets, isCompletedLoggedSet } from "@/lib/completedSets";
import { exerciseKey } from "@/lib/trainingMetrics";
import type { StoredWorkout } from "@/lib/trainingAnalysis";

export type ResolvedExercise = { displayName: string; key: string };

function collectExerciseNamePool(
  workouts: StoredWorkout[] | undefined,
  recentExercises: string[]
): string[] {
  const set = new Set<string>();
  for (const w of workouts ?? []) {
    for (const ex of w.exercises ?? []) {
      const n = ex.name?.trim();
      if (n) set.add(n);
    }
  }
  for (const r of recentExercises) {
    const n = r?.trim();
    if (n) set.add(n);
  }
  return [...set];
}

function normMsg(s: string): string {
  return s
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreExerciseMatch(msgNorm: string, exerciseName: string): number {
  const key = exerciseKey(exerciseName);
  if (!key) return 0;
  const k = normMsg(key);
  if (msgNorm.includes(k)) return 100 + k.length;
  const parts = k.split(" ").filter((p) => p.length > 2);
  if (parts.length === 0) return 0;
  const hits = parts.filter((p) => msgNorm.includes(p)).length;
  if (hits === 0) return 0;
  return Math.round((hits / parts.length) * 40) + hits * 10;
}

/**
 * Best-effort match of user text to a logged exercise name (pool from workouts + recentExercises).
 * Uses activeExerciseTopic for vague follow-ups ("what about it?") when score is weak.
 */
export function resolveExerciseFromMessage(
  message: string,
  workouts: StoredWorkout[] | undefined,
  recentExercises: string[],
  activeExerciseTopic?: string
): ResolvedExercise | null {
  const msgNorm = normMsg(message);
  const pool = collectExerciseNamePool(workouts, recentExercises);

  let best: ResolvedExercise & { score: number } | null = null;
  for (const name of pool) {
    const sc = scoreExerciseMatch(msgNorm, name);
    if (sc > 0 && (!best || sc > best.score)) {
      best = { displayName: name, key: exerciseKey(name), score: sc };
    }
  }

  const vagueFollowUp =
    /\b(it|this exercise|that exercise|that lift|same (lift|exercise))\b/.test(msgNorm) ||
    /^what about (that|this)\??$/i.test(message.trim());

  if (activeExerciseTopic?.trim() && (vagueFollowUp || (best && best.score < 30))) {
    const name = activeExerciseTopic.trim();
    const k = exerciseKey(name);
    const sc = scoreExerciseMatch(msgNorm, name);
    if (vagueFollowUp || sc >= 40 || !best) {
      return { displayName: name, key: k };
    }
  }

  if (best && best.score >= 22) {
    return { displayName: best.displayName, key: best.key };
  }
  return null;
}

function formatCompactSets(
  sets: Array<{ weight?: string; reps?: string; rir?: number; notes?: string }>
): string {
  return sets
    .map((s) => {
      const w = String(s.weight ?? "").trim() || "—";
      const r = String(s.reps ?? "").trim() || "—";
      let t = `${w}×${r}`;
      if (typeof s.rir === "number" && Number.isFinite(s.rir)) t += `@RIR${s.rir}`;
      return t;
    })
    .join(", ");
}

/**
 * Timeline of one exercise across recent workouts — completed sets only, with incomplete row counts.
 */
export function buildExerciseLogAnchorBlock(params: {
  workouts: StoredWorkout[] | undefined;
  exerciseKey: string;
  displayName: string;
  maxSessions?: number;
}): string {
  const sorted = [...(params.workouts ?? [])].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );
  const lines: string[] = [];
  lines.push("=== EXERCISE LOG ANCHOR (AUTHORITATIVE FOR THIS QUESTION) ===");
  lines.push(`Locked exercise: ${params.displayName} (normalized key: ${params.exerciseKey})`);
  lines.push(
    "Default scope: this lift only — do not pivot to other exercises unless the user clearly asked."
  );
  lines.push(
    "COMPLETED vs INCOMPLETE: a set counts as completed performance only if reps are logged as a number > 0. Blank, zero, or missing reps are placeholders or incomplete — never quote them as work performed."
  );

  let n = 0;
  const max = params.maxSessions ?? 8;
  for (const w of sorted) {
    if (n >= max) break;
    const ex = (w.exercises ?? []).find((e) => exerciseKey(e.name) === params.exerciseKey);
    if (!ex) continue;
    const allSets = ex.sets ?? [];
    const completed = getCompletedLoggedSets(allSets);
    const incompleteSlots = allSets.filter((s) => !isCompletedLoggedSet(s)).length;
    const date = w.completedAt.length >= 10 ? w.completedAt.slice(0, 10) : w.completedAt;
    lines.push(
      `- ${date}: completed sets (${completed.length}): ${formatCompactSets(completed)}${
        incompleteSlots > 0
          ? ` | rows in log that are not completed sets: ${incompleteSlots} (do not treat as reps done)`
          : ""
      }`
    );
    n++;
  }

  if (n === 0) {
    lines.push("No sessions in payload contain this exercise (name key match). Say the payload has no match; do not invent sets.");
  }

  return lines.join("\n");
}
