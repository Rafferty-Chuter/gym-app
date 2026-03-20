"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  getWorkoutHistory,
  getStats,
  getTrainingInsights,
  getExerciseInsights,
  type ExerciseInsights,
  type TrainingInsights,
} from "@/lib/trainingAnalysis";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal, PRIORITY_GOAL_OPTIONS, type PriorityGoal } from "@/lib/priorityGoal";

type CoachStructuredAnalysis = {
  keyFocus: string | null;
  keyFocusType: "plateau" | "declining" | "low-volume" | "progressing" | "none";
  keyFocusExercise?: string;
  keyFocusGroups?: string[];
  whatsGoingWell: string[];
  volumeBalance: {
    label: string;
    summary: string;
  }[];
  actionableSuggestions: string[];
};

const EMPTY_ANALYSIS: CoachStructuredAnalysis = {
  keyFocus: null,
  keyFocusType: "none",
  whatsGoingWell: [],
  volumeBalance: [],
  actionableSuggestions: [],
};

function getVolumeSummaries(
  weeklyVolume: Record<string, number>,
  options?: { suppressLowGroups?: string[] }
) {
  const labels: Record<string, string> = {
    chest: "Chest",
    back: "Back",
    legs: "Legs",
    shoulders: "Shoulders",
    arms: "Arms",
  };
  const rows = (["chest", "back", "legs", "shoulders", "arms"] as const).map((g) => {
    const sets = weeklyVolume[g] ?? 0;
    const status: "low" | "balanced" | "high" =
      sets < 8 ? "low" : sets <= 20 ? "balanced" : "high";
    return { group: labels[g], sets, status };
  });

  const suppressed = new Set((options?.suppressLowGroups ?? []).map((g) => g.toLowerCase()));
  const low = rows.filter(
    (r) => r.status === "low" && r.sets > 0 && !suppressed.has(r.group.toLowerCase())
  );
  const balanced = rows.filter((r) => r.status === "balanced");
  const high = rows.filter((r) => r.status === "high");

  const out: { label: string; summary: string }[] = [];

  const nonZeroGroups = rows.filter((r) => r.sets > 0);
  if (nonZeroGroups.length < 2) return [];

  // Add one high-signal comparison so the section feels "coach-like".
  const chestSets = weeklyVolume.chest ?? 0;
  const backSets = weeklyVolume.back ?? 0;
  if (chestSets > 0 && backSets > 0) {
    const diff = chestSets - backSets;
    if (Math.abs(diff) <= 3) {
      out.push({
        label: "Chest vs Back",
        summary: `Chest and back are close this week (${chestSets} vs ${backSets} sets).`,
      });
    } else if (diff > 0) {
      out.push({
        label: "Chest vs Back",
        summary: `Chest leads back by ${diff} sets (${chestSets} vs ${backSets}).`,
      });
    } else {
      out.push({
        label: "Chest vs Back",
        summary: `Back leads chest by ${Math.abs(diff)} sets (${backSets} vs ${chestSets}).`,
      });
    }
  } else {
    const topTwo = [...nonZeroGroups].sort((a, b) => b.sets - a.sets || a.group.localeCompare(b.group)).slice(0, 2);
    if (topTwo.length === 2) {
      out.push({
        label: "Balance snapshot",
        summary: `${topTwo[0].group} leads ${topTwo[1].group} (${topTwo[0].sets} vs ${topTwo[1].sets} sets).`,
      });
    }
  }

  // Reduce noise: if several groups are low, group them in one concise line.
  if (low.length >= 2) {
    out.push({
      label: "Low-volume areas",
      summary: `${low.map((r) => `${r.group} (${r.sets})`).join(", ")} are under target this week.`,
    });
  } else if (low.length === 1) {
    out.push({
      label: low[0].group,
      summary: `${low[0].group} is lagging (${low[0].sets} sets).`,
    });
  }

  // Keep concise, high-signal positives.
  if (balanced.length > 0) {
    const topBalanced = balanced
      .sort((a, b) => b.sets - a.sets || a.group.localeCompare(b.group))
      .slice(0, 2);
    for (const row of topBalanced) {
      out.push({
        label: row.group,
        summary: `${row.group} is steady (${row.sets} sets).`,
      });
    }
  }

  if (high.length > 0) {
    const topHigh = high
      .sort((a, b) => b.sets - a.sets || a.group.localeCompare(b.group))
      .slice(0, 1);
    for (const row of topHigh) {
      out.push({
        label: row.group,
        summary: `${row.group} is high (${row.sets} sets) this week.`,
      });
    }
  }

  return out.slice(0, 4);
}

