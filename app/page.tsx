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
import PhysiqueHomeCard from "@/components/physique/PhysiqueHomeCard";
import WeekReportLine from "@/components/physique/WeekReportLine";
import TodayStrip from "@/components/physique/TodayStrip";
import PageHeader from "@/components/ui/PageHeader";
import { fullLocalDate } from "@/components/charts/TimeSeriesChart";
import GapLines from "@/components/physique/GapLines";
import { askWhyPrompt } from "@/components/physique/VerdictCard";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { useNow } from "@/lib/ui/useToday";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import StaleSessionModal from "@/components/StaleSessionModal";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus, TRAINING_FOCUS_OPTIONS, type TrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel, EXPERIENCE_LEVEL_OPTIONS, type ExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal } from "@/lib/priorityGoal";
import { isOnboardingComplete, loadOnboardingProfile } from "@/lib/onboardingProfile";
import {
  buildCoachStructuredAnalysis,
  EMPTY_COACH_STRUCTURED_ANALYSIS,
  type CoachStructuredAnalysis,
} from "@/lib/coachStructuredAnalysis";

type ProfileModalProps = {
  focus: TrainingFocus;
  setFocus: (f: TrainingFocus) => void;
  experienceLevel: ExperienceLevel;
  setExperienceLevel: (e: ExperienceLevel) => void;
  unit: "kg" | "lb";
  setUnit: (u: "kg" | "lb") => void;
  onClose: () => void;
};

function ProfileModal({
  focus,
  setFocus,
  experienceLevel,
  setExperienceLevel,
  unit,
  setUnit,
  onClose,
}: ProfileModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div
        className="rounded-2xl border border-white/8 bg-zinc-900 p-6 w-full max-w-sm shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="profile-modal-title" className="text-lg font-bold text-white mb-4">
          Profile
        </h2>
        <p className="text-app-secondary text-sm mb-5">
          Edit your training preferences. Used to tailor advice across the app.
        </p>
        <div className="space-y-4">
          <div>
            <label className="label-section block mb-2">Training focus</label>
            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value as TrainingFocus)}
              className="input-app w-full px-3 py-2.5 text-sm"
            >
              {TRAINING_FOCUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-section block mb-2">Experience level</label>
            <select
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
              className="input-app w-full px-3 py-2.5 text-sm"
            >
              {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-section block mb-2">Units</label>
            <div className="flex gap-2">
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition ${
                    unit === u
                      ? "border-[color:var(--color-accent)]/40 bg-[color:var(--color-accent)]/10 text-[color:var(--color-accent)]"
                      : "border-white/10 bg-zinc-800/80 text-app-secondary hover:text-white"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <Link
          href="/profile"
          className="mt-5 flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-[13px] transition-colors"
          style={{ background: "#141416", border: "1px solid #2a2a2e", color: "#f2f2f0" }}
          aria-label="Open the profile page: reminders, import, export and coach profile"
        >
          <span className="font-semibold">Reminders, import and export</span>
          <span aria-hidden style={{ color: "#6f6f76" }}>
            →
          </span>
        </Link>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}


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
  const { unit, setUnit } = useUnit();
  const { focus, setFocus } = useTrainingFocus();
  const { experienceLevel, setExperienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const [profileOpen, setProfileOpen] = useState(false);
  const [workouts, setWorkouts] = useState<ReturnType<typeof getWorkoutHistory>>([]);
  const [profileSetupNeeded, setProfileSetupNeeded] = useState(false);
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

  useEffect(() => {
    function recheck() {
      setProfileSetupNeeded(!isOnboardingComplete(loadOnboardingProfile()));
    }
    recheck();
    window.addEventListener("onboardingProfileChanged", recheck);
    window.addEventListener("focus", recheck);
    return () => {
      window.removeEventListener("onboardingProfileChanged", recheck);
      window.removeEventListener("focus", recheck);
    };
  }, []);

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
    <main className="min-h-screen bg-zinc-950 text-white relative pb-28">
      <div className="relative mx-auto max-w-2xl px-5 sm:px-6">

        <PageHeader
          caption={hasMounted && now ? fullLocalDate(now.today) : " "}
          title="Today"
          secondary={
            <button type="button" onClick={() => setProfileOpen(true)} className="h-9 rounded-full px-3 text-[13px] font-medium transition-colors active:bg-[#26262a]" style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Open profile settings">
              Profile
            </button>
          }
        />

        {ASSISTANT_ENABLED && hasMounted && profileSetupNeeded && (
          <Link
            href="/profile"
            className="mt-2 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[12px] transition-colors"
            style={{ background: "#141416", border: "1px solid #2a2a2e", color: "#a3a3a8" }}
            aria-label="Set up your coach profile — sharpens every assistant answer"
          >
            <span className="font-semibold">
              Set up your coach profile <span className="opacity-70">· 60s, sharpens every answer</span>
            </span>
            <span aria-hidden>→</span>
          </Link>
        )}

        {profileOpen && (
          <ProfileModal
            focus={focus}
            setFocus={setFocus}
            experienceLevel={experienceLevel}
            setExperienceLevel={setExperienceLevel}
            unit={unit}
            setUnit={setUnit}
            onClose={() => setProfileOpen(false)}
          />
        )}

        {staleSession && (
          <StaleSessionModal
            draft={staleSession}
            onFinishSession={finishStaleSession}
            onResumeLogging={() => router.push("/workout")}
            onClose={() => setStaleSession(null)}
          />
        )}

        <section aria-label="Today">
          <TodayStrip />
          <div className="mt-2">
            <GapLines />
          </div>
        </section>

        <section className="pt-3" aria-labelledby="physique-heading">
          <h2 id="physique-heading" className="sr-only">
            Body
          </h2>
          <PhysiqueHomeCard />
          <div className="mt-2">
            <WeekReportLine />
          </div>
        </section>

        <section className="pt-3 pb-1">
          <Link
            href={ctaHref}
            aria-label={ctaLabel}
            className="block w-full rounded-[12px] py-4 text-center text-[17px] font-semibold tracking-[-0.01em] transition-colors duration-150 hover:bg-white active:translate-y-[1px]"
            style={{ background: "#f2f2f0", color: "#0a0a0b" }}
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
            style={{ background: "#141416", border: "1px solid #2a2a2e" }}
          >
            <header className="flex items-center gap-2.5 mb-3">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                style={{ background: "#1d1d20" }}
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#a3a3a8"
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
                <p className="text-[13px] font-bold tracking-tight text-white">
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
              className="block w-full text-left rounded-xl -mx-1 px-1 py-1 transition-colors duration-150 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/40"
              aria-label={`Ask the assistant about: ${shownInsight.text}`}
            >
              <p
                className="text-[16px] sm:text-[17px] font-semibold leading-snug text-white"
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
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors duration-150 active:bg-[#26262a]"
                  style={{ background: "#1d1d20", color: "#a3a3a8" }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={openAssistantClean}
              aria-label="Open assistant with no preloaded message"
              className="mt-3.5 flex items-center justify-center gap-2 w-full rounded-[12px] py-3 text-[15px] font-semibold transition-colors duration-150 active:bg-[#26262a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a3a40]"
              style={{ background: "#1d1d20", color: "#f2f2f0" }}
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
