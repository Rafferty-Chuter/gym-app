"use client";

import { useMemo } from "react";
import { ChartTip, useContainerWidth } from "@/components/charts/ChartTip";
import { usePick } from "@/components/charts/usePick";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import type { EnergyBalancePoint } from "@/lib/physique/food/energy";
import type { ExpenditurePoint } from "@/lib/physique/types";

/** Nutrition chart colours (DESIGN.md rev 2). */
export const KCAL_COLOR = "var(--macro-kcal)";
export const PROTEIN_COLOR = "var(--macro-protein)";
export const FAT_COLOR = "var(--macro-fat)";
export const CARBS_COLOR = "var(--macro-carb)";

function niceStep(span: number): number {
  const raw = span / 3;
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))));
  const m = raw / pow;
  return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * pow;
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");

const INTAKE_WORD: Record<EnergyBalancePoint["status"], string | null> = { complete: null, partial: "Partial day", fasting: "Fasting", unlogged: "Not logged", none: "Not logged" };

/**
 * Energy balance (05-design §9.4): intake bars against a dotted line of
 * expenditure or targets. Partial days are muted; unlogged days leave a gap.
 * A tap shows that day's intake and line (T1). It sits in a swiper, so a
 * tap picks and a sideways swipe still turns the page.
 */
export function EnergyBalanceChart({ points, height = 120, lineColor = "var(--text)", lineLabel = "Maintenance", ariaLabel }: { points: readonly EnergyBalancePoint[]; height?: number; lineColor?: string; lineLabel?: string; ariaLabel: string }) {
  const [wrap, W] = useContainerWidth<HTMLDivElement>();
  const model = useMemo(() => {
    if (W <= 0 || points.length === 0) return null;
    const values = points.flatMap((p) => [p.intakeKcal ?? 0, p.lineKcal ?? 0]).filter((v) => v > 0);
    const max = Math.max(500, ...values) * 1.08;
    const padT = 6;
    const padB = 16;
    const innerH = height - padT - padB;
    const slot = W / points.length;
    const barW = Math.max(2, Math.min(18, slot * 0.6));
    const y = (v: number) => padT + innerH - (v / max) * innerH;
    const cx = (i: number) => i * slot + slot / 2;
    const bars = points.map((p, i) => ({ x: cx(i) - barW / 2, y: p.intakeKcal != null ? y(p.intakeKcal) : null, h: p.intakeKcal != null ? innerH + padT - y(p.intakeKcal) : 0, status: p.status }));
    let line = "";
    points.forEach((p, i) => {
      if (p.lineKcal == null) return;
      line += `${line ? "L" : "M"}${cx(i).toFixed(1)} ${y(p.lineKcal).toFixed(1)} `;
    });
    return { bars, barW, line, cx, xs: points.map((_, i) => cx(i)), baseline: padT + innerH, first: points[0]?.date, last: points[points.length - 1]?.date };
  }, [points, height, W]);
  const { active, bind } = usePick({ xs: model?.xs ?? [], data: `${points[0]?.date}:${points.length}`, drag: false });
  const p = active != null ? points[active] : null;

  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      <div {...bind} role="group" aria-label={`${ariaLabel}. Tap a day for its numbers`} className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]">
        {model && (
          <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="block" aria-hidden>
            <line x1={0} x2={W} y1={model.baseline} y2={model.baseline} stroke="var(--border)" strokeWidth={1} />
            {active != null && <rect x={model.cx(active) - W / points.length / 2} y={0} width={W / points.length} height={model.baseline} rx={3} fill="var(--surface-raised)" />}
            {model.bars.map((b, i) =>
              b.y == null ? null : (
                <rect key={i} x={b.x} y={b.y} width={model.barW} height={Math.max(1, b.h)} rx={1.5} fill={b.status === "partial" ? "var(--border-strong)" : KCAL_COLOR} opacity={(b.status === "fasting" ? 0.4 : 1) * (active != null && active !== i ? 0.45 : 1)} />
              )
            )}
            {model.line && <path d={model.line} fill="none" stroke={lineColor} strokeWidth={1.5} strokeDasharray="2 3" strokeLinecap="round" />}
            {model.first && (
              <text x={0} y={height - 3} fontSize={9} fill="var(--text-tertiary)">
                {shortLocalDate(model.first)}
              </text>
            )}
            {model.last && (
              <text x={W} y={height - 3} fontSize={9} fill="var(--text-tertiary)" textAnchor="end">
                {shortLocalDate(model.last)}
              </text>
            )}
          </svg>
        )}
      </div>
      {p && model && (
        <ChartTip
          x={model.cx(active!)}
          width={W}
          title={longLocalDate(p.date)}
          rows={[
            { label: "Intake", value: p.intakeKcal != null ? `${n0(p.intakeKcal)} kcal` : (INTAKE_WORD[p.status] ?? "–") },
            ...(p.intakeKcal != null && INTAKE_WORD[p.status] ? [{ label: "Logged as", value: INTAKE_WORD[p.status]! }] : []),
            ...(p.lineKcal != null ? [{ label: lineLabel, value: `${n0(p.lineKcal)} kcal` }] : []),
          ]}
          w={150}
        />
      )}
    </div>
  );
}

/**
 * Expenditure page chart: the estimate as a line with its ± band, holding
 * stretches dashed, updating stretches solid. Y labels at a nice step.
 * Tap or drag for one day's estimate (T1).
 */
