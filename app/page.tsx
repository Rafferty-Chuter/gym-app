"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ASSISTANT_ENABLED } from "@/lib/features";
import { useRouter } from "next/navigation";
import { getWorkoutHistory } from "@/lib/trainingAnalysis";
import {
  ACTIVE_WORKOUT_CHANGED_EVENT,
  clearActiveWorkout,
  getActiveWorkout,
  getSessionLifecycleState,
  hasActiveWorkout,
  type DraftWorkout,
} from "@/lib/activeWorkout";
import { useWorkoutStore } from "@/lib/workout-store";
import HowItsGoing from "@/components/physique/HowItsGoing";
import TodayStrip from "@/components/physique/TodayStrip";
import PageHeader from "@/components/ui/PageHeader";
import { fullLocalDate } from "@/components/charts/TimeSeriesChart";
import WelcomeRedirect from "@/components/physique/WelcomeRedirect";
import { askWhyPrompt } from "@/components/physique/VerdictCard";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { useNow } from "@/lib/ui/useToday";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import StaleSessionModal from "@/components/StaleSessionModal";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal } from "@/lib/priorityGoal";
import {
  buildCoachStructuredAnalysis,
  EMPTY_COACH_STRUCTURED_ANALYSIS,
  type CoachStructuredAnalysis,
} from "@/lib/coachStructuredAnalysis";

type AssistantInsight = {
  text: string;
  prompt: string;
  followUps: { label: string; prompt: string }[];
  cold: boolean;
};

