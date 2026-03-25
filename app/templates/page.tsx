"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUnit } from "@/lib/unit-preference";
import {
  deleteTemplateById,
  getStoredTemplates,
  type WorkoutTemplate,
} from "@/lib/templateStorage";

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";

export default function TemplatesPage() {
  const router = useRouter();
  const { unit, setUnit } = useUnit();
  const [savedTemplates, setSavedTemplates] = useState<WorkoutTemplate[]>([]);

  function refreshTemplates() {
    setSavedTemplates(getStoredTemplates());
  }

  useEffect(() => {
    refreshTemplates();
  }, []);

  function startWorkoutFromTemplate(template: WorkoutTemplate) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({
        templateId: template.id,
        templateName: template.name,
        exercises: template.exercises,
      })
    );
    router.push("/workout");
  }

  function deleteTemplate(templateId: string) {
    deleteTemplateById(templateId);
    refreshTemplates();
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 pb-28">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <Link href="/workout/start" className="text-app-secondary hover:text-white transition-colors text-sm font-medium">
            ← Workout
          </Link>
          <h1 className="text-3xl font-bold text-white">Templates</h1>
          <div className="ml-auto flex items-center gap-2 rounded-xl border border-teal-900/40 bg-zinc-900/70 p-1">
            <button
              type="button"
              onClick={() => setUnit("kg")}
              className={`px-3 py-1.5 text-xs rounded-lg transition ${unit === "kg" ? "bg-teal-500/35 text-white border border-teal-300/35" : "text-app-secondary hover:text-white"}`}
            >
              KG
            </button>
            <button
              type="button"
              onClick={() => setUnit("lb")}
              className={`px-3 py-1.5 text-xs rounded-lg transition ${unit === "lb" ? "bg-teal-500/35 text-white border border-teal-300/35" : "text-app-secondary hover:text-white"}`}
            >
              LBS
            </button>
          </div>
        </div>

        <section className="card-app mb-6 border-zinc-800/70 bg-zinc-900/40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-white font-semibold">Template Library</p>
              <p className="text-xs text-app-meta">Browse, edit, and launch workouts from your saved templates.</p>
            </div>
            <Link href="/templates/new" className="px-4 py-2 rounded-xl btn-primary text-sm">
              Create New Template
            </Link>
          </div>
        </section>

        {savedTemplates.length === 0 ? (
          <section className="card-app">
            <p className="text-sm text-app-secondary">No templates yet. Create your first template to speed up training sessions.</p>
          </section>
        ) : (
          <section>
            <h2 className="text-xl font-bold text-white mb-4">Saved Templates</h2>
            <ul className="space-y-3">
              {savedTemplates.map((template) => (
                <li key={template.id} className="card-app">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-lg font-bold text-white leading-snug line-clamp-2">
                        {template.name}
                      </h3>
                      <p className="text-sm text-app-meta mt-1">{template.exercises.length} exercises</p>
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0 justify-start sm:justify-end">
                      <button
                        type="button"
                        onClick={() => startWorkoutFromTemplate(template)}
                        className="px-3 py-2 rounded-xl btn-primary text-sm"
                      >
                        Start Workout
                      </button>
                      <Link
                        href={`/templates/${encodeURIComponent(template.id)}`}
                        className="px-3 py-2 rounded-xl btn-secondary text-sm"
                      >
                        Edit
                      </Link>
                      <button
                        type="button"
                        onClick={() => deleteTemplate(template.id)}
                        className="px-3 py-2 rounded-xl border border-red-900/50 bg-red-950/25 text-sm text-red-200 hover:bg-red-900/40 transition"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <ul className="space-y-1.5 text-sm text-app-secondary">
                    {template.exercises.slice(0, 4).map((ex, i) => (
                      <li key={`${template.id}-${ex.name}-${i}`} className="truncate">
                        <span className="text-app-meta mr-2">{i + 1}.</span>
                        <span className="text-white">{ex.name}</span>
                        <span className="text-app-meta">
                          {" "}
                          · {ex.targetSets} set{ex.targetSets !== 1 ? "s" : ""} · {ex.restSec ?? 90}s rest
                        </span>
                      </li>
                    ))}
                    {template.exercises.length > 4 && (
                      <li className="text-xs text-app-meta">+ {template.exercises.length - 4} more exercises</li>
                    )}
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

