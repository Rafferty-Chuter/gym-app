"use client";

import { useState } from "react";
import { CONN_MIN_SESSIONS, type Connection, type ConnectionId, type ConnectionsResult, type SessionPoint } from "@/lib/physique/connections";
import { compareText, effectKg, formatEffect, type ReferenceLift } from "@/lib/physique/liftEffect";
import type { WeightUnit } from "@/lib/units";

/** Each condition in its measure's colour (DESIGN.md rev 4.2). */
export const CONNECTION_COLOR: Record<ConnectionId, string> = {
  sleep: "var(--chart-sleep)",
  carbs: "var(--macro-carb)",
  balance: "var(--macro-kcal)",
  protein: "var(--macro-protein)",
  time: "var(--chart-steps)",
  rest: "var(--chart-training)",
  rate: "var(--chart-trend)",
  hrv: "var(--chart-heart)",
};

/** One outline glyph per condition (24 × 24, stroked). */
const ICON: Record<ConnectionId, string[]> = {
  sleep: ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"],
  carbs: ["M3 11h18a9 9 0 0 1-18 0z", "M8 11V7M12 11V5M16 11V8"],
  balance: ["M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2 3 0-3 .5-5.5.5-8z"],
  protein: ["M12 3c-3.5 0-6.5 5.5-6.5 10a6.5 6.5 0 0 0 13 0C18.5 8.5 15.5 3 12 3z"],
  time: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 7v5l3 2"],
  rest: ["M4 6h16v14H4z", "M4 10h16M8 3v4M16 3v4"],
  rate: ["M4 17l6-6 4 4 6-7", "M15 8h5v5"],
  hrv: ["M3 12h4l2-4 3 8 2-4h7"],
};

/** Who the two thirds are, in a word or two, for the session strip. */
const GROUPS: Record<ConnectionId, [high: string, low: string]> = {
  sleep: ["Longest nights", "Shortest nights"],
  carbs: ["Most carbs", "Fewest carbs"],
  balance: ["Most calories", "Fewest calories"],
  protein: ["Most protein", "Least protein"],
  time: ["Latest sessions", "Earliest sessions"],
  rest: ["Longest breaks", "Shortest breaks"],
  rate: ["Weight trend", "Weight trend"],
  hrv: ["Highest HRV", "Lowest HRV"],
};

/** The condition as a noun, for "Moved with carbs". */
const NOUN: Record<ConnectionId, string> = { sleep: "sleep", carbs: "carbs", balance: "calories", protein: "protein", time: "time of day", rest: "rest days", rate: "the weight trend", hrv: "HRV" };

const divider = { borderTop: "1px solid var(--border)" };
const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;

