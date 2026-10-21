"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { usePick } from "@/components/charts/usePick";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { PulseId, PulseRow } from "@/lib/physique/howItsGoing";
import type { PulseChart } from "@/lib/physique/pulseCharts";
import { fromNightAxis } from "@/lib/physique/sleepScore";
import type { Tone } from "@/lib/physique/weekScorecard";
import { formatBodyWeight, type WeightUnit } from "@/lib/units";

const TONE_COLOR: Record<Tone, string> = { good: "var(--status-good)", watch: "var(--status-watch)", neutral: "var(--text-secondary)" };

/** One hue per measure (DESIGN.md rev 4.2): the same colour wherever that measure is drawn. */
export const PULSE_COLOR: Record<PulseId, string> = {
  rate: "var(--chart-trend)",
  weight: "var(--chart-trend)",
  waist: "var(--chart-steps)",
  calories: "var(--macro-kcal)",
  protein: "var(--macro-protein)",
  fibre: "var(--macro-carb)",
  training: "var(--chart-training)",
  priority: "var(--chart-training)",
  sleep: "var(--chart-sleep)",
  wake: "var(--chart-sleep)",
  steps: "var(--chart-steps)",
  rhr: "var(--chart-heart)",
};

/** Each tile opens Progress at its own chart on the timeline (PR1), not the screen where it is logged. */
const PROGRESS_CHART: Partial<Record<PulseId, string>> = {
  rate: "weight",
  weight: "weight",
  waist: "weight",
  calories: "calories",
  fibre: "calories",
  protein: "protein",
  training: "training",
  priority: "training",
  sleep: "sleep",
  wake: "sleep",
};

/** The number in bold and its unit or "a day" quieter, as "2,121 a day" or "7h 23m a night". */
export function splitValue(value: string): { main: string; suffix: string } {
  const m = /^([−+-]?[\d,.]+(?:h \d+m)?)(\s.*)?$/.exec(value);
  return m ? { main: m[1], suffix: m[2] ?? "" } : { main: value, suffix: "" };
}

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");

type PointChart = Exclude<PulseChart, { kind: "meter" }>;

/** One day's value in the tile's footer (T1): the number bold and its unit quieter, or "Not logged". */
export function pointValue(id: PulseId, chart: PointChart, i: number, unit: WeightUnit): { main: string; suffix: string } {
  const v = chart.values[i];
  if (chart.kind === "dots") {
    const w = chart.wakeMin[i];
    return w == null ? { main: "Not logged", suffix: "" } : { main: fromNightAxis(w), suffix: " wake" };
  }
  if (v == null) return { main: "Not logged", suffix: "" };
  switch (id) {
    case "rate":
    case "weight":
      return splitValue(formatBodyWeight(v, unit));
    case "waist":
      return { main: v.toFixed(1), suffix: " cm" };
    case "calories":
      return { main: n0(v), suffix: " kcal" };
    case "protein":
    case "fibre":
      return { main: n0(v), suffix: " g" };
    case "training":
      return v > 0 ? { main: String(v), suffix: v === 1 ? " hard set" : " hard sets" } : { main: "No hard sets", suffix: "" };
    case "sleep":
      return { main: formatHoursMin(Math.round(v * 60)), suffix: "" };
    case "steps":
      return { main: n0(v), suffix: " steps" };
    case "rhr":
      return { main: String(Math.round(v)), suffix: " bpm" };
    default:
      return { main: n0(v), suffix: "" };
  }
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}

/**
 * One measure on Home (H2, after MacroFactor's dashboard tiles): its name,
 * the judgement in the status colour, the week as a chart in the measure's
 * own colour, then the number under a hairline. The tile opens the
 * measure's chart on Progress; a tap on the chart itself picks one day
 * instead (T1), its date in place of the judgement and its value in place
 * of the week's number, until it is tapped again.
 */
