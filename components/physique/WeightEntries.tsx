"use client";

import { useMemo, useState } from "react";
import { Caption } from "@/components/physique/ui";
import type { WeighIn } from "@/lib/physique/types";
import { formatWeight, type WeightUnit } from "@/lib/units";
import { addDays, type LocalDate } from "@/lib/dates";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Entries shown before "Show 30 days". OURS. */
const COLLAPSED_ENTRIES = 7;

/** Weigh-ins by month for the last 30 days, newest first, with edit (MacroFactor's Scale Weight list). */
export default function WeightEntries({ weighIns, today, unit, onEdit }: { weighIns: readonly WeighIn[]; today: LocalDate; unit: WeightUnit; onEdit: (w: WeighIn) => void }) {
  const [expanded, setExpanded] = useState(false);
  const total = useMemo(() => weighIns.filter((w) => w.date >= addDays(today, -29) && w.date <= today).length, [weighIns, today]);
  const groups = useMemo(() => {
    const from = addDays(today, -29);
    const recent = weighIns
      .filter((w) => w.date >= from && w.date <= today)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, expanded ? undefined : COLLAPSED_ENTRIES);
    const out: Array<{ key: string; label: string; items: WeighIn[] }> = [];
    for (const w of recent) {
      const key = w.date.slice(0, 7);
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: `${MONTHS[Number(w.date.slice(5, 7)) - 1]} ${w.date.slice(0, 4)}`, items: [] };
        out.push(g);
      }
      g.items.push(w);
    }
    return out;
  }, [weighIns, today, expanded]);
  if (groups.length === 0) return null;
  return (
    <section aria-label="Weigh-ins">
      {groups.map((g) => (
        <div key={g.key} className="mb-3">
          <div className="mb-2">
            <Caption>{g.label}</Caption>
          </div>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[12px]" style={{ background: "var(--surface)" }}>
            {g.items.map((w) => (
              <li key={w.id}>
                <button type="button" onClick={() => onEdit(w)} className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]" aria-label={`Edit weigh-in ${longLocalDate(w.date)}, ${formatWeight(w.kg, unit)}`}>
                  <span className="flex flex-col">
                    <span className="text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                      {formatWeight(w.kg, unit)}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      {longLocalDate(w.date)}
                      {typeof w.bodyFatPct === "number" ? ` · ${w.bodyFatPct.toFixed(1)} % fat` : ""}
                      {w.source !== "manual" ? ` · ${w.source}` : ""}
                    </span>
                  </span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                    <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {total > COLLAPSED_ENTRIES && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="h-[36px] text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          {expanded ? "Show fewer" : `Show all ${total} from the last 30 days`}
        </button>
      )}
    </section>
  );
}