function goalPrefix(goal: PriorityGoal) {
  switch (goal) {
    case "Increase Bench Press":
      return "For your bench press goal,";
    case "Increase Squat":
      return "For your squat goal,";
    case "Increase Deadlift":
      return "For your deadlift goal,";
    case "Build Chest":
      return "For your chest growth goal,";
    case "Build Back":
      return "For your back growth goal,";
    case "Build Overall Muscle":
      return "For your overall muscle growth goal,";
    case "Improve Overall Strength":
    default:
      return "For your overall strength goal,";
  }
}

function matchesGoalExercise(exerciseNameLower: string, goal: PriorityGoal): boolean {
  const hasAny = (keywords: string[]) => keywords.some((k) => exerciseNameLower.includes(k));

  if (goal === "Build Overall Muscle") return true;

  if (goal === "Increase Bench Press" || goal === "Build Chest") {
    return hasAny(["bench", "bench press", "incline", "chest press", "fly"]);
  }
  if (goal === "Increase Squat") {
    return hasAny(["squat", "front squat", "back squat"]);
  }
  if (goal === "Increase Deadlift") {
    return hasAny(["deadlift", "dead lift", "rdl"]);
  }
  if (goal === "Build Back") {
    return hasAny(["row", "pulldown", "pull up", "pull-up", "lat"]);
  }

  // Improve Overall Strength: prioritize SBD patterns
  return hasAny(["bench", "bench press", "squat", "deadlift", "dead lift"]);
}

function goalRelevantVolumeKeys(goal: PriorityGoal): Array<"chest" | "back" | "legs" | "shoulders" | "arms"> {
  if (goal === "Increase Bench Press" || goal === "Build Chest") return ["chest"];
  if (goal === "Increase Squat") return ["legs"];
  if (goal === "Increase Deadlift") return ["legs", "back"];
  if (goal === "Build Back") return ["back"];
  if (goal === "Build Overall Muscle") return ["chest", "back", "legs", "shoulders", "arms"];
  // Improve Overall Strength: bias towards compound movers
  return ["chest", "back", "legs"];
}

function labelKeyForGroupLabel(label: string): "chest" | "back" | "legs" | "shoulders" | "arms" {
  const n = label.trim().toLowerCase();
  if (n === "chest") return "chest";
  if (n === "back") return "back";
  if (n === "legs") return "legs";
  if (n === "shoulders") return "shoulders";
  return "arms";
}

