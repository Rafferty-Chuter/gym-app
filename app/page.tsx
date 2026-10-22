"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ASSISTANT_ENABLED } from "@/lib/features";
import { useRouter } from "next/navigation";
import {
  ACTIVE_WORKOUT_CHANGED_EVENT,
  clearActiveWorkout,
  getActiveWorkout,
  getSessionLifecycleState,
  hasActiveWorkout,
  type DraftWorkout,
} from "@/lib/activeWorkout";
import type { SetType } from "@/lib/completedSets";
import { useWorkoutStore } from "@/lib/workout-store";
import HowItsGoing from "@/components/physique/HowItsGoing";
import TodayStrip from "@/components/physique/TodayStrip";
import PageHeader from "@/components/ui/PageHeader";
import { fullLocalDate } from "@/components/charts/TimeSeriesChart";
import WelcomeRedirect from "@/components/physique/WelcomeRedirect";
import HomeAssistantCard from "@/components/physique/HomeAssistantCard";
import { useNow } from "@/lib/ui/useToday";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import StaleSessionModal from "@/components/StaleSessionModal";

function subscribeActiveWorkout(cb: () => void) {
  function onStorage(e: StorageEvent) {
    if (e.key === "activeWorkout") cb();
  }
  window.addEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, cb);
  window.addEventListener("storage", onStorage);
  window.addEventListener("focus", cb);
  return () => {
    window.removeEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", cb);
  };
}
function useActiveWorkoutFlag(): boolean {
  return useSyncExternalStore(
    subscribeActiveWorkout,
    () => hasActiveWorkout(),
    () => false
  );
}


export default function Home() {
  const router = useRouter();
  const hasMounted = useIsHydrated();
  const hasActive = useActiveWorkoutFlag();
  const { addWorkout } = useWorkoutStore();
  const [staleSession, setStaleSession] = useState<DraftWorkout | null>(null);

  // P1.9 session-state model: on home mount (and whenever the active workout
  // changes), check whether the current draft is "stale-in-progress" (≥18h
  // idle with ≥2 confirmed sets) or "abandoned-start" (≤1 set, ≥24h idle).
  // Stale → show resume modal. Abandoned → silently discard.
  useEffect(() => {
    function reconcile() {
      const draft = getActiveWorkout();
      const state = getSessionLifecycleState(draft);
      if (state === "abandoned-start") {
        clearActiveWorkout();
        setStaleSession(null);
        return;
      }
      if (state === "stale-in-progress") {
        setStaleSession(draft);
        return;
      }
      setStaleSession(null);
    }
    reconcile();
    window.addEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, reconcile);
    window.addEventListener("focus", reconcile);
    return () => {
      window.removeEventListener(ACTIVE_WORKOUT_CHANGED_EVENT, reconcile);
      window.removeEventListener("focus", reconcile);
    };
  }, []);

  function finishStaleSession(draft: DraftWorkout) {
    // Finalise whatever the user confirmed; drafts are dropped per spec.
    const completedExercises = draft.exercises
      .map((ex) => {
        const confirmedOnly = (ex.sets ?? []).filter((s) => s.done === true);
        const sets = confirmedOnly
          .map((s) => {
            const reps = parseFloat(String(s.reps ?? "")) || 0;
            if (reps <= 0) return null;
            const out: { weight: string; reps: string; notes?: string; rir?: number; type?: SetType } = {
              weight: String(s.weight ?? ""),
              reps: String(s.reps ?? ""),
            };
            if (typeof s.notes === "string" && s.notes.trim()) out.notes = s.notes.trim();
            if (typeof s.rir === "number" && Number.isFinite(s.rir)) out.rir = s.rir;
            // IN1: a warm-up kept its type in the logger but lost it here, and counted as a working set.
            if (s.type && s.type !== "working") out.type = s.type;
            return out;
          })
          .filter((s): s is NonNullable<typeof s> => s !== null);
        return {
          ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
          name: ex.name,
          restSec: ex.restSec,
          sets,
        };
      })
      .filter((ex) => ex.sets.length > 0);
    if (completedExercises.length === 0) {
      // Nothing actually confirmed — just discard.
      clearActiveWorkout();
      return;
    }
    const totalSets = completedExercises.reduce((n, ex) => n + ex.sets.length, 0);
    const fallbackName =
      draft.workoutName?.trim() ||
      draft.templateName?.trim() ||
      draft.exercises?.[0]?.name?.trim() ||
      "Workout";
    // IN1: the session ended at its last saved change, not when it is finished from Home hours later.
    const end = draft.lastSavedAt && draft.lastSavedAt >= draft.startedAt ? draft.lastSavedAt : Date.now();
    addWorkout({
      completedAt: new Date(end).toISOString(),
      startedAt: new Date(draft.startedAt).toISOString(),
      name: fallbackName,
      durationSec: Math.max(0, Math.floor((end - draft.startedAt) / 1000)),
      exercises: completedExercises,
      totalExercises: completedExercises.length,
      totalSets,
    });
    clearActiveWorkout();
  }

  const now = useNow();
  const ctaLabel = hasMounted && hasActive ? "Resume workout" : "Start workout";
  // One place to start (B2): Train holds the empty start and the routines.
  const ctaHref = hasMounted && hasActive ? "/workout" : "/train";

  return (
    <main className="min-h-screen bg-zinc-950 text-[var(--text)] relative pb-28">
      <div className="relative mx-auto max-w-2xl px-5 sm:px-6">

        <PageHeader
          caption={hasMounted && now ? fullLocalDate(now.today) : " "}
          title="Today"
          secondary={
            <Link href="/profile" className="flex h-9 items-center rounded-full px-3 text-[13px] font-medium transition-colors active:bg-[var(--surface-pressed)]" style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label="Open profile">
              Profile
            </Link>
          }
        />



        {staleSession && (
          <StaleSessionModal
            draft={staleSession}
            onFinishSession={finishStaleSession}
            onResumeLogging={() => router.push("/workout")}
            onClose={() => setStaleSession(null)}
          />
        )}

        <WelcomeRedirect />

        <section aria-label="Today">
          <TodayStrip />
        </section>

        <div className="pt-3">
          <HowItsGoing />
        </div>

        <section className="pt-3 pb-1">
          <Link
            href={ctaHref}
            aria-label={ctaLabel}
            className="block w-full rounded-[12px] py-4 text-center text-[17px] font-semibold tracking-[-0.01em] transition-colors duration-150 hover:bg-[var(--primary-pressed)] active:translate-y-[1px]"
            style={{ background: "var(--primary)", color: "var(--text-on-primary)" }}
          >
            {ctaLabel}
          </Link>
        </section>

        {ASSISTANT_ENABLED && <HomeAssistantCard />}


      </div>
    </main>
  );
}
