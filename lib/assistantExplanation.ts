type ExplanationParams = {
  message: string;
  coachAnalysis?: any;
};

function normalizeText(v: unknown): string {
  return typeof v === "string" ? v.toLowerCase() : "";
}

function firstString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (item && typeof item === "object" && "text" in item) {
        const t = (item as { text?: unknown }).text;
        if (typeof t === "string" && t.trim()) return t.trim();
      }
    }
  }
  return null;
}

export function generateExplanationResponse(params: ExplanationParams): string {
  const message = normalizeText(params.message);
  const coach = params.coachAnalysis ?? {};

  const keyFocus =
    (typeof coach?.keyFocus === "string" && coach.keyFocus.trim()) ||
    firstString(coach?.actionableSuggestions) ||
    firstString(coach?.whatsGoingWell) ||
    "";

  const combined = `${message} ${normalizeText(keyFocus)}`.trim();

  if (combined.includes("back volume is low") || combined.includes("back volume low")) {
    return "Your back work is likely below what your goal needs right now. That matters because stronger back muscles improve stability and force transfer during pressing. A good starting point would be adding a bit more back work, which may help your lifts feel steadier.";
  }

  if (combined.includes("volume is low") || combined.includes("low volume")) {
    return "This means one muscle group is getting fewer quality sets than ideal. That matters because muscles usually improve with enough repeated practice and effort. A good starting point would be adding a few focused sets there, and you can adjust based on how you feel.";
  }

  if (combined.includes("fatigue")) {
    return "This is saying your recent effort may be hard to recover from at your current pace. That matters because progress comes from training plus recovery, not hard sessions alone. A good starting point would be slightly easier effort for now, which may help sessions feel better again.";
  }

  if (combined.includes("plateau") || combined.includes("stalled") || combined.includes("not progressing")) {
    return "This means your current setup is not creating clear week-to-week improvement right now. That matters because your goal relies on steady overload over time. A good starting point would be a small training adjustment, and you can adjust based on how you feel.";
  }

  if (combined.includes("rir") || combined.includes("effort")) {
    return "This is about how close your sets are to failure. That matters because effort should be high enough to drive adaptation, but controlled enough to recover. A good starting point would be steady RIR targets, which may help balance progress and recovery.";
  }

  if (keyFocus) {
    return `The coach is highlighting this point: "${keyFocus}". In simple terms, it matters because this area is likely getting in the way of smoother progress right now. A good starting point would be one focused adjustment here, and you can adjust based on how you feel.`;
  }

  return "The coach is pointing to one change that can help your goal right now. It matters because small gaps can affect bigger lifts and overall progress. A good starting point would be fixing that first, then adjusting based on how you feel.";
}
