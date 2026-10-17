"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import PageHeader from "@/components/ui/PageHeader";
import { getWorkoutHistory } from "@/lib/trainingAnalysis";
import { useWorkoutStore } from "@/lib/workout-store";
import { useUnit } from "@/lib/unit-preference";
import { countCompletedLoggedSets, SET_TYPE_LABEL, SET_TYPE_MARK, setTypeOf, type SetType } from "@/lib/completedSets";

type HistorySet = { weight: string; reps: string; notes?: string; rir?: number; type?: SetType };
type HistoryExercise = {
  exerciseId?: string;
  name: string;
  restSec?: number;
  sets: HistorySet[];
};

type WorkoutRow = {
  storageIndex: number;
  completedAt: string;
  name?: string;
  durationSec?: number;
  totalExercises: number;
  totalSets: number;
  exercises: HistoryExercise[];
};

function mapStoredToRows(stored: ReturnType<typeof getWorkoutHistory>): WorkoutRow[] {
  return stored
    .map((w, storageIndex) => ({
      storageIndex,
      completedAt: w.completedAt,
      name: w.name,
      durationSec: w.durationSec,
      totalExercises: w.exercises?.length ?? 0,
      totalSets: w.exercises?.reduce((sum, ex) => sum + countCompletedLoggedSets(ex.sets), 0) ?? 0,
      exercises:
        w.exercises?.map((ex) => ({
          name: ex.name,
          restSec: ex.restSec,
          sets: ex.sets?.map((s) => ({ weight: String(s.weight), reps: String(s.reps), notes: s.notes, ...(typeof s.rir === "number" ? { rir: s.rir } : {}), ...(s.type && s.type !== "working" ? { type: s.type } : {}) })) ?? [],
        })) ?? [],
    }))
    .sort((a, b) => {
      const ta = new Date(a.completedAt).getTime();
      const tb = new Date(b.completedAt).getTime();
      if (Number.isFinite(ta) && Number.isFinite(tb)) return tb - ta;
      return 0;
    });
}

/** Digits and at most one decimal (`,` normalized to `.`). */
function sanitizeWeightInput(raw: string): string {
  let out = "";
  let seenDot = false;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if ((ch === "." || ch === ",") && !seenDot) {
      seenDot = true;
      out += ".";
    }
  }
  return out;
}

function sanitizeRepsInput(raw: string): string {
  return raw.replace(/\D/g, "");
}

