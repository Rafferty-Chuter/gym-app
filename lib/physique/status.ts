/**
 * Home-tile status for the Body signal: the `{state, status}` contract of
 * `lib/signalStatus.ts`, derived from a `PhysiqueAnalysis`, plus the rule
 * → state map the judge uses for "status = most severe" (02 §8.3 step 4).
 *
 * Pure.
 */

import { STATUS_LABEL } from "@/lib/physique/copy";
import type { PhysiqueAnalysis, RuleId, SignalState } from "@/lib/physique/types";

// ── Rule → state (02 §8.3 step 4) ──

/** The state each rule carries when it is the primary verdict or a flag. */
export const RULE_STATE: Readonly<Record<RuleId, SignalState>> = {
  "SAFE-0": "attention",
  "SAFE-1": "attention",
  "SAFE-2": "attention",
  "SAFE-3": "attention",
  "SAFE-4": "attention",
  "SAFE-5": "attention",
  "LOSS-3": "attention",
  "LOSS-1": "watch",
  "LOSS-2": "watch",
  "LOSS-2u": "watch",
  "LOSS-4": "watch",
  "LOSS-6": "watch",
  "GAIN-1": "watch",
  "GAIN-2": "watch",
  "ADH-1": "watch",
  "DB-1": "watch",
  "SLEEP-1": "watch",
  "DATA-PARTIAL": "watch",
  "DATA-HOLD": "watch",
  "G-EXP-2": "watch",
  "ON-TRACK": "good",
  "NO-CHANGE": "good",
  "RECOMP-1": "good",
  "RECOMP-WAIST": "good",
  "GAIN-3": "good",
  "NO-GOAL": "unknown",
  "DATA-RATE": "unknown",
  "DATA-EXP": "unknown",
  // Flag-only rules cap at `watch`.
  "SLEEP-1i": "watch",
  "SLEEP-2": "watch",
  "SLEEP-3": "watch",
  "PRO-1": "watch",
  "PRO-2": "watch",
  "FAT-1": "watch",
  "STR-1": "watch",
  "STR-2": "watch",
  "GAIN-4": "watch",
};

/** Severity order for "most severe of the primary and the flags". OURS. */
export const STATE_SEVERITY: Readonly<Record<SignalState, number>> = { unknown: 0, good: 1, watch: 2, attention: 3 };

/** The more severe of two states. */
export function mostSevere(a: SignalState, b: SignalState): SignalState {
  return STATE_SEVERITY[b] > STATE_SEVERITY[a] ? b : a;
}

/** Status from a primary verdict id and the flag ids (02 §8.3 step 4). */
export function statusFor(primary: RuleId, flags: readonly RuleId[]): { state: SignalState; label: string } {
  let state = RULE_STATE[primary];
  for (const id of flags) state = mostSevere(state, RULE_STATE[id]);
  return { state, label: STATUS_LABEL[primary] };
}

// ── Home tile ──

export type PhysiqueSignalStatus = { state: SignalState; status: string };

/**
 * The Body tile's `{state, status}`: the analysis's state and a short
 * label. "Check-in ready" takes the label (not the state) while a check-in
 * is due, so the dot still reflects the verdict.
 */
export function physiqueSignalStatus(analysis: PhysiqueAnalysis | null | undefined): PhysiqueSignalStatus {
  if (!analysis) return { state: "unknown", status: "No data yet" };
  if (analysis.checkInDue) return { state: analysis.status.state, status: "Check-in ready" };
  return { state: analysis.status.state, status: analysis.status.label };
}
