"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  getWorkoutHistory,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
} from "@/lib/trainingAnalysis";
import { hasActiveWorkout } from "@/lib/activeWorkout";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus, TRAINING_FOCUS_OPTIONS, type TrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel, EXPERIENCE_LEVEL_OPTIONS, type ExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal } from "@/lib/priorityGoal";
import {
  detectLimitingSupportMuscle,
  getGoalSupportProfile,
} from "@/lib/goalSupportProfiles";
import { EXERCISE_LIBRARY } from "@/lib/exerciseLibrary";
import {
  EMPTY_COACH_STRUCTURED_ANALYSIS,
  type CoachStructuredAnalysis,
} from "@/lib/coachStructuredAnalysis";

const TEMPLATES_STORAGE_KEY = "workoutTemplates";
const TEMPLATE_FOR_WORKOUT_KEY = "workoutFromTemplate";
const WORKOUT_SUGGESTED_MUSCLE_KEY = "workoutSuggestedMuscle";
type QuickTemplate = {
  id?: string;
  name: string;
  exercises: Array<{
    exerciseId?: string;
    name: string;
    targetSets?: number;
    restSec?: number;
  }>;
};

function readTemplateNames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t) => (t && typeof t === "object" && "name" in t ? String((t as { name: unknown }).name).trim() : ""))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function readTemplates(): QuickTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((t, i) => {
        if (!t || typeof t !== "object") return null;
        const obj = t as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name.trim() : `Template ${i + 1}`;
        const exercisesRaw = Array.isArray(obj.exercises) ? obj.exercises : [];
        const exercises = exercisesRaw
          .map((ex) => {
            if (!ex || typeof ex !== "object") return null;
            const e = ex as Record<string, unknown>;
            const exName = typeof e.name === "string" ? e.name.trim() : "";
            if (!exName) return null;
            return {
              ...(typeof e.exerciseId === "string" && e.exerciseId.trim()
                ? { exerciseId: e.exerciseId.trim() }
                : {}),
              name: exName,
              ...(Number.isFinite(Number(e.targetSets)) ? { targetSets: Number(e.targetSets) } : {}),
              ...(Number.isFinite(Number(e.restSec)) ? { restSec: Number(e.restSec) } : {}),
            };
          })
          .filter(Boolean) as QuickTemplate["exercises"];
        return {
          ...(typeof obj.id === "string" && obj.id.trim() ? { id: obj.id.trim() } : {}),
          name,
          exercises,
        };
      })
      .filter(Boolean) as QuickTemplate[];
  } catch {
    return [];
  }
}

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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={onClose}
    >
      <div
        className="rounded-2xl border border-teal-950/50 bg-zinc-900 p-6 w-full max-w-sm shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="profile-modal-title" className="text-lg font-bold text-white mb-4">
          Profile
        </h2>
        <p className="text-app-secondary text-sm mb-4">
          Edit your training preferences. Used to tailor advice across the app.
        </p>
        <div className="space-y-4">
          <div>
            <label className="label-section block mb-1.5">Training focus</label>
            <select
              value={focus}
              onChange={(e) => setFocus(e.target.value as TrainingFocus)}
              className="input-app w-full px-3 py-2.5 text-sm"
            >
              {TRAINING_FOCUS_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-section block mb-1.5">Experience level</label>
            <select
              value={experienceLevel}
              onChange={(e) => setExperienceLevel(e.target.value as ExperienceLevel)}
              className="input-app w-full px-3 py-2.5 text-sm"
            >
              {EXPERIENCE_LEVEL_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label-section block mb-1.5">Units</label>
            <div className="flex gap-2">
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition ${
                    unit === u
                      ? "border-teal-500/50 bg-teal-950/40 text-teal-100"
                      : "border-teal-900/40 bg-zinc-800/80 text-app-secondary hover:text-white"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="btn-secondary">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const pathname = usePathname();
  const { unit, setUnit } = useUnit();
  const { focus, setFocus } = useTrainingFocus();
  const { experienceLevel, setExperienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const [profileOpen, setProfileOpen] = useState(false);
  const [workouts, setWorkouts] = useState<ReturnType<typeof getWorkoutHistory>>([]);
  const [templates, setTemplates] = useState<QuickTemplate[]>([]);
  const [hasMounted, setHasMounted] = useState(false);
  const [hasActive, setHasActive] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<CoachStructuredAnalysis>(EMPTY_COACH_STRUCTURED_ANALYSIS);
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<number | null>(null);
  const [analyzedWorkoutCount, setAnalyzedWorkoutCount] = useState(0);
  const hasAnalysis =
    Boolean(analysis.keyFocus) ||
    analysis.actionableSuggestions.length > 0 ||
    (analysis.nextSessionAdjustmentPlan?.adjustments?.length ?? 0) > 0;

  useEffect(() => {
    setHasMounted(true);
  }, []);

  useEffect(() => {
    function load() {
      setWorkouts(getWorkoutHistory());
      setTemplates(readTemplates());
    }
    load();
    window.addEventListener("workoutHistoryChanged", load);
    return () => window.removeEventListener("workoutHistoryChanged", load);
  }, []);

  useEffect(() => {
    if (hasMounted && pathname === "/") setHasActive(hasActiveWorkout());
  }, [hasMounted, pathname]);

  const lastWorkout = useMemo(() => {
    if (!workouts.length) return null;
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    return sorted[0] ?? null;
  }, [workouts]);

  function workoutDisplayName(w: (typeof workouts)[number]) {
    const n = typeof w.name === "string" ? w.name.trim() : "";
    if (n) return n;
    const first = w.exercises?.[0]?.name?.trim?.() ? w.exercises[0].name.trim() : "";
    if (first) return `${first} Workout`;
    return "Workout";
  }

  function formatDateTime(isoString: string) {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  }

  function labelGroup(group: string) {
    const map: Record<string, string> = {
      chest: "Chest",
      back: "Back",
      legs: "Legs",
      shoulders: "Shoulders",
      arms: "Arms",
    };
    return map[group] ?? group;
  }

  function volumeLabel(sets: number): "Low" | "Moderate" | "High" {
    if (sets < 8) return "Low";
    if (sets <= 20) return "Moderate";
    return "High";
  }

  const lastWorkoutAgo = useMemo(() => {
    if (!lastWorkout) return null;
    const ms = Date.now() - new Date(lastWorkout.completedAt).getTime();
    if (!Number.isFinite(ms) || ms < 0) return null;
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days >= 1) return `${days}d ago`;
    if (hours >= 1) return `${hours}h ago`;
    return `${Math.max(0, minutes)}m ago`;
  }, [lastWorkout]);

  const thisWeek = useMemo(() => {
    const recent = getWorkoutsFromLast7Days(workouts);
    const weeklyVolume = getVolumeByMuscleGroup(recent);
    const workoutsCount = recent.length;
    const totalSets = recent.reduce(
      (sum, w) => sum + (w.exercises?.reduce((s, ex) => s + (ex.sets?.length ?? 0), 0) ?? 0),
      0
    );

    const entries = Object.entries(weeklyVolume).map(([group, sets]) => {
      const label = volumeLabel(sets);
      return { group, sets, label, text: `${labelGroup(group)} — ${label}` };
    });

    // Pick 2–3: the lowest, the highest, then a moderate (if distinct)
    const sortedAsc = [...entries].sort((a, b) => a.sets - b.sets);
    const sortedDesc = [...entries].sort((a, b) => b.sets - a.sets);
    const picked: string[] = [];
    if (sortedAsc[0]) picked.push(sortedAsc[0].text);
    if (sortedDesc[0] && sortedDesc[0].group !== sortedAsc[0]?.group) picked.push(sortedDesc[0].text);
    if (picked.length < 3) {
      const moderate = entries
        .filter((e) => e.label === "Moderate" && !picked.some((p) => p.startsWith(`${labelGroup(e.group)} —`)))
        .sort((a, b) => b.sets - a.sets)[0];
      if (moderate) picked.push(moderate.text);
    }

    return { workoutsCount, totalSets, volumeLabels: picked.slice(0, 3), weeklyVolume };
  }, [workouts]);

  function mapFocusToGoal(f: TrainingFocus): string {
    if (f === "Hypertrophy") return "Build Overall Muscle";
    if (f === "Powerlifting") return "Improve Overall Strength";
    if (f === "General Strength") return "Improve Overall Strength";
    return "Build Overall Muscle";
  }

  function getExerciseSuggestionsForMuscle(muscle: string): string[] {
    const key = muscle.trim().toLowerCase();
    if (!key) return [];
    return EXERCISE_LIBRARY.filter(
      (ex) =>
        ex.primaryMuscles.some((m) => m.toLowerCase().includes(key)) ||
        ex.secondaryMuscles.some((m) => m.toLowerCase().includes(key))
    )
      .map((ex) => ex.name)
      .slice(0, 3);
  }

  const coachInsight = useMemo(() => {
    if (
      analysis.keyFocus ||
      analysis.actionableSuggestions.length > 0 ||
      (analysis.nextSessionAdjustmentPlan?.adjustments?.length ?? 0) > 0
    ) {
      const main = analysis.keyFocus?.trim() || "Coach analysis is ready";
      const topSuggestion = analysis.actionableSuggestions[0]?.trim();
      const secondSuggestion = analysis.actionableSuggestions[1]?.trim();
      const whatToDo = [topSuggestion, secondSuggestion].filter(Boolean).join(" ");
      const howHardSource =
        analysis.nextSessionAdjustmentPlan?.adjustments
          ?.map((a) => a.instruction)
          .find((line) => /rir|failure|effort/i.test(line)) ??
        [topSuggestion, secondSuggestion].find((line) => /rir|failure|effort/i.test(line ?? ""));
      return {
        mainInsight: main,
        supportingData: `${thisWeek.workoutsCount} workouts · ${thisWeek.totalSets} sets in last 7 days.`,
        nextAction:
          analysis.nextSessionAdjustmentPlan?.title?.trim() ||
          topSuggestion ||
          "Run your next session with this focus.",
        whyItMatters: main,
        whatToDo: whatToDo || "Follow your next-session adjustment plan and reassess after 1-2 sessions.",
        ...(howHardSource ? { howHard: howHardSource } : {}),
      };
    }

    const goal = mapFocusToGoal(focus);
    const supportProfile = getGoalSupportProfile(goal);
    const supportGap = detectLimitingSupportMuscle({
      goal,
      volumeByMuscle: thisWeek.weeklyVolume ?? {},
    });
    const limiting = supportGap.limitingMuscle;
    const limitingSets =
      limiting && Number.isFinite(thisWeek.weeklyVolume?.[limiting])
        ? thisWeek.weeklyVolume[limiting]
        : 0;
    const minTarget = 8;
    const maxTarget = 12;
    const addSets = Math.max(2, Math.min(5, minTarget - limitingSets));
    const suggestions = limiting ? getExerciseSuggestionsForMuscle(limiting) : [];
    const suggestionPlan =
      suggestions.length >= 2
        ? `2 sets ${suggestions[0]}, then 2–3 sets ${suggestions[1]}`
        : suggestions.length === 1
          ? `3–4 sets ${suggestions[0]}`
          : "one stable compound plus one focused accessory";

    if (!limiting) {
      return {
        mainInsight: "Training balance looks steady",
        supportingData: `You logged ${thisWeek.workoutsCount} sessions and ${thisWeek.totalSets} sets this week.`,
        nextAction: "Add 2–3 quality sets to your priority lift today.",
        whyItMatters:
          supportProfile?.explanation ??
          "Consistent weekly exposure helps build momentum and keeps progress predictable.",
        whatToDo:
          "Start with your main lift, then add one support movement for 2–3 quality sets.",
        howHard:
          "Main lifts around 1–3 RIR, accessories around 1–2 RIR. Adjust one notch easier if recovery feels low.",
      };
    }

    const titleGroup = labelGroup(limiting);
    return {
      mainInsight: `${titleGroup} are undertrained`,
      supportingData: `${titleGroup}: ${limitingSets} vs ${minTarget}-${maxTarget} sets this week.`,
      nextAction: `Add ${addSets}–${addSets + 1} quality sets today.`,
      whyItMatters:
        `${supportGap.rationale ?? supportProfile?.explanation ?? `${titleGroup} support performance and weekly balance.`} This may limit overall hypertrophy progress if the gap stays open.`,
      whatToDo: `Use ${suggestionPlan}. Build toward ${minTarget}-${maxTarget} weekly sets for ${titleGroup.toLowerCase()}.`,
      howHard:
        "Compounds: ~2–3 RIR. Isolations: ~1–2 RIR. Keep most sets controlled and repeatable.",
    };
  }, [
    analysis.actionableSuggestions,
    analysis.keyFocus,
    analysis.nextSessionAdjustmentPlan,
    focus,
    thisWeek.totalSets,
    thisWeek.weeklyVolume,
    thisWeek.workoutsCount,
  ]);

  const hasNewWorkoutsSinceAnalysis = workouts.length > analyzedWorkoutCount;
  const analysisStatusText = hasNewWorkoutsSinceAnalysis
    ? "New workouts detected"
    : lastAnalyzedAt
      ? `Last analyzed: ${Math.max(0, Math.floor((Date.now() - lastAnalyzedAt) / (24 * 60 * 60 * 1000)))} day(s) ago`
      : "No analysis run yet";

  const coachReasoningEvidence = useMemo(() => {
    const entries = Object.entries(thisWeek.weeklyVolume ?? {}).sort((a, b) => a[1] - b[1]);
    const low = entries[0];
    const high = entries[entries.length - 1];
    if (!low || !high) return "Insufficient weekly volume data for a full comparison.";
    return `Volume spread this week: ${labelGroup(low[0])} ${low[1]} sets (lowest) vs ${labelGroup(high[0])} ${high[1]} sets (highest).`;
  }, [thisWeek.weeklyVolume]);

  const cardClass = "rounded-2xl border border-zinc-800/80 bg-zinc-900/92 p-5";

  function greeting() {
    const h = new Date().getHours();
    if (h < 5) return "Good night";
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  }

  const coachCardClass =
    "rounded-2xl border border-indigo-700/40 bg-gradient-to-br from-indigo-900/38 via-zinc-900/95 to-violet-900/28 p-6 shadow-[0_18px_42px_-16px_rgba(17,24,39,0.8),0_0_0_1px_rgba(99,102,241,0.14)]";

  const sectionCardClass = "rounded-2xl border border-zinc-800/80 bg-zinc-900/92 p-5";

  const ctaLabel = hasMounted && hasActive ? "Resume Workout" : "Start Workout";

  const heroMessage = useMemo(() => {
    const lowEntry = Object.entries(thisWeek.weeklyVolume ?? {}).sort((a, b) => a[1] - b[1])[0];
    if (hasActive) {
      return {
        title: "You’re in motion. Finish strong today.",
        subtitle: "Completing this session now locks in momentum and keeps your week on track.",
      };
    }
    if (lowEntry && lowEntry[1] < 8) {
      return {
        title: `${labelGroup(lowEntry[0])} volume is currently below target this week.`,
        subtitle: `Bringing volume balance back on track supports your ${goal.toLowerCase()} goal.`,
      };
    }
    if (lastWorkout) {
      return {
        title: "You’re building momentum this week.",
        subtitle: "Your recent sessions are giving better signals. Stack another strong session today.",
      };
    }
    if (thisWeek.workoutsCount > 0) {
      return {
        title: "You’re close to a strong training week.",
        subtitle: "One focused session today keeps consistency and progression moving.",
      };
    }
    return {
      title: "Start the week with intent.",
      subtitle: "Your coach can guide better once today’s session is logged.",
    };
  }, [goal, hasActive, lastWorkout, thisWeek.weeklyVolume, thisWeek.workoutsCount]);

  function askAssistant(question: string) {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("assistantQuickPrompt", question);
    }
    router.push("/assistant");
  }

  function startFromTemplate(template: QuickTemplate) {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({
        ...(template.id ? { templateId: template.id } : {}),
        templateName: template.name,
        exercises: template.exercises,
      })
    );
    router.push("/workout");
  }

  function repeatLastWorkout() {
    if (!lastWorkout || typeof window === "undefined") return;
    const repeatName = workoutDisplayName(lastWorkout);
    const exercises = (lastWorkout.exercises ?? []).map((ex) => ({
      ...(ex.exerciseId ? { exerciseId: ex.exerciseId } : {}),
      name: ex.name,
      targetSets: Math.max(1, ex.sets?.length ?? 3),
      restSec: typeof ex.restSec === "number" ? ex.restSec : 90,
    }));
    sessionStorage.setItem(
      TEMPLATE_FOR_WORKOUT_KEY,
      JSON.stringify({
        templateName: `${repeatName} (Repeat)`,
        exercises,
      })
    );
    router.push("/workout");
  }

  const weeklyNeed = useMemo(() => {
    const supportGap = detectLimitingSupportMuscle({
      goal: mapFocusToGoal(focus),
      volumeByMuscle: thisWeek.weeklyVolume ?? {},
    });
    const muscle = supportGap.limitingMuscle;
    if (!muscle) {
      return {
        headline: "Weekly balance is improving",
        detail: "Most muscle groups are in a workable range this week.",
      };
    }
    const currentSets = thisWeek.weeklyVolume?.[muscle] ?? 0;
    const minTarget = 8;
    const addSets = Math.max(2, Math.min(6, minTarget - currentSets));
    const readableMuscle = labelGroup(muscle);
    return {
      headline: `${readableMuscle} volume is below target`,
      detail: `Add about ${addSets}-${addSets + 1} quality sets over the next few sessions.`,
    };
  }, [focus, thisWeek.weeklyVolume]);

  const homeDataState = useMemo<
    "no_data" | "low_data" | "enough_data" | "strong_progress" | "imbalance"
  >(() => {
    if (workouts.length === 0) return "no_data";
    if (workouts.length < 3) return "low_data";
    if (/below target/i.test(weeklyNeed.headline)) return "imbalance";
    if (workouts.length >= 4) return "strong_progress";
    return "enough_data";
  }, [weeklyNeed.headline, workouts.length]);

  const analysisPreview = useMemo(() => {
    if (hasAnalysis) {
      const positive =
        analysis.keyFocus ??
        analysis.nextSessionAdjustmentPlan?.title ??
        `Consistency is decent: ${thisWeek.workoutsCount} workouts and ${thisWeek.totalSets} sets this week.`;
      const watch =
        analysis.actionableSuggestions[0] ??
        weeklyNeed.headline + ". " + weeklyNeed.detail;
      return { positive, watch };
    }
    if (homeDataState === "no_data") {
      return {
        positive: "No completed sessions yet - once you log one workout, Coach can start personalizing recommendations.",
        watch: "Current recommendation confidence is low until at least 2-3 sessions are logged.",
      };
    }
    if (homeDataState === "low_data") {
      return {
        positive: `You have ${thisWeek.workoutsCount} recent session${thisWeek.workoutsCount === 1 ? "" : "s"} logged - enough to start directional coaching.`,
        watch: "Recommendations are still provisional; confidence improves with a few more sessions.",
      };
    }
    return {
      positive: `You logged ${thisWeek.workoutsCount} workouts and ${thisWeek.totalSets} sets this week.`,
      watch: `${weeklyNeed.headline}. ${weeklyNeed.detail}`,
    };
  }, [
    homeDataState,
    analysis.actionableSuggestions,
    analysis.keyFocus,
    analysis.nextSessionAdjustmentPlan?.title,
    hasAnalysis,
    thisWeek.totalSets,
    thisWeek.workoutsCount,
    weeklyNeed.detail,
    weeklyNeed.headline,
  ]);

  const dynamicFeedback = useMemo(() => {
    const sorted = [...workouts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
    );
    const latest = sorted[0];
    const previous = sorted[1];
    if (!latest) return null;

    function repsByExercise(
      workout: (typeof workouts)[number]
    ): Record<string, { reps: number; label: string }> {
      return (workout.exercises ?? []).reduce<Record<string, { reps: number; label: string }>>((acc, ex) => {
        const key = (ex.exerciseId ?? ex.name ?? "").toLowerCase().trim();
        if (!key) return acc;
        const totalReps = (ex.sets ?? []).reduce((sum, s) => {
          const reps = Number(s.reps);
          return sum + (Number.isFinite(reps) ? reps : 0);
        }, 0);
        acc[key] = { reps: totalReps, label: ex.name };
        return acc;
      }, {});
    }

    let performanceLine = "Last session logged. Keep momentum rolling.";
    if (latest && previous) {
      const latestMap = repsByExercise(latest);
      const previousMap = repsByExercise(previous);
      const improved = Object.keys(latestMap)
        .map((key) => {
          const current = latestMap[key];
          const prior = previousMap[key];
          if (!prior) return null;
          const diff = current.reps - prior.reps;
          return diff > 0 ? { label: current.label, diff } : null;
        })
        .filter(Boolean) as Array<{ label: string; diff: number }>;
      if (improved[0]) {
        performanceLine = `Last session: ${improved[0].label} +${improved[0].diff} rep${improved[0].diff > 1 ? "s" : ""}.`;
      }
    }

    const uniqueDays = Array.from(
      new Set(
        sorted.map((w) => {
          const d = new Date(w.completedAt);
          return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        })
      )
    )
      .map((key) => new Date(key))
      .sort((a, b) => b.getTime() - a.getTime());

    let streak = 0;
    if (uniqueDays.length) {
      const today = new Date();
      const normalizedToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
      const first = uniqueDays[0].getTime();
      const startsYesterdayOrToday =
        first === normalizedToday || first === normalizedToday - 24 * 60 * 60 * 1000;
      if (startsYesterdayOrToday) {
        streak = 1;
        for (let i = 1; i < uniqueDays.length; i += 1) {
          const diffDays = Math.round(
            (uniqueDays[i - 1].getTime() - uniqueDays[i].getTime()) / (24 * 60 * 60 * 1000)
          );
          if (diffDays === 1) streak += 1;
          else break;
        }
      }
    }

    return {
      performanceLine,
      streakLine: streak > 1 ? `Training streak: ${streak} days.` : "Start a training streak this week.",
    };
  }, [workouts]);

  const momentumCue = useMemo(() => {
    if (homeDataState === "no_data") return "Log your first session to start building coaching momentum.";
    if (homeDataState === "low_data") return "Momentum is forming; one more session improves coaching confidence.";
    if (homeDataState === "strong_progress") return "Momentum has started this week.";
    if (homeDataState === "imbalance") return "Momentum is good - distribution is the next unlock.";
    return "Consistency is building this week.";
  }, [homeDataState]);

  function estimateTemplateMinutes(template: QuickTemplate) {
    const defaultRest = 90;
    const defaultSets = 3;
    const estimatedSeconds = template.exercises.reduce((sum, ex) => {
      const sets = Number.isFinite(ex.targetSets) ? Math.max(1, Number(ex.targetSets)) : defaultSets;
      const rest = Number.isFinite(ex.restSec) ? Math.max(30, Number(ex.restSec)) : defaultRest;
      // Rough per-set duration + rest.
      return sum + sets * (45 + rest);
    }, 0);
    const minutes = Math.round(estimatedSeconds / 60);
    return `${Math.max(20, minutes)} min`;
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white relative pb-28">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_90%_45%_at_50%_-8%,rgba(45,212,191,0.09),transparent_58%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-3xl px-6 py-8">
        <header className="mb-9">
          <p className="text-sm text-home-tertiary">{greeting()}</p>
          <h1 className="text-4xl font-bold tracking-tight mt-1.5 leading-tight text-white">{heroMessage.title}</h1>
          <p className="text-home-secondary mt-2 text-sm">{heroMessage.subtitle}</p>
          <p className="text-xs text-home-meta mt-1.5">{momentumCue}</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <div
              className="inline-flex items-center rounded-full border border-teal-900/40 bg-zinc-900/70 p-0.5"
              role="group"
              aria-label="Weight units"
            >
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`min-w-[2.25rem] rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    unit === u
                      ? "bg-teal-500/25 text-teal-100 shadow-sm shadow-teal-950/30"
                      : "text-home-tertiary hover:text-home-secondary"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-home-tertiary">Focus</span>
              <select
                value={focus}
                onChange={(e) => setFocus(e.target.value as typeof focus)}
                className="rounded-lg border border-teal-900/40 bg-zinc-900/70 px-2.5 py-1.5 text-[11px] font-medium text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                aria-label="Training focus"
              >
                {TRAINING_FOCUS_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
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
        </header>

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

        <div className="relative isolate mb-8 mt-2">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-28 -translate-y-1/2 opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 58% 75% at 50% 50%, rgba(52, 211, 153, 0.12) 0%, rgba(20, 184, 166, 0.06) 42%, transparent 68%)",
            }}
          />
          <Link
            href="/workout"
            className="relative z-10 block w-full rounded-2xl py-8 text-center text-lg font-bold tracking-tight text-white transition-all duration-150 ease-out will-change-transform overflow-hidden bg-gradient-to-br from-emerald-400 via-teal-500 to-teal-600 shadow-[0_4px_0_0_rgba(6,95,70,0.55),0_16px_44px_-8px_rgba(34,197,94,0.35),0_22px_50px_-12px_rgba(20,184,166,0.28),0_10px_32px_rgba(0,0,0,0.48)] ring-1 ring-emerald-200/20 hover:shadow-[0_4px_0_0_rgba(6,95,70,0.48),0_20px_52px_-6px_rgba(52,211,153,0.38),0_28px_60px_-14px_rgba(20,184,166,0.3),0_12px_36px_rgba(0,0,0,0.52)] hover:scale-[1.02] hover:brightness-[1.04] active:translate-y-[2px] active:scale-[0.99]"
          >
            {ctaLabel}
          </Link>
        </div>

        <section className={`${coachCardClass} mb-7`}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-indigo-200/70">Coach Insight</p>
            <span className="text-[11px] text-home-meta">{analysisStatusText}</span>
          </div>
          <div className="mt-3 rounded-xl border border-indigo-600/30 bg-indigo-950/24 p-5">
            <p className="text-xl font-extrabold tracking-tight text-indigo-50">
              {homeDataState === "low_data"
                ? "Coach recommendation is early but directional"
                : weeklyNeed.headline}
            </p>
            <p className="mt-1.5 text-sm text-indigo-100/90">
              {homeDataState === "low_data"
                ? "Keep logging this week so recommendations can move from directional to precise."
                : weeklyNeed.detail}
            </p>
            <p className="mt-2 text-xs text-indigo-200/80">
              {homeDataState === "no_data"
                ? "No completed training data yet - the coach will become specific after your first logged workout."
                : hasAnalysis
                ? coachReasoningEvidence
                : "This recommendation is based on current weekly volume and recent session patterns."}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link
                href={homeDataState === "no_data" ? "/coach" : "/coach/review"}
                className="rounded-xl border border-indigo-300/35 bg-gradient-to-br from-indigo-400 via-indigo-500 to-violet-600 px-3 py-2 text-center text-sm font-bold text-white shadow-[0_6px_20px_-10px_rgba(129,140,248,0.7)] transition hover:brightness-105 active:translate-y-[1px]"
              >
                {homeDataState === "no_data" ? "Open Coach Setup" : "Open Coach Review"}
              </Link>
              <Link
                href="/assistant"
                className="rounded-xl border border-indigo-700/35 bg-zinc-900/72 px-3 py-2 text-center text-sm font-semibold text-indigo-100/90 transition hover:bg-indigo-900/22 hover:border-indigo-500/35"
              >
                Ask the Coach
              </Link>
            </div>
          </div>
        </section>

        <section className={`${sectionCardClass} mb-6`}>
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-home-tertiary">Analysis Preview</p>
          <ul className="mt-3 space-y-2 text-sm">
            <li className="rounded-lg border border-emerald-900/25 bg-emerald-950/10 px-3 py-2">
              <span className="text-emerald-200/85 font-semibold mr-2">
                {homeDataState === "no_data" || homeDataState === "low_data" ? "Current signal:" : "Going well:"}
              </span>
              <span className="text-home-secondary">{analysisPreview.positive}</span>
            </li>
            <li className="rounded-lg border border-amber-900/30 bg-amber-950/10 px-3 py-2">
              <span className="text-amber-200/85 font-semibold mr-2">
                {homeDataState === "no_data" || homeDataState === "low_data"
                  ? "Confidence note:"
                  : "Needs attention:"}
              </span>
              <span className="text-home-secondary">{analysisPreview.watch}</span>
            </li>
          </ul>
          {dynamicFeedback && <p className="mt-2 text-xs text-home-meta">{dynamicFeedback.performanceLine}</p>}
        </section>

        <Link
          href="/history"
          className={`${sectionCardClass} mb-6 block text-left transition hover:border-teal-600/45 hover:bg-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/45 active:scale-[0.99]`}
          aria-label="Open workout history"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-home-tertiary">Recent Activity</p>
            <span className="shrink-0 text-xs font-semibold text-teal-300/90">View history →</span>
          </div>
          <p className="mt-2 text-sm text-home-secondary">
            {lastWorkout
              ? `Last logged: ${workoutDisplayName(lastWorkout)} · ${lastWorkoutAgo ?? "recently"}`
              : "No sessions logged yet. Start your first workout to build coaching momentum."}
          </p>
        </Link>
      </div>
    </main>
  );
}