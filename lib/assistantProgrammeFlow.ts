import type { SplitDefinition } from "@/lib/splitDefinition";

/** Thread / API shape for the last built programme (no circular import from route). */
export type StructuredProgrammeLike = {
  programmeTitle: string;
  programmeGoal?: string;
  notes?: string;
  days: Array<{
    dayLabel: string;
    sessionType: string;
    targetMuscles?: string[];
    purposeSummary?: string;
    exercises: unknown[];
  }>;
};

/**
 * True when the user is likely editing the active programme (not a general coaching question).
 * Only call when a structured programme already exists in-thread.
 */
export function isProgrammeModificationIntent(message: string): boolean {
  const t = message.toLowerCase().trim();
  if (!t || t.length > 500) return false;

  if (/^(why|how does|what is|what are|explain|describe|define)\b/.test(t)) {
    if (!/\b(change|update|rebuild|modify|adjust|edit)\b/.test(t)) return false;
  }

  const strongVerb =
    /\b(add|remove|swap|change|replace|reduce|increase|include|incorporat|must\s+include|put\s+in|also\s+add|drop|rebuild|regenerate|update|revise|tweak|adjust|modify|edit|turn\s+this|convert|switch\s+to|make\s+it|make\s+this|make\s+that|make\s+push|make\s+pull|make\s+leg|prioriti|emphasi|focus\s+more|less\s+fatigue|lower\s+fatigue|deload|more\s+isolation|extra\s+isolation|fewer\s+sets)\b/.test(
      t
    );

  const structureShift =
    /\b(upper\s*\/?\s*lower|push\s*pull\s*legs|\bppl\b|full\s*body|bro\s+split|\b[3-6]\s*day)\b/.test(t);

  const exerciseOrMuscleCue =
    /\b(bench|incline|squat|deadlift|rdl|row|curl|triceps?|biceps?|chest|shoulders?|lats?|back|legs?|arms?|glutes?|hamstrings?|quads?|calves?|barbell|dumbbell|smith|machine|fly|press|extension|pushdown)\b/.test(
      t
    );

  const shortFollowUp = t.length < 100 && exerciseOrMuscleCue && /\b(more|less|also|only|instead|swap)\b/.test(t);

  return strongVerb || structureShift || shortFollowUp;
}

export function targetMusclesFromSessionType(sessionType: string): string[] {
  const norm = sessionType.toLowerCase().replace(/\s+/g, " ").trim();
  if (norm.includes("+")) {
    const uniq = new Set<string>();
    for (const part of norm.split("+")) {
      for (const m of targetMusclesFromSessionType(part.trim())) {
        uniq.add(m);
      }
    }
    return [...uniq];
  }
  const s = norm.replace(/\s+/g, "_");
  if (s.includes("push") && !s.includes("pull")) return ["chest", "shoulders", "triceps"];
  if (s.includes("pull")) return ["back", "biceps"];
  if (s.includes("legs") || s === "lower") return ["legs"];
  if (s.includes("upper")) return ["chest", "back", "shoulders", "arms"];
  if (s.includes("full")) return ["chest", "back", "legs"];
  if (s.includes("chest")) return ["chest"];
  if (s.includes("back")) return ["back"];
  if (s.includes("shoulder")) return ["shoulders"];
  if (s.includes("arm")) return ["arms"];
  return ["chest", "back", "shoulders", "arms"];
}

/** Reconstruct a split definition from the last structured programme so edits keep the same weekly shape. */
export function splitDefinitionFromStructuredProgramme(p: StructuredProgrammeLike): SplitDefinition {
  const baseTitle = p.programmeTitle.replace(/\s*\(updated\)\s*$/i, "").trim();
  return {
    title: `${baseTitle} (updated)`,
    source: "adjusted",
    days: p.days.map((d) => {
      const shortLabel = d.dayLabel.replace(/^\s*Day\s+\d+\s*-\s*/i, "").trim();
      return {
        dayLabel: shortLabel || d.sessionType,
        targetMuscles:
          d.targetMuscles && d.targetMuscles.length > 0
            ? [...d.targetMuscles]
            : targetMusclesFromSessionType(d.sessionType),
        notes: d.purposeSummary,
      };
    }),
  };
}

export function summarizeActiveProgrammeForLog(p: StructuredProgrammeLike | null | undefined): string {
  if (!p?.days?.length) return "none";
  return `${p.programmeTitle} | ${p.days.length} days | ${p.days.map((d) => d.sessionType).join(",")}`;
}