function getActionSuggestions(
  insights: TrainingInsights,
  options?: {
    keyFocusType?: CoachStructuredAnalysis["keyFocusType"];
    keyFocusExercise?: string;
    keyFocusGroups?: string[];
    goal?: PriorityGoal;
    unit?: "kg" | "lb";
  }
): string[] {
  const out: string[] = [];
  const keyFocusType = options?.keyFocusType ?? "none";
  const keyFocusExercise = options?.keyFocusExercise ?? "";
  const keyFocusGroups = options?.keyFocusGroups ?? [];
  const goal = options?.goal ?? "Improve Overall Strength";
  const unit = options?.unit ?? "kg";
  const loadIncrement = unit === "kg" ? "2.5kg" : "5lb";

  // Positive progression continuation: pick the best goal-relevant progressing exercise.
  const continuationCandidate = insights.exerciseInsights
    .filter((i) => i.trend === "progressing")
    .filter((i) => matchesGoalExercise(i.exercise.toLowerCase(), goal))
    .filter((i) =>
      keyFocusExercise ? i.exercise.toLowerCase() !== keyFocusExercise.toLowerCase() : true
    )
    .sort((a, b) => b.sessionsTracked - a.sessionsTracked || a.exercise.localeCompare(b.exercise))[0];

  const continuationExercise = continuationCandidate?.exercise ?? keyFocusExercise ?? "";
  const shouldAddContinuation =
    Boolean(continuationExercise) &&
    (keyFocusType !== "progressing" ||
      !keyFocusExercise ||
      continuationExercise.toLowerCase() !== keyFocusExercise.toLowerCase());

  const accessories: Record<"chest" | "back" | "legs" | "shoulders" | "arms", string> = {
    chest:
      goal === "Increase Bench Press" ? "incline press or machine press" : "incline press or machine press",
    back: "rows or pulldowns",
    legs: "squat/hinge variations or leg press",
    shoulders: "overhead press or lateral raises",
    arms: "curls and triceps extensions",
  };

  // 1) Fix action (mirrors Key Focus)
  if (keyFocusType === "plateau" && keyFocusExercise) {
    out.push(`${keyFocusExercise}: next session, reduce load by ~5% and chase +1 rep on your top set.`);
  } else if (keyFocusType === "declining" && keyFocusExercise) {
    out.push(`${keyFocusExercise}: next session, drop load by ~2.5-5% and match your best reps before pushing again.`);
  } else if (keyFocusType === "low-volume" && keyFocusGroups.length > 0) {
    const labelMap: Record<string, "chest" | "back" | "legs" | "shoulders" | "arms"> = {
      Chest: "chest",
      Back: "back",
      Legs: "legs",
      Shoulders: "shoulders",
      Arms: "arms",
    };
    const groupKeys = keyFocusGroups
      .map((label) => labelMap[label] ?? labelKeyForGroupLabel(label))
      .filter(Boolean);

    const accessoriesBits = Array.from(new Set(groupKeys.map((k) => accessories[k])));

    const groupLabel = keyFocusGroups.map((g) => g.toLowerCase()).join(" and ");
    if (keyFocusGroups.length === 1) {
      out.push(
        `Next session, add 3–4 ${groupLabel} sets (${accessoriesBits.join(", ")}). Then add 2–3 more sets next workout.`
      );
    } else {
      out.push(
        `Next session, add 3–4 sets across ${groupLabel} (${accessoriesBits.join(", ")}). Then add 2–3 more sets next workout.`
      );
    }
  } else if (keyFocusType === "progressing" && keyFocusExercise) {
    out.push(
      `${keyFocusExercise}: keep momentum next session (+1 rep at the same load, or +${loadIncrement} if reps match).`
    );
  }

  // 2) Continuation action: keep the strongest win moving.
  if (shouldAddContinuation && continuationExercise) {
    out.push(
      `${continuationExercise}: next session, choose one progression lever (+1 rep at the same load, or +${loadIncrement} if reps match).`
    );
  }

  if (insights.frequency < 2) {
    out.push(
      `Next week: aim for 2+ sessions so your trend stays clear (use ${continuationExercise || "your main lifts"} as the marker).`
    );
  }

  return out.slice(0, 3);
}

function getKeyFocus(
  insights: TrainingInsights,
  goal: PriorityGoal
): {
  text: string | null;
  type: CoachStructuredAnalysis["keyFocusType"];
  exercise?: string;
  groups?: string[];
} {
  const relevantExercises = insights.exerciseInsights.filter((i) =>
    matchesGoalExercise(i.exercise.toLowerCase(), goal)
  );

  const plateauCandidates = relevantExercises
    .filter((i) => i.trend === "plateau")
    .sort((a, b) => b.sessionsTracked - a.sessionsTracked || a.exercise.localeCompare(b.exercise));
  const plateau = plateauCandidates[0];
  if (plateau) {
    return {
      text: `${goalPrefix(goal)} ${plateau.exercise} is plateauing. Next session: reduce load ~5% and chase +1 rep on your top set.`,
      type: "plateau",
      exercise: plateau.exercise,
    };
  }

  const decliningCandidates = relevantExercises
    .filter((i) => i.trend === "declining")
    .sort((a, b) => b.sessionsTracked - a.sessionsTracked || a.exercise.localeCompare(b.exercise));
  const declining = decliningCandidates[0];
  if (declining) {
    return {
      text: `${goalPrefix(goal)} ${declining.exercise} is trending down. Next session: drop load ~2.5-5% and match your best reps before pushing heavier.`,
      type: "declining",
      exercise: declining.exercise,
    };
  }

  const goalKeys = goalRelevantVolumeKeys(goal);
  const lowGroups = goalKeys
    .map((g) => [g, insights.weeklyVolume[g] ?? 0] as const)
    .filter(([, sets]) => sets > 0 && sets < 8)
    .sort((a, b) => a[1] - b[1]);
  if (lowGroups.length >= 2) {
    const labelMap: Record<string, string> = {
      chest: "Chest",
      back: "Back",
      legs: "Legs",
      shoulders: "Shoulders",
      arms: "Arms",
    };
    const top = lowGroups.slice(0, 2).map(([g]) => labelMap[g] ?? g);
    return {
      text: `${goalPrefix(goal)} ${top.join(" and ")} volume is your biggest gap this week. Next session: add 3–4 focused sets; then add 2–3 more sets next workout.`,
      type: "low-volume",
      groups: top,
    };
  }
  if (lowGroups.length === 1) {
    const [group, sets] = lowGroups[0];
    const labelMap: Record<string, string> = {
      chest: "Chest",
      back: "Back",
      legs: "Legs",
      shoulders: "Shoulders",
      arms: "Arms",
    };
    const label = labelMap[group] ?? group;
    return {
      text: `${goalPrefix(goal)} ${label} volume is low at ${sets} sets this week. Next session: add 3–4 focused sets for ${label}.`,
      type: "low-volume",
      groups: [label],
    };
  }

  const progressingCandidates = relevantExercises
    .filter((i) => i.trend === "progressing")
    .sort((a, b) => b.sessionsTracked - a.sessionsTracked || a.exercise.localeCompare(b.exercise));
  const progressing = progressingCandidates[0];
  if (progressing) {
    return {
      text: `${goalPrefix(goal)} ${progressing.exercise} is progressing well. Keep momentum with one small progression lever next session.`,
      type: "progressing",
      exercise: progressing.exercise,
    };
  }

  return { text: null, type: "none" };
}

