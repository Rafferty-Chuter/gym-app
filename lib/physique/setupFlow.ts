/**
 * The first-run setup (O1): which questions it asks, in what order, and
 * where the target weight starts. One question a screen, as MacroFactor
 * and Yazio do; the goal itself is written by `io/goalSetup.createGoal`,
 * the same as the goal wizard. Pure.
 */

import { goalTypeFor } from "@/lib/physique/targets";
import type { GoalType } from "@/lib/physique/types";

// ── Thresholds ──

/** Where a cut's target starts, as a share of today's weight. OURS: about 7%, a typical first cut for a lifter, and a starting point only. */
export const DEFAULT_CUT_SHARE = 0.93;
/** Where a lean gain's target starts. OURS: about 5%, a few months of lean gain at the usual rates. */
export const DEFAULT_GAIN_SHARE = 1.05;

// ── Steps ──

export type SetupStep = "sex" | "age" | "height" | "weight" | "years" | "goal" | "target" | "pace" | "safety" | "summary";

/** The steps for a goal kind; a maintain goal has no target or pace to pick. Before the kind is chosen, the longer path is assumed. */
export function setupSteps(kind: GoalType | null): SetupStep[] {
  const head: SetupStep[] = ["sex", "age", "height", "weight", "years", "goal"];
  return kind === "maintain" ? [...head, "safety", "summary"] : [...head, "target", "pace", "safety", "summary"];
}

/** The target weight a goal kind starts from, kg, rounded to the half unit the pad steps in. */
export function defaultTargetKg(kind: Exclude<GoalType, "maintain">, currentKg: number, unitPerKg = 1): number {
  const raw = currentKg * (kind === "lose" ? DEFAULT_CUT_SHARE : DEFAULT_GAIN_SHARE);
  return Math.round(raw * unitPerKg * 2) / 2 / unitPerKg;
}

/** Whether a typed target fits the chosen kind; the engine reads the kind from the target, so a cut needs a target below the maintain band. */
export function targetFits(kind: Exclude<GoalType, "maintain">, targetKg: number, currentKg: number): boolean {
  return goalTypeFor(targetKg, currentKg) === kind;
}

/** A deficit is not offered under 18 or after a yes to the safety question; both get maintenance targets instead. */
export function forcedMaintenance(kind: GoalType, opts: { age: number; safetyYes: boolean }): boolean {
  return opts.safetyYes || (kind === "lose" && opts.age < 18);
}
