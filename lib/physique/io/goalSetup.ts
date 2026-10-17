"use client";

/**
 * Goal setup io (U3): gathers engine inputs from the repos, previews a draft
 * goal through `newProgram`, and writes the goal, its history entry, the
 * initial program and the frozen expenditure seed in one go.
 */

import { loadOnboardingProfile } from "@/lib/onboardingProfile";
import { getWorkoutHistory } from "@/lib/trainingAnalysis";
import { getPhysiqueProfileSync, saveOnboardingBasics, savePhysiqueProfile, type ResolvedProfile } from "@/lib/physique/io/profile";
import { dayFlagsStore, foodEntriesRepo, goalHistoryRepo, goalStore, newId, programStore, weighInsRepo } from "@/lib/physique/io/repos";
import { computeExpenditure, snapshotSeed, type ExpenditureInputs } from "@/lib/physique/expenditure";
import { newProgram, type ProgramUpdate } from "@/lib/physique/program";
import { etaWeeks, goalTypeFor, rateBands, trainingStatus, validateRate, type RateValidation } from "@/lib/physique/targets";
import { liftDerivedTrainingStatus } from "@/lib/physique/strength";
import { latestTrend } from "@/lib/physique/weight";
import { addDays, dayDiff, type Now } from "@/lib/dates";
import type { BodyFatCategory, GoalType, PhysiqueGoal, Sex, TrainingStatus } from "@/lib/physique/types";
import type { WeightUnit } from "@/lib/units";

/** A finished cut this recent, and this long, triggers the DB-2 maintenance suggestion (research F). EVID. */
export const DB2_CUT_MIN_WEEKS = 8;
export const DB2_RECENT_DAYS = 14;

export type GoalDraft = {
  targetKg: number;
  ratePctPerWeek: number;
  status: TrainingStatus;
};

export type GoalContext = {
  profile: ResolvedProfile;
  /** Current trend weight, else the last weigh-in, else the onboarding bodyweight. */
  trendKg: number | null;
  trendSource: "trend" | "weigh-in" | "onboarding" | null;
  /** Expenditure today from the seed (TDEE₀ for a goal starting today). */
  tdee0: number | null;
  statusFromLifts: TrainingStatus | null;
  statusFromYears: TrainingStatus;
  goals: PhysiqueGoal[];
  activeGoal: PhysiqueGoal | null;
  /** DB-2: a cut of 8+ weeks ended in the last 14 days. */
  recentCutEnded: boolean;
  inputs: ExpenditureInputs;
};

function allGoals(): PhysiqueGoal[] {
  const history = goalHistoryRepo.snapshot().map((g) => {
    const copy: PhysiqueGoal & { date?: string } = { ...g };
    delete copy.date;
    return copy as PhysiqueGoal;
  });
  const current = goalStore.snapshot();
  if (current && !history.some((g) => g.id === current.id)) history.push(current);
  return history.sort((a, b) => (a.startDate < b.startDate ? -1 : 1));
}

/** Everything the goal wizard needs, from repo snapshots. Call on the client after hydration. */
export function loadGoalContext(now: Now, weightUnit: WeightUnit): GoalContext {
  const profile = getPhysiqueProfileSync();
  const onboarding = loadOnboardingProfile();
  const weighIns = weighInsRepo.snapshot();
  const workouts = getWorkoutHistory();
  const goals = allGoals();
  const activeGoal = goalStore.snapshot();
  const trend = latestTrend(weighIns);
  const lastWeighIn = weighIns.at(-1) ?? null;
  const trendKg = trend?.trendKg ?? lastWeighIn?.kg ?? onboarding?.bodyweightKg ?? null;
  const trendSource = trend ? "trend" : lastWeighIn ? "weigh-in" : onboarding?.bodyweightKg ? "onboarding" : null;
  const inputs: ExpenditureInputs = {
    profile,
    weighIns,
    foodEntries: foodEntriesRepo.snapshot(),
    dayFlags: dayFlagsStore.snapshot(),
    goals,
    workouts,
    onboarding: { daysPerWeek: onboarding?.daysPerWeek ? Number(onboarding.daysPerWeek) : undefined, bodyweightKg: onboarding?.bodyweightKg, age: profile.age },
  };
  const exp = computeExpenditure(inputs, now);
  const tdee0 = exp?.series.at(-1)?.tdee ?? null;
  const lifts = liftDerivedTrainingStatus({ workouts, weightUnit, now, goals });
  const statusFromYears = trainingStatus(onboarding?.yearsTrainingBand, null);
  const lastEnded = goals.filter((g) => g.type === "lose" && g.completedAt).at(-1) ?? null;
  const recentCutEnded = !!lastEnded && dayDiff(lastEnded.startDate, lastEnded.completedAt!.slice(0, 10)) >= DB2_CUT_MIN_WEEKS * 7 && dayDiff(lastEnded.completedAt!.slice(0, 10), now.today) <= DB2_RECENT_DAYS;
  return { profile, trendKg, trendSource, tdee0, statusFromLifts: lifts?.status ?? null, statusFromYears, goals, activeGoal, recentCutEnded, inputs };
}

export type GoalPreview = {
  type: GoalType;
  validation: RateValidation;
  etaWeeks: number | null;
  etaDate: string | null;
  update: ProgramUpdate | null;
  bands: ReturnType<typeof rateBands>;
};

/** Every goal with the active one marked complete as of `today` (the new goal replaces it). */
function goalsWithPreviousClosed(ctx: GoalContext, today: string): PhysiqueGoal[] {
  const previous = ctx.activeGoal;
  return ctx.goals.map((g) => (previous && g.id === previous.id && !g.completedAt ? { ...g, completedAt: `${today}T00:00:00.000Z` } : g));
}

