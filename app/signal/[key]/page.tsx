"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams, useRouter, notFound } from "next/navigation";
import {
  getWorkoutHistory,
  getWorkoutsFromLast7Days,
  getExerciseInsights,
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
import { loadOnboardingProfile } from "@/lib/onboardingProfile";
import {
  ChartPointTooltip,
  chartPointAriaLabel,
  type ChartPointDetail,
} from "@/components/ChartPointTooltip";
import { computeNiceYAxis } from "@/lib/chartScale";
import {
  computePlateauStatus,
  computeProgressStatus,
  computeVolumeStatus,
} from "@/lib/signalStatus";
import {
  GROUP_LABEL,
  type MuscleGroup,
  type VolumeRow,
  type VolumeStatus,
} from "@/lib/volumeAnalysis";

/**
 * Comma + Oxford-and group list. Mirrors how people speak:
 *   1 → "Chest"
 *   2 → "Chest and Back"
 *   3+ → "Chest, Back, and Quads"
 */
function formatGroupList(labels: string[]): string {
  const items = labels.map((s) => s.trim()).filter(Boolean);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

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

/** Time window each signal is computed over — shown in the detail header. */
const SIGNAL_WINDOW_LABEL: Record<SignalKey, string> = {
  plateau: "Per lift · last 6 sessions",
  volume: "Last 7 days",
  progress: "Per lift · last 6 sessions",
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
  valueKey = "e1rm",
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

  // Tap-target sizing in SVG-units: viewBox is 360 wide and the rendered chart
  // is ~card-wide on mobile (~320 CSS px), so 1 SVG unit ≈ 0.9 CSS px. A 44pt
  // tap target → ~50 SVG units. We use 48 to be conservative.
  const TAP_TARGET = 48;

  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Dismiss on tap outside the chart card.
  useEffect(() => {
    if (activeIdx === null) return;
    function onDocPointerDown(e: PointerEvent) {
      const el = containerRef.current;
      if (!el) return;
      if (e.target instanceof Node && el.contains(e.target)) return;
      setActiveIdx(null);
    }
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [activeIdx]);

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
  const { yMin, yMax, ticks: tickValues } = computeNiceYAxis(values);
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

  const activeDetail: ChartPointDetail | null =
    activeIdx !== null && activeIdx >= 0 && activeIdx < points.length
      ? {
          completedAt: points[activeIdx].completedAt,
          heaviest: {
            weight: points[activeIdx].weight,
            reps: points[activeIdx].reps,
            e1rm: points[activeIdx].e1rm,
            ...(typeof points[activeIdx].rir === "number" ? { rir: points[activeIdx].rir } : {}),
          },
          allSets: points[activeIdx].allSets,
        }
      : null;

  return (
    <div
      ref={containerRef}
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
        aria-label={`${valueKey === "e1rm" ? "Estimated 1RM" : "Weight"} in ${unit} across ${performances.length} sessions`}
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
                {Number.isInteger(v) ? String(v) : v.toFixed(1)}
              </text>
            </g>
          );
        })}

        <path d={areaD} fill={c.chartFill} />
        <path d={lineD} stroke={c.chartLine} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        {points.map((pt, i) => {
          const isActive = activeIdx === i;
          const detail: ChartPointDetail = {
            completedAt: pt.completedAt,
            heaviest: {
              weight: pt.weight,
              reps: pt.reps,
              e1rm: pt.e1rm,
              ...(typeof pt.rir === "number" ? { rir: pt.rir } : {}),
            },
            allSets: pt.allSets,
          };
          return (
            <g key={i}>
              {/* Visible dot. */}
              <circle
                cx={pt.x}
                cy={pt.y}
                r={isActive ? 5 : 3.5}
                fill={c.chartLine}
                stroke={isActive ? "rgba(255,255,255,0.35)" : "none"}
                strokeWidth={isActive ? 1.5 : 0}
                pointerEvents="none"
              />
              {/* Invisible 44pt+ tap target. Adjacent rects can overlap on
                  dense charts; native SVG hit testing resolves to the topmost
                  (last-drawn) hit — good enough for sweaty-finger tapping. */}
              <rect
                x={pt.x - TAP_TARGET / 2}
                y={pt.y - TAP_TARGET / 2}
                width={TAP_TARGET}
                height={TAP_TARGET}
                fill="transparent"
                role="button"
                tabIndex={0}
                aria-label={chartPointAriaLabel(detail, unit)}
                style={{ cursor: "pointer", touchAction: "manipulation" }}
                onClick={() => setActiveIdx((cur) => (cur === i ? null : i))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setActiveIdx((cur) => (cur === i ? null : i));
                  }
                }}
              />
            </g>
          );
        })}

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
        {caption ?? `Estimated 1RM (${unit}) per session`}
      </p>
      {activeDetail && (
        <ChartPointTooltip
          detail={activeDetail}
          unit={unit}
          showE1RM={true}
          onClose={() => setActiveIdx(null)}
        />
      )}
    </div>
  );
}

