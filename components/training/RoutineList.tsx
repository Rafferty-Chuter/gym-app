"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Sheet from "@/components/ui/Sheet";
import { PrimaryButton, Row, RowGroup, SecondaryButton } from "@/components/physique/ui";
import { deleteTemplateById, duplicateTemplate, type WorkoutTemplate } from "@/lib/templateStorage";
import { estimateMinutes, plannedRows, restLabel, routineSummary, workingSetCount } from "@/lib/training/routine";
import { queueRoutine, workoutInProgress } from "@/lib/training/startWorkout";

function meta(t: WorkoutTemplate): string {
  const n = t.exercises.length;
  return `${n} ${n === 1 ? "exercise" : "exercises"} · ${workingSetCount(t)} sets · about ${estimateMinutes(t)} min`;
}

function exerciseLine(ex: WorkoutTemplate["exercises"][number]): string {
  const rows = plannedRows(ex);
  const warm = rows.filter((r) => r.type === "warmup").length;
  const work = rows.length - warm;
  const reps = ex.repMin != null && ex.repMax != null ? (ex.repMin === ex.repMax ? `${ex.repMin}` : `${ex.repMin} to ${ex.repMax}`) : null;
  return [`${warm ? `${warm} warm-up + ` : ""}${work} ${work === 1 ? "set" : "sets"}`, reps ? `${reps} reps` : null, `rest ${restLabel(ex.restSec)}`].filter(Boolean).join(" · ");
}

/**
 * The routines (TR3, after Hevy's Workout tab): each card names the routine
 * and what is in it, with a Start button. Tapping the card previews it;
 * the menu edits, duplicates or deletes. Starting while another session is
 * in progress asks first.
 */
export default function RoutineList({ templates, onChanged }: { templates: WorkoutTemplate[]; onChanged: () => void }) {
  const router = useRouter();
  const [preview, setPreview] = useState<WorkoutTemplate | null>(null);
  const [menu, setMenu] = useState<WorkoutTemplate | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function start(t: WorkoutTemplate) {
    if (workoutInProgress() && !window.confirm(`A workout is in progress. Discard it and start ${t.name}?`)) return;
    if (queueRoutine(t)) router.push("/workout");
  }

  return (
    <>
      <ul className="flex flex-col gap-2" aria-label="Routines">
        {templates.map((t) => (
          <li key={t.id} className="rounded-[12px] p-4" style={{ background: "var(--surface)" }}>
            <div className="flex items-start justify-between gap-2">
              <button type="button" onClick={() => setPreview(t)} className="min-w-0 flex-1 text-left" aria-label={`${t.name}. ${meta(t)}. Preview`}>
                <span className="block truncate text-[17px] font-semibold" style={{ color: "var(--text)" }}>
                  {t.name}
                </span>
                <span className="mt-0.5 block text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
                  {routineSummary(t)}
                </span>
                <span className="mt-0.5 block text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                  {meta(t)}
                </span>
              </button>
              <button type="button" onClick={() => (setMenu(t), setConfirmDelete(false))} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label={`${t.name} options`}>
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
                  <circle cx="5" cy="12" r="1.8" />
                  <circle cx="12" cy="12" r="1.8" />
                  <circle cx="19" cy="12" r="1.8" />
                </svg>
              </button>
            </div>
            <button type="button" onClick={() => start(t)} className="mt-3 h-[40px] w-full rounded-[10px] text-[15px] font-semibold" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }} aria-label={`Start ${t.name}`}>
              Start routine
            </button>
          </li>
        ))}
      </ul>

      <Sheet
        open={preview != null}
        onClose={() => setPreview(null)}
        title={preview?.name}
        footer={
          preview ? (
            <div className="flex flex-col gap-2">
              <PrimaryButton onClick={() => start(preview)}>Start routine</PrimaryButton>
              <SecondaryButton onClick={() => router.push(`/templates/${encodeURIComponent(preview.id)}`)}>Edit routine</SecondaryButton>
            </div>
          ) : undefined
        }
      >
        {preview && (
          <div className="flex flex-col gap-3 pb-1">
            <p className="text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {meta(preview)}
            </p>
            <RowGroup>
              {preview.exercises.map((ex, i) => (
                <Row key={`${ex.name}-${i}`} label={ex.name} sub={exerciseLine(ex)} value="" />
              ))}
            </RowGroup>
          </div>
        )}
      </Sheet>

      <Sheet open={menu != null} onClose={() => setMenu(null)} title={menu?.name}>
        {menu && (
          <RowGroup>
            <Row label="Edit routine" value="" onClick={() => router.push(`/templates/${encodeURIComponent(menu.id)}`)} />
            <Row
              label="Duplicate"
              value=""
              onClick={() => {
                const id = duplicateTemplate(menu.id);
                setMenu(null);
                onChanged();
                if (id) router.push(`/templates/${encodeURIComponent(id)}`);
              }}
            />
            <Row
              label={confirmDelete ? "Tap again to delete" : "Delete routine"}
              value=""
              onClick={() => {
                if (!confirmDelete) {
                  setConfirmDelete(true);
                  return;
                }
                deleteTemplateById(menu.id);
                setMenu(null);
                setConfirmDelete(false);
                onChanged();
              }}
              ariaLabel={confirmDelete ? `Confirm deleting ${menu.name}` : `Delete ${menu.name}`}
            />
          </RowGroup>
        )}
      </Sheet>
    </>
  );
}
