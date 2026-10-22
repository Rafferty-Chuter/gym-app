"use client";

import type { Connection, ConnectionId, SessionPoint } from "@/lib/physique/connections";
import { effectKg, formatEffect, type ReferenceLift } from "@/lib/physique/liftEffect";
import type { WeightUnit } from "@/lib/units";

/** Each condition in its measure's colour (DESIGN.md rev 4.2). */
export const CONNECTION_COLOR: Record<ConnectionId, string> = {
  sleep: "var(--chart-sleep)",
  wake: "var(--chart-sleep)",
  shortRun: "var(--chart-sleep)",
  carbs: "var(--macro-carb)",
  balance: "var(--macro-kcal)",
  balance3: "var(--macro-kcal)",
  protein: "var(--macro-protein)",
  alcohol: "var(--chart-heart)",
  time: "var(--chart-steps)",
  awake: "var(--chart-steps)",
  rest: "var(--chart-training)",
  lastSame: "var(--chart-training)",
  load: "var(--chart-training)",
  rate: "var(--chart-trend)",
  hrv: "var(--chart-heart)",
};

/** One outline glyph per condition (24 × 24, stroked). */
const ICON: Record<ConnectionId, string[]> = {
  sleep: ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"],
  carbs: ["M3 11h18a9 9 0 0 1-18 0z", "M8 11V7M12 11V5M16 11V8"],
  balance: ["M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2 3 0-3 .5-5.5.5-8z"],
  protein: ["M12 3c-3.5 0-6.5 5.5-6.5 10a6.5 6.5 0 0 0 13 0C18.5 8.5 15.5 3 12 3z"],
  alcohol: ["M7 3h10l-.8 6.5a4.2 4.2 0 0 1-8.4 0z", "M12 13.7V20", "M8.5 21h7"],
  time: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  rest: ["M4 6h16v14H4z", "M4 10h16M8 3v4M16 3v4"],
  rate: ["M4 17l6-6 4 4 6-7", "M15 8h5v5"],
  hrv: ["M3 12h4l2-4 3 8 2-4h7"],
  wake: ["M3 18h18", "M7 18a5 5 0 0 1 10 0", "M12 7v3", "M5.6 11.6l1.4 1.4", "M18.4 11.6l-1.4 1.4"],
  shortRun: ["M13 14A6 6 0 0 1 6 7a6 6 0 1 0 7 7z", "M21 17a5 5 0 0 1-6-6 5 5 0 1 0 6 6z"],
  balance3: ["M12 3c1 3 4.5 5 4.5 9a4.5 4.5 0 0 1-9 0c0-2.2 1.3-3.6 2.2-4.5.3 1.3.9 2.2 1.8 2.7 0-2.7.5-5 .5-7.2z", "M6 21h2M11 21h2M16 21h2"],
  awake: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"],
  lastSame: ["M4 6h16v14H4z", "M4 10h16M8 3v4M16 3v4", "M9 15h6"],
  load: ["M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"],
};

/** Who the two thirds are, in a word or two, for the session strip. */
const GROUPS: Record<ConnectionId, [high: string, low: string]> = {
  sleep: ["Longest nights", "Shortest nights"],
  carbs: ["Most carbs", "Fewest carbs"],
  balance: ["Most calories", "Fewest calories"],
  protein: ["Most protein", "Least protein"],
  alcohol: ["After drinking", "After none"],
  time: ["Latest sessions", "Earliest sessions"],
  rest: ["Longest breaks", "Shortest breaks"],
  rate: ["Weight trend", "Weight trend"],
  hrv: ["Highest HRV", "Lowest HRV"],
  wake: ["Woke early", "Usual wake"],
  shortRun: ["Two short nights", "The rest"],
  balance3: ["Most calories", "Fewest calories"],
  awake: ["Longest awake", "Soonest after waking"],
  lastSame: ["Longest gaps", "Shortest gaps"],
  load: ["Heaviest weeks", "Lightest weeks"],
};

const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;

