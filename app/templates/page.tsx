"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUnit } from "@/lib/unit-preference";

const STORAGE_KEY = "workoutTemplates";

export type TemplateExercise = {
  name: string;
  targetSets: number;
  restSec?: number;
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
          ? {
              name: String((ex as { name: unknown }).name),
              targetSets: Math.max(1, Number((ex as { targetSets?: unknown }).targetSets) || 3),
              restSec:
                (ex as { restSec?: unknown }).restSec != null &&
                Number.isFinite(Number((ex as { restSec?: unknown }).restSec))
                  ? Math.max(0, Math.min(600, Number((ex as { restSec?: unknown }).restSec)))
                  : undefined,
            }
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
  const { unit, setUnit } = useUnit();
  const [templateName, setTemplateName] = useState("");
  const [exerciseInput, setExerciseInput] = useState("");
  const [exerciseSetsInput, setExerciseSetsInput] = useState(3);
  const [restSecInput, setRestSecInput] = useState("90");
  const [exercises, setExercises] = useState<TemplateExercise[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<WorkoutTemplate[]>([]);
  const [editingTemplateIndex, setEditingTemplateIndex] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [addExercisePerTemplate, setAddExercisePerTemplate] = useState<Record<number, string>>({});
  const [addExerciseSetsPerTemplate, setAddExerciseSetsPerTemplate] = useState<Record<number, number>>({});
  const [addExerciseRestSecPerTemplate, setAddExerciseRestSecPerTemplate] = useState<Record<number, string>>({});
  const [editingTemplateDraft, setEditingTemplateDraft] = useState<WorkoutTemplate | null>(null);
  const [editingExercise, setEditingExercise] = useState<{
    templateIndex: number;
    exerciseIndex: number;
    name: string;
    targetSets: number;
    restSecInput: string;
  } | null>(null);

  function startWorkoutFromTemplate(template: WorkoutTemplate) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({ templateName: template.name, exercises: template.exercises })
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
    const restSec = Math.max(0, Math.min(600, parseInt(restSecInput, 10) || 0));
    setExercises((prev) => [...prev, { name: trimmed, targetSets: sets, ...(restSec > 0 ? { restSec } : {}) }]);
    setExerciseInput("");
    setExerciseSetsInput(3);
    setRestSecInput("90");
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

  function startEditTemplate(index: number) {
    setEditingTemplateIndex(index);
    setEditingTemplateDraft(JSON.parse(JSON.stringify(savedTemplates[index])));
    setEditingExercise(null);
  }

  function saveEditTemplate() {
    if (editingTemplateIndex === null || !editingTemplateDraft) return;
    const name = editingTemplateDraft.name.trim();
    if (!name) return;
    const updated = savedTemplates.map((t, i) =>
      i === editingTemplateIndex ? { ...editingTemplateDraft, name, exercises: editingTemplateDraft.exercises } : t
    );
    applyTemplates(updated);
    setEditingTemplateIndex(null);
    setEditingTemplateDraft(null);
    setEditingExercise(null);
  }

  function cancelEditTemplate() {
    setEditingTemplateIndex(null);
    setEditingTemplateDraft(null);
    setEditingExercise(null);
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
    if (editingTemplateIndex === index) {
      setEditingTemplateIndex(null);
      setEditingTemplateDraft(null);
    }
    if (editingExercise?.templateIndex === index) setEditingExercise(null);
    setAddExercisePerTemplate((prev) => {
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  function removeExerciseFromTemplate(templateIndex: number, exerciseIndex: number) {
    if (editingTemplateDraft && editingTemplateIndex === templateIndex) {
      setEditingTemplateDraft((prev) =>
        prev ? { ...prev, exercises: prev.exercises.filter((_, i) => i !== exerciseIndex) } : null
      );
      setEditingExercise(null);
      return;
    }
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
    const restSecVal = Math.max(0, Math.min(600, parseInt(addExerciseRestSecPerTemplate[templateIndex] ?? "90", 10) || 0));
    const newEx: TemplateExercise = { name: value, targetSets: sets, ...(restSecVal > 0 ? { restSec: restSecVal } : {}) };
    if (editingTemplateDraft && editingTemplateIndex === templateIndex) {
      setEditingTemplateDraft((prev) => (prev ? { ...prev, exercises: [...prev.exercises, newEx] } : null));
      setAddExercisePerTemplate((prev) => ({ ...prev, [templateIndex]: "" }));
      setAddExerciseSetsPerTemplate((prev) => ({ ...prev, [templateIndex]: 3 }));
      setAddExerciseRestSecPerTemplate((prev) => ({ ...prev, [templateIndex]: "90" }));
      return;
    }
    const updated = savedTemplates.map((t, i) =>
      i === templateIndex
        ? { ...t, exercises: [...t.exercises, newEx] }
        : t
    );
    applyTemplates(updated);
    setAddExercisePerTemplate((prev) => ({ ...prev, [templateIndex]: "" }));
    setAddExerciseSetsPerTemplate((prev) => ({ ...prev, [templateIndex]: 3 }));
    setAddExerciseRestSecPerTemplate((prev) => ({ ...prev, [templateIndex]: "90" }));
  }

  function startEditExercise(templateIndex: number, exerciseIndex: number) {
    const source =
      editingTemplateDraft && editingTemplateIndex === templateIndex
        ? editingTemplateDraft.exercises
        : savedTemplates[templateIndex]?.exercises;
    const ex = source?.[exerciseIndex];
    if (!ex) return;
    setEditingExercise({
      templateIndex,
      exerciseIndex,
      name: ex.name,
      targetSets: ex.targetSets,
      restSecInput: ex.restSec != null ? String(ex.restSec) : "",
    });
  }

  function saveEditExercise() {
    if (!editingExercise) return;
    const { templateIndex, exerciseIndex, name, targetSets, restSecInput } = editingExercise;
    const trimmed = name.trim();
    if (!trimmed) {
      setEditingExercise(null);
      return;
    }
    const sets = Math.max(1, Math.min(20, targetSets));
    const restSec = Math.max(0, Math.min(600, parseInt(restSecInput, 10) || 0));
    const updatedEx: TemplateExercise = { name: trimmed, targetSets: sets, ...(restSec > 0 ? { restSec } : {}) };
    if (editingTemplateDraft && editingTemplateIndex === templateIndex) {
      setEditingTemplateDraft((prev) => {
        if (!prev) return null;
        const next = [...prev.exercises];
        next[exerciseIndex] = updatedEx;
        return { ...prev, exercises: next };
      });
      setEditingExercise(null);
      return;
    }
    const updated = savedTemplates.map((t, i) =>
      i === templateIndex
        ? {
            ...t,
            exercises: t.exercises.map((ex, j) =>
              j === exerciseIndex ? updatedEx : ex
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
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link href="/" className="text-app-secondary hover:text-white transition-colors text-sm font-medium">
            ← Home
          </Link>
          <h1 className="text-3xl font-bold text-white">Templates</h1>
          <div className="ml-auto inline-flex items-center rounded-full border border-teal-900/40 bg-zinc-900/70 p-0.5">
            {(["kg", "lb"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`min-w-[2.25rem] rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                  unit === u ? "bg-teal-500/25 text-teal-100 shadow-sm shadow-teal-950/30" : "text-app-tertiary hover:text-app-secondary"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        <section className="mb-8 space-y-4">
          <div>
            <label className="label-section block mb-1.5">Template name</label>
            <input
              type="text"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="e.g. Push Day"
              className="input-app w-full p-3"
            />
          </div>

          <div>
            <label className="label-section block mb-1.5">Add exercise</label>
            <div className="flex gap-2 flex-wrap">
              <input
                type="text"
                value={exerciseInput}
                onChange={(e) => setExerciseInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addExercise()}
                placeholder="Exercise name"
                className="input-app flex-1 min-w-[140px] p-3"
              />
              <div className="flex items-center gap-2">
                <label className="text-sm text-app-tertiary">Sets</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={exerciseSetsInput}
                  onChange={(e) => setExerciseSetsInput(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3)))}
                  className="input-app w-14 p-3"
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-app-tertiary">Rest</label>
                <input
                  type="number"
                  min={0}
                  max={600}
                  placeholder="0"
                  value={restSecInput}
                  onChange={(e) => setRestSecInput(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(restSecInput, 10);
                    if (!Number.isNaN(n) && n >= 0 && n <= 600) setRestSecInput(String(n));
                    else if (restSecInput.trim() === "") setRestSecInput("");
                  }}
                  className="input-app w-16 p-3 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="text-sm text-app-meta">s (0 = no rest)</span>
              </div>
              <button
                onClick={addExercise}
                className="px-4 py-3 rounded-xl btn-primary"
              >
                Add
              </button>
            </div>
          </div>

          {exercises.length > 0 && (
            <div>
              <p className="label-section mb-2">Exercises in this template</p>
              <ul className="space-y-1 p-4 rounded-2xl border border-teal-950/40 bg-gradient-to-b from-zinc-900/95 to-teal-950/25">
                {exercises.map((ex, i) => (
                  <li key={i} className="text-app-secondary text-sm">
                    {i + 1}. <span className="text-white font-medium">{ex.name}</span> — {ex.targetSets} set{ex.targetSets !== 1 ? "s" : ""}{" "}
                    <span className="text-app-meta">• {ex.restSec != null && ex.restSec > 0 ? `${ex.restSec}s rest` : "no rest"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <button
            onClick={saveTemplate}
            disabled={!templateName.trim() || exercises.length === 0}
            className="w-full py-3 rounded-xl btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Save Template
          </button>
        </section>

        {savedTemplates.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-white mb-4">Saved templates</h2>
            <ul className="space-y-3">
              {savedTemplates.map((template, index) => {
                const isEditMode = editingTemplateIndex === index && editingTemplateDraft;
                const data = isEditMode ? editingTemplateDraft! : template;
                return (
                <li key={index} className="card-app">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                    {isEditMode ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="text"
                          value={data.name}
                          onChange={(e) =>
                            setEditingTemplateDraft((p) => (p ? { ...p, name: e.target.value } : null))
                          }
                          placeholder="Template name"
                          className="input-app flex-1 min-w-0 p-2 text-sm"
                        />
                        <button onClick={saveEditTemplate} className="text-xs px-2 py-1.5 rounded-lg btn-primary">
                          Save
                        </button>
                        <button
                          onClick={cancelEditTemplate}
                          className="text-xs px-2 py-1.5 rounded-lg btn-secondary !py-1.5 !px-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : editingTemplateIndex === index ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && saveRename()}
                          className="input-app flex-1 min-w-0 p-2 text-sm"
                          autoFocus
                        />
                        <button onClick={saveRename} className="text-xs px-2 py-1.5 rounded-lg btn-primary">
                          Save
                        </button>
                        <button
                          onClick={() => { setEditingTemplateIndex(null); setRenameValue(""); }}
                          className="text-xs px-2 py-1.5 rounded-lg btn-secondary !py-1.5 !px-2"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="min-w-0">
                        <h3 className="font-bold text-white truncate">{template.name}</h3>
                        <p className="text-xs text-app-meta mt-0.5">
                          {template.exercises.length} exercise{template.exercises.length !== 1 ? "s" : ""}
                        </p>
                      </div>
                    )}
                    {!isEditMode && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          onClick={() => startWorkoutFromTemplate(template)}
                          className="text-sm px-3 py-1.5 rounded-lg btn-primary"
                        >
                          Start Workout
                        </button>
                        {editingTemplateIndex !== index && (
                          <details className="relative">
                            <summary className="list-none cursor-pointer select-none text-sm px-3 py-1.5 rounded-lg border border-teal-800/40 text-app-secondary hover:bg-teal-950/30 transition">
                              Options
                            </summary>
                            <div className="absolute right-0 mt-2 w-48 rounded-xl bg-zinc-950 border border-teal-900/50 shadow-xl p-2 z-10">
                              <button
                                type="button"
                                onClick={() => startEditTemplate(index)}
                                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-teal-950/30 transition text-app-secondary"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => startRename(index)}
                                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-teal-950/30 transition text-app-secondary"
                              >
                                Rename
                              </button>
                              <button
                                type="button"
                                onClick={() => deleteTemplate(index)}
                                className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-red-900/30 transition text-red-300"
                              >
                                Delete
                              </button>
                            </div>
                          </details>
                        )}
                      </div>
                    )}
                  </div>

                  <ul className="text-sm text-app-secondary space-y-1.5 mb-4">
                    {data.exercises.map((ex, i) => {
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
                                className="input-app flex-1 min-w-[100px] p-2 text-sm"
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
                                className="input-app w-12 p-2 text-sm"
                              />
                              <span className="text-app-meta text-xs">sets</span>
                              <label className="text-app-meta text-xs">Rest</label>
                              <input
                                type="number"
                                min={0}
                                max={600}
                                placeholder="0"
                                value={editingExercise.restSecInput}
                                onChange={(e) =>
                                  setEditingExercise((p) => p ? { ...p, restSecInput: e.target.value } : null)
                                }
                                onBlur={() =>
                                  setEditingExercise((p) => {
                                    if (!p) return p;
                                    const n = parseInt(p.restSecInput, 10);
                                    const normalized = !Number.isNaN(n) && n >= 0 && n <= 600 ? String(n) : p.restSecInput.trim() === "" ? "" : p.restSecInput;
                                    return normalized !== p.restSecInput ? { ...p, restSecInput: normalized } : p;
                                  })
                                }
                                className="input-app w-14 p-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <span className="text-app-meta text-xs">s</span>
                              <button
                                onClick={saveEditExercise}
                                className="text-xs px-2 py-1 rounded-lg btn-primary"
                              >
                                Save
                              </button>
                              <button
                                onClick={() => setEditingExercise(null)}
                                className="text-xs px-2 py-1 rounded-lg btn-secondary !py-1 !px-2"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className="min-w-0 truncate">
                                {i + 1}. {ex.name}{" "}
                                <span className="text-app-meta">
                                  — {ex.targetSets} set{ex.targetSets !== 1 ? "s" : ""} • {ex.restSec != null && ex.restSec > 0 ? `${ex.restSec}s rest` : "no rest"}
                                </span>
                              </span>
                              <details className="relative">
                                <summary className="list-none cursor-pointer select-none text-xs px-2 py-1 rounded-lg border border-teal-800/40 text-app-tertiary hover:bg-teal-950/30 transition">
                                  ⋯
                                </summary>
                                <div className="absolute right-0 mt-2 w-40 rounded-xl bg-zinc-950 border border-teal-900/50 shadow-xl p-2 z-10">
                                  <button
                                    type="button"
                                    onClick={() => startEditExercise(index, i)}
                                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-teal-950/30 transition text-app-secondary"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeExerciseFromTemplate(index, i)}
                                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-red-900/30 transition text-red-300"
                                  >
                                    Remove
                                  </button>
                                </div>
                              </details>
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
                      className="input-app flex-1 min-w-[120px] p-2 text-sm"
                    />
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-app-meta">Sets</label>
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
                        className="input-app w-12 p-2 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-app-meta">Rest</label>
                      <input
                        type="number"
                        min={0}
                        max={600}
                        placeholder="0"
                        value={addExerciseRestSecPerTemplate[index] ?? "90"}
                        onChange={(e) =>
                          setAddExerciseRestSecPerTemplate((prev) => ({ ...prev, [index]: e.target.value }))
                        }
                        onBlur={() => {
                          const v = addExerciseRestSecPerTemplate[index] ?? "90";
                          const n = parseInt(v, 10);
                          if (!Number.isNaN(n) && n >= 0 && n <= 600) setAddExerciseRestSecPerTemplate((prev) => ({ ...prev, [index]: String(n) }));
                          else if (String(v).trim() === "") setAddExerciseRestSecPerTemplate((prev) => ({ ...prev, [index]: "" }));
                        }}
                        className="input-app w-14 p-2 text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-app-meta">s</span>
                    </div>
                    <button
                      onClick={() => addExerciseToTemplate(index)}
                      className="text-sm px-3 py-2 rounded-lg btn-primary"
                    >
                      Add
                    </button>
                  </div>
                </li>
              );
            })}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
