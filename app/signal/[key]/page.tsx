"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useRouter, notFound } from "next/navigation";
import {
  getWorkoutHistory,
  getWorkoutsFromLast7Days,
  getVolumeByMuscleGroup,
  getExerciseInsights,
  getMuscleGroupForExercise,
  type RecentPerformance,
  type ExerciseInsights,
} from "@/lib/trainingAnalysis";
import { getUniqueExerciseNames } from "@/lib/trainingMetrics";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal } from "@/lib/priorityGoal";
import {
  buildCoachStructuredAnalysis,
  EMPTY_COACH_STRUCTURED_ANALYSIS,
  type CoachStructuredAnalysis,
} from "@/lib/coachStructuredAnalysis";
import { countCompletedLoggedSets } from "@/lib/completedSets";

type SignalKey = "plateau" | "volume" | "progress";
type SignalState = "good" | "watch" | "attention" | "unknown";

const STATE_COLOR: Record<
  SignalState,
  {
    stroke: string;
    iconBg: string;
    iconBorder: string;
    statusText: string;
    statusBg: string;
    statusBorder: string;
    chartLine: string;
    chartFill: string;
  }
> = {
  good: {
    stroke: "#00e5b0",
    iconBg: "rgba(0,229,176,0.10)",
    iconBorder: "rgba(0,229,176,0.30)",
    statusText: "#00e5b0",
    statusBg: "rgba(0,229,176,0.10)",
    statusBorder: "rgba(0,229,176,0.30)",
    chartLine: "#00e5b0",
    chartFill: "rgba(0,229,176,0.10)",
  },
  watch: {
    stroke: "#fbbf24",
    iconBg: "rgba(251,191,36,0.10)",
    iconBorder: "rgba(251,191,36,0.32)",
    statusText: "#fbbf24",
    statusBg: "rgba(251,191,36,0.10)",
    statusBorder: "rgba(251,191,36,0.32)",
    chartLine: "#fbbf24",
    chartFill: "rgba(251,191,36,0.10)",
  },
  attention: {
    stroke: "#fb7185",
    iconBg: "rgba(251,113,133,0.10)",
    iconBorder: "rgba(251,113,133,0.32)",
    statusText: "#fb7185",
    statusBg: "rgba(251,113,133,0.10)",
    statusBorder: "rgba(251,113,133,0.32)",
    chartLine: "#fb7185",
    chartFill: "rgba(251,113,133,0.10)",
  },
  unknown: {
    stroke: "rgba(140,200,196,0.50)",
    iconBg: "rgba(140,200,196,0.06)",
    iconBorder: "rgba(140,200,196,0.18)",
    statusText: "rgba(140,200,196,0.65)",
    statusBg: "rgba(140,200,196,0.05)",
    statusBorder: "rgba(140,200,196,0.16)",
    chartLine: "rgba(140,200,196,0.50)",
    chartFill: "rgba(140,200,196,0.06)",
  },
};

const SUBSCRIBE_NOOP = () => () => {};
function useIsHydrated(): boolean {
  return useSyncExternalStore(
    SUBSCRIBE_NOOP,
    () => true,
    () => false
  );
}

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

const ICONS: Record<SignalKey, React.ComponentType<{ color: string }>> = {
  plateau: PlateauIcon,
  volume: VolumeIcon,
  progress: ProgressIcon,
};

const LABEL: Record<SignalKey, string> = {
  plateau: "Plateau",
  volume: "Volume",
  progress: "Progress",
};

type DetailContent = {
  state: SignalState;
  status: string;
  explanation: string;
  prompt: string;
  chart: React.ReactNode;
};

function pickMostTrackedExercise(
  workouts: ReturnType<typeof getWorkoutHistory>,
  preferred: string[] = []
): { name: string; insights: ExerciseInsights } | null {
  const names = getUniqueExerciseNames(workouts);
  if (names.length === 0) return null;
  const ordered = [
    ...preferred.filter((p) => names.some((n) => n.toLowerCase().includes(p.toLowerCase()))),
    ...names,
  ];
  let best: { name: string; insights: ExerciseInsights } | null = null;
  for (const candidate of ordered) {
    const matched = names.find((n) => n.toLowerCase().includes(candidate.toLowerCase())) ?? candidate;
    const insights = getExerciseInsights(workouts, matched, { maxSessions: 8 });
    if (insights.sessionsTracked > 0) {
      if (!best || insights.sessionsTracked > best.insights.sessionsTracked) {
        best = { name: matched, insights };
      }
    }
    if (best && best.insights.sessionsTracked >= 5) break;
  }
  return best;
}

