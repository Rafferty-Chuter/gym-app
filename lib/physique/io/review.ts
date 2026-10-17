"use client";

/**
 * The Monday review's io (G3): gathers the check-in plan, the week report,
 * the judge's analysis and the deload read into the pure `buildReview`,
 * and writes what accepting or keeping the decision returns. The only
 * place the review touches storage.
 */

import { useMemo } from "react";
import { addDays, type Now } from "@/lib/dates";
import { useRepo, useSingleton } from "@/lib/storage/useStored";
import { loadOnboardingProfile } from "@/lib/onboardingProfile";
import { applyCheckInAnswers, buildCheckInPlan, type CheckInAnswers, type CheckInPlan } from "@/lib/physique/checkIn";
import { fmtKcal } from "@/lib/physique/copy";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { startDeload, useDeload } from "@/lib/physique/io/deload";
import { useExpenditure } from "@/lib/physique/io/expenditure";
import { useMusclePriorities } from "@/lib/physique/io/musclePriorities";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { applyRecommendation } from "@/lib/physique/io/recommendations";
import { checkInsRepo, dayFlagsStore, goalHistoryRepo, newId, profileStore, programStore, waistRepo } from "@/lib/physique/io/repos";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { buildReview, type Review } from "@/lib/physique/review";
import { buildWeekReport, reportWeekStart } from "@/lib/physique/weekReport";
import { readDeload } from "@/lib/training/deload";
import type { Phase } from "@/lib/training/progression";
import { bandsFor } from "@/lib/training/volumeTargets";
import type { CheckInRecord, PhysiqueGoal } from "@/lib/physique/types";
import type { WeightUnit } from "@/lib/units";

export type ReviewModel = {
  plan: CheckInPlan;
  review: Review;
  /** The record for this check-in week, once the review is done. */
  reviewed: CheckInRecord | null;
  /** A goal with a program exists, so the decision can change something. */
  hasProgram: boolean;
};

/** The review for today: the plan for the current check-in week, the report for the week before it. */
export function useReview(now: Now | null, unit: WeightUnit): ReviewModel | null {
  const data = useBodyData();
  const workouts = useWorkouts();
  const goalHistory = useRepo(goalHistoryRepo);
  const checkIns = useRepo(checkInsRepo);
  const storedProfile = useSingleton(profileStore);
  const analysis = usePhysiqueAnalysis(now, unit);
  const expenditure = useExpenditure(now);
  const deloadRecord = useDeload();
  const priorities = useMusclePriorities();
  return useMemo(() => {
    if (!now || !analysis) return null;
    const profile = getPhysiqueProfileSync();
    const onboarding = loadOnboardingProfile();
    const goals: PhysiqueGoal[] = goalHistory.map((g) => {
      const copy: PhysiqueGoal & { date?: string } = { ...g };
      delete copy.date;
      return copy as PhysiqueGoal;
    });
    const daysPerWeek = onboarding?.daysPerWeek ? Number(onboarding.daysPerWeek) : NaN;
    const base = {
      profile,
      weighIns: data.weighIns,
      foodEntries: data.foodEntries,
      dayFlags: data.dayFlags,
      goals,
      workouts,
      onboarding: { daysPerWeek: Number.isFinite(daysPerWeek) ? daysPerWeek : undefined, bodyweightKg: onboarding?.bodyweightKg, age: profile.age },
    };
    const plan = buildCheckInPlan({ ...base, analysis, goal: data.goal, program: data.program, waist: data.waist }, now);
    const phase: Phase = data.goal?.type === "lose" ? "cut" : data.goal?.type === "gain" ? "lean_bulk" : "maintain";
    const report = buildWeekReport(
      {
        weighIns: data.weighIns,
        foodEntries: data.foodEntries,
        dayFlags: data.dayFlags,
        sleepNights: data.sleepNights,
        workouts,
        program: data.program,
        goal: data.goal,
        sleepGoalH: storedProfile?.sleepGoalH,
        weightUnit: unit,
        volumeBands: bandsFor(priorities, phase),
        expenditure: expenditure?.series ?? null,
      },
      reportWeekStart(addDays(plan.weekStart, -1)),
      now
    );
    const deload = readDeload({ workouts: [...workouts], unit, now, status: data.goal?.trainingStatusAtCreation ?? "intermediate", record: deloadRecord });
    const review = buildReview({ plan, report, analysis, deload, plannedSessions: Number.isFinite(daysPerWeek) ? daysPerWeek : undefined });
    const reviewed = checkIns.find((c) => c.weekStart === plan.weekStart || (c.date >= plan.weekStart && c.date <= now.today)) ?? null;
    const hasProgram = !!data.goal && !!data.program && data.program.goalId === data.goal.id;
    return { plan, review, reviewed, hasProgram };
  }, [now, unit, data, workouts, goalHistory, checkIns, storedProfile, analysis, expenditure, deloadRecord, priorities]);
}

export type ReviewAnswers = Pick<CheckInAnswers, "partialDays" | "unloggedDays" | "waistCm">;

export type CompleteResult = { ok: true; lines: string[] } | { ok: false; error: string };

/**
 * Record the review. Accepting applies every change in the decision: the
 * check-in's program update or the judge's recommendation, and a due
 * deload. Keeping writes the answers and the record only. The record is
 * written last, so a failed write leaves the review due.
 */
export async function completeReview(model: ReviewModel, answers: ReviewAnswers, choice: "accept" | "keep", now: Now, unit: WeightUnit, nowIso: string): Promise<CompleteResult> {
  try {
    const { plan, review } = model;
    const accept = choice === "accept" && review.decision.kind === "accept";
    const result = applyCheckInAnswers(plan, { ...answers, acceptProgram: accept }, { now, nowIso, newId, dayFlags: dayFlagsStore.snapshot() });
    for (const f of result.dayFlags) await dayFlagsStore.set(f.date, f);
    if (result.waist) await waistRepo.upsert(result.waist);

    const lines: string[] = [];
    if (accept && review.decision.kind === "accept") {
      for (const change of review.decision.changes) {
        if (change.kind === "recommendation") {
          const r = await applyRecommendation(change.recommendation, now, unit, nowIso);
          if (!r.ok) return r;
          lines.push(r.summary);
        } else if (change.kind === "targets") {
          if (result.program) await programStore.set(result.program);
          lines.push(`Targets now ${fmtKcal(change.to.kcal)} kcal.`);
        } else if (change.kind === "deload") {
          await startDeload(now.today, change.reason, nowIso);
          lines.push("Deload started. Train shows the week.");
        }
      }
    } else {
      lines.push(review.decision.kind === "hold" ? "Nothing changed." : "Targets kept as they were.");
    }
    await checkInsRepo.upsert({ ...result.checkIn, accepted: accept });
    return { ok: true, lines };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.startsWith("Storage write failed") ? "Couldn't save. Export a backup from Profile, then free up space." : msg };
  }
}
