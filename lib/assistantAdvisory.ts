type AdvisoryParams = {
  message: string;
  goal?: string;
  experienceLevel?: string;
};

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((n) => text.includes(n));
}

export function generateAdvisoryResponse(params: AdvisoryParams): string {
  const msg = (params.message ?? "").trim().toLowerCase();
  const goal = (params.goal ?? "").trim();
  const level = (params.experienceLevel ?? "").trim().toLowerCase();

  const mentionsHowHard = hasAny(msg, ["how hard", "intensity", "effort"]);
  const mentionsFatigueOrCondition = hasAny(msg, [
    "fatigue",
    "tired",
    "exhausted",
    "burnt out",
    "low energy",
    "sleep",
    "stress",
    "pain",
    "injury",
    "condition",
    "sick",
  ]);
  const isBeginner = hasAny(level, ["beginner", "new", "novice", "starter"]);

  const goalLine = goal
    ? `For your goal (${goal}), keep most work consistent and repeatable across the week. `
    : "";

  if (mentionsHowHard) {
    const fatigueAdjustment = mentionsFatigueOrCondition
      ? "A good starting point would be compounds around 3-4 RIR and isolations around 2-3 RIR for now, with extra focus on sleep, hydration, and easier pacing. "
      : "A good starting point would be compounds around 2-3 RIR and isolations around 1-2 RIR, with occasional near-failure sets when technique stays solid. ";

    const beginnerLine = isBeginner
      ? "As a beginner, keep this simple: leave a few reps in reserve on most sets and focus on clean reps before pushing harder. "
      : "";

    return `${goalLine}As a general guideline, ${fatigueAdjustment.toLowerCase()}${beginnerLine}This may help you train hard enough to improve while still recovering well between sessions, and you can adjust based on how you feel.`;
  }

  if (mentionsFatigueOrCondition) {
    const beginnerLine = isBeginner
      ? "Keep your sessions straightforward, stop each set with about 3 RIR, and build consistency first. "
      : "A good starting point would be reducing intensity by about 1 RIR, keeping most sets around 3 RIR, and limiting near-failure work until energy improves. ";
    return `${goalLine}As a general guideline, ${beginnerLine.toLowerCase()}This may help your recovery catch up, and you can adjust based on how you feel day to day.`;
  }

  if (isBeginner) {
    return `${goalLine}As a general guideline, a good starting point would be most sets at 2-3 RIR, stable exercise choices, and small progress steps when form stays crisp. This may help you build momentum without overcomplicating things, and you can adjust based on how you feel.`;
  }

  return `${goalLine}As a general guideline, a good starting point would be compounds around 2-3 RIR and isolations around 1-2 RIR most of the time, with occasional near-failure isolation sets when recovery is good. This may help keep training clear and repeatable, and you can adjust based on how you feel.`;
}
