import type { CoachDecision, DecisionContext } from "@/lib/trainingDecisions";
import { plainCoachNameForCoarseGroup } from "@/lib/coachMusclePools";
import { selectSupportExercises } from "@/lib/supportExerciseSelection";
import type { LowerBodyPriority } from "@/lib/userProfile";

export type Prescription = {
  targetExercise?: string;
  currentWeeklySets?: number;
  recommendedWeeklySets?: number;
  currentAvgRIR?: number;
  recommendedRIRMin?: number;
  recommendedRIRMax?: number;
  duration?: "next_session" | "next_week" | "next_2_sessions";
  note?: string;
  insufficientData?: string[];
};

function rounded(n: number): number {
  return Math.max(0, Math.round(n));
}

function durationText(duration: Prescription["duration"]): string {
  if (duration === "next_session") return "next session";
  if (duration === "next_week") return "next week";
  return "next 2 sessions";
}

export function buildPrescription(params: {
  decision: CoachDecision;
  context: DecisionContext;
  unit: "kg" | "lb";
}): Prescription {
  const { decision, context } = params;
  const p: Prescription = {
    targetExercise: context.keyFocusExercise,
    ...(context.currentWeeklySets !== undefined
      ? { currentWeeklySets: context.currentWeeklySets }
      : {}),
    ...(context.avgRIR !== undefined ? { currentAvgRIR: context.avgRIR } : {}),
  };

  if (decision.type === "reduce_fatigue") {
    if (context.currentWeeklySets !== undefined) {
      p.recommendedWeeklySets = rounded(context.currentWeeklySets * 0.78);
    }
    if (
      context.avgRIR !== undefined &&
      context.avgRIR <= 0.5 &&
      (context.goalLiftProgress === "plateau" || context.goalLiftProgress === "declining")
    ) {
      p.recommendedRIRMin = 1;
      p.recommendedRIRMax = 2;
    }
    p.duration = "next_2_sessions";
    p.note = "Use a short reset to restore recovery before rebuilding progression.";
    return p;
  }

  if (decision.type === "increase_support_volume") {
    if (context.currentWeeklySets !== undefined) {
      p.recommendedWeeklySets = rounded(context.currentWeeklySets + 3);
    }
    if (context.avgRIR !== undefined && context.avgRIR <= 0.5) {
      p.note =
        "Increase volume first. If added volume starts to hurt recovery, move some sets to ~1-2 RIR.";
    } else {
      p.recommendedRIRMin = 0;
      p.recommendedRIRMax = 2;
    }
    p.duration = "next_week";
    return p;
  }

  if (decision.type === "increase_goal_lift_exposure") {
    p.duration = "next_week";
    p.note = "Add 1 extra exposure this week using the same main lift or a close variation.";
    return p;
  }

  if (decision.type === "maintain_current_plan") {
    p.duration = "next_2_sessions";
    p.note = "Keep structure stable and progress load or reps slightly if performance holds.";
    if (
      context.goalLiftProgress === "progressing" &&
      context.avgRIR !== undefined &&
      context.avgRIR <= 0.5 &&
      context.fatigueRisk !== "high"
    ) {
      p.note =
        "Current effort is very high, but progression is still positive. Keep this approach unless progress slows or more volume needs to be recovered from.";
    }
    return p;
  }

  if (decision.type === "gather_more_data") {
    const missing: string[] = [];
    if (context.avgRIR === undefined) missing.push("Need RIR data");
    if (context.currentWeeklySets === undefined) missing.push("Need clearer weekly set volume");
    if (context.goalLiftProgress === undefined)
      missing.push("Need more consistent goal-lift exposures");
    p.insufficientData = missing;
    p.duration = "next_2_sessions";
    p.note = "Keep the plan stable while collecting clearer data.";
    return p;
  }

  return p;
}