export function ExpenditureChart({ points, plusMinus, height = 190, ariaLabel }: { points: readonly ExpenditurePoint[]; plusMinus: number | null; height?: number; ariaLabel: string }) {
  const [wrap, W] = useContainerWidth<HTMLDivElement>();
  const model = useMemo(() => {
    if (points.length === 0 || W <= 0) return null;
    const pm = plusMinus ?? 0;
    const vals = points.map((p) => p.tdee);
    const lo = Math.min(...vals) - pm;
    const hi = Math.max(...vals) + pm;
    const step = niceStep(Math.max(200, hi - lo));
    const yMin = Math.floor(lo / step) * step;
    const yMax = Math.ceil(hi / step) * step;
    const padL = 34;
    const padR = 8;
    const padT = 8;
    const padB = 18;
    const innerW = W - padL - padR;
    const innerH = height - padT - padB;
    const x = (i: number) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v: number) => padT + innerH - ((v - yMin) / Math.max(1, yMax - yMin)) * innerH;
    const ticks: number[] = [];
    for (let v = yMin; v <= yMax + 1e-6; v += step) ticks.push(v);
    let band = "";
    if (pm > 0) {
      const top = points.map((p, i) => `${x(i).toFixed(1)} ${y(p.tdee + pm).toFixed(1)}`);
      const bottom = points.map((p, i) => `${x(i).toFixed(1)} ${y(p.tdee - pm).toFixed(1)}`).reverse();
      band = `M${top.join(" L")} L${bottom.join(" L")} Z`;
    }
    // Split the line into same-state runs so holding stretches can dash.
    const runs: Array<{ state: ExpenditurePoint["state"]; d: string }> = [];
    points.forEach((p, i) => {
      const last = runs[runs.length - 1];
      const pt = `${x(i).toFixed(1)} ${y(p.tdee).toFixed(1)}`;
      if (!last || last.state !== p.state) {
        const prev = i > 0 ? `${x(i - 1).toFixed(1)} ${y(points[i - 1].tdee).toFixed(1)}` : null;
        runs.push({ state: p.state, d: prev ? `M${prev} L${pt}` : `M${pt}` });
      } else last.d += ` L${pt}`;
    });
    const lastPoint = points[points.length - 1];
    return { ticks, y, x, xs: points.map((_, i) => x(i)), band, runs, padL, padT, baseline: padT + innerH, first: points[0].date, last: lastPoint.date, end: { cx: x(points.length - 1), cy: y(lastPoint.tdee) } };
  }, [points, plusMinus, height, W]);
  const { active, bind } = usePick({ xs: model?.xs ?? [], data: `${points[0]?.date}:${points.length}` });

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center text-[13px]" style={{ height, color: "var(--text-tertiary)" }}>
        No expenditure yet.
      </div>
    );
  }
  const p = active != null ? points[active] : null;
  return (
    <div ref={wrap} className="relative w-full" style={{ height }}>
      <div {...bind} role="group" aria-label={`${ariaLabel}. Tap or drag for one day's estimate`} className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]">
        {model && (
          <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} className="block" aria-hidden>
            {model.ticks.map((t) => (
              <g key={t}>
                <line x1={model.padL} x2={W - 8} y1={model.y(t)} y2={model.y(t)} stroke="var(--border)" strokeWidth={1} />
                <text x={model.padL - 6} y={model.y(t) + 3} fontSize={9} fill="var(--text-tertiary)" textAnchor="end">
                  {t.toLocaleString("en-GB")}
                </text>
              </g>
            ))}
            {/* Maintenance is calories, so it takes the kcal blue of the ring and the bars (polish, rev 4.1). */}
            {model.band && <path d={model.band} fill={KCAL_COLOR} opacity={0.12} />}
            {model.runs.map((r, i) => (
              <path key={i} d={r.d} fill="none" stroke={r.state === "holding" ? "var(--text-tertiary)" : KCAL_COLOR} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={r.state === "holding" ? "3 4" : undefined} />
            ))}
            {p ? (
              <g>
                <line x1={model.x(active!)} x2={model.x(active!)} y1={model.padT} y2={model.baseline} stroke="var(--border-strong)" strokeWidth={1} />
                <circle cx={model.x(active!)} cy={model.y(p.tdee)} r={4} fill={KCAL_COLOR} stroke="var(--surface)" strokeWidth={1.5} />
              </g>
            ) : (
              <circle cx={model.end.cx} cy={model.end.cy} r={3.5} fill={KCAL_COLOR} />
            )}
            <text x={model.padL} y={height - 4} fontSize={9} fill="var(--text-tertiary)">
              {shortLocalDate(model.first)}
            </text>
            <text x={W - 8} y={height - 4} fontSize={9} fill="var(--text-tertiary)" textAnchor="end">
              {shortLocalDate(model.last)}
            </text>
          </svg>
        )}
      </div>
      {p && model && (
        <ChartTip
          x={model.x(active!)}
          y={model.y(p.tdee)}
          width={W}
          title={longLocalDate(p.date)}
          rows={[
            { label: "Maintenance", value: `${n0(p.tdee)} kcal` },
            ...(plusMinus ? [{ label: "Give or take", value: `±${n0(plusMinus)} kcal` }] : []),
            { label: "Estimate", value: p.state === "holding" ? "Holding" : "Updating" },
          ]}
          w={150}
        />
      )}
    </div>
  );
}

/** Tiny sparkline for the changes table. */
export function Sparkline({ values, width = 56, height = 18 }: { values: readonly number[]; width?: number; height?: number }) {
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)} ${(height - 2 - ((v - min) / span) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={width} height={height} aria-hidden>
      <path d={d} fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