function draftGoal(ctx: GoalContext, draft: GoalDraft, now: Now, startToday: boolean, id = "draft"): PhysiqueGoal {
  const trendKg = ctx.trendKg ?? draft.targetKg;
  const type = goalTypeFor(draft.targetKg, trendKg);
  return {
    id,
    createdAt: `${now.today}T00:00:00.000Z`,
    type,
    startDate: now.today,
    startTrendKg: trendKg,
    targetKg: draft.targetKg,
    ratePctPerWeek: type === "maintain" ? 0 : draft.ratePctPerWeek,
    trainingStatusAtCreation: draft.status,
    phaseStartConfirmedAt: startToday ? `${now.today}T00:00:00.000Z` : undefined,
    schemaVersion: 1,
  };
}

/** Live numbers for the rate step: validation, ETA and the initial program from `newProgram`. */
export function previewGoal(ctx: GoalContext, draft: GoalDraft, now: Now): GoalPreview {
  const goal = draftGoal(ctx, draft, now, true);
  const trendKg = goal.startTrendKg;
  const bands = rateBands(draft.status, { nearGoal: Math.abs(trendKg - draft.targetKg) <= 0.02 * trendKg });
  const validation = validateRate({ type: goal.type, ratePctPerWeek: goal.ratePctPerWeek, status: draft.status, trendKg, tdee0: ctx.tdee0 ?? 0 });
  const weeks = goal.type === "maintain" ? 0 : etaWeeks(trendKg, draft.targetKg, goal.ratePctPerWeek);
  const etaDate = weeks != null && Number.isFinite(weeks) ? addDays(now.today, Math.round(weeks * 7)) : null;
  // History keeps every earlier goal (closed on the new start) so the seed and the predictive offsets match what createGoal writes.
  const inputs: ExpenditureInputs = { ...ctx.inputs, goals: [...goalsWithPreviousClosed(ctx, now.today), goal] };
  const update = validation.ok ? newProgram(goal, inputs, now) : null;
  return { type: goal.type, validation, etaWeeks: weeks, etaDate, update, bands };
}

export type SafetyAnswers = { pregnantOrEdHistory: boolean };

export type CreateGoalResult = { ok: true; goal: PhysiqueGoal; update: ProgramUpdate } | { ok: false; error: string };

/**
 * Write the goal, close any active one, freeze the expenditure seed, store
 * the safety answers and start the initial (unsmoothed) program.
 */
export async function createGoal(ctx: GoalContext, draft: GoalDraft, now: Now, opts: { startToday: boolean; safety: SafetyAnswers; nowIso: string }): Promise<CreateGoalResult> {
  try {
    const goal = { ...draftGoal(ctx, draft, now, opts.startToday, newId()), createdAt: opts.nowIso };
    if (opts.startToday) goal.phaseStartConfirmedAt = opts.nowIso;
    const preview = previewGoal(ctx, draft, now);
    if (!preview.validation.ok) return { ok: false, error: preview.validation.message };

    // Close the active goal (kept in history).
    const previous = ctx.activeGoal;
    if (previous && !previous.completedAt) {
      const closed = { ...previous, completedAt: opts.nowIso };
      await goalHistoryRepo.upsert({ ...closed, date: closed.startDate });
    }

    // Freeze the expenditure seed the first time a start date exists (P3 deviation 3).
    const startDate = ctx.profile.expenditureStartDate ?? now.today;
    const goalsForSeed = [...goalsWithPreviousClosed(ctx, now.today).map((g) => (g.id === previous?.id ? { ...g, completedAt: opts.nowIso } : g)), goal];
    const seed =
      ctx.profile.expenditureSeed && ctx.profile.expenditureSeed.date === startDate
        ? ctx.profile.expenditureSeed
        : snapshotSeed({ profile: { ...ctx.profile, expenditureStartDate: startDate }, goals: goalsForSeed, weighIns: ctx.inputs.weighIns, workouts: ctx.inputs.workouts, tz: now.tz, startDate, onboarding: ctx.inputs.onboarding });
    await savePhysiqueProfile({
      expenditureStartDate: startDate,
      expenditureSeed: seed ?? undefined,
      safety: { pregnantOrEdHistory: opts.safety.pregnantOrEdHistory, answeredAt: opts.nowIso },
    });

    await goalStore.set(goal);
    await goalHistoryRepo.upsert({ ...goal, date: goal.startDate });

    const profile = getPhysiqueProfileSync();
    const update = newProgram(goal, { ...ctx.inputs, profile, goals: goalsForSeed }, now, { acceptedAt: opts.nowIso });
    if (!update) return { ok: false, error: "Couldn't estimate your maintenance. Add your height in Profile." };
    await programStore.set(update.program);
    return { ok: true, goal, update };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg.startsWith("Storage write failed") ? "Couldn't save. Export a backup from Profile, then free up space." : msg };
  }
}

/** Step 0 of the wizard: the basics the engine can't run without. */
export async function saveBasics(input: { sex?: Sex; heightCm?: number; age?: number; bodyFatCategory?: BodyFatCategory | null }): Promise<void> {
  saveOnboardingBasics({ sex: input.sex, heightCm: input.heightCm, age: input.age });
  const patch: Parameters<typeof savePhysiqueProfile>[0] = {};
  if (input.sex) patch.sex = input.sex;
  if (input.heightCm) patch.heightCm = input.heightCm;
  if (input.age) patch.age = input.age;
  if (input.bodyFatCategory) patch.bodyFatCategory = input.bodyFatCategory;
  await savePhysiqueProfile(patch);
}
