"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ExercisePicker, { type ExercisePickerValue } from "@/components/ExercisePicker";
import CreateExerciseModal from "@/components/CreateExerciseModal";
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

export default function TemplateEditorForm({ mode, initialTemplate }: Props) {
  const router = useRouter();
  const [templateName, setTemplateName] = useState(initialTemplate?.name ?? "");
  const [exercises, setExercises] = useState<TemplateExercise[]>(initialTemplate?.exercises ?? []);
  const [exerciseInput, setExerciseInput] = useState("");
  const [exerciseSetsInput, setExerciseSetsInput] = useState(3);
  const [restSecInput, setRestSecInput] = useState("90");
  const [createExerciseOpen, setCreateExerciseOpen] = useState(false);
  const [createExerciseSeedName, setCreateExerciseSeedName] = useState("");
  const [replaceExerciseIndex, setReplaceExerciseIndex] = useState<number | null>(null);
  const [replaceExerciseInput, setReplaceExerciseInput] = useState("");
  const [userLibraryRevision, setUserLibraryRevision] = useState(0);

  const canSave = useMemo(() => templateName.trim().length > 0 && exercises.length > 0, [templateName, exercises.length]);

  useEffect(() => {
    function bump() {
      setUserLibraryRevision((r) => r + 1);
    }
    window.addEventListener(USER_EXERCISE_LIBRARY_EVENT, bump);
    return () => window.removeEventListener(USER_EXERCISE_LIBRARY_EVENT, bump);
  }, []);

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

  function moveExercise(index: number, direction: "up" | "down") {
    setExercises((prev) => {
      const next = [...prev];
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[index];
      next[index] = next[target];
      next[target] = tmp;
      return next;
    });
  }

  function removeExercise(index: number) {
    setExercises((prev) => prev.filter((_, i) => i !== index));
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
          <h2 className="label-section mb-2">Exercises in Template</h2>
          {exercises.length === 0 ? (
            <p className="text-sm text-app-secondary">No exercises yet. Add one below.</p>
          ) : (
            <ul className="space-y-2">
              {exercises.map((ex, i) => (
                <li key={`${ex.name}-${i}`} className="rounded-xl border border-teal-900/35 bg-zinc-900/70 p-3">
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white leading-snug line-clamp-2">{ex.name}</p>

                          <div className="mt-2 grid grid-cols-2 gap-2">
                            <label className="block">
                              <span className="text-[11px] text-app-meta mb-1 block">Sets</span>
                              <input
                                type="number"
                                min={1}
                                max={20}
                                step={1}
                                value={ex.targetSets}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (!Number.isFinite(n)) return;
                                  updateExercise(i, { targetSets: Math.max(1, Math.min(20, Math.round(n))) });
                                }}
                                className="input-app w-full !px-2 !py-2 text-sm"
                              />
                            </label>
                            <label className="block">
                              <span className="text-[11px] text-app-meta mb-1 block">Rest (sec)</span>
                              <input
                                type="number"
                                min={0}
                                max={600}
                                step={1}
                                value={ex.restSec ?? 90}
                                onChange={(e) => {
                                  const n = Number(e.target.value);
                                  if (!Number.isFinite(n)) return;
                                  updateExercise(i, { restSec: Math.max(0, Math.min(600, Math.round(n))) });
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
                            onClick={() => moveExercise(i, "up")}
                            className="h-8 w-8 rounded-lg border border-teal-900/40 bg-zinc-800/40 text-teal-200/80 hover:text-white hover:bg-teal-700/45 transition flex items-center justify-center"
                            aria-label="Move exercise up"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M12 19V5" />
                              <path d="M5 12l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => moveExercise(i, "down")}
                            className="h-8 w-8 rounded-lg border border-teal-900/40 bg-zinc-800/40 text-teal-200/80 hover:text-white hover:bg-teal-700/45 transition flex items-center justify-center"
                            aria-label="Move exercise down"
                          >
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="M12 5v14" />
                              <path d="M19 12l-7 7-7-7" />
                            </svg>
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
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                min={1}
                max={20}
                value={exerciseSetsInput}
                onChange={(e) => setExerciseSetsInput(Math.max(1, Math.min(20, Number(e.target.value) || 3)))}
                className="input-app px-3 py-2.5 text-sm"
                placeholder="Sets"
              />
              <input
                type="number"
                min={0}
                max={600}
                value={restSecInput}
                onChange={(e) => setRestSecInput(e.target.value)}
                className="input-app px-3 py-2.5 text-sm"
                placeholder="Rest (sec)"
              />
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

