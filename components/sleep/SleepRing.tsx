"use client";

import type { ReactNode } from "react";

/**
 * Hours asleep against the goal as a ring (Bevel's and WHOOP's hero,
 * without a score): the arc is the share of the goal slept, capped at
 * a full circle; the centre carries the hours. Hand-rolled SVG.
 */
export default function SleepRing({ fraction, color, size = 136, stroke = 10, children, label }: { fraction: number; color: string; size?: number; stroke?: number; children: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block -rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1d1d20" strokeWidth={stroke} />
        {f > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * f} ${c}`} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}
