"use client";

import { type ReactNode, useMemo, useState } from "react";
import { CONN_MIN_HISTORY_DAYS, CONN_MIN_SESSIONS, type Connection, type ConnectionId, type ConnectionsResult } from "@/lib/physique/connections";
import { connectionWords } from "@/lib/physique/connectionWords";
import type { ReferenceLift } from "@/lib/physique/liftEffect";
import { conditionNoun, GATE_MAX_MORE, glueNumbers, liftLinks, linkValue, nameList, type GateRow, type LinkRow } from "@/lib/physique/liftLinks";
import { connectionSubject } from "@/lib/physique/askAbout";
import type { WeightUnit } from "@/lib/units";
import { CONNECTION_COLOR, Glyph, SessionStrip } from "@/components/report/Connections";
import AskWhy from "@/components/progress/AskWhy";

const divider = { borderTop: "1px solid var(--border)" };
const colorOf = (id: ConnectionId) => (CONNECTION_COLOR as Partial<Record<ConnectionId, string>>)[id] ?? "var(--text-secondary)";
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Weeks of history the first read needs. */
const MIN_WEEKS = Math.round(CONN_MIN_HISTORY_DAYS / 7);

function Caret({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform" style={{ color: "var(--text-tertiary)", transform: open ? "rotate(180deg)" : undefined }} aria-hidden>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

/** A link's sessions and, on Progress, the way to them on the charts (the working, 08 IN10). */
function Opened({ c, result, lift, unit, onShow, shown }: { c: Connection; result: ConnectionsResult; lift: ReferenceLift | null; unit: WeightUnit; onShow?: () => void; shown: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-4">
      <SessionStrip c={c} lift={lift} unit={unit} />
      {onShow && (
        <button type="button" onClick={onShow} aria-pressed={shown} className="flex min-h-[44px] w-fit items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          {shown ? "Shown on the charts below" : "Mark these days on the charts"}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
      <AskWhy subject={connectionSubject(c, result, lift, unit)} />
    </div>
  );
}

/**
 * One clear link on the lift (WHOOP's Behavior Insights row): the plain
 * finding, then a bar out from the middle of one axis (weaker left,
 * stronger right) in the condition's colour with its kilos of estimated
 * 1RM at the end, then both groups' numbers.
 */
function LinkedRow({ r, max, result, lift, unit, open, onToggle, onShow, shown }: { r: LinkRow; max: number; result: ConnectionsResult; lift: ReferenceLift | null; unit: WeightUnit; open: boolean; onToggle: () => void; onShow?: () => void; shown: boolean }) {
  const words = connectionWords(r.c, lift, unit);
  const value = linkValue(r.c, lift, unit);
  const size = Math.abs(r.kg ?? r.pct);
  const half = max > 0 ? Math.max(4, (size / max) * 50) : 0;
  const color = colorOf(r.c.id);
  return (
    <div style={divider}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]" aria-label={`${r.title}: estimated 1RM ${value}. ${cap(words.numbers)}.${words.overlap ? ` ${words.overlap}` : ""} ${open ? "Hide" : "Show"} the sessions`}>
        <Glyph id={r.c.id} color={color} />
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
            {r.title}
          </span>
          <span className="flex items-center gap-3">
            <span className="relative block h-[6px] min-w-0 flex-1 rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
              <span className="absolute -top-[3px] h-[12px] w-[2px] -translate-x-1/2 rounded-full" style={{ left: "50%", background: "var(--text-tertiary)" }} />
              <span className="absolute inset-y-0 rounded-full" style={{ ...(r.pct >= 0 ? { left: "50%" } : { right: "50%" }), width: `${half}%`, background: color }} />
            </span>
            <span className="w-[56px] shrink-0 text-right text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {value}
            </span>
          </span>
          <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {glueNumbers(cap(words.numbers))}
          </span>
          {words.overlap && (
            <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
              {words.overlap}
            </span>
          )}
        </span>
        <span className="pt-0.5">
          <Caret open={open} />
        </span>
      </button>
      {open && <Opened c={r.c} result={result} lift={lift} unit={unit} onShow={onShow} shown={shown} />}
    </div>
  );
}

/** "About 12 more sessions", "100+ more sessions": rounded once it's past ten, as the count is an estimate. */
function moreWords(n: number): string {
  const v = n <= 10 ? n : Math.round(n / 5) * 5;
  return `about ${v} more ${v === 1 ? "session" : "sessions"}`;
}

/** One condition read but not yet able to show 3 kg (the signal gate): how far along, and about how many more sessions. */
function GateLine({ g }: { g: GateRow }) {
  return (
    <li className="flex flex-col gap-1.5 py-2" style={divider}>
      <span className="flex items-baseline justify-between gap-3 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: "var(--text-secondary)" }}>{cap(g.noun)}</span>
        <span style={{ color: "var(--text-secondary)" }}>{g.more != null ? cap(moreWords(g.more)) : `Over ${GATE_MAX_MORE} more sessions`}</span>
      </span>
      {g.share != null && (
        <span className="block h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(g.share * 100)} aria-label={`${cap(g.noun)}: about ${Math.round(g.share * 100)}% of the sessions needed`}>
          <span className="block h-full rounded-full" style={{ width: `${Math.max(4, g.share * 100)}%`, background: "var(--text-secondary)" }} />
        </span>
      )}
    </li>
  );
}

/** A folded group of conditions: one line with their names, opening to a row each. */
function Fold({ title, names, aside, open, onToggle, children }: { title: string; names: string[]; aside?: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <div style={divider}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]">
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
            {title}
          </span>
          <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            {cap(nameList(names))}
          </span>
          {aside && (
            <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {aside}
            </span>
          )}
        </span>
        <Caret open={open} />
      </button>
      {open && children}
    </div>
  );
}

/**
 * Before the first read: the sessions and weeks so far against what the
 * comparisons need, and roughly when at the person's own pace (PR3d). The
 * bar is not lowered to show something sooner.
 */
function Building({ result }: { result: ConnectionsResult }) {
  const left = Math.max(0, CONN_MIN_SESSIONS - result.sessions);
  const weeksLeft = Math.max(result.recentPerWeek > 0 ? Math.ceil(left / result.recentPerWeek) : 0, MIN_WEEKS - result.weeks);
  const share = Math.min(result.sessions / CONN_MIN_SESSIONS, result.weeks / MIN_WEEKS, 1);
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-4">
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(share * 100)} aria-label="Towards the first read">
        <div className="h-full rounded-full" style={{ width: `${Math.max(3, share * 100)}%`, background: "var(--primary)" }} />
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
        <span style={{ color: "var(--text)" }}>
          {Math.min(result.sessions, CONN_MIN_SESSIONS)} of {CONN_MIN_SESSIONS} sessions · {Math.min(result.weeks, MIN_WEEKS)} of {MIN_WEEKS} weeks
        </span>
        <span className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
          {result.recentPerWeek > 0 || left === 0 ? `About ${weeksLeft} ${weeksLeft === 1 ? "week" : "weeks"} to go` : "Log sessions to start"}
        </span>
      </div>
      <span className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
        Then sleep, food, rest and timing are each checked against your lifts.
      </span>
    </div>
  );
}

