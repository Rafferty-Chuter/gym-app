/**
 * Single source of truth for how many exercises a generated session may include.
 * The LLM chooses the exact count within these bounds guided by the evidence framework.
 */

/** Short generic "build me a X day" with no emphasis — kept for external callers. */
export function isGenericSessionBuildRequest(message: string): boolean {
  const t = message.toLowerCase().trim();
  if (t.length > 120) return false;
  if (/\b(emphasis|balanced|complete|full|isolation|hypertrophy|strength|volume|chest|shoulder|triceps|biceps|weak|priority|include|add|swap|minutes?|min)\b/.test(t)) {
    return false;
  }
  return /\b(build|make|create|give me|generate)\b/.test(t) && /\b(day|session|workout)\b/.test(t);
}

export type SessionExerciseCountPolicy = {
  /** Hard minimum valid exercises after filtering (planner + equipment must satisfy). */
  min: number;
  /** Hard maximum in the planned array. */
  max: number;
  /** Typical lower bound for coaching copy in prompts. */
  typicalLow: number;
  /** Typical upper bound for coaching copy in prompts. */
  typicalHigh: number;
  /** One line for the LLM system prompt. */
  promptLine: string;
};

export function resolveSessionExerciseCountPolicy(params: {
  recoveryLowFatigue: boolean;
  userMessage: string;
}): SessionExerciseCountPolicy {
  const t = params.userMessage.toLowerCase();

  let min = 4;
  let max = 10;

  if (/\b(quick|minimal|short session|time crunched|time-crunched|30\s*min|20\s*min|in a hurry|only have \d+|just a few)\b/.test(t)) {
    min = 3;
    max = Math.min(max, 7);
  }
  if (/\b(high volume|brutal|lots? of volume|many exercises|long session|90\s*min|2\s*hour)\b/.test(t)) {
    min = Math.max(min, 5);
    max = 12;
  }
  if (params.recoveryLowFatigue) {
    max = Math.min(max, 8);
    if (min > 4) min = 4;
  }

  const typicalLow = Math.max(min, Math.min(4, max));
  const typicalHigh = Math.min(max, Math.max(typicalLow + 2, 6));

  const promptLine = `Exercise count (hard bounds): the "exercises" array MUST have between ${min} and ${max} items inclusive. Select exercises based on what the session type genuinely needs to cover its primary movement patterns per the evidence framework — typically ${typicalLow}–${typicalHigh} exercises for most push/pull/upper/lower/legs sessions. Cover all primary patterns first; only add a second exercise for the same pattern when it fills a clearly distinct angle or sub-region.`;

  return { min, max, typicalLow, typicalHigh, promptLine };
}
