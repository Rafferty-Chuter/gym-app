"use client";

import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { Chevron, Row, RowGroup } from "@/components/physique/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ACTIVE_WORKOUT_CHANGED_EVENT,
  draftHasMeaningfulContent,
  getActiveWorkout,
  type DraftWorkout,
} from "@/lib/activeWorkout";

const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";

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
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({ emptyWorkout: true, workoutName: "" })
    );
    router.push("/workout");
  }

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption="Session" title="Start workout" />

        {activeDraft && (
          <Link href="/workout" className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3 transition-colors active:bg-[#1d1d20]" style={{ background: "#141416", border: "1px solid #2a2a2e" }} aria-label={`Resume ${draftDisplayName(activeDraft)}, ${formatElapsed(elapsedSec)} elapsed`}>
            <span className="flex min-w-0 flex-col">
              <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#00e5b0" }}>
                In progress · {formatElapsed(elapsedSec)}
              </span>
              <span className="truncate text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
                {draftDisplayName(activeDraft)}
              </span>
            </span>
            <Chevron />
          </Link>
        )}

        <RowGroup>
          <Row label="Empty workout" sub="Build the session as you train." value="" trailing={<Chevron />} onClick={startEmptyWorkout} ariaLabel="Start an empty workout" />
          <Row label="From a routine" sub="Exercises, sets and rest prefilled." value="" trailing={<Chevron />} onClick={() => router.push("/templates")} ariaLabel="Start from a routine" />
        </RowGroup>

        <p className="pb-2 text-[11px]" style={{ color: "#6f6f76" }}>
          A session saves to History when you finish it.
        </p>
      </div>
    </main>
  );
}
