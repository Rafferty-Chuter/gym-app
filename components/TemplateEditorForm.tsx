"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ExercisePicker, { type ExercisePickerValue } from "@/components/ExercisePicker";
import CreateExerciseModal from "@/components/CreateExerciseModal";
import { SortableList, DragHandle } from "@/components/SortableList";
import { getExerciseByName } from "@/lib/exerciseLibrary";
import {
  USER_EXERCISE_LIBRARY_EVENT,
  userRecordToExercise,
  type UserExerciseRecord,
} from "@/lib/userExerciseLibrary";
import type { TemplateExercise, WorkoutTemplate } from "@/lib/templateStorage";
import { upsertTemplate } from "@/lib/templateStorage";

type Props = {
  mode: "create" | "edit";
  initialTemplate?: WorkoutTemplate;
};

let syntheticIdCounter = 0;
function newSyntheticExerciseId(): string {
  syntheticIdCounter += 1;
  return `__tpl_ex_${Date.now().toString(36)}_${syntheticIdCounter}`;
}

/**
 * Mobile-friendly integer stepper. Replaces native <input type="number"> for
 * small ranges (set counts) where the typed-input UX is broken on mobile —
 * concatenated keystrokes ("3" + "5" → "35" → clamped to max), unclearable
 * fallbacks, and finicky text selection. Tap-to-step is unambiguous, hit
 * targets are large, and the keyboard never opens.
 */
function IntegerStepper({
  value,
  onChange,
  min,
  max,
  ariaLabel,
}: {
  value: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  ariaLabel: string;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center rounded-xl border border-zinc-700/80 bg-zinc-900/80 select-none"
    >
      <button
        type="button"
        onClick={dec}
        disabled={value <= min}
        aria-label={`Decrease ${ariaLabel}`}
        className="h-10 w-10 flex items-center justify-center text-app-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-lg font-semibold"
      >
        −
      </button>
      <span
        className="min-w-[2.25rem] text-center text-sm font-semibold text-white tabular-nums"
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        disabled={value >= max}
        aria-label={`Increase ${ariaLabel}`}
        className="h-10 w-10 flex items-center justify-center text-app-secondary hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-lg font-semibold"
      >
        +
      </button>
    </div>
  );
}

