"use client";

import { ChartTip, useContainerWidth } from "@/components/charts/ChartTip";
import { usePick } from "@/components/charts/usePick";
import { STAGE_COLOR, STAGE_LABEL } from "@/components/sleep/parts";
import { formatClock, formatHoursMin, parseClock } from "@/lib/physique/dayTotals";
import type { SleepSegment, SleepStage } from "@/lib/physique/types";

/** Lanes top to bottom, as Bevel and WHOOP draw them. "Asleep" without a stage sits with core. */
const LANES: SleepStage[] = ["awake", "rem", "core", "deep"];
const laneOf = (s: SleepStage): number => (s === "asleep" ? 2 : LANES.indexOf(s));

const LANE_H = 30;
const LABEL_W = 46;
const AXIS_H = 18;

/**
 * The night's stages across time (S8, after Bevel's and WHOOP's stage
 * charts): one lane per stage, a coloured block per segment, bedtime and
 * wake under the ends and the hours between. Needs the segments that an
 * unaggregated Health Auto Export sends.
 */
export default function Hypnogram({ segments, bedtime }: { segments: SleepSegment[]; bedtime: string }) {
  const [ref, width] = useContainerWidth<HTMLDivElement>();

  const total = Math.max(1, ...segments.map((s) => s.o + s.d));
  const start = parseClock(bedtime) ?? 0;
  const innerW = Math.max(1, width - LABEL_W);
  const xOf = (o: number) => LABEL_W + (o / total) * innerW;
  const height = LANES.length * LANE_H + AXIS_H;
  // Hour ticks on the clock, between the ends.
  const ticks: number[] = [];
  for (let m = Math.ceil(start / 60) * 60 - start; m < total; m += 60) if (m > 20 && total - m > 20) ticks.push(m);
  // T1: a tap names the stage under it with its clock times; the arrow keys step block by block.
  const { active, bind } = usePick({
    xs: segments.map((s) => xOf(s.o + s.d / 2)),
    data: `${bedtime}:${segments.length}`,
    hit: (px) => {
      if (px < LABEL_W) return null;
      const o = ((px - LABEL_W) / innerW) * total;
      const k = segments.findIndex((s) => o >= s.o && o < s.o + s.d);
      return k >= 0 ? k : null;
    },
  });
  const seg = active != null ? segments[active] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      <div {...bind} role="group" aria-label={`Sleep stages from ${bedtime} to ${formatClock(start + total)}. Tap a block for its stage and times`} className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-[var(--sl-text-tertiary)]">
      {width > 0 && (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="block">
          {LANES.map((l, i) => (
            <g key={l}>
              <line x1={LABEL_W} x2={width} y1={i * LANE_H + LANE_H / 2} y2={i * LANE_H + LANE_H / 2} style={{ stroke: "var(--sl-border)" }} strokeWidth={1} />
              <text x={0} y={i * LANE_H + LANE_H / 2 + 4} fontSize={11} fontWeight={500} style={{ fill: "var(--sl-text-secondary)" }}>
                {STAGE_LABEL[l]}
              </text>
            </g>
          ))}
          {ticks.map((m) => (
            <line key={m} x1={xOf(m)} x2={xOf(m)} y1={0} y2={LANES.length * LANE_H} style={{ stroke: "var(--sl-border)" }} strokeWidth={1} strokeDasharray="2 4" />
          ))}
          {segments.slice(1).map((s, i) => {
            // A thin riser where one stage hands over to the next, so the night reads as one line.
            const prev = segments[i];
            const a = laneOf(prev.s);
            const b = laneOf(s.s);
            if (a === b) return null;
            const x = xOf(s.o);
            return <line key={`r${i}`} x1={x} x2={x} y1={Math.min(a, b) * LANE_H + LANE_H / 2} y2={Math.max(a, b) * LANE_H + LANE_H / 2} style={{ stroke: "var(--sl-text-tertiary)" }} strokeWidth={1} opacity={0.5} />;
          })}
          {segments.map((s, i) => {
            const lane = laneOf(s.s);
            const x = xOf(s.o);
            const w = Math.max(1.5, xOf(s.o + s.d) - x);
            return <rect key={i} x={x} y={lane * LANE_H + 6} width={w} height={LANE_H - 12} rx={3} style={{ fill: STAGE_COLOR[s.s] }} opacity={active != null && active !== i ? 0.35 : 1} />;
          })}
          <text x={LABEL_W} y={height - 4} fontSize={11} style={{ fill: "var(--sl-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {bedtime}
          </text>
          <text x={width} y={height - 4} fontSize={11} textAnchor="end" style={{ fill: "var(--sl-text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {formatClock(start + total)}
          </text>
        </svg>
      )}
      </div>
      {seg && (
        <ChartTip
          sleep
          x={xOf(seg.o + seg.d / 2)}
          y={laneOf(seg.s) * LANE_H + LANE_H / 2}
          width={width}
          title={STAGE_LABEL[seg.s]}
          rows={[
            { label: "From", value: `${formatClock(start + seg.o)} to ${formatClock(start + seg.o + seg.d)}` },
            { label: "For", value: seg.d >= 60 ? formatHoursMin(seg.d) : `${Math.round(seg.d)} min` },
          ]}
          w={150}
        />
      )}
    </div>
  );
}
