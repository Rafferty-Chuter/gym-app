import type { ExerciseTrendResult, StoredWorkout } from "@/lib/trainingAnalysis";
import { getCompletedLoggedSets } from "@/lib/completedSets";
import { estimateE1RM, exerciseKey } from "@/lib/trainingMetrics";

export type BenchProjectionPayload = {
  benchExerciseName: string;
  payloadUnit: "kg" | "lb";
  /**
   * Canonical current bench strength read for the assistant — max of session-best e1RM (Epley)
   * across recent logged sessions.
   */
  authoritativeEstimated1RM: number;
  /** Alias equal to authoritativeEstimated1RM (backward compatibility with older prompts). */
  currentEstimated1RM: number;
  estimateBasisLine: string;
  /** Honest scope: multi-session vs single-session; do not imply “only last workout” when n>1. */
  evidenceScopeLine: string;
  /** Logged benchmarks the model should quote for heavy- and volume-style work. */
  concreteHeavy: {
    loggedBenchmark: string;
    nearerTargetBand: string;
  };
  concreteVolume: {
    loggedBenchmark: string;
    nearerTargetBand: string;
  };
  /** Short readiness lines (“I’d start believing…”) tied to numbers. */
  readinessSignals: string[];
  recentBestSets: Array<{ completedAt: string; weight: number; reps: number; e1rm: number }>;
  /** Positive progression signal from logs, or null if none is clear. */
  progressionDeltaKgPerSession: number | null;
  progressionDeltaExplanation: string;
  target1RM?: number;
  sessionsEstimate: number | null;
  gapToTarget: number | null;
  /** Working weights derived from stated target 1RM (when a target was parsed). */
  workingWeights?: Array<{ reps: number; weight: number }>;
  heavyDay: {
    topSetKgMin: number;
    topSetKgMax: number;
    repRangeLabel: string;
    loggedTieIn: string;
  };
  heavyAnchor: { completedAt: string; weight: number; reps: number; rir?: number };
  volumeDay: {
    workingKgMin: number;
    workingKgMax: number;
    repRangeLabel: string;
    setsHint: string;
    loggedTieIn: string;
  };
  volumeAnchor: { completedAt: string; weight: number; reps: number; rir?: number } | null;
  readinessLines: string[];
  /** Premium in-app copy: concise, coach-like; deterministic reply and LLM default. */
  coachFacing: {
    evidenceLead: string;
    bestCurrentRead: string;
    heavyBenchDay: string;
    volumeBenchDay: string;
    whenTargetLooksRealistic: string;
    nextMove: string;
  };
  /** Forces model/deterministic to keep heavy vs volume subsections on separate anchors. */
  subsectionEvidenceLock: string;
};

function formatIsoDate(iso: string): string {
  return iso.length >= 10 ? iso.slice(0, 10) : iso;
}

/** Epley inverse: weight for a given rep count at estimated e1RM. */
function weightForRepsAtE1RM(e1rm: number, reps: number): number {
  return e1rm / (1 + reps / 30);
}

export function parseBenchTargetFromText(
  text: string,
  profileUnit: "kg" | "lb",
  opts?: { allowGoalNumbersWithoutBenchWord?: boolean }
): { value: number; unit: "kg" | "lb" } | null {
  const t = text.trim();
  if (opts?.allowGoalNumbersWithoutBenchWord && /\b(1rm|e1rm|one rep max|one-rep max)\b/i.test(t)) {
    const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms|lb|lbs|pounds)\b/i);
    if (m) {
      const v = parseFloat(m[1]);
      const unit: "kg" | "lb" = /kg|kgs|kilogram/i.test(m[2]) ? "kg" : "lb";
      return { value: v, unit };
    }
  }
  const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms)\b/i);
  if (m) return { value: parseFloat(m[1]), unit: "kg" };
  const m2 = t.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|pounds)\b/i);
  if (m2) return { value: parseFloat(m2[1]), unit: "lb" };
  const num = t.match(/\b(\d{2,3}(?:\.\d+)?)\b/);
  if (num && /\bbench\b|pb|bench press/i.test(t)) return { value: parseFloat(num[1]), unit: profileUnit };
  return null;
}

export function isBenchQuestionText(text: string): boolean {
  return /\bbench\b|pb|bench press|barbell bench/i.test(text.trim());
}

