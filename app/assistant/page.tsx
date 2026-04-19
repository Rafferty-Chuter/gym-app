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
import { getCompletedLoggedSets } from "@/lib/completedSets";
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
  createNewChatThread,
  loadActiveThread,
  type AssistantThread,
} from "@/lib/assistantThreads";
import { buildBenchProjectionPayload } from "@/lib/benchProjectionPayload";
import { buildBenchContextSummary } from "@/lib/benchContext";
import { buildBench1RMEstimate } from "@/lib/bench1rm";
import type { ActiveProgrammeState as PipelineActiveProgrammeState } from "@/lib/programmePipeline";

type StructuredWorkout = {
  sessionTitle: string;
  sessionGoal: string;
  purposeSummary?: string;
  exercises: Array<{
    slot: string;
    exercise: string;
    sets: string;
    reps: string;
    rir: string;
    rest: string;
    rationale?: string;
  }>;
  note: string;
  /** Server-set proof of which generator produced this card. */
  debugGenerator?: string;
  debugTrace?: string;
};

type StructuredProgramme = {
  programmeTitle: string;
  programmeGoal: string;
  notes: string;
  debugProgrammeGenerator?: string;
  debugSource?: string;
  debugRequestId?: string;
  debugBuiltAt?: string;
  days: Array<{
    dayLabel: string;
    sessionType: string;
    purposeSummary: string;
    debugDayGenerator?: string;
    targetMuscles?: string[];
    exercises: Array<{
      slotLabel: string;
      exerciseName: string;
      sets: string;
      reps: string;
      rir: string;
      rest: string;
      rationale: string;
    }>;
  }>;
};

type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  coachReview?: string;
  workout?: StructuredWorkout;
  programme?: StructuredProgramme;
};

const ASSISTANT_PROGRAMME_PIPELINE_V1 = "new_programme_pipeline_v1" as const;

/** Split assistant text on blank lines so paragraphs and sections breathe in the UI. */
function AssistantMessageBody({ content }: { content: string }) {
  const blocks = content.trim().split(/\n{2,}/);
  return (
    <div className="space-y-3.5">
      {blocks.map((block, i) => (
        <div
          key={i}
          className="whitespace-pre-wrap break-words text-[15px] sm:text-base leading-[1.65] text-zinc-100/95"
        >
          {block}
        </div>
      ))}
    </div>
  );
}

