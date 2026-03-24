import type { CoachStructuredAnalysis } from "@/lib/coachStructuredAnalysis";
import { detectLimitingSupportMuscle } from "@/lib/goalSupportProfiles";
import type { TrainingFocus } from "@/lib/trainingFocus";

export type HomePrimaryCoachingStory = {
  headline: string;
  subline: string;
  focusText: string;
  nextMove: string;
};

function labelGroup(group: string): string {
  const map: Record<string, string> = {
    chest: "Chest",
    back: "Back",
    legs: "Legs",
    shoulders: "Shoulders",
    arms: "Arms",
  };
  const k = group.toLowerCase();
  return map[k] ?? group.charAt(0).toUpperCase() + group.slice(1);
}

function mapFocusToGoal(f: TrainingFocus): string {
  if (f === "Hypertrophy") return "Build Overall Muscle";
  if (f === "Powerlifting") return "Improve Overall Strength";
  if (f === "General Strength") return "Improve Overall Strength";
  return "Build Overall Muscle";
}

function primaryMuscleLabel(groups: string[] | undefined): string | null {
  const g = groups?.[0];
  return g ? labelGroup(g) : null;
}

/**
 * Prefer concrete session instructions over plan titles so "Next move" feels actionable.
 */
export function pickDirectedNextMove(analysis: CoachStructuredAnalysis): string {
  const plan = analysis.nextSessionAdjustmentPlan;
  for (const adj of plan?.adjustments ?? []) {
    const ins = adj.instruction?.trim();
    if (ins) return ins;
  }
  const sug = analysis.actionableSuggestions[0]?.trim();
  if (sug) return sug;
  const title = plan?.title?.trim();
  if (title) return title;
  return "Open Coach review for step-by-step detail.";
}

function keyFocusLooksLikeHighEffortFatigue(keyFocus: string): boolean {
  const t = keyFocus.toLowerCase();
  return (
    t.includes("failure") ||
    t.includes("very hard") ||
    t.includes("pushed very hard") ||
    t.includes("close to failure") ||
    t.includes("rir") ||
    t.includes("effort is very high") ||
    t.includes("being pushed")
  );
}

/**
 * Single home narrative: same priority drives hero + Coach Insight focus/next move.
 * When `coachAnalysis.keyFocus` exists, hero ignores raw weekly volume lows so we never
 * contradict the dominant coach signal (e.g. bench effort vs back volume).
 */