export default function PulseTile({ row, chart, wide, unit = "kg" }: { row: PulseRow; chart: PulseChart | null; wide?: boolean; unit?: WeightUnit }) {
  const chart0 = PROGRESS_CHART[row.id];
  const href = chart0 ? `/body#${chart0}` : row.href;
  const pts = chart && chart.kind !== "meter" ? chart : null;
  const n = pts?.values.length ?? 0;
  // Bars pick any day, an empty one included; lines and dots only days with a point.
  const xs = pts ? pts.values.map((v, i) => (pts.kind === "bars" || v != null ? slotX(i, n) / 100 : null)) : [];
  const { active, bind } = usePick({ xs, share: true, data: pts ? `${pts.dates[0]}:${pts.dates.at(-1)}:${n}` : "" });
  const picked = pts && active != null ? { date: pts.dates[active], partial: pts.kind === "bars" && pts.faded[active] && pts.values[active] != null } : null;
  const { main, suffix } = pts && picked ? pointValue(row.id, pts, active!, unit) : splitValue(row.value);
  const cls = `relative flex min-h-[176px] flex-col rounded-[16px] px-3.5 pb-3 pt-3.5 ${wide ? "col-span-2" : ""}`;
  const label = `${row.label}, last 7 days: ${row.value}, ${row.note}`;
  // Text sits above the tile's link without taking taps, so a tap anywhere but the chart opens Progress.
  const over = "pointer-events-none relative";
  return (
    <div className={cls} style={{ background: "var(--surface)" }} role={href ? undefined : "group"} aria-label={href ? undefined : label}>
      {href && <Link href={href} className="absolute inset-0 rounded-[16px] transition-colors active:bg-[var(--surface-raised)]" aria-label={`${label}. Open`} />}
      <span className={`${over} text-[15px] font-semibold`} style={{ color: "var(--text)" }}>
        {row.label}
      </span>
      <span className={`${over} mt-0.5 text-[12px] font-medium leading-snug`} style={{ color: picked ? "var(--text-secondary)" : TONE_COLOR[row.tone], fontVariantNumeric: "tabular-nums" }}>
        {picked ? `${longLocalDate(picked.date)}${picked.partial ? " · partial" : ""}` : row.note}
      </span>
      <div className="relative mt-auto h-[52px] pt-3">
        {pts ? (
          <div {...bind} role="group" aria-label={`${row.label} by day`} className="h-full w-full rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]">
            <ChartView chart={pts} color={PULSE_COLOR[row.id]} active={active} />
          </div>
        ) : (
          chart && <ChartView chart={chart} color={PULSE_COLOR[row.id]} active={null} />
        )}
      </div>
      <div className={`${over} mt-3 flex items-center justify-between gap-2 pt-2.5`} style={{ borderTop: "1px solid var(--border)" }} aria-live="polite">
        <span className="min-w-0 truncate text-[17px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {main}
          {suffix && (
            <span className="text-[12px] font-medium tracking-normal" style={{ color: "var(--text-tertiary)" }}>
              {suffix}
            </span>
          )}
        </span>
        {href && <Chevron />}
      </div>
    </div>
  );
}

// ── Charts ──
// Drawn in percentages inside the tile so the same chart fills a half or a whole row; dots are HTML so they stay round.

/** Slot centre as a percentage of the width: seven slots, so bars and line points line up across tiles. */
const slotX = (i: number, n: number) => ((i + 0.5) / n) * 100;

function ChartView({ chart, color, active }: { chart: PulseChart; color: string; active: number | null }) {
  switch (chart.kind) {
    case "bars":
      return <Bars values={chart.values} faded={chart.faded} target={chart.target} color={color} active={active} />;
    case "line":
      return <Line values={chart.values} minSpan={chart.minSpan} color={color} active={active} />;
    case "dots":
      return <Dots values={chart.values} range={chart.range} color={color} active={active} />;
    case "meter":
      return <Meter filled={chart.filled} total={chart.total} color={color} />;
  }
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="relative h-full w-full">{children}</div>;
}