function AssistantWorkoutCard({ workout }: { workout: StructuredWorkout }) {
  return (
    <div className="space-y-3">
      {workout.debugGenerator ? (
        <div
          className="rounded-lg border border-amber-500/50 bg-amber-950/40 px-2 py-1.5 font-mono text-[11px] text-amber-100/95 whitespace-pre-wrap break-all"
          data-testid="workout-debug-generator"
        >
          debugGenerator={workout.debugGenerator}
          {workout.debugTrace ? `\ndebugTrace=${workout.debugTrace}` : ""}
        </div>
      ) : null}
      <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2">
        <p className="text-sm font-semibold text-blue-100">{workout.sessionTitle}</p>
        <p className="text-xs text-blue-100/80 mt-0.5">{workout.sessionGoal}</p>
      </div>
      <div className="space-y-2">
        {workout.exercises.map((ex, i) => (
          <div
            key={`${ex.slot}-${ex.exercise}-${i}`}
            className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-3"
          >
            <p className="text-xs uppercase tracking-wide text-blue-200/80">{i + 1}. {ex.slot}</p>
            <p className="text-sm font-semibold text-zinc-100 mt-1">{ex.exercise}</p>
            <p className="text-xs text-zinc-300 mt-1">
              {ex.sets} sets · {ex.reps} reps · {ex.rir} RIR · {ex.rest} rest
            </p>
            {ex.rationale ? (
              <p className="text-xs text-zinc-400 mt-1">{ex.rationale}</p>
            ) : null}
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-300">
        <span className="text-zinc-100 font-medium">Practical note:</span> {workout.note}
      </p>
    </div>
  );
}

function AssistantProgrammeCard({ programme }: { programme: StructuredProgramme }) {
  const allowed = programme.debugSource === ASSISTANT_PROGRAMME_PIPELINE_V1;
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    if (!allowed) {
      console.error("[programme-render-blocked]", {
        where: "client_AssistantProgrammeCard",
        debugSource: programme.debugSource ?? "missing",
        programmeTitle: programme.programmeTitle,
        dayCount: programme.days?.length ?? 0,
      });
      return;
    }
    console.log("[programme-render-allowed]", {
      where: "client_AssistantProgrammeCard",
      debugSource: programme.debugSource,
      debugRequestId: programme.debugRequestId ?? null,
      programmeTitle: programme.programmeTitle,
      dayCount: programme.days.length,
    });
  }, [programme, allowed]);
  if (process.env.NODE_ENV === "development" && !allowed) {
    return (
      <div
        className="rounded-xl border-2 border-red-500 bg-red-950/50 px-4 py-3 text-red-100"
        role="alert"
      >
        <p className="text-sm font-bold uppercase tracking-wide text-red-200">
          Blocked: programme did not come from new programme pipeline
        </p>
        <p className="text-xs mt-2 font-mono text-red-200/90">
          debugSource={JSON.stringify(programme.debugSource ?? null)} · days={programme.days?.length ?? 0}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {programme.debugProgrammeGenerator ? (
        <div className="rounded-lg border border-amber-500/50 bg-amber-950/40 px-2 py-1.5 font-mono text-[11px] text-amber-100/95">
          debugProgrammeGenerator={programme.debugProgrammeGenerator}
        </div>
      ) : null}
      <div className="rounded-xl border border-blue-400/30 bg-blue-500/10 px-3 py-2">
        <p className="text-sm font-semibold text-blue-100">{programme.programmeTitle}</p>
        <p className="text-xs text-blue-100/80 mt-0.5">{programme.programmeGoal}</p>
      </div>
      <div className="space-y-3">
        {programme.days.map((day) => (
          <div key={day.dayLabel} className="rounded-xl border border-white/10 bg-zinc-900/70 px-3 py-3">
            <p className="text-sm font-semibold text-zinc-100">{day.dayLabel}</p>
            {day.debugDayGenerator ? (
              <p className="text-[10px] font-mono text-amber-200/90 mt-0.5">
                debugDayGenerator={day.debugDayGenerator}
              </p>
            ) : null}
            {day.targetMuscles && day.targetMuscles.length > 0 ? (
              <p className="text-xs text-zinc-500 mt-0.5">Targets: {day.targetMuscles.join(", ")}</p>
            ) : null}
            <p className="text-xs text-zinc-400 mt-0.5">{day.purposeSummary}</p>
            <div className="space-y-2 mt-2">
              {day.exercises.map((ex, i) => (
                <div key={`${day.dayLabel}-${ex.slotLabel}-${i}`} className="rounded-lg border border-white/10 bg-zinc-950/40 px-3 py-2">
                  <p className="text-xs uppercase tracking-wide text-blue-200/80">{i + 1}. {ex.slotLabel}</p>
                  <p className="text-sm font-semibold text-zinc-100 mt-0.5">{ex.exerciseName}</p>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    {ex.sets} sets · {ex.reps} reps · {ex.rir} RIR · {ex.rest} rest
                  </p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-zinc-300">
        <span className="text-zinc-100 font-medium">Note:</span> {programme.notes}
      </p>
    </div>
  );
}

export default function AssistantPage() {
  const { unit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [useAssistantMemory, setUseAssistantMemory] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const activeExerciseTopicRef = useRef<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [exactThreadLoaded, setExactThreadLoaded] = useState(false);
  const threadRef = useRef<AssistantThread | null>(null);
  const activeProgrammeStateRef = useRef<PipelineActiveProgrammeState | null>(null);
  const starterPrompts = [
    "How is my training looking this week?",
    "Am I doing enough chest volume?",
    "What should I improve next session?",
    "Am I neglecting any muscle groups?",
  ] as const;

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("assistantUseLongTermMemory");
      setUseAssistantMemory(raw === "1");
    } catch {
      setUseAssistantMemory(false);
    }
  }, []);

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    try {
      const { threadId, thread, exactThreadLoaded: loaded, createdNewThread } = loadActiveThread();
      setActiveThreadId(threadId);
      setExactThreadLoaded(loaded);
      threadRef.current = thread;
      setMessages(
        thread.messages.map((m) => ({
          role: m.role,
          content: m.content,
          coachReview: m.coachReview,
          workout: m.workout,
          programme: m.programme,
        }))
      );
      const programmeMessages = thread.messages.filter(
        (m) => m.role === "assistant" && m.programme && m.programme.days?.length
      );
      if (programmeMessages.length > 0) {
        const nonV1 = programmeMessages.filter(
          (m) => m.programme!.debugSource !== ASSISTANT_PROGRAMME_PIPELINE_V1
        );
        if (process.env.NODE_ENV === "development" && nonV1.length > 0) {
          console.warn("[programme-cache-hit]", {
            hit: true,
            source: "thread_localStorage_assistantThreadsV1",
            nonV1ProgrammeMessages: nonV1.length,
            debugSources: nonV1.map((m) => m.programme?.debugSource ?? "missing"),
            note: "UI will block these cards unless debugSource is new_programme_pipeline_v1",
          });
        }
        console.log("[programme-cache-hit]", {
          hit: true,
          source: "thread_localStorage_assistantThreadsV1",
          programmeCardCount: programmeMessages.length,
          threadId,
          note: "Not a server cache — persisted chat history replayed in UI",
        });
      } else {
        console.log("[programme-cache-hit]", {
          hit: false,
          source: "thread_load",
          threadId,
        });
      }
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
      setMessages(
        loaded.thread.messages.map((m) => ({
          role: m.role,
          content: m.content,
          coachReview: m.coachReview,
          workout: m.workout,
          programme: m.programme,
        }))
      );
    }

    const nextThread = appendToThread({
      threadId: localThreadId!,
      role: "user",
      content: text,
    });
    threadRef.current = nextThread;
    setActiveThreadId(nextThread.thread_id);
    setMessages(
      nextThread.messages.map((m) => ({
        role: m.role,
        content: m.content,
        coachReview: m.coachReview,
        workout: m.workout,
        programme: m.programme,
      }))
    );
    console.log("[thread-debug] appended user message", {
      threadId: nextThread.thread_id,
      exactThreadLoaded: localExactThreadLoaded,
      messageCount: nextThread.messages.length,
    });

    const threadMessagesForRequest = nextThread.messages
      .slice(-30)
      .map((m) => ({
        role: m.role,
        content: m.content,
        coachReview: m.coachReview,
        workout: m.workout,
        programme: m.programme,
      }));

    // Use a short rolling window for model continuity.
    const recentTurnsForRequest: RecentConversationTurn[] = buildRecentConversationMemory(
      threadMessagesForRequest as RecentConversationTurn[],
      12
    );

    setIsLoading(true);

    try {
      const assistantMemory = useAssistantMemory ? getSelectiveAssistantMemory() : undefined;
      if (useAssistantMemory && assistantMemory) {
        console.log("[memory-debug] long-term memory enabled for request", {
          requestIncludesAssistantMemory: true,
          storedMemoryLastUpdatedAt: assistantMemory.lastUpdatedAt,
        });
      } else {
        const storedMemoryForDebug = getSelectiveAssistantMemory();
        console.log("[memory-debug] cross-thread memory disabled for request", {
          requestIncludesAssistantMemory: false,
          storedMemoryLastUpdatedAt: storedMemoryForDebug.lastUpdatedAt,
        });
      }
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
            const completedSetsOnly = getCompletedLoggedSets(match.sets);
            if (!completedSetsOnly.length) continue;
            const sets = completedSetsOnly.map((s) => ({
              weight: String(s.weight ?? ""),
              reps: String(s.reps ?? ""),
              notes: typeof s.notes === "string" ? s.notes : undefined,
              rir: typeof s.rir === "number" ? s.rir : undefined,
            }));
            const best = getBestSet(
              completedSetsOnly.map((s) => ({
                weight: String(s.weight ?? ""),
                reps: String(s.reps ?? ""),
              }))
            );
            const lastSet = sets[sets.length - 1] ?? undefined;
            const bestE1rm = best ? estimateE1RM(best.weight, best.reps) : undefined;
            const unloggedSetCount = Math.max(0, (match.sets?.length ?? 0) - completedSetsOnly.length);
            return {
              exerciseName,
              completedAt: w.completedAt,
              sets,
              unloggedSetCount,
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

      const benchProjection = buildBenchProjectionPayload({
        message: text,
        unit,
        exerciseTrends,
        workouts: allWorkouts,
        priorityGoal: goal,
        benchExerciseName:
          benchExerciseName ?? exerciseNames.find((n) => /bench/i.test(n)) ?? undefined,
      });
      const benchContext = buildBenchContextSummary(allWorkouts);
      const benchEstimate = buildBench1RMEstimate({
        message: text,
        benchContext,
      });
      console.log("[assistant-debug] bench context payload:", {
        heavy: benchContext.latestHeavyBenchSession
          ? {
              date: benchContext.latestHeavyBenchSession.completedAt,
              sessionName: benchContext.latestHeavyBenchSession.sessionName,
              exerciseName: benchContext.latestHeavyBenchSession.exerciseName,
              sets: benchContext.latestHeavyBenchSession.sets.map((s) => `${s.weight}x${s.reps}`),
              best: `${benchContext.latestHeavyBenchSession.bestSet.weight}x${benchContext.latestHeavyBenchSession.bestSet.reps}`,
              avgRIR: benchContext.latestHeavyBenchSession.avgRIR,
            }
          : null,
        volume: benchContext.latestVolumeBenchSession
          ? {
              date: benchContext.latestVolumeBenchSession.completedAt,
              sessionName: benchContext.latestVolumeBenchSession.sessionName,
              exerciseName: benchContext.latestVolumeBenchSession.exerciseName,
              sets: benchContext.latestVolumeBenchSession.sets.map((s) => `${s.weight}x${s.reps}`),
              best: `${benchContext.latestVolumeBenchSession.bestSet.weight}x${benchContext.latestVolumeBenchSession.bestSet.reps}`,
              avgRIR: benchContext.latestVolumeBenchSession.avgRIR,
            }
          : null,
      });
      console.log("[assistant-debug] bench estimate payload:", benchEstimate);

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
          benchContext,
          benchEstimate,
          activeProgrammeState: activeProgrammeStateRef.current ?? undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && typeof data.reply === "string") {
        if (data.programmeConstraintFailure === true) {
          activeProgrammeStateRef.current = null;
          if (process.env.NODE_ENV === "development") {
            console.error("[programme-constraint-failure]", {
              where: "client_after_fetch_api_assistant",
              replyPreview: (data.reply as string).slice(0, 200),
            });
          }
        }
        if (process.env.NODE_ENV === "development" && data.activeProgrammeState) {
          console.log("[assistant-client-active-programme-state]", data.activeProgrammeState);
        }
        if (process.env.NODE_ENV === "development" && data.structuredProgramme) {
          const sp = data.structuredProgramme as StructuredProgramme;
          if (sp.debugSource !== ASSISTANT_PROGRAMME_PIPELINE_V1) {
            console.error("[old-programme-path-hit]", {
              where: "client_after_fetch_api_assistant",
              debugSource: sp.debugSource ?? "missing",
            });
          }
          console.log("[programme-rendered]", {
            where: "client_after_fetch_api_assistant",
            debugSource: sp.debugSource ?? "missing_debugSource",
            debugRequestId: sp.debugRequestId ?? null,
            programmeTitle: sp.programmeTitle,
            dayCount: sp.days?.length ?? 0,
          });
        }
        if (
          data.activeProgrammeState &&
          typeof data.activeProgrammeState === "object" &&
          "programme" in data.activeProgrammeState &&
          "parsedRequest" in data.activeProgrammeState
        ) {
          activeProgrammeStateRef.current = data.activeProgrammeState as PipelineActiveProgrammeState;
        }
        // Selective long-term memory can be toggled in UI.
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
          if (!useAssistantMemory || !assistantMemory) {
            console.log("[memory-debug] selective memory persistence skipped (toggle off)");
          } else {
            const updated = applySelectiveMemoryUpdates({
              current: assistantMemory,
              proposals,
            });
            if (updated.lastUpdatedAt !== assistantMemory.lastUpdatedAt) {
              setSelectiveAssistantMemory(updated);
              console.log("[memory-debug] selective memory persisted", {
                lastUpdatedAt: updated.lastUpdatedAt,
              });
            }
          }
        } catch (e) {
          console.log("[memory-debug] memory update failed", e);
        }
        const coachReviewFromApi =
          typeof data.coachReview === "string" && data.coachReview.trim()
            ? data.coachReview.trim()
            : undefined;
        if (data.structuredWorkout && typeof data.structuredWorkout === "object") {
          console.log(
            "[ASSISTANT_UI_RENDERED_WORKOUT_OBJECT]",
            JSON.stringify(data.structuredWorkout, null, 2)
          );
        }
        const nextThreadAfterAssistant = appendToThread({
          threadId: localThreadId!,
          role: "assistant",
          content: data.reply,
          ...(coachReviewFromApi ? { coachReview: coachReviewFromApi } : {}),
          workout:
            data.structuredWorkout && typeof data.structuredWorkout === "object"
              ? (data.structuredWorkout as StructuredWorkout)
              : undefined,
          programme:
            data.programmeConstraintFailure !== true &&
            data.structuredProgramme &&
            typeof data.structuredProgramme === "object"
              ? (data.structuredProgramme as StructuredProgramme)
              : undefined,
        });
        threadRef.current = nextThreadAfterAssistant;
        setMessages(
          nextThreadAfterAssistant.messages.map((m) => ({
            role: m.role,
            content: m.content,
            coachReview: m.coachReview,
            workout: m.workout,
            programme: m.programme,
          }))
        );
        setActiveThreadId(nextThreadAfterAssistant.thread_id);
      } else {
        const nextThreadAfterAssistant = appendToThread({
          threadId: localThreadId!,
          role: "assistant",
          content: `Error: ${data.error ?? "Sorry, I couldn’t get a response. Please try again."}`,
        });
        threadRef.current = nextThreadAfterAssistant;
        setMessages(
          nextThreadAfterAssistant.messages.map((m) => ({
            role: m.role,
            content: m.content,
            coachReview: m.coachReview,
            workout: m.workout,
            programme: m.programme,
          }))
        );
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
        setMessages(
          nextThreadAfterAssistant.messages.map((m) => ({
            role: m.role,
            content: m.content,
            coachReview: m.coachReview,
            workout: m.workout,
            programme: m.programme,
          }))
        );
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

  function handleNewChat() {
    if (isLoading) return;
    if (
      messages.length > 0 &&
      !window.confirm(
        "Start a new chat? This screen clears for testing. Your previous thread stays in storage on this device (not deleted). Workout data and assistant memory are unchanged."
      )
    ) {
      return;
    }
    const result = createNewChatThread();
    // Hard reset short-term assistant conversation state for this tab/thread.
    activeExerciseTopicRef.current = null;
    activeProgrammeStateRef.current = null;
    threadRef.current = result.thread;
    setActiveThreadId(result.threadId);
    setExactThreadLoaded(result.exactThreadLoaded);
    setInput("");
    setMessages([]);
    if (process.env.NODE_ENV === "development") {
      console.log("[thread-debug] New Chat (UI)", {
        threadId: result.threadId,
        freshThread: result.createdNewThread,
        messageCount: 0,
        activeExerciseTopicReset: activeExerciseTopicRef.current,
      });
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
      <div className="max-w-3xl mx-auto w-full flex flex-col flex-1 min-h-0 px-1 sm:px-0">
        <Link
          href="/coach"
          className="text-app-secondary hover:text-white transition-colors text-sm mb-4 inline-block font-medium"
        >
          ← Back to Coach
        </Link>
        <section className="mb-4 rounded-2xl border border-blue-500/30 bg-gradient-to-br from-blue-500/20 via-indigo-500/12 to-zinc-900/85 p-4 shadow-[0_16px_40px_-18px_rgba(59,130,246,0.5)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-3xl font-extrabold tracking-tight text-blue-50 mb-1">Assistant</h1>
              <p className="text-blue-100/80 text-sm">
                Ask anything about your training. Your coach responds using your logged sessions and current goals.
              </p>
            </div>
            <button
              type="button"
              onClick={handleNewChat}
              disabled={isLoading}
              className="shrink-0 self-start rounded-xl border border-blue-400/35 bg-zinc-900/70 px-3 py-2 text-sm font-semibold text-blue-100 hover:border-blue-300/50 hover:bg-zinc-800/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              New Chat
            </button>
          </div>
          <label className="mt-3 inline-flex items-center gap-2 text-xs text-blue-100/80">
            <input
              type="checkbox"
              checked={useAssistantMemory}
              onChange={(e) => {
                const next = e.target.checked;
                setUseAssistantMemory(next);
                try {
                  window.localStorage.setItem("assistantUseLongTermMemory", next ? "1" : "0");
                } catch {
                  // ignore storage issues
                }
              }}
              className="h-3.5 w-3.5 rounded border-blue-400/40 bg-zinc-900"
            />
            Use long-term assistant memory across chats
          </label>
        </section>

        <div className="flex-1 overflow-y-auto rounded-2xl border border-blue-500/20 bg-gradient-to-b from-zinc-900/95 via-blue-950/20 to-indigo-950/22 p-5 sm:p-6 mb-4 min-h-[200px] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]">
          {messages.length === 0 ? (
            <p className="text-app-meta text-sm">Send a message to start.</p>
          ) : (
            <ul className="space-y-5 sm:space-y-6">
              {messages.map((m, i) => (
                <li
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[min(92%,20rem)] rounded-2xl px-4 py-3 text-[15px] sm:text-base leading-relaxed bg-gradient-to-br from-blue-500/35 to-indigo-500/35 text-white font-semibold border border-blue-400/25 shadow-sm"
                        : "w-full max-w-[min(100%,36rem)] rounded-2xl px-4 py-4 sm:px-5 sm:py-4 border border-white/[0.08] bg-zinc-900/55 backdrop-blur-sm shadow-[0_8px_30px_-12px_rgba(0,0,0,0.45)]"
                    }
                  >
                    {m.role === "assistant" ? (
                      m.programme ? (
                        <div className="space-y-4">
                          {m.coachReview?.trim() ? (
                            <AssistantMessageBody content={m.coachReview} />
                          ) : null}
                          <AssistantProgrammeCard programme={m.programme} />
                        </div>
                      ) : m.workout ? (
                        <div className="space-y-4">
                          {m.coachReview?.trim() ? (
                            <AssistantMessageBody content={m.coachReview} />
                          ) : null}
                          <AssistantWorkoutCard workout={m.workout} />
                        </div>
                      ) : (
                        <AssistantMessageBody content={m.content} />
                      )
                    ) : (
                      <span className="whitespace-pre-wrap break-words">{m.content}</span>
                    )}
                  </div>
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
