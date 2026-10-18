"use client";

import { useMemo } from "react";
import { CHART_MIN_POINTS, type ChartPoint } from "@/lib/training/exerciseHistory";
import { formatLoad } from "@/lib/training/workoutSummary";

const W = 320;

function niceStep(span: number): number {
  const raw = span / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1e-6, raw))));
  const m = raw / pow;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * pow;
}

function shortDay(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
}

/**
 * One exercise over time (TR6): a line through each session's value with
 * a dot per session, the latest one solid. Fewer than two sessions say so
 * instead of drawing a lone dot.
 */
export default function ExerciseChart({ points, height = 170, ariaLabel }: { points: readonly ChartPoint[]; height?: number; ariaLabel: string }) {
  const model = useMemo(() => {
    if (points.length < CHART_MIN_POINTS) return null;
    const vals = points.map((p) => p.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const step = niceStep(Math.max(hi - lo, Math.max(1, hi * 0.05)));
    const yMin = Math.max(0, Math.floor(lo / step) * step);
    const yMax = Math.max(yMin + step, Math.ceil(hi / step) * step);
    const padL = 38;
    const padR = 8;
    const padT = 10;
    const padB = 18;
    const innerW = W - padL - padR;
    const innerH = height - padT - padB;
    const t0 = new Date(points[0].completedAt).getTime();
    const t1 = new Date(points[points.length - 1].completedAt).getTime();
    const span = Math.max(1, t1 - t0);
    const x = (p: ChartPoint) => padL + ((new Date(p.completedAt).getTime() - t0) / span) * innerW;
    const y = (v: number) => padT + innerH - ((v - yMin) / Math.max(1e-6, yMax - yMin)) * innerH;
    const ticks: number[] = [];
    for (let v = yMin; v <= yMax + 1e-6; v += step) ticks.push(v);
    const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
    return { ticks, x, y, d, padL };
  }, [points, height]);

  if (!model) {
    return (
      <div className="flex items-center justify-center px-6 text-center text-[13px]" style={{ height: 96, color: "#6f6f76" }}>
        {points.length === 0 ? "No sessions with this measure yet." : "One session so far. The chart starts with the second."}
      </div>
    );
  }
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${height}`} className="w-full" style={{ height }} role="img" aria-label={ariaLabel}>
      {model.ticks.map((t) => (
        <g key={t}>
          <line x1={model.padL} x2={W - 8} y1={model.y(t)} y2={model.y(t)} stroke="#2a2a2e" strokeWidth={1} />
          <text x={model.padL - 6} y={model.y(t) + 3} fontSize={9} fill="#6f6f76" textAnchor="end">
            {t >= 1000 ? Math.round(t).toLocaleString("en-GB") : formatLoad(t)}
          </text>
        </g>
      ))}
      <path d={model.d} fill="none" stroke="#f2f2f0" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={`${p.completedAt}-${i}`} cx={model.x(p)} cy={model.y(p.value)} r={i === points.length - 1 ? 3.5 : 2} fill={i === points.length - 1 ? "#f2f2f0" : "#a3a3a8"} />
      ))}
      <text x={model.padL} y={height - 4} fontSize={9} fill="#6f6f76">
        {shortDay(points[0].completedAt)}
      </text>
      <text x={W - 8} y={height - 4} fontSize={9} fill="#6f6f76" textAnchor="end">
        {shortDay(last.completedAt)}
      </text>
    </svg>
  );
}
