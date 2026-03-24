import type { CoachDecision, DecisionContext } from "@/lib/trainingDecisions";
import { getExerciseProfile } from "@/lib/exerciseProfiles";
import { supportPhraseForExercise } from "@/lib/supportMapping";
import { selectSupportExercises } from "@/lib/supportExerciseSelection";

export type SessionAdjustmentType =
  | "keep_session_same"
  | "add_support_sets"
  | "reduce_sets"
  | "add_goal_lift_exposure"
  | "hold_load_steady"
  | "run_lighter_session";

export type SessionAdjustment = {
  type: SessionAdjustmentType;
  target: string;
  instruction: string;
  duration: "next_session" | "next_week" | "next_2_sessions";
};

export type NextSessionAdjustmentPlan = {
  title: string;
  rationale: string;
  adjustments: SessionAdjustment[];
};

/** Case-insensitive: row-style pulls (word "row", not e.g. "grow"). */
function recentExercisesSuggestRowVariation(names: string[]): boolean {
  return names.some((name) => /\brow\b/i.test(name));
}

/** Case-insensitive: pulldown / vertical pull patterns. */
function recentExercisesSuggestPulldownVariation(names: string[]): boolean {
  return names.some((name) => {
    const t = name.toLowerCase();
    return (
      t.includes("pulldown") ||
      t.includes("pull-up") ||
      t.includes("pull up") ||
      t.includes("pullup")
    );
  });
}

/** First recent exercise that resolves to a horizontal/vertical pull (back) profile. */
function findRelevantBackExerciseProfile(names: string[]) {
  for (const name of names) {
    const p = getExerciseProfile(name);
    if (
      p &&
      (p.movementPattern === "horizontal_pull" || p.movementPattern === "vertical_pull")
    ) {
      return p;
    }
  }
  return null;
}

function supportVolumeInstructionForContext(
  context: DecisionContext,
  recentExercises: string[]
): string {
  const { trainingStyle, avgRIR } = context;

  if (trainingStyle === "to_failure") {
    return "You are training very close to failure. Instead of adding many more hard sets, add 1–2 additional sets or take some sets 1–2 reps from failure to allow more total volume.";
  }
  if (trainingStyle === "mixed") {
    return "Your weekly volume is already substantial. Avoid pushing set count much higher; refine execution quality, exercise selection, or progression before adding more back work.";
  }
  if (avgRIR !== undefined && avgRIR <= 0.5) {
    return "Rather than adding many more hard sets, keep sets similar and take some sets 1–2 reps from failure to allow more total volume.";
  }
  return addSupportSetsInstruction(recentExercises);
}

function addSupportSetsInstruction(recentExercises: string[]): string {
  const profile = findRelevantBackExerciseProfile(recentExercises);
  if (profile) {
    if (profile.fatigueCost === "high") {
      return "Add 1–2 back sets next session or keep sets the same and reduce effort slightly to allow more total volume.";
    }
    if (profile.fatigueCost === "moderate") {
      return "Add 2–3 back sets next session using your current variation.";
    }
    return "Add 3–4 back sets next session using a stable row or pulldown variation.";
  }

  if (recentExercisesSuggestRowVariation(recentExercises)) {
    return "Add 3–4 back sets to your next session using your current row variation.";
  }
  if (recentExercisesSuggestPulldownVariation(recentExercises)) {
    return "Add 3–4 back sets to your next session using your current pulldown variation.";
  }
  return "Add 3–4 back sets to your next session using your current row or pulldown variation.";
}

