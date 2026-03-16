"use client";

import { useState, useEffect } from "react";

const STORAGE_KEY = "workoutTemplates";

type WorkoutTemplate = {
  name: string;
  exercises: string[];
};

function getStoredTemplates(): WorkoutTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveTemplatesToStorage(templates: WorkoutTemplate[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export default function TemplatesPage() {
  const [templateName, setTemplateName] = useState("");
  const [exerciseInput, setExerciseInput] = useState("");
  const [exercises, setExercises] = useState<string[]>([]);
  const [savedTemplates, setSavedTemplates] = useState<WorkoutTemplate[]>([]);

  useEffect(() => {
    setSavedTemplates(getStoredTemplates());
  }, []);

  function addExercise() {
    const trimmed = exerciseInput.trim();
    if (!trimmed) return;
    setExercises((prev) => [...prev, trimmed]);
    setExerciseInput("");
  }

  function saveTemplate() {
    const name = templateName.trim();
    if (!name) return;

    const newTemplate: WorkoutTemplate = {
      name,
      exercises: [...exercises],
    };

    const updated = [...getStoredTemplates(), newTemplate];
    saveTemplatesToStorage(updated);
    setSavedTemplates(updated);
    setTemplateName("");
    setExercises([]);
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
            <div className="flex gap-2">
              <input
                type="text"
                value={exerciseInput}
                onChange={(e) => setExerciseInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addExercise()}
                placeholder="Exercise name"
                className="flex-1 p-3 rounded-xl bg-zinc-900 border border-zinc-700 focus:outline-none focus:ring-2 focus:ring-zinc-500"
              />
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
                    {i + 1}. {ex}
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
                  <h3 className="font-semibold text-white mb-2">{template.name}</h3>
                  <ul className="text-sm text-zinc-300 space-y-1">
                    {template.exercises.map((ex, i) => (
                      <li key={i}>{i + 1}. {ex}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