function getWhatsGoingWell(
  insights: TrainingInsights,
  unit: "kg" | "lb",
  options?: { avoidExercise?: string; goal?: PriorityGoal }
): string[] {
  const avoidExercise = (options?.avoidExercise ?? "").toLowerCase();
  const goal = options?.goal ?? "Improve Overall Strength";
  const out: string[] = [];

  const progressing = insights.exerciseInsights
    .filter(
      (i) =>
        i.trend === "progressing" &&
        i.exercise.toLowerCase() !== avoidExercise &&
        matchesGoalExercise(i.exercise.toLowerCase(), goal)
    )
    .slice(0, 2);
  for (const p of progressing) {
    const first = p.recentPerformances[0];
    const last = p.recentPerformances[p.recentPerformances.length - 1];
    if (first && last) {
      const deltaW = last.weight - first.weight;
      const deltaR = last.reps - first.reps;
      const changeBits: string[] = [];
      if (deltaW > 0) changeBits.push(`+${deltaW}${unit}`);
      if (deltaR > 0) changeBits.push(`+${deltaR} rep${deltaR === 1 ? "" : "s"}`);
      const delta = changeBits.length ? changeBits.join(", ") : "steady load";
      out.push(`${p.exercise} is progressing (${delta} over ${p.sessionsTracked} sessions).`);
    } else {
      out.push(`${p.exercise} is progressing.`);
    }
  }

  return out.slice(0, 2);
}

function normalizeExerciseKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

function getUniqueExerciseNamesFromWorkouts(
  workouts: ReturnType<typeof getWorkoutHistory>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const w of workouts ?? []) {
    for (const ex of w.exercises ?? []) {
      const label = ex.name?.trim();
      if (!label) continue;
      const key = normalizeExerciseKey(label);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(label);
    }
  }
  return out;
}

