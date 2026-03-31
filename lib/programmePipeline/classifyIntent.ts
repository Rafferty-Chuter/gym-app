import type { ActiveProgrammeState, ProgrammeIntent, ProgrammePipelineContext } from "./types";

function score(message: string, patterns: RegExp[]): number {
  const t = message.toLowerCase();
  return patterns.reduce((acc, p) => acc + (p.test(t) ? 1 : 0), 0);
}

export type ClassifyProgrammeIntentContext = {
  activeProgrammeState?: ActiveProgrammeState | null;
  /** True when the thread already contains a structured programme card from a prior turn. */
  hasThreadProgramme?: boolean;
};

/**
 * Semantic-ish intent classification: multiple weak signals, not single trigger words.
 */
export function classifyProgrammeIntent(
  message: string,
  ctx?: ClassifyProgrammeIntentContext | null
): { intent: ProgrammeIntent; signals: string[] } {
  const t = message.toLowerCase().trim();
  const signals: string[] = [];

  const compareScore =
    score(message, [
      /\bvs\.?\b/,
      /\bversus\b/,
      /\bcompared?\s+to\b/,
      /\bwhich\s+(is\s+)?better\b/,
      /\bor\s+(ppl|upper|lower|full\s*body)\b/,
      /\bppl\s+or\b/,
      /\bupper\s*\/\s*lower\s+or\b/,
    ]) +
    (/\b(ppl|push\s*pull|upper\s*\/\s*lower|full\s*body)\b/.test(t) &&
    /\b(or|vs|versus|better)\b/.test(t)
      ? 2
      : 0);

  const explainScore = score(message, [
    /\bwhy\b/,
    /\bwhat('s| is)\b.*\b(split|routine|program|programme)\b/,
    /\bexplain\b/,
    /\bhow\s+does\b/,
    /\bwhat\s+does\b.*\bmean\b/,
  ]);

  const modifySignalScore = score(message, [
      /\b(add|more|less|swap|replace|remove|drop|increase|decrease|tweak|adjust|change|modify|update)\b/,
      /\bmake\s+it\b/,
      /\bmake\s+this\b/,
      /\btoo\s+(hard|easy|heavy|light|much)\b/,
      /\bfatigu(e|ing)\b/,
      /\btricep\b/,
      /\bisolation\b/,
    ]);

  const programmeBuildScore =
    score(message, [
      /\b(split|routine|programme|program|meso|block|cycle)\b/,
      /\b(ppl|push\s*pull|upper\s*\/\s*lower|full\s*body)\b/,
      /\b(days?\s+a\s+week|x\s*\/\s*week|per\s+week)\b/,
      /\b(set\s+me\s+up\b)/,
      /\bbuild\b.*\b(routine|program|split)\b/,
      /\bplan\b.*\b(week|month)\b/,
    ]) + (/\bbuild\b/.test(t) && /\b(workout|session)\b/.test(t) ? -2 : 0);

  const singleWorkoutScore = score(message, [
    /\b(one|single|today'?s?|just)\b.*\b(workout|session)\b/,
    /\bworkout\b(?!.*\b(split|program|routine)\b)/,
    /\bgive\s+me\s+a\s+session\b/,
    /\bpush\s+day\b/,
    /\bpull\s+day\b/,
    /\bleg\s+day\b/,
  ]);

  if (compareScore >= 2 && compareScore >= modifySignalScore && compareScore >= programmeBuildScore) {
    signals.push("compare");
    const out = { intent: "programme_compare" as const, signals };
    console.log("[programme-intent-classified]", out);
    return out;
  }
  if (explainScore >= 2 && explainScore >= programmeBuildScore) {
    signals.push("explain");
    const out = { intent: "programme_explain" as const, signals };
    console.log("[programme-intent-classified]", out);
    return out;
  }

  const hasActive = Boolean(ctx?.activeProgrammeState?.programme || ctx?.hasThreadProgramme);
  // Active programme context is only an eligibility gate, not the intent signal itself.
  // Require at least one explicit modification cue so normal Q&A after programme generation
  // (e.g. "how much weekly volume should I do?") doesn't get rerouted into programme_modify.
  if (hasActive && modifySignalScore >= 1) {
    signals.push("modify+active");
    const out = { intent: "programme_modify" as const, signals };
    console.log("[programme-intent-classified]", out);
    return out;
  }

  if (programmeBuildScore >= 3 && programmeBuildScore >= singleWorkoutScore) {
    signals.push("programme_build");
    const out = { intent: "programme_build" as const, signals };
    console.log("[programme-intent-classified]", out);
    return out;
  }

  if (singleWorkoutScore >= 2 || (/\bworkout\b/.test(t) && programmeBuildScore < 2)) {
    signals.push("single_workout");
    const out = { intent: "single_workout_build" as const, signals };
    console.log("[programme-intent-classified]", out);
    return out;
  }

  if (programmeBuildScore >= 2) {
    signals.push("programme_build_weak");
    const out = { intent: "programme_build" as const, signals };
    console.log("[programme-intent-classified]", out);
    return out;
  }

  const out = { intent: "non_programme" as const, signals };
  console.log("[programme-intent-classified]", out);
  return out;
}

export function classifyFromContext(ctx: ProgrammePipelineContext): ReturnType<typeof classifyProgrammeIntent> {
  return classifyProgrammeIntent(ctx.message, {
    activeProgrammeState: ctx.clientActiveProgramme ?? null,
    hasThreadProgramme: ctx.hasThreadProgramme,
  });
}
