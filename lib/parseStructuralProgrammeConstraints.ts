/**
 * Structural layout constraints for programme construction (counts per muscle group, etc.).
 */

export type StructuralProgrammeConstraints = {
  /** Every target muscle on each day gets exactly this many exercises (primary-muscle counting). */
  uniformPerMuscleExerciseCount?: number;
  /** Optional floor per canonical target key (e.g. triceps: 2). */
  perMuscleMinimums?: Partial<Record<string, number>>;
  /** Optional cap per canonical target key (e.g. chest: 1). */
  perMuscleMaximums?: Partial<Record<string, number>>;
  /** User asked for more isolation-oriented work (passed to builder scoring later). */
  moreIsolationPerMuscle?: boolean;
};

/**
 * Parse phrases like "2 exercises for each muscle group", "1 exercise per muscle", etc.
 */
export function parseStructuralProgrammeConstraints(message: string): StructuralProgrammeConstraints {
  const t = message.toLowerCase();
  const out: StructuralProgrammeConstraints = {};

  const patterns: RegExp[] = [
    /\b(\d+)\s*(?:exercises?\s*)?(?:for\s+)?(?:each\s+)?(?:muscle\s+groups?|muscle\s+group|muscle)\b/,
    /\b(\d+)\s*exercises?\s*per\s+(?:each\s+)?(?:muscle\s+group|muscle)\b/,
    /\b(?:each|every)\s+(?:muscle\s+group|muscle)\s+(?:gets?\s+|with\s+|has\s+)?(\d+)\s*exercises?\b/,
    /\b(\d+)\s*per\s+muscle\s+group\b/,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n >= 1 && n <= 6) {
        out.uniformPerMuscleExerciseCount = n;
      }
      break;
    }
  }

  const mins: Record<string, number> = {};
  const maxs: Record<string, number> = {};

  if (/\bmore\s+triceps?\b/.test(t)) {
    mins.triceps = Math.max(mins.triceps ?? 0, 2);
  }
  if (/\bmore\s+biceps?\b/.test(t)) {
    mins.biceps = Math.max(mins.biceps ?? 0, 2);
  }
  if (/\bmore\s+chest\b/.test(t)) {
    mins.chest = Math.max(mins.chest ?? 0, 2);
  }
  if (/\bless\s+chest\b/.test(t) || /\breduced?\s+chest\b/.test(t)) {
    maxs.chest = 1;
  }
  if (/\bless\s+triceps?\b/.test(t)) {
    maxs.triceps = 1;
  }

  if (Object.keys(mins).length) out.perMuscleMinimums = mins;
  if (Object.keys(maxs).length) out.perMuscleMaximums = maxs;

  if (/\bmore\s+isolation\b/.test(t) && (/\b(?:each\s+)?muscle/.test(t) || /\bper\s+muscle/.test(t))) {
    out.moreIsolationPerMuscle = true;
  }

  return out;
}
