"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LocalDate } from "@/lib/dates";
import { Caption } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import type { TrendBar } from "@/lib/physique/sleepView";

// ── Tokens (DESIGN.md) ──
const COLOR_BAR = "#55555c";
const COLOR_BAR_LATEST = "#f2f2f0";
const COLOR_GOAL = "#6f6f76";
const COLOR_LABEL = "#6f6f76";

const HEIGHT = 128;
const PAD_TOP = 10;
const PAD_BOTTOM = 18;
const PAD_RIGHT = 32;

/**
 * 14 nights as bars with a dashed goal line, the engine's one-sentence
 * read above them. No bar on an unlogged night; the selected night is
 * white, and tapping a night selects it.
 */
export default function SleepTrend({ bars, goalH, selected, onSelect, children }: { bars: TrendBar[]; goalH: number; selected?: LocalDate; onSelect?: (d: LocalDate) => void; children?: ReactNode }) {
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
  const barW = Math.max(4, slot * 0.55);
  const yOf = (h: number) => PAD_TOP + (1 - h / yMax) * innerH;
  const highlight = selected ?? logged[logged.length - 1]?.date;

  return (
    <section aria-label="Last 14 nights" className="rounded-[16px] p-4" style={{ background: "#141416" }}>
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0" }}>
          Last 14 nights
        </span>
        <Caption>
          {logged.length} logged{avgH != null ? ` · avg ${formatHoursMin(avgH * 60)}` : ""}
        </Caption>
      </div>
      {children && <div className="mt-2">{children}</div>}
      <div ref={ref} className="mt-3 w-full" style={{ height: HEIGHT }}>
        {width > 0 && (
          <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-label={`Hours asleep over the last 14 nights against a ${goalH} hour goal`} className="block">
            <line x1={0} x2={innerW} y1={yOf(goalH)} y2={yOf(goalH)} stroke={COLOR_GOAL} strokeWidth={1} strokeDasharray="4 4" />
            <text x={innerW + 8} y={yOf(goalH) + 4} fontSize={11} fontWeight={500} fill={COLOR_LABEL} style={{ fontVariantNumeric: "tabular-nums" }}>
              {goalH}h
            </text>
            {bars.map((b, i) => {
              const cx = i * slot + slot / 2;
              return (
                <g key={b.date}>
                  {b.asleepH != null && (
                    <rect x={cx - barW / 2} y={yOf(b.asleepH)} width={barW} height={Math.max(2, yOf(0) - yOf(b.asleepH))} rx={2} fill={b.date === highlight ? COLOR_BAR_LATEST : COLOR_BAR} />
                  )}
                  <text x={cx} y={HEIGHT - 4} fontSize={10} fontWeight={500} fill={b.date === highlight ? COLOR_BAR_LATEST : COLOR_LABEL} textAnchor="middle">
                    {longLocalDate(b.date).charAt(0)}
                  </text>
                  {onSelect && (
                    <rect x={i * slot} y={0} width={slot} height={HEIGHT} fill="transparent" style={{ cursor: "pointer" }} onClick={() => onSelect(b.date)}>
                      <title>{`${longLocalDate(b.date)}${b.asleepH != null ? `, ${formatHoursMin(b.asleepH * 60)}` : ", not logged"}`}</title>
                    </rect>
                  )}
                </g>
              );
            })}
          </svg>
        )}
      </div>
    </section>
  );
}
