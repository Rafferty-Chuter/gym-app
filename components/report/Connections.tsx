"use client";

import type { ReactNode } from "react";
import { CONN_MIN_SESSIONS, type Connection, type ConnectionId, type ConnectionsResult } from "@/lib/physique/connections";

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

const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const divider = { borderTop: "1px solid var(--border)" };
/** The bars' half-width stands for this many percent at least, so a small difference looks small. OURS: 5%, about two sessions' spread. */
const SCALE_MIN_PCT = 5;

/** How much stronger or weaker, as a bar from the centre: right for stronger, left for weaker (after WHOOP's impact bars). */
function ImpactBar({ pct, scale, color }: { pct: number; scale: number; color: string }) {
  const w = Math.min(50, (Math.abs(pct) / scale) * 50);
  return (
    <span className="relative block h-2.5 w-full rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
      <span className="absolute inset-y-[-3px] left-1/2 w-px" style={{ background: "var(--text-tertiary)" }} />
      <span className="absolute inset-y-0 rounded-full" style={{ background: color, width: `${w}%`, left: pct >= 0 ? "50%" : `${50 - w}%` }} />
    </span>
  );
}

/** A row that opens its sessions on the timeline when the screen offers it; a plain block otherwise. */
function Pick({ c, onSelect, selected, className, children }: { c: Connection; onSelect?: (c: Connection) => void; selected: boolean; className: string; children: ReactNode }) {
  const style = { ...divider, background: selected ? "var(--surface-raised)" : undefined };
  if (!onSelect) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }
  return (
    <button type="button" onClick={() => onSelect(c)} className={`${className} transition-colors active:bg-[var(--surface-raised)]`} style={style} aria-pressed={selected} aria-label={`${c.text} ${selected ? "Shown on the charts" : "Show on the charts"}`}>
      {children}
    </button>
  );
}

function ShowLine({ selected }: { selected: boolean }) {
  return (
    <span className="flex items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
      {selected ? "Shown on the charts above" : "Show on the charts"}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
        <path d={selected ? "M6 15l6-6 6 6" : "M9 6l6 6-6 6"} />
      </svg>
    </span>
  );
}

/**
 * Connections (L1, C7): what lined up with the person's strongest and
 * weakest sessions, from `lib/physique/connections.ts`. Only clear
 * differences are shown, largest first, each as one bar (after WHOOP's
 * impact analysis), one sentence with both groups' numbers and what
 * studies found. How much was checked is one line, so the reader sees the
 * search without a list of non-results. Facts, not advice.
 */
export default function ConnectionsCard({ result, onSelect, selectedId }: { result: ConnectionsResult; /** Progress (PR2): tap one to see its sessions on the timeline. */ onSelect?: (c: Connection) => void; selectedId?: string | null }) {
  if (result.sessions === 0) return null;
  const linked = result.items.filter((c) => c.state === "linked");
  const scale = Math.max(SCALE_MIN_PCT, ...linked.map((c) => Math.abs(c.diffPct)));
  const sources = [...new Set(linked.flatMap((c) => (c.evidence ? [c.evidence.source] : [])))];
  const checkedLine = `${result.checked} ${result.checked === 1 ? "thing" : "things"} checked across ${result.sessions} sessions over ${result.weeks} weeks.`;
  return (
    <section aria-label="Connections" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex flex-col gap-1 px-4 pb-3.5 pt-4">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          Connections
        </span>
        <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          What lined up with your strongest and weakest sessions.
        </p>
      </div>

      {linked.length > 0 && (
        <div className="flex justify-between px-4 pb-1.5 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }} aria-hidden>
          <span>Lifts weaker</span>
          <span>Lifts stronger</span>
        </div>
      )}

      {linked.map((c) => (
        <Pick key={c.id} c={c} onSelect={onSelect} selected={selectedId === c.id} className="flex w-full flex-col gap-2 px-4 py-3.5 text-left">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              {c.label}
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {signedPct(c.diffPct)}
            </span>
          </div>
          <ImpactBar pct={c.diffPct} scale={scale} color={CONNECTION_COLOR[c.id]} />
          <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {c.text}
          </p>
          {c.evidence && (
            <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
              Studies: {c.evidence.text}
            </p>
          )}
          {onSelect && <ShowLine selected={selectedId === c.id} />}
        </Pick>
      ))}

      {result.checked > 0 ? (
        <p className="px-4 py-3 text-[12px] leading-snug" style={{ ...divider, color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
          {linked.length === 0 ? `Nothing stands out yet. ${checkedLine}` : checkedLine}
        </p>
      ) : (
        <p className="px-4 py-3.5 text-[13px] leading-snug" style={{ ...divider, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {result.sessions < CONN_MIN_SESSIONS
            ? `These show from about ${CONN_MIN_SESSIONS} sessions with sleep or food logged alongside. ${result.sessions} so far.`
            : "These show once sleep, food or weigh-ins are logged alongside your sessions."}
        </p>
      )}

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
