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

  function handleUserExerciseCreated(record: UserExerciseRecord) {
    const ex = userRecordToExercise(record);
    pushTemplateExercise({ id: ex.id, name: ex.name });
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
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{ex.name}</p>
                      <p className="text-xs text-app-meta mt-1">
                        {ex.targetSets} set{ex.targetSets !== 1 ? "s" : ""} · {ex.restSec ?? 90}s rest
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => moveExercise(i, "up")} className="btn-secondary !px-2 !py-1 text-xs">
                        Up
                      </button>
                      <button type="button" onClick={() => moveExercise(i, "down")} className="btn-secondary !px-2 !py-1 text-xs">
                        Down
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
  );
}

