"use client";

import { useMemo } from "react";
import { Caption, PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { ExerciseBestList, RecordList, StatsStrip, workoutTitle, workoutWhen } from "@/components/training/WorkoutViews";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { recordKindsByExercise, workoutStats, type WorkoutRecord } from "@/lib/training/workoutSummary";

/**
 * The screen after Finish (TR4, after Hevy's "Workout complete"): what the
 * session added up to, the records it set and each exercise's best set.
 * From a routine that changed, it asks once whether to update the routine;
 * otherwise it offers to save the session as a routine. Only the sets that
 * were ticked done are shown, because only those were saved.
 */
export default function WorkoutComplete({
  workout,
  records,
  unit,
  routineName,
  routineChanges,
  onUpdateRoutine,
  onKeepRoutine,
  canSaveRoutine,
  routineSaved,
  onSaveRoutine,
  onDone,
}: {
  workout: StoredWorkout;
  records: readonly WorkoutRecord[];
  unit: string;
  routineName: string | null;
  routineChanges: readonly string[] | null;
  onUpdateRoutine: () => void;
  onKeepRoutine: () => void;
  canSaveRoutine: boolean;
  routineSaved: boolean;
  onSaveRoutine: () => void;
  onDone: () => void;
}) {
  const stats = useMemo(() => workoutStats(workout), [workout]);
  const kinds = useMemo(() => recordKindsByExercise(records), [records]);
  const empty = stats.sets === 0;

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto" style={{ background: "var(--background)", color: "var(--text)" }} role="dialog" aria-modal="true" aria-labelledby="workout-complete-title">
      <div className="mx-auto flex min-h-full max-w-md flex-col gap-5 px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] pt-[calc(1.5rem+env(safe-area-inset-top,0px))]">
        <header className="flex flex-col gap-1">
          <Caption>Workout complete</Caption>
          <h1 id="workout-complete-title" className="text-[28px] font-semibold leading-tight tracking-[-0.01em]">
            {workoutTitle(workout)}
          </h1>
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {workoutWhen(workout.completedAt)}
          </p>
        </header>

        <StatsStrip stats={stats} records={records.length} unit={unit} />

        {empty ? (
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            No sets were ticked done, so nothing was added to your history.
          </p>
        ) : (
          <>
            {records.length > 0 && (
              <section className="flex flex-col gap-2">
                <Caption>Records</Caption>
                <RecordList records={records} unit={unit} />
              </section>
            )}
            <section className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <Caption>Exercises</Caption>
                <Caption>Best set</Caption>
              </div>
              <ExerciseBestList workout={workout} recordKinds={kinds} unit={unit} linked={false} />
            </section>
          </>
        )}

        {routineChanges && routineChanges.length > 0 && routineName && (
          <section className="flex flex-col gap-3 rounded-[16px] px-4 py-4" style={{ background: "var(--surface)" }} aria-label="Routine changes">
            <div className="flex flex-col gap-1">
              <p className="text-[15px] font-semibold">Update &ldquo;{routineName}&rdquo;?</p>
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Today was different from the routine:
              </p>
            </div>
            <ul className="flex flex-col gap-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {routineChanges.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ul>
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton onClick={onKeepRoutine}>Keep routine</SecondaryButton>
              <button type="button" onClick={onUpdateRoutine} className="h-[44px] rounded-[12px] px-4 text-[15px] font-semibold transition-colors active:bg-[var(--primary-pressed)]" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }}>
                Update routine
              </button>
            </div>
          </section>
        )}

        {routineSaved && (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }} role="status">
            {routineName ? `${routineName} updated.` : "Saved to your routines."}
          </p>
        )}

        <div className="mt-auto flex flex-col gap-2 pt-2">
          {canSaveRoutine && !routineSaved && !empty && <SecondaryButton onClick={onSaveRoutine}>Save as routine</SecondaryButton>}
          <PrimaryButton onClick={onDone}>Done</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
