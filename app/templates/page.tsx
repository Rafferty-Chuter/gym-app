"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUnit } from "@/lib/unit-preference";
import { getExerciseByName } from "@/lib/exerciseLibrary";
import ExercisePicker, { type ExercisePickerValue } from "@/components/ExercisePicker";

const STORAGE_KEY = "workoutTemplates";

export type TemplateExercise = {
  exerciseId?: string;
  name: string;
  targetSets: number;
  restSec?: number;
};

type WorkoutTemplate = {
  id: string;
  name: string;
  exercises: TemplateExercise[];
};

function normalizeTemplate(t: { id?: string; name: string; exercises: unknown[] }, index: number): WorkoutTemplate {
  const fallbackId = `tpl_${index}_${String(t.name ?? "template")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
  return {
    id: typeof t.id === "string" && t.id.trim() ? t.id.trim() : fallbackId,
    name: t.name,
    exercises: t.exercises.map((ex) => {
      if (typeof ex === "string") {
        const byName = getExerciseByName(ex);
        return {
          ...(byName ? { exerciseId: byName.id } : {}),
          name: byName?.name ?? ex,
          targetSets: 3,
        };
      }
      if (typeof ex === "object" && ex !== null && "name" in ex) {
        const rawName = String((ex as { name: unknown }).name);
        const rawId =
          "exerciseId" in ex && typeof (ex as { exerciseId?: unknown }).exerciseId === "string"
            ? ((ex as { exerciseId?: string }).exerciseId ?? "").trim()
            : "";
        const byName = getExerciseByName(rawName);
        return {
          ...(rawId || byName?.id ? { exerciseId: rawId || byName?.id } : {}),
          name: byName?.name ?? rawName,
          targetSets: Math.max(1, Number((ex as { targetSets?: unknown }).targetSets) || 3),
          restSec:
            (ex as { restSec?: unknown }).restSec != null &&
            Number.isFinite(Number((ex as { restSec?: unknown }).restSec))
              ? Math.max(0, Math.min(600, Number((ex as { restSec?: unknown }).restSec)))
              : undefined,
        };
      }
      return { name: "Exercise", targetSets: 3 };
    }),
  };
}

function getStoredTemplates(): WorkoutTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((template, index) => normalizeTemplate(template, index));
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
  const [showCreateSection, setShowCreateSection] = useState(false);
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
    exerciseId?: string;
    targetSets: number;
    restSecInput: string;
  } | null>(null);

  function startWorkoutFromTemplate(template: WorkoutTemplate) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({ templateId: template.id, templateName: template.name, exercises: template.exercises })
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

  function addExercise(selection?: ExercisePickerValue, forceCustom = false) {
    const trimmed = (selection?.name ?? exerciseInput).trim();
    if (!trimmed) return;
    const selectedFromPicker =
      !forceCustom && selection?.exerciseId
        ? { id: selection.exerciseId, name: selection.name }
        : null;
    const matched = forceCustom ? null : selectedFromPicker ?? getExerciseByName(trimmed);
    const sets = Math.max(1, Math.min(20, exerciseSetsInput));
    const restSec = Math.max(0, Math.min(600, parseInt(restSecInput, 10) || 0));
    setExercises((prev) => [
      ...prev,
      {
        ...(matched ? { exerciseId: matched.id } : {}),
        name: matched?.name ?? trimmed,
        targetSets: sets,
        ...(restSec > 0 ? { restSec } : {}),
      },
    ]);
    setExerciseInput("");
    setExerciseSetsInput(3);
    setRestSecInput("90");
  }

  function addExerciseFromPicker(selection: ExercisePickerValue) {
    addExercise(selection, !selection.exerciseId);
  }

  function moveCreateExercise(index: number, direction: "up" | "down") {
    setExercises((prev) => {
      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next;
    });
  }

  function saveTemplate() {
    const name = templateName.trim();
    if (!name) return;

    const newTemplate: WorkoutTemplate = {
      id: `tpl_${Date.now()}`,
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

  function moveExerciseInTemplate(templateIndex: number, exerciseIndex: number, direction: "up" | "down") {
    const move = (list: TemplateExercise[]) => {
      const next = [...list];
      const target = direction === "up" ? exerciseIndex - 1 : exerciseIndex + 1;
      if (target < 0 || target >= next.length) return next;
      const temp = next[exerciseIndex];
      next[exerciseIndex] = next[target];
      next[target] = temp;
      return next;
    };
    if (editingTemplateDraft && editingTemplateIndex === templateIndex) {
      setEditingTemplateDraft((prev) => (prev ? { ...prev, exercises: move(prev.exercises) } : null));
      return;
    }
    const updated = savedTemplates.map((t, i) =>
      i === templateIndex ? { ...t, exercises: move(t.exercises) } : t
    );
    applyTemplates(updated);
  }

  function addExerciseToTemplate(templateIndex: number, forceCustom = false) {
    const value = (addExercisePerTemplate[templateIndex] ?? "").trim();
    if (!value) return;
    const sets = Math.max(1, Math.min(20, addExerciseSetsPerTemplate[templateIndex] ?? 3));
    const restSecVal = Math.max(0, Math.min(600, parseInt(addExerciseRestSecPerTemplate[templateIndex] ?? "90", 10) || 0));
    const matched = forceCustom ? null : getExerciseByName(value);
    const newEx: TemplateExercise = {
      ...(matched ? { exerciseId: matched.id } : {}),
      name: matched?.name ?? value,
      targetSets: sets,
      ...(restSecVal > 0 ? { restSec: restSecVal } : {}),
    };
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
      exerciseId: ex.exerciseId,
      targetSets: ex.targetSets,
      restSecInput: ex.restSec != null ? String(ex.restSec) : "",
    });
  }

  function saveEditExercise() {
    if (!editingExercise) return;
    const { templateIndex, exerciseIndex, name, exerciseId, targetSets, restSecInput } = editingExercise;
    const trimmed = name.trim();
    if (!trimmed) {
      setEditingExercise(null);
      return;
    }
    const matched = exerciseId ? null : getExerciseByName(trimmed);
    const sets = Math.max(1, Math.min(20, targetSets));
    const restSec = Math.max(0, Math.min(600, parseInt(restSecInput, 10) || 0));
    const updatedEx: TemplateExercise = {
      ...(exerciseId || matched?.id ? { exerciseId: exerciseId ?? matched?.id } : {}),
      name: matched?.name ?? trimmed,
      targetSets: sets,
      ...(restSec > 0 ? { restSec } : {}),
    };
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

  function setEditingExerciseFromPicker(selection: ExercisePickerValue) {
    setEditingExercise((p) =>
      p
        ? {
            ...p,
            name: selection.name,
            exerciseId: selection.exerciseId,
          }
        : p
    );
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

        <section className="mb-6 p-4 rounded-2xl border border-teal-950/40 bg-zinc-900/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-white font-semibold">Template blueprints</p>
              <p className="text-xs text-app-meta">Create or manage reusable workout blueprints.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowCreateSection((prev) => !prev)}
              className="px-4 py-2 rounded-xl btn-primary text-sm"
            >
              {showCreateSection ? "Hide Create" : "Create New Template"}
            </button>
          </div>
        </section>

        {showCreateSection && (
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
              <div className="flex-1 min-w-[140px]">
                <ExercisePicker
                  value={exerciseInput}
                  onValueChange={setExerciseInput}
                  onSelect={addExerciseFromPicker}
                  placeholder="Exercise name"
                  inputClassName="input-app flex-1 min-w-[140px] p-3"
                  dropdownClassName="mt-2 rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto"
                  customOptionLabel="Add custom exercise"
                  noMatchText="No matches. Use custom exercise."
                />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-app-tertiary">Sets</label>
                <div className="w-28">
                  <input
                    type="range"
                    min={1}
                    max={20}
                    step={1}
                    value={exerciseSetsInput}
                    onChange={(e) => setExerciseSetsInput(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3)))}
                    className="w-full accent-teal-400"
                    aria-label="Template sets slider"
                  />
                  <p className="text-[11px] text-app-meta text-center">{exerciseSetsInput}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-app-tertiary">Rest</label>
                <div className="w-32">
                  <input
                    type="range"
                    min={0}
                    max={300}
                    step={15}
                    value={Math.max(0, Math.min(300, parseInt(restSecInput, 10) || 0))}
                    onChange={(e) => setRestSecInput(String(parseInt(e.target.value, 10) || 0))}
                    className="w-full accent-teal-400"
                    aria-label="Template rest slider"
                  />
                  <p className="text-[11px] text-app-meta text-center">{Math.max(0, Math.min(300, parseInt(restSecInput, 10) || 0))}s</p>
                </div>
              </div>
              <button
                onClick={() => addExercise()}
                className="px-4 py-3 rounded-xl btn-primary"
              >
                Add
              </button>
              <button
                onClick={() => addExercise(undefined, true)}
                className="px-4 py-3 rounded-xl border border-teal-900/40 bg-zinc-900/70 text-sm text-app-secondary hover:text-white hover:border-teal-500/30 transition"
              >
                Custom
              </button>
            </div>
          </div>

          {exercises.length > 0 && (
            <div>
              <p className="label-section mb-2">Exercises in this template</p>
              <ul className="space-y-1 p-4 rounded-2xl border border-teal-950/40 bg-gradient-to-b from-zinc-900/95 to-teal-950/25">
                {exercises.map((ex, i) => (
                  <li key={i} className="text-app-secondary text-sm flex items-center justify-between gap-2">
                    <span>
                      {i + 1}. <span className="text-white font-medium">{ex.name}</span> — {ex.targetSets} set{ex.targetSets !== 1 ? "s" : ""}{" "}
                      <span className="text-app-meta">• {ex.restSec != null && ex.restSec > 0 ? `${ex.restSec}s rest` : "no rest"}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveCreateExercise(i, "up")}
                        className="text-[11px] px-2 py-1 rounded-lg border border-teal-900/40 text-app-meta hover:text-white hover:bg-teal-950/30 transition"
                        aria-label="Move up"
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCreateExercise(i, "down")}
                        className="text-[11px] px-2 py-1 rounded-lg border border-teal-900/40 text-app-meta hover:text-white hover:bg-teal-950/30 transition"
                        aria-label="Move down"
                      >
                        Down
                      </button>
                    </div>
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
        )}

        {savedTemplates.length > 0 && (
          <section>
            <h2 className="text-xl font-bold text-white mb-4">Saved templates</h2>
            <ul className="space-y-3">
              {savedTemplates.map((template, index) => {
                const isEditMode = editingTemplateIndex === index && editingTemplateDraft;
                const data = isEditMode ? editingTemplateDraft! : template;
                return (
                <li key={data.id} className="card-app">
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
                          {template.exercises.length} exercise{template.exercises.length !== 1 ? "s" : ""} · ordered blueprint
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
                            <div className="flex items-center gap-2 flex-wrap w-full">
                              <div className="flex-1 min-w-[100px]">
                                <ExercisePicker
                                  value={editingExercise.name}
                                  onValueChange={(name) =>
                                    setEditingExercise((p) =>
                                      p ? { ...p, name, exerciseId: undefined } : p
                                    )
                                  }
                                  onSelect={setEditingExerciseFromPicker}
                                  placeholder="Exercise name"
                                  inputClassName="input-app flex-1 min-w-[100px] p-2 text-sm"
                                  dropdownClassName="mt-2 rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto"
                                  customOptionLabel="Use custom exercise"
                                  noMatchText="No matches. Use custom exercise."
                                />
                              </div>
                              <div className="w-24">
                                <input
                                  type="range"
                                  min={1}
                                  max={20}
                                  step={1}
                                  value={editingExercise.targetSets}
                                  onChange={(e) =>
                                    setEditingExercise((p) =>
                                      p && { ...p, targetSets: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3)) }
                                    )
                                  }
                                  className="w-full accent-teal-400"
                                />
                                <p className="text-[11px] text-app-meta text-center">{editingExercise.targetSets} sets</p>
                              </div>
                              <label className="text-app-meta text-xs">Rest</label>
                              <div className="w-24">
                                <input
                                  type="range"
                                  min={0}
                                  max={300}
                                  step={15}
                                  value={Math.max(0, Math.min(300, parseInt(editingExercise.restSecInput, 10) || 0))}
                                  onChange={(e) =>
                                    setEditingExercise((p) => p ? { ...p, restSecInput: String(parseInt(e.target.value, 10) || 0) } : null)
                                  }
                                  className="w-full accent-teal-400"
                                />
                                <p className="text-[11px] text-app-meta text-center">
                                  {Math.max(0, Math.min(300, parseInt(editingExercise.restSecInput, 10) || 0))}s
                                </p>
                              </div>
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
                                    onClick={() => moveExerciseInTemplate(index, i, "up")}
                                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-teal-950/30 transition text-app-secondary"
                                  >
                                    Move Up
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => moveExerciseInTemplate(index, i, "down")}
                                    className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-teal-950/30 transition text-app-secondary"
                                  >
                                    Move Down
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
                    <div className="flex-1 min-w-[120px]">
                      <ExercisePicker
                        value={addExercisePerTemplate[index] ?? ""}
                        onValueChange={(name) =>
                          setAddExercisePerTemplate((prev) => ({ ...prev, [index]: name }))
                        }
                        onSelect={(selection) =>
                          setAddExercisePerTemplate((prev) => ({ ...prev, [index]: selection.name }))
                        }
                        placeholder="Add exercise"
                        inputClassName="input-app flex-1 min-w-[120px] p-2 text-sm"
                        dropdownClassName="mt-2 rounded-xl border border-teal-900/40 bg-zinc-900/90 max-h-72 overflow-y-auto"
                        customOptionLabel="Use custom exercise"
                        noMatchText="No matches. Use custom exercise."
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-app-meta">Sets</label>
                      <div className="w-20">
                        <input
                          type="range"
                          min={1}
                          max={20}
                          step={1}
                          value={addExerciseSetsPerTemplate[index] ?? 3}
                          onChange={(e) =>
                            setAddExerciseSetsPerTemplate((prev) => ({
                              ...prev,
                              [index]: Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 3)),
                            }))
                          }
                          className="w-full accent-teal-400"
                        />
                        <p className="text-[11px] text-app-meta text-center">{addExerciseSetsPerTemplate[index] ?? 3}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <label className="text-xs text-app-meta">Rest</label>
                      <div className="w-20">
                        <input
                          type="range"
                          min={0}
                          max={300}
                          step={15}
                          value={Math.max(
                            0,
                            Math.min(300, parseInt(addExerciseRestSecPerTemplate[index] ?? "90", 10) || 0)
                          )}
                          onChange={(e) =>
                            setAddExerciseRestSecPerTemplate((prev) => ({
                              ...prev,
                              [index]: String(parseInt(e.target.value, 10) || 0),
                            }))
                          }
                          className="w-full accent-teal-400"
                        />
                        <p className="text-[11px] text-app-meta text-center">
                          {Math.max(
                            0,
                            Math.min(300, parseInt(addExerciseRestSecPerTemplate[index] ?? "90", 10) || 0)
                          )}s
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => addExerciseToTemplate(index)}
                      className="text-sm px-3 py-2 rounded-lg btn-primary"
                    >
                      Add
                    </button>
                    <button
                      onClick={() => addExerciseToTemplate(index, true)}
                      className="text-sm px-3 py-2 rounded-lg border border-teal-900/40 bg-zinc-900/70 text-app-secondary hover:text-white hover:border-teal-500/30 transition"
                    >
                      Custom
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