export function generateNextSessionAdjustments(params: {
  decisions: CoachDecision[];
  context: DecisionContext;
  goal: string;
  recentExercises: string[];
  supportExercises?: string[];
  supportGroup?: string;
  unit: "kg" | "lb";
}): NextSessionAdjustmentPlan | null {
  const { decisions, context, recentExercises, supportExercises = [], supportGroup } = params;

  if (decisions.length === 0) {
    return null;
  }

  const primary = decisions[0];

  switch (primary.type) {
    case "increase_support_volume": {
      const targetExercise = context.keyFocusExercise ?? "goal lift";
      const resolvedSupportGroup = context.supportGroup ?? supportGroup;
      const selectedSupportExercises = selectSupportExercises(
        recentExercises,
        supportExercises,
        resolvedSupportGroup
      );
      console.log("[next session] keyFocusExercise:", context.keyFocusExercise);
      console.log("[next session] supportGroup:", resolvedSupportGroup);
      console.log("[next session] supportExercises:", selectedSupportExercises);
      const setInstructionBase =
        selectedSupportExercises.length >= 2
          ? `Add 1 extra set to your ${selectedSupportExercises[0]} and ${selectedSupportExercises[1]} next session.`
          : selectedSupportExercises.length === 1
            ? `Add 2 extra sets to your ${selectedSupportExercises[0]} next session.`
            : `Add 2–4 sets of ${resolvedSupportGroup ?? "supporting muscle"} work next session.`;
      const addSupportInstruction =
        context.avgRIR !== undefined && context.avgRIR <= 0.5
          ? `${setInstructionBase} If recovery starts to drop, avoid taking every set to failure and keep some sets around ~1-2 RIR.`
          : `${setInstructionBase} Keep set quality high and reps controlled.`;
      const supportPhrase = supportPhraseForExercise(context.keyFocusExercise);
      const rationale =
        targetExercise.toLowerCase().includes("bench") && resolvedSupportGroup === "back"
          ? "Bench press is progressing, but your back work is low. Your back helps stabilise the press and supports long-term pressing strength."
          : supportPhrase.hasMapping
            ? `Your ${supportPhrase.primaryMuscle} is currently undertrained. ${supportPhrase.explanation}`
            : `${resolvedSupportGroup ?? "Supporting muscles"} need a bit more work to keep progress moving.`;
      return {
        title: "Support current progress",
        rationale,
        adjustments: [
          {
            type: "add_support_sets",
            target: targetExercise,
            instruction: addSupportInstruction,
            duration: "next_week",
          },
          {
            type: "hold_load_steady",
            target: targetExercise,
            instruction: `Keep ${targetExercise} progression steady while this support volume increase settles in.`,
            duration: "next_2_sessions",
          },
        ],
      };
    }

    case "increase_goal_lift_exposure":
      return {
        title: "Increase goal-lift exposure",
        rationale: "The target lift is not getting enough specific practice.",
        adjustments: [
          {
            type: "add_goal_lift_exposure",
            target: context.keyFocusExercise ?? "goal lift",
            instruction: "Add 1 extra exposure this week using the same main lift or a close variation.",
            duration: "next_week",
          },
        ],
      };

    case "reduce_fatigue":
      const fatigueInstruction =
        context.avgRIR !== undefined &&
        context.avgRIR <= 0.5 &&
        (context.goalLiftProgress === "plateau" || context.goalLiftProgress === "declining")
          ? `For the next 1-2 sessions, keep most ${(
              context.keyFocusExercise ?? "goal lift"
            ).toLowerCase()} sets around ~1-2 RIR and avoid grinding reps.`
          : "Run the next session lighter and avoid grinding reps.";
      return {
        title: "Reduce fatigue and restore performance",
        rationale:
          "You are training very close to failure, which increases fatigue and may limit recoverable volume if continued.",
        adjustments: [
          {
            type: "run_lighter_session",
            target: context.keyFocusExercise ?? "main lift",
            instruction: fatigueInstruction,
            duration: "next_session",
          },
          {
            type: "reduce_sets",
            target: "current plan",
            instruction: "Reduce total sets by 20–30% for the next session or microcycle.",
            duration: "next_week",
          },
        ],
      };

    case "maintain_current_plan":
      const maintainInstruction =
        context.goalLiftProgress === "progressing" &&
        context.avgRIR !== undefined &&
        context.avgRIR <= 0.5 &&
        context.fatigueRisk !== "high"
          ? "Keep current effort for now and continue small load/rep progressions. Monitor recoverability, and if progress stalls move some work to ~1-2 RIR."
          : "Keep your session structure unchanged and continue progressing load or reps in small steps.";
      return {
        title: "Stay the course",
        rationale: "Current training is working.",
        adjustments: [
          {
            type: "keep_session_same",
            target: "current plan",
            instruction: maintainInstruction,
            duration: "next_2_sessions",
          },
        ],
      };

    case "gather_more_data":
      return {
        title: "Build clearer data",
        rationale: "There is not enough consistent exposure yet.",
        adjustments: [
          {
            type: "keep_session_same",
            target: context.keyFocusExercise ?? "goal lift",
            instruction: "Keep the session stable for 1–2 more exposures so trend confidence improves.",
            duration: "next_2_sessions",
          },
        ],
      };

    default: {
      const _exhaustive: never = primary.type;
      return _exhaustive;
    }
  }
}
