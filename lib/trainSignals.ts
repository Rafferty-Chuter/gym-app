/**
 * The three training reads (plateau, volume, progress) as one row each,
 * for the Train tab. Moved out of the Home page on 2026-10-17 when the
 * Signals tiles left Home: same rules, same words, calmer place. Each
 * row opens its `/signal/<key>` page.
 */

import type { SignalState } from "@/lib/ui/status";
import type { CoachStructuredAnalysis } from "@/lib/coachStructuredAnalysis";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { computePlateauStatus, computeProgressStatus, computeVolumeStatus } from "@/lib/signalStatus";

export type IndicatorState = SignalState;

/** Row dot per state: DESIGN.md status colours, grey while unknown. */
export const INDICATOR_DOT_COLOR: Record<SignalState, string> = { good: "#00e5b0", watch: "#f5b544", attention: "#f26d7d", unknown: "#6f6f76" };

export type Indicator = {
  key: "plateau" | "volume" | "progress";
  label: string;
  state: IndicatorState;
  status: string;
  context: string;
  prompt: string;
};

/** What time window each read is computed over, shown under the label so users know what they're reading. */
export const INDICATOR_WINDOW_LABEL: Record<Indicator["key"], string> = {
  plateau: "Per lift · last 6 sessions",
  volume: "Last 7 days",
  progress: "Per lift · last 6 sessions",
};

function trimToOneLine(text: string, maxLen: number): string {
  const first = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text.trim();
  if (first.length <= maxLen) return first;
  return first.slice(0, maxLen - 1).trimEnd() + "…";
}