/** One bar a day from the baseline, a short grey stub for a day with nothing, the target as a dashed line. */
function Bars({ values, faded, target, color, active }: { values: Array<number | null>; faded: boolean[]; target: number | null; color: string; active: number | null }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  const top = Math.max(max * 1.06, target != null ? target * 1.12 : 0);
  return (
    <Frame>
      {/* Each bar sits centred in its day's slot, so bars line up with the line charts' points. */}
      <div className="flex h-full items-end">
        {values.map((v, i) => {
          const on = v != null && v > 0;
          const dim = active != null && active !== i;
          return (
            <span key={i} className="flex h-full flex-1 items-end justify-center rounded-[4px]" style={{ background: active === i ? "var(--surface-raised)" : undefined }}>
              <span
                className="w-[58%] max-w-[14px] rounded-t-[3px] rounded-b-[1px] transition-opacity"
                style={{ height: on ? `${Math.max(6, (v / top) * 100)}%` : "3px", background: on ? color : "var(--border)", opacity: (on && faded[i] ? 0.4 : 1) * (dim ? 0.35 : 1) }}
              />
            </span>
          );
        })}
      </div>
      {target != null && target > 0 && <span className="pointer-events-none absolute inset-x-0 border-t border-dashed" style={{ bottom: `${(target / top) * 100}%`, borderColor: "var(--text-tertiary)", opacity: 0.7 }} />}
    </Frame>
  );
}

/** A line through the week with a dot on each day, the area under it fading out; the last point filled, or the picked one. */
function Line({ values, minSpan, color, active }: { values: Array<number | null>; minSpan: number; color: string; active: number | null }) {
  const gid = `pulse-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const n = values.length;
  const pts = values.map((v, i) => (v == null ? null : { i, v })).filter((p): p is { i: number; v: number } => p != null);
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const span = Math.max(hi - lo, minSpan);
  const mid = (hi + lo) / 2;
  const y = (v: number) => 14 + (1 - (v - (mid - span / 2)) / span) * 72;
  const xy = pts.map((p) => ({ x: slotX(p.i, n), y: y(p.v) }));
  const path = xy.map((p, k) => `${k === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const area = `${path} L${xy[xy.length - 1].x.toFixed(2)},100 L${xy[0].x.toFixed(2)},100 Z`;
  return (
    <Frame>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: color, stopOpacity: 0.28 }} />
            <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={area} fill={`url(#${gid})`} />
        <path d={path} fill="none" stroke={color} strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {active != null && values[active] != null && <span className="absolute inset-y-0 w-px -translate-x-1/2" style={{ left: `${slotX(active, n)}%`, background: "var(--border-strong)" }} />}
      {xy.map((p, k) => {
        const on = active != null ? pts[k].i === active : k === xy.length - 1;
        return <span key={k} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${active != null && on ? "h-[10px] w-[10px]" : "h-[7px] w-[7px]"}`} style={{ left: `${p.x}%`, top: `${p.y}%`, background: on ? color : "var(--surface)", border: `2px solid ${color}` }} />;
      })}
    </Frame>
  );
}

/** Wake times as dots around the week's usual time (the dashed line): the closer to the line, the steadier. */
function Dots({ values, range, color, active }: { values: Array<number | null>; range: number; color: string; active: number | null }) {
  const n = values.length;
  return (
    <Frame>
      <span className="absolute inset-x-0 top-1/2 border-t border-dashed" style={{ borderColor: "var(--text-tertiary)", opacity: 0.7 }} />
      {values.map((v, i) =>
        v == null ? null : <span key={i} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full transition-opacity ${active === i ? "h-3 w-3" : "h-2 w-2"}`} style={{ left: `${slotX(i, n)}%`, top: `${50 + (Math.max(-range, Math.min(range, v)) / range) * 40}%`, background: color, opacity: active != null && active !== i ? 0.35 : 1 }} />,
      )}
    </Frame>
  );
}

/** Parts in range out of the total, one segment each. */
function Meter({ filled, total, color }: { filled: number; total: number; color: string }) {
  return (
    <Frame>
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 gap-1">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="h-2.5 flex-1 rounded-full" style={{ background: i < filled ? color : "var(--surface-raised)" }} />
        ))}
      </div>
    </Frame>
  );
}