function buildAssistantInsight(
  coach: CoachStructuredAnalysis,
  workoutsCount: number
): AssistantInsight {
  if (workoutsCount === 0) {
    return {
      text: "No sessions logged yet. Start a workout or import a Hevy or Strong CSV from Profile, and I'll read your training and answer with context.",
      prompt:
        "I haven't logged anything yet. What's the fastest way to get the assistant useful for me?",
      followUps: [
        { label: "How does this work?", prompt: "How does the assistant use my training data once I start logging?" },
        { label: "What can I ask?", prompt: "Once I have data, what's the most useful kind of question I can ask you?" },
        { label: "Import a CSV", prompt: "Walk me through importing a Hevy or Strong CSV." },
      ],
      cold: true,
    };
  }
  if (coach.keyFocus) {
    return {
      text: coach.keyFocus,
      prompt: `On this read — "${coach.keyFocus}" — why is it happening, and what should I do about it next session?`,
      followUps: [
        { label: "Why is this happening?", prompt: `Why is this happening? Walk me through the cause with reference to my actual training. Context: "${coach.keyFocus}"` },
        { label: "What do I do next?", prompt: `What do I do next? Give me a concrete change for my next session. Context: "${coach.keyFocus}"` },
        { label: "Show the data", prompt: `Show me the specific sets and trends behind this read. Context: "${coach.keyFocus}"` },
      ],
      cold: false,
    };
  }
  if (coach.actionableSuggestions.length > 0) {
    const s = coach.actionableSuggestions[0];
    return {
      text: s,
      prompt: `On this suggestion — "${s}" — explain why it matters and how I should apply it.`,
      followUps: [
        { label: "Why this matters", prompt: `Why does this matter, and what would happen if I ignored it? Context: "${s}"` },
        { label: "How to apply it", prompt: `How do I apply this? Give me the specific change for my next session. Context: "${s}"` },
        { label: "Show the data", prompt: `Show me the data this is drawn from. Context: "${s}"` },
      ],
      cold: false,
    };
  }
  return {
    text: "Your training is moving cleanly right now. Ask me anything about your last sessions.",
    prompt: "How is my training looking right now?",
    followUps: [
      { label: "Read my week", prompt: "Read my last 7 days of training and tell me what stands out." },
      { label: "What's progressing?", prompt: "Which lifts are progressing fastest and which look stagnant?" },
      { label: "Volume by muscle", prompt: "Show me my weekly volume by muscle group and where it's uneven." },
    ],
    cold: false,
  };
}

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
  const { unit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const [workouts, setWorkouts] = useState<ReturnType<typeof getWorkoutHistory>>([]);
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
            const out: { weight: string; reps: string; notes?: string; rir?: number } = {
              weight: String(s.weight ?? ""),
              reps: String(s.reps ?? ""),
            };
            if (typeof s.notes === "string" && s.notes.trim()) out.notes = s.notes.trim();
            if (typeof s.rir === "number" && Number.isFinite(s.rir)) out.rir = s.rir;
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
    addWorkout({
      completedAt: new Date().toISOString(),
      name: fallbackName,
      durationSec: Math.max(0, Math.floor((Date.now() - draft.startedAt) / 1000)),
      exercises: completedExercises,
      totalExercises: completedExercises.length,
      totalSets,
    });
    clearActiveWorkout();
  }

  const coachAnalysis = useMemo(() => {
    if (workouts.length === 0) return EMPTY_COACH_STRUCTURED_ANALYSIS;
    return buildCoachStructuredAnalysis(workouts, {
      focus,
      experienceLevel,
      goal,
      unit,
    });
  }, [workouts, focus, experienceLevel, goal, unit]);

  useEffect(() => {
    function load() {
      setWorkouts(getWorkoutHistory());
    }
    load();
    window.addEventListener("workoutHistoryChanged", load);
    return () => window.removeEventListener("workoutHistoryChanged", load);
  }, []);

  const insight = useMemo(
    () => buildAssistantInsight(coachAnalysis, workouts.length),
    [coachAnalysis, workouts.length]
  );
  // U2b: a watch or attention physique verdict takes the insight card over the training key focus.
  const now = useNow();
  const physique = usePhysiqueAnalysis(hasMounted ? now : null, unit === "lb" ? "lb" : "kg");
  const physiqueInsight = useMemo(() => {
    if (!physique || (physique.status.state !== "watch" && physique.status.state !== "attention")) return null;
    const title = physique.verdict.title;
    return {
      text: `${title}. ${physique.verdict.detail}`,
      prompt: askWhyPrompt(physique),
      followUps: [
        { label: "Why?", prompt: askWhyPrompt(physique) },
        { label: "What do I change?", prompt: `My Body tab says "${title}". What exactly should I change this week, from my numbers?` },
        { label: "Show the data", prompt: `Show me the numbers behind "${title}": weight trend and rate, intake against target, lifts and sleep.` },
      ],
      cold: false,
    };
  }, [physique]);
  const shownInsight = physiqueInsight ?? insight;

  const ctaLabel = hasMounted && hasActive ? "Resume workout" : "Start workout";
  const ctaHref = hasMounted && hasActive ? "/workout" : "/workout/start";

  function openAssistantWith(prompt: string) {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem("assistantQuickPrompt", prompt);
        sessionStorage.setItem("assistantAutoSend", "1");
      } catch {
        router.push(`/assistant?q=${encodeURIComponent(prompt)}`);
        return;
      }
    }
    router.push("/assistant");
  }

  function openAssistantClean() {
    if (typeof window !== "undefined") {
      try {
        sessionStorage.removeItem("assistantQuickPrompt");
        sessionStorage.removeItem("assistantAutoSend");
      } catch {
        /* ignore */
      }
    }
    router.push("/assistant");
  }

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

        {ASSISTANT_ENABLED && (
        <section className="pt-5" aria-labelledby="assistant-insight-heading">
          <h2 id="assistant-insight-heading" className="sr-only">
            Assistant
          </h2>
          <article
            className="rounded-[12px] p-4 sm:p-5"
            style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <header className="flex items-center gap-2.5 mb-3">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: "var(--surface-raised)" }}
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="var(--text-secondary)"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-[14px] w-[14px]"
                >
                  <path d="M12 3v2" />
                  <path d="M12 19v2" />
                  <path d="M4.2 4.2l1.4 1.4" />
                  <path d="M18.4 18.4l1.4 1.4" />
                  <path d="M3 12h2" />
                  <path d="M19 12h2" />
                  <path d="M9 9l6 6" />
                  <path d="M15 9l-6 6" />
                </svg>
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-bold tracking-tight text-[var(--text)]">
                  Assistant
                </p>
                <p className="text-[11px] font-medium text-home-tertiary">
                  {shownInsight.cold ? "Cold start" : physiqueInsight ? "From your Body tab" : "From your training"}
                </p>
              </div>
            </header>

            <button
              type="button"
              onClick={() => openAssistantWith(shownInsight.prompt)}
              className="block w-full text-left rounded-xl -mx-1 px-1 py-1 transition-colors duration-150 hover:bg-[color-mix(in_srgb,var(--text)_2.5%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/40"
              aria-label={`Ask the assistant about: ${shownInsight.text}`}
            >
              <p
                className="text-[16px] sm:text-[17px] font-semibold leading-snug text-[var(--text)]"
                style={{ textWrap: "pretty" }}
              >
                {shownInsight.text}
              </p>
            </button>

            <div className="mt-3 flex flex-wrap gap-2">
              {shownInsight.followUps.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => openAssistantWith(f.prompt)}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-150 active:bg-[var(--surface-pressed)]"
                  style={{ background: "var(--surface-raised)", color: "var(--text-secondary)" }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={openAssistantClean}
              aria-label="Open assistant with no preloaded message"
              className="mt-3.5 flex items-center justify-center gap-2 w-full rounded-[12px] py-3 text-[15px] font-semibold transition-colors duration-150 active:bg-[var(--surface-pressed)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]"
              style={{ background: "var(--surface-raised)", color: "var(--text)" }}
            >
              <span>Open assistant</span>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[14px] w-[14px]"
                aria-hidden
              >
                <path d="M5 12h14" />
                <path d="M13 6l6 6-6 6" />
              </svg>
            </button>
          </article>
        </section>
        )}


      </div>
    </main>
  );
}
