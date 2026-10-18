"use client";

import { parseClock } from "@/lib/physique/dayTotals";
import { formatHoursMin } from "@/lib/physique/dayTotals";

/** Degrees clockwise from the top for a clock time: midnight at the top, 06:00 on the right (Bevel's dial). */
function angleOf(min: number): number {
  return ((((min % 1440) + 1440) % 1440) / 1440) * 360;
}

function point(cx: number, cy: number, r: number, deg: number): [number, number] {
  const rad = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
}

/** An arc clockwise from `from` to `to` minutes. */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const a0 = angleOf(from);
  let sweep = angleOf(to) - a0;
  if (sweep <= 0) sweep += 360;
  const [x0, y0] = point(cx, cy, r, a0);
  const [x1, y1] = point(cx, cy, r, a0 + sweep);
  return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${sweep > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

const HOUR_LABELS: Array<{ min: number; text: string }> = [
  { min: 0, text: "00" },
  { min: 360, text: "06" },
  { min: 720, text: "12" },
  { min: 1080, text: "18" },
];

/**
 * Tonight on a 24-hour dial (S8, after Bevel's planner): the sleep window
 * from bedtime to wake as a periwinkle arc, the wind-down before it in a
 * dimmer tone, a dot at each end and tonight's need in the middle.
 */
export default function SleepDial({ windDown, bedtime, wake, needH, size = 232 }: { windDown: string; bedtime: string; wake: string; needH: number; size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const stroke = 16;
  const r = size / 2 - stroke / 2 - 4;
  const wd = parseClock(windDown) ?? 0;
  const bed = parseClock(bedtime) ?? 0;
  const up = parseClock(wake) ?? 0;
  const [bx, by] = point(cx, cy, r, angleOf(bed));
  const [ux, uy] = point(cx, cy, r, angleOf(up));
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Wind down at ${windDown}, lights out at ${bedtime}, wake at ${wake}, ${formatHoursMin(needH * 60)} of sleep`} className="block">
      <circle cx={cx} cy={cy} r={r} fill="none" style={{ stroke: "var(--sl-surface-raised)" }} strokeWidth={stroke} />
      {Array.from({ length: 24 }, (_, h) => {
        const [x0, y0] = point(cx, cy, r - stroke / 2 - 6, h * 15);
        const [x1, y1] = point(cx, cy, r - stroke / 2 - (h % 6 === 0 ? 14 : 10), h * 15);
        return <line key={h} x1={x0} y1={y0} x2={x1} y2={y1} style={{ stroke: "var(--sl-text-tertiary)" }} strokeWidth={h % 6 === 0 ? 1.5 : 1} strokeLinecap="round" opacity={h % 6 === 0 ? 0.9 : 0.45} />;
      })}
      {HOUR_LABELS.map((l) => {
        const [x, y] = point(cx, cy, r - stroke / 2 - 26, angleOf(l.min));
        return (
          <text key={l.min} x={x} y={y + 4} textAnchor="middle" fontSize={11} fontWeight={500} style={{ fill: "var(--sl-text-tertiary)" }}>
            {l.text}
          </text>
        );
      })}
      <path d={arc(cx, cy, r, wd, bed)} fill="none" style={{ stroke: "var(--sl-wind-down)" }} strokeWidth={stroke} strokeLinecap="round" />
      <path d={arc(cx, cy, r, bed, up)} fill="none" style={{ stroke: "var(--sl-accent)" }} strokeWidth={stroke} strokeLinecap="round" />
      <circle cx={bx} cy={by} r={5} style={{ fill: "var(--sl-bg)" }} />
      <circle cx={ux} cy={uy} r={5} style={{ fill: "var(--sl-bg)" }} />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={26} fontWeight={600} style={{ fill: "var(--sl-text)", fontVariantNumeric: "tabular-nums" }}>
        {formatHoursMin(needH * 60)}
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" fontSize={12} fontWeight={500} style={{ fill: "var(--sl-text-secondary)" }}>
        sleep tonight
      </text>
    </svg>
  );
}
