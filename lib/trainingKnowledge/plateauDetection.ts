export type ExerciseProgressPoint = {
  date: string;
  load: number;
  reps: number;
  sets: number;
  rir: number;
};

function slope(values: number[]): number {
  if (values.length < 2) return 0;
  return values[values.length - 1] - values[0];
}

export function detectNoisyButNormalVariation(history: ExerciseProgressPoint[]): boolean {
  if (history.length < 4) return true;
  const reps = history.map((h) => h.reps);
  const spread = Math.max(...reps) - Math.min(...reps);
  return spread <= 2;
}

export function detectPlateau(history: ExerciseProgressPoint[]): boolean {
  if (history.length < 4) return false;
  const recent = history.slice(-4);
  const loadSlope = slope(recent.map((h) => h.load));
  const repSlope = slope(recent.map((h) => h.reps));
  return loadSlope <= 0 && repSlope <= 0;
}

export function shouldTriggerPlateauAdvice(history: ExerciseProgressPoint[]): boolean {
  return detectPlateau(history) && !detectNoisyButNormalVariation(history);
}

export function suggestPlateauResponse(
  history: ExerciseProgressPoint[],
  context?: { fatigueHigh?: boolean }
): string {
  if (!shouldTriggerPlateauAdvice(history)) {
    return "This looks like normal variation. Keep progressing with small, consistent steps.";
  }
  if (context?.fatigueHigh) {
    return "Plateau + high fatigue signal: hold load briefly or deload, then rebuild with cleaner reps and 1-3 RIR.";
  }
  return "Plateau signal: try a rep-range shift, add a set, or use a small load reset before building back up.";
}

