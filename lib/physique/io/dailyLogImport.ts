"use client";

/**
 * Daily-log import io (I1): writes what `lib/import/dailyLog.ts` built,
 * sets the file's goal as starting on its own date, and takes every
 * imported record away again. Imported records carry `source: "import"`;
 * the goal an import set is remembered by id so removing the import
 * removes that goal and its program, never one the user set themselves.
 */

import type { LocalDate, Now } from "@/lib/dates";
import { kvGet, kvSet } from "@/lib/storage/kv";
import { createSingleton } from "@/lib/storage/repo";
import { createGoal, loadGoalContext } from "@/lib/physique/io/goalSetup";
import { foodEntriesRepo, goalHistoryRepo, goalStore, profileStore, programStore, sleepNightsRepo, stepsRepo, weighInsRepo } from "@/lib/physique/io/repos";
import { firstLoggedDate, savePhysiqueProfile } from "@/lib/physique/io/profile";
import { snapshotSeed } from "@/lib/physique/expenditure";
import { latestTrend } from "@/lib/physique/weight";
import type { ExpenditureSeed } from "@/lib/physique/types";
import { dailyLogRecords, type DailyLogParse } from "@/lib/import/dailyLog";
import { SAMPLE_WORKOUT_SUFFIX } from "@/lib/import/sample";
import type { WeightUnit } from "@/lib/units";
import { commitImportedWorkouts, type CommitMode, type CommitResult, type ImportableWorkout, type ImportedWeighIn } from "@/lib/csvImport";

type ImportMeta = {
  goalId?: string;
  at: string;
  /** The maintenance start an import moved back, and what it was before, so removing the import puts it back (TR7). */
  expenditure?: { set: LocalDate; before: LocalDate | null; seedBefore: ExpenditureSeed | null };
};

const importMetaStore = createSingleton<ImportMeta>("physique.v1.importMeta");

export type ImportOutcome = {
  counts: { weighIns: number; food: number; nights: number; steps: number };
  /** Days per kind where the user's own log was kept. */
  kept: number;
  /** Distinct days written, and days an earlier import already held exactly so (TR7). */
  days: number;
  sameDays: number;
  /** "set" when the file's goal was saved; otherwise one sentence on why not; null when there was none or it was not asked for. */
  goal: "set" | string | null;
};

/**
 * Write the records, then, when asked and allowed, the goal. The goal
 * starts on the file's start date: the trend at that date is its starting
 * weight and the expenditure seed is taken there, so the history before
 * and after reads as a phase that began then (as `createGoal` does today).
 */
export async function commitDailyLog(parsed: DailyLogParse, opts: { setGoal: boolean; pregnantOrEdHistory: boolean | null; now: Now; unit: WeightUnit; nowIso: string }): Promise<ImportOutcome> {
  const recs = dailyLogRecords(parsed.rows, { weighIns: weighInsRepo.snapshot(), foodEntries: foodEntriesRepo.snapshot(), sleepNights: sleepNightsRepo.snapshot(), steps: stepsRepo.snapshot() }, opts.nowIso);
  if (recs.weighIns.length) await weighInsRepo.bulkUpsert(recs.weighIns);
  if (recs.foodEntries.length) await foodEntriesRepo.bulkUpsert(recs.foodEntries);
  if (recs.sleepNights.length) await sleepNightsRepo.bulkUpsert(recs.sleepNights);
  if (recs.steps.length) await stepsRepo.bulkUpsert(recs.steps);
  const outcome: ImportOutcome = {
    counts: { weighIns: recs.weighIns.length, food: recs.foodEntries.length, nights: recs.sleepNights.length, steps: recs.steps.length },
    kept: recs.kept.weight + recs.kept.food + recs.kept.sleep + recs.kept.steps,
    days: recs.days,
    sameDays: recs.sameDays,
    goal: null,
  };
  await importMetaStore.set({ ...(importMetaStore.snapshot() ?? {}), at: opts.nowIso });
  await startMaintenanceAtHistory(opts.now, opts.unit, opts.nowIso);

  const g = parsed.goal;
  if (!g || !opts.setGoal) return outcome;
  if (opts.pregnantOrEdHistory !== false) {
    outcome.goal = opts.pregnantOrEdHistory ? "With that answer the goal is not set here. Set one from Body, where it stays at maintenance." : "Answer the goal question to set the goal.";
    return outcome;
  }
  const start = { today: g.start, tz: opts.now.tz };
  const ctx = loadGoalContext(start, opts.unit);
  const trend = latestTrend(weighInsRepo.snapshot().filter((w) => w.date <= g.start));
  if (!trend) {
    outcome.goal = "The goal needs a weigh-in on or before its start date.";
    return outcome;
  }
  if (g.ratePctPerWeek < 0 && ctx.profile.age != null && ctx.profile.age < 18) {
    outcome.goal = "A cut is not set for anyone under 18.";
    return outcome;
  }
  // The rate takes its sign from the direction of the target, so a file that writes a cut as 0.6 still reads as one.
  const signedRate = Math.abs(g.ratePctPerWeek) * (g.targetKg < trend.trendKg ? -1 : 1);
  const r = await createGoal({ ...ctx, trendKg: trend.trendKg, trendSource: "trend" }, { targetKg: g.targetKg, ratePctPerWeek: signedRate, status: g.training }, start, { startToday: true, safety: { pregnantOrEdHistory: false }, nowIso: opts.nowIso });
  if (!r.ok) {
    outcome.goal = r.error;
    return outcome;
  }
  await importMetaStore.set({ ...importMetaStore.snapshot(), goalId: r.goal.id, at: opts.nowIso });
  outcome.goal = "set";
  return outcome;
}

