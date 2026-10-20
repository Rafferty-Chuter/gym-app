"use client";

import { useMemo, useState } from "react";
import { Caption } from "@/components/physique/ui";
import type { WeighIn } from "@/lib/physique/types";
import { dailyTrendRows } from "@/lib/physique/weight";
import { formatBodyWeight, type WeightUnit } from "@/lib/units";
import { addDays, type LocalDate } from "@/lib/dates";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Days shown before "Show all": the last few are what gets checked or filled in (B2). OURS. */
const COLLAPSED_DAYS = 3;
/** Days the list covers. OURS: a month of mornings. */
export const ENTRY_DAYS = 30;

/**
 * The last 30 days by month, newest first (MacroFactor's weight list): each
 * day's scale weight, or "No weigh-in", and its trend weight, missed days
 * included (C11). Tapping a day opens the weight sheet on that date, to
 * edit its entry or add a missed one.
 */
export default function WeightEntries({ weighIns, today, unit, onOpen }: { weighIns: readonly WeighIn[]; today: LocalDate; unit: WeightUnit; onOpen: (date: LocalDate) => void }) {
  const [expanded, setExpanded] = useState(false);
  const rows = useMemo(() => {
    const all = dailyTrendRows(weighIns, addDays(today, -(ENTRY_DAYS - 1)), today);
    // Nothing before the first weigh-in: a month of "No weigh-in" says nothing.
    const firstWithTrend = all.findLastIndex((r) => r.trendKg != null);
    return firstWithTrend < 0 ? [] : all.slice(0, firstWithTrend + 1);
  }, [weighIns, today]);
  const byDate = useMemo(() => {
    const m = new Map<LocalDate, WeighIn>();
    for (const w of [...weighIns].sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : 1))) if (!m.has(w.date)) m.set(w.date, w);
    return m;
  }, [weighIns]);
  const groups = useMemo(() => {
    const out: Array<{ key: string; label: string; items: typeof rows }> = [];
    for (const r of rows.slice(0, expanded ? undefined : COLLAPSED_DAYS)) {
      const key = r.date.slice(0, 7);
      let g = out.find((x) => x.key === key);
      if (!g) {
        g = { key, label: `${MONTHS[Number(r.date.slice(5, 7)) - 1]} ${r.date.slice(0, 4)}`, items: [] };
        out.push(g);
      }
      g.items.push(r);
    }
    return out;
  }, [rows, expanded]);
  if (groups.length === 0) return null;
  return (
    <section aria-label="Weigh-ins">
      {groups.map((g) => (
        <div key={g.key} className="mb-3">
          <div className="mb-2">
            <Caption>{g.label}</Caption>
          </div>
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-[12px]" style={{ background: "var(--surface)" }}>
            {g.items.map((r) => {
              const w = byDate.get(r.date);
              const meta = [typeof w?.bodyFatPct === "number" ? `${w.bodyFatPct.toFixed(1)} % fat` : null, w && w.source !== "manual" ? w.source : null].filter(Boolean).join(" · ");
              return (
                <li key={r.date}>
                  <button
                    type="button"
                    onClick={() => onOpen(r.date)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]"
                    aria-label={`${longLocalDate(r.date)}, ${r.scaleKg != null ? formatBodyWeight(r.scaleKg, unit) : "no weigh-in"}${r.trendKg != null ? `, trend ${formatBodyWeight(r.trendKg, unit)}` : ""}. ${r.scaleKg != null ? "Edit" : "Add"}`}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                        {r.date === today ? "Today" : longLocalDate(r.date)}
                        {meta ? ` · ${meta}` : ""}
                      </span>
                      {r.scaleKg != null ? (
                        <span className="text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                          {formatBodyWeight(r.scaleKg, unit)}
                        </span>
                      ) : (
                        <span className="text-[15px]" style={{ color: "var(--text-tertiary)" }}>
                          No weigh-in
                        </span>
                      )}
                    </span>
                    {r.trendKg != null && (
                      <span className="flex shrink-0 flex-col items-end">
                        <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                          Trend
                        </span>
                        <span className="text-[15px] font-medium" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                          {formatBodyWeight(r.trendKg, unit)}
                        </span>
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {rows.length > COLLAPSED_DAYS && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="h-[36px] text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          {expanded ? "Show fewer" : `Show all ${rows.length} days`}
        </button>
      )}
    </section>
  );
}
