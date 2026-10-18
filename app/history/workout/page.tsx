"use client";

import { Suspense, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import Sheet from "@/components/ui/Sheet";
import { Caption, PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { ExerciseSetsList, RecordList, StatsStrip, workoutTitle, workoutWhen } from "@/components/training/WorkoutViews";
import { SET_TYPE_MARK, setTypeOf } from "@/lib/completedSets";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { getStoredTemplates, upsertTemplate } from "@/lib/templateStorage";
import { newRoutineId, routineExercisesFromWorkout, uniqueRoutineName } from "@/lib/training/routine";
import { queueRepeat, workoutInProgress } from "@/lib/training/startWorkout";
import { recordKindsByExercise, workoutRecords, workoutStats } from "@/lib/training/workoutSummary";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useUnit } from "@/lib/unit-preference";
import { useWorkoutStore } from "@/lib/workout-store";

type Exercise = StoredWorkout["exercises"][number];

/** Digits and at most one decimal point. */
function cleanWeight(raw: string): string {
  let out = "";
  let dot = false;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") out += ch;
    else if ((ch === "." || ch === ",") && !dot) {
      dot = true;
      out += ".";
    }
  }
  return out;
}

function MoreGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </svg>
  );
}

function MenuItem({ children, onClick, tone }: { children: ReactNode; onClick: () => void; tone?: "attention" }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-[52px] w-full items-center px-1 text-left text-[16px] transition-colors active:opacity-70" style={{ color: tone === "attention" ? "var(--status-attention)" : "var(--text)" }}>
      {children}
    </button>
  );
}

/**
 * One finished workout (TR5, after Hevy's workout detail): what it added up
 * to, its records and every set. Repeat starts it again with the same sets;
 * the menu edits it, saves it as a routine or deletes it.
 */
