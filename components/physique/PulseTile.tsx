"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import type { PulseId, PulseRow } from "@/lib/physique/howItsGoing";
import type { PulseChart } from "@/lib/physique/pulseCharts";
import type { Tone } from "@/lib/physique/weekScorecard";

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
 * own colour, then the number under a hairline. The whole tile opens where
 * the measure lives.
 */
export default function PulseTile({ row, chart, wide }: { row: PulseRow; chart: PulseChart | null; wide?: boolean }) {
  const { main, suffix } = splitValue(row.value);
  const chart0 = PROGRESS_CHART[row.id];
  const href = chart0 ? `/body#${chart0}` : row.href;
  const body = (
    <>
      <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
        {row.label}
      </span>
      <span className="mt-0.5 text-[12px] font-medium leading-snug" style={{ color: TONE_COLOR[row.tone], fontVariantNumeric: "tabular-nums" }}>
        {row.note}
      </span>
      <div className="mt-auto h-[52px] pt-3" aria-hidden>
        {chart && <ChartView chart={chart} color={PULSE_COLOR[row.id]} />}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 pt-2.5" style={{ borderTop: "1px solid var(--border)" }}>
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
    </>
  );
  const cls = `flex min-h-[176px] flex-col rounded-[16px] px-3.5 pb-3 pt-3.5 ${wide ? "col-span-2" : ""}`;
  const label = `${row.label}, last 7 days: ${row.value}, ${row.note}`;
  return href ? (
    <Link href={href} className={`${cls} transition-colors active:bg-[var(--surface-raised)]`} style={{ background: "var(--surface)" }} aria-label={`${label}. Open`}>
      {body}
    </Link>
  ) : (
    <div className={cls} style={{ background: "var(--surface)" }} role="group" aria-label={label}>
      {body}
    </div>
  );
}

// ── Charts ──
// Drawn in percentages inside the tile so the same chart fills a half or a whole row; dots are HTML so they stay round.

/** Slot centre as a percentage of the width: seven slots, so bars and line points line up across tiles. */
const slotX = (i: number, n: number) => ((i + 0.5) / n) * 100;

function ChartView({ chart, color }: { chart: PulseChart; color: string }) {
  switch (chart.kind) {
    case "bars":
      return <Bars values={chart.values} faded={chart.faded} target={chart.target} color={color} />;
    case "line":
      return <Line values={chart.values} minSpan={chart.minSpan} color={color} />;
    case "dots":
      return <Dots values={chart.values} range={chart.range} color={color} />;
    case "meter":
      return <Meter filled={chart.filled} total={chart.total} color={color} />;
  }
}

function Frame({ children }: { children: ReactNode }) {
  return <div className="relative h-full w-full">{children}</div>;
}

/** One bar a day from the baseline, a short grey stub for a day with nothing, the target as a dashed line. */
function Bars({ values, faded, target, color }: { values: Array<number | null>; faded: boolean[]; target: number | null; color: string }) {
  const max = Math.max(1, ...values.map((v) => v ?? 0));
  const top = Math.max(max * 1.06, target != null ? target * 1.12 : 0);
  return (
    <Frame>
      {/* Each bar sits centred in its day's slot, so bars line up with the line charts' points. */}
      <div className="flex h-full items-end">
        {values.map((v, i) => {
          const on = v != null && v > 0;
          return (
            <span key={i} className="flex h-full flex-1 items-end justify-center">
              <span
                className="w-[58%] max-w-[14px] rounded-t-[3px] rounded-b-[1px]"
                style={{ height: on ? `${Math.max(6, (v / top) * 100)}%` : "3px", background: on ? color : "var(--border)", opacity: on && faded[i] ? 0.4 : 1 }}
              />
            </span>
          );
        })}
      </div>
      {target != null && target > 0 && <span className="pointer-events-none absolute inset-x-0 border-t border-dashed" style={{ bottom: `${(target / top) * 100}%`, borderColor: "var(--text-tertiary)", opacity: 0.7 }} />}
    </Frame>
  );
}

/** A line through the week with a dot on each day, the area under it fading out; the last point filled. */
function Line({ values, minSpan, color }: { values: Array<number | null>; minSpan: number; color: string }) {
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
      {xy.map((p, k) => {
        const last = k === xy.length - 1;
        return <span key={k} className="absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${p.x}%`, top: `${p.y}%`, background: last ? color : "var(--surface)", border: `2px solid ${color}` }} />;
      })}
    </Frame>
  );
}

/** Wake times as dots around the week's usual time (the dashed line): the closer to the line, the steadier. */
function Dots({ values, range, color }: { values: Array<number | null>; range: number; color: string }) {
  const n = values.length;
  return (
    <Frame>
      <span className="absolute inset-x-0 top-1/2 border-t border-dashed" style={{ borderColor: "var(--text-tertiary)", opacity: 0.7 }} />
      {values.map((v, i) =>
        v == null ? null : <span key={i} className="absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${slotX(i, n)}%`, top: `${50 + (Math.max(-range, Math.min(range, v)) / range) * 40}%`, background: color }} />,
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
