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
const PAD_RIGHT = 50;

/**
 * Two weeks of nights (S8, after WHOOP's hours bars): hours asleep as bars
 * against a line at the person's usual (C7), with the averages above them (S10). A night with
 * nothing recorded is an empty slot, not a warning. Tapping a night opens
 * it above.
 */
export default function NightBars({ bars, refH, selected, onSelect, note }: { bars: TrendBar[]; /** The person's usual night (C7), or null without one. */ refH: number | null; selected: LocalDate; onSelect: (d: LocalDate) => void; note?: ReactNode }) {
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
  const yMax = Math.ceil(Math.max(refH ?? 0, ...logged.map((b) => b.asleepH as number)) + 1);
  const innerW = Math.max(1, width - PAD_RIGHT);
  const innerH = HEIGHT - PAD_TOP - PAD_BOTTOM;
  const slot = innerW / Math.max(1, bars.length);
  const barW = Math.max(6, slot * 0.56);
  const yOf = (h: number) => PAD_TOP + (1 - h / yMax) * innerH;

  return (
    <SCard
      title="Last 14 nights"
      label="Last 14 nights"
      className="px-4 pb-3 pt-4"
    >
      {note && <div className="pb-3">{note}</div>}
      <div ref={ref} className="w-full" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={`Hours asleep over the last 14 nights${refH != null ? `, with a line at your usual ${formatHoursMin(refH * 60)}` : ""}`} className="block">
            {refH != null && (
              <>
                <line x1={0} x2={innerW} y1={yOf(refH)} y2={yOf(refH)} style={{ stroke: "var(--sl-text-tertiary)" }} strokeWidth={1} strokeDasharray="4 4" />
                <text x={innerW + 6} y={yOf(refH) - 2} fontSize={10} fontWeight={500} style={{ fill: "var(--sl-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                  usual
                </text>
                <text x={innerW + 6} y={yOf(refH) + 10} fontSize={10} fontWeight={500} style={{ fill: "var(--sl-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                  {formatHoursMin(refH * 60)}
                </text>
              </>
            )}
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
