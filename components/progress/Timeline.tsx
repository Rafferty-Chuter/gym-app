"use client";

import { type ReactNode } from "react";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { usePick } from "@/components/charts/usePick";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { dayDiff, type LocalDate } from "@/lib/dates";
import type { SessionPoint } from "@/lib/physique/connections";
import type { ProgressRange, ProgressTimeline, ProgressWeek } from "@/lib/physique/progressTimeline";
import { formatBodyWeight, kgToDisplay, type WeightUnit } from "@/lib/units";

const RANGES: ProgressRange[] = ["1M", "3M", "6M", "All"];
const RANGE_WORDS: Record<ProgressRange, string> = { "1M": "this month", "3M": "3 months", "6M": "6 months", All: "all time" };

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const signed = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
const hm = (h: number) => formatHoursMin(Math.round(h * 60));

/**
 * What the timeline is showing for a picked finding or connection (PR2):
 * the charts it is about stay bright and the rest dim, the weeks it covers
 * are marked, and for a connection its sessions are drawn on the strength
 * chart, the top third filled in the condition's colour, the bottom third
 * hollow, so the difference can be checked against the sessions themselves.
 */
export type TimelineFocus = {
  label: string;
  charts: string[];
  from?: LocalDate;
  sessions?: { high: SessionPoint[]; low: SessionPoint[]; color: string; highLabel: string; lowLabel: string };
  onClear: () => void;
};

/** One chart's rows: its id (the Home tiles link to it), name, colour, what the range adds up to and what the picked week holds. */
type RowSpec = { id: string; label: string; color: string; summary: ReactNode | null; week: (w: ProgressWeek) => ReactNode; chart: ReactNode };

/**
 * The Progress timeline (PR1): weight, calories against maintenance,
 * protein, training, strength and sleep, one chart each, all on the same
 * weeks. Tap or drag across any chart (T1) and one column runs through all
 * of them, each chart's heading turns to that week's number and the week's
 * dates sit under the column, so what moved together can be read without
 * the app saying it. Tapping the week again goes back to the range.
 */