/** True when profile goal suggests bench/chest for ambiguous “1RM to X” questions. */
export function inferBenchFromPriorityGoal(priorityGoal?: string): boolean {
  const g = (priorityGoal ?? "").trim().toLowerCase();
  if (!g) return false;
  if (/increase squat|increase deadlift/.test(g)) return false;
  if (/\bbuild back\b/.test(g)) return false;
  if (/increase bench|build chest/.test(g)) return true;
  if (/improve overall strength|build overall muscle/.test(g)) return true;
  return false;
}

export function shouldBuildBenchProjectionPayload(message: string, priorityGoal?: string): boolean {
  if (isBenchQuestionText(message)) return true;
  if (!inferBenchFromPriorityGoal(priorityGoal)) return false;
  const t = message.trim().toLowerCase();
  if (!/\b(1rm|one rep max|one-rep max|e1rm)\b/.test(t)) return false;
  if (/\b(squat|deadlift|dead lift|sumo)\b/.test(t)) return false;
  return true;
}

type BenchAnchorRow = { completedAt: string; weight: number; reps: number; rir?: number };
type BenchContextKind = "heavy" | "volume" | "unknown";
type BenchAnchorTagged = BenchAnchorRow & { context: BenchContextKind; sourceName?: string };

/** Flat / barbell-style bench press names we may merge when the primary label differs (“Bench Press” vs “Barbell Bench Press”). */
export function isLikelyMainFlatBenchPressVariant(name: string): boolean {
  const n = exerciseKey(name);
  if (!n) return false;
  if (
    /\b(incline|decline|smith|machine|cable|fly|flies|crossover|dumbbell|\bdb\b|dip|push[- ]?ups?|pullover|pec deck|kickback)\b/.test(
      n
    )
  ) {
    return false;
  }
  if (/\bbench\b/.test(n) && /\bpress\b/.test(n)) return true;
  if (/\bbarbell\b/.test(n) && /\bbench\b/.test(n)) return true;
  if (/\b(close|narrow|wide)[-. ]?grip\b/.test(n) && /\bbench\b/.test(n)) return true;
  if (n === "bp" || /^bb bench\b/.test(n)) return true;
  return false;
}

function collectBenchPressScanKeys(workouts: StoredWorkout[], primaryBenchName: string): Set<string> {
  const keys = new Set<string>();
  const primary = exerciseKey(primaryBenchName);
  if (primary) keys.add(primary);

  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      const raw = ex.name?.trim() ?? "";
      if (!raw) continue;
      if (isLikelyMainFlatBenchPressVariant(raw)) keys.add(exerciseKey(raw));
    }
  }
  return keys;
}

function workoutVolumeSessionHint(sessionName: string | undefined): boolean {
  if (!sessionName?.trim()) return false;
  return /\b(volume|vol|hypertrophy|pump|light|accessory|back[- ]?off|rep)\b/i.test(sessionName);
}

function workoutHeavySessionHint(sessionName: string | undefined): boolean {
  if (!sessionName?.trim()) return false;
  return /\b(heavy|strength|max|pr|intensity|top set|peak)\b/i.test(sessionName);
}

function exerciseVolumeHint(exerciseName: string | undefined): boolean {
  if (!exerciseName?.trim()) return false;
  return /\b(volume|vol|hypertrophy|back[- ]?off|rep)\b/i.test(exerciseName);
}

function exerciseHeavyHint(exerciseName: string | undefined): boolean {
  if (!exerciseName?.trim()) return false;
  return /\b(heavy|strength|max|top set|intensity)\b/i.test(exerciseName);
}

function resolveBenchContextHint(
  workoutName: string | undefined,
  exerciseName: string | undefined
): BenchContextKind {
  const heavy = workoutHeavySessionHint(workoutName) || exerciseHeavyHint(exerciseName);
  const volume = workoutVolumeSessionHint(workoutName) || exerciseVolumeHint(exerciseName);
  if (heavy && !volume) return "heavy";
  if (volume && !heavy) return "volume";
  return "unknown";
}

function parseSetWeightReps(set: {
  weight?: string | number | null;
  reps?: string | number | null;
  rir?: number | null;
}): {
  weight: number;
  reps: number;
  rir?: number;
} | null {
  const wRaw = set.weight;
  const rRaw = set.reps;
  const weight =
    typeof wRaw === "number" && Number.isFinite(wRaw)
      ? wRaw
      : parseFloat(String(wRaw ?? "").trim().replace(",", "."));
  const reps =
    typeof rRaw === "number" && Number.isFinite(rRaw)
      ? rRaw
      : parseFloat(String(rRaw ?? "").trim().replace(",", "."));
  const rirRaw = set.rir;
  const rir =
    typeof rirRaw === "number" && Number.isFinite(rirRaw) ? rirRaw : undefined;
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || reps <= 0 || weight <= 0) return null;
  return { weight, reps, ...(rir !== undefined ? { rir } : {}) };
}

