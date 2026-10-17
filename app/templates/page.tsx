"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { SecondaryButton } from "@/components/physique/ui";
import { deleteTemplateById, duplicateTemplate, getStoredTemplates, type WorkoutTemplate } from "@/lib/templateStorage";

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";

/** Routines (CL1): the saved templates, each with Start, Edit, Duplicate and a two-tap Delete. */
export default function TemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  function refresh() {
    setTemplates(getStoredTemplates());
  }
  useEffect(() => {
    refresh();
  }, []);

  function start(template: WorkoutTemplate) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(TEMPLATE_FOR_WORKOUT_KEY, JSON.stringify({ templateId: template.id, templateName: template.name, exercises: template.exercises }));
    router.push("/workout");
  }

  function remove(id: string) {
    if (confirmDelete !== id) {
      setConfirmDelete(id);
      window.setTimeout(() => setConfirmDelete((c) => (c === id ? null : c)), 3000);
      return;
    }
    deleteTemplateById(id);
    setConfirmDelete(null);
    refresh();
  }

  function duplicate(id: string) {
    const newId = duplicateTemplate(id);
    if (newId) router.push(`/templates/${encodeURIComponent(newId)}`);
  }

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption="Train" title="Routines" action={{ label: "New routine", href: "/templates/new" }} />

        {templates.length === 0 ? (
          <p className="rounded-[12px] px-4 py-3 text-[13px]" style={{ background: "#141416", color: "#a3a3a8" }}>
            No routines yet. Build one and Start workout fills in the exercises, sets and rest.
          </p>
        ) : (
          <ul className="flex flex-col gap-2" aria-label="Routines">
            {templates.map((t) => (
              <li key={t.id} className="rounded-[12px] p-4" style={{ background: "#141416" }}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[17px] font-semibold" style={{ color: "#f2f2f0" }}>
                      {t.name}
                    </h2>
                    <p className="text-[12px]" style={{ color: "#6f6f76" }}>
                      {t.exercises.length} {t.exercises.length === 1 ? "exercise" : "exercises"}
                    </p>
                  </div>
                  <button type="button" onClick={() => start(t)} className="h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold transition-colors active:bg-[#a3a3a8]" style={{ background: "#f2f2f0", color: "#0a0a0b" }} aria-label={`Start ${t.name}`}>
                    Start
                  </button>
                </div>
                <ul className="mt-3 flex flex-col gap-1 text-[13px]" style={{ color: "#a3a3a8" }}>
                  {t.exercises.slice(0, 4).map((ex, i) => (
                    <li key={`${t.id}-${ex.name}-${i}`} className="truncate" style={{ fontVariantNumeric: "tabular-nums" }}>
                      <span style={{ color: "#f2f2f0" }}>{ex.name}</span>
                      {` · ${ex.targetSets} ${ex.targetSets === 1 ? "set" : "sets"} · ${ex.restSec ?? 90} s rest`}
                    </li>
                  ))}
                  {t.exercises.length > 4 && (
                    <li className="text-[12px]" style={{ color: "#6f6f76" }}>
                      {t.exercises.length - 4} more
                    </li>
                  )}
                </ul>
                <div className="mt-3 flex items-center gap-2">
                  <SecondaryButton small onClick={() => router.push(`/templates/${encodeURIComponent(t.id)}`)}>
                    Edit
                  </SecondaryButton>
                  <SecondaryButton small onClick={() => duplicate(t.id)}>
                    Duplicate
                  </SecondaryButton>
                  <button type="button" onClick={() => remove(t.id)} className="ml-auto h-9 rounded-full px-3 text-[13px] font-medium" style={{ color: confirmDelete === t.id ? "#0a0a0b" : "#f26d7d", background: confirmDelete === t.id ? "#f26d7d" : "transparent" }} aria-label={confirmDelete === t.id ? `Confirm delete ${t.name}` : `Delete ${t.name}`}>
                    {confirmDelete === t.id ? "Delete?" : "Delete"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="pb-2 text-[11px]" style={{ color: "#6f6f76" }}>
          A routine prefills the session. Everything stays editable once you start.
        </p>
      </div>
    </main>
  );
}
