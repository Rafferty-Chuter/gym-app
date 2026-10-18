"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { SCard } from "@/components/sleep/parts";
import type { LocalDate } from "@/lib/dates";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { TrendBar } from "@/lib/physique/sleepView";

const HEIGHT = 132;
const PAD_TOP = 10;
const PAD_BOTTOM = 18;
const PAD_RIGHT = 30;

/**
 * Two weeks of nights (S8, after WHOOP's hours-vs-need bars): hours asleep
 * as bars against the goal line. A night with nothing recorded is an
 * empty slot, not a warning. Tapping a night opens it above.
 */
export default function NightBars({ bars, goalH, selected, onSelect, note }: { bars: TrendBar[]; goalH: number; selected: LocalDate; onSelect: (d: LocalDate) => void; note?: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
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

  const logged = bars.filter((b) => b.asleepH != null);
  const avgH = logged.length ? logged.reduce((s, b) => s + (b.asleepH as number), 0) / logged.length : null;
  const yMax = Math.ceil(Math.max(goalH, ...logged.map((b) => b.asleepH as number)) + 1);
  const innerW = Math.max(1, width - PAD_RIGHT);
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = innerW / Math.max(1, bars.length);
  const barW = Math.max(6, slot * 0.56);
  const yOf = (h: number) => PAD_TOP + (1 - h / yMax) * innerH;

  return (
    <SCard
      title="Last 14 nights"
      aside={
        avgH != null ? (
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--sl-text-tertiary)" }}>
            Avg {formatHoursMin(avgH * 60)}
          </span>
        ) : null
      }
      label="Last 14 nights"
      className="px-4 pb-3 pt-4"
    >
      {note && <div className="pb-3">{note}</div>}
      <div ref={ref} className="w-full" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={`Hours asleep over the last 14 nights against a ${goalH} hour goal`} className="block">
            <line x1={0} x2={innerW} y1={yOf(goalH)} y2={yOf(goalH)} style={{ stroke: "var(--sl-text-tertiary)" }} strokeWidth={1} strokeDasharray="4 4" />
            <text x={innerW + 6} y={yOf(goalH) + 4} fontSize={11} fontWeight={500} style={{ fill: "var(--sl-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
              {goalH}h
            </text>
            {bars.map((b, i) => {
              const cx = i * slot + slot / 2;
              const on = b.date === selected;
              return (
                <g key={b.date}>
                  {b.asleepH != null && (
                    <rect x={cx - barW / 2} y={yOf(b.asleepH)} width={barW} height={Math.max(2, yOf(0) - yOf(b.asleepH))} rx={3} style={{ fill: on ? "var(--sl-accent)" : "var(--sl-accent-dim)" }} />
                  )}
                  <text x={cx} y={HEIGHT - 4} fontSize={10} fontWeight={on ? 600 : 500} textAnchor="middle" style={{ fill: on ? "var(--sl-text)" : "var(--sl-text-tertiary)" }}>
                    {longLocalDate(b.date).charAt(0)}
                  </text>
                  <rect x={i * slot} y={0} width={slot} height={HEIGHT} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onSelect(b.date)}>
                    <title>{`${longLocalDate(b.date)}${b.asleepH != null ? `, ${formatHoursMin(b.asleepH * 60)}` : ""}`}</title>
                  </rect>
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </SCard>
  );
}
