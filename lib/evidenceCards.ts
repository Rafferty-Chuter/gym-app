export type EvidenceCard = {
  id: string;
  title: string;
  summary: string;
  practicalTakeaway: string;
  caution?: string;
  confidence: "low" | "moderate" | "high";
};

export const EVIDENCE_CARDS: EvidenceCard[] = [
  {
    id: "strength_specificity",
    title: "Strength is highly specific to load and movement",
    summary:
      "Heavy loading produces greater 1RM strength gains than lighter loads, even when total work is similar, while hypertrophy can occur across a wider range of loads.",
    practicalTakeaway:
      "If the goal is to increase a lift, include regular heavy exposures on that lift or a close variation rather than relying only on hypertrophy work.",
    caution:
      "Too much heavy work can increase fatigue and limit recoverable volume.",
    confidence: "high",
  },
  {
    id: "hypertrophy_volume",
    title: "More volume helps hypertrophy, but with diminishing returns",
    summary:
      "Hypertrophy increases with weekly volume, but gains per additional set decrease, and very high volumes often do not outperform moderate volumes in trained lifters.",
    practicalTakeaway:
      "Increase volume for lagging muscles first, but stop increasing when performance or recovery starts to drop.",
    caution:
      "Set counts alone are imperfect — exercise choice and effort level matter.",
    confidence: "moderate",
  },
  {
    id: "frequency_distribution",
    title: "Frequency mainly improves how work is distributed",
    summary:
      "When total volume is matched, training frequency has little direct effect on hypertrophy; its benefit comes from improving set quality and fatigue management.",
    practicalTakeaway:
      "Before adding more volume, consider spreading current work across more sessions to maintain performance quality.",
    caution:
      "Frequency still matters for skill-heavy lifts due to increased practice.",
    confidence: "high",
  },
  {
    id: "failure_fatigue_tradeoff",
    title: "Training closer to failure increases fatigue faster than benefit",
    summary:
      "Training to failure is not consistently superior for hypertrophy and significantly increases fatigue, which can reduce total productive volume.",
    practicalTakeaway:
      "Keep most compound work 1–3 reps in reserve and reserve failure for low-risk isolation work.",
    caution:
      "Definitions of “failure” vary across studies, so avoid rigid rules.",
    confidence: "moderate",
  },
  {
    id: "fatigue_masks_performance",
    title: "Fatigue can hide real strength gains",
    summary:
      "Performance can temporarily decrease under high training stress and rebound after reducing volume, meaning poor performance is not always lack of progress.",
    practicalTakeaway:
      "If performance drops during a hard block, reduce training stress before changing the programme.",
    caution:
      "Over-reducing training too early can limit long-term progress.",
    confidence: "moderate",
  },
  {
    id: "plateau_diagnosis",
    title: "Plateaus are often misdiagnosed",
    summary:
      "Apparent plateaus can be caused by fatigue, measurement noise, or poor specificity rather than insufficient effort.",
    practicalTakeaway:
      "Before changing training, check exposure, fatigue, and whether progress exceeds normal variation.",
    caution:
      "There is no single reliable marker of overtraining — decisions should be probabilistic.",
    confidence: "moderate",
  },
  {
    id: "stimulus_fatigue_ratio",
    title: "More fatigue does not equal more progress",
    summary:
      "Lower intra-set fatigue can produce similar or better strength adaptations while allowing more total high-quality work across the week.",
    practicalTakeaway:
      "Prioritize maintaining output quality (load, reps, technique) over grinding excessively.",
    caution:
      "Evidence is stronger for strength than for hypertrophy-specific outcomes.",
    confidence: "moderate",
  },
  {
    id: "insufficient_exposure",
    title: "Many plateaus are just insufficient exposure",
    summary:
      "Meaningful strength gains can occur with relatively low exposure, so some plateaus reflect inconsistent or insufficient practice rather than true stagnation.",
    practicalTakeaway:
      "Check whether the lift has enough consistent exposures before assuming a plateau.",
    caution:
      "Minimum effective dose is not optimal dose, especially for advanced lifters.",
    confidence: "moderate",
  },
  {
    id: "volume_recovery_limit",
    title: "Volume is limited by recovery, not motivation",
    summary:
      "Increasing volume can drive progress, but only up to the point where recovery allows performance to be maintained.",
    practicalTakeaway:
      "Increase volume gradually and use performance or fatigue signals as a stop point.",
    caution:
      "Falling performance is a sign volume may already be too high.",
    confidence: "moderate",
  },
  {
    id: "variation_vs_specificity",
    title: "Variation must not dilute specificity",
    summary:
      "Exercise variation can improve development, but too much variation reduces the specific practice needed for strength progression.",
    practicalTakeaway:
      "Keep primary lifts stable while rotating accessories more slowly.",
    caution:
      "Optimal variation frequency depends on experience and injury history.",
    confidence: "moderate",
  },
];
