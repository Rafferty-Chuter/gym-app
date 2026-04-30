"use client";

import { useState, useRef, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
  EMPTY_COACH_STRUCTURED_ANALYSIS,
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
  loadMemory,
  saveMemory,
  type ExtractedMemoryFact,
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

/**
 * Renders assistant prose with proper markdown — line breaks, bold, italic,
 * lists, code spans, headings — using Tailwind class overrides per element.
 * Typography: regular weight, 1.65 line-height, slightly looser tracking,
 * humanistic warmth (no font-medium body).
 */
function AssistantMessageBody({ content }: { content: string }) {
  return (
    <div className="text-[15px] sm:text-base font-normal leading-[1.65] tracking-[0.005em] text-zinc-100/95 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children, ...props }) => (
            <p className="[&:not(:first-child)]:mt-3" {...props}>
              {children}
            </p>
          ),
          ul: ({ children, ...props }) => (
            <ul className="my-3 space-y-1.5 pl-5 list-disc marker:text-app-tertiary" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="my-3 space-y-1.5 pl-5 list-decimal marker:text-app-tertiary" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, ...props }) => (
            <li className="pl-1 leading-[1.55]" {...props}>
              {children}
            </li>
          ),
          strong: ({ children, ...props }) => (
            <strong className="font-semibold text-white" {...props}>
              {children}
            </strong>
          ),
          em: ({ children, ...props }) => (
            <em className="italic text-zinc-100" {...props}>
              {children}
            </em>
          ),
          a: ({ href, children, ...props }) => (
            <a
              href={href}
              className="underline decoration-[color:var(--color-accent)]/40 underline-offset-2 hover:text-[color:var(--color-accent)]"
              target="_blank"
              rel="noreferrer"
              {...props}
            >
              {children}
            </a>
          ),
          code: ({ children, ...props }) => (
            <code
              className="rounded px-1 py-0.5 bg-white/[0.06] text-[13px] font-mono text-zinc-100"
              {...props}
            >
              {children}
            </code>
          ),
          h1: ({ children, ...props }) => (
            <p
              className="text-[16px] sm:text-[17px] font-semibold text-white mt-4 mb-1"
              {...props}
            >
              {children}
            </p>
          ),
          h2: ({ children, ...props }) => (
            <p
              className="text-[15px] sm:text-base font-semibold text-white mt-4 mb-1"
              {...props}
            >
              {children}
            </p>
          ),
          h3: ({ children, ...props }) => (
            <p className="text-[15px] font-semibold text-zinc-100 mt-3 mb-1" {...props}>
              {children}
            </p>
          ),
          hr: (props) => <hr className="my-4 border-white/[0.06]" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

function NewChatIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[18px] w-[18px]"
      aria-hidden
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-9.9 8.4l-5.6 1.1 1.1-5.6A8.5 8.5 0 1 1 21 11.5Z" />
      <line x1="12" y1="9" x2="12" y2="15" />
      <line x1="9" y1="12" x2="15" y2="12" />
    </svg>
  );
}

function SendArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[16px] w-[16px]"
      aria-hidden
    >
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="5 12 12 5 19 12" />
    </svg>
  );
}

type EmptyStateContent = {
  opening: string;
  chips: { label: string; prompt: string }[];
};