function formatDateLabel(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function LineChart({
  performances,
  state,
  unit,
  valueKey = "weight",
  caption,
}: {
  performances: RecentPerformance[];
  state: SignalState;
  unit: "kg" | "lb";
  valueKey?: "weight" | "e1rm";
  caption?: string;
}) {
  const c = STATE_COLOR[state];
  const W = 360;
  const H = 200;
  const padding = { l: 38, r: 16, t: 16, b: 30 };
  const innerW = W - padding.l - padding.r;
  const innerH = H - padding.t - padding.b;

  if (performances.length === 0) {
    return (
      <div
        className="rounded-2xl flex items-center justify-center"
        style={{
          background: "rgba(255,255,255,0.018)",
          border: "1px solid rgba(255,255,255,0.05)",
          height: H,
        }}
      >
        <p className="text-app-tertiary text-sm">No data to chart yet.</p>
      </div>
    );
  }

  const valueOf = (p: RecentPerformance) => (valueKey === "e1rm" ? p.e1rm : p.weight);
  const values = performances.map(valueOf);
  const minW = Math.min(...values);
  const maxW = Math.max(...values);
  const range = Math.max(1, maxW - minW);
  const yPad = range * 0.2;
  const yMin = Math.max(0, minW - yPad);
  const yMax = maxW + yPad;
  const yRange = Math.max(1, yMax - yMin);

  const points = performances.map((p, i) => {
    const x =
      padding.l +
      (performances.length === 1 ? innerW / 2 : (i / (performances.length - 1)) * innerW);
    const y = padding.t + innerH - ((valueOf(p) - yMin) / yRange) * innerH;
    return { x, y, ...p };
  });

  const lineD = points.map((pt, i) => (i === 0 ? "M" : "L") + ` ${pt.x} ${pt.y}`).join(" ");
  const areaD =
    `M ${points[0].x} ${padding.t + innerH} ` +
    points.map((pt) => `L ${pt.x} ${pt.y}`).join(" ") +
    ` L ${points[points.length - 1].x} ${padding.t + innerH} Z`;

  const yTicks = 3;
  const tickValues = Array.from({ length: yTicks }, (_, i) => yMin + (yRange * i) / (yTicks - 1));

  return (
    <div
      className="rounded-2xl px-3 py-3 sm:px-4 sm:py-4"
      style={{
        background: "rgba(255,255,255,0.018)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Weight in ${unit} across ${performances.length} sessions`}
      >
        {tickValues.map((v, i) => {
          const y = padding.t + innerH - ((v - yMin) / yRange) * innerH;
          return (
            <g key={i}>
              <line
                x1={padding.l}
                x2={W - padding.r}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
              />
              <text
                x={padding.l - 8}
                y={y + 3.5}
                fontSize="10"
                fill="rgba(140,200,196,0.55)"
                textAnchor="end"
              >
                {Math.round(v)}
              </text>
            </g>
          );
        })}

        <path d={areaD} fill={c.chartFill} />
        <path d={lineD} stroke={c.chartLine} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((pt, i) => (
          <circle key={i} cx={pt.x} cy={pt.y} r="3.5" fill={c.chartLine} />
        ))}

        {points.length > 0 && (
          <>
            <text
              x={points[0].x}
              y={H - 10}
              fontSize="10"
              fill="rgba(140,200,196,0.55)"
              textAnchor="start"
            >
              {formatDateLabel(points[0].completedAt)}
            </text>
            {points.length > 1 && (
              <text
                x={points[points.length - 1].x}
                y={H - 10}
                fontSize="10"
                fill="rgba(140,200,196,0.55)"
                textAnchor="end"
              >
                {formatDateLabel(points[points.length - 1].completedAt)}
              </text>
            )}
          </>
        )}
      </svg>
      <p className="mt-2 text-[11px] font-medium text-app-tertiary text-center">
        {caption ?? `${valueKey === "e1rm" ? "Estimated 1RM" : "Weight"} (${unit}) × session`}
      </p>
    </div>
  );
}

const VOLUME_GROUP_ORDER = ["chest", "back", "shoulders", "arms", "legs"] as const;
type MuscleGroup = (typeof VOLUME_GROUP_ORDER)[number];

type ProgressionState = "good" | "poor" | "unclear";
type VolumeStatus = "low" | "on-track" | "warning" | "excessive";

const MUSCLE_RANGES: Record<MuscleGroup, { min: number; max: number }> = {
  chest: { min: 10, max: 20 },
  back: { min: 12, max: 22 },
  shoulders: { min: 8, max: 18 },
  arms: { min: 12, max: 22 },
  legs: { min: 12, max: 24 },
};

const VOLUME_STATUS_TO_STATE: Record<VolumeStatus, SignalState> = {
  low: "attention",
  "on-track": "good",
  warning: "watch",
  excessive: "attention",
};

const VOLUME_STATUS_LABEL: Record<VolumeStatus, string> = {
  low: "Low",
  "on-track": "On track",
  warning: "Warning",
  excessive: "Excessive",
};

function getProgressionByMuscle(
  coach: CoachStructuredAnalysis
): Record<MuscleGroup, ProgressionState> {
  const out: Record<MuscleGroup, ProgressionState> = {
    chest: "unclear",
    back: "unclear",
    shoulders: "unclear",
    arms: "unclear",
    legs: "unclear",
  };

  const setState = (g: string | undefined | null, state: ProgressionState) => {
    if (!g) return;
    const key = g.toLowerCase() as MuscleGroup;
    if (!(key in out)) return;
    if (state === "poor") {
      out[key] = "poor";
    } else if (state === "good" && out[key] !== "poor") {
      out[key] = "good";
    }
  };

  if (coach.keyFocusType === "plateau" || coach.keyFocusType === "declining") {
    if (coach.keyFocusExercise) {
      setState(getMuscleGroupForExercise(coach.keyFocusExercise), "poor");
    }
    if (coach.keyFocusGroups) {
      for (const g of coach.keyFocusGroups) setState(g, "poor");
    }
  }

  if (coach.keyFocusType === "progressing" && coach.keyFocusExercise) {
    setState(getMuscleGroupForExercise(coach.keyFocusExercise), "good");
  }

  for (const text of coach.whatsGoingWell) {
    const cleaned = text.replace(/^\s*Early signal:\s*/i, "").trim();
    const match = cleaned.match(
      /^([A-Za-z][A-Za-z\s\-()'./]+?)\s+(?:is\s+)?(?:progressing|improving)\b/i
    );
    if (match) {
      const exName = match[1].trim();
      setState(getMuscleGroupForExercise(exName), "good");
    }
  }

  return out;
}

function classifyMuscleVolume(
  group: MuscleGroup,
  sets: number,
  progression: ProgressionState
): VolumeStatus {
  const range = MUSCLE_RANGES[group];
  if (sets < range.min) return "low";
  if (sets <= range.max) return "on-track";
  if (progression === "good") return "warning";
  return "excessive";
}

type VolumeBarRow = {
  group: MuscleGroup;
  sets: number;
  status: VolumeStatus;
  progression: ProgressionState;
};

function BarChart({ rows }: { rows: VolumeBarRow[] }) {
  const total = rows.reduce((sum, r) => sum + r.sets, 0);
  if (total === 0) {
    return (
      <div
        className="rounded-2xl flex items-center justify-center"
        style={{
          background: "rgba(255,255,255,0.018)",
          border: "1px solid rgba(255,255,255,0.05)",
          height: 200,
        }}
      >
        <p className="text-app-tertiary text-sm">No sets logged this week.</p>
      </div>
    );
  }
  const maxSets = Math.max(...rows.map((r) => r.sets), 12);
  return (
    <div
      className="rounded-2xl px-4 py-4"
      style={{
        background: "rgba(255,255,255,0.018)",
        border: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <ul className="space-y-3">
        {rows.map((r) => {
          const c = STATE_COLOR[VOLUME_STATUS_TO_STATE[r.status]];
          const widthPct = Math.max(2, (r.sets / maxSets) * 100);
          return (
            <li key={r.group} className="flex items-center gap-3">
              <span className="w-16 text-[12px] font-semibold uppercase tracking-wide text-app-secondary">
                {r.group}
              </span>
              <div
                className="flex-1 h-2.5 rounded-full overflow-hidden"
                style={{ background: "rgba(255,255,255,0.04)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${widthPct}%`,
                    background: c.chartLine,
                  }}
                />
              </div>
              <div className="flex flex-col items-end w-[72px]">
                <span
                  className="text-[12px] font-bold tabular-nums leading-tight"
                  style={{ color: c.statusText }}
                >
                  {r.sets} set{r.sets === 1 ? "" : "s"}
                </span>
                <span
                  className="text-[10px] font-semibold tracking-wide leading-tight"
                  style={{ color: c.statusText }}
                >
                  {VOLUME_STATUS_LABEL[r.status]}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1.5 justify-center border-t border-white/[0.05] pt-3">
        {(["low", "on-track", "warning", "excessive"] as const).map((s) => {
          const c = STATE_COLOR[VOLUME_STATUS_TO_STATE[s]];
          return (
            <span
              key={s}
              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-app-tertiary"
            >
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ background: c.chartLine }}
              />
              {VOLUME_STATUS_LABEL[s]}
            </span>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] font-medium text-app-tertiary text-center">
        Above-range bars are amber when the muscle is progressing, rose when it is stalling.
      </p>
    </div>
  );
}

function buildPlateauContent(
  coach: CoachStructuredAnalysis,
  workouts: ReturnType<typeof getWorkoutHistory>,
  unit: "kg" | "lb"
): DetailContent {
  if (workouts.length === 0) {
    return {
      state: "unknown",
      status: "No data yet",
      explanation:
        "The plateau indicator watches your tracked lifts for sessions where weight and reps stop moving. Log a few workouts and a trend will appear here.",
      prompt: "How does the plateau indicator decide a lift has stalled?",
      chart: <LineChart performances={[]} state="unknown" unit={unit} />,
    };
  }

  const isAttention =
    coach.keyFocusType === "plateau" || coach.keyFocusType === "declining";
  const isDeclining = coach.keyFocusType === "declining";
  const focusExerciseName = coach.keyFocusExercise;

  const exerciseChoice = focusExerciseName
    ? {
        name: focusExerciseName,
        insights: getExerciseInsights(workouts, focusExerciseName, { maxSessions: 8 }),
      }
    : pickMostTrackedExercise(workouts, ["bench", "squat", "deadlift"]);

  const performances = exerciseChoice?.insights.recentPerformances ?? [];
  const exerciseLabel = exerciseChoice?.name ?? "your tracked lift";

  if (isAttention) {
    return {
      state: "attention",
      status: "Detected",
      explanation: `${exerciseLabel} ${
        isDeclining ? "is trending down" : "hasn't moved"
      } across your last ${performances.length || "few"} session${
        performances.length === 1 ? "" : "s"
      }. The chart shows the working weight per session, so you can see the flat or falling line for yourself.`,
      prompt: `My plateau indicator is flagged on ${exerciseLabel}. Walk me through what's happening and what to change next session.`,
      chart: <LineChart performances={performances} state="attention" unit={unit} />,
    };
  }

  if (workouts.length < 3) {
    return {
      state: "unknown",
      status: "Early read",
      explanation: `Only ${workouts.length} session${
        workouts.length === 1 ? "" : "s"
      } logged so far. The chart below tracks ${exerciseLabel}; a few more sessions and the plateau read becomes meaningful.`,
      prompt: "I've only got a couple of sessions logged. How many do you need before plateau detection is reliable?",
      chart: <LineChart performances={performances} state="unknown" unit={unit} />,
    };
  }

  return {
    state: "good",
    status: "Clear",
    explanation: `No stalls in your tracked lifts right now. The chart shows ${exerciseLabel}, your most-tracked compound; the line should keep climbing or holding for the indicator to stay clear.`,
    prompt: "Plateau indicator is clear. Walk me through which of my lifts you're watching and what would tip it into a plateau read.",
    chart: <LineChart performances={performances} state="good" unit={unit} />,
  };
}

function buildVolumeContent(
  coach: CoachStructuredAnalysis,
  workouts: ReturnType<typeof getWorkoutHistory>
): DetailContent {
  const weeklyWorkouts = getWorkoutsFromLast7Days(workouts);
  const weeklyVolume = getVolumeByMuscleGroup(weeklyWorkouts);
  const totalSets = weeklyWorkouts.reduce(
    (sum, w) =>
      sum + (w.exercises?.reduce((s, ex) => s + countCompletedLoggedSets(ex.sets), 0) ?? 0),
    0
  );

  const progressionByMuscle = getProgressionByMuscle(coach);
  const rows: VolumeBarRow[] = VOLUME_GROUP_ORDER.map((g) => {
    const sets = weeklyVolume[g] ?? 0;
    return {
      group: g,
      sets,
      progression: progressionByMuscle[g],
      status: classifyMuscleVolume(g, sets, progressionByMuscle[g]),
    };
  });

  if (workouts.length === 0) {
    return {
      state: "unknown",
      status: "No data yet",
      explanation:
        "The volume indicator reads weekly sets per muscle group from your logged sessions. Log sets and the breakdown will appear below.",
      prompt: "Once I start logging, what does the weekly volume indicator track?",
      chart: <BarChart rows={rows} />,
    };
  }

  const lowEntries = coach.volumeBalance.filter((v) =>
    /\b(low|missing|light|behind|below|needs?\s+more)\b/i.test(v.summary)
  );

  const lowRows = rows.filter((r) => r.status === "low" && r.sets > 0);
  const excessiveRows = rows.filter((r) => r.status === "excessive");
  const warningRows = rows.filter((r) => r.status === "warning");

  if (excessiveRows.length > 0) {
    const groups = excessiveRows.map((r) => r.group).join(" and ");
    return {
      state: "attention",
      status: "Excessive",
      explanation: `${groups[0].toUpperCase()}${groups.slice(1)} weekly volume is above the productive range while progress is stalling or unclear. High volume only pays off when it shows up in the lifts; here it isn't.`,
      prompt: `My ${groups} volume is above range and progress is stalling. Walk me through what to drop.`,
      chart: <BarChart rows={rows} />,
    };
  }

  const isLowAttention =
    coach.keyFocusType === "low-volume" || lowEntries.length > 0 || lowRows.length > 0;

  if (isLowAttention) {
    const explanation =
      lowEntries.length > 0
        ? lowEntries[0].summary
        : lowRows.length > 0
          ? `${lowRows.map((r) => r.group).join(" and ")} weekly volume is below the productive range for hypertrophy. The breakdown below shows where you are.`
          : "Weekly volume is running low on at least one muscle group. The breakdown below shows where you are.";
    const lowGroupsText =
      lowEntries.length > 0
        ? lowEntries.map((v) => v.label.toLowerCase()).join(" and ")
        : lowRows.length > 0
          ? lowRows.map((r) => r.group).join(" and ")
          : "the flagged muscle group";
    return {
      state: "attention",
      status: "Running low",
      explanation,
      prompt: `Weekly volume looks light on ${lowGroupsText}. Walk me through where I'm short and what to add this week.`,
      chart: <BarChart rows={rows} />,
    };
  }

  if (warningRows.length > 0) {
    const groups = warningRows.map((r) => r.group).join(" and ");
    return {
      state: "watch",
      status: "Worth a look",
      explanation: `${groups[0].toUpperCase()}${groups.slice(1)} volume is above the productive range, but the lifts are still moving. Worth watching for fatigue, not yet a problem.`,
      prompt: `My ${groups} volume is above range but lifts are still progressing. Should I keep pushing or back off?`,
      chart: <BarChart rows={rows} />,
    };
  }

  if (coach.volumeBalance.length > 0) {
    return {
      state: "watch",
      status: "Worth a look",
      explanation: coach.volumeBalance[0].summary,
      prompt: "There are volume balance notes on my training this week. Walk me through them.",
      chart: <BarChart rows={rows} />,
    };
  }

  if (workouts.length < 3) {
    return {
      state: "unknown",
      status: "Early read",
      explanation: `Only ${workouts.length} session${
        workouts.length === 1 ? "" : "s"
      } logged. The breakdown below is what's there so far.`,
      prompt: "I've only got a few sessions in. What can you tell me about my volume so far?",
      chart: <BarChart rows={rows} />,
    };
  }

  return {
    state: "good",
    status: "On track",
    explanation:
      totalSets > 0
        ? `${totalSets} sets across ${weeklyWorkouts.length} session${
            weeklyWorkouts.length === 1 ? "" : "s"
          } this week, every muscle group inside its productive range. The breakdown is below.`
        : "Volume looks balanced across the muscle groups you train.",
    prompt: "My weekly volume looks balanced. Show me the by-muscle breakdown for this week.",
    chart: <BarChart rows={rows} />,
  };
}

type ExerciseTrendKind = "progressing" | "flat" | "declining" | "insufficient";

type ExerciseListItem = {
  name: string;
  frequency: number;
  trend: ExerciseTrendKind;
  trendChangePct: number | null;
  performances: RecentPerformance[];
  chartPerformances: RecentPerformance[];
};

const TREND_DAYS_FOR_CLASSIFICATION = 42;
const TREND_DAYS_FOR_CHART = 56;
const PROGRESSION_THRESHOLD = 0.025;

function classifyExerciseTrend(performances: RecentPerformance[]): {
  trend: ExerciseTrendKind;
  trendChangePct: number | null;
} {
  if (performances.length < 3) return { trend: "insufficient", trendChangePct: null };
  const first = performances[0].e1rm;
  const last = performances[performances.length - 1].e1rm;
  if (first <= 0) return { trend: "insufficient", trendChangePct: null };
  const ratio = last / first;
  const changePct = (ratio - 1) * 100;
  if (ratio >= 1 + PROGRESSION_THRESHOLD) return { trend: "progressing", trendChangePct: changePct };
  if (ratio <= 1 - PROGRESSION_THRESHOLD) return { trend: "declining", trendChangePct: changePct };
  return { trend: "flat", trendChangePct: changePct };
}

function buildExerciseList(
  workouts: ReturnType<typeof getWorkoutHistory>
): ExerciseListItem[] {
  const names = getUniqueExerciseNames(workouts);
  const now = Date.now();
  const trendCutoff = now - TREND_DAYS_FOR_CLASSIFICATION * 24 * 3600 * 1000;
  const chartCutoff = now - TREND_DAYS_FOR_CHART * 24 * 3600 * 1000;

  const items: ExerciseListItem[] = [];
  for (const name of names) {
    let frequency = 0;
    for (const w of workouts) {
      if ((w.exercises ?? []).some((ex) => ex.name === name)) frequency++;
    }
    if (frequency === 0) continue;

    const insights = getExerciseInsights(workouts, name, { maxSessions: 16 });
    const trendPerfs = insights.recentPerformances.filter(
      (p) => new Date(p.completedAt).getTime() >= trendCutoff
    );
    const chartPerfs = insights.recentPerformances.filter(
      (p) => new Date(p.completedAt).getTime() >= chartCutoff
    );
    const { trend, trendChangePct } = classifyExerciseTrend(trendPerfs);

    items.push({
      name,
      frequency,
      trend,
      trendChangePct,
      performances: trendPerfs,
      chartPerformances: chartPerfs,
    });
  }

  items.sort((a, b) => {
    if (b.frequency !== a.frequency) return b.frequency - a.frequency;
    return a.name.localeCompare(b.name);
  });
  return items;
}

const EXERCISE_TREND_STATE: Record<ExerciseTrendKind, SignalState> = {
  progressing: "good",
  flat: "watch",
  declining: "attention",
  insufficient: "unknown",
};

const EXERCISE_TREND_LABEL: Record<ExerciseTrendKind, string> = {
  progressing: "Progressing",
  flat: "Flat",
  declining: "Declining",
  insufficient: "Early",
};

function TrendArrowIcon({ trend, color }: { trend: ExerciseTrendKind; color: string }) {
  if (trend === "progressing") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[14px] w-[14px]" aria-hidden>
        <path d="M5 17l7-7 4 4 4-4" />
        <polyline points="15 10 20 10 20 15" />
      </svg>
    );
  }
  if (trend === "declining") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[14px] w-[14px]" aria-hidden>
        <path d="M5 7l7 7 4-4 4 4" />
        <polyline points="15 14 20 14 20 9" />
      </svg>
    );
  }
  if (trend === "flat") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[14px] w-[14px]" aria-hidden>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="16 8 20 12 16 16" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[14px] w-[14px]" aria-hidden>
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[16px] w-[16px]" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function getProgressPageHeader(
  coach: CoachStructuredAnalysis,
  workouts: ReturnType<typeof getWorkoutHistory>
): { state: SignalState; status: string } {
  if (workouts.length === 0) return { state: "unknown", status: "No data yet" };
  if (workouts.length < 3) return { state: "unknown", status: "Early read" };
  if (coach.keyFocusType === "declining") return { state: "attention", status: "Declining" };
  if (coach.whatsGoingWell.length > 0 || coach.keyFocusType === "progressing") {
    return { state: "good", status: "Improving" };
  }
  return { state: "watch", status: "Flat" };
}

function ProgressDetailView({
  workouts,
  unit,
  onAskAssistant,
}: {
  workouts: ReturnType<typeof getWorkoutHistory>;
  unit: "kg" | "lb";
  onAskAssistant: (prompt: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [userSelection, setUserSelection] = useState<string | null>(null);

  const exerciseList = useMemo(() => buildExerciseList(workouts), [workouts]);

  const selected: string | null = useMemo(() => {
    if (exerciseList.length === 0) return null;
    if (userSelection && exerciseList.some((e) => e.name === userSelection)) {
      return userSelection;
    }
    return exerciseList[0].name;
  }, [exerciseList, userSelection]);

  const selectedItem = useMemo(
    () => exerciseList.find((e) => e.name === selected) ?? null,
    [exerciseList, selected]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return exerciseList;
    return exerciseList.filter((e) => e.name.toLowerCase().includes(q));
  }, [exerciseList, search]);

  const cold = workouts.length < 3 || exerciseList.length === 0;

  function handleAsk() {
    if (!selectedItem) {
      onAskAssistant(
        "I'd like to talk about my progress trends. Where should we start?"
      );
      return;
    }
    const trendPhrase =
      selectedItem.trend === "progressing"
        ? `is progressing${
            selectedItem.trendChangePct !== null
              ? ` (estimated 1RM up about ${Math.abs(selectedItem.trendChangePct).toFixed(1)}%)`
              : ""
          }`
        : selectedItem.trend === "declining"
          ? `is declining${
              selectedItem.trendChangePct !== null
                ? ` (estimated 1RM down about ${Math.abs(selectedItem.trendChangePct).toFixed(1)}%)`
                : ""
            }`
          : selectedItem.trend === "flat"
            ? "is flat — estimated 1RM has barely moved"
            : "doesn't have enough recent data to read";
    const window =
      selectedItem.trend === "insufficient"
        ? `${selectedItem.frequency} session${selectedItem.frequency === 1 ? "" : "s"} logged total`
        : `over my last ${TREND_DAYS_FOR_CLASSIFICATION / 7}-week trend window`;
    onAskAssistant(
      `${selectedItem.name} ${trendPhrase} ${window}. Walk me through what's happening with this lift and what to do next session.`
    );
  }

  if (cold) {
    return (
      <>
        <section className="pt-2">
          <div
            className="rounded-2xl flex items-center justify-center text-center px-6"
            style={{
              background: "rgba(255,255,255,0.018)",
              border: "1px solid rgba(255,255,255,0.05)",
              minHeight: 220,
            }}
          >
            <p className="text-app-secondary text-[15px] font-semibold leading-snug max-w-[280px]">
              Log a few sessions to see your progress trends. Each lift gets its own read once you have at least three sessions for it.
            </p>
          </div>
        </section>
        <section className="pt-6">
          <button
            type="button"
            onClick={handleAsk}
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-4 text-[15px] font-bold tracking-tight transition-all duration-150 hover:brightness-110 active:translate-y-[1px] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/40"
            style={{
              background: "rgba(0,229,176,0.12)",
              border: "1px solid rgba(0,229,176,0.35)",
              color: "#7ff2cf",
            }}
          >
            <span>Ask the assistant about this</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[14px] w-[14px]" aria-hidden>
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </button>
        </section>
      </>
    );
  }

  const selectedState = selectedItem
    ? EXERCISE_TREND_STATE[selectedItem.trend]
    : "unknown";

  return (
    <>
      <section className="pt-1">
        <label className="relative block">
          <span className="sr-only">Search exercises</span>
          <span
            className="absolute inset-y-0 left-3 flex items-center text-home-tertiary pointer-events-none"
            aria-hidden
          >
            <SearchIcon />
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises..."
            className="input-app w-full pl-9 pr-3 py-3 text-[14px] font-medium"
          />
        </label>
      </section>

      <section
        className="pt-3"
        aria-labelledby="exercise-list-heading"
      >
        <h2 id="exercise-list-heading" className="sr-only">
          Exercises
        </h2>
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.018)",
            border: "1px solid rgba(255,255,255,0.05)",
            maxHeight: 256,
            overflowY: "auto",
          }}
        >
          {filtered.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-app-tertiary">
              No exercises match &ldquo;{search.trim()}&rdquo;.
            </p>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {filtered.map((item) => {
                const isSelected = item.name === selected;
                const trendState = EXERCISE_TREND_STATE[item.trend];
                const tc = STATE_COLOR[trendState];
                return (
                  <li key={item.name}>
                    <button
                      type="button"
                      onClick={() => setUserSelection(item.name)}
                      aria-pressed={isSelected}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors duration-150 hover:bg-white/[0.025] focus-visible:outline-none focus-visible:bg-white/[0.035]"
                      style={
                        isSelected
                          ? { background: "rgba(0,229,176,0.06)" }
                          : undefined
                      }
                    >
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-[14px] font-semibold tracking-tight leading-tight truncate"
                          style={{
                            color: isSelected
                              ? "rgba(255,255,255,0.96)"
                              : "rgba(240,250,248,0.92)",
                          }}
                        >
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium text-home-tertiary">
                          {item.frequency} session{item.frequency === 1 ? "" : "s"} logged
                        </p>
                      </div>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide shrink-0"
                        style={{
                          background: tc.statusBg,
                          border: `1px solid ${tc.statusBorder}`,
                          color: tc.statusText,
                        }}
                      >
                        <TrendArrowIcon trend={item.trend} color={tc.statusText} />
                        {EXERCISE_TREND_LABEL[item.trend]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {selectedItem && (
        <section className="pt-5" aria-labelledby="selected-chart-heading">
          <div className="flex items-baseline justify-between mb-2">
            <h3
              id="selected-chart-heading"
              className="text-[13px] font-bold tracking-tight text-white truncate"
            >
              {selectedItem.name}
            </h3>
            <span className="text-[11px] font-medium text-home-tertiary shrink-0 ml-2">
              Last 8 weeks
            </span>
          </div>
          <LineChart
            performances={selectedItem.chartPerformances}
            state={selectedState}
            unit={unit}
            valueKey="e1rm"
            caption={`Estimated 1RM (${unit}) per session`}
          />
        </section>
      )}

      <section className="pt-6">
        <button
          type="button"
          onClick={handleAsk}
          className="flex items-center justify-center gap-2 w-full rounded-2xl py-4 text-[15px] font-bold tracking-tight transition-all duration-150 hover:brightness-110 active:translate-y-[1px] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/40"
          style={{
            background: "rgba(0,229,176,0.12)",
            border: "1px solid rgba(0,229,176,0.35)",
            color: "#7ff2cf",
          }}
        >
          <span>
            {selectedItem
              ? `Ask the assistant about ${selectedItem.name}`
              : "Ask the assistant about this"}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[14px] w-[14px]" aria-hidden>
            <path d="M5 12h14" />
            <path d="M13 6l6 6-6 6" />
          </svg>
        </button>
      </section>
    </>
  );
}

export default function SignalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const rawKey = params?.key;
  const key = (Array.isArray(rawKey) ? rawKey[0] : rawKey) as SignalKey | undefined;

  const { unit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const [workouts, setWorkouts] = useState<ReturnType<typeof getWorkoutHistory>>([]);
  const hasMounted = useIsHydrated();

  useEffect(() => {
    function load() {
      setWorkouts(getWorkoutHistory());
    }
    load();
    window.addEventListener("workoutHistoryChanged", load);
    return () => window.removeEventListener("workoutHistoryChanged", load);
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

  if (key !== "plateau" && key !== "volume" && key !== "progress") {
    notFound();
  }

  const isProgress = key === "progress";

  const staticContent: DetailContent | null = useMemo(() => {
    if (isProgress) return null;
    if (key === "plateau") return buildPlateauContent(coachAnalysis, workouts, unit);
    return buildVolumeContent(coachAnalysis, workouts);
  }, [isProgress, key, coachAnalysis, workouts, unit]);

  const progressHeader = useMemo(
    () => (isProgress ? getProgressPageHeader(coachAnalysis, workouts) : null),
    [isProgress, coachAnalysis, workouts]
  );

  const headerState: SignalState = isProgress
    ? progressHeader!.state
    : staticContent!.state;
  const headerStatus: string = isProgress
    ? progressHeader!.status
    : staticContent!.status;

  const c = STATE_COLOR[headerState];
  const Icon = ICONS[key];

  function openAssistantWithPrompt(prompt: string) {
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

  function openAssistant() {
    if (staticContent) openAssistantWithPrompt(staticContent.prompt);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white relative pb-28">
      <div
        className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_85%_35%_at_50%_-5%,rgba(0,229,176,0.06),transparent_55%)]"
        aria-hidden
      />
      <div className="relative mx-auto max-w-2xl px-5 sm:px-6">
        <div className="pt-6 pb-1">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-app-secondary hover:text-white transition"
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
        </div>

        <header className="pt-5 pb-5">
          <div className="flex items-center gap-3">
            <span
              className="inline-flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{
                background: c.iconBg,
                border: `1px solid ${c.iconBorder}`,
              }}
              aria-hidden
            >
              <Icon color={c.stroke} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-home-tertiary">
                Signal
              </p>
              <h1 className="text-[26px] font-black tracking-tight text-white leading-tight">
                {LABEL[key]}
              </h1>
            </div>
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-bold tracking-wide"
              style={{
                background: c.statusBg,
                border: `1px solid ${c.statusBorder}`,
                color: c.statusText,
              }}
            >
              {headerStatus}
            </span>
          </div>
        </header>

        {isProgress ? (
          hasMounted ? (
            <ProgressDetailView
              workouts={workouts}
              unit={unit}
              onAskAssistant={openAssistantWithPrompt}
            />
          ) : (
            <div
              className="rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.018)",
                border: "1px solid rgba(255,255,255,0.05)",
                height: 320,
              }}
            />
          )
        ) : (
          <>
            {hasMounted ? staticContent!.chart : (
              <div
                className="rounded-2xl"
                style={{
                  background: "rgba(255,255,255,0.018)",
                  border: "1px solid rgba(255,255,255,0.05)",
                  height: 200,
                }}
              />
            )}

            <section className="pt-6">
              <p className="label-section mb-2">What this means</p>
              <p
                className="text-[16px] font-semibold leading-snug text-white"
                style={{ textWrap: "pretty" }}
              >
                {staticContent!.explanation}
              </p>
            </section>

            <section className="pt-8">
              <button
                type="button"
                onClick={openAssistant}
                className="flex items-center justify-center gap-2 w-full rounded-2xl py-4 text-[15px] font-bold tracking-tight transition-all duration-150 hover:brightness-110 active:translate-y-[1px] active:scale-[0.995] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent)]/40"
                style={{
                  background: "rgba(0,229,176,0.12)",
                  border: "1px solid rgba(0,229,176,0.35)",
                  color: "#7ff2cf",
                }}
              >
                <span>Ask the assistant about this</span>
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
            </section>
          </>
        )}
      </div>
    </main>
  );
}
