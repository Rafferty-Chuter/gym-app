"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  getWorkoutHistory,
  getWorkoutsFromLast7Days,
} from "@/lib/trainingAnalysis";
import { ACTIVE_WORKOUT_CHANGED_EVENT, hasActiveWorkout } from "@/lib/activeWorkout";
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
import { countCompletedLoggedSets } from "@/lib/completedSets";
import {
  computePlateauStatus,
  computeProgressStatus,
  computeVolumeStatus,
} from "@/lib/signalStatus";

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
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

type IndicatorState = "good" | "watch" | "attention" | "unknown";

type Indicator = {
  key: "plateau" | "volume" | "progress";
  label: string;
  state: IndicatorState;
  status: string;
  context: string;
  prompt: string;
};

/** What time window each Signal is computed over — shown under the label so users know what they're reading. */
const INDICATOR_WINDOW_LABEL: Record<Indicator["key"], string> = {
  plateau: "Per lift · last 6 sessions",
  volume: "Last 7 days",
  progress: "Per lift · last 6 sessions",
};

const STATE_COLOR: Record<
  IndicatorState,
  {
    stroke: string;
    iconBg: string;
    iconBorder: string;
    statusText: string;
    statusBg: string;
    statusBorder: string;
  }
> = {
  good: {
    stroke: "#00e5b0",
    iconBg: "rgba(0,229,176,0.10)",
    iconBorder: "rgba(0,229,176,0.30)",
    statusText: "#00e5b0",
    statusBg: "rgba(0,229,176,0.10)",
    statusBorder: "rgba(0,229,176,0.30)",
  },
  watch: {
    stroke: "#fbbf24",
    iconBg: "rgba(251,191,36,0.10)",
    iconBorder: "rgba(251,191,36,0.32)",
    statusText: "#fbbf24",
    statusBg: "rgba(251,191,36,0.10)",
    statusBorder: "rgba(251,191,36,0.32)",
  },
  attention: {
    stroke: "#fb7185",
    iconBg: "rgba(251,113,133,0.10)",
    iconBorder: "rgba(251,113,133,0.32)",
    statusText: "#fb7185",
    statusBg: "rgba(251,113,133,0.10)",
    statusBorder: "rgba(251,113,133,0.32)",
  },
  unknown: {
    stroke: "rgba(140,200,196,0.50)",
    iconBg: "rgba(140,200,196,0.06)",
    iconBorder: "rgba(140,200,196,0.18)",
    statusText: "rgba(140,200,196,0.65)",
    statusBg: "rgba(140,200,196,0.05)",
    statusBorder: "rgba(140,200,196,0.16)",
  },
};

function PlateauIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[22px] w-[22px]"
      aria-hidden
    >
      <path d="M3 18 L8 11 L16 11 L21 18" />
    </svg>
  );
}

function VolumeIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[22px] w-[22px]"
      aria-hidden
    >
      <line x1="6" y1="19" x2="6" y2="14" />
      <line x1="12" y1="19" x2="12" y2="9" />
      <line x1="18" y1="19" x2="18" y2="11" />
    </svg>
  );
}

function ProgressIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[22px] w-[22px]"
      aria-hidden
    >
      <path d="M3 17 L9 11 L13 14 L21 6" />
      <polyline points="15 6 21 6 21 12" />
    </svg>
  );
}

const INDICATOR_ICON: Record<Indicator["key"], React.ComponentType<{ color: string }>> = {
  plateau: PlateauIcon,
  volume: VolumeIcon,
  progress: ProgressIcon,
};

function trimToOneLine(text: string, maxLen: number): string {
  const first = text.split(/(?<=[.!?])\s+/)[0]?.trim() ?? text.trim();
  if (first.length <= maxLen) return first;
  return first.slice(0, maxLen - 1).trimEnd() + "…";
}