// Coarse coach group → detailed group fan-out, mirrored from /signal/[key]/page.tsx.
export function buildIndicators(coach: CoachStructuredAnalysis, workouts: StoredWorkout[], thisWeekTotalSets: number, thisWeekWorkoutsCount: number, bands?: Parameters<typeof computeVolumeStatus>[2]): Indicator[] {
  const workoutsCount = workouts.length;
  const cold = workoutsCount === 0;

  // Plateau — strict detector (P0.8). Fires only when a lift has truly
  // stagnated over the full 6-session window; peak-and-pullback is normal.
  const plateauStatus = computePlateauStatus(workouts);
  let plateauContext: string;
  let plateauPrompt: string;
  if (plateauStatus.status === "No data yet") {
    plateauContext = "Log a workout and the tracked lifts are watched for stalls.";
    plateauPrompt = "Once I start logging, how does the plateau indicator decide a lift has stalled?";
  } else if (plateauStatus.status === "Detected" && plateauStatus.detection) {
    const d = plateauStatus.detection;
    if (d.kind === "declining") {
      plateauContext = `${d.exercise} is trending down across your last ${d.sessionsTracked} sessions.`;
    } else if (d.kind === "net-flat-with-variance") {
      plateauContext = `${d.exercise} has made no net progress over your last ${d.sessionsTracked} sessions.`;
    } else {
      plateauContext = `${d.exercise} has been flat for ${d.sessionsTracked} sessions.`;
    }
    plateauPrompt = `My plateau indicator is flagged on ${d.exercise}. Walk me through what's happening and what to change next session.`;
  } else if (plateauStatus.status === "Early read") {
    plateauContext = `Only ${workoutsCount} session${workoutsCount === 1 ? "" : "s"} logged. A few more and the trend reads cleanly.`;
    plateauPrompt = "I've only got a couple of sessions logged. How many do you need before plateau detection is reliable?";
  } else {
    plateauContext = "No stalls in your tracked lifts right now.";
    plateauPrompt = "Plateau indicator is clear. Walk me through which of my lifts you're watching and what would tip it.";
  }
  const plateau: Indicator = { key: "plateau", label: "Plateau", state: plateauStatus.state, status: plateauStatus.status, context: plateauContext, prompt: plateauPrompt };

  // Volume — canonical from helper. Context line still pulls coach summaries
  // when available so the row feels specific.
  const volumeStatus = computeVolumeStatus(coach, workouts, bands);
  let volumeContext: string;
  let volumePrompt: string;
  const lowVolumeEntries = coach.volumeBalance.filter((v) => /\b(low|missing|light|behind|below|needs?\s+more)\b/i.test(v.summary));
  if (cold) {
    volumeContext = "Log sets and weekly volume is read by muscle group.";
    volumePrompt = "Once I start logging, what does the weekly volume indicator track?";
  } else if (volumeStatus.status === "Excessive") {
    const excessiveGroups = volumeStatus.rows.filter((r) => r.status === "excessive").map((r) => r.group.toLowerCase());
    const joined = excessiveGroups.join(" and ");
    volumeContext = joined ? `${joined[0].toUpperCase()}${joined.slice(1)} volume is above the productive range while progress is stalling.` : "Volume on at least one muscle group is above the productive range.";
    volumePrompt = joined ? `My ${joined} volume is above range. Walk me through what to drop.` : "My volume is above range on at least one muscle group. Walk me through what to drop.";
  } else if (volumeStatus.status === "Running low") {
    const lowGroups = volumeStatus.rows.filter((r) => r.status === "low").map((r) => r.group.toLowerCase());
    const groupsJoined = lowVolumeEntries.length > 0 ? lowVolumeEntries.map((v) => v.label.toLowerCase()).join(" and ") : lowGroups.join(" and ");
    volumeContext =
      lowVolumeEntries.length > 0
        ? trimToOneLine(lowVolumeEntries[0].summary, 120)
        : groupsJoined
          ? `${groupsJoined[0].toUpperCase()}${groupsJoined.slice(1)} weekly volume is below where it should be.`
          : "Weekly volume is running low for at least one muscle group.";
    volumePrompt = groupsJoined ? `Weekly volume looks light on ${groupsJoined}. Walk me through where I'm short and what to add this week.` : "My weekly volume is running low. Walk me through where I'm short and what to add this week.";
  } else if (volumeStatus.status === "Worth a look") {
    volumeContext = coach.volumeBalance.length > 0 ? trimToOneLine(coach.volumeBalance[0].summary, 120) : "Some muscles are above range but lifts are still moving. Worth watching for fatigue.";
    volumePrompt = "There are volume balance notes on my training this week. Walk me through them.";
  } else if (volumeStatus.status === "Early read") {
    volumeContext = `Only ${workoutsCount} session${workoutsCount === 1 ? "" : "s"} logged. A few more and the weekly read becomes meaningful.`;
    volumePrompt = "I've only got a few sessions in. What can you tell me about my volume so far?";
  } else {
    volumeContext = thisWeekTotalSets > 0 ? `${thisWeekTotalSets} sets across ${thisWeekWorkoutsCount} session${thisWeekWorkoutsCount === 1 ? "" : "s"} this week.` : "Balanced across muscle groups.";
    volumePrompt = "My weekly volume looks balanced. Show me the by-muscle breakdown for this week.";
  }
  const volume: Indicator = { key: "volume", label: "Volume", state: volumeStatus.state, status: volumeStatus.status, context: volumeContext, prompt: volumePrompt };

  // Progress — canonical aggregate from the shared helper.
  const progressStatus = computeProgressStatus(workouts);
  let progressContext: string;
  let progressPrompt: string;
  if (progressStatus.status === "No data yet") {
    progressContext = "Log a workout and each lift is tracked for what is moving and what is stuck.";
    progressPrompt = "Once I start logging, how does the progression indicator track which lifts are moving?";
  } else if (progressStatus.status === "Early read") {
    progressContext = `Only ${workoutsCount} session${workoutsCount === 1 ? "" : "s"} logged. A few more and the trend becomes readable.`;
    progressPrompt = "I've only got a couple of sessions logged. How many sessions per lift do you need before progression becomes readable?";
  } else if (progressStatus.status === "Limited data") {
    progressContext = "Not enough sessions per lift to read a trend yet.";
    progressPrompt = "I don't have enough logged sessions yet to read a trend. How many sessions per lift do you need?";
  } else if (progressStatus.status === "Trending up") {
    progressContext = "Most of your tracked lifts are trending up on e1RM.";
    progressPrompt = "Most of my lifts are trending up. Walk me through which ones are moving and how much.";
  } else if (progressStatus.status === "Trending down") {
    progressContext = "Most of your tracked lifts are trending down on e1RM.";
    progressPrompt = "My progression looks like it's trending down. Walk me through which lifts are declining and what's likely behind it.";
  } else {
    progressContext = "Some lifts moving, some flat. No clear overall direction yet.";
    progressPrompt = "My progression is mixed across lifts. Walk me through which are moving, which are flat, and what to focus on.";
  }
  const progression: Indicator = { key: "progress", label: "Progress", state: progressStatus.state, status: progressStatus.status, context: progressContext, prompt: progressPrompt };

  return [plateau, volume, progression];
}