export function buildHomePrimaryCoachingStory(params: {
  hasActive: boolean;
  workoutCount: number;
  coachAnalysis: CoachStructuredAnalysis;
  thisWeek: { workoutsCount: number; totalSets: number; weeklyVolume: Record<string, number> };
  trainingFocus: TrainingFocus;
}): HomePrimaryCoachingStory {
  const { hasActive, workoutCount, coachAnalysis, thisWeek, trainingFocus } = params;
  const goalMapped = mapFocusToGoal(trainingFocus);

  if (hasActive) {
    return {
      headline: "Resume your session",
      subline: "Pick up where you left off.",
      focusText: "You’re mid-session — finishing today locks in this week’s work.",
      nextMove: "Complete your planned sets, then save the workout.",
    };
  }

  if (workoutCount === 0) {
    return {
      headline: "Train when you’re ready",
      subline: "Log sessions to unlock your coach.",
      focusText: "Log your first session",
      nextMove: "Start a workout to personalize your coach.",
    };
  }

  const kf = coachAnalysis.keyFocus?.trim();
  const kfType = coachAnalysis.keyFocusType;
  const ex = coachAnalysis.keyFocusExercise?.trim();
  const muscleLabel = primaryMuscleLabel(coachAnalysis.keyFocusGroups);

  if (kf) {
    const nextMove = pickDirectedNextMove(coachAnalysis);
    let headline: string;
    let subline: string;

    switch (kfType) {
      case "declining": {
        if (keyFocusLooksLikeHighEffortFatigue(kf)) {
          headline = ex ? `${ex} is being pushed very hard` : "Training stress is running high";
          subline = ex
            ? `Keep logging, but avoid taking every ${ex} set to failure.`
            : "Keep effort slightly more controlled for a session or two, then reassess.";
        } else {
          headline = ex ? `${ex} has slipped recently` : "Performance has dipped";
          subline = ex
            ? `Run one lighter ${ex} session with crisp reps, then rebuild.`
            : "Ease stress for a session, then rebuild with clean reps.";
        }
        break;
      }
      case "plateau": {
        headline = ex ? `${ex} progress has stalled` : "Progress has flattened";
        subline = ex
          ? `Nudge ${ex} with a small load or rep target next session, then track the result.`
          : "Try a small progression change on your main lift, then reassess.";
        break;
      }
      case "low-volume": {
        headline = muscleLabel
          ? `${muscleLabel} is light this week`
          : ex
            ? `${ex} needs more weekly support`
            : "Support volume is light";
        subline = muscleLabel
          ? `A ${muscleLabel.toLowerCase()}-focused session this week would tighten your volume balance.`
          : ex
            ? `Add enough weekly sets behind ${ex} so support work keeps pace.`
            : "Schedule work for your lagging area so the week balances out.";
        break;
      }
      case "progressing": {
        headline = ex ? `${ex} is moving well` : "Training is trending up";
        subline =
          thisWeek.workoutsCount > 0
            ? `${thisWeek.workoutsCount} workout${thisWeek.workoutsCount === 1 ? "" : "s"} · ${thisWeek.totalSets} sets logged (last 7 days). Stack another quality session.`
            : "Keep stacking consistent sessions this week.";
        break;
      }
      default: {
        headline = ex ? `${ex} is the priority` : muscleLabel ? `${muscleLabel} needs attention` : "This week’s coaching priority";
        subline =
          ex && muscleLabel
            ? `Balance ${muscleLabel.toLowerCase()} work with your ${ex} plan this week.`
            : "Use Coach review if you want the full breakdown.";
        break;
      }
    }

    return { headline, subline, focusText: kf, nextMove };
  }

  if (coachAnalysis.actionableSuggestions.length > 0 || coachAnalysis.nextSessionAdjustmentPlan) {
    const focusFromSug = coachAnalysis.actionableSuggestions[0]?.trim() ?? "Coach summary ready";
    const nextMove = pickDirectedNextMove(coachAnalysis);
    return {
      headline: "This week’s main tweak",
      subline: "Small shift now usually beats a big overhaul later.",
      focusText: focusFromSug,
      nextMove,
    };
  }

  if (workoutCount < 3) {
    return {
      headline: "Building your coaching read",
      subline: "Track 1–2 more sessions before making a bigger adjustment.",
      focusText: "Coach read is still forming",
      nextMove: "For now, keep effort slightly more controlled while more data builds.",
    };
  }

  const supportGap = detectLimitingSupportMuscle({
    goal: goalMapped,
    volumeByMuscle: thisWeek.weeklyVolume ?? {},
  });
  const limiting = supportGap.limitingMuscle;
  const limitingSets =
    limiting && Number.isFinite(thisWeek.weeklyVolume?.[limiting])
      ? thisWeek.weeklyVolume[limiting]
      : 0;
  const minTarget = 8;
  const addSets = Math.max(2, Math.min(5, minTarget - limitingSets));

  if (!limiting) {
    return {
      headline: "Keep going",
      subline:
        thisWeek.workoutsCount > 0
          ? `${thisWeek.workoutsCount} workout${thisWeek.workoutsCount === 1 ? "" : "s"} · ${thisWeek.totalSets} sets (last 7 days).`
          : "Add your next session when you’re ready.",
      focusText: "Volume looks balanced across muscle groups.",
      nextMove: "Prioritize your main lift in your next session.",
    };
  }

  const titleGroup = labelGroup(limiting);
  return {
    headline: `${titleGroup} is light this week`,
    subline: `One more ${titleGroup.toLowerCase()}-focused session would bring weekly volume closer to target.`,
    focusText: `${titleGroup} volume is light this week`,
    nextMove: `Add ${addSets}–${addSets + 1} quality ${titleGroup.toLowerCase()} sets when you can.`,
  };
}