export default function Timeline({ t, range, onRange, unit, focus }: { t: ProgressTimeline; range: ProgressRange; onRange: (r: ProgressRange) => void; unit: WeightUnit; focus?: TimelineFocus | null }) {
  const weeks = t.weeks;
  const n = Math.max(1, weeks.length);
  const k = t.periodWeeks;
  const span = k === 1 ? "the week" : `these ${k} weeks`;
  const { active: sel, bind } = usePick({ xs: weeks.map((_, k) => (k + 0.5) / n), share: true, data: `${t.from}:${t.through}` });

  const s = t.summary;
  const kgUnit = unit === "lb" ? "lb" : "kg";
  const rows: RowSpec[] = [
    {
      id: "weight",
      label: "Weight",
      color: "var(--chart-trend)",
      summary: s.trendChangeKg != null ? `${signed(kgToDisplay(s.trendChangeKg, unit))} ${kgUnit} over ${RANGE_WORDS[range]}` : null,
      week: (w) => (w.trendKg != null ? `${formatBodyWeight(w.trendKg, unit)}${w.trendChangeKg != null ? ` · ${signed(kgToDisplay(w.trendChangeKg, unit))} ${kgUnit} over ${span}` : ""}` : "No weigh-ins"),
      chart: <WeightChart t={t} pick={sel != null ? weeks[sel] : null} />,
    },
    {
      id: "calories",
      label: "Calories",
      color: "var(--macro-kcal)",
      summary: s.kcal != null ? `${n0(s.kcal)} a day${s.balanceKcal != null ? ` · ${n0(Math.abs(s.balanceKcal))} ${s.balanceKcal < 0 ? "under" : "over"} maintenance` : ""}` : null,
      week: (w) => (w.kcal != null ? `${n0(w.kcal)} a day${w.balanceKcal != null ? ` · ${n0(Math.abs(w.balanceKcal))} ${w.balanceKcal < 0 ? "under" : "over"} maintenance` : ""}` : w.foodDays ? `${w.foodDays} ${w.foodDays === 1 ? "day" : "days"} logged` : "Not logged"),
      chart: <CaloriesChart weeks={weeks} sel={sel} />,
    },
    {
      id: "protein",
      label: "Protein",
      color: "var(--macro-protein)",
      summary: s.proteinG != null ? `${n0(s.proteinG)} g a day` : null,
      week: (w) => (w.proteinG != null ? `${n0(w.proteinG)} g a day${w.proteinTargetG != null ? ` · target ${n0(w.proteinTargetG)} g` : ""}` : "Not logged"),
      chart: <Bars weeks={weeks} value={(w) => w.proteinG} target={(w) => w.proteinTargetG} color="var(--macro-protein)" sel={sel} />,
    },
    {
      id: "training",
      label: "Training",
      color: "var(--chart-training)",
      summary: s.setsPerWeek != null ? `${n0(s.setsPerWeek)} hard sets a week` : null,
      week: (w) => (w.sessions ? `${w.sessions} ${w.sessions === 1 ? "session" : "sessions"} · ${w.hardSets} hard sets${k > 1 ? ` in ${k} weeks` : ""}` : "No sessions"),
      chart: <Bars weeks={weeks} value={(w) => (w.sessions > 0 ? w.hardSets : null)} color="var(--chart-training)" sel={sel} />,
    },
    {
      id: "strength",
      label: "Strength",
      color: "var(--chart-training)",
      week: (w) => (focus?.sessions ? <WeekSessions w={w} sessions={focus.sessions} /> : w.strengthPct != null ? `${signed(w.strengthPct)}% since ${shortLocalDate(t.from)}` : "No main lifts"),
      summary: focus?.sessions ? (
        <span className="inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <span className="h-[7px] w-[7px] rounded-full" style={{ background: focus.sessions.color }} />
            {focus.sessions.highLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-[7px] w-[7px] rounded-full" style={{ border: "1.5px solid var(--text-tertiary)" }} />
            {focus.sessions.lowLabel}
          </span>
        </span>
      ) : s.strengthPct != null ? (
        `${signed(s.strengthPct)}% · ${t.lifts.slice(0, 3).join(", ")}`
      ) : null,
      chart: focus?.sessions ? <SessionDots t={t} sessions={focus.sessions} pick={sel != null ? weeks[sel] : null} /> : <StrengthChart weeks={weeks} sel={sel} />,
    },
    {
      id: "sleep",
      label: "Sleep",
      color: "var(--chart-sleep)",
      summary: s.sleepH != null ? `${hm(s.sleepH)} a night` : null,
      week: (w) => (w.sleepH != null ? `${hm(w.sleepH)} a night · ${w.nights} nights` : w.nights ? `${w.nights} ${w.nights === 1 ? "night" : "nights"} logged` : "Not logged"),
      chart: <Bars weeks={weeks} value={(w) => w.sleepH} fixedTarget={7} color="var(--chart-sleep)" minTop={9} sel={sel} />,
    },
  ];

  const w = sel != null ? weeks[sel] : null;
  const mid = weeks[Math.floor((weeks.length - 1) / 2)];
  return (
    <section id="timeline" aria-label="Over time" className="scroll-mt-20 overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          Over time
        </span>
        <div className="flex gap-1" role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={r === range} onClick={() => onRange(r)} className="h-[28px] rounded-full px-2.5 text-[12px] font-medium" style={{ background: r === range ? "var(--primary)" : "var(--surface-raised)", color: r === range ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {focus && (
        <div className="mx-4 mb-2 flex items-center justify-between gap-3 rounded-[12px] px-3 py-2" style={{ background: "var(--surface-raised)" }} aria-live="polite">
          <span className="min-w-0 text-[12px] leading-snug" style={{ color: "var(--text)" }}>
            Showing: {focus.label}
          </span>
          <button type="button" onClick={focus.onClear} className="shrink-0 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
            Clear
          </button>
        </div>
      )}

      <div {...bind} className="relative mx-4 rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]" role="group" aria-label="Every measure by week. Tap or drag across the charts, or use the arrow keys, for one week's numbers">
        {/* A finding's weeks, marked through every chart. */}
        {focus?.from &&
          weeks.map((wk, k) =>
            wk.end >= focus.from! ? <span key={`f${k}`} className="pointer-events-none absolute inset-y-0 z-0" style={{ left: `${(k / n) * 100}%`, width: `${100 / n}%`, background: "color-mix(in srgb, var(--primary) 9%, transparent)" }} /> : null,
          )}
        {/* The picked week, one column through every chart. */}
        {sel != null && <span className="pointer-events-none absolute inset-y-0 z-0" style={{ left: `${(sel / n) * 100}%`, width: `${100 / n}%`, background: "var(--surface-raised)", borderRadius: 4 }} />}
        {rows.map((r) => (
          <div key={r.id} id={r.id} className="relative z-[1] scroll-mt-24 pb-3 pt-2.5 transition-opacity" style={{ borderTop: r.id === "weight" ? undefined : "1px solid var(--border)", opacity: focus && !focus.charts.includes(r.id) ? 0.3 : 1 }}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                {r.label}
              </span>
              <span className={`min-w-0 truncate text-[11px] ${w ? "font-semibold" : ""}`} style={{ color: w ? "var(--text)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {w ? r.week(w) : (r.summary ?? "Not enough logged yet")}
              </span>
            </div>
            <div className="relative h-[52px]">{r.chart}</div>
          </div>
        ))}
      </div>

      {/* The axis: the range's dates, or the picked week's under its column. */}
      <div className="relative mx-4 h-[30px] text-[10px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
        {w && sel != null ? (
          <span
            className="absolute top-1 whitespace-nowrap text-[11px] font-semibold"
            style={{ color: "var(--text)", ...(sel < n * 0.25 ? { left: `${(sel / n) * 100}%` } : sel >= n * 0.75 ? { right: `${((n - sel - 1) / n) * 100}%` } : { left: `${((sel + 0.5) / n) * 100}%`, transform: "translateX(-50%)" }) }}
          >
            {shortLocalDate(w.start)} to {shortLocalDate(w.end)}
            {w.current && <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}> · so far</span>}
          </span>
        ) : (
          <span className="flex justify-between pt-1" aria-hidden>
            <span>{weeks[0] ? shortLocalDate(weeks[0].start) : ""}</span>
            <span>{mid && weeks.length > 2 ? shortLocalDate(mid.start) : ""}</span>
            <span>{weeks.at(-1) ? shortLocalDate(weeks.at(-1)!.start) : ""}</span>
          </span>
        )}
      </div>
    </section>
  );
}

/** A connection's sessions in the picked week, each with its day and its strength against the lift's level, marked as in the legend. */
function WeekSessions({ w, sessions }: { w: ProgressWeek; sessions: NonNullable<TimelineFocus["sessions"]> }) {
  const inWeek = (p: SessionPoint) => p.date >= w.start && p.date <= w.end;
  const list = [...sessions.high.filter(inWeek).map((p) => ({ ...p, high: true })), ...sessions.low.filter(inWeek).map((p) => ({ ...p, high: false }))].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (!list.length) return <>No sessions in either group</>;
  return (
    <span className="inline-flex items-center gap-2">
      {list.map((p) => (
        <span key={`${p.date}${p.high}`} className="inline-flex items-center gap-1">
          <span className="h-[7px] w-[7px] rounded-full" style={p.high ? { background: sessions.color } : { border: "1.5px solid var(--text-tertiary)" }} />
          {longLocalDate(p.date).slice(0, 3)} {signed(p.pct)}%
        </span>
      ))}
    </span>
  );
}

// ── Charts ──
// Bars and dots are HTML so they stay crisp at any width; lines are SVG with a non-scaling stroke.

const slot = (k: number, n: number) => ({ left: `${(k / n) * 100}%`, width: `${100 / n}%` });

function Bars({ weeks, value, target, fixedTarget, color, minTop = 0, sel }: { weeks: ProgressWeek[]; value: (w: ProgressWeek) => number | null; target?: (w: ProgressWeek) => number | null; fixedTarget?: number; color: string; minTop?: number; sel: number | null }) {
  const n = weeks.length;
  const vals = weeks.map(value);
  const targets = weeks.map((w) => (target ? target(w) : null));
  const top = Math.max(minTop, ...vals.map((v) => v ?? 0), ...targets.map((v) => v ?? 0), fixedTarget ?? 0) * 1.08 || 1;
  return (
    <>
      {vals.map((v, k) => (
        <span key={k} className="absolute bottom-0 flex h-full items-end justify-center" style={slot(k, n)}>
          {v != null && v > 0 && <span className="w-[62%] max-w-[14px] rounded-t-[3px] transition-opacity" style={{ height: `${Math.max(4, (v / top) * 100)}%`, background: color, opacity: (weeks[k].current ? 0.55 : 1) * (sel != null && sel !== k ? 0.45 : 1) }} />}
        </span>
      ))}
      {targets.map((tv, k) => (tv != null ? <span key={`t${k}`} className="absolute border-t border-dashed" style={{ ...slot(k, n), bottom: `${(tv / top) * 100}%`, borderColor: "var(--text-tertiary)" }} /> : null))}
      {fixedTarget != null && <span className="absolute inset-x-0 border-t border-dashed" style={{ bottom: `${(fixedTarget / top) * 100}%`, borderColor: "var(--text-tertiary)", opacity: 0.8 }} />}
    </>
  );
}

function CaloriesChart({ weeks, sel }: { weeks: ProgressWeek[]; sel: number | null }) {
  const n = weeks.length;
  const all = weeks.flatMap((w) => [w.kcal, w.maintenanceKcal]).filter((x): x is number => x != null);
  if (!all.length) return null;
  const lo = Math.min(...all) * 0.8;
  const hi = Math.max(...all) * 1.04;
  const y = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const pts = weeks.map((w, k) => (w.maintenanceKcal != null ? `${(((k + 0.5) / n) * 100).toFixed(2)},${(100 - y(w.maintenanceKcal)).toFixed(2)}` : null)).filter(Boolean);
  return (
    <>
      {weeks.map((w, k) => (
        <span key={k} className="absolute bottom-0 flex h-full items-end justify-center" style={slot(k, n)}>
          {w.kcal != null && <span className="w-[62%] max-w-[14px] rounded-t-[3px] transition-opacity" style={{ height: `${Math.max(4, y(w.kcal))}%`, background: "var(--macro-kcal)", opacity: (w.current ? 0.55 : 1) * (sel != null && sel !== k ? 0.45 : 1) }} />}
        </span>
      ))}
      {pts.length >= 2 && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          <polyline points={pts.join(" ")} fill="none" stroke="var(--text-secondary)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </>
  );
}

function WeightChart({ t, pick }: { t: ProgressTimeline; pick: ProgressWeek | null }) {
  const total = Math.max(1, t.weeks.length * 7 * t.periodWeeks);
  if (t.days.length < 2) return null;
  const vals = t.days.flatMap((d) => (d.kg != null ? [d.trendKg, d.kg] : [d.trendKg]));
  const lo0 = Math.min(...vals);
  const hi0 = Math.max(...vals);
  const span = Math.max(1, hi0 - lo0);
  const lo = (lo0 + hi0) / 2 - span / 2 - span * 0.08;
  const hi = (lo0 + hi0) / 2 + span / 2 + span * 0.08;
  const x = (date: string) => ((dayDiff(t.from, date) + 0.5) / total) * 100;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const path = t.days.map((d, k) => `${k === 0 ? "M" : "L"}${x(d.date).toFixed(2)},${y(d.trendKg).toFixed(2)}`).join(" ");
  // The picked week's trend, marked where the week ends (the number in the heading).
  const end = pick ? [...t.days].reverse().find((d) => d.date <= pick.end && d.date >= pick.start) : null;
  return (
    <>
      {t.days.length <= 200 &&
        t.days.map((d) => (d.kg != null ? <span key={d.date} className="absolute h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(d.date)}%`, top: `${y(d.kg)}%`, background: "var(--chart-raw)" }} /> : null))}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <path d={path} fill="none" stroke="var(--chart-trend)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {end && <span className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(end.date)}%`, top: `${y(end.trendKg)}%`, background: "var(--chart-trend)", border: "2px solid var(--surface)" }} />}
    </>
  );
}

/** A connection's sessions by date, each against its lift's own level: the top third filled, the bottom third hollow, the level dashed. */
function SessionDots({ t, sessions, pick }: { t: ProgressTimeline; sessions: NonNullable<TimelineFocus["sessions"]>; pick: ProgressWeek | null }) {
  const total = Math.max(1, t.weeks.length * 7 * t.periodWeeks);
  const inRange = (p: SessionPoint) => p.date >= t.from && p.date <= t.through;
  const all = [...sessions.high, ...sessions.low].filter(inRange);
  if (!all.length) return null;
  const span = Math.max(3, ...all.map((p) => Math.abs(p.pct)));
  const x = (d: LocalDate) => ((dayDiff(t.from, d) + 0.5) / total) * 100;
  const y = (v: number) => 50 - (v / span) * 44;
  // The picked week's sessions grow, the rest step back.
  const size = (p: SessionPoint) => (!pick ? 7 : p.date >= pick.start && p.date <= pick.end ? 10 : 7);
  const fade = (p: SessionPoint) => (pick && !(p.date >= pick.start && p.date <= pick.end) ? 0.4 : 1);
  return (
    <>
      <span className="absolute inset-x-0 border-t border-dashed" style={{ top: "50%", borderColor: "var(--text-tertiary)", opacity: 0.8 }} />
      {sessions.low.filter(inRange).map((p) => (
        <span key={`l${p.date}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(p.date)}%`, top: `${y(p.pct)}%`, width: size(p), height: size(p), opacity: fade(p), border: "1.5px solid var(--text-tertiary)", background: "var(--surface)" }} />
      ))}
      {sessions.high.filter(inRange).map((p) => (
        <span key={`h${p.date}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(p.date)}%`, top: `${y(p.pct)}%`, width: size(p), height: size(p), opacity: fade(p), background: sessions.color }} />
      ))}
    </>
  );
}

function StrengthChart({ weeks, sel }: { weeks: ProgressWeek[]; sel: number | null }) {
  const n = weeks.length;
  const vals = weeks.map((w) => w.strengthPct);
  const present = vals.filter((v): v is number => v != null);
  if (present.length < 2) return null;
  const lo = Math.min(-2, ...present);
  const hi = Math.max(2, ...present);
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const pts = vals.map((v, k) => (v == null ? null : { k, x: ((k + 0.5) / n) * 100, y: y(v) })).filter((p): p is { k: number; x: number; y: number } => p != null);
  return (
    <>
      <span className="absolute inset-x-0 border-t border-dashed" style={{ top: `${y(0)}%`, borderColor: "var(--text-tertiary)", opacity: 0.8 }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <polyline points={pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")} fill="none" stroke="var(--chart-training)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {pts.map((p) => (
        <span key={p.k} className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${p.k === sel ? "h-[9px] w-[9px]" : "h-[6px] w-[6px]"}`} style={{ left: `${p.x}%`, top: `${p.y}%`, background: p.k === sel ? "var(--chart-training)" : "var(--surface)", border: "1.5px solid var(--chart-training)" }} />
      ))}
    </>
  );
}