// Per-muscle classification (MUSCLE_RANGES, classifyMuscleVolume, etc.) lives
// in lib/volumeAnalysis.ts so the home Volume card and this detail page
// classify identically. Local-only types below are presentation-specific.

const VOLUME_STATUS_TO_STATE: Record<VolumeStatus, SignalState> = {
  "not-tracked": "unknown",
  low: "attention",
  "on-track": "good",
  warning: "watch",
  excessive: "attention",
};

const VOLUME_STATUS_LABEL: Record<VolumeStatus, string> = {
  "not-tracked": "Not tracked",
  low: "Low",
  "on-track": "On track",
  warning: "Warning",
  excessive: "Excessive",
};

type VolumeBarRow = VolumeRow;

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
              <span className="w-20 text-[11px] font-semibold uppercase tracking-wide text-app-secondary">
                {GROUP_LABEL[r.group]}
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
  // Canonical state/status — must match the home Plateau card exactly.
  const { state, status } = computePlateauStatus(coach, workouts.length);

  if (workouts.length === 0) {
    return {
      state,
      status,
      explanation:
        "The plateau indicator watches your tracked lifts for sessions where weight and reps stop moving. Log a few workouts and a trend will appear here.",
      prompt: "How does the plateau indicator decide a lift has stalled?",
      chart: <LineChart performances={[]} state={state} unit={unit} />,
    };
  }

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

  if (status === "Detected") {
    const sessionCount = performances.length;
    const sessionWord = sessionCount === 1 ? "session" : "sessions";
    const latest = performances[performances.length - 1];
    const latestSetStr =
      latest && latest.weight > 0 ? `${latest.weight}${unit}×${latest.reps}` : null;
    let explanation: string;
    if (isDeclining) {
      explanation = `${exerciseLabel} is trending down across your last ${
        sessionCount || "few"
      } ${sessionWord}. The chart shows estimated 1RM per session, so you can see the falling line for yourself.`;
    } else if (sessionCount > 0 && latestSetStr) {
      // Flat plateau: e1RM hasn't moved meaningfully. Don't say "trending
      // down" on a flat line — describe the actual hold.
      explanation = `${exerciseLabel} has been flat at ${latestSetStr} for ${sessionCount} ${sessionWord}. The chart shows estimated 1RM per session — the line is holding rather than climbing.`;
    } else {
      explanation = `${exerciseLabel} hasn't moved across your recent sessions. The chart shows estimated 1RM per session, so you can see the flat line for yourself.`;
    }
    return {
      state,
      status,
      explanation,
      prompt: `My plateau indicator is flagged on ${exerciseLabel}. Walk me through what's happening and what to change next session.`,
      chart: <LineChart performances={performances} state={state} unit={unit} />,
    };
  }

  if (status === "Early read") {
    return {
      state,
      status,
      explanation: `Only ${workouts.length} session${
        workouts.length === 1 ? "" : "s"
      } logged so far. The chart below tracks ${exerciseLabel}; a few more sessions and the plateau read becomes meaningful.`,
      prompt: "I've only got a couple of sessions logged. How many do you need before plateau detection is reliable?",
      chart: <LineChart performances={performances} state={state} unit={unit} />,
    };
  }

  return {
    state,
    status,
    explanation: `No stalls in your tracked lifts right now. The chart shows ${exerciseLabel}, your most-tracked compound; the line should keep climbing or holding for the indicator to stay clear.`,
    prompt: "Plateau indicator is clear. Walk me through which of my lifts you're watching and what would tip it into a plateau read.",
    chart: <LineChart performances={performances} state={state} unit={unit} />,
  };
}