function buildEmptyStateContent(
  coach: import("@/lib/coachStructuredAnalysis").CoachStructuredAnalysis,
  hasData: boolean
): EmptyStateContent {
  if (!hasData) {
    return {
      opening:
        "I don't have any logged sessions for you yet. Once you start a workout I'll be able to read your training and answer with context. Until then, ask me anything general about programming, recovery, or how the app works.",
      chips: [
        {
          label: "What can you do once I have data?",
          prompt:
            "What kinds of questions can you answer once I have logged a few workouts?",
        },
        {
          label: "How should I structure my first week?",
          prompt:
            "How should I structure my first week of training so you have something useful to read?",
        },
        { label: "How does logging work?", prompt: "Walk me through how logging works in this app." },
      ],
    };
  }

  const ex = coach.keyFocusExercise;
  const opening =
    coach.keyFocus ??
    "Your training is moving cleanly right now. Ask me anything about your last sessions.";

  switch (coach.keyFocusType) {
    case "plateau":
      return {
        opening,
        chips: [
          {
            label: ex ? `Why is ${ex} stalling?` : "Why is this stalling?",
            prompt: ex
              ? `Why is ${ex} stalling, and what should I change?`
              : "Walk me through what's stalling and what to change.",
          },
          {
            label: "Show me the data",
            prompt: "Show me the specific sets and trend behind the stall you flagged.",
          },
          {
            label: "What should I do next session?",
            prompt: "Give me a concrete change for next session.",
          },
        ],
      };
    case "declining":
      return {
        opening,
        chips: [
          {
            label: ex ? `Why is ${ex} dropping?` : "Why is this dropping?",
            prompt: ex
              ? `Why is ${ex} declining, and what should I do about it?`
              : "Walk me through what's declining and what to do.",
          },
          {
            label: "Should I deload?",
            prompt: "Based on what you're seeing in my data, do I need a deload?",
          },
          {
            label: "What should I do next session?",
            prompt: "Give me a concrete change for next session.",
          },
        ],
      };
    case "low-volume":
      return {
        opening,
        chips: [
          { label: "Where am I short?", prompt: "Where exactly is my weekly volume low?" },
          {
            label: "What should I add this week?",
            prompt: "What should I add this week to fix the volume gap?",
          },
          {
            label: "Show me the breakdown",
            prompt: "Show me my weekly volume by muscle group.",
          },
        ],
      };
    case "progressing":
      return {
        opening,
        chips: [
          { label: "What's working?", prompt: "Tell me what's working in my training right now." },
          {
            label: "How do I keep this momentum?",
            prompt: "How do I keep this momentum going?",
          },
          {
            label: "What should I focus on next?",
            prompt: "What should I focus on next?",
          },
        ],
      };
    default:
      return {
        opening,
        chips: [
          {
            label: "Read my last week",
            prompt: "Read my last 7 days of training and tell me what stands out.",
          },
          {
            label: "What's progressing?",
            prompt: "Which lifts are progressing and which look stagnant?",
          },
          {
            label: "Show my volume",
            prompt: "Show me my weekly volume by muscle group.",
          },
        ],
      };
  }
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

function AssistantPageInner() {
  const { unit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) setInput(decodeURIComponent(q));
  }, [searchParams]);
  const [isLoading, setIsLoading] = useState(false);
  const [useAssistantMemory, setUseAssistantMemory] = useState(false);
  const listEndRef = useRef<HTMLDivElement>(null);
  const activeExerciseTopicRef = useRef<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [exactThreadLoaded, setExactThreadLoaded] = useState(false);
  const threadRef = useRef<AssistantThread | null>(null);
  const activeProgrammeStateRef = useRef<PipelineActiveProgrammeState | null>(null);
  // Coach analysis for the empty-state opening + chip prompts (same source as the
  // home assistant card insight). Recomputes when workouts, focus, experience,
  // goal, or unit change. Empty-state-only — once the user starts a chat the
  // payload computes a fresh analysis per request via getAssistantReply.
  const [emptyStateWorkouts, setEmptyStateWorkouts] = useState<
    ReturnType<typeof getWorkoutHistory>
  >([]);
  useEffect(() => {
    setEmptyStateWorkouts(getWorkoutHistory());
    function onChange() {
      setEmptyStateWorkouts(getWorkoutHistory());
    }
    window.addEventListener("workoutHistoryChanged", onChange);
    return () => window.removeEventListener("workoutHistoryChanged", onChange);
  }, []);
  const emptyStateAnalysis = useMemo(() => {
    if (emptyStateWorkouts.length === 0) return EMPTY_COACH_STRUCTURED_ANALYSIS;
    try {
      return buildCoachStructuredAnalysis(emptyStateWorkouts, {
        focus,
        experienceLevel,
        goal,
        unit,
      });
    } catch {
      return EMPTY_COACH_STRUCTURED_ANALYSIS;
    }
  }, [emptyStateWorkouts, focus, experienceLevel, goal, unit]);
  const emptyState = useMemo(
    () =>
      buildEmptyStateContent(emptyStateAnalysis, emptyStateWorkouts.length > 0),
    [emptyStateAnalysis, emptyStateWorkouts.length]
  );

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
          userMemory: loadMemory(),
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

  /**
   * Posts the current conversation (`msgs`) to /api/assistant/extract-memory
   * and merges any returned facts into the persistent USER MEMORY store.
   * No-op when the conversation is empty. Best-effort: errors are swallowed so
   * a failed extraction never blocks New Chat or daily auto-trigger.
   */
  async function extractAndSaveMemoryFromMessages(
    msgs: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<void> {
    const conversation = msgs
      .filter((m) => typeof m.content === "string" && m.content.trim().length > 0)
      .map((m) => ({ role: m.role, content: m.content }));
    if (conversation.length === 0) return;
    try {
      const res = await fetch("/api/assistant/extract-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { facts?: ExtractedMemoryFact[] };
      if (data && Array.isArray(data.facts) && data.facts.length > 0) {
        saveMemory(data.facts);
        if (process.env.NODE_ENV === "development") {
          console.log("[memory-extraction] saved", data.facts.length, "facts");
        }
      }
    } catch (e) {
      console.log("[memory-extraction] failed", e);
    }
  }

  // Daily auto-trigger: on first open of a new day with a non-empty thread
  // already in storage, distil the previous conversation into USER MEMORY and
  // start fresh. Idempotent within a day via localStorage["assistantLastChatDate"].
  useEffect(() => {
    if (typeof window === "undefined") return;
    const todayKey = new Date().toISOString().slice(0, 10);
    let lastDate: string | null = null;
    try {
      lastDate = window.localStorage.getItem("assistantLastChatDate");
    } catch {
      /* ignore */
    }
    if (lastDate === todayKey) return;

    // Read the persisted thread directly so this fires before message state hydrates.
    let staleMessages: Array<{ role: "user" | "assistant"; content: string }> = [];
    try {
      const loaded = loadActiveThread();
      staleMessages = loaded.thread.messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
    } catch {
      /* no thread yet */
    }

    const hasContent = staleMessages.some(
      (m) => typeof m.content === "string" && m.content.trim().length > 0
    );

    if (hasContent) {
      void extractAndSaveMemoryFromMessages(staleMessages).then(() => {
        const result = createNewChatThread();
        activeExerciseTopicRef.current = null;
        activeProgrammeStateRef.current = null;
        threadRef.current = result.thread;
        setActiveThreadId(result.threadId);
        setExactThreadLoaded(result.exactThreadLoaded);
        setMessages([]);
      });
    }

    try {
      window.localStorage.setItem("assistantLastChatDate", todayKey);
    } catch {
      /* ignore */
    }
    // Run once per mount; relying on stable function refs is fine here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleNewChat() {
    if (isLoading) return;
    if (
      messages.length > 0 &&
      !window.confirm(
        "Start a new chat? Anything important from this conversation will be saved to memory. The chat itself clears."
      )
    ) {
      return;
    }
    if (messages.length > 0) {
      // Extract before the chat is cleared from state.
      await extractAndSaveMemoryFromMessages(
        messages.map((m) => ({ role: m.role, content: m.content }))
      );
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
    try {
      window.localStorage.setItem(
        "assistantLastChatDate",
        new Date().toISOString().slice(0, 10)
      );
    } catch {
      /* ignore */
    }
    if (process.env.NODE_ENV === "development") {
      console.log("[thread-debug] New Chat (UI)", {
        threadId: result.threadId,
        freshThread: result.createdNewThread,
        messageCount: 0,
        activeExerciseTopicReset: activeExerciseTopicRef.current,
      });
    }
  }

  const isEmpty = messages.length === 0;
  const sendDisabled = isLoading || !input.trim();

  return (
    <main className="min-h-screen bg-zinc-950 text-white relative pb-28 flex flex-col">
      {/* Top warmth — mirrors the home screen radial glow for surface continuity. */}
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_85%_38%_at_50%_-6%,rgba(0,229,176,0.10),transparent_58%)]"
        aria-hidden
      />
      {/* Subtle bottom anchor so the empty state never feels marooned in flat dark. */}
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_28%_at_50%_108%,rgba(0,229,176,0.045),transparent_60%)]"
        aria-hidden
      />
      <div className="relative mx-auto w-full max-w-2xl flex flex-col flex-1 min-h-0 px-5 sm:px-6">
        <header className="flex items-center justify-between gap-3 pt-4 pb-2">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-app-secondary hover:text-white transition-colors"
          >
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
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Home</span>
          </Link>
          <button
            type="button"
            onClick={handleNewChat}
            disabled={isLoading}
            aria-label="New chat"
            title="New chat"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-app-secondary hover:text-white hover:bg-white/[0.05] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <NewChatIcon />
          </button>
        </header>

        {isEmpty ? (
          <section
            className="flex-1 flex flex-col justify-center pb-4"
            aria-label="Assistant intro"
          >
            {/* Pulsing presence orb — the assistant signalling it's alive and listening. */}
            <span
              className="inline-flex h-9 w-9 items-center justify-center rounded-full mb-5 animate-assistant-presence"
              style={{
                background:
                  "radial-gradient(circle at 35% 30%, rgba(0,229,176,0.55) 0%, rgba(0,229,176,0.20) 55%, rgba(0,229,176,0.06) 100%)",
              }}
              aria-hidden
            />

            {/* Opening message — sits above a soft mint glow for ambient warmth. */}
            <div className="relative">
              <div
                className="pointer-events-none absolute -inset-x-6 -top-4 -bottom-6 rounded-[40%] opacity-90"
                style={{
                  background:
                    "radial-gradient(ellipse 70% 65% at 50% 50%, rgba(0,229,176,0.10) 0%, rgba(0,229,176,0.04) 38%, transparent 72%)",
                  filter: "blur(2px)",
                }}
                aria-hidden
              />
              <p
                className="relative text-[22px] sm:text-[24px] font-medium leading-[1.40] tracking-[-0.01em] text-white"
                style={{ textWrap: "pretty" }}
              >
                {emptyState.opening}
              </p>
            </div>

            {/* Inline-pill chips — wrap naturally to widths driven by their labels. */}
            <div className="mt-6 flex flex-wrap gap-1.5">
              {emptyState.chips.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => handleSend(c.prompt)}
                  disabled={isLoading}
                  className="rounded-full px-3 py-1.5 text-[12px] font-medium tracking-tight transition-colors duration-150 active:scale-[0.97] disabled:opacity-50"
                  style={{
                    background: "rgba(0,229,176,0.05)",
                    border: "1px solid rgba(0,229,176,0.22)",
                    color: "rgba(0,229,176,0.92)",
                  }}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section
            className="flex-1 overflow-y-auto -mx-1 px-1 py-4"
            aria-live="polite"
          >
            <ul className="space-y-5">
              {messages.map((m, i) => (
                <li
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {m.role === "user" ? (
                    /* User: subtle neutral-dark pill. Lets the assistant'\''s mint accent
                       carry the visual weight without two competing voices. */
                    <div
                      className="max-w-[85%] rounded-2xl rounded-br-md px-4 py-2.5 text-[15px] sm:text-base font-normal leading-[1.55] tracking-[0.005em] text-white whitespace-pre-wrap break-words"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                      }}
                    >
                      {m.content}
                    </div>
                  ) : (
                    /* Assistant: 2px low-opacity mint left rail + inset padding.
                       Not a bubble — just enough to signal "this is the AI speaking". */
                    <div
                      className="w-full max-w-[min(100%,36rem)] pl-4 border-l-2"
                      style={{ borderColor: "rgba(0,229,176,0.30)" }}
                    >
                      {m.programme ? (
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
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            {isLoading && (
              /* Typing indicator: three mint dots, anchored to the assistant rail
                 so it sits where the next assistant message will appear. */
              <div
                className="mt-5 inline-flex items-center gap-1.5 pl-4 border-l-2"
                style={{ borderColor: "rgba(0,229,176,0.30)" }}
                aria-label="Assistant is typing"
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full animate-assistant-typing-dot"
                  style={{ background: "rgba(0,229,176,0.85)", animationDelay: "0ms" }}
                />
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full animate-assistant-typing-dot"
                  style={{ background: "rgba(0,229,176,0.85)", animationDelay: "160ms" }}
                />
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full animate-assistant-typing-dot"
                  style={{ background: "rgba(0,229,176,0.85)", animationDelay: "320ms" }}
                />
              </div>
            )}
            <div ref={listEndRef} />
          </section>
        )}

        <div className="pt-3 pb-1">
          <div
            className="flex items-center gap-2 rounded-full pl-4 pr-1.5 py-1.5 transition-all duration-200 focus-within:border-[color:var(--color-accent)]/45 focus-within:bg-zinc-900/80 focus-within:shadow-[0_0_0_4px_rgba(0,229,176,0.10),0_0_22px_-4px_rgba(0,229,176,0.30)]"
            style={{
              background: "rgba(255,255,255,0.025)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
              placeholder="Ask about your training…"
              disabled={isLoading}
              className="flex-1 min-w-0 bg-transparent border-0 outline-none text-[15px] font-normal leading-[1.5] tracking-[0.005em] text-white placeholder:text-app-meta py-2 disabled:opacity-50"
              aria-label="Message"
            />
            <button
              type="button"
              onClick={() => handleSend()}
              disabled={sendDisabled}
              aria-label="Send message"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-150 active:scale-95 disabled:cursor-not-allowed"
              style={{
                background: sendDisabled
                  ? "rgba(255,255,255,0.06)"
                  : "#00e5b0",
                color: sendDisabled
                  ? "rgba(140,200,196,0.55)"
                  : "var(--color-accent-foreground)",
                boxShadow: sendDisabled
                  ? undefined
                  : "0 6px 18px -8px rgba(0,229,176,0.55)",
              }}
            >
              <SendArrowIcon />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function AssistantPage() {
  return (
    <Suspense fallback={null}>
      <AssistantPageInner />
    </Suspense>
  );
}
