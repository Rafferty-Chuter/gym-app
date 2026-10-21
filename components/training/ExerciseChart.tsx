"use client";

import { useMemo } from "react";
import { ChartTip, useContainerWidth } from "@/components/charts/ChartTip";
import { usePick } from "@/components/charts/usePick";
import { CHART_MIN_POINTS, type ChartPoint } from "@/lib/training/exerciseHistory";
import { formatLoad } from "@/lib/training/workoutSummary";

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

/** "Thu 16 Oct" for a session's tip. */
function sessionDay(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "") : "";
}

/**
 * One exercise over time (TR6): a line through each session's value with
 * a dot per session, the latest one solid. Fewer than two sessions say so
 * instead of drawing a lone dot. Tap or drag for one session's value (T1).
 */
export default function ExerciseChart({ points, height = 170, ariaLabel, label, format }: { points: readonly ChartPoint[]; height?: number; ariaLabel: string; /** The measure's name in the tip. */ label: string; format: (v: number) => string }) {
  const [wrap, W] = useContainerWidth<HTMLDivElement>();
  const model = useMemo(() => {
    if (points.length < CHART_MIN_POINTS || W <= 0) return null;
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
    return { ticks, x, y, d, padL, padT, baseline: padT + innerH, xs: points.map(x) };
  }, [points, height, W]);
  const { active, bind } = usePick({ xs: model?.xs ?? [], data: `${points[0]?.completedAt}:${points.length}:${label}` });

  if (points.length < CHART_MIN_POINTS) {
    return (
      <div className="flex items-center justify-center px-6 text-center text-[13px]" style={{ height: 96, color: "var(--text-tertiary)" }}>
        {points.length === 0 ? "No sessions with this measure yet." : "One session so far. The chart starts with the second."}
      </div>
    );
  }
  const last = points[points.length - 1];
  const p = active != null ? points[active] : null;
  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      <div {...bind} role="group" aria-label={`${ariaLabel}. Tap or drag for one session`} className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]">
        {model && (
          <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="block" aria-hidden>
            {model.ticks.map((t) => (
              <g key={t}>
                <line x1={model.padL} x2={W - 8} y1={model.y(t)} y2={model.y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={model.padL - 6} y={model.y(t) + 3} fontSize={9} fill="var(--text-tertiary)" textAnchor="end">
                  {t >= 1000 ? Math.round(t).toLocaleString("en-GB") : formatLoad(t)}
                </text>
              </g>
            ))}
            {p && <line x1={model.x(p)} x2={model.x(p)} y1={model.padT} y2={model.baseline} stroke="var(--border-strong)" strokeWidth={1} />}
            <path d={model.d} fill="none" stroke="var(--text)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            {points.map((q, i) => (
              <circle key={`${q.completedAt}-${i}`} cx={model.x(q)} cy={model.y(q.value)} r={i === active ? 4.5 : i === points.length - 1 ? 3.5 : 2} fill={i === active || i === points.length - 1 ? "var(--text)" : "var(--text-secondary)"} stroke={i === active ? "var(--surface)" : undefined} strokeWidth={i === active ? 1.5 : undefined} />
            ))}
            <text x={model.padL} y={height - 4} fontSize={9} fill="var(--text-tertiary)">
              {shortDay(points[0].completedAt)}
            </text>
            <text x={W - 8} y={height - 4} fontSize={9} fill="var(--text-tertiary)" textAnchor="end">
              {shortDay(last.completedAt)}
            </text>
          </svg>
        )}
      </div>
      {p && model && <ChartTip x={model.x(p)} y={model.y(p.value)} width={W} title={sessionDay(p.completedAt)} rows={[{ label, value: format(p.value) }]} w={150} />}
    </div>
  );
}
