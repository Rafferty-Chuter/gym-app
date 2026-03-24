"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { getTrainingSummary } from "@/utils/trainingSummary";
import {
  getWorkoutHistory,
  getExerciseTrends,
  getTrainingInsights,
  getExerciseInsights,
} from "@/lib/trainingAnalysis";
import { getUniqueExerciseNames } from "@/lib/trainingMetrics";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal } from "@/lib/priorityGoal";
import {
  buildCoachStructuredAnalysis,
  collectReferencedEvidenceCardIds,
} from "@/lib/coachStructuredAnalysis";
import { getEvidenceCardsForReferencedIds } from "@/lib/evidenceMapping";
import { getStoredUserProfile } from "@/lib/userProfile";
import { buildCoachingContext } from "@/lib/coachingContext";

type ChatMessage = { role: "user" | "assistant"; content: string };

export default function AssistantPage() {
  const { unit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const starterPrompts = [
    "How is my training looking this week?",
    "Am I doing enough chest volume?",
    "What should I improve next session?",
    "Am I neglecting any muscle groups?",
  ] as const;

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const quick = sessionStorage.getItem("assistantQuickPrompt");
    const shouldAutoSend = sessionStorage.getItem("assistantAutoSend") === "1";
    if (!quick || !quick.trim()) return;
    sessionStorage.removeItem("assistantQuickPrompt");
    sessionStorage.removeItem("assistantAutoSend");
    const trimmed = quick.trim();
    if (shouldAutoSend) {
      handleSend(trimmed);
      return;
    }
    setInput(trimmed);
  }, []);

  async function handleSend(textOverride?: string) {
    const text = (textOverride ?? input).trim();
    if (!text || isLoading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setIsLoading(true);

    try {
      const summary = getTrainingSummary();
      const recentExercises = new Set<string>();
      for (const w of summary.recentWorkouts) {
        for (const ex of w.exercises ?? []) {
          if (ex.name?.trim()) recentExercises.add(ex.name.trim());
        }
      }
      const allWorkouts = getWorkoutHistory();
      const exerciseTrends = getExerciseTrends(allWorkouts, { maxSessions: 5 });
      const trainingInsights = getTrainingInsights(allWorkouts);
      const priorityGoalExerciseInsight = goal?.trim()
        ? getExerciseInsights(allWorkouts, goal.trim(), { maxSessions: 5 })
        : undefined;

      const benchExerciseName = getUniqueExerciseNames(allWorkouts).find((n) =>
        /bench/i.test(n)
      );
      const benchRirDebug = benchExerciseName
        ? getExerciseInsights(allWorkouts, benchExerciseName, { maxSessions: 5 })
        : undefined;
      console.log("[assistant-debug] latest bench RIR fields:", {
        exercise: benchRirDebug?.exercise,
        avgRIR: benchRirDebug?.avgRIR,
        latestSessionAvgRIR: benchRirDebug?.latestSessionAvgRIR,
        latestSessionAllSetsToFailure: benchRirDebug?.latestSessionAllSetsToFailure,
      });
      console.log("[assistant-debug] client payload RIR:", {
        averageRIR: trainingInsights.averageRIR,
        recentHighEffortExercises: trainingInsights.recentHighEffortExercises,
        priorityGoalExerciseInsight: priorityGoalExerciseInsight && {
          exercise: priorityGoalExerciseInsight.exercise,
          avgRIR: priorityGoalExerciseInsight.avgRIR,
          latestSessionAvgRIR: priorityGoalExerciseInsight.latestSessionAvgRIR,
          latestSessionAllSetsToFailure: priorityGoalExerciseInsight.latestSessionAllSetsToFailure,
        },
      });
      const coachAnalysis = buildCoachStructuredAnalysis(allWorkouts, {
        focus,
        experienceLevel,
        goal,
        unit,
      });
      const evidenceCards = getEvidenceCardsForReferencedIds(
        collectReferencedEvidenceCardIds(coachAnalysis)
      );
      const coachStructuredOutput = {
        keyFocus: coachAnalysis.keyFocus,
        keyFocusType: coachAnalysis.keyFocusType,
        keyFocusExercise: coachAnalysis.keyFocusExercise,
        keyFocusGroups: coachAnalysis.keyFocusGroups,
        keyFocusEvidenceCardIds: coachAnalysis.keyFocusEvidenceCardIds,
        whatsGoingWell: coachAnalysis.whatsGoingWell.map((t, i) => ({
          text: t,
          evidenceCardIds: coachAnalysis.whatsGoingWellEvidenceCardIds[i] ?? [],
        })),
        actionableSuggestions: coachAnalysis.actionableSuggestions.map((t, i) => ({
          text: t,
          evidenceCardIds: coachAnalysis.actionableSuggestionEvidenceCardIds[i] ?? [],
        })),
      };
      const userProfile = getStoredUserProfile(focus, experienceLevel, goal);
      const coachingContext = buildCoachingContext({
        profile: userProfile,
        focus,
        experienceLevel,
        goal,
        unit,
      });

      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          trainingSummary: {
            totalWorkouts: summary.totalWorkouts,
            totalExercises: summary.totalExercises,
            totalSets: summary.totalSets,
            weeklyVolume: summary.weeklyVolume,
            recentExercises: Array.from(recentExercises),
          },
          trainingFocus: focus,
          experienceLevel,
          unit,
          priorityGoal: goal,
          exerciseTrends,
          trainingInsights,
          priorityGoalExerciseInsight,
          coachStructuredOutput,
          evidenceCards,
          userProfile,
          coachingContext,
        }),
      });

      const data = await res.json();
      if (res.ok && typeof data.reply === "string") {
        setMessages((prev) => [...prev, { role: "assistant", content: data.reply }]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Error: ${data.error ?? "Sorry, I couldn’t get a response. Please try again."}`,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 pb-28 flex flex-col">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_85%_42%_at_50%_-12%,rgba(59,130,246,0.30),transparent_56%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_30%_at_50%_100%,rgba(56,189,248,0.12),transparent_62%)]"
        aria-hidden
      />
      <div className="max-w-2xl mx-auto w-full flex flex-col flex-1 min-h-0">
        <Link
          href="/coach"
          className="text-app-secondary hover:text-white transition-colors text-sm mb-4 inline-block font-medium"
        >
          ← Back to Coach
        </Link>
        <section className="mb-4 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/20 via-indigo-500/12 to-zinc-900/85 p-4 shadow-[0_16px_40px_-18px_rgba(59,130,246,0.5)]">
          <h1 className="text-3xl font-extrabold tracking-tight text-blue-50 mb-1">Assistant</h1>
          <p className="text-blue-100/80 text-sm">
            Ask anything about your training. Your coach responds using your logged sessions and current goals.
          </p>
        </section>

        <div className="flex-1 overflow-y-auto rounded-2xl border-2 border-blue-500/55 bg-gradient-to-b from-zinc-900/95 via-blue-950/20 to-indigo-950/22 p-4 mb-4 min-h-[200px] shadow-[0_0_0_1px_rgba(59,130,246,0.22)]">
          {messages.length === 0 ? (
            <p className="text-app-meta text-sm">Send a message to start.</p>
          ) : (
            <ul className="space-y-3">
              {messages.map((m, i) => (
                <li
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <span
                    className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-gradient-to-br from-blue-500/35 to-indigo-500/35 text-white font-semibold border border-blue-400/35"
                        : "border border-blue-900/45 bg-zinc-900/80 text-app-secondary"
                    }`}
                  >
                    {m.content}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {isLoading && (
            <p className="text-app-meta text-sm mt-2">Thinking…</p>
          )}
          <div ref={listEndRef} />
        </div>

        {messages.length === 0 && !isLoading && (
          <div className="mb-3">
            <p className="label-section mb-2 text-blue-200/75">Try one of these</p>
            <div className="flex flex-wrap gap-2">
              {starterPrompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => handleSend(p)}
                  className="text-left text-sm px-3 py-2 rounded-xl border border-blue-900/40 bg-zinc-900/80 text-app-secondary hover:border-blue-500/35 hover:text-blue-100 transition-colors"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Ask about your training..."
            disabled={isLoading}
            className="input-app flex-1 min-w-0 p-3 border-blue-900/45 focus:border-blue-500/40 focus:ring-blue-500/35 disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={isLoading || !input.trim()}
            className="px-4 py-3 rounded-xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-500 text-blue-50 font-bold shadow-[0_10px_26px_-12px_rgba(59,130,246,0.65)] transition hover:brightness-105 active:translate-y-[1px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send
          </button>
        </div>
      </div>
    </main>
  );
}