export function prescriptionToText(
  decision: CoachDecision,
  prescription: Prescription,
  context: DecisionContext,
  recentExercises?: string[],
  supportExercises?: string[],
  supportGroup?: string,
  supportGroupWeeklySets?: number,
  lowerBodyPriority?: LowerBodyPriority
): string {
  const ex = prescription.targetExercise ?? context.keyFocusExercise ?? "your main lift";
  const lowerEx = ex.toLowerCase();
  const timeframe = durationText(prescription.duration);

  if (decision.type === "reduce_fatigue") {
    const parts: string[] = [];
    if (
      prescription.currentWeeklySets !== undefined &&
      prescription.recommendedWeeklySets !== undefined
    ) {
      const low = rounded(prescription.currentWeeklySets * 0.75);
      const high = rounded(prescription.currentWeeklySets * 0.8);
      parts.push(
        `Reduce weekly ${lowerEx} volume from ~${prescription.currentWeeklySets} sets to ~${low}-${high} sets ${timeframe}.`
      );
    }
    if (
      prescription.recommendedRIRMin !== undefined &&
      prescription.recommendedRIRMax !== undefined
    ) {
      parts.push(
        `Reduce ${ex} to ~${prescription.recommendedRIRMin}-${prescription.recommendedRIRMax} RIR for the ${timeframe}.`
      );
    } else if (
      prescription.currentAvgRIR !== undefined &&
      prescription.currentAvgRIR <= 0.5 &&
      (context.goalLiftProgress === "plateau" || context.goalLiftProgress === "declining")
    ) {
      parts.push(`For the ${timeframe}, keep most ${lowerEx} sets around ~1-2 RIR.`);
    }
    if (parts.length === 0) {
      parts.push(`Run a short fatigue reset for ${ex} over the ${timeframe}.`);
      if (prescription.currentAvgRIR === undefined) {
        parts.push("I don't have enough RIR data to prescribe effort precisely yet.");
      }
      if (prescription.currentWeeklySets === undefined) {
        parts.push("I don't have enough weekly set-volume detail to prescribe volume precisely yet.");
      }
    }
    if (prescription.note) parts.push(prescription.note);
    return parts.join(" ");
  }

  if (decision.type === "increase_support_volume") {
    const parts: string[] = [];
    const selectedSupportExercises = selectSupportExercises(
      recentExercises ?? [],
      supportExercises,
      supportGroup
    );
    const groupLabel = plainCoachNameForCoarseGroup(supportGroup ?? "back");
    const isLowerBody = (supportGroup ?? "").toLowerCase() === "legs" || groupLabel === "lower body";
    const isReducedLowerBody = isLowerBody && lowerBodyPriority === "Reduced";
    const mappedBase =
      selectedSupportExercises.length >= 2
        ? isReducedLowerBody
          ? `If you can recover, add 1 extra set to ${selectedSupportExercises[0]} and ${selectedSupportExercises[1]} next session.`
          : `Add 1 extra set to ${selectedSupportExercises[0]} and ${selectedSupportExercises[1]} next session.`
        : selectedSupportExercises.length === 1
          ? isReducedLowerBody
            ? `If you can recover, add 2 extra sets to ${selectedSupportExercises[0]} next session.`
            : `Add 2 extra sets to ${selectedSupportExercises[0]} next session.`
          : isReducedLowerBody
            ? `If you can recover, add 2–4 weekly sets for ${groupLabel} next session.`
            : `Add 2–4 weekly sets for ${groupLabel} next session.`;
    if (supportGroupWeeklySets !== undefined && Number.isFinite(supportGroupWeeklySets)) {
      const low = rounded(supportGroupWeeklySets + 2);
      const high = rounded(supportGroupWeeklySets + 4);
      parts.push(
        `${mappedBase} You are at about ${rounded(supportGroupWeeklySets)} ${groupLabel} sets this week; this nudge targets roughly ${low}–${high}.`
      );
    } else {
      parts.push(mappedBase);
      parts.push(
        isReducedLowerBody
          ? `${groupLabel} weekly volume looks light. If it fits your week, add a small bump without overdoing it.`
          : `${groupLabel} weekly volume looks light — a small bump here usually helps without wrecking recovery.`
      );
    }
    if (
      prescription.recommendedRIRMin !== undefined &&
      prescription.recommendedRIRMax !== undefined
    ) {
      parts.push(
        `Keep some added sets around ~${prescription.recommendedRIRMin}-${prescription.recommendedRIRMax} RIR.`
      );
    } else if (prescription.currentAvgRIR === undefined) {
      parts.push("I don't have enough RIR data to prescribe effort precisely yet.");
    }
    if (prescription.note) parts.push(prescription.note);
    return parts.join(" ");
  }

  if (decision.type === "increase_goal_lift_exposure") {
    return `${ex}: add 1 extra exposure ${timeframe} using the same lift or a close variation. ${prescription.note ?? ""}`.trim();
  }

  if (decision.type === "maintain_current_plan") {
    if (
      context.goalLiftProgress === "progressing" &&
      prescription.currentAvgRIR !== undefined &&
      prescription.currentAvgRIR <= 0.5 &&
      context.fatigueRisk !== "high"
    ) {
      return `${ex}: keep current effort for now and continue small progression steps for the ${timeframe}. Current effort is very high, but progression is still positive. Monitor recoverability, and if progress stalls move some work to ~1-2 RIR.`;
    }
    return `${ex}: keep structure stable for the ${timeframe}, and progress load or reps slightly if performance holds.`;
  }

  if (decision.type === "gather_more_data") {
    const missing = prescription.insufficientData ?? [];
    const parts: string[] = [];
    if (missing.includes("Need RIR data")) {
      parts.push("I don't have enough RIR data to prescribe effort precisely yet.");
    }
    if (missing.includes("Need clearer weekly set volume")) {
      parts.push("I don't have enough clear weekly set volume to prescribe a precise volume target yet.");
    }
    if (missing.includes("Need more consistent goal-lift exposures")) {
      parts.push(
        `I don't have enough consistent ${lowerEx} exposures to prescribe a tighter progression change.`
      );
    }
    parts.push(
      `Keep the plan stable for the ${timeframe} while collecting clearer data from consistent logging.`
    );
    if (prescription.note) parts.push(prescription.note);
    return parts.join(" ");
  }

  return decision.reason;
}