function estimateE1RMWithRIR(weight: number, reps: number, rir: number): number {
  const clamped = Math.min(Math.max(rir, 0), 3);
  return weight * (1 + (reps + clamped) / 30);
}

function volumeCandidateBeats(
  w: number,
  r: number,
  wSession: string | undefined,
  best: BenchAnchorRow | null,
  bestTonnage: number,
  bestVolHint: boolean
): boolean {
  const tonnage = w * r;
  if (!best) return true;
  if (r > best.reps) return true;
  if (r < best.reps) return false;
  if (tonnage > bestTonnage) return true;
  if (tonnage < bestTonnage) return false;
  const hint = workoutVolumeSessionHint(wSession);
  return hint && !bestVolHint;
}

function heavyCandidateBeats(
  w: number,
  r: number,
  wSession: string | undefined,
  best: BenchAnchorRow | null,
  bestHeavyHint: boolean
): boolean {
  if (!best) return true;
  if (w > best.weight) return true;
  if (w < best.weight) return false;
  if (r > best.reps) return true;
  if (r < best.reps) return false;
  const hint = workoutHeavySessionHint(wSession);
  return hint && !bestHeavyHint;
}

/**
 * Scan all completed bench sets in workouts — session trends only keep one “best” set per day,
 * which drops same-day volume work (e.g. 90×7 next to 100×3). This recovers separate anchors.
 * Uses all flat barbell-style bench names in history so volume logged under a different label is not missed.
 */
function scanBenchHeavyVolumeFromWorkouts(
  workouts: StoredWorkout[],
  scanKeys: Set<string>
): { heavy: BenchAnchorRow | null; volume: BenchAnchorRow | null } {
  const sorted = [...workouts].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  let heavy: BenchAnchorTagged | null = null;
  let heavyHint = false;
  let volume: BenchAnchorTagged | null = null;
  let volumeTonnage = -1;
  let volumeHint = false;
  let heavyNamed: BenchAnchorTagged | null = null;
  let heavyNamedHint = false;
  let volumeNamed: BenchAnchorTagged | null = null;
  let volumeNamedTonnage = -1;
  let volumeNamedHint = false;

  for (const w of sorted) {
    const sessionName = w.name;
    for (const ex of w.exercises ?? []) {
      if (!scanKeys.has(exerciseKey(ex.name ?? ""))) continue;
      const done = getCompletedLoggedSets(ex.sets ?? []);
      const context = resolveBenchContextHint(sessionName, ex.name);
      for (const s of done) {
        const parsed = parseSetWeightReps(s);
        if (!parsed) continue;
        const { weight, reps, rir } = parsed;

        if (reps <= 5) {
          if (context === "heavy") {
            if (heavyCandidateBeats(weight, reps, sessionName, heavyNamed, heavyNamedHint)) {
              heavyNamed = {
                completedAt: w.completedAt,
                weight,
                reps,
                ...(rir !== undefined ? { rir } : {}),
                context,
                sourceName: ex.name ?? sessionName,
              };
              heavyNamedHint = workoutHeavySessionHint(sessionName);
            }
          }
          if (heavyCandidateBeats(weight, reps, sessionName, heavy, heavyHint)) {
            heavy = {
              completedAt: w.completedAt,
              weight,
              reps,
              ...(rir !== undefined ? { rir } : {}),
              context,
              sourceName: ex.name ?? sessionName,
            };
            heavyHint = workoutHeavySessionHint(sessionName);
          }
        }
        if (reps >= 6) {
          const tonnage = weight * reps;
          if (context === "volume") {
            if (
              volumeCandidateBeats(
                weight,
                reps,
                sessionName,
                volumeNamed,
                volumeNamedTonnage,
                volumeNamedHint
              )
            ) {
              volumeNamed = {
                completedAt: w.completedAt,
                weight,
                reps,
                ...(rir !== undefined ? { rir } : {}),
                context,
                sourceName: ex.name ?? sessionName,
              };
              volumeNamedTonnage = tonnage;
              volumeNamedHint = workoutVolumeSessionHint(sessionName);
            }
          }
          if (volumeCandidateBeats(weight, reps, sessionName, volume, volumeTonnage, volumeHint)) {
            volume = {
              completedAt: w.completedAt,
              weight,
              reps,
              ...(rir !== undefined ? { rir } : {}),
              context,
              sourceName: ex.name ?? sessionName,
            };
            volumeTonnage = tonnage;
            volumeHint = workoutVolumeSessionHint(sessionName);
          }
        }
      }
    }
  }

  return {
    heavy: heavyNamed ?? heavy,
    volume: volumeNamed ?? volume,
  };
}

