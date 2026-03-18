"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "workoutTemplates";

export type TemplateExercise = {
  name: string;
  targetSets: number;
};

type WorkoutTemplate = {
  name: string;
  exercises: TemplateExercise[];
};

function normalizeTemplate(t: { name: string; exercises: unknown[] }): WorkoutTemplate {
  return {
    name: t.name,
    exercises: t.exercises.map((ex) =>
      typeof ex === "string"
        ? { name: ex, targetSets: 3 }
        : typeof ex === "object" && ex !== null && "name" in ex
          ? { name: String((ex as { name: unknown }).name), targetSets: Math.max(1, Number((ex as { targetSets?: unknown }).targetSets) || 3) }
          : { name: "Exercise", targetSets: 3 }
    ),
  };
}

function getStoredTemplates(): WorkoutTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeTemplate);
  } catch {
    return [];
  }
}

function saveTemplatesToStorage(templates: WorkoutTemplate[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";

export default function TemplatesPage() {
  const router = useRouter();
  const [templateName, setTemplateName] = useState("");
  const [exerciseInput, setExerciseInput] = useState("");
  const [exerciseSetsInput, setExerciseSetsInput] = useState(3);
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<WorkoutTemplate[]>([]);
  const [editingTemplateIndex, setEditingTemplateIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addExercisePerTemplate, setAddExercisePerTemplate] = useState<Record<number, string>>({});
  const [addExerciseSetsPerTemplate, setAddExerciseSetsPerTemplate] = useState<Record<number, number>>({});
  const [editingExercise, setEditingExercise] = useState<{
    templateIndex: number;
    exerciseIndex: number;
    name: string;
    targetSets: number;
  } | null>(null);

  function startWorkoutFromTemplate(template: WorkoutTemplate) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({ exercises: template.exercises })
    );
    router.push("/workout");
  }

  function applyTemplates(updated: WorkoutTemplate[]) {
    saveTemplatesToStorage(updated);
    setSavedTemplates(updated);
  }

  useEffect(() => {
    setSavedTemplates(getStoredTemplates());
  }, []);

  function addExercise() {
    const trimmed = exerciseInput.trim();
    if (!trimmed) return;
    const sets = Math.max(1, Math.min(20, exerciseSetsInput));
    setExercises((prev) => [...prev, { name: trimmed, targetSets: sets }]);
    setExerciseInput("");
    setExerciseSetsInput(3);
  }

  function saveTemplate() {
    const name = templateName.trim();
    if (!name) return;

    const newTemplate: WorkoutTemplate = {
      name,
      exercises: [...exercises],
    };

    const updated = [...getStoredTemplates(), newTemplate];
    applyTemplates(updated);
    setTemplateName("");
    setExercises([]);
  }

  function startRename(index: number) {
    setEditingTemplateIndex(index);
    setRenameValue(savedTemplates[index].name);
  }

  function saveRename() {
    if (editingTemplateIndex === null) return;
    const name = renameValue.trim();
    if (!name) {
      setEditingTemplateIndex(null);
      return;
    }
    const updated = savedTemplates.map((t, i) =>
      i === editingTemplateIndex ? { ...t, name } : t
    );
    applyTemplates(updated);
    setEditingTemplateIndex(null);
    setRenameValue("");
  }

  function deleteTemplate(index: number) {
    const updated = savedTemplates.filter((_, i) => i !== index);
    applyTemplates(updated);
    if (editingTemplateIndex === index) setEditingTemplateIndex(null);
    if (editingExercise?.templateIndex === index) setEditingExercise(null);
    setAddExercisePerTemplate((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  function removeExerciseFromTemplate(templateIndex: number, exerciseIndex: number) {
    const template = savedTemplates[templateIndex];
    const updatedExercises = template.exercises.filter((_, i) => i !== exerciseIndex);
    const updated = savedTemplates.map((t, i) =>
      i === templateIndex ? { ...t, exercises: updatedExercises } : t
    );
    applyTemplates(updated);
  }

  function addExerciseToTemplate(templateIndex: number) {
    const value = (addExercisePerTemplate[templateIndex] ?? "").trim();
    if (!value) return;
    const sets = Math.max(1, Math.min(20, addExerciseSetsPerTemplate[templateIndex] ?? 3));
    const newEx: TemplateExercise = { name: value, targetSets: sets };
    const updated = savedTemplates.map((t, i) =>
      i === templateIndex
        ? { ...t, exercises: [...t.exercises, newEx] }
        : t
    );
    applyTemplates(updated);
    setAddExercisePerTemplate((prev) => ({ ...prev, [templateIndex]: "" }));
    setAddExerciseSetsPerTemplate((prev) => ({ ...prev, [templateIndex]: 3 }));
  }

  function startEditExercise(templateIndex: number, exerciseIndex: number) {
    const ex = savedTemplates[templateIndex]?.exercises[exerciseIndex];
    if (!ex) return;
    setEditingExercise({
      templateIndex,
      exerciseIndex,
      name: ex.name,
      targetSets: ex.targetSets,
    });
  }

  function saveEditExercise() {
    if (!editingExercise) return;
    const { templateIndex, exerciseIndex, name, targetSets } = editingExercise;
    const trimmed = name.trim();
    if (!trimmed) {
      setEditingExercise(null);
      return;
    }
    const sets = Math.max(1, Math.min(20, targetSets));
    const updated = savedTemplates.map((t, i) =>
      i === templateIndex
        ? {
            ...t,
            exercises: t.exercises.map((ex, j) =>
              j === exerciseIndex ? { name: trimmed, targetSets: sets } : ex
            ),
          }
        : t
    );
    applyTemplates(updated);
    setEditingExercise(null);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Templates</h1>

        <section className="mb-8 space-y-4">
          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Template name
            </label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Push Day"
              className="w-full p-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
            />
          </div>

          <div>
            <label className="block text-sm text-zinc-400 mb-1">
              Add exercise
            </label>
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                value={exerciseInput}
                onChange={(e) => setExerciseInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addExercise()}
                placeholder="Exercise name"
                className="flex-1 min-w-[140px] p-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-zinc-500">Sets</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={exerciseSetsInput}
                  onChange={(e) => setExerciseSetsInput(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3)))}
                  className="w-14 p-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                />
              </div>
              <button
                onClick={addExercise}
                className="px-4 py-3 rounded-xl bg-zinc-700 text-white font-medium hover:bg-zinc-600 transition"
              >
                Add
              </button>
            </div>
          </div>

          {exercises.length > 0 && (
            <div>
              <p className="text-sm text-zinc-400 mb-2">Exercises in this template</p>
              <ul className="space-y-1 p-3 rounded-xl bg-zinc-900 border border-zinc-800">
                {exercises.map((ex, i) => (
                  <li key={i} className="text-zinc-200">
                    {i + 1}. {ex.name} — {ex.targetSets} set{ex.targetSets !== 1 ? "s" : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={saveTemplate}
            disabled={!templateName.trim() || exercises.length === 0}
            className="w-full py-3 rounded-xl bg-white text-black font-semibold hover:bg-zinc-100 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Template
          </button>
        </section>

        {savedTemplates.length > 0 && (
          <section>
            <h2 className="text-xl font-semibold mb-4">Saved templates</h2>
            <ul className="space-y-4">
              {savedTemplates.map((template, index) => (
                <li
                  key={index}
                  className="p-4 rounded-xl bg-zinc-900 border border-zinc-800"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    {editingTemplateIndex === index ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveRename()}
                          className="flex-1 min-w-0 p-2 rounded-lg bg-zinc-800 border border-zinc-600 text-white text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500"
                          autoFocus
                        />
                        <button
                          onClick={saveRename}
                          className="text-xs px-2 py-1.5 rounded-lg bg-zinc-600 text-white hover:bg-zinc-500"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditingTemplateIndex(null);
                            setRenameValue("");
                          }}
                          className="text-xs px-2 py-1.5 rounded-lg border border-zinc-600 text-zinc-300 hover:bg-zinc-800"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <h3 className="font-semibold text-white">{template.name}</h3>
                    )}
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => startWorkoutFromTemplate(template)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-white text-black font-medium hover:bg-zinc-200 transition"
                      >
                        Start Workout
                      </button>
                      {editingTemplateIndex !== index && (
                        <>
                          <button
                            onClick={() => startRename(index)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-zinc-600 text-zinc-200 hover:bg-zinc-800 transition"
                          >
                            Rename Template
                          </button>
                          <button
                            onClick={() => deleteTemplate(index)}
                            className="text-sm px-3 py-1.5 rounded-lg border border-red-500/70 text-red-300 hover:bg-red-900/30 transition"
                          >
                            Delete Template
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <ul className="text-sm text-zinc-300 space-y-1.5 mb-3">
                    {template.exercises.map((ex, i) => {
                      const isEditing =
                        editingExercise?.templateIndex === index &&
                        editingExercise?.exerciseIndex === i;
                      return (
                        <li key={i} className="flex items-center justify-between gap-2 flex-wrap">
                          {isEditing ? (
                            <div className="flex items-center gap-2 flex-wrap">
                              <input
                                type="text"
                                value={editingExercise.name}
                                onChange={(e) =>
                                  setEditingExercise((p) => p && { ...p, name: e.target.value })
                                }
                                className="flex-1 min-w-[100px] p-2 rounded bg-zinc-800 border border-zinc-600 text-sm"
                              />
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={editingExercise.targetSets}
                                onChange={(e) =>
                                  setEditingExercise((p) =>
                                    p && { ...p, targetSets: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3)) }
                                  )
                                }
                                className="w-12 p-2 rounded bg-zinc-800 border border-zinc-600 text-sm"
                              />
                              <span className="text-zinc-500 text-xs">sets</span>
                              <button
                                onClick={saveEditExercise}
                                className="text-xs px-2 py-1 rounded border border-zinc-500 bg-zinc-600 hover:bg-zinc-500"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingExercise(null)}
                                className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-800"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <span>{i + 1}. {ex.name} — {ex.targetSets} set{ex.targetSets !== 1 ? "s" : ""}</span>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => startEditExercise(index, i)}
                                  className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-800"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => removeExerciseFromTemplate(index, i)}
                                  className="text-xs px-2 py-1 rounded border border-zinc-600 text-zinc-400 hover:bg-zinc-800"
                                >
                                  Remove
                                </button>
                              </div>
                            </>
                          )}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="flex gap-2 flex-wrap items-center">
                    <input
                      type="text"
                      value={addExercisePerTemplate[index] ?? ""}
                      onChange={(e) =>
                        setAddExercisePerTemplate((prev) => ({
                          ...prev,
                          [index]: e.target.value,
                        }))
                      }
                      onKeyDown={(e) =>
                        e.key === "Enter" && addExerciseToTemplate(index)
                      }
                      placeholder="Add exercise"
                      className="flex-1 min-w-[120px] p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                    />
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-zinc-500">Sets</label>
                      <input
                        type="number"
                        min={1}
                        max={20}
                        value={addExerciseSetsPerTemplate[index] ?? 3}
                        onChange={(e) =>
                          setAddExerciseSetsPerTemplate((prev) => ({
                            ...prev,
                            [index]: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3)),
                          }))
                        }
                        className="w-12 p-2 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none focus:ring-2 focus:ring-zinc-500"
                      />
                    </div>
                    <button
                      onClick={() => addExerciseToTemplate(index)}
                      className="text-sm px-3 py-2 rounded-lg bg-zinc-700 text-white hover:bg-zinc-600 transition"
                    >
                      Add
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