export default function HistoryPage() {
  const { removeWorkoutAtIndex, replaceWorkoutAtIndex } = useWorkoutStore();
  const { unit } = useUnit();
  const [workouts, setWorkouts] = useState<WorkoutRow[]>([]);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<HistoryExercise[] | null>(null);

  const reload = useCallback(() => {
    setWorkouts(mapStoredToRows(getWorkoutHistory()));
  }, []);

  useEffect(() => {
    reload();
    const onChange = () => reload();
    window.addEventListener("workoutHistoryChanged", onChange);
    return () => window.removeEventListener("workoutHistoryChanged", onChange);
  }, [reload]);

  // Deep-link from chart tooltips: ?w=<completedAt-ISO> expands & scrolls to
  // that session once the workouts list is loaded. We read window.location
  // directly to avoid useSearchParams' static-rendering Suspense requirement.
  // Ref-gated so navigating away within the page doesn't re-trigger a scroll.
  const deepLinkConsumedRef = useRef<string | null>(null);
  const [deepLinkTarget, setDeepLinkTarget] = useState<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    setDeepLinkTarget(params.get("w"));
  }, []);
  useEffect(() => {
    if (workouts.length === 0) return;
    const w = deepLinkTarget;
    if (!w || deepLinkConsumedRef.current === w) return;
    const idx = workouts.findIndex((row) => row.completedAt === w);
    if (idx === -1) return;
    const key = `${workouts[idx].completedAt}-${idx}`;
    setExpandedKey(key);
    deepLinkConsumedRef.current = w;
    requestAnimationFrame(() => {
      document.getElementById(`workout-${idx}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [workouts, deepLinkTarget]);

  function formatDuration(sec: number) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatDateTime(isoString: string) {
    const date = new Date(isoString);
    const day = date.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "");
    const time = date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return `${day} · ${time}`;
  }

  function workoutDisplayName(w: WorkoutRow) {
    const n = typeof w.name === "string" ? w.name.trim() : "";
    if (n) return n;
    const first = w.exercises?.[0]?.name?.trim?.() ? w.exercises[0].name.trim() : "";
    if (first) return `${first} Workout`;
    return "Workout";
  }

  function startEdit(workout: WorkoutRow) {
    const draft: HistoryExercise[] = workout.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      name: ex.name,
      restSec: ex.restSec,
      sets: ex.sets.map((s) => ({ ...s })),
    }));
    setEditingIndex(workout.storageIndex);
    setEditDraft(draft);
  }

  function cancelEdit() {
    setEditingIndex(null);
    setEditDraft(null);
  }

  function saveEdit() {
    if (editingIndex === null || editDraft === null) return;
    replaceWorkoutAtIndex(editingIndex, { exercises: editDraft });
    setEditingIndex(null);
    setEditDraft(null);
  }

  function updateDraftSet(
    exIdx: number,
    setIdx: number,
    field: "weight" | "reps" | "notes",
    value: string
  ) {
    setEditDraft((prev) => {
      if (!prev) return prev;
      return prev.map((ex, i) => {
        if (i !== exIdx) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => (j === setIdx ? { ...s, [field]: value } : s)),
        };
      });
    });
  }

  function confirmDelete() {
    if (pendingDeleteIndex === null) return;
    removeWorkoutAtIndex(pendingDeleteIndex);
    setPendingDeleteIndex(null);
    setExpandedKey(null);
    cancelEdit();
    reload();
  }

  const pendingWorkout =
    pendingDeleteIndex !== null
      ? workouts.find((w) => w.storageIndex === pendingDeleteIndex) ?? null
      : null;

  const editingDraftSummary = useMemo(() => {
    if (!editDraft) return { exercises: 0, sets: 0 };
    return {
      exercises: editDraft.length,
      sets: editDraft.reduce(
        (sum, ex) => sum + countCompletedLoggedSets(ex.sets),
        0
      ),
    };
  }, [editDraft]);

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 sm:px-6">
        <PageHeader caption="Train" title="History" />

        {workouts.length === 0 ? (
          <p className="text-app-secondary">
            No workouts yet. Finish one from Train and it shows here.
          </p>
        ) : (
          <ul className="space-y-3">
            {workouts.map((workout, i) => {
              const key = `${workout.completedAt}-${i}`;
              const isOpen = expandedKey === key;
              const isEditing = editingIndex === workout.storageIndex;
              const displayName = workoutDisplayName(workout);
              const exercisesToRender =
                isEditing && editDraft ? editDraft : workout.exercises;
              return (
                <li
                  key={workout.completedAt}
                  id={`workout-${i}`}
                  className="rounded-[12px] bg-[var(--surface)] p-4"
                  style={{ scrollMarginTop: "5rem" }}
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (isEditing) return;
                        setExpandedKey((prev) => (prev === key ? null : key));
                      }}
                      className="flex-1 min-w-0 text-left"
                      disabled={isEditing}
                    >
                      <p className="text-white font-semibold mb-1">{displayName}</p>
                      <p className="text-app-secondary text-sm mb-2">{formatDateTime(workout.completedAt)}</p>
                      <p className="text-app-meta text-sm mb-2">
                        {(isEditing ? editingDraftSummary.exercises : workout.totalExercises)} exercise
                        {(isEditing ? editingDraftSummary.exercises : workout.totalExercises) !== 1 ? "s" : ""} ·{" "}
                        {(isEditing ? editingDraftSummary.sets : workout.totalSets)} total sets
                      </p>
                      {!isOpen && !isEditing ? (
                        <ul className="text-sm text-app-secondary space-y-1">
                          {workout.exercises.map((ex, j) => (
                            <li key={j}>{ex.name}</li>
                          ))}
                        </ul>
                      ) : null}
                    </button>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      {isEditing ? (
                        <>
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="h-9 rounded-full bg-[var(--primary)] px-4 text-[13px] font-semibold text-[var(--text-on-primary)] transition-colors"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={cancelEdit}
                            className="h-9 rounded-full px-3 text-[13px] font-medium text-[var(--text-secondary)] transition-colors"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedKey(key);
                              startEdit(workout);
                            }}
                            className="h-9 rounded-full bg-[var(--surface-raised)] px-4 text-[13px] font-semibold text-[var(--text)] transition-colors"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDeleteIndex(workout.storageIndex);
                            }}
                            className="h-9 rounded-full px-3 text-[13px] font-medium transition-colors" style={{ color: "var(--status-attention)" }}
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {isOpen || isEditing ? (
                    <div className="mt-3 pt-3 border-t border-[var(--border)]">
                      <p className="text-white font-semibold mb-2">{displayName}</p>
                      <p className="text-app-secondary text-sm mb-3">
                        {formatDateTime(workout.completedAt)}
                        {typeof workout.durationSec === "number" ? ` · ${formatDuration(workout.durationSec)}` : ""}
                        {" · "}
                        {(isEditing ? editingDraftSummary.exercises : workout.totalExercises)} exercise
                        {(isEditing ? editingDraftSummary.exercises : workout.totalExercises) !== 1 ? "s" : ""} ·{" "}
                        {(isEditing ? editingDraftSummary.sets : workout.totalSets)} total sets
                      </p>
                      <div className="space-y-4">
                        {exercisesToRender.map((ex, exIdx) => (
                          <div key={exIdx}>
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <p className="text-white font-medium">{ex.name}</p>
                              {typeof ex.restSec === "number" && (
                                <span className="text-xs text-app-meta tabular-nums">Rest {ex.restSec}s</span>
                              )}
                            </div>
                            {ex.sets.length === 0 ? (
                              <p className="text-app-secondary text-sm">No sets logged.</p>
                            ) : isEditing ? (
                              <ul className="space-y-2">
                                {ex.sets.map((s, setIdx) => (
                                  <li
                                    key={setIdx}
                                    className="flex items-center gap-2 text-sm text-app-secondary"
                                  >
                                    <span className="w-6 text-[11px] text-app-meta tabular-nums shrink-0">
                                      {setIdx + 1}
                                    </span>
                                    <label className="flex-1">
                                      <span className="sr-only">
                                        Set {setIdx + 1} weight ({unit})
                                      </span>
                                      <input
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                        placeholder="weight"
                                        value={s.weight ?? ""}
                                        onChange={(e) =>
                                          updateDraftSet(
                                            exIdx,
                                            setIdx,
                                            "weight",
                                            sanitizeWeightInput(e.target.value)
                                          )
                                        }
                                        className="input-app w-full px-2 py-1.5 text-sm tabular-nums"
                                        aria-label={`Set ${setIdx + 1} weight (${unit})`}
                                      />
                                    </label>
                                    <span className="text-[11px] text-app-meta">{unit}</span>
                                    <span className="text-[11px] text-app-meta">×</span>
                                    <label className="w-16">
                                      <span className="sr-only">Set {setIdx + 1} reps</span>
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        autoComplete="off"
                                        autoCorrect="off"
                                        autoCapitalize="off"
                                        spellCheck={false}
                                        pattern="[0-9]*"
                                        placeholder="reps"
                                        value={s.reps ?? ""}
                                        onChange={(e) =>
                                          updateDraftSet(
                                            exIdx,
                                            setIdx,
                                            "reps",
                                            sanitizeRepsInput(e.target.value)
                                          )
                                        }
                                        className="input-app w-full px-2 py-1.5 text-sm tabular-nums text-center [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        aria-label={`Set ${setIdx + 1} reps`}
                                      />
                                    </label>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <ul className="space-y-1 text-sm text-app-secondary">
                                {ex.sets.map((s, setIdx) => (
                                  <li key={setIdx} className="tabular-nums">
                                    {SET_TYPE_MARK[setTypeOf(s)] ? `${SET_TYPE_LABEL[setTypeOf(s)]} ` : `Set ${setIdx + 1} `}· {s.weight} {unit} × {s.reps}
                                    {s.notes?.trim() && (
                                      <p className="text-app-meta text-xs mt-0.5 pl-0">{s.notes.trim()}</p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                      {isEditing && (
                        <p className="mt-4 text-[11px] text-app-meta">
                          Edits save back to this workout in your history. Sets with empty reps are dropped from totals but kept as placeholders.
                        </p>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {pendingDeleteIndex !== null && pendingWorkout && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-workout-title"
          onClick={() => setPendingDeleteIndex(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-[var(--surface)] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="delete-workout-title" className="text-white font-bold">Delete workout?</h2>
            <p className="text-sm text-app-secondary mt-2 leading-relaxed">
              Remove <span className="text-white font-medium">{workoutDisplayName(pendingWorkout)}</span> from your history. This cannot be undone.
            </p>
            <div className="flex gap-2 mt-6 justify-end">
              <button
                type="button"
                onClick={() => setPendingDeleteIndex(null)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                className="h-10 rounded-full px-4 text-sm font-semibold text-[var(--text-on-primary)] transition-colors" style={{ background: "var(--status-attention)" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
