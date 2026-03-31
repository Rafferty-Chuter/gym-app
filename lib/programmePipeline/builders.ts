import type { ActiveProgrammeState, ParsedProgrammeRequest } from "./types";

/**
 * Augment the user message so modify rebuilds respect parsed deltas without losing thread context.
 */
export function composeModificationUserMessage(
  active: ActiveProgrammeState,
  parsed: ParsedProgrammeRequest,
  latestUserMessage: string
): string {
  const parts = [
    active.parsedRequest ? `[prior intent: ${active.parsedRequest.intent}]` : "",
    `[programme: ${active.programme.programmeTitle}]`,
    parsed.requestedChanges?.length ? `Changes: ${parsed.requestedChanges.join(", ")}.` : "",
    parsed.emphasis?.length ? `Emphasis: ${parsed.emphasis.join(", ")}.` : "",
    parsed.fatigueMode && parsed.fatigueMode !== "normal" ? `Fatigue mode: ${parsed.fatigueMode}.` : "",
    parsed.requestedExercises?.length
      ? `Include exercises (ids): ${parsed.requestedExercises.join(", ")}.`
      : "",
  ].filter(Boolean);
  return `${parts.join(" ")}\n\nUser: ${latestUserMessage}`;
}