function Glyph({ id, color }: { id: ConnectionId; color: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
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
function SessionStrip({ c, lift, unit }: { c: Connection; lift: ReferenceLift | null; unit: WeightUnit }) {
  const color = CONNECTION_COLOR[c.id];
  const all = [...c.points.high, ...c.points.low].map((p) => Math.abs(p.pct));
  const span = Math.max(4, ...all) * 1.08;
  const x = (pct: number) => 50 + (pct / span) * 46;
  const [hiName, loName] = GROUPS[c.id];
  const gap = lift ? formatEffect(effectKg(c.diffPct, lift.levelKg), unit) : signedPct(c.diffPct);
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
        {row(`${loName} · ${c.low.value}`, c.points.low, c.low.pct, false, 48)}
        {/* The gap between the two averages, for a clear difference only: a gap inside the noise is not one. */}
        {c.state === "linked" && (
          <>
            <span className="absolute border-x border-b" style={{ left: `${Math.min(lo, hi)}%`, width: `${Math.abs(hi - lo)}%`, top: 72, height: 6, borderColor: "var(--text-secondary)" }} />
            <span className="absolute -translate-x-1/2 whitespace-nowrap text-[12px] font-semibold" style={{ left: `${(lo + hi) / 2}%`, top: 80, color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {gap}
            </span>
          </>
        )}
        {row(`${hiName} · ${c.high.value}`, c.points.high, c.high.pct, true, 144)}
        <span className="absolute inset-x-0 bottom-0 flex justify-between text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          <span>Lighter</span>
          <span>Your usual</span>
          <span>Heavier</span>
        </span>
      </div>
      <p className="mt-2 text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
        Each dot is one session, its lifts against their own usual. {c.low.sessions === c.high.sessions ? `${c.low.sessions} sessions in each group.` : `${c.low.sessions} and ${c.high.sessions} sessions.`}
      </p>
      {c.evidence && (
        <p className="mt-1.5 text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          Studies: {c.evidence.text}
        </p>
      )}
    </div>
  );
}

function ConnectionRow({ c, lift, unit, open, onToggle, mergedWith }: { c: Connection; lift: ReferenceLift | null; unit: WeightUnit; open: boolean; onToggle: () => void; /** A clear difference that rose and fell with this one, which carries it (C7). */ mergedWith: ConnectionId | null }) {
  const linked = c.state === "linked";
  const color = linked ? CONNECTION_COLOR[c.id] : "var(--text-tertiary)";
  const effect = lift ? formatEffect(effectKg(c.diffPct, lift.levelKg), unit) : signedPct(c.diffPct);
  const compare = compareText(c.high.value, c.low.value);
  return (
    <div style={divider}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]" aria-label={`${c.label}: ${linked ? `${effect}${lift ? ` on ${lift.name}` : ""}, ${compare}` : "no clear link"}. ${open ? "Hide" : "Show"} the sessions`}>
        <Glyph id={c.id} color={color} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className={`text-[15px] ${linked ? "font-semibold" : ""}`} style={{ color: linked ? "var(--text)" : "var(--text-secondary)" }}>
            {c.label}
          </span>
          {linked && (
            <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {compare}
            </span>
          )}
          {c.movedWith && (
            <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
              Moved with {NOUN[c.movedWith]}
            </span>
          )}
        </span>
        {linked ? (
          <span className="flex shrink-0 flex-col items-end">
            <span className="text-[17px] font-semibold" style={{ color, fontVariantNumeric: "tabular-nums" }}>
              {effect}
            </span>
            {lift && (
              <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                on {lift.name.toLowerCase()}
              </span>
            )}
          </span>
        ) : (
          <span className="shrink-0 text-right text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {mergedWith ? `With ${NOUN[mergedWith]}` : "No clear link"}
          </span>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform" style={{ color: "var(--text-tertiary)", transform: open ? "rotate(180deg)" : undefined }} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {!linked && (
            <p className="mb-1 text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {mergedWith ? `${compare}. Rose and fell with ${NOUN[mergedWith]}, so the two can't be told apart.` : `${compare}: the two groups overlap.`}
            </p>
          )}
          <SessionStrip c={c} lift={lift} unit={unit} />
        </div>
      )}
    </div>
  );
}

/**
 * Connections (L1, C7, PR3): what lined up with the person's strongest and
 * weakest sessions, from `lib/physique/connections.ts`. One row for each
 * thing checked, clear links first and largest first: what was compared,
 * the two groups' values and the difference in kilos on the lift trained
 * most; the rest say "No clear link", so the search shows. A row opens the
 * sessions behind it. Facts, not advice; the explaining is left to the
 * assistant.
 */
export default function ConnectionsCard({ result, lift, unit }: { result: ConnectionsResult; /** The lift a difference is put in kilos on; percent without one. */ lift: ReferenceLift | null; unit: WeightUnit }) {
  const [open, setOpen] = useState<ConnectionId | null>(null);
  if (result.sessions === 0) return null;
  const sources = [...new Set(result.items.filter((c) => c.state === "linked").flatMap((c) => (c.evidence ? [c.evidence.source] : [])))];
  return (
    <section aria-label="Connections" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex flex-col gap-0.5 px-4 pb-3 pt-4">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          What lined up with your lifts
        </span>
        <span className="text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
          {result.checked > 0
            ? `${result.checked} ${result.checked === 1 ? "thing" : "things"} checked · ${result.sessions} sessions · ${result.weeks} weeks`
            : result.sessions < CONN_MIN_SESSIONS
              ? `From about ${CONN_MIN_SESSIONS} sessions with sleep or food logged alongside. ${result.sessions} so far.`
              : "Once sleep, food or weigh-ins are logged alongside your sessions."}
        </span>
      </div>

      {result.items.map((c) => (
        <ConnectionRow key={c.id} c={c} lift={lift} unit={unit} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} mergedWith={result.items.find((x) => x.movedWith === c.id)?.id ?? null} />
      ))}

      {sources.length > 0 && (
        <details className="px-4 pb-3.5 pt-2.5" style={divider}>
          <summary className="cursor-pointer text-[12px] font-medium" style={{ color: "var(--text-tertiary)" }}>
            Sources
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1 text-[11px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
            {sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