/**
 * Maintenance is estimated from `expenditureStartDate` on, and a goal set
 * before the import fixed that at the goal's first day, which would leave
 * the imported history out of it. Move it back to the first day with both
 * food and a weigh-in, with the seed taken there (as `createGoal` takes
 * it), and remember the old one for `removeImportedData`. Unset, the
 * engine already starts at the first logged day.
 */
async function startMaintenanceAtHistory(now: Now, unit: WeightUnit, nowIso: string): Promise<void> {
  const stored = profileStore.snapshot();
  const current = stored?.expenditureStartDate;
  if (!current) return;
  const first = firstLoggedDate(weighInsRepo.snapshot().map((w) => w.date), foodEntriesRepo.snapshot().map((f) => f.date));
  if (!first || first >= current) return;
  const ctx = loadGoalContext(now, unit);
  const seed = snapshotSeed({ profile: { ...ctx.profile, expenditureStartDate: first }, goals: ctx.goals, weighIns: ctx.inputs.weighIns, workouts: ctx.inputs.workouts, tz: now.tz, startDate: first, onboarding: ctx.inputs.onboarding });
  const meta = importMetaStore.snapshot();
  const before = meta?.expenditure ?? { before: current, seedBefore: stored?.expenditureSeed ?? null };
  await importMetaStore.set({ ...meta, at: nowIso, expenditure: { set: first, before: before.before, seedBefore: before.seedBefore } });
  await savePhysiqueProfile({ expenditureStartDate: first, expenditureSeed: seed ?? undefined });
}

/** True when anything imported is still stored. */
export function hasImportedData(): boolean {
  const any = <T extends { source: string }>(xs: readonly T[]) => xs.some((x) => x.source === "import");
  return any(weighInsRepo.snapshot()) || any(foodEntriesRepo.snapshot()) || any(sleepNightsRepo.snapshot()) || any(stepsRepo.snapshot()) || sampleWorkouts().length > 0;
}

type StoredLike = { name?: string };
const WORKOUT_HISTORY_KEY = "workoutHistory";

function sampleWorkouts(): StoredLike[] {
  const raw = kvGet<unknown>(WORKOUT_HISTORY_KEY);
  return Array.isArray(raw) ? (raw as StoredLike[]).filter((w) => (w.name ?? "").endsWith(SAMPLE_WORKOUT_SUFFIX)) : [];
}

/**
 * Remove every imported record, the sample workouts, and the goal and
 * program an import set (the goal before it is not restored: it was closed
 * into history when the import replaced it), and put back a maintenance
 * start the import moved. The user's own logs stay.
 */
export async function removeImportedData(): Promise<void> {
  for (const repo of [weighInsRepo, foodEntriesRepo, sleepNightsRepo, stepsRepo] as const) {
    for (const r of repo.snapshot()) if (r.source === "import") await repo.remove(r.id);
  }
  const raw = kvGet<unknown>(WORKOUT_HISTORY_KEY);
  if (Array.isArray(raw)) {
    const kept = (raw as StoredLike[]).filter((w) => !(w.name ?? "").endsWith(SAMPLE_WORKOUT_SUFFIX));
    if (kept.length !== raw.length) {
      const r = kvSet(WORKOUT_HISTORY_KEY, kept);
      if (!r.ok) throw new Error(`Storage write failed: ${r.error}`);
      window.dispatchEvent(new Event("workoutHistoryChanged"));
    }
  }
  const meta = importMetaStore.snapshot();
  const goal = goalStore.snapshot();
  if (meta?.goalId && goal?.id === meta.goalId) {
    await goalStore.clear();
    await programStore.clear();
    await goalHistoryRepo.remove(meta.goalId);
  }
  const exp = meta?.expenditure;
  if (exp && profileStore.snapshot()?.expenditureStartDate === exp.set) {
    await savePhysiqueProfile({ expenditureStartDate: exp.before ?? undefined, expenditureSeed: exp.seedBefore ?? undefined });
  }
  await importMetaStore.clear();
}

/**
 * Save parsed workouts, and the bodyweights a Rep Count file carries as
 * weigh-ins (a re-import replaces the same day's import). Shared by the
 * Workouts section and the daily-log box when it is handed a workout file.
 */
export async function commitWorkoutImport(workouts: ImportableWorkout[], weighIns: ImportedWeighIn[], mode: CommitMode): Promise<CommitResult> {
  const r = commitImportedWorkouts(workouts, mode);
  if (weighIns.length > 0) {
    await weighInsRepo.bulkUpsert(weighIns.map((w) => ({ id: `import-w-${w.date}`, date: w.date, loggedAt: `${w.date}T08:00:00.000Z`, source: "import" as const, schemaVersion: 1 as const, kg: w.kg })));
  }
  return r;
}