export function Glyph({ id, color, small = false }: { id: ConnectionId; color: string; small?: boolean }) {
  return (
    <span className={`flex shrink-0 items-center justify-center ${small ? "h-6 w-6 rounded-[8px]" : "h-8 w-8 rounded-[10px]"}`} style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={small ? "h-[14px] w-[14px]" : "h-[18px] w-[18px]"}>
        {ICON[id].map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

/** Dots that would sit on top of each other step up and down instead (a small beeswarm), in percent of the strip's width. */
function swarm(points: readonly SessionPoint[], x: (pct: number) => number): Array<{ p: SessionPoint; left: number; dy: number }> {
  const placed: Array<{ p: SessionPoint; left: number; dy: number }> = [];
  for (const p of [...points].sort((a, b) => a.pct - b.pct)) {
    const left = x(p.pct);
    const dy = [0, -9, 9, -18, 18].find((o) => placed.every((q) => Math.abs(q.left - left) >= 3.2 || q.dy !== o)) ?? 0;
    placed.push({ p, left, dy });
  }
  return placed;
}

/**
 * Where a connection came from (PR3): each session in the two groups as a
 * dot against the lift's own usual, the lower group hollow on top and the
 * upper group filled below, each group's average marked, and the gap
 * between the averages. The founder: "an option to get a bit more
 * information ... where this came from, with graphs".
 */
export function SessionStrip({ c, lift, unit }: { c: Connection; lift: ReferenceLift | null; unit: WeightUnit }) {
  const color = CONNECTION_COLOR[c.id];
  const all = [...c.points.high, ...c.points.low].map((p) => Math.abs(p.pct));
  const span = Math.max(4, ...all) * 1.08;
  const x = (pct: number) => 50 + (pct / span) * 46;
  const [hiName, loName] = GROUPS[c.id];
  // IN5: the same size the headline gives: the lift's own read once it has the sessions.
  const liftPct = (lift ? c.perLift?.find((p) => p.name === lift.name && p.own)?.pct : undefined) ?? c.diffPct;
  const gap = lift ? formatEffect(effectKg(liftPct, lift.levelKg), unit) : signedPct(c.diffPct);
  const lo = x(c.low.pct);
  const hi = x(c.high.pct);
  const row = (label: string, points: readonly SessionPoint[], mean: number, filled: boolean, top: number) => (
    <>
      <span className="absolute left-0 text-[11px] font-medium" style={{ top: top - 40, color: filled ? color : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        {label}
      </span>
      {swarm(points, x).map(({ p, left, dy }) => (
        <span key={`${p.date}${filled}`} className="absolute h-[8px] w-[8px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${left}%`, top: top + dy, ...(filled ? { background: color } : { border: "1.5px solid var(--text-tertiary)", background: "var(--surface)" }) }} />
      ))}
      <span className="absolute w-[3px] -translate-x-1/2 rounded-full" style={{ left: `${x(mean)}%`, top: top - 14, height: 28, background: "var(--text)" }} />
    </>
  );
  return (
    <div className="pt-1">
      <div className="relative h-[190px]" role="img" aria-label={`${c.low.sessions} sessions after ${c.low.value} averaged ${signedPct(c.low.pct)} against usual; ${c.high.sessions} after ${c.high.value} averaged ${signedPct(c.high.pct)}.`}>
        <span className="absolute border-l border-dashed" style={{ left: "50%", top: 24, bottom: 20, borderColor: "var(--text-tertiary)" }} />
        {row(c.kind === "yesno" ? loName : `${loName} · ${c.low.value}`, c.points.low, c.low.pct, false, 48)}
        {/* The gap between the two averages, for a clear difference only: a gap inside the noise is not one. */}
        {c.state === "linked" && (
          <>
            <span className="absolute border-x border-b" style={{ left: `${Math.min(lo, hi)}%`, width: `${Math.abs(hi - lo)}%`, top: 72, height: 6, borderColor: "var(--text-secondary)" }} />
            <span className="absolute -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold" style={{ left: `${(lo + hi) / 2}%`, top: 80, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {gap}
            </span>
          </>
        )}
        {row(c.kind === "yesno" ? hiName : `${hiName} · ${c.high.value}`, c.points.high, c.high.pct, true, 144)}
        <span className="absolute inset-x-0 bottom-0 flex justify-between text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          <span>Weaker</span>
          <span>Your usual</span>
          <span>Stronger</span>
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
        Each dot is one day, its lifts against their own course. {c.low.sessions === c.high.sessions ? `${c.low.sessions} sessions in each group.` : `${c.low.sessions} and ${c.high.sessions} sessions.`}
      </p>
      {c.evidence && (
        <p className="mt-1.5 text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          Studies: {c.evidence.text}
        </p>
      )}
    </div>
  );
}