function WorkoutDetail() {
  const router = useRouter();
  const params = useSearchParams();
  const at = params.get("at") ?? "";
  const hydrated = useIsHydrated();
  const workouts = useWorkouts();
  const { unit } = useUnit();
  const u = unit === "lb" ? "lb" : "kg";
  const { replaceWorkoutAtIndex, removeWorkoutAtIndex } = useWorkoutStore();

  const index = useMemo(() => workouts.findIndex((w) => w.completedAt === at), [workouts, at]);
  const workout = index >= 0 ? workouts[index] : null;
  const stats = useMemo(() => (workout ? workoutStats(workout) : null), [workout]);
  const records = useMemo(() => (workout ? workoutRecords(workout, workouts) : []), [workout, workouts]);
  const kinds = useMemo(() => recordKindsByExercise(records), [records]);

  const [menu, setMenu] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; exercises: Exercise[] } | null>(null);

  if (!hydrated) return <main className="min-h-screen" style={{ background: "var(--page)" }} />;

  if (!workout || !stats) {
    return (
      <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 sm:px-6">
          <PageHeader caption="History" captionHref="/history" captionLabel="Back to History" title="Workout" />
          <p className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
            This workout is not in your history. It may have been deleted.
          </p>
        </div>
      </main>
    );
  }

  function repeat() {
    if (!workout) return;
    if (workoutInProgress() && !window.confirm("A workout is in progress. Discard it and repeat this one?")) return;
    if (queueRepeat(workout, u)) router.push("/workout");
  }

  function saveAsRoutine() {
    if (!workout) return;
    const id = newRoutineId(Date.now(), Math.random);
    upsertTemplate({ id, name: uniqueRoutineName(workoutTitle(workout), getStoredTemplates().map((t) => t.name)), exercises: routineExercisesFromWorkout(workout, u) });
    setSaved(id);
    setMenu(false);
  }

  function startEdit() {
    if (!workout) return;
    setDraft({ name: workout.name ?? "", exercises: workout.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((s) => ({ ...s })) })) });
    setMenu(false);
  }

  function setField(ei: number, si: number, field: "weight" | "reps", value: string) {
    setDraft((d) => d && { ...d, exercises: d.exercises.map((ex, i) => (i !== ei ? ex : { ...ex, sets: ex.sets.map((s, j) => (j === si ? { ...s, [field]: value } : s)) })) });
  }

  function removeSet(ei: number, si: number) {
    setDraft((d) => d && { ...d, exercises: d.exercises.map((ex, i) => (i !== ei ? ex : { ...ex, sets: ex.sets.filter((_, j) => j !== si) })) });
  }

  function saveEdit() {
    if (!draft || index < 0) return;
    const exercises = draft.exercises.filter((ex) => ex.sets.length > 0);
    replaceWorkoutAtIndex(index, { name: draft.name.trim() || workout?.name, exercises });
    setDraft(null);
  }

  function remove() {
    if (index < 0) return;
    removeWorkoutAtIndex(index);
    router.replace("/history");
  }

  if (draft) {
    return (
      <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
        <div className="sticky top-0 z-30 border-b" style={{ background: "var(--background)", borderColor: "var(--border)" }}>
          <div className="mx-auto flex h-[52px] max-w-2xl items-center justify-between px-5 sm:px-6">
            <button type="button" onClick={() => setDraft(null)} className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
              Cancel
            </button>
            <span className="text-[17px] font-semibold">Edit workout</span>
            <button type="button" onClick={saveEdit} className="h-[34px] rounded-[10px] px-4 text-[15px] font-semibold" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }}>
              Save
            </button>
          </div>
        </div>
        <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pt-4 sm:px-6">
          <label className="flex flex-col gap-1">
            <Caption>Name</Caption>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={workoutTitle(workout)} className="h-[44px] rounded-[10px] px-3 text-[17px] outline-none" style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label="Workout name" />
          </label>
          {draft.exercises.map((ex, ei) => {
            let n = 0;
            return (
              <section key={`${ex.name}-${ei}`} className="rounded-[12px] px-4 py-3" style={{ background: "var(--surface)" }} aria-label={ex.name}>
                <p className="pb-2 text-[16px] font-semibold">{ex.name}</p>
                <div className="grid grid-cols-[28px_1fr_16px_1fr_36px] items-center gap-x-2 pb-1 text-[11px] font-medium" style={{ color: "var(--text-tertiary)" }}>
                  <span className="text-center">SET</span>
                  <span className="text-center">{u.toUpperCase()}</span>
                  <span />
                  <span className="text-center">REPS</span>
                  <span />
                </div>
                {ex.sets.length === 0 && (
                  <p className="py-2 text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                    No sets left. Saving removes this exercise from the workout.
                  </p>
                )}
                {ex.sets.map((s, si) => {
                  const type = setTypeOf(s);
                  if (type !== "warmup") n += 1;
                  const mark = SET_TYPE_MARK[type] || String(n);
                  return (
                    <div key={si} className="grid grid-cols-[28px_1fr_16px_1fr_36px] items-center gap-x-2 py-1">
                      <span className="text-center text-[13px] font-semibold" style={{ color: type === "working" ? "var(--text-secondary)" : "var(--text-tertiary)" }}>
                        {mark}
                      </span>
                      <input inputMode="decimal" value={s.weight ?? ""} onChange={(e) => setField(ei, si, "weight", cleanWeight(e.target.value))} placeholder="0" aria-label={`${ex.name} set ${si + 1} weight`} className="h-[36px] w-full rounded-[8px] text-center text-[15px] outline-none" style={{ background: "var(--surface-raised)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }} />
                      <span className="text-center text-[13px]" style={{ color: "var(--text-tertiary)" }}>
                        ×
                      </span>
                      <input inputMode="numeric" value={s.reps ?? ""} onChange={(e) => setField(ei, si, "reps", e.target.value.replace(/\D/g, ""))} placeholder="0" aria-label={`${ex.name} set ${si + 1} reps`} className="h-[36px] w-full rounded-[8px] text-center text-[15px] outline-none" style={{ background: "var(--surface-raised)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }} />
                      <button type="button" onClick={() => removeSet(ei, si)} className="flex h-[36px] w-[36px] items-center justify-center rounded-[8px] text-[18px] leading-none" style={{ color: "var(--text-tertiary)" }} aria-label={`Remove ${ex.name} set ${si + 1}`}>
                        ×
                      </button>
                    </div>
                  );
                })}
              </section>
            );
          })}
          <p className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            Changes save to this workout. A set with no reps is not counted.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader
          caption="History"
          captionHref="/history"
          captionLabel="Back to History"
          title={workoutTitle(workout)}
          secondary={
            <button type="button" onClick={() => setMenu(true)} className="flex h-9 w-9 items-center justify-center rounded-full transition-colors active:bg-[var(--surface-pressed)]" style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label="Workout options">
              <MoreGlyph />
            </button>
          }
        />
        <p className="-mt-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          {workoutWhen(workout.completedAt)}
        </p>

        <StatsStrip stats={stats} records={records.length} unit={u} />

        {records.length > 0 && (
          <section className="flex flex-col gap-2">
            <Caption>Records</Caption>
            <RecordList records={records} unit={u} />
          </section>
        )}

        <section className="flex flex-col gap-2">
          <Caption>Exercises</Caption>
          <ExerciseSetsList workout={workout} recordKinds={kinds} unit={u} />
        </section>

        {saved && (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }} role="status">
            Saved to your routines.{" "}
            <Link href={`/templates/${saved}`} className="font-semibold" style={{ color: "var(--text)" }}>
              Edit routine
            </Link>
          </p>
        )}

        <PrimaryButton onClick={repeat}>Repeat workout</PrimaryButton>
      </div>

      <Sheet open={menu} onClose={() => (setMenu(false), setConfirmDelete(false))} title={workoutTitle(workout)}>
        <div className="flex flex-col divide-y divide-[var(--border)] pb-2">
          <MenuItem onClick={startEdit}>Edit workout</MenuItem>
          <MenuItem onClick={saveAsRoutine}>Save as routine</MenuItem>
          {confirmDelete ? (
            <div className="flex flex-col gap-2 py-3">
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Delete this workout from your history? This cannot be undone.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <SecondaryButton onClick={() => setConfirmDelete(false)}>Keep</SecondaryButton>
                <button type="button" onClick={remove} className="h-[44px] rounded-[12px] text-[15px] font-semibold" style={{ background: "var(--status-attention)", color: "var(--text-on-primary)" }}>
                  Delete
                </button>
              </div>
            </div>
          ) : (
            <MenuItem onClick={() => setConfirmDelete(true)} tone="attention">
              Delete workout
            </MenuItem>
          )}
        </div>
      </Sheet>
    </main>
  );
}

export default function WorkoutDetailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen" style={{ background: "var(--page)" }} />}>
      <WorkoutDetail />
    </Suspense>
  );
}