// Coarse coach group → detailed group fan-out, mirrored from /signal/[key]/page.tsx.
function buildIndicators(
  coach: CoachStructuredAnalysis,
  workouts: ReturnType<typeof getWorkoutHistory>,
  thisWeekTotalSets: number,
  thisWeekWorkoutsCount: number
): Indicator[] {
  const workoutsCount = workouts.length;
  const cold = workoutsCount === 0;

  // Plateau — canonical state/status from the shared helper; home picks its
  // own context/prompt copy off the resulting status string.
  const plateauStatus = computePlateauStatus(coach, workoutsCount);
  let plateauContext: string;
  let plateauPrompt: string;
  if (plateauStatus.status === "No data yet") {
    plateauContext = "Log a workout and I'll start watching your tracked lifts for stalls.";
    plateauPrompt = "Once I start logging, how does the plateau indicator decide a lift has stalled?";
  } else if (plateauStatus.status === "Detected") {
    const ex = coach.keyFocusExercise ?? "a key lift";
    const isDeclining = coach.keyFocusType === "declining";
    plateauContext = `${ex} ${isDeclining ? "is trending down" : "hasn't moved in your recent sessions"}.`;
    plateauPrompt = `My plateau indicator is flagged on ${ex}. Walk me through what's happening and what to change next session.`;
  } else if (plateauStatus.status === "Early read") {
    plateauContext = `Only ${workoutsCount} session${workoutsCount === 1 ? "" : "s"} logged. A few more and the trend reads cleanly.`;
    plateauPrompt = "I've only got a couple of sessions logged. How many do you need before plateau detection is reliable?";
  } else {
    plateauContext = "No stalls in your tracked lifts right now.";
    plateauPrompt = "Plateau indicator is clear. Walk me through which of my lifts you're watching and what would tip it.";
  }
  const plateau: Indicator = {
    key: "plateau",
    label: "Plateau",
    state: plateauStatus.state,
    status: plateauStatus.status,
    context: plateauContext,
    prompt: plateauPrompt,
  };

  // Volume — canonical from helper. Context line still pulls coach summaries
  // when available so the home card feels specific.
  const volumeStatus = computeVolumeStatus(coach, workouts);
  let volumeContext: string;
  let volumePrompt: string;
  const lowVolumeEntries = coach.volumeBalance.filter((v) =>
    /\b(low|missing|light|behind|below|needs?\s+more)\b/i.test(v.summary)
  );
  if (cold) {
    volumeContext = "Log sets and I'll read your weekly volume by muscle group.";
    volumePrompt = "Once I start logging, what does the weekly volume indicator track?";
  } else if (volumeStatus.status === "Excessive") {
    const excessiveGroups = volumeStatus.rows
      .filter((r) => r.status === "excessive")
      .map((r) => r.group.toLowerCase());
    const joined = excessiveGroups.join(" and ");
    volumeContext = joined
      ? `${joined[0].toUpperCase()}${joined.slice(1)} volume is above the productive range while progress is stalling.`
      : "Volume on at least one muscle group is above the productive range.";
    volumePrompt = joined
      ? `My ${joined} volume is above range. Walk me through what to drop.`
      : "My volume is above range on at least one muscle group. Walk me through what to drop.";
  } else if (volumeStatus.status === "Running low") {
    const lowGroups = volumeStatus.rows
      .filter((r) => r.status === "low")
      .map((r) => r.group.toLowerCase());
    const groupsJoined =
      lowVolumeEntries.length > 0
        ? lowVolumeEntries.map((v) => v.label.toLowerCase()).join(" and ")
        : lowGroups.join(" and ");
    volumeContext =
      lowVolumeEntries.length > 0
        ? trimToOneLine(lowVolumeEntries[0].summary, 120)
        : groupsJoined
          ? `${groupsJoined[0].toUpperCase()}${groupsJoined.slice(1)} weekly volume is below where it should be.`
          : "Weekly volume is running low for at least one muscle group.";
    volumePrompt = groupsJoined
      ? `Weekly volume looks light on ${groupsJoined}. Walk me through where I'm short and what to add this week.`
      : "My weekly volume is running low. Walk me through where I'm short and what to add this week.";
  } else if (volumeStatus.status === "Worth a look") {
    volumeContext =
      coach.volumeBalance.length > 0
        ? trimToOneLine(coach.volumeBalance[0].summary, 120)
        : "Some muscles are above range but lifts are still moving. Worth watching for fatigue.";
    volumePrompt = "There are volume balance notes on my training this week. Walk me through them.";
  } else if (volumeStatus.status === "Early read") {
    volumeContext = `Only ${workoutsCount} session${workoutsCount === 1 ? "" : "s"} logged. A few more and the weekly read becomes meaningful.`;
    volumePrompt = "I've only got a few sessions in. What can you tell me about my volume so far?";
  } else {
    volumeContext =
      thisWeekTotalSets > 0
        ? `${thisWeekTotalSets} sets across ${thisWeekWorkoutsCount} session${thisWeekWorkoutsCount === 1 ? "" : "s"} this week.`
        : "Balanced across muscle groups.";
    volumePrompt = "My weekly volume looks balanced. Show me the by-muscle breakdown for this week.";
  }
  const volume: Indicator = {
    key: "volume",
    label: "Volume",
    state: volumeStatus.state,
    status: volumeStatus.status,
    context: volumeContext,
    prompt: volumePrompt,
  };

  // Progress — canonical aggregate from the shared helper.
  const progressStatus = computeProgressStatus(workouts);
  let progressContext: string;
  let progressPrompt: string;
  if (progressStatus.status === "No data yet") {
    progressContext = "Log a workout and I'll start tracking what's moving and what's stuck.";
    progressPrompt = "Once I start logging, how does the progression indicator track which lifts are moving?";
  } else if (progressStatus.status === "Early read") {
    progressContext = `Only ${workoutsCount} session${workoutsCount === 1 ? "" : "s"} logged. A few more and the trend becomes readable.`;
    progressPrompt = "I've only got a couple of sessions logged. How many sessions per lift do you need before progression becomes readable?";
  } else if (progressStatus.status === "Limited data") {
    progressContext = "Not enough sessions per lift to read a trend yet.";
    progressPrompt = "I don't have enough logged sessions yet to read a trend. How many sessions per lift do you need?";
  } else if (progressStatus.status === "Improving") {
    progressContext = "Most of your tracked lifts are progressing on e1RM.";
    progressPrompt = "Progression is showing on my training. Walk me through which lifts are moving and how much.";
  } else if (progressStatus.status === "Declining") {
    progressContext = "Most of your tracked lifts are trending down on e1RM.";
    progressPrompt = "My progression looks like it's trending down. Walk me through which lifts are declining and what's likely behind it.";
  } else {
    progressContext = "Some lifts moving, some flat. No clear overall direction yet.";
    progressPrompt = "My progression is mixed across lifts. Walk me through which are moving, which are flat, and what to focus on.";
  }
  const progression: Indicator = {
    key: "progress",
    label: "Progress",
    state: progressStatus.state,
    status: progressStatus.status,
    context: progressContext,
    prompt: progressPrompt,
  };

  return [plateau, volume, progression];
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

function IndicatorTile({
  indicator,
  onTap,
}: {
  indicator: Indicator;
  onTap: () => void;
}) {
  const c = STATE_COLOR[indicator.state];
  const Icon = INDICATOR_ICON[indicator.key];
  const windowLabel = INDICATOR_WINDOW_LABEL[indicator.key];
  return (
    <button
      type="button"
      onClick={onTap}
      aria-label={`${indicator.label} (${windowLabel}) status: ${indicator.status}. ${indicator.context} Tap to open the ${indicator.label.toLowerCase()} detail.`}
      className="group flex h-full w-full flex-col items-start gap-2.5 rounded-2xl px-3 py-3 text-left transition-colors duration-150 hover:bg-white/[0.03] active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/40"
      style={{
        background: "rgba(255,255,255,0.018)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <span
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
        style={{
          background: c.iconBg,
          border: `1px solid ${c.iconBorder}`,
        }}
        aria-hidden
      >
        <Icon color={c.stroke} />
      </span>
      <div className="flex flex-col gap-1.5 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-home-tertiary">
          {indicator.label}
        </span>
        <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-home-tertiary/70 leading-tight">
          {windowLabel}
        </span>
        <span
          className="inline-flex items-center self-start rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide"
          style={{
            background: c.statusBg,
            border: `1px solid ${c.statusBorder}`,
            color: c.statusText,
          }}
        >
          {indicator.status}
        </span>
      </div>
    </button>
  );
}

const SUBSCRIBE_NOOP = () => () => {};
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    SUBSCRIBE_NOOP,
    () => true,
    () => false
  );
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

function IndicatorSkeleton() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="flex flex-col gap-3 rounded-2xl px-3.5 py-3.5"
          style={{
            background: "rgba(255,255,255,0.018)",
            border: "1px solid rgba(255,255,255,0.05)",
          }}
        >
          <div className="h-9 w-9 rounded-xl bg-white/[0.05]" />
          <div className="h-2.5 w-14 rounded bg-white/[0.06]" />
          <div className="h-4 w-16 rounded-full bg-white/[0.05]" />
        </div>
      ))}
    </div>
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

  const thisWeek = useMemo(() => {
    const recent = getWorkoutsFromLast7Days(workouts);
    const totalSets = recent.reduce(
      (sum, w) =>
        sum + (w.exercises?.reduce((s, ex) => s + countCompletedLoggedSets(ex.sets), 0) ?? 0),
      0
    );
    return { workoutsCount: recent.length, totalSets };
  }, [workouts]);

  const indicators = useMemo(
    () =>
      buildIndicators(
        coachAnalysis,
        workouts,
        thisWeek.totalSets,
        thisWeek.workoutsCount
      ),
    [coachAnalysis, workouts, thisWeek.totalSets, thisWeek.workoutsCount]
  );

  const insight = useMemo(
    () => buildAssistantInsight(coachAnalysis, workouts.length),
    [coachAnalysis, workouts.length]
  );

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
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_85%_35%_at_50%_-5%,rgba(0,229,176,0.08),transparent_55%)]"
        aria-hidden
      />

      <div className="relative mx-auto max-w-2xl px-5 sm:px-6">

        <div className="flex items-center justify-between gap-3 pt-4 pb-1">
          <div
            className="inline-flex items-center rounded-lg border border-white/8 bg-zinc-900/70 p-0.5"
            role="group"
            aria-label="Weight units"
          >
            {(["kg", "lb"] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className={`min-w-[2.25rem] rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                  unit === u
                    ? "bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]"
                    : "text-home-tertiary hover:text-home-secondary"
                }`}
              >
                {u}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-home-tertiary">Focus</span>
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value as typeof focus)}
                className="rounded-lg border border-white/8 bg-zinc-900/70 px-2 py-1.5 text-[11px] font-medium text-white focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]/40"
                aria-label="Training focus"
              >
                {TRAINING_FOCUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => setProfileOpen(true)}
              className="text-[11px] font-medium text-home-tertiary hover:text-home-secondary transition"
            >
              Profile
            </button>
          </div>
        </div>

        {hasMounted && profileSetupNeeded && (
          <Link
            href="/profile"
            className="mt-2 flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-[12px] transition-colors"
            style={{
              background: "rgba(0,229,176,0.06)",
              border: "1px solid rgba(0,229,176,0.22)",
              color: "rgba(0,229,176,0.95)",
            }}
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

        <section className="pt-3 pb-1">
          <Link
            href={ctaHref}
            aria-label={ctaLabel}
            className="block w-full rounded-2xl py-5 text-center text-xl font-black tracking-tight text-[color:var(--color-accent-foreground)] transition-all duration-150 hover:brightness-105 active:translate-y-[1px] active:scale-[0.995]"
            style={{
              background: "#00e5b0",
              boxShadow:
                "0 0 0 1px rgba(0,229,176,0.25), 0 14px 40px -10px rgba(0,229,176,0.50)",
            }}
          >
            {ctaLabel}
          </Link>
        </section>

        <section className="pt-5" aria-labelledby="assistant-insight-heading">
          <h2 id="assistant-insight-heading" className="sr-only">
            Assistant
          </h2>
          <article
            className="rounded-3xl p-4 sm:p-5 transition-all duration-200"
            style={{
              background:
                "linear-gradient(180deg, rgba(0,229,176,0.06) 0%, #0e1420 38%, #0e1420 100%)",
              border: "1px solid rgba(0,229,176,0.22)",
              boxShadow:
                "0 1px 0 0 rgba(255,255,255,0.04) inset, 0 14px 36px -14px rgba(0,229,176,0.22), 0 3px 10px rgba(0,0,0,0.45)",
            }}
          >
            <header className="flex items-center gap-2.5 mb-3">
              <span
                className="inline-flex h-7 w-7 items-center justify-center rounded-full"
                style={{
                  background: "rgba(0,229,176,0.12)",
                  border: "1px solid rgba(0,229,176,0.30)",
                }}
                aria-hidden
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#00e5b0"
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
                  {insight.cold ? "Cold start" : "From your training"}
                </p>
              </div>
            </header>

            <button
              type="button"
              onClick={() => openAssistantWith(insight.prompt)}
              className="block w-full text-left rounded-xl -mx-1 px-1 py-1 transition-colors duration-150 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/40"
              aria-label={`Ask the assistant about: ${insight.text}`}
            >
              <p
                className="text-[16px] sm:text-[17px] font-semibold leading-snug text-white"
                style={{ textWrap: "pretty" }}
              >
                {insight.text}
              </p>
            </button>

            <div className="mt-3 flex flex-wrap gap-2">
              {insight.followUps.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onClick={() => openAssistantWith(f.prompt)}
                  className="rounded-full px-3 py-1.5 text-[12px] font-semibold tracking-tight transition-colors duration-150 active:scale-[0.97]"
                  style={{
                    background: "rgba(0,229,176,0.06)",
                    border: "1px solid rgba(0,229,176,0.22)",
                    color: "rgba(0,229,176,0.95)",
                  }}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={openAssistantClean}
              aria-label="Open assistant with no preloaded message"
              className="mt-3.5 flex items-center justify-center gap-2 w-full rounded-2xl py-3 text-[14px] font-bold tracking-tight transition-all duration-150 hover:brightness-110 active:translate-y-[1px] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/40"
              style={{
                background: "rgba(0,229,176,0.12)",
                border: "1px solid rgba(0,229,176,0.35)",
                color: "#7ff2cf",
              }}
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

        <section className="pt-5 pb-2" aria-labelledby="status-row-heading">
          <h2 id="status-row-heading" className="label-section mb-2">
            Signals
          </h2>
          {hasMounted ? (
            <div className="grid grid-cols-3 gap-2">
              {indicators.map((ind) => (
                <IndicatorTile
                  key={ind.key}
                  indicator={ind}
                  onTap={() => router.push(`/signal/${ind.key}`)}
                />
              ))}
            </div>
          ) : (
            <IndicatorSkeleton />
          )}
        </section>

      </div>
    </main>
  );
}