function pickHeavyLeaned(enriched: Array<{ weight: number; reps: number; e1rm: number }>) {
  const cands = enriched.filter((p) => p.reps <= 5);
  const pool = cands.length ? cands : enriched;
  return pool.reduce((a, b) =>
    b.weight > a.weight || (b.weight === a.weight && b.e1rm > a.e1rm) ? b : a
  );
}

function pickVolumeLeaned(
  enriched: Array<{ weight: number; reps: number; completedAt: string; e1rm: number }>
) {
  const highRep = enriched.filter((p) => p.reps >= 6);
  const pool = highRep.length ? highRep : enriched.filter((p) => p.reps >= 5);
  const pool2 = pool.length ? pool : enriched;
  return pool2.reduce((a, b) =>
    b.reps > a.reps || (b.reps === a.reps && b.weight * b.reps > a.weight * a.reps) ? b : a
  );
}

/** Session bests (6+ reps) from any flat bench trend row — recovers volume when the primary row’s bests are all heavy. */
function collectSixPlusSessionBestsFromBenchFamilyTrends(
  exerciseTrends: ExerciseTrendResult[],
  primaryBenchName: string
): Array<{ completedAt: string; weight: number; reps: number }> {
  const primary = exerciseKey(primaryBenchName);
  const out: Array<{ completedAt: string; weight: number; reps: number }> = [];
  for (const et of exerciseTrends) {
    const name = et.exercise?.trim() ?? "";
    if (!name) continue;
    const en = exerciseKey(name);
    if (en !== primary && !isLikelyMainFlatBenchPressVariant(name)) continue;
    for (const p of et.recentPerformances ?? []) {
      if (p.reps >= 6) {
        out.push({
          completedAt: p.completedAt,
          weight: p.weight,
          reps: p.reps,
        });
      }
    }
  }
  return out;
}

function pickBestSixRepPlusSet(
  rows: Array<{ completedAt: string; weight: number; reps: number }>
): { completedAt: string; weight: number; reps: number } | null {
  const ge6 = rows.filter((r) => r.reps >= 6);
  if (!ge6.length) return null;
  return ge6.reduce((a, b) =>
    b.reps > a.reps || (b.reps === a.reps && b.weight * b.reps > a.weight * a.reps) ? b : a
  );
}

/**
 * Build bench projection / strength context from exercise trends (best set per session).
 * Always uses max recent e1RM as the canonical current read — not only the latest session.
 */
