"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getExerciseInsights } from "@/lib/trainingAnalysis";
import { getUniqueExerciseNames, getExerciseMetrics } from "@/lib/trainingMetrics";
import type { StoredWorkout, ExerciseInsights } from "@/lib/trainingAnalysis";

type Props = {
  workouts: StoredWorkout[];
  unit: "kg" | "lb";
};

// SVG chart geometry
const CW = 320;
const CH = 90;
const PL = 40;
const PR = 10;
const PT = 10;
const PB = 28;
const CHART_W = CW - PL - PR;
const CHART_H = CH - PT - PB;

function shortDate(iso: string): string {
  const d = new Date(iso);
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}

function niceRange(min: number, max: number): [number, number] {
  const pad = Math.max((max - min) * 0.12, 2.5);
  return [Math.floor((min - pad) / 2.5) * 2.5, Math.ceil((max + pad) / 2.5) * 2.5];
}

type TrendMeta = { label: string; arrow: string; textColor: string; bg: string; border: string };

function trendMeta(trend: ExerciseInsights["trend"]): TrendMeta {
  switch (trend) {
    case "progressing":
      return { label: "Progressing", arrow: "↑", textColor: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25" };
    case "plateau":
      return { label: "Plateau", arrow: "—", textColor: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/25" };
    case "declining":
      return { label: "Declining", arrow: "↓", textColor: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/22" };
    case "stable":
      return { label: "Stable", arrow: "→", textColor: "text-amber-300", bg: "bg-amber-500/10", border: "border-amber-500/22" };
    default:
      return { label: "Early data", arrow: "·", textColor: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" };
  }
}

function shouldShowCoachCta(trend: ExerciseInsights["trend"]): boolean {
  return trend === "plateau" || trend === "declining" || trend === "stable";
}

function coachMessage(exercise: string, ins: ExerciseInsights, unit: "kg" | "lb"): string {
  const e1rm = ins.recentPerformances.at(-1)?.e1rm?.toFixed(1) ?? null;
  const sessions = ins.sessionsTracked;
  const base = `I'm not progressing on ${exercise}`;
  const strengthStr = e1rm ? ` (currently around ${e1rm}${unit} estimated max)` : "";
  const sessionStr = ` across ${sessions} logged session${sessions === 1 ? "" : "s"}`;
  if (ins.trend === "plateau")
    return `${base}${strengthStr}${sessionStr}. My strength has plateaued — what should I do to break through?`;
  if (ins.trend === "declining")
    return `${base}${strengthStr}${sessionStr}. My strength has been trending down — what could be causing this and how should I address it?`;
  return `${base}${strengthStr}${sessionStr}. My strength has been flat for a while — how should I adjust my programming to start progressing again?`;
}

function insightText(ins: ExerciseInsights): string {
  if (ins.trend === "insufficient_data") {
    const need = Math.max(0, 3 - ins.sessionsTracked);
    return `Log ${need} more session${need === 1 ? "" : "s"} to unlock trend analysis.`;
  }
  if (ins.trend === "progressing") {
    if (typeof ins.avgRIR === "number" && ins.avgRIR > 2.5)
      return "Progressing well. Push a little closer to failure — you still have room in reserve.";
    return "Good momentum. Keep adding load when you hit the top of your rep range.";
  }
  if (ins.trend === "plateau") {
    return "No meaningful gain detected. Try shifting rep range, adding a set, or taking a lighter week first.";
  }
  if (ins.trend === "declining") {
    return "Strength is trending down. Accumulated fatigue is likely — a lighter week before reassessing is recommended.";
  }
  return "Holding steady. Increase load by the smallest increment next session to restart progress.";
}

export function LiftProgressionSection({ workouts, unit }: Props) {
  const exercises = useMemo(() => {
    const names = getUniqueExerciseNames(workouts);
    return names
      .map((name) => ({ name, count: getExerciseMetrics(workouts, name, { maxSessions: 12 }).sessionsTracked }))
      .filter((e) => e.count >= 2)
      .sort((a, b) => b.count - a.count)
      .slice(0, 24)
      .map((e) => e.name);
  }, [workouts]);

  const [selected, setSelected] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const exercise = selected ?? exercises[0] ?? null;

  const metrics = useMemo(
    () => (exercise ? getExerciseMetrics(workouts, exercise, { maxSessions: 12 }) : null),
    [workouts, exercise]
  );

  const insights = useMemo(
    () => (exercise ? getExerciseInsights(workouts, exercise, { maxSessions: 12 }) : null),
    [workouts, exercise]
  );

  if (exercises.length === 0) return null;

  const points = metrics?.recentPerformances ?? [];
  const e1rms = points.map((p) => p.e1rm);
  const [yMin, yMax] = points.length >= 2 ? niceRange(Math.min(...e1rms), Math.max(...e1rms)) : [0, 100];
  const yRange = Math.max(yMax - yMin, 1);

  const chartPts = points.map((p, i) => ({
    x: PL + (points.length > 1 ? (i / (points.length - 1)) * CHART_W : CHART_W / 2),
    y: PT + CHART_H - ((p.e1rm - yMin) / yRange) * CHART_H,
    e1rm: p.e1rm,
    date: p.completedAt,
  }));

  const linePath = chartPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const fillPath =
    chartPts.length >= 2
      ? `${linePath} L${chartPts[chartPts.length - 1].x.toFixed(1)},${(PT + CHART_H).toFixed(1)} L${chartPts[0].x.toFixed(1)},${(PT + CHART_H).toFixed(1)}Z`
      : "";

  const yMid = ((yMin + yMax) / 2).toFixed(0);
  const lastE1rm = metrics?.lastE1RM ?? 0;
  const firstE1rm = metrics?.firstE1RM ?? 0;
  const e1rmDiff = lastE1rm - firstE1rm;
  const e1rmPct = firstE1rm > 0 ? ((e1rmDiff / firstE1rm) * 100).toFixed(1) : null;

  const activePt = activeIdx !== null ? chartPts[activeIdx] : null;
  const tm = insights ? trendMeta(insights.trend) : trendMeta("insufficient_data");

  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <p className="label-section">Lift Progression</p>
        {insights && e1rmPct !== null && (
          <span
            className={`text-[11px] font-semibold tabular-nums ${
              e1rmDiff >= 0 ? "text-emerald-400" : "text-red-400"
            }`}
          >
            {e1rmDiff >= 0 ? "+" : ""}{e1rmDiff.toFixed(1)}{unit} est. 1RM
          </span>
        )}
      </div>

      {/* Exercise pills */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none -mx-1 px-1">
        {exercises.map((name) => {
          const isActive = name === exercise;
          return (
            <button
              key={name}
              type="button"
              onClick={() => { setSelected(name); setActiveIdx(null); }}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all duration-150 ${
                isActive
                  ? "border-teal-500/50 bg-teal-500/15 text-teal-200"
                  : "border-teal-900/30 bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 hover:border-teal-700/40"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* Chart card */}
      {exercise && metrics && points.length >= 2 && (
        <div className="mt-3 rounded-2xl border border-teal-900/20 bg-gradient-to-br from-zinc-900/95 to-zinc-900/85 p-4">
          {/* SVG chart */}
          <div className="relative">
            <svg
              viewBox={`0 0 ${CW} ${CH}`}
              width="100%"
              className="overflow-visible"
              style={{ height: "auto" }}
            >
              <defs>
                <linearGradient id="lp-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="rgb(20,184,166)" stopOpacity="0.18" />
                  <stop offset="100%" stopColor="rgb(20,184,166)" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {/* Horizontal grid lines */}
              {[0, 0.5, 1].map((t) => {
                const gy = PT + CHART_H * (1 - t);
                const label = (yMin + yRange * t).toFixed(0);
                return (
                  <g key={t}>
                    <line
                      x1={PL}
                      y1={gy}
                      x2={PL + CHART_W}
                      y2={gy}
                      stroke="rgba(255,255,255,0.05)"
                      strokeWidth="1"
                    />
                    <text
                      x={PL - 5}
                      y={gy + 4}
                      textAnchor="end"
                      fontSize="9"
                      fill="rgba(161,161,170,0.55)"
                    >
                      {label}
                    </text>
                  </g>
                );
              })}

              {/* Fill */}
              {fillPath && <path d={fillPath} fill="url(#lp-fill)" />}

              {/* Line */}
              <path
                d={linePath}
                fill="none"
                stroke="rgb(45,212,191)"
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
              />

              {/* Dots */}
              {chartPts.map((p, i) => {
                const isActive = activeIdx === i;
                const isLast = i === chartPts.length - 1;
                return (
                  <g key={i}>
                    {isActive && (
                      <circle cx={p.x} cy={p.y} r="10" fill="rgba(45,212,191,0.08)" />
                    )}
                    <circle
                      cx={p.x}
                      cy={p.y}
                      r={isActive ? 5 : isLast ? 4 : 3}
                      fill={isActive || isLast ? "rgb(45,212,191)" : "rgb(20,184,166)"}
                      stroke={isActive ? "rgba(45,212,191,0.35)" : "rgba(7,9,15,0.8)"}
                      strokeWidth={isActive ? "2" : "1.5"}
                      className="cursor-pointer"
                      onClick={() => setActiveIdx(activeIdx === i ? null : i)}
                    />
                  </g>
                );
              })}

              {/* Tooltip for active/last point */}
              {(() => {
                const tp = activePt ?? chartPts[chartPts.length - 1];
                if (!tp) return null;
                const isRight = tp.x > PL + CHART_W * 0.6;
                const tx = isRight ? tp.x - 36 : tp.x + 6;
                return (
                  <g>
                    <rect
                      x={tx}
                      y={tp.y - 14}
                      width={34}
                      height={13}
                      rx="3"
                      fill="rgba(12,18,25,0.88)"
                      stroke="rgba(45,212,191,0.2)"
                      strokeWidth="0.75"
                    />
                    <text
                      x={tx + 17}
                      y={tp.y - 4}
                      textAnchor="middle"
                      fontSize="8.5"
                      fontWeight="600"
                      fill="rgb(153,246,228)"
                    >
                      {tp.e1rm.toFixed(1)}{unit}
                    </text>
                  </g>
                );
              })()}

              {/* X-axis date labels */}
              {chartPts.length >= 2 &&
                [0, chartPts.length - 1].map((i) => {
                  const p = chartPts[i];
                  return (
                    <text
                      key={i}
                      x={p.x}
                      y={CH - 4}
                      textAnchor={i === 0 ? "start" : "end"}
                      fontSize="8.5"
                      fill="rgba(161,161,170,0.45)"
                    >
                      {shortDate(p.date)}
                    </text>
                  );
                })}

              {/* Middle date if enough points */}
              {chartPts.length >= 5 && (() => {
                const mid = chartPts[Math.floor(chartPts.length / 2)];
                return (
                  <text x={mid.x} y={CH - 4} textAnchor="middle" fontSize="8.5" fill="rgba(161,161,170,0.35)">
                    {shortDate(mid.date)}
                  </text>
                );
              })()}
            </svg>
          </div>

          {/* Tap hint */}
          <p className="mt-0.5 text-[10px] text-zinc-600 text-right">Tap a dot to inspect</p>

          {/* Insights row */}
          {insights && (
            <div className="mt-3 space-y-2.5">
              {/* Stats row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold ${tm.bg} ${tm.border} ${tm.textColor}`}>
                  <span>{tm.arrow}</span>
                  {tm.label}
                </span>
                {e1rmPct !== null && (
                  <span className="text-[11px] font-semibold text-zinc-300 tabular-nums">
                    Est. 1RM: <span className="text-white">{lastE1rm.toFixed(1)}{unit}</span>
                    <span className={`ml-1.5 ${e1rmDiff >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      ({e1rmDiff >= 0 ? "+" : ""}{e1rmPct}%)
                    </span>
                  </span>
                )}
                {insights.daysSinceLastPerformed !== null && (
                  <span className="text-[11px] text-zinc-500 tabular-nums ml-auto">
                    {insights.daysSinceLastPerformed === 0
                      ? "Today"
                      : insights.daysSinceLastPerformed === 1
                      ? "Yesterday"
                      : `${insights.daysSinceLastPerformed}d ago`}
                  </span>
                )}
              </div>

              {/* Insight text */}
              <p className="text-[12px] leading-snug text-zinc-400 border-l-2 border-teal-600/30 pl-3">
                {insightText(insights)}
              </p>

              {/* Coach CTA */}
              {shouldShowCoachCta(insights.trend) && exercise && (
                <Link
                  href={`/assistant?q=${encodeURIComponent(coachMessage(exercise, insights, unit))}`}
                  className="mt-1 flex items-center justify-between gap-3 rounded-xl border border-teal-800/30 bg-teal-950/30 px-4 py-3 transition hover:border-teal-600/40 hover:bg-teal-950/50 active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-500/15">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 text-teal-400">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-teal-100">Ask the Coach</p>
                      <p className="text-[10px] text-zinc-500 mt-0.5">Get a personalised fix for this plateau</p>
                    </div>
                  </div>
                  <span className="text-xs text-teal-400/70">→</span>
                </Link>
              )}

              {/* Sessions tracked */}
              <p className="text-[10px] text-zinc-600">
                Based on {insights.sessionsTracked} logged session{insights.sessionsTracked === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Not enough data state */}
      {exercise && points.length < 2 && (
        <div className="mt-3 rounded-2xl border border-teal-900/20 bg-zinc-900/60 px-4 py-5">
          <p className="text-sm text-zinc-400">
            Log at least 2 sessions of <span className="text-white font-medium">{exercise}</span> to see your progression chart.
          </p>
        </div>
      )}
    </section>
  );
}