type FoldId = "notYet" | "noLink" | null;

/**
 * What moves your lift (IN10; IN5's Connections, one lift at a time): the
 * clear links for the chosen main lift on one weaker-to-stronger axis, in
 * kilos of estimated 1RM, largest first, then "Not enough to tell yet" and
 * "No clear link" folded to a line each (the plan's two gates, both
 * visible). A row opens the sessions behind it; on Progress they can be
 * marked on the charts. Facts from the person's own sessions, never advice.
 */
export default function LiftLinks({ result, lifts, unit, onShow, shownKey = null }: { result: ConnectionsResult; /** Main lifts with their levels, the one trained most first; kilos are put on the chosen one. */ lifts: readonly ReferenceLift[]; unit: WeightUnit; /** Progress: mark a link's weaker days on the charts. */ onShow?: (c: Connection, lift: ReferenceLift | null) => void; /** The marked link, as `lift:<lift name>:<condition>`. */ shownKey?: string | null }) {
  const [liftName, setLiftName] = useState<string | null>(null);
  const lift = lifts.find((l) => l.name === liftName) ?? lifts[0] ?? null;
  const model = useMemo(() => liftLinks(result, lift), [result, lift]);
  const [open, setOpen] = useState<ConnectionId | null>(null);
  const [fold, setFold] = useState<FoldId>(null);
  if (result.sessions === 0) return null;
  const max = Math.max(0, ...model.linked.map((r) => Math.abs(r.kg ?? r.pct)));
  const sources = [...new Set(model.linked.flatMap((r) => (r.c.evidence ? [r.c.evidence.source] : [])))];
  const read = result.items.length > 0;
  const gated = model.notYet.filter((g) => g.c);
  const leftOut = model.notYet.filter((g) => !g.c);
  const nearest = gated.find((g) => g.more != null && g.more === model.soonest) ?? null;
  const toggle = (id: ConnectionId) => setOpen(open === id ? null : id);
  return (
    <section aria-label="What moves your lift" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex flex-col gap-0.5 px-4 pb-3 pt-4">
        {/* The lift is picked in the title itself: "What moves your [squat ▾]"; the heading names it for screen readers, the picker sits beside it. */}
        <div className="-my-1.5 flex min-w-0 flex-wrap items-center gap-x-1.5">
          <h2 className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
            What moves your{" "}
            <span className={lifts.length > 1 ? "sr-only" : undefined}>{lift ? lift.name.toLowerCase() : "lifts"}</span>
          </h2>
          {/* A 44px tap target around a 30px pill. */}
          {lifts.length > 1 && (
            <span className="relative flex h-[44px] items-center">
              <span className="pointer-events-none absolute inset-x-0 top-[7px] bottom-[7px] rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden />
              <select aria-label="Lift" value={lift?.name ?? ""} onChange={(e) => setLiftName(e.target.value)} className="relative h-[44px] appearance-none rounded-full bg-transparent py-0 pl-3 pr-7 text-[15px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]" style={{ color: "var(--text)" }}>
                {lifts.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name.toLowerCase()}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none absolute right-2.5 h-3 w-3" style={{ color: "var(--text-secondary)" }} aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </span>
          )}
        </div>
        {read && (
          <span className="text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            Est. 1RM vs your usual · {result.sessions} sessions, {result.weeks} weeks
          </span>
        )}
      </div>

      {!read &&
        (result.sessions < CONN_MIN_SESSIONS || result.weeks < MIN_WEEKS ? (
          <Building result={result} />
        ) : (
          <p className="px-4 pb-4 text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            Once sleep, food or weigh-ins are logged alongside your sessions.
          </p>
        ))}

      {/* Over the bars' ends: past the glyph (16 + 32 + 12 px), short of the value and caret (56 + 12 + 12 + 16 + 16 px). */}
      {model.linked.length > 0 && (
        <div className="flex justify-between pb-1.5 pl-[60px] pr-[112px] text-[11px] font-medium" style={{ color: "var(--text-secondary)" }} aria-hidden>
          <span>Weaker</span>
          <span>Stronger</span>
        </div>
      )}
      {model.linked.map((r) => (
        <LinkedRow key={r.c.id} r={r} max={max} result={result} lift={lift} unit={unit} open={open === r.c.id} onToggle={() => toggle(r.c.id)} onShow={onShow ? () => onShow(r.c, lift) : undefined} shown={shownKey === `lift:${lift?.name ?? ""}:${r.c.id}`} />
      ))}

      {model.notYet.length > 0 && (
        <Fold title="Not enough to tell yet" names={model.notYet.map((g) => g.noun)} aside={nearest ? `Nearest: ${nearest.noun}, ${moreWords(nearest.more!)}` : undefined} open={fold === "notYet"} onToggle={() => setFold(fold === "notYet" ? null : "notYet")}>
          <ul className="px-4 pb-3">
            {gated.map((g) => (
              <GateLine key={g.id} g={g} />
            ))}
            {/* Left out by the engine: too few sessions to make two groups of 10 over 6 weeks. */}
            {leftOut.length > 0 && (
              <li className="py-2 text-[12px] leading-snug" style={{ ...divider, color: "var(--text-secondary)" }}>
                Too few sessions to compare yet: {nameList(leftOut.map((g) => g.noun), 4)}
              </li>
            )}
          </ul>
        </Fold>
      )}

      {model.noLink.length > 0 && (
        <Fold title="No clear link" names={model.noLink.map((c) => conditionNoun(c.id, c.label))} open={fold === "noLink"} onToggle={() => setFold(fold === "noLink" ? null : "noLink")}>
          {model.noLink.map((c) => {
            const isOpen = open === c.id;
            return (
              <div key={c.id} style={divider}>
                <button type="button" onClick={() => toggle(c.id)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors active:bg-[var(--surface-raised)]">
                  <Glyph id={c.id} color="var(--text-tertiary)" small />
                  <span className="min-w-0 flex-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    {c.label}
                  </span>
                  <span className="shrink-0 text-right text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {glueNumbers(cap(connectionWords(c, lift, unit).values))}
                  </span>
                  <Caret open={isOpen} />
                </button>
                {isOpen && <Opened c={c} result={result} lift={lift} unit={unit} shown={false} />}
              </div>
            );
          })}
        </Fold>
      )}

      {sources.length > 0 && (
        <details className="px-4" style={divider}>
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center gap-1 text-[12px] font-medium [&::-webkit-details-marker]:hidden" style={{ color: "var(--text-secondary)" }}>
            Sources
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </summary>
          <ul className="flex flex-col gap-1 pb-3.5 text-[11px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            {sources.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
