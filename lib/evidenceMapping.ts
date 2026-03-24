import {
  type EvidenceCard,
  EVIDENCE_CARDS,
} from "./evidenceCards";
import type { CoachDecisionType } from "./trainingDecisions";

export const SIGNAL_TO_EVIDENCE: Record<string, readonly string[]> = {
  goal_lift_exposure_low: ["strength_specificity", "insufficient_exposure"],
  muscle_volume_low: ["hypertrophy_volume"],
  fatigue_risk_high: ["fatigue_masks_performance", "stimulus_fatigue_ratio"],
  plateau_candidate: ["plateau_diagnosis", "insufficient_exposure"],
  frequency_low: ["frequency_distribution"],
  excessive_variation: ["variation_vs_specificity"],
};

export const RECOMMENDATION_TO_EVIDENCE: Record<string, readonly string[]> = {
  increase_sets: ["hypertrophy_volume"],
  increase_frequency: ["frequency_distribution"],
  add_heavy_exposure: ["strength_specificity"],
  reduce_volume: ["volume_recovery_limit"],
  reduce_failure_work: ["failure_fatigue_tradeoff"],
  keep_current_plan: ["stimulus_fatigue_ratio"],
  /** Coach `Recommendation.type` fallbacks when id-based lookup does not apply */
  progress_exercise: ["plateau_diagnosis", "insufficient_exposure"],
  swap_exercise: ["failure_fatigue_tradeoff", "stimulus_fatigue_ratio"],
};

const DECISION_TO_EVIDENCE: Record<CoachDecisionType, readonly string[]> = {
  increase_support_volume: ["hypertrophy_volume"],
  increase_goal_lift_exposure: ["strength_specificity", "insufficient_exposure"],
  reduce_fatigue: ["fatigue_masks_performance", "stimulus_fatigue_ratio", "volume_recovery_limit"],
  maintain_current_plan: ["stimulus_fatigue_ratio"],
  gather_more_data: ["insufficient_exposure"],
};

const evidenceById = new Map<string, EvidenceCard>(
  EVIDENCE_CARDS.map((card) => [card.id, card]),
);

function resolveCards(ids: readonly string[]): EvidenceCard[] {
  return ids
    .map((id) => evidenceById.get(id))
    .filter((card): card is EvidenceCard => card != null);
}

/** Maps emitted TrainingSignal ids (prefix / pattern) to SIGNAL_TO_EVIDENCE keys. */
function canonicalSignalKeyForEvidence(signalId: string): string | undefined {
  if (!signalId) return undefined;
  if (signalId.startsWith("performance-progressing-")) return undefined;

  if (signalId.startsWith("goal-lift-exposure-low-")) return "goal_lift_exposure_low";
  if (signalId.startsWith("insufficient-exposure-for-assessment-"))
    return "goal_lift_exposure_low";
  if (signalId.startsWith("volume-low-")) return "muscle_volume_low";
  if (signalId.includes("support-gap")) return "muscle_volume_low";
  if (signalId.includes("plateau")) return "plateau_candidate";
  // fatigue_risk_high: only map ids that unambiguously denote fatigue risk.
  if (signalId === "frequency-low-last7days") return "frequency_low";
  if (signalId.startsWith("exercise-frequency-low-")) return "frequency_low";
  if (signalId.includes("excessive-variation")) return "excessive_variation";
  if (signalId.includes("-effort-high")) return "fatigue_risk_high";
  return undefined;
}

/** Coach Recommendation.type uses reduce_sets; evidence catalog uses reduce_volume. */
const RECOMMENDATION_LOOKUP_ALIASES: Record<string, keyof typeof RECOMMENDATION_TO_EVIDENCE> = {
  reduce_sets: "reduce_volume",
};

export function getEvidenceCardIdsForSignal(signalId: string): string[] {
  if (!signalId) return [];
  const direct = SIGNAL_TO_EVIDENCE[signalId];
  if (direct) return [...direct];

  const canonical = canonicalSignalKeyForEvidence(signalId);
  if (canonical) {
    const ids = SIGNAL_TO_EVIDENCE[canonical];
    if (ids) return [...ids];
  }

  return [];
}

/** Evidence for Coach key focus / suggestions when the driver is a TrainingInteraction id. */
export function getEvidenceCardIdsForInteraction(interactionId: string): string[] {
  if (!interactionId) return [];
  if (interactionId.includes("support-gap")) return ["hypertrophy_volume"];
  if (interactionId.includes("progress") && interactionId.includes("support"))
    return ["hypertrophy_volume"];
  if (interactionId.includes("plateau"))
    return ["plateau_diagnosis", "insufficient_exposure"];
  return [];
}

export function getEvidenceCardsForInteraction(interactionId: string): EvidenceCard[] {
  return resolveCards(getEvidenceCardIdsForInteraction(interactionId));
}

/** Evidence card ids for coach decisions from `decideNextActions`. */
export function getEvidenceCardIdsForDecision(decisionType: CoachDecisionType): string[] {
  return [...DECISION_TO_EVIDENCE[decisionType]];
}

export function getEvidenceCardIdsForRecommendation(
  recommendationId: string,
): string[] {
  const key =
    RECOMMENDATION_LOOKUP_ALIASES[recommendationId] ?? recommendationId;
  const fromCatalog = RECOMMENDATION_TO_EVIDENCE[key];
  if (fromCatalog) return [...fromCatalog];

  if (recommendationId.startsWith("rec-")) {
    const signalLike = recommendationId.slice(4);
    return getEvidenceCardIdsForSignal(signalLike);
  }

  return [];
}

export function getEvidenceCardsForSignal(signalId: string): EvidenceCard[] {
  return resolveCards(getEvidenceCardIdsForSignal(signalId));
}

export function getEvidenceCardsForRecommendation(
  recommendationId: string,
): EvidenceCard[] {
  return resolveCards(getEvidenceCardIdsForRecommendation(recommendationId));
}

/** Deduped full cards for ids that exist in the catalog (order = first-seen). */
export function getEvidenceCardsForReferencedIds(
  referencedIds: readonly string[],
): EvidenceCard[] {
  const seen = new Set<string>();
  const out: EvidenceCard[] = [];
  for (const id of referencedIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const card = evidenceById.get(id);
    if (card) out.push(card);
  }
  return out;
}
