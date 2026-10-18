"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getWorkoutHistory } from "@/lib/trainingAnalysis";
import { askWhyPrompt } from "@/components/physique/VerdictCard";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { useNow } from "@/lib/ui/useToday";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
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

/**
 * The parked assistant's Home card (moved out of app/page.tsx in A1). Home
 * renders it only while ASSISTANT_ENABLED is true, so none of this runs
 * while the chat is switched off.
 */
export default function HomeAssistantCard() {
  const router = useRouter();
  const { unit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const hasMounted = useIsHydrated();
  const [workouts, setWorkouts] = useState<ReturnType<typeof getWorkoutHistory>>([]);

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
  );
}
