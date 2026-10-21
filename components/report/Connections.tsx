"use client";

import type { ReactNode } from "react";
import { Caption } from "@/components/physique/ui";
import { CONN_MIN_SESSIONS, type Connection, type ConnectionId, type ConnectionsResult } from "@/lib/physique/connections";

/** Each condition in its measure's colour (DESIGN.md rev 4.2). */
export const CONNECTION_COLOR: Record<ConnectionId, string> = {
  sleep: "var(--chart-sleep)",
  calories: "var(--macro-kcal)",
  protein: "var(--macro-protein)",
  rate: "var(--chart-trend)",
  rest: "var(--chart-training)",
  hrv: "var(--chart-heart)",
};

const signedPct = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
const divider = { borderTop: "1px solid var(--border)" };

/** The two thirds as bars either side of the lift's own level (the centre line). */
function CompareBars({ c, color }: { c: Connection; color: string }) {
  const rows = [c.high, c.low];
  const scale = Math.max(2, ...rows.map((r) => Math.abs(r.pct)));
  return (
    <div className="flex flex-col gap-1.5" aria-hidden>
      {rows.map((r, i) => {
        const w = (Math.abs(r.pct) / scale) * 50;
        return (
          <div key={i} className="flex items-center gap-2.5">
            <span className="w-[76px] shrink-0 truncate text-[11px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {r.value}
            </span>
            <span className="relative h-2 flex-1 rounded-full" style={{ background: "var(--surface-raised)" }}>
              <span className="absolute inset-y-[-2px] left-1/2 w-px" style={{ background: "var(--text-tertiary)" }} />
              <span className="absolute inset-y-0 rounded-full" style={{ background: color, opacity: i === 0 ? 1 : 0.55, width: `${w}%`, left: r.pct >= 0 ? "50%" : `${50 - w}%` }} />
            </span>
            <span className="w-[44px] shrink-0 text-right text-[11px] font-medium" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {signedPct(r.pct)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A row that opens its sessions on the timeline when the screen offers it; a plain block otherwise. */
function Pick({ c, onSelect, selected, plain, className, children }: { c: Connection; onSelect?: (c: Connection) => void; selected: boolean; plain?: boolean; className: string; children: ReactNode }) {
  const style = { ...(plain ? {} : divider), background: selected ? "var(--surface-raised)" : undefined };
  if (!onSelect) {
    return (
      <div className={className} style={style} aria-label={plain ? c.text : undefined}>
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
 * Connections (L1): how sleep, food and weight change line up with the
 * lifts across the last 16 weeks, from `lib/physique/connections.ts`. Clear
 * differences first, each with both groups' numbers; then the conditions
 * with no clear difference, which is worth knowing too. Words say what the
 * numbers show, not what to do.
 */
export default function ConnectionsCard({ result, onSelect, selectedId }: { result: ConnectionsResult; /** Progress (PR2): tap one to see its sessions on the timeline. */ onSelect?: (c: Connection) => void; selectedId?: string | null }) {
  if (result.sessions === 0) return null;
  const linked = result.items.filter((c) => c.state === "linked");
  const none = result.items.filter((c) => c.state === "none");
  const weeks = result.weeks;
  return (
    <section aria-label="Connections" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex flex-col gap-1 px-4 pb-3.5 pt-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
            Connections
          </span>
          <Caption>
            {result.sessions} sessions · {weeks} weeks
          </Caption>
        </div>
        <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          Each session&apos;s best sets against that lift&apos;s own level around then, by what came before it.
        </p>
      </div>

      {linked.map((c) => (
        <Pick key={c.id} c={c} onSelect={onSelect} selected={selectedId === c.id} className="flex w-full flex-col gap-2 px-4 py-3.5 text-left">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
              {c.label}
            </span>
            <span className="text-[17px] font-semibold tracking-[-0.01em]" style={{ color: CONNECTION_COLOR[c.id], fontVariantNumeric: "tabular-nums" }}>
              {signedPct(c.diffPct)}
            </span>
          </div>
          <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {c.text}
          </p>
          <CompareBars c={c} color={CONNECTION_COLOR[c.id]} />
          {onSelect && <ShowLine selected={selectedId === c.id} />}
        </Pick>
      ))}

      {none.length > 0 && (
        <div className="flex flex-col gap-1.5 px-4 py-3.5" style={divider}>
          <Caption>No clear difference</Caption>
          {/* The heading says it once; each row is the measure and its two thirds. */}
          {none.map((c) => (
            <Pick key={c.id} c={c} onSelect={onSelect} selected={selectedId === c.id} plain className="-mx-2 flex w-[calc(100%+16px)] items-baseline justify-between gap-3 rounded-[8px] px-2 py-1 text-left text-[13px]">
              <span style={{ color: "var(--text)" }}>{c.label}</span>
              <span className="text-right" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {c.high.value} against {c.low.value}
              </span>
            </Pick>
          ))}
        </div>
      )}

      {result.items.length === 0 && (
        <p className="px-4 py-3.5 text-[13px] leading-snug" style={{ ...divider, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {result.sessions < CONN_MIN_SESSIONS
            ? `These show from about ${CONN_MIN_SESSIONS} sessions with sleep or food logged alongside. ${result.sessions} so far.`
            : "These show once sleep, food or weigh-ins are logged alongside your sessions."}
        </p>
      )}
    </section>
  );
}
