"use client";

/**
 * Applying a verdict's recommendation (U2b). `change_rate` edits the goal's
 * rate through `validateRate`, records the change in `rateHistory` (which
 * restarts the rate segment and the cooldown) and starts a fresh program
 * entry; `refresh_targets` only restarts the program entry.
 */

import { goalHistoryRepo, goalStore, programStore } from "@/lib/physique/io/repos";
import { loadGoalContext } from "@/lib/physique/io/goalSetup";
import { refreshProgram } from "@/lib/physique/program";
import { validateRate } from "@/lib/physique/targets";
import type { Now } from "@/lib/dates";
import type { PhysiqueGoal, Recommendation } from "@/lib/physique/types";
import type { WeightUnit } from "@/lib/units";

export type ApplyResult = { ok: true; summary: string } | { ok: false; error: string };

function fail(e: unknown): ApplyResult {
  const msg = e instanceof Error ? e.message : String(e);
  return { ok: false, error: msg.startsWith("Storage write failed") ? "Couldn't save. Export a backup from Profile, then free up space." : msg };
}

/** Apply a `change_rate` or `refresh_targets` recommendation. Other kinds are informational. */
export async function applyRecommendation(rec: Recommendation, now: Now, weightUnit: WeightUnit, nowIso: string): Promise<ApplyResult> {
  try {
    const goal = goalStore.snapshot();
    if (!goal) return { ok: false, error: "No active goal." };
    const ctx = loadGoalContext(now, weightUnit);
    const program = programStore.snapshot();
    if (rec.kind === "change_rate") {
      const trendKg = ctx.trendKg ?? goal.startTrendKg;
      const v = validateRate({ type: goal.type, ratePctPerWeek: rec.toPctPerWeek, status: goal.trainingStatusAtCreation, trendKg, tdee0: ctx.tdee0 ?? 0 });
      if (!v.ok) return { ok: false, error: v.message };
      const next: PhysiqueGoal = {
        ...goal,
        ratePctPerWeek: rec.toPctPerWeek,
        rateHistory: [...(goal.rateHistory ?? []), { date: now.today, fromPctPerWeek: goal.ratePctPerWeek, toPctPerWeek: rec.toPctPerWeek, reason: "recommendation" }],
      };
      await goalStore.set(next);
      await goalHistoryRepo.upsert({ ...next, date: next.startDate });
      if (program) {
        const update = refreshProgram(program, next, { ...ctx.inputs, goals: ctx.goals.map((g) => (g.id === next.id ? next : g)) }, now, { source: "apply_now", acceptedAt: nowIso });
        if (update) await programStore.set(update.program);
        return { ok: true, summary: update ? `Goal set to ${fmtRate(rec.toPctPerWeek)}. Targets now ${update.entry.kcal.toLocaleString("en-GB")} kcal.` : `Goal set to ${fmtRate(rec.toPctPerWeek)}.` };
      }
      return { ok: true, summary: `Goal set to ${fmtRate(rec.toPctPerWeek)}.` };
    }
    if (rec.kind === "refresh_targets") {
      if (!program) return { ok: false, error: "No program to refresh." };
      const update = refreshProgram(program, goal, ctx.inputs, now, { source: "refresh", acceptedAt: nowIso });
      if (!update) return { ok: false, error: "Couldn't estimate expenditure yet." };
      await programStore.set(update.program);
      return { ok: true, summary: `Targets updated to ${update.entry.kcal.toLocaleString("en-GB")} kcal.` };
    }
    return { ok: false, error: "This recommendation is applied by logging, not by a button." };
  } catch (e) {
    return fail(e);
  }
}

function fmtRate(pct: number): string {
  return `${pct > 0 ? "+" : "−"}${Math.abs(pct).toFixed(2)} %/wk`;
}
