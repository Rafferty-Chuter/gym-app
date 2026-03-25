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
import { getBestSet, estimateE1RM, getUniqueExerciseNames } from "@/lib/trainingMetrics";
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
import {
  buildRecentConversationMemory,
  extractMemoryProposalsFromConversation,
  getSelectiveAssistantMemory,
  applySelectiveMemoryUpdates,
  setSelectiveAssistantMemory,
  type RecentConversationTurn,
} from "@/lib/assistantMemory";
import {
  appendToThread,
  loadActiveThread,
  type AssistantThread,
} from "@/lib/assistantThreads";

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
  const activeExerciseTopicRef = useRef<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [exactThreadLoaded, setExactThreadLoaded] = useState(false);
  const threadRef = useRef<AssistantThread | null>(null);
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
    try {
      const { threadId, thread, exactThreadLoaded: loaded, createdNewThread } = loadActiveThread();
      setActiveThreadId(threadId);
      setExactThreadLoaded(loaded);
      threadRef.current = thread;
      setMessages(thread.messages.map((m) => ({ role: m.role, content: m.content })));
      console.log("[thread-debug] active thread loaded", {
        threadId,
        exactThreadLoaded: loaded,
        createdNewThread,
        messageCount: thread.messages.length,
      });
    } catch (e) {
      console.log("[thread-debug] failed to load active thread", e);
    }
  }, []);

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
    // Persist the thread before asking the assistant so "last message" questions work reliably.
    let localThreadId = activeThreadId;
    let localExactThreadLoaded = exactThreadLoaded;
    if (!threadRef.current || !localThreadId) {
      const loaded = loadActiveThread();
      localThreadId = loaded.threadId;
      localExactThreadLoaded = loaded.exactThreadLoaded;
      setActiveThreadId(loaded.threadId);
      setExactThreadLoaded(loaded.exactThreadLoaded);
      threadRef.current = loaded.thread;
      setMessages(loaded.thread.messages.map((m) => ({ role: m.role, content: m.content })));
    }

    const nextThread = appendToThread({
      threadId: localThreadId!,
      role: "user",
      content: text,
    });
    threadRef.current = nextThread;
    setActiveThreadId(nextThread.thread_id);
    setMessages(nextThread.messages.map((m) => ({ role: m.role, content: m.content })));
    console.log("[thread-debug] appended user message", {
      threadId: nextThread.thread_id,
      exactThreadLoaded: localExactThreadLoaded,
      messageCount: nextThread.messages.length,
    });

    const threadMessagesForRequest = nextThread.messages
      .slice(-30)
      .map((m) => ({ role: m.role, content: m.content }));

    // Use a short rolling window for model continuity.
    const recentTurnsForRequest: RecentConversationTurn[] = buildRecentConversationMemory(
      threadMessagesForRequest as RecentConversationTurn[],
      12
    );

    setIsLoading(true);

    try {
      const assistantMemory = getSelectiveAssistantMemory();
      console.log("[memory-debug] current stored memory", {
        userId: assistantMemory.userId,
        lastUpdatedAt: assistantMemory.lastUpdatedAt,
        stablePreferences: Object.fromEntries(
          Object.entries(assistantMemory.stablePreferences).map(([k, v]) => [k, v.value])
        ),
      });
      const recentTurns: RecentConversationTurn[] = recentTurnsForRequest;

      const summary = getTrainingSummary();
      const recentExercises = new Set<string>();
      for (const w of summary.recentWorkouts) {
        for (const ex of w.exercises ?? []) {
          if (ex.name?.trim()) recentExercises.add(ex.name.trim());
        }
      }
      const allWorkouts = getWorkoutHistory();

      function norm(s: string) {
        return s.trim().toLowerCase().replace(/\s+/g, " ");
      }

      const exerciseNames = getUniqueExerciseNames(allWorkouts);

      function pickExerciseFromText(t: string): string | null {
        const s = t.toLowerCase();

        const benchLike = /\bbench\b|pb|bench press|barbell bench/;
        if (benchLike.test(s)) {
          const benchCandidates = exerciseNames.filter((n) => /bench/i.test(n));
          return benchCandidates.sort((a, b) => a.length - b.length)[0] ?? null;
        }

        const hammerLike = /\bhammer curl\b|hammer curls/;
        if (hammerLike.test(s)) {
          const c = exerciseNames.find((n) => /hammer/i.test(n));
          return c ?? null;
        }

        // fallback: any explicit exercise name substring match
        for (const n of exerciseNames) {
          const key = norm(n);
          const parts = key.split(" ").filter(Boolean);
          if (parts.length >= 2 && parts.some((p) => s.includes(p))) return n;
        }
        return null;
      }

      const detectedExercise = pickExerciseFromText(text);
      if (detectedExercise) activeExerciseTopicRef.current = detectedExercise;
      const activeExerciseTopic = activeExerciseTopicRef.current ?? undefined;

      function getLastSessionSetsForExercise(exerciseName: string) {
        const exNorm = norm(exerciseName);
        const sorted = [...(allWorkouts ?? [])].sort(
          (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
        );
        for (const w of sorted) {
          const match = (w.exercises ?? []).find((ex) => norm(ex.name ?? "") === exNorm);
          if (match?.sets?.length) {
            const sets = match.sets.map((s) => ({
              weight: String(s.weight ?? ""),
              reps: String(s.reps ?? ""),
              notes: typeof s.notes === "string" ? s.notes : undefined,
              rir: typeof s.rir === "number" ? s.rir : undefined,
            }));
            const best = getBestSet(match.sets.map((s) => ({ weight: String(s.weight ?? ""), reps: String(s.reps ?? "") })));
            const lastSet = sets[sets.length - 1] ?? undefined;
            const bestE1rm = best ? estimateE1RM(best.weight, best.reps) : undefined;
            return {
              exerciseName,
              completedAt: w.completedAt,
              sets,
              bestSet: best
                ? {
                    weight: String(best.weight),
                    reps: String(best.reps),
                    e1rm: bestE1rm,
                  }
                : undefined,
              lastSet,
            };
          }
        }
        return undefined;
      }

      const activeExerciseLastSession = activeExerciseTopic ? getLastSessionSetsForExercise(activeExerciseTopic) : undefined;

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

      function parseTargetFromText(t: string): { value: number; unit: "kg" | "lb" } | null {
        const m = t.match(/(\d+(?:\.\d+)?)\s*(kg|kgs|kilograms)\b/i);
        if (m) return { value: parseFloat(m[1]), unit: "kg" };
        const m2 = t.match(/(\d+(?:\.\d+)?)\s*(lb|lbs|pounds)\b/i);
        if (m2) return { value: parseFloat(m2[1]), unit: "lb" };
        const num = t.match(/\b(\d{2,3}(?:\.\d+)?)\b/);
        if (num && /\bbench\b|pb|bench press/i.test(t)) return { value: parseFloat(num[1]), unit };
        return null;
      }

      function isBenchQuestion(t: string): boolean {
        return /\bbench\b|pb|bench press|barbell bench/i.test(t);
      }

      function getBenchProjectionIfAny() {
        if (!isBenchQuestion(text)) return undefined;
        const target = parseTargetFromText(text);
        if (!target) return undefined;
        const targetInPayloadUnit =
          target.unit === unit ? target.value : target.unit === "kg" ? target.value * 2.20462 : target.value / 2.20462;

        const benchName =
          benchExerciseName ??
          (exerciseNames.find((n) => /bench/i.test(n)) ?? undefined);
        if (!benchName) return undefined;

        const benchTrend =
          exerciseTrends.find((et) => norm(et.exercise) === norm(benchName)) ?? null;
        const perfs = benchTrend?.recentPerformances ?? [];
        if (perfs.length < 2) return undefined;

        const current = perfs[perfs.length - 1];
        const prev = perfs[perfs.length - 2];
        const currentE1rm = current.e1rm ?? estimateE1RM(current.weight, current.reps);
        const prevE1rm = prev.e1rm ?? estimateE1RM(prev.weight, prev.reps);
        const delta = currentE1rm - prevE1rm;
        if (!Number.isFinite(delta) || delta <= 0) return undefined;

        const remaining = targetInPayloadUnit - currentE1rm;
        const sessionsEstimate = remaining <= 0 ? 0 : Math.max(1, Math.ceil(remaining / delta));

        const repsSchemes = [3, 5, 8];
        const workingWeights = repsSchemes.map((r) => {
          // Invert Epley: 1RM = w * (1 + reps/30)
          const w = targetInPayloadUnit / (1 + r / 30);
          return { reps: r, weight: Number(w.toFixed(1)) };
        });

        return {
          target1RM: Number(targetInPayloadUnit.toFixed(1)),
          payloadUnit: unit,
          benchExerciseName: benchName,
          currentEstimated1RM: Number(currentE1rm.toFixed(1)),
          deltaE1RMPerSession: Number(delta.toFixed(1)),
          sessionsEstimate,
          recentBestSets: perfs.map((p) => ({
            completedAt: p.completedAt,
            weight: p.weight,
            reps: p.reps,
            e1rm: p.e1rm,
          })),
          workingWeights,
        };
      }

      const benchProjection = getBenchProjectionIfAny();

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
          thread_id: localThreadId!,
          exactThreadLoaded: localExactThreadLoaded,
          threadMessages: threadMessagesForRequest,
          assistantMemory,
          recentConversationMemory: recentTurns,
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
          activeExerciseTopic,
          activeExerciseLastSession,
          benchProjection,
        }),
      });

      const data = await res.json();
      if (res.ok && typeof data.reply === "string") {
        // Conservative long-term memory update: store only stable, explicit preferences.
        try {
          const proposals = extractMemoryProposalsFromConversation({
            userText: text,
            assistantText: data.reply,
            explicitProfile: {
              priorityGoal: goal,
              trainingPrioritiesText: userProfile.trainingPrioritiesText,
              lowerBodyPriority: userProfile.lowerBodyPriority,
            },
          });
          console.log("[memory-debug] proposed updates", proposals);
          const updated = applySelectiveMemoryUpdates({
            current: assistantMemory,
            proposals,
          });
          // Only persist if something changed.
          if (updated.lastUpdatedAt !== assistantMemory.lastUpdatedAt) {
            console.log("[memory-debug] memory updated", updated);
            setSelectiveAssistantMemory(updated);
          }
        } catch (e) {
          console.log("[memory-debug] memory update failed", e);
        }
        const nextThreadAfterAssistant = appendToThread({
          threadId: localThreadId!,
          role: "assistant",
          content: data.reply,
        });
        threadRef.current = nextThreadAfterAssistant;
        setMessages(nextThreadAfterAssistant.messages.map((m) => ({ role: m.role, content: m.content })));
        setActiveThreadId(nextThreadAfterAssistant.thread_id);
      } else {
        const nextThreadAfterAssistant = appendToThread({
          threadId: localThreadId!,
          role: "assistant",
          content: `Error: ${data.error ?? "Sorry, I couldn’t get a response. Please try again."}`,
        });
        threadRef.current = nextThreadAfterAssistant;
        setMessages(nextThreadAfterAssistant.messages.map((m) => ({ role: m.role, content: m.content })));
      }
    } catch {
      try {
        // Best-effort: append the error to the thread for continuity.
        const nextThreadAfterAssistant = appendToThread({
          threadId: (activeThreadId ?? localThreadId!)!,
          role: "assistant",
          content: "Error: Something went wrong. Please try again.",
        });
        threadRef.current = nextThreadAfterAssistant;
        setMessages(nextThreadAfterAssistant.messages.map((m) => ({ role: m.role, content: m.content })));
        setActiveThreadId(nextThreadAfterAssistant.thread_id);
      } catch {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Error: Something went wrong. Please try again." },
        ]);
      }
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