export function buildBenchProjectionPayload(params: {
  message: string;
  unit: "kg" | "lb";
  exerciseTrends: ExerciseTrendResult[];
  benchExerciseName?: string;
  /** Used to attach bench 1RM goals when the user omits the word “bench”. */
  priorityGoal?: string;
  /** Full workouts — required to split heavy vs volume anchors (per-set), not just session “best”. */
  workouts?: StoredWorkout[];
}): BenchProjectionPayload | undefined {
  const text = params.message.trim();
  if (!shouldBuildBenchProjectionPayload(text, params.priorityGoal)) return undefined;

  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const benchName = params.benchExerciseName;
  if (!benchName) return undefined;

  const benchTrend =
    params.exerciseTrends.find((et) => norm(et.exercise) === norm(benchName)) ?? null;
  const perfs = benchTrend?.recentPerformances ?? [];
  if (perfs.length === 0) return undefined;

  const allowGoalParse =
    isBenchQuestionText(text) || inferBenchFromPriorityGoal(params.priorityGoal);

  const enriched = perfs.map((p) => {
    const e1rm = p.e1rm ?? estimateE1RM(p.weight, p.reps);
    return {
      completedAt: p.completedAt,
      weight: p.weight,
      reps: p.reps,
      e1rm,
    };
  });

  const trendEstimated1RM = Math.max(...enriched.map((p) => p.e1rm));
  const n = enriched.length;
  const newest = enriched[enriched.length - 1];
  const strongest = enriched.reduce((a, b) => (a.e1rm >= b.e1rm ? a : b));
  const heavyFromTrend = pickHeavyLeaned(enriched);
  const volumeFromTrend = pickVolumeLeaned(enriched);

  const scanKeys =
    params.workouts && params.workouts.length > 0
      ? collectBenchPressScanKeys(params.workouts, benchName)
      : new Set<string>();

  const scanned =
    params.workouts && params.workouts.length > 0
      ? scanBenchHeavyVolumeFromWorkouts(params.workouts, scanKeys)
      : { heavy: null as BenchAnchorRow | null, volume: null as BenchAnchorRow | null };

  const heavyRow: BenchAnchorRow = scanned.heavy ?? {
    completedAt: heavyFromTrend.completedAt,
    weight: heavyFromTrend.weight,
    reps: heavyFromTrend.reps,
  };
  // Guardrail: never let "current estimate" sit meaningfully below the heavy anchor implication.
  const heavyAnchorE1rm = estimateE1RM(heavyRow.weight, heavyRow.reps);
  const heavyAnchorRirAdjustedE1rm =
    heavyRow.rir !== undefined && heavyRow.rir > 0
      ? estimateE1RMWithRIR(heavyRow.weight, heavyRow.reps, heavyRow.rir)
      : null;
  const authoritativeEstimated1RM = Math.max(
    trendEstimated1RM,
    heavyAnchorE1rm,
    heavyAnchorRirAdjustedE1rm ?? -Infinity
  );


  let volumeRow: BenchAnchorRow | null = scanned.volume;
  if (!volumeRow) {
    const v = volumeFromTrend;
    const h = heavyRow;
    if (v.weight !== h.weight || v.reps !== h.reps) {
      volumeRow = { completedAt: v.completedAt, weight: v.weight, reps: v.reps };
    } else {
      volumeRow = null;
    }
  }

  if (!volumeRow) {
    const fromFamilyTrends = pickBestSixRepPlusSet(
      collectSixPlusSessionBestsFromBenchFamilyTrends(params.exerciseTrends, benchName)
    );
    const h = heavyRow;
    if (
      fromFamilyTrends &&
      (fromFamilyTrends.weight !== h.weight || fromFamilyTrends.reps !== h.reps)
    ) {
      volumeRow = {
        completedAt: fromFamilyTrends.completedAt,
        weight: fromFamilyTrends.weight,
        reps: fromFamilyTrends.reps,
      };
    }
  }

  let progressionDeltaKgPerSession: number | null = null;
  let progressionDeltaExplanation: string;
  if (enriched.length >= 2) {
    const e1rms = enriched.map((p) => p.e1rm);
    const lastStep = e1rms[n - 1] - e1rms[n - 2];
    if (lastStep > 0) {
      progressionDeltaKgPerSession = Number(lastStep.toFixed(2));
      progressionDeltaExplanation = `Last bench-to-bench step in the log: ~${progressionDeltaKgPerSession}${params.unit} e1RM (session best vs prior session best).`;
    } else {
      const positives: number[] = [];
      for (let i = 1; i < e1rms.length; i++) {
        const d = e1rms[i] - e1rms[i - 1];
        if (d > 0) positives.push(d);
      }
      if (positives.length) {
        const avg = positives.reduce((a, b) => a + b, 0) / positives.length;
        progressionDeltaKgPerSession = Number(avg.toFixed(2));
        progressionDeltaExplanation = `No positive step last session; averaged ~${progressionDeltaKgPerSession}${params.unit} e1RM across prior positive steps in this window (noisy).`;
      } else {
        progressionDeltaExplanation =
          "No clear positive e1RM step in recent bench sessions — timeline estimates should be hedged or omitted.";
      }
    }
  } else {
    progressionDeltaExplanation = "Only one bench session in window — progression rate unknown.";
  }

  const eA = authoritativeEstimated1RM;
  const heavyLow = weightForRepsAtE1RM(eA, 5);
  const heavyHigh = weightForRepsAtE1RM(eA, 2);
  const volLow = weightForRepsAtE1RM(eA, 10);
  const volHigh = weightForRepsAtE1RM(eA, 6);

  const targetParsed = parseBenchTargetFromText(text, params.unit, {
    allowGoalNumbersWithoutBenchWord: allowGoalParse,
  });
  const targetInPayloadUnit =
    targetParsed != null
      ? targetParsed.unit === params.unit
        ? targetParsed.value
        : targetParsed.unit === "kg"
          ? targetParsed.value * 2.20462
          : targetParsed.value / 2.20462
      : undefined;

  let workingWeights: Array<{ reps: number; weight: number }> | undefined;
  let sessionsEstimate: number | null = null;
  let gapToTarget: number | null = null;

  if (targetInPayloadUnit !== undefined) {
    gapToTarget = Number((targetInPayloadUnit - authoritativeEstimated1RM).toFixed(1));
    const repsSchemes = [3, 5, 8];
    workingWeights = repsSchemes.map((r) => ({
      reps: r,
      weight: Number((targetInPayloadUnit / (1 + r / 30)).toFixed(1)),
    }));
    if (progressionDeltaKgPerSession != null && progressionDeltaKgPerSession > 0 && gapToTarget > 0) {
      sessionsEstimate = Math.max(1, Math.ceil(gapToTarget / progressionDeltaKgPerSession));
    } else if (gapToTarget <= 0) {
      sessionsEstimate = 0;
    } else {
      sessionsEstimate = null;
    }
  }

  const u = params.unit;
  const step = u === "kg" ? 2.5 : 5;
  const wH = heavyRow.weight;
  const rH = heavyRow.reps;
  const wV = volumeRow ? volumeRow.weight : Number(weightForRepsAtE1RM(eA, 8).toFixed(1));
  const rV = volumeRow ? volumeRow.reps : 8;

  const heavyNearLow = Number((wH + step).toFixed(1));
  const heavyNearHigh = Number((wH + 2 * step).toFixed(1));
  const heavyDoubleBandLow = Number((wH + 2 * step).toFixed(1));
  const heavyDoubleBandHigh = Number(
    Math.min(wH + 4 * step, targetInPayloadUnit ? targetInPayloadUnit * 0.95 : wH + 5 * step).toFixed(1)
  );

  const volNearLow = wV;
  const volNearHigh = Number(
    Math.min(wV + 2 * step, targetInPayloadUnit ? targetInPayloadUnit * 0.82 : wV + 3 * step).toFixed(1)
  );
  const volMid = Number((wV + step).toFixed(1));

  const evidenceScopeLine =
    n <= 1
      ? `BACKGROUND (do not read aloud verbatim): single recent ${benchName} session; anchor = ${newest.weight}×${newest.reps} (${formatIsoDate(newest.completedAt)}).`
      : `BACKGROUND (do not read aloud verbatim): ${n} recent sessions (best set each); latest ${newest.weight}×${newest.reps} (${formatIsoDate(newest.completedAt)}); strongest top set ${strongest.weight}×${strongest.reps} (${formatIsoDate(strongest.completedAt)}).`;

  const concreteHeavy = {
    loggedBenchmark: `Heavy-leaning logged benchmark: ${wH}×${rH} (${formatIsoDate(heavyRow.completedAt)}).`,
    nearerTargetBand:
      targetInPayloadUnit !== undefined
        ? `Nearer-${Number(targetInPayloadUnit.toFixed(1))}${u} readiness (estimate): strong triples often trend toward ~${heavyNearLow}–${heavyNearHigh}${u} before a peak attempt; cleaner doubles/triples around ~${heavyDoubleBandLow}–${heavyDoubleBandHigh}${u} are a common signal. Tie progression to bar speed — not grinding every heavy set.`
        : `Peak-readiness direction (estimate): strong triples often trend toward ~${heavyNearLow}–${heavyNearHigh}${u}; cleaner doubles/triples around ~${heavyDoubleBandLow}–${heavyDoubleBandHigh}${u} — tie to bar speed, not grinding every set.`,
  };

  const concreteVolume = volumeRow
    ? {
        loggedBenchmark: `Volume-leaning logged benchmark: ${wV}×${rV} (${formatIsoDate(volumeRow.completedAt)}).`,
        nearerTargetBand: `Volume-day direction (estimate): add total reps at ~${volNearLow}${u} (e.g. ${rV + 1},${rV + 1},${rV} style) or run ~${volMid}–${volNearHigh}${u} for solid ${Math.max(5, rV - 2)}–${Math.min(10, rV + 2)} rep sets across 3–5 working sets — adjust if shoulders/triceps fatigue first.`,
      }
    : {
        loggedBenchmark: `Volume-leaning logged benchmark: no completed bench sets at 6+ reps in recent workouts — cannot anchor volume to the same top set as heavy (${wH}×${rH}).`,
        nearerTargetBand: `Volume-day direction (estimate): target ~${volLow.toFixed(0)}–${volHigh.toFixed(0)}${u} for 6–10 reps across 3–5 sets; log higher-rep bench work so volume can anchor separately from heavy triples.`,
      };

  const readinessSignals: string[] =
    targetInPayloadUnit !== undefined
      ? [
          `BACKGROUND: gap vs target ~${gapToTarget ?? "n/a"}${u}; progression step ${progressionDeltaKgPerSession != null ? `~${progressionDeltaKgPerSession}${u}/bench exposure (rough)` : "unclear"}.`,
        ]
      : [`BACKGROUND: no numeric target in message.`];

  const readinessLines: string[] = [];
  if (targetInPayloadUnit !== undefined) {
    readinessLines.push(
      `Gap to stated target (${Number(targetInPayloadUnit.toFixed(1))}${u}): ~${gapToTarget}${u} on this e1RM read — not a guarantee.`
    );
    if (sessionsEstimate != null && progressionDeltaKgPerSession != null && progressionDeltaKgPerSession > 0) {
      readinessLines.push(
        `Order-of-magnitude timeline (very uncertain): ~${sessionsEstimate} bench session(s) if a similar ~${progressionDeltaKgPerSession}${u} e1RM-style step per session continued — real life depends on recovery, technique, and lifestyle.`
      );
    } else if (sessionsEstimate === 0) {
      readinessLines.push("Target is at or below this e1RM read — focus on validating with heavy singles or a peaking block if you want to confirm on the bar.");
    } else {
      readinessLines.push(
        "No reliable sessions-to-target estimate from the log — need clearer upward steps or more bench exposures."
      );
    }
  }
  readinessLines.push(
    `Heavy-day shape (estimate from your current read): top sets roughly ${heavyLow.toFixed(0)}–${heavyHigh.toFixed(0)}${u} for ~2–5 reps; align with bar speed and stop short of grinding every set if possible.`
  );
  readinessLines.push(
    `Volume-day shape (estimate): ~${volLow.toFixed(0)}–${volHigh.toFixed(0)}${u} for ~6–10 reps, often ~3–5 working sets — adjust if joint stress or recovery pushes back.`
  );

  const estimateBasisLine = `INTERNAL consistency: treat ~${authoritativeEstimated1RM.toFixed(1)}${u} as the single best-current max-strength read from logged bench session bests (do not invent a second conflicting “current 1RM” in prose).`;

  const authRounded = Number(authoritativeEstimated1RM.toFixed(1));
  const hasRirAdjustedHeavy = heavyAnchorRirAdjustedE1rm != null && heavyAnchorRirAdjustedE1rm > heavyAnchorE1rm;
  const authLow = Number((authRounded - 1.5).toFixed(1));
  const authHigh = Number((authRounded + 1.5).toFixed(1));
  const evidenceLead =
    n <= 1
      ? "I’m mainly looking at your latest bench numbers in the log — a thinner snapshot, so keep this as a rough read."
      : "Using your recent heavy and volume bench work as the best current read.";

  const bestCurrentRead = hasRirAdjustedHeavy
    ? `About ${authLow}–${authHigh} ${u} max strength from your logged bench tops, with a small upward adjustment because your heavy anchor had ~${heavyRow.rir?.toFixed(0)} RIR.`
    : `About ${authRounded} ${u} max strength from your logged bench tops — rough estimate, not a competition-tested single.`;

  const heavyRirLine =
    heavyRow.rir !== undefined
      ? ` Logged effort was around ${heavyRow.rir.toFixed(0)} RIR, so this is treated as a little stronger than the same set to failure.`
      : "";
  const heavyBenchDay = `Heavy-day anchor from your log: ${wH}×${rH}.${heavyRirLine} You’re around that on heavy days. A likely next window is triples near ${heavyNearLow}–${heavyNearHigh} ${u}, or smooth doubles/triples near ${heavyDoubleBandLow}–${heavyDoubleBandHigh} ${u}, as long as the bar still moves — add weight or reps when quality holds, not when every set is a fight.`;

  const repBandLow = Math.max(5, rV - 2);
  const repBandHigh = Math.min(9, rV + 2);
  const volumeBenchDay = volumeRow
    ? `Volume-day anchor from your log: ${wV}×${rV} — separate from your heavy triples. Either push total reps around ${wV} ${u} (${rV + 1},${rV + 1},${rV}-style) or work ~${volMid}–${volNearHigh} ${u} for clean ${repBandLow}–${repBandHigh}s across a few sets — keep most reps shy of failure.`
    : `Volume-day anchor: I’m not seeing completed bench sets at 6+ reps in your history — so there’s no separate volume line to cite yet (do not reuse ${wH}×${rH} here; that stays heavy-only). Add a higher-rep bench day in the ~${volLow.toFixed(0)}–${volHigh.toFixed(0)} ${u} range, 6–10 reps, and log it so volume can track next to your heavy work.`;

  const Tnum = targetInPayloadUnit !== undefined ? Number(targetInPayloadUnit.toFixed(1)) : null;
  const whenTargetLooksRealistic =
    Tnum != null
      ? [
          `${Tnum} ${u} starts to look realistic when ${wH}×${rH} doesn’t feel like a near-max day every heavy session.`,
          `Heavy doubles/triples are moving up toward ~${heavyNearLow}–${heavyDoubleBandHigh} ${u} without every set grinding.`,
          volumeRow
            ? `Volume day keeps pace — more reps at ~${wV} ${u} or slightly heavier 5–7s without wrecking the next heavy bench.`
            : `Volume day needs its own logged 6+ rep bench work — until then, don’t pretend ${wH}×${rH} covers both roles.`,
        ].join("\n")
      : `Name a target weight when you’re ready — then we can spell out what “ready to go for it” looks like on the bar.`;

  const nextMove =
    Tnum != null
      ? `Next move: on your next heavy bench, repeat ${wH}×${rH} or try ${heavyNearLow} ${u} for the same reps if the first heavy set moves like last time — small, clean steps.`
      : `Next move: hit your next heavy and volume bench sessions the same way you log now so the trend stays visible.`;

  const coachFacing = {
    evidenceLead,
    bestCurrentRead,
    heavyBenchDay,
    volumeBenchDay,
    whenTargetLooksRealistic,
    nextMove,
  };

  const subsectionEvidenceLock = volumeRow
    ? `SUBSECTION EVIDENCE LOCK (mandatory): “Heavy bench day” may use ONLY ${wH}×${rH} (${formatIsoDate(heavyRow.completedAt)}) as the logged heavy anchor. “Volume bench day” may use ONLY ${volumeRow.weight}×${volumeRow.reps} (${formatIsoDate(volumeRow.completedAt)}) as the logged volume anchor. Never repeat ${wH}×${rH} inside the volume section.`
    : `SUBSECTION EVIDENCE LOCK (mandatory): Heavy anchor = ${wH}×${rH} only. No separate 6+ rep bench set exists in raw logs — “Volume bench day” must NOT reuse those heavy numbers; say volume isn’t separately logged and describe the higher-rep lane only (~${volLow.toFixed(0)}–${volHigh.toFixed(0)} ${u}, 6–10 reps).`;

  return {
    benchExerciseName: benchName,
    payloadUnit: u,
    authoritativeEstimated1RM: Number(authoritativeEstimated1RM.toFixed(1)),
    currentEstimated1RM: Number(authoritativeEstimated1RM.toFixed(1)),
    estimateBasisLine,
    evidenceScopeLine,
    concreteHeavy,
    concreteVolume,
    readinessSignals,
    recentBestSets: enriched.map((p) => ({
      completedAt: p.completedAt,
      weight: p.weight,
      reps: p.reps,
      e1rm: Number(p.e1rm.toFixed(1)),
    })),
    progressionDeltaKgPerSession:
      progressionDeltaKgPerSession != null ? Number(progressionDeltaKgPerSession.toFixed(2)) : null,
    progressionDeltaExplanation,
    ...(targetInPayloadUnit !== undefined
      ? { target1RM: Number(targetInPayloadUnit.toFixed(1)) }
      : {}),
    sessionsEstimate,
    gapToTarget: gapToTarget != null ? Number(gapToTarget.toFixed(1)) : null,
    workingWeights,
    heavyDay: {
      topSetKgMin: Number(heavyLow.toFixed(1)),
      topSetKgMax: Number(heavyHigh.toFixed(1)),
      repRangeLabel: "2–5",
      loggedTieIn: `Strongest logged session best in this window: ${strongest.weight}×${strongest.reps} (${formatIsoDate(strongest.completedAt)}).`,
    },
    heavyAnchor: {
      completedAt: heavyRow.completedAt,
      weight: heavyRow.weight,
      reps: heavyRow.reps,
      ...(heavyRow.rir !== undefined ? { rir: heavyRow.rir } : {}),
    },
    volumeDay: {
      workingKgMin: Number(volLow.toFixed(1)),
      workingKgMax: Number(volHigh.toFixed(1)),
      repRangeLabel: "6–10",
      setsHint: "3–5 working sets typical if recovery allows",
      loggedTieIn: volumeRow
        ? `Volume-leaning logged best for comparison: ${volumeRow.weight}×${volumeRow.reps} (${formatIsoDate(volumeRow.completedAt)}).`
        : "No 6+ rep bench sets in scanned logs — volume not separately anchored from heavy.",
    },
    volumeAnchor: volumeRow
      ? {
          completedAt: volumeRow.completedAt,
          weight: volumeRow.weight,
          reps: volumeRow.reps,
        ...(volumeRow.rir !== undefined ? { rir: volumeRow.rir } : {}),
        }
      : null,
    readinessLines,
    coachFacing,
    subsectionEvidenceLock,
  };
}
