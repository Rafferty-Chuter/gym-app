import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { getCompletedLoggedSets } from "@/lib/completedSets";
import { estimateE1RM, exerciseKey } from "@/lib/trainingMetrics";

export type BenchSessionSummary = {
  completedAt: string;
  sessionName: string;
  exerciseName: string;
  sets: Array<{ weight: number; reps: number; rir?: number }>;
  bestSet: { weight: number; reps: number; e1rm: number };
  avgRIR?: number;
};

export type BenchContextSummary = {
  latestHeavyBenchSession: BenchSessionSummary | null;
  latestVolumeBenchSession: BenchSessionSummary | null;
};

function isLikelyBenchExercise(name: string): boolean {
  const n = exerciseKey(name);
  if (!n) return false;
  if (
    /\b(incline|decline|smith|machine|cable|fly|flies|crossover|dumbbell|\bdb\b|dip|push[- ]?up|pullover|pec deck)\b/.test(
      n
    )
  ) {
    return false;
  }
  return /\bbench\b/.test(n) && /\bpress\b/.test(n);
}

function sessionHeavyHint(sessionName: string | undefined): boolean {
  if (!sessionName?.trim()) return false;
  return /\b(heavy|strength|max|intensity|top set|pr|peak)\b/i.test(sessionName);
}

function sessionVolumeHint(sessionName: string | undefined): boolean {
  if (!sessionName?.trim()) return false;
  return /\b(volume|vol|hypertrophy|light|back[- ]?off|rep)\b/i.test(sessionName);
}

function exerciseHeavyHint(exerciseName: string): boolean {
  return /\b(heavy|strength|max|top set|intensity)\b/i.test(exerciseName);
}

function exerciseVolumeHint(exerciseName: string): boolean {
  return /\b(volume|vol|hypertrophy|back[- ]?off|rep)\b/i.test(exerciseName);
}

function classifyBenchContext(sessionName: string | undefined, exerciseName: string): "heavy" | "volume" | "unknown" {
  const heavy = sessionHeavyHint(sessionName) || exerciseHeavyHint(exerciseName);
  const volume = sessionVolumeHint(sessionName) || exerciseVolumeHint(exerciseName);
  if (heavy && !volume) return "heavy";
  if (volume && !heavy) return "volume";
  return "unknown";
}

function parseSet(set: { weight?: string | number | null; reps?: string | number | null; rir?: number | null }) {
  const weight = typeof set.weight === "number" ? set.weight : parseFloat(String(set.weight ?? ""));
  const reps = typeof set.reps === "number" ? set.reps : parseFloat(String(set.reps ?? ""));
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return null;
  return {
    weight,
    reps,
    rir: typeof set.rir === "number" && Number.isFinite(set.rir) ? set.rir : undefined,
  };
}

function summarizeSession(
  workout: StoredWorkout,
  exerciseName: string,
  sets: Array<{ weight: number; reps: number; rir?: number }>
): BenchSessionSummary {
  const best = sets.reduce((a, b) =>
    b.weight > a.weight || (b.weight === a.weight && b.reps > a.reps) ? b : a
  );
  const rirVals = sets.map((s) => s.rir).filter((r): r is number => typeof r === "number");
  const avgRIR = rirVals.length ? rirVals.reduce((a, b) => a + b, 0) / rirVals.length : undefined;
  return {
    completedAt: workout.completedAt,
    sessionName: workout.name?.trim() || "Session",
    exerciseName,
    sets,
    bestSet: {
      weight: best.weight,
      reps: best.reps,
      e1rm: estimateE1RM(best.weight, best.reps),
    },
    ...(avgRIR !== undefined ? { avgRIR } : {}),
  };
}

export function buildBenchContextSummary(workouts: StoredWorkout[]): BenchContextSummary {
  const sorted = [...(workouts ?? [])].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  let latestHeavyBenchSession: BenchSessionSummary | null = null;
  let latestVolumeBenchSession: BenchSessionSummary | null = null;

  for (const w of sorted) {
    for (const ex of w.exercises ?? []) {
      const exName = ex.name?.trim() ?? "";
      if (!exName || !isLikelyBenchExercise(exName)) continue;
      const done = getCompletedLoggedSets(ex.sets ?? []);
      const parsed = done.map(parseSet).filter((s): s is { weight: number; reps: number; rir?: number } => Boolean(s));
      if (!parsed.length) continue;
      const ctx = classifyBenchContext(w.name, exName);
      const hasHeavyPattern = parsed.some((s) => s.reps <= 5);
      const hasVolumePattern = parsed.some((s) => s.reps >= 6);

      if (!latestHeavyBenchSession && (ctx === "heavy" || (ctx === "unknown" && hasHeavyPattern))) {
        latestHeavyBenchSession = summarizeSession(
          w,
          exName,
          parsed.filter((s) => s.reps <= 5 || ctx === "heavy")
        );
      }
      if (!latestVolumeBenchSession && (ctx === "volume" || (ctx === "unknown" && hasVolumePattern))) {
        latestVolumeBenchSession = summarizeSession(
          w,
          exName,
          parsed.filter((s) => s.reps >= 6 || ctx === "volume")
        );
      }
      if (latestHeavyBenchSession && latestVolumeBenchSession) break;
    }
    if (latestHeavyBenchSession && latestVolumeBenchSession) break;
  }

  return {
    latestHeavyBenchSession,
    latestVolumeBenchSession,
  };
}