export default function CoachPage() {
  const { unit, setUnit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal, setGoal } = usePriorityGoal();
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalExercises: 0,
    totalSets: 0,
  });
  const [analysis, setAnalysis] = useState<CoachStructuredAnalysis>(EMPTY_ANALYSIS);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    function refresh() {
      const workouts = getWorkoutHistory();
      setStats(getStats(workouts));
    }
    refresh();
    window.addEventListener("workoutHistoryChanged", refresh);
    return () => window.removeEventListener("workoutHistoryChanged", refresh);
  }, []);

  async function handleAnalyze() {
    const allWorkouts = getWorkoutHistory();
    setIsLoading(true);
    try {
      if (allWorkouts.length === 0) {
        setAnalysis(EMPTY_ANALYSIS);
        return;
      }
      const insights = getTrainingInsights(allWorkouts);
      const exerciseNames = getUniqueExerciseNamesFromWorkouts(allWorkouts);
      const allExerciseInsights = exerciseNames
        .map((name) => getExerciseInsights(allWorkouts, name, { maxSessions: 5 }))
        .filter((i) => i.sessionsTracked > 0);
      const goalInsights: TrainingInsights = {
        ...insights,
        exerciseInsights: allExerciseInsights,
      };

      const keyFocus = getKeyFocus(goalInsights, goal);
      const whatsGoingWellWithUnit = getWhatsGoingWell(goalInsights, unit, {
        avoidExercise: keyFocus.exercise,
        goal,
      });

      const volumeBalance = getVolumeSummaries(insights.weeklyVolume ?? {}, {
        suppressLowGroups: keyFocus.type === "low-volume" ? keyFocus.groups : [],
      });

      const actionableSuggestions = getActionSuggestions(goalInsights, {
        keyFocusType: keyFocus.type,
        keyFocusExercise: keyFocus.exercise,
        keyFocusGroups: keyFocus.groups,
        goal,
        unit,
      });
      setAnalysis({
        keyFocus: keyFocus.text,
        keyFocusType: keyFocus.type,
        keyFocusExercise: keyFocus.exercise,
        keyFocusGroups: keyFocus.groups,
        whatsGoingWell: whatsGoingWellWithUnit,
        volumeBalance,
        actionableSuggestions,
      });
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-app-secondary hover:text-white transition-colors text-sm font-medium">
            ← Home
          </Link>
          <h1 className="text-3xl font-bold text-white">Coach</h1>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-teal-900/40 bg-zinc-900/70 p-0.5">
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`min-w-[2.25rem] rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    unit === u
                      ? "bg-teal-500/25 text-teal-100 shadow-sm shadow-teal-950/30"
                      : "text-app-tertiary hover:text-app-secondary"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-app-tertiary">Goal</span>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as PriorityGoal)}
                className="rounded-lg border border-teal-900/40 bg-zinc-900/70 px-2.5 py-1.5 text-[11px] font-medium text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                aria-label="Priority goal"
              >
                {PRIORITY_GOAL_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <section className="card-app mb-6">
          <h2 className="label-section mb-2">Your stats</h2>
          <ul className="space-y-2 text-app-secondary text-sm">
            <li>Total workouts logged: <span className="text-white font-medium">{stats.totalWorkouts}</span></li>
            <li>Total exercises logged: <span className="text-white font-medium">{stats.totalExercises}</span></li>
            <li>Total sets logged: <span className="text-white font-medium">{stats.totalSets}</span></li>
          </ul>
        </section>

        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="w-full py-3 rounded-xl btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Analyzing…" : "Analyze Recent Training"}
        </button>

        <div className="card-app mt-6">
          <h2 className="text-lg font-bold text-white mb-4">Analysis</h2>

          {analysis?.keyFocus && (
            <div className="mb-4 rounded-xl border border-teal-700/40 bg-teal-950/25 px-3.5 py-3">
              <h3 className="label-section mb-1.5">Key Focus</h3>
              <p className="text-sm text-app-secondary">{analysis.keyFocus}</p>
            </div>
          )}

          {analysis?.whatsGoingWell?.length > 0 && (
            <div className="mb-4">
              <h3 className="label-section mb-2">What&apos;s Going Well</h3>
              <ul className="space-y-2 text-app-secondary text-sm">
                {analysis.whatsGoingWell.map((item, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-emerald-900/30 bg-emerald-950/15 px-3 py-2.5"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis?.volumeBalance?.length > 0 && (
            <div className="mb-4">
              <h3 className="label-section mb-2">Volume &amp; Balance</h3>
              <ul className="space-y-2 text-app-secondary text-sm">
                {analysis?.volumeBalance?.map((item, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-teal-900/30 bg-zinc-900/45 px-3 py-2.5"
                  >
                    <p className="text-white font-medium">{item.label}</p>
                    <p className="mt-1 text-app-secondary">{item.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis?.actionableSuggestions?.length > 0 && (
            <div>
              <h3 className="label-section mb-2">Actionable Suggestions</h3>
              <ul className="space-y-2 text-app-secondary text-sm">
                {analysis?.actionableSuggestions?.map((item, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-teal-900/30 bg-zinc-900/45 px-3 py-2.5"
                  >
                    <span className="text-app-meta mr-2">{i + 1}.</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
