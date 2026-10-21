"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { computeNiceYAxis } from "@/lib/chartScale";
import { dayDiff, type LocalDate } from "@/lib/dates";

/**
 * Time-series chart for the physique layer (weight, expenditure, intake).
 *
 * Marks follow DESIGN.md: raw values are small low-contrast dots, drawn only
 * on days with a real value; the trend is a continuous 2px line between the
 * first and last trend values and never extends past them; the goal
 * projection is a dashed line; a target band is a flat rect. The y axis is
 * `computeNiceYAxis`. Tap or drag to scrub; the scrubbed day shows a tooltip
 * with the date, the raw value and the trend.
 */

export type TimeSeriesPoint = {
  date: LocalDate;
  /** A real measurement on this day; `null`/`undefined` draws no dot. */
  raw?: number | null;
  /** The smoothed value on this day; the line covers only days where it is present. */
  trend?: number | null;
};

export type Projection = { from: LocalDate; fromValue: number; to: LocalDate; toValue: number };

export type Band = { low: number; high: number };

type Props = {
  points: readonly TimeSeriesPoint[];
  unit?: string;
  decimals?: number;
  projection?: Projection | null;
  band?: Band | null;
  height?: number;
  /** Trend line colour. White by default; pass a status colour for verdict-coloured charts. */
  trendColor?: string;
  rawLabel?: string;
  trendLabel?: string;
  ariaLabel?: string;
  emptyText?: string;
};

// ── Tokens (DESIGN.md) ──
const COLOR_RAW = "var(--chart-raw)";
const COLOR_TREND = "var(--chart-trend)";
const COLOR_PROJECTION = "var(--text-tertiary)";
const COLOR_BAND = "var(--surface-raised)";
const COLOR_GRID = "var(--border)";
const COLOR_LABEL = "var(--text-tertiary)";
const COLOR_TOOLTIP_BG = "var(--surface-raised)";
const COLOR_TOOLTIP_BORDER = "var(--border)";

const PAD_LEFT = 6;
const PAD_RIGHT = 44;
const PAD_TOP = 14;
const PAD_BOTTOM = 24;
/** Pointer distance (px) beyond which a tap clears the scrub instead of selecting a day. */
const SCRUB_SNAP_PX = 28;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "6 Oct" from a local date key; no Date object so there is no timezone drift. */
export function shortLocalDate(date: LocalDate): string {
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return `${d} ${MONTHS[m - 1] ?? ""}`;
}

const DAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Saturday 17 October" for a page caption. */
export function fullLocalDate(date: LocalDate): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  return `${DAYS_LONG[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MONTHS_LONG[m - 1] ?? ""}`;
}

