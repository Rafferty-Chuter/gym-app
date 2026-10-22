"use client";

import { useEffect, useState } from "react";
import type { LocalDate } from "@/lib/dates";
import { markSpottedShown } from "@/lib/physique/io/spottedNews";
import Link from "next/link";
import type { ConnectionId, ConnectionsResult } from "@/lib/physique/connections";
import type { FindingId } from "@/lib/physique/findings";
import type { ReferenceLift } from "@/lib/physique/liftEffect";
import { connectionSubject, findingSubject } from "@/lib/physique/askAbout";
import type { SpottedItem } from "@/lib/physique/spotted";
import { glueNumbers } from "@/lib/physique/liftLinks";
import type { WeightUnit } from "@/lib/units";
import { CONNECTION_COLOR, Glyph, SessionStrip } from "@/components/report/Connections";
import AskWhy from "@/components/progress/AskWhy";

const divider = { borderTop: "1px solid var(--border)" };

/** One outline glyph per finding (24 × 24, stroked). */
const FINDING_ICON: Record<FindingId, string[]> = {
  underlog: ["M6 3h12v18H6z", "M9 8h6M9 12h6M9 16h3"],
  "sleep-lifts": ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"],
  "protein-low": ["M12 3c-3.5 0-6.5 5.5-6.5 10a6.5 6.5 0 0 0 13 0C18.5 8.5 15.5 3 12 3z"],
  "gain-fast": ["M4 17l6-6 4 4 6-7", "M15 8h5v5"],
  "cut-fast-lifts": ["M4 7l6 6 4-4 6 7", "M15 16h5v-5"],
};
/** A scale, for a jump; a barbell, for a stuck lift. */
const SCALE = ["M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z", "M8.5 10a3.5 3.5 0 0 1 7 0", "M12 10l1.5-2"];
const BARBELL = ["M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"];

function Icon({ paths, color }: { paths: string[]; color: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

function ItemIcon({ s }: { s: SpottedItem }) {
  switch (s.kind) {
    case "jump":
      return <Icon paths={SCALE} color="var(--chart-trend)" />;
    case "stuck":
      return <Icon paths={BARBELL} color="var(--chart-lift)" />;
    case "link":
      return <Glyph id={s.connection.id} color={(CONNECTION_COLOR as Partial<Record<ConnectionId, string>>)[s.connection.id] ?? "var(--text-secondary)"} />;
    case "alcohol":
      // IN9's glass, as on the lift link for drinks.
      return <Glyph id="alcohol" color={(CONNECTION_COLOR as Partial<Record<ConnectionId, string>>).alcohol ?? "var(--text-secondary)"} />;
    case "finding":
      return <Icon paths={FINDING_ICON[s.finding.id]} color="var(--status-watch)" />;
  }
}

/** The way to a stuck lift's own page. */
const liftHref = (s: Extract<SpottedItem, { kind: "stuck" }>) => `/exercise?name=${encodeURIComponent(s.stuck.name)}${s.stuck.exerciseId ? `&id=${encodeURIComponent(s.stuck.exerciseId)}` : ""}`;

/**
 * The working behind one fact (08 IN10, after Garmin's detail sheet): its
 * numbers as label and value rows, a link's sessions as dots on the lift
 * (both groups, their averages, the gap in kilos), and on Progress the way
 * to its days on the charts.
 */
function Working({ s, connections, lift, unit, onShow, shown, linkable }: { s: SpottedItem; connections: ConnectionsResult | null; lift: ReferenceLift | null; unit: WeightUnit; onShow?: () => void; shown: boolean; linkable: boolean }) {
  return (
    <div className="flex flex-col gap-2.5 px-4 pb-3.5 pl-[60px]">
      {s.kind === "link" && <SessionStrip c={s.connection} lift={lift} unit={unit} />}
      {s.working.length > 0 && <dl className="flex flex-col gap-1">
        {s.working.map((w) =>
          w.value != null ? (
            <div key={w.label} className="flex items-baseline justify-between gap-3 text-[12px] leading-snug">
              <dt style={{ color: "var(--text-secondary)" }}>{w.label}</dt>
              <dd className="shrink-0 font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                {w.value}
              </dd>
            </div>
          ) : (
            <p key={w.label} className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
              {w.label}
            </p>
          ),
        )}
      </dl>}
      {(onShow || (s.kind === "stuck" && linkable)) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {onShow && (
            <button type="button" onClick={onShow} aria-pressed={shown} className="flex min-h-[44px] w-fit items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              {shown ? "Shown on the charts below" : s.days.length ? "Mark these days on the charts" : "Show on the charts"}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          )}
          {s.kind === "stuck" && linkable && (
            <Link href={liftHref(s)} className="flex min-h-[44px] w-fit items-center gap-1 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
              {s.stuck.name} history
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
                <path d="M9 6l6 6-6 6" />
              </svg>
            </Link>
          )}
        </div>
      )}
      {s.kind === "link" && connections && <AskWhy subject={connectionSubject(s.connection, connections, lift, unit)} />}
      {s.kind === "finding" && <AskWhy subject={findingSubject(s.finding)} />}
    </div>
  );
}

/**
 * Spotted (IN10): at most three facts the engines found, biggest and
 * newest first, from `lib/physique/spotted.ts`. One row each, the plain
 * finding and its numbers (Apple Health's Highlights, WHOOP's insight
 * rows); a tap shows the working and, on Progress, marks the days behind
 * it on the charts. The weekly report shows the same rows. Nothing when
 * nothing was found: silence beats a filler line.
 */
export default function Spotted({ items, connections, lift, unit, onShow, shownKey = null, linkable = true, seenOn }: { items: readonly SpottedItem[]; /** For a link's "Ask the coach why". */ connections: ConnectionsResult | null; lift: ReferenceLift | null; unit: WeightUnit; /** Progress: mark a fact's days on the charts. */ onShow?: (s: SpottedItem) => void; shownKey?: string | null; /** False for the made-up example: no links to the person's own pages. */ linkable?: boolean; /** IN11: today, for the person's own data; what is shown is then seen, and no notification tells it. Left out for the example. */ seenOn?: LocalDate }) {
  const [open, setOpen] = useState<string | null>(null);
  const keys = items.map((s) => s.key).join("|");
  useEffect(() => {
    if (seenOn && keys) void markSpottedShown(keys.split("|"), seenOn);
  }, [keys, seenOn]);
  if (!items.length) return null;
  return (
    <section aria-label="Spotted" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="px-4 pb-3 pt-4">
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          Spotted
        </h2>
      </div>
      <ul>
        {items.map((s) => {
          const isOpen = open === s.key;
          return (
            <li key={s.key} style={divider}>
              <button type="button" onClick={() => setOpen(isOpen ? null : s.key)} aria-expanded={isOpen} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]" aria-label={`${s.title}. ${s.detail}. ${isOpen ? "Hide" : "Show"} the numbers`}>
                <ItemIcon s={s} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
                    {s.title}
                  </span>
                  <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                    {glueNumbers(s.detail)}
                  </span>
                </span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 transition-transform" style={{ color: "var(--text-tertiary)", transform: isOpen ? "rotate(180deg)" : undefined }} aria-hidden>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {isOpen && <Working s={s} connections={connections} lift={lift} unit={unit} onShow={onShow ? () => onShow(s) : undefined} shown={shownKey === s.key} linkable={linkable} />}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
