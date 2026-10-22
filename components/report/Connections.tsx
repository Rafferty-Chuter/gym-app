"use client";

import { useState } from "react";
import { CONN_MIN_SESSIONS, type Connection, type ConnectionId, type ConnectionsResult, type SessionPoint } from "@/lib/physique/connections";
import { effectKg, formatEffect, type ReferenceLift } from "@/lib/physique/liftEffect";
import { CONNECTION_NOUN, connectionWords } from "@/lib/physique/connectionWords";
import type { WeightUnit } from "@/lib/units";
import { connectionSubject } from "@/lib/physique/askAbout";
import AskWhy from "@/components/progress/AskWhy";

/** Each condition in its measure's colour (DESIGN.md rev 4.2). */
export const CONNECTION_COLOR: Record<ConnectionId, string> = {
  sleep: "var(--chart-sleep)",
  wake: "var(--chart-sleep)",
  shortRun: "var(--chart-sleep)",
  carbs: "var(--macro-carb)",
  balance: "var(--macro-kcal)",
  balance3: "var(--macro-kcal)",
  protein: "var(--macro-protein)",
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

const divider = { borderTop: "1px solid var(--border)" };
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

/**
 * One thing checked (TR12). A clear link leads with one plain sentence
 * ("Your squat is about 5 kg heavier the day after a higher-carb day"),
 * the difference in bold, then both groups' numbers and, when another
 * condition moved on the same days, that it could be either. A row with
 * no clear difference stays quiet: its name and "No clear link".
 */
function ConnectionRow({ c, result, lift, unit, open, onToggle, mergedWith }: { c: Connection; result: ConnectionsResult; lift: ReferenceLift | null; unit: WeightUnit; open: boolean; onToggle: () => void; /** A clear difference that rose and fell with this one, which carries it (C7). */ mergedWith: ConnectionId | null }) {
  const linked = c.state === "linked";
  const color = linked ? CONNECTION_COLOR[c.id] : "var(--text-tertiary)";
  const words = connectionWords(c, lift, unit);
  const values = words.values.charAt(0).toUpperCase() + words.values.slice(1);
  const quiet = mergedWith ? `Counted with ${CONNECTION_NOUN[mergedWith]}` : "No clear link";
  return (
    <div style={divider}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]" aria-label={`${linked ? `${words.headline}. ${words.numbers}.${words.overlap ? ` ${words.overlap}` : ""}` : `${c.label}: ${quiet.toLowerCase()}.`} ${open ? "Hide" : "Show"} the sessions`}>
        <Glyph id={c.id} color={color} />
        {linked ? (
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[15px] leading-snug" style={{ color: "var(--text)" }}>
              {words.parts.before}
              <span className="font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                {words.parts.effect}
              </span>
              {words.parts.after}
            </span>
            <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {words.numbers}
            </span>
            {words.overlap && (
              <span className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
                {words.overlap}
              </span>
            )}
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1 text-[15px]" style={{ color: "var(--text-secondary)" }}>
              {c.label}
            </span>
            <span className="shrink-0 text-right text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              {quiet}
            </span>
          </>
        )}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform" style={{ color: "var(--text-tertiary)", transform: open ? "rotate(180deg)" : undefined }} aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="px-4 pb-4">
          {!linked && (
            <p className="mb-1 text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {mergedWith ? `${values}. Rose and fell with ${CONNECTION_NOUN[mergedWith]}, so the two can't be told apart.` : `${values}: the two groups overlap.`}
            </p>
          )}
          <SessionStrip c={c} lift={lift} unit={unit} />
          <div className="mt-3">
            <AskWhy subject={connectionSubject(c, result, lift, unit, mergedWith ? CONNECTION_NOUN[mergedWith] : null, c.movedWith ? CONNECTION_NOUN[c.movedWith] : null)} />
          </div>
        </div>
      )}
    </div>
  );
}

/** The conditions a first read covers, shown greyed while the sessions build up. */
const PREVIEW: ConnectionId[] = ["sleep", "balance", "carbs", "protein", "rest", "time"];

/**
 * Before the first read (PR3d): how many sessions so far against the
 * CONN_MIN_SESSIONS the comparisons need, roughly how many weeks that is at
 * the person's own recent pace, and what will be checked. The bar is not
 * lowered to show something sooner: a third of 24 sessions is already the
 * smallest group a difference can be read from.
 */
function Building({ sessions, perWeek }: { sessions: number; perWeek: number }) {
  const left = Math.max(0, CONN_MIN_SESSIONS - sessions);
  const weeks = perWeek > 0 ? Math.ceil(left / perWeek) : null;
  return (
    <div className="mt-2 flex flex-col gap-2.5">
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} role="progressbar" aria-valuemin={0} aria-valuemax={CONN_MIN_SESSIONS} aria-valuenow={sessions} aria-label="Sessions towards the first read">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (sessions / CONN_MIN_SESSIONS) * 100)}%`, background: "var(--primary)" }} />
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: "var(--text)" }}>
          {sessions} of {CONN_MIN_SESSIONS} sessions
        </span>
        <span style={{ color: "var(--text-tertiary)" }}>{weeks != null ? `About ${weeks} ${weeks === 1 ? "week" : "weeks"} at your pace` : "Log sessions to start"}</span>
      </div>
      <span className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
        Then sleep, food, rest and timing are each checked against your lifts.
      </span>
      <span className="flex gap-1.5" aria-hidden>
        {PREVIEW.map((id) => (
          <Glyph key={id} id={id} color="var(--text-tertiary)" small />
        ))}
      </span>
    </div>
  );
}

/**
 * Connections (L1, C7, PR3): what lined up with the person's strongest and
 * weakest sessions, from `lib/physique/connections.ts`. One row for each
 * thing checked, clear links first and largest first: a plain sentence
 * with the difference in kilos on the lift trained most, then the two
 * groups' values (TR12); the rest say "No clear link", so the search shows. A row opens the
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
        {result.checked > 0 ? (
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {result.checked} {result.checked === 1 ? "thing" : "things"} checked · {result.sessions} sessions · {result.weeks} weeks
          </span>
        ) : result.sessions < CONN_MIN_SESSIONS ? (
          <Building sessions={result.sessions} perWeek={result.recentPerWeek} />
        ) : (
          <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            Once sleep, food or weigh-ins are logged alongside your sessions.
          </span>
        )}
      </div>

      {result.items.map((c) => (
        <ConnectionRow key={c.id} c={c} result={result} lift={lift} unit={unit} open={open === c.id} onToggle={() => setOpen(open === c.id ? null : c.id)} mergedWith={result.items.find((x) => x.movedWith === c.id)?.id ?? null} />
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