/** "Thu 16 Oct 2026" style label for tooltips. */
export function longLocalDate(date: LocalDate): string {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${dow} ${d} ${MONTHS[m - 1] ?? ""}`;
}

function useContainerWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) setWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

/** Pick about `count` evenly spaced day offsets for x labels, always including the first and last. */
function labelOffsets(span: number, count: number): number[] {
  if (span <= 0) return [0];
  const n = Math.max(2, Math.min(count, span + 1));
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.round((span * i) / (n - 1)));
  return [...new Set(out)];
}

export default function TimeSeriesChart({
  points,
  unit = "",
  decimals = 1,
  projection = null,
  band = null,
  height = 180,
  trendColor = COLOR_TREND,
  rawLabel = "Scale",
  trendLabel = "Trend",
  ariaLabel,
  emptyText = "Nothing logged yet.",
}: Props) {
  const [ref, width] = useContainerWidth<HTMLDivElement>();
  // The selection remembers which `points` it was made on, so new data clears it without an effect.
  const [sel, setSel] = useState<{ points: readonly TimeSeriesPoint[]; i: number } | null>(null);
  const active = sel && sel.points === points ? sel.i : null;
  const dragging = useRef(false);

  const hasData = points.some((p) => p.raw != null || p.trend != null);

  const geo = useMemo(() => {
    if (!hasData || width <= 0) return null;
    const firstDate = points[0].date;
    const lastDate = points[points.length - 1].date;
    const x0 = projection && projection.from < firstDate ? projection.from : firstDate;
    const x1 = projection && projection.to > lastDate ? projection.to : lastDate;
    const span = Math.max(1, dayDiff(x0, x1));
    const innerW = Math.max(1, width - PAD_LEFT - PAD_RIGHT);
    const innerH = Math.max(1, height - PAD_TOP - PAD_BOTTOM);
    const values: number[] = [];
    for (const p of points) {
      if (p.raw != null) values.push(p.raw);
      if (p.trend != null) values.push(p.trend);
    }
    if (projection) values.push(projection.fromValue, projection.toValue);
    if (band) values.push(band.low, band.high);
    const scale = computeNiceYAxis(values);
    const xOf = (date: LocalDate) => PAD_LEFT + (dayDiff(x0, date) / span) * innerW;
    const yOf = (v: number) => PAD_TOP + (1 - (v - scale.yMin) / (scale.yMax - scale.yMin)) * innerH;
    const trendPath = points
      .filter((p) => p.trend != null)
      .map((p, i) => `${i === 0 ? "M" : "L"}${xOf(p.date).toFixed(1)},${yOf(p.trend as number).toFixed(1)}`)
      .join(" ");
    const dots = points
      .map((p, i) => ({ i, p }))
      .filter(({ p }) => p.raw != null)
      .map(({ i, p }) => ({ i, x: xOf(p.date), y: yOf(p.raw as number) }));
    const scrubbable = points.map((p, i) => ({ i, x: xOf(p.date), has: p.raw != null || p.trend != null })).filter((d) => d.has);
    const xLabels = labelOffsets(span, width < 480 ? 4 : 6).map((off) => {
      const x = PAD_LEFT + (off / span) * innerW;
      return { x, text: shortLocalDate(addDaysLocal(x0, off)) };
    });
    return { x0, x1, span, innerW, innerH, scale, xOf, yOf, trendPath, dots, scrubbable, xLabels };
  }, [points, projection, band, width, height, hasData]);

  function pick(clientX: number, clear: boolean) {
    if (!geo || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let best: { i: number; d: number } | null = null;
    for (const s of geo.scrubbable) {
      const d = Math.abs(s.x - x);
      if (!best || d < best.d) best = { i: s.i, d };
    }
    if (!best) return;
    if (clear && best.d > SCRUB_SNAP_PX) {
      setSel(null);
      return;
    }
    setSel({ points, i: best.i });
  }

  if (!hasData) {
    return (
      <div
        ref={ref}
        className="flex items-center justify-center rounded-[16px] text-[13px]"
        style={{ height, color: "var(--text-secondary)", background: "var(--surface)" }}
      >
        {emptyText}
      </div>
    );
  }

  const activePoint = active != null ? points[active] : null;
  const activeX = activePoint && geo ? geo.xOf(activePoint.date) : null;
  const fmt = (v: number) => `${v.toFixed(decimals)}${unit ? ` ${unit}` : ""}`;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height, touchAction: "pan-y" }}>
      {geo && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={ariaLabel ?? `${trendLabel} chart, ${points.length} days`}
          className="block"
          onPointerDown={(e) => {
            dragging.current = true;
            (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
            pick(e.clientX, true);
          }}
          onPointerMove={(e) => {
            if (dragging.current) pick(e.clientX, false);
          }}
          onPointerUp={() => {
            dragging.current = false;
          }}
          onPointerCancel={() => {
            dragging.current = false;
          }}
        >
          {band && (
            <rect
              x={PAD_LEFT}
              y={geo.yOf(band.high)}
              width={geo.innerW}
              height={Math.max(1, geo.yOf(band.low) - geo.yOf(band.high))}
              fill={COLOR_BAND}
              rx={2}
            />
          )}
          {geo.scale.ticks.map((t) => (
            <g key={t}>
              <line x1={PAD_LEFT} x2={PAD_LEFT + geo.innerW} y1={geo.yOf(t)} y2={geo.yOf(t)} stroke={COLOR_GRID} strokeWidth={1} />
              <text
                x={PAD_LEFT + geo.innerW + 8}
                y={geo.yOf(t) + 4}
                fontSize={11}
                fontWeight={500}
                fill={COLOR_LABEL}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {Number.isInteger(t) ? t : t.toFixed(1)}
              </text>
            </g>
          ))}
          {geo.xLabels.map((l, i) => (
            <text
              key={i}
              x={l.x}
              y={height - 6}
              fontSize={11}
              fontWeight={500}
              fill={COLOR_LABEL}
              textAnchor={i === 0 ? "start" : i === geo.xLabels.length - 1 ? "end" : "middle"}
            >
              {l.text}
            </text>
          ))}
          {projection && (
            <line
              x1={geo.xOf(projection.from)}
              y1={geo.yOf(projection.fromValue)}
              x2={geo.xOf(projection.to)}
              y2={geo.yOf(projection.toValue)}
              stroke={COLOR_PROJECTION}
              strokeWidth={1.5}
              strokeDasharray="4 4"
              strokeLinecap="round"
            />
          )}
          {geo.dots.map((d) => (
            <circle key={d.i} cx={d.x} cy={d.y} r={2} fill={COLOR_RAW} />
          ))}
          {geo.trendPath && (
            <path d={geo.trendPath} fill="none" stroke={trendColor} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          )}
          {activePoint && activeX != null && (
            <g>
              <line x1={activeX} x2={activeX} y1={PAD_TOP} y2={PAD_TOP + geo.innerH} stroke="var(--border-strong)" strokeWidth={1} />
              {activePoint.raw != null && <circle cx={activeX} cy={geo.yOf(activePoint.raw)} r={4} fill={COLOR_TREND} stroke="var(--background)" strokeWidth={1.5} />}
              {activePoint.trend != null && <circle cx={activeX} cy={geo.yOf(activePoint.trend)} r={3.5} fill={trendColor} stroke="var(--background)" strokeWidth={1.5} />}
            </g>
          )}
        </svg>
      )}
      {activePoint && activeX != null && geo && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 rounded-[8px] px-2.5 py-1.5 text-[11px] leading-snug"
          style={{
            left: Math.min(Math.max(activeX - 60, 0), Math.max(0, width - 124)),
            width: 124,
            background: COLOR_TOOLTIP_BG,
            border: `1px solid ${COLOR_TOOLTIP_BORDER}`,
            color: "var(--text-secondary)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <div style={{ color: "var(--text-tertiary)", letterSpacing: "0.04em" }}>{longLocalDate(activePoint.date)}</div>
          {activePoint.raw != null && (
            <div className="flex justify-between gap-2">
              <span>{rawLabel}</span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{fmt(activePoint.raw)}</span>
            </div>
          )}
          {activePoint.trend != null && (
            <div className="flex justify-between gap-2">
              <span>{trendLabel}</span>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>{fmt(activePoint.trend)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Local add-days without going through Date for the label grid. */
function addDaysLocal(date: LocalDate, days: number): LocalDate {
  const y = Number(date.slice(0, 4));
  const m = Number(date.slice(5, 7));
  const d = Number(date.slice(8, 10));
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}