export default function TemplateEditorForm({ mode, initialTemplate }: Props) {
  const router = useRouter();
  const [templateName, setTemplateName] = useState(initialTemplate?.name ?? "");
  const [exercises, setExercises] = useState<TemplateExercise[]>(initialTemplate?.exercises ?? []);
  const [exerciseIds, setExerciseIds] = useState<string[]>(() =>
    (initialTemplate?.exercises ?? []).map(() => newSyntheticExerciseId())
  );
  const [exerciseInput, setExerciseInput] = useState("");
  const [exerciseSetsInput, setExerciseSetsInput] = useState(3);
  const [restSecInput, setRestSecInput] = useState("90");
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [createExerciseSeedName, setCreateExerciseSeedName] = useState("");
  const [replaceExerciseIndex, setReplaceExerciseIndex] = useState<number | null>(null);
  const [replaceExerciseInput, setReplaceExerciseInput] = useState("");
  const [userLibraryRevision, setUserLibraryRevision] = useState(0);
  const [reorderMode, setReorderMode] = useState(false);

  const canSave = useMemo(() => templateName.trim().length > 0 && exercises.length > 0, [templateName, exercises.length]);

  useEffect(() => {
    function bump() {
      setUserLibraryRevision((r) => r + 1);
    }
    window.addEventListener(USER_EXERCISE_LIBRARY_EVENT, bump);
    return () => window.removeEventListener(USER_EXERCISE_LIBRARY_EVENT, bump);
  }, []);

  /**
   * Auto-persist edits to an existing template (drag-reorder, add, remove,
   * field changes) so the user doesn't have to remember to click "Save".
   * Mirrors the active-workout draft pattern in app/workout/page.tsx.
   *
   * Edit-mode only — in create mode the template doesn't exist yet, so
   * persisting on every keystroke would orphan empty templates if the user
   * navigates away without finishing.
   *
   * Why: drag-reorder previously updated UI state but never wrote to
   * localStorage; templates appeared reordered until refresh, then snapped
   * back. Auto-persisting on the source of truth fixes that whole class of
   * "I edited but forgot to save" bug.
   */
  const editingTemplateId = mode === "edit" ? initialTemplate?.id : undefined;
  const initialAutoPersistRef = useRef(true);
  useEffect(() => {
    if (initialAutoPersistRef.current) {
      initialAutoPersistRef.current = false;
      return;
    }
    if (!editingTemplateId) return;
    const trimmedName = templateName.trim();
    if (!trimmedName || exercises.length === 0) return;
    upsertTemplate({
      id: editingTemplateId,
      name: trimmedName,
      exercises: [...exercises],
    });
  }, [exercises, templateName, editingTemplateId]);

  function openCreateExerciseFlow(seedName: string) {
    setCreateExerciseSeedName(seedName.trim());
    setCreateExerciseOpen(true);
  }

  function pushTemplateExercise(matched: { id: string; name: string }) {
    const targetSets = Math.max(1, Math.min(20, exerciseSetsInput || 3));
    const restSec = Math.max(0, Math.min(600, parseInt(restSecInput, 10) || 90));
    setExercises((prev) => [
      ...prev,
      {
        exerciseId: matched.id,
        name: matched.name,
        targetSets,
        restSec,
      },
    ]);
    setExerciseIds((prev) => [...prev, newSyntheticExerciseId()]);
    setExerciseInput("");
    setExerciseSetsInput(3);
    setRestSecInput("90");
  }

  function addExercise(selection?: ExercisePickerValue) {
    const value = (selection?.name ?? exerciseInput).trim();
    if (!value) return;
    const selectedFromPicker = selection?.exerciseId
      ? { id: selection.exerciseId, name: selection.name }
      : null;
    const matched = selectedFromPicker ?? getExerciseByName(value);
    if (!matched) {
      openCreateExerciseFlow(value);
      return;
    }
    pushTemplateExercise({ id: matched.id, name: matched.name });
  }

  function replaceExerciseAtIndex(index: number, matched: { id: string; name: string }) {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === index
          ? {
              ...ex,
              exerciseId: matched.id,
              name: matched.name,
            }
          : ex
      )
    );
  }

  function requestReplaceExercise(selection?: ExercisePickerValue) {
    if (replaceExerciseIndex === null) return;
    const value = (selection?.name ?? replaceExerciseInput).trim();
    if (!value) return;
    const selectedFromPicker = selection?.exerciseId
      ? { id: selection.exerciseId, name: selection.name }
      : null;
    const matched = selectedFromPicker ?? getExerciseByName(value);
    if (!matched) {
      openCreateExerciseFlow(value);
      return;
    }
    replaceExerciseAtIndex(replaceExerciseIndex, { id: matched.id, name: matched.name });
    setReplaceExerciseIndex(null);
    setReplaceExerciseInput("");
  }

  function handleUserExerciseCreated(record: UserExerciseRecord) {
    const ex = userRecordToExercise(record);
    if (replaceExerciseIndex !== null) {
      replaceExerciseAtIndex(replaceExerciseIndex, { id: ex.id, name: ex.name });
      setReplaceExerciseIndex(null);
      setReplaceExerciseInput("");
    } else {
      pushTemplateExercise({ id: ex.id, name: ex.name });
    }
    setUserLibraryRevision((r) => r + 1);
  }

  function reorderExercisesByIds(nextIds: string[]) {
    setExerciseIds((prevIds) => {
      setExercises((prevExercises) => {
        const idToEx = new Map<string, TemplateExercise>();
        prevIds.forEach((id, i) => {
          const ex = prevExercises[i];
          if (ex) idToEx.set(id, ex);
        });
        const reordered: TemplateExercise[] = [];
        for (const id of nextIds) {
          const ex = idToEx.get(id);
          if (ex) reordered.push(ex);
        }
        // Defensive: append any items that weren't in nextIds
        for (let i = 0; i < prevExercises.length; i++) {
          if (!nextIds.includes(prevIds[i])) reordered.push(prevExercises[i]);
        }
        return reordered;
      });
      return nextIds;
    });
  }

  function removeExercise(index: number) {
    setExercises((prev) => prev.filter((_, i) => i !== index));
    setExerciseIds((prev) => prev.filter((_, i) => i !== index));
  }

  function updateExercise(index: number, patch: Partial<TemplateExercise>) {
    setExercises((prev) => prev.map((ex, i) => (i === index ? { ...ex, ...patch } : ex)));
  }

  function saveTemplate() {
    if (!canSave) return;
    const template: WorkoutTemplate = {
      id: initialTemplate?.id ?? `tpl_${Date.now()}`,
      name: templateName.trim(),
      exercises: [...exercises],
    };
    upsertTemplate(template);
    router.push("/templates");
  }

  return (
    <>
    <main className="min-h-screen bg-zinc-950 text-white p-6 pb-28">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <Link href="/templates" className="text-app-secondary hover:text-white transition-colors text-sm font-medium">
            ← Back to Templates
          </Link>
          <h1 className="text-3xl font-bold text-white mt-2">{mode === "create" ? "Create Template" : "Edit Template"}</h1>
          <p className="text-sm text-app-secondary mt-1">Build a reusable workout blueprint.</p>
        </header>

        <section className="card-app mb-4">
          <h2 className="label-section mb-2">Template Details</h2>
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="Template name"
            className="input-app w-full px-3 py-3 text-sm"
          />
        </section>

        <section className="card-app mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="label-section mb-0">Exercises in Template</h2>
            {exercises.length > 1 && (
              <button
                type="button"
                onClick={() => setReorderMode((m) => !m)}
                className={`text-[11px] font-semibold px-2.5 py-1 rounded-lg border transition ${
                  reorderMode
                    ? "border-teal-500/45 bg-teal-500/15 text-teal-100"
                    : "border-teal-900/45 bg-zinc-800/40 text-teal-100/85 hover:text-white hover:bg-zinc-700/45"
                }`}
              >
                {reorderMode ? "Done" : "Reorder"}
              </button>
            )}
          </div>
          {exercises.length === 0 ? (
            <p className="text-sm text-app-secondary">No exercises yet. Add one below.</p>
          ) : reorderMode ? (
            <SortableList
              ids={exerciseIds}
              onReorder={(next) => reorderExercisesByIds(next as string[])}
              className="space-y-2"
              renderItem={(id, handle) => {
                const i = exerciseIds.indexOf(id);
                const ex = exercises[i];
                if (!ex) return null;
                return (
                  <div className="flex items-center gap-3 rounded-xl border border-teal-900/45 bg-zinc-900/85 px-3 py-3">
                    <DragHandle
                      attributes={handle.attributes}
                      listeners={handle.listeners}
                      isDragging={handle.isDragging}
                      ariaLabel={`Drag ${ex.name} to reorder`}
                    />
                    <p className="flex-1 min-w-0 truncate text-[14px] font-semibold text-white">
                      {ex.name}
                    </p>
                    <span className="shrink-0 text-[11px] text-app-meta tabular-nums">
                      {ex.targetSets} set{ex.targetSets === 1 ? "" : "s"}
                    </span>
                  </div>
                );
              }}
            />
          ) : (
            <ul className="space-y-2">
              {exercises.map((ex, i) => (
                <li key={exerciseIds[i] ?? `${ex.name}-${i}`} className="rounded-xl border border-teal-900/35 bg-zinc-900/70 p-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{ex.name}</p>

                          <div className="mt-2 flex flex-wrap items-end gap-3">
                            <div>
                              <span className="text-[11px] text-app-meta mb-1 block">Sets</span>
                              <IntegerStepper
                                value={ex.targetSets}
                                onChange={(next) => updateExercise(i, { targetSets: next })}
                                min={1}
                                max={20}
                                ariaLabel={`${ex.name} sets`}
                              />
                            </div>
                            <label className="block flex-1 min-w-[120px]">
                              <span className="text-[11px] text-app-meta mb-1 block">Rest (sec)</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                value={ex.restSec ?? 90}
                                onChange={(e) => {
                                  // Allow only digits during typing; clamp + parse on blur.
                                  const digits = e.target.value.replace(/[^0-9]/g, "");
                                  // If empty, keep the field empty visually but defer
                                  // committing — Math.min applied to NaN would write 0
                                  // and trap the user. Use a sentinel.
                                  const n = digits === "" ? 0 : parseInt(digits, 10);
                                  updateExercise(i, { restSec: Math.max(0, Math.min(600, n)) });
                                }}
                                onBlur={(e) => {
                                  const digits = e.target.value.replace(/[^0-9]/g, "");
                                  const n = digits === "" ? 90 : parseInt(digits, 10);
                                  updateExercise(i, { restSec: Math.max(0, Math.min(600, n)) });
                                }}
                                className="input-app w-full !px-2 !py-2 text-sm"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0 pt-1">
                          <button
                            type="button"
                            onClick={() => {
                              setReplaceExerciseIndex(i);
                              setReplaceExerciseInput("");
                            }}
                            className="rounded-lg border border-teal-900/40 bg-zinc-800/40 px-2 py-1 text-xs text-teal-100/85 hover:text-white hover:bg-teal-700/45 transition"
                          >
                            Replace
                          </button>
                          <button
                            type="button"
                            onClick={() => removeExercise(i)}
                            className="rounded-lg border border-red-900/50 bg-red-950/25 px-2 py-1 text-xs text-red-200 hover:bg-red-900/35 transition"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card-app mb-6">
          <h2 className="label-section mb-2">Add Exercise</h2>
          <div className="space-y-3">
            <ExercisePicker
              value={exerciseInput}
              onValueChange={setExerciseInput}
              onSelect={(exercise) => addExercise(exercise)}
              onRequestCreateExercise={openCreateExerciseFlow}
              placeholder="Search or type a movement"
              inputClassName="input-app w-full px-3 py-3 text-sm"
              dropdownClassName="rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto"
              libraryRevision={userLibraryRevision}
            />
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <span className="text-[11px] text-app-meta mb-1 block">Sets</span>
                <IntegerStepper
                  value={exerciseSetsInput}
                  onChange={setExerciseSetsInput}
                  min={1}
                  max={20}
                  ariaLabel="Default sets"
                />
              </div>
              <label className="block flex-1 min-w-[140px]">
                <span className="text-[11px] text-app-meta mb-1 block">Rest (sec)</span>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={restSecInput}
                  onChange={(e) => setRestSecInput(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={(e) => {
                    const digits = e.target.value.replace(/[^0-9]/g, "");
                    if (digits === "") setRestSecInput("90");
                  }}
                  className="input-app w-full px-3 py-2.5 text-sm"
                  placeholder="90"
                />
              </label>
            </div>
            <button type="button" onClick={() => addExercise()} className="w-full btn-primary rounded-xl py-2.5 text-sm">
              Add exercise
            </button>
          </div>
        </section>

        <button
          type="button"
          onClick={saveTemplate}
          disabled={!canSave}
          className="w-full py-3 rounded-xl btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Save Template
        </button>
      </div>
    </main>
    {createExerciseOpen && (
      <CreateExerciseModal
        open={createExerciseOpen}
        initialName={createExerciseSeedName}
        onClose={() => setCreateExerciseOpen(false)}
        onCreated={handleUserExerciseCreated}
      />
    )}
    {replaceExerciseIndex !== null && (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replace-template-exercise-title"
        onClick={() => {
          setReplaceExerciseIndex(null);
          setReplaceExerciseInput("");
        }}
      >
        <div
          className="w-full max-w-md rounded-2xl border border-teal-950/50 bg-gradient-to-b from-zinc-900 to-teal-950/30 shadow-xl p-5"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="replace-template-exercise-title" className="text-base font-semibold text-white mb-1">
            Replace exercise
          </h2>
          <p className="text-xs text-app-secondary mb-3">
            Pick a replacement for this slot. Order, sets, and rest stay the same.
          </p>
          <ExercisePicker
            value={replaceExerciseInput}
            onValueChange={setReplaceExerciseInput}
            onSelect={(exercise) => requestReplaceExercise(exercise)}
            onRequestCreateExercise={openCreateExerciseFlow}
            placeholder="Search or type a movement"
            inputClassName="input-app w-full p-3 text-sm"
            dropdownClassName="mt-2 rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto"
            libraryRevision={userLibraryRevision}
          />
          <div className="mt-3 flex gap-2 justify-end">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setReplaceExerciseIndex(null);
                setReplaceExerciseInput("");
              }}
            >
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={() => requestReplaceExercise()}>
              Replace
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}

