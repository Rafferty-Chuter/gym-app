"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { Chevron, Row, RowGroup } from "@/components/physique/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { Caption } from "@/components/physique/ui";
import RoutineList from "@/components/training/RoutineList";
import { getStoredTemplates, type WorkoutTemplate } from "@/lib/templateStorage";
import { queueEmptyWorkout } from "@/lib/training/startWorkout";
import {
  ACTIVE_WORKOUT_CHANGED_EVENT,
  draftHasMeaningfulContent,
  getActiveWorkout,
  type DraftWorkout,
} from "@/lib/activeWorkout";


function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function draftDisplayName(d: DraftWorkout): string {
  const w = d.workoutName?.trim();
  if (w) return w;
  const t = d.templateName?.trim();
  if (t) return t;
  const first = d.exercises?.[0]?.name?.trim();
  if (first) return `${first} Workout`;
  return "Workout";
}

export default function WorkoutStartPage() {
  const router = useRouter();
  const [activeDraft, setActiveDraft] = useState<DraftWorkout | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const hydrated = useIsHydrated();
  const [revision, setRevision] = useState(0);
  // Routines live in this browser's storage: read after hydration, re-read after a change.
  const templates = useMemo<WorkoutTemplate[]>(() => {
    void revision;
    return hydrated ? getStoredTemplates() : [];
  }, [hydrated, revision]);

  const refreshDraft = useCallback(() => {
    if (typeof window === "undefined") return;
    const d = getActiveWorkout();
    if (d && draftHasMeaningfulContent(d)) {
      setActiveDraft(d);
      setElapsedSec(Math.max(0, Math.floor((Date.now() - d.startedAt) / 1000)));
    } else {
      setActiveDraft(null);
    }
  }, []);

  useEffect(() => {
    refreshDraft();
  }, [refreshDraft]);

  useEffect(() => {
    function onChanged() {
      refreshDraft();
    }
    function onStorage(e: StorageEvent) {
      if (e.key === "activeWorkout") refreshDraft();
    }
    window.addEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, onChanged);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", refreshDraft);
    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, onChanged);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", refreshDraft);
    };
  }, [refreshDraft]);

  useEffect(() => {
    if (!activeDraft) return;
    const id = window.setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - activeDraft.startedAt) / 1000)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [activeDraft]);

  function startEmptyWorkout() {
    if (activeDraft && !window.confirm("A workout is in progress. Discard it and start an empty one?")) return;
    queueEmptyWorkout();
    router.push("/workout");
  }

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption="Session" title="Start workout" />

        {activeDraft && (
          <Link href="/workout" className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3 transition-colors active:bg-[var(--surface-raised)]" style={{ background: "var(--surface)", border: "1px solid var(--border)" }} aria-label={`Resume ${draftDisplayName(activeDraft)}, ${formatElapsed(elapsedSec)} elapsed`}>
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--status-good)" }}>
                In progress · {formatElapsed(elapsedSec)}
              </span>
              <span className="truncate text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                {draftDisplayName(activeDraft)}
              </span>
            </span>
            <Chevron />
          </Link>
        )}

        <RowGroup>
          <Row label="Empty workout" sub="Add exercises as you go" value="" trailing={<Chevron />} onClick={startEmptyWorkout} ariaLabel="Start an empty workout" />
        </RowGroup>

        <section aria-label="Start a routine">
          <div className="mb-2 flex items-center justify-between">
            <Caption>Routines</Caption>
            <Link href="/templates/new" className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
              New routine ›
            </Link>
          </div>
          {templates.length > 0 ? (
            <RoutineList templates={templates} onChanged={() => setRevision((r) => r + 1)} />
          ) : (
            <p className="rounded-[12px] px-4 py-3 text-[13px]" style={{ background: "var(--surface)", color: "var(--text-secondary)" }}>
              No routines yet. Build one and it starts here in one tap.
            </p>
          )}
        </section>

        <p className="pb-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          A session saves to History when you finish it.
        </p>
      </div>
    </main>
  );
}