function buildVolumeContent(
  coach: CoachStructuredAnalysis,
  workouts: ReturnType<typeof getWorkoutHistory>
): DetailContent {
  const weeklyWorkouts = getWorkoutsFromLast7Days(workouts);
  const totalSets = weeklyWorkouts.reduce(
    (sum, w) =>
      sum + (w.exercises?.reduce((s, ex) => s + countCompletedLoggedSets(ex.sets), 0) ?? 0),
    0
  );

  // Canonical state/status/rows from the shared helper. MUST match the home Volume card.
  const { state, status, rows } = computeVolumeStatus(coach, workouts);

  if (workouts.length === 0) {
    return {
      state,
      status,
      explanation:
        "The volume indicator reads weekly sets per muscle group from your logged sessions. Log sets and the breakdown will appear below.",
      prompt: "Once I start logging, what does the weekly volume indicator track?",
      chart: <BarChart rows={rows} />,
    };
  }

  const lowEntries = coach.volumeBalance.filter((v) =>
    /\b(low|missing|light|behind|below|needs?\s+more)\b/i.test(v.summary)
  );
  const lowRows = rows.filter((r) => r.status === "low" && r.sets >= 0);
  const trackedRows = rows.filter((r) => r.status !== "not-tracked");
  const excessiveRows = rows.filter((r) => r.status === "excessive");
  const warningRows = rows.filter((r) => r.status === "warning");

  const joinGroups = (gs: MuscleGroup[]) => formatGroupList(gs.map((g) => GROUP_LABEL[g]));

  if (status === "Excessive") {
    const groupsLabel = joinGroups(excessiveRows.map((r) => r.group));
    const groupsLower = groupsLabel.toLowerCase();
    return {
      state,
      status,
      explanation: `${groupsLabel} weekly volume is above the productive range while progress is stalling or unclear. High volume only pays off when it shows up in the lifts; here it isn't.`,
      prompt: `My ${groupsLower} volume is above range and progress is stalling. Walk me through what to drop.`,
      chart: <BarChart rows={rows} />,
    };
  }

  if (status === "Running low") {
    // "Most muscles low" → at least 60% of the muscles the user actually trains
    // are flagged low. When that's true AND weekly session count is below the
    // user's typical, the volume reading is misleading — it's a frequency
    // story, not a programming story.
    const mostMusclesLow =
      trackedRows.length > 0 && lowRows.length / trackedRows.length >= 0.6;
    const onboarding = loadOnboardingProfile();
    const typicalDays =
      typeof onboarding?.daysPerWeek === "number" && onboarding.daysPerWeek >= 2
        ? onboarding.daysPerWeek
        : 3;
    // Default heuristic when no onboarding profile: ≤2 sessions = low.
    const isLowFrequencyWeek = weeklyWorkouts.length < Math.max(typicalDays - 1, 2);

    let explanation: string;
    if (mostMusclesLow && isLowFrequencyWeek) {
      const sessionWord = weeklyWorkouts.length === 1 ? "session" : "sessions";
      explanation = `Most muscles are below the productive volume range — but you've only logged ${weeklyWorkouts.length} ${sessionWord} this week. Volume will catch up with normal frequency.`;
    } else if (mostMusclesLow) {
      explanation =
        "Most muscles are below the productive volume range. Either training intensity is high enough that the lower volume is sufficient, or volume should come up — see the breakdown below.";
    } else if (lowEntries.length > 0) {
      explanation = lowEntries[0].summary;
    } else if (lowRows.length > 0) {
      explanation = `${joinGroups(lowRows.map((r) => r.group))} weekly volume is below the productive range for hypertrophy. The breakdown below shows where you are.`;
    } else {
      explanation = "Weekly volume is running low on at least one muscle group. The breakdown below shows where you are.";
    }

    const lowGroupsText =
      lowEntries.length > 0
        ? formatGroupList(lowEntries.map((v) => v.label)).toLowerCase()
        : lowRows.length > 0
          ? joinGroups(lowRows.map((r) => r.group)).toLowerCase()
          : "the flagged muscle group";
    return {
      state,
      status,
      explanation,
      prompt: `Weekly volume looks light on ${lowGroupsText}. Walk me through where I'm short and what to add this week.`,
      chart: <BarChart rows={rows} />,
    };
  }

  if (status === "Worth a look") {
    if (warningRows.length > 0) {
      const groupsLabel = joinGroups(warningRows.map((r) => r.group));
      const groupsLower = groupsLabel.toLowerCase();
      return {
        state,
        status,
        explanation: `${groupsLabel} volume is above the productive range, but the lifts are still moving. Worth watching for fatigue, not yet a problem.`,
        prompt: `My ${groupsLower} volume is above range but lifts are still progressing. Should I keep pushing or back off?`,
        chart: <BarChart rows={rows} />,
      };
    }
    return {
      state,
      status,
      explanation:
        coach.volumeBalance[0]?.summary ??
        "Some muscles are above range but lifts are still moving. Worth watching for fatigue.",
      prompt: "There are volume balance notes on my training this week. Walk me through them.",
      chart: <BarChart rows={rows} />,
    };
  }

  if (status === "Early read") {
    return {
      state,
      status,
      explanation: `Only ${workouts.length} session${
        workouts.length === 1 ? "" : "s"
      } logged. The breakdown below is what's there so far.`,
      prompt: "I've only got a few sessions in. What can you tell me about my volume so far?",
      chart: <BarChart rows={rows} />,
    };
  }

  return {
    state,
    status,
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
  _coach: CoachStructuredAnalysis,
  workouts: ReturnType<typeof getWorkoutHistory>
): { state: SignalState; status: string } {
  // Canonical state/status — must match the home Progress card exactly.
  const { state, status } = computeProgressStatus(workouts);
  return { state, status };
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
              <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-home-tertiary/80">
                {SIGNAL_WINDOW_LABEL[key]}
              </p>
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
