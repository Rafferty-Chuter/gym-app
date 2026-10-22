"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { usePick } from "@/components/charts/usePick";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { formatEffect } from "@/lib/physique/liftEffect";
import { addDays, dayDiff, type LocalDate } from "@/lib/dates";
import type { LiftWeeks, ProgressRange, ProgressTimeline, ProgressWeek } from "@/lib/physique/progressTimeline";
import { formatBodyWeight, formatWeight, kgToDisplay, type WeightUnit } from "@/lib/units";

const RANGES: ProgressRange[] = ["1M", "3M", "6M", "All"];
const RANGE_WORDS: Record<ProgressRange, string> = { "1M": "this month", "3M": "3 months", "6M": "6 months", All: "all time" };

/** A week this far under the usual night draws hollow, so the short weeks stand out. Display only. OURS: a quarter of an hour, under the night-to-night noise of a hand log. */
const SHORT_WEEK_H = 0.25;

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const signed = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
const hm = (h: number) => formatHoursMin(Math.round(h * 60));

/**
 * What the timeline is showing for a picked finding (PR2): the charts it
 * is about stay bright and the rest dim, and the weeks it covers are
 * marked. A chart's id or its group ("strength" for the lifts) counts.
 * IN10: or the days behind it: a dot under the charts for each (Oura's
 * tags under the day) and the weeks they fall in tinted, as the charts
 * draw weeks, not days.
 */
export type TimelineFocus = {
  label: string;
  charts: string[];
  from?: LocalDate;
  days?: readonly LocalDate[];
  /** What the marked days are: "two short nights", "bottom third, 221 g". */
  daysLabel?: string;
  onClear: () => void;
};

/** One chart's row: its id (the Home tiles link to it), name, colour, what the range adds up to, what the picked week holds, and an optional page it opens. */
type RowSpec = { id: string; group?: string; label: string; color: string; href?: string; summary: ReactNode | null; week: (w: ProgressWeek) => ReactNode; chart: ReactNode; height?: number };

/**
 * The Progress timeline (PR1, PR3): weight against the goal, calories
 * against maintenance, protein against target, hard sets, each main lift's
 * estimated 1RM in kilos, sleep and (with a watch) HRV and resting heart
 * rate against the person's usual, all on the
 * same weeks, every reference line named in its heading. Tap or drag across any chart
 * (T1) and one column runs through all of them, each chart's heading turns
 * to that week's number and the week's dates show at the top. Tapping the
 * week again goes back to the range.
 */
export default function Timeline({ t, range, onRange, unit, goalKg, focus, logIncomplete = false, readOnly = false }: { t: ProgressTimeline; range: ProgressRange; onRange: (r: ProgressRange) => void; unit: WeightUnit; /** The goal's target, drawn on the weight chart. */ goalKg?: number | null; focus?: TimelineFocus | null; /** Findings read the food log as incomplete (PR3e): maintenance is estimated from that log, so its line and the gap to it would mislead. */ logIncomplete?: boolean; /** The made-up example (PR5): no links to the person's own exercise pages. */ readOnly?: boolean }) {
  const weeks = t.weeks;
  const n = Math.max(1, weeks.length);
  const k = t.periodWeeks;
  const span = k === 1 ? "the week" : `these ${k} weeks`;
  const { active: sel, bind } = usePick({ xs: weeks.map((_, k) => (k + 0.5) / n), share: true, data: `${t.from}:${t.through}` });

  const s = t.summary;
  const kgUnit = unit === "lb" ? "lb" : "kg";
  const liftRows: RowSpec[] = t.liftWeeks.map((l, i) => ({
    id: `lift-${i}`,
    group: "strength",
    label: l.name,
    color: "var(--chart-lift)",
    href: readOnly ? undefined : `/exercise?name=${encodeURIComponent(l.name)}`,
    // The change shows only when the line is clearly not flat (LIFT_FIT_Z); otherwise nothing is said about it, as a week's best swings a few percent on its own.
    summary: l.levelKg != null ? `${formatWeight(l.levelKg, unit, 0)} est. 1RM${l.changeKg != null ? ` · ${formatEffect(l.changeKg, unit)}` : ""}` : null,
    week: (w) => {
      const v = l.e1rmKg[weeks.indexOf(w)];
      return v != null ? `${formatWeight(v, unit, 0)} est. 1RM` : "Not trained";
    },
    chart: <LiftChart l={l} sel={sel} t={t} />,
  }));
  const rows: RowSpec[] = [
    {
      id: "weight",
      label: "Weight",
      color: "var(--chart-trend)",
      summary:
        s.trendChangeKg != null ? (
          <>
            {signed(kgToDisplay(s.trendChangeKg, unit))} {kgUnit} {t.days.length && t.days[0].date > addDays(t.from, 6) ? `since ${shortLocalDate(t.days[0].date)}` : `over ${RANGE_WORDS[range]}`}
            {goalInView(t, goalKg ?? null) && (
              <>
                {" · "}
                <Swatch color="var(--chart-trend)" dashed />
                goal {formatWeight(goalKg!, unit)}
              </>
            )}
          </>
        ) : null,
      week: (w) => (w.trendKg != null ? `${formatBodyWeight(w.trendKg, unit)}${w.trendChangeKg != null ? ` · ${signed(kgToDisplay(w.trendChangeKg, unit))} ${kgUnit} over ${span}` : ""}` : "No weigh-ins"),
      chart: <WeightChart t={t} pick={sel != null ? weeks[sel] : null} goalKg={goalKg ?? null} />,
      height: 64,
    },
    {
      id: "calories",
      label: "Calories",
      color: "var(--macro-kcal)",
      summary:
        s.kcal != null ? (
          <>
            {n0(s.kcal)} a day
            {logIncomplete && " · log looks incomplete"}
            {!logIncomplete && s.balanceKcal != null && (
              <>
                {` · ${n0(Math.abs(s.balanceKcal))} ${s.balanceKcal < 0 ? "under" : "over"} `}
                <Swatch color="var(--text-secondary)" />
                maintenance
              </>
            )}
          </>
        ) : null,
      week: (w) => (w.kcal != null ? `${n0(w.kcal)} a day${!logIncomplete && w.balanceKcal != null ? ` · ${n0(Math.abs(w.balanceKcal))} ${w.balanceKcal < 0 ? "under" : "over"} maintenance` : ""}` : w.foodDays ? `${w.foodDays} ${w.foodDays === 1 ? "day" : "days"} logged` : "Not logged"),
      chart: <CaloriesChart weeks={weeks} sel={sel} maintenance={!logIncomplete} />,
    },
    {
      id: "protein",
      label: "Protein",
      color: "var(--macro-protein)",
      summary:
        s.proteinG != null ? (
          <>
            {n0(s.proteinG)} g a day
            {lastTarget(weeks) != null && (
              <>
                {" · "}
                <Swatch color="var(--text-secondary)" dashed />
                target {n0(lastTarget(weeks)!)}
              </>
            )}
          </>
        ) : null,
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
    ...liftRows,
    {
      id: "sleep",
      label: "Sleep",
      color: "var(--chart-sleep)",
      summary:
        s.sleepH != null ? (
          <>
            {hm(s.sleepH)} a night
            {s.usualSleepH != null && (
              <>
                {" · "}
                <Swatch color="var(--chart-sleep)" dashed />
                your usual {hm(s.usualSleepH)}
              </>
            )}
          </>
        ) : null,
      week: (w) => (w.sleepH != null ? `${hm(w.sleepH)} a night · ${w.nights} nights` : w.nights ? `${w.nights} ${w.nights === 1 ? "night" : "nights"} logged` : "Not logged"),
      chart: <UsualDots weeks={weeks} value={(w) => w.sleepH} usual={s.usualSleepH} color="var(--chart-sleep)" hollow={(v, u) => v < u - SHORT_WEEK_H} minPad={0.25} sel={sel} />,
    },
    ...watchRows(weeks, s, sel),
  ];

  // PR5: a measure with nothing in the range yet is left out, named once at the foot, rather than a row of "Not enough logged yet".
  const shown = rows.filter((r) => r.summary != null);
  const waiting = rows.filter((r) => r.summary == null && r.group !== "strength").map((r) => r.label.toLowerCase());
  const w = sel != null ? weeks[sel] : null;
  const mid = weeks[Math.floor((weeks.length - 1) / 2)];
  if (!shown.length) return null;
  const bright = (r: RowSpec) => !focus || focus.charts.includes(r.id) || (r.group != null && focus.charts.includes(r.group));
  // IN10: the focus's days that fall in the range, as a share of its width, and the columns they fall in.
  const totalDays = Math.max(1, weeks.length * 7 * t.periodWeeks);
  const marks = (focus?.days ?? []).flatMap((d) => {
    const k = dayDiff(t.from, d);
    return k >= 0 && k < totalDays ? [{ d, x: ((k + 0.5) / totalDays) * 100, col: Math.floor(k / (7 * t.periodWeeks)) }] : [];
  });
  const markedCols = new Set(marks.map((m) => m.col));
  // The days left unmarked all sit before the range (a past week's report can also end before them).
  const marksBefore = (focus?.days ?? []).every((d) => d >= t.from ? dayDiff(t.from, d) < totalDays : true);
  return (
    <section id="timeline" aria-label="Over time" className="scroll-mt-20 overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-4">
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

      {/* The picked week, named at the top where the eye already is (PR3; it sat under the charts). */}
      <div className="mx-4 flex h-[20px] items-center text-[12px]" style={{ color: w ? "var(--text)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
        {w ? (
          <span className="font-semibold">
            {shortLocalDate(w.start)} to {shortLocalDate(w.end)}
            {w.current && <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}> · so far</span>}
          </span>
        ) : (
          <span>Tap a week to see its numbers</span>
        )}
      </div>

      {focus && (
        <div className="mx-4 mb-1 mt-1 flex items-center justify-between gap-3 rounded-[12px] px-3 py-2" style={{ background: "var(--surface-raised)" }} aria-live="polite">
          <span className="flex min-w-0 flex-col text-[12px] leading-snug" style={{ fontVariantNumeric: "tabular-nums" }}>
            <span style={{ color: "var(--text)" }}>Showing: {focus.label}</span>
            {focus.days && (
              <span style={{ color: "var(--text-secondary)" }}>
                {marks.length}
                {marks.length < focus.days.length ? ` of ${focus.days.length}` : ""} marked{focus.daysLabel ? `: ${focus.daysLabel}` : ""}
                {marks.length < focus.days.length && marksBefore ? `, the rest before ${shortLocalDate(t.from)}` : ""}
              </span>
            )}
          </span>
          <button type="button" onClick={focus.onClear} className="-my-2 flex min-h-[44px] shrink-0 items-center px-1 text-[12px] font-semibold" style={{ color: "var(--text-secondary)" }}>
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
        {/* IN10: the weeks holding the days behind a fact, tinted through every chart. */}
        {[...markedCols].map((k) => (
          <span key={`d${k}`} className="pointer-events-none absolute inset-y-0 z-0" style={{ left: `${(k / n) * 100}%`, width: `${100 / n}%`, background: "color-mix(in srgb, var(--primary) 9%, transparent)" }} />
        ))}
        {/* The picked week, one column through every chart. */}
        {sel != null && <span className="pointer-events-none absolute inset-y-0 z-0" style={{ left: `${(sel / n) * 100}%`, width: `${100 / n}%`, background: "var(--surface-raised)", borderRadius: 4 }} />}
        {shown.map((r, i) => (
          <div key={r.id} id={r.id} className="relative z-[1] scroll-mt-24 pb-3 pt-2.5 transition-opacity" style={{ borderTop: i === 0 ? undefined : "1px solid var(--border)", opacity: bright(r) ? 1 : 0.3 }}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              {r.href ? (
                <Link href={r.href} onPointerDown={(e) => e.stopPropagation()} className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--text)" }} aria-label={`${r.label}: open its history`}>
                  <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                  {r.label}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" style={{ color: "var(--text-tertiary)" }} aria-hidden>
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Link>
              ) : (
                <span className="flex shrink-0 items-center gap-1.5 text-[12px] font-semibold" style={{ color: "var(--text)" }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                  {r.label}
                </span>
              )}
              <span className={`min-w-0 truncate text-[11px] ${w ? "font-semibold" : ""}`} style={{ color: w ? "var(--text)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {w ? r.week(w) : r.summary}
              </span>
            </div>
            <div className="relative" style={{ height: r.height ?? 52 }}>
              {r.chart}
            </div>
          </div>
        ))}
      </div>

      {/* ...and a dot under each day, where the dates are read. */}
      {marks.length > 0 && (
        <div className="relative mx-4 mt-1 h-[8px]" aria-hidden>
          {marks.map((m) => (
            <span key={`t${m.d}`} className="absolute top-0 h-[6px] w-[6px] -translate-x-1/2 rounded-full" style={{ left: `${m.x}%`, background: "var(--primary)" }} />
          ))}
        </div>
      )}
      {waiting.length > 0 && (
        <p className="mx-4 border-t pt-2.5 text-[12px] leading-snug" style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}>
          {waiting.length === 1 ? waiting[0].charAt(0).toUpperCase() + waiting[0].slice(1) : `${waiting.slice(0, -1).join(", ").replace(/^./, (c) => c.toUpperCase())} and ${waiting.at(-1)}`} {waiting.length === 1 ? "joins" : "join"} once there&apos;s a week of {waiting.length === 1 ? "it" : "them"}.
        </p>
      )}
      <div className="mx-4 flex justify-between pb-3 pt-1 text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }} aria-hidden>
        <span>{weeks[0] ? shortLocalDate(weeks[0].start) : ""}</span>
        <span>{mid && weeks.length > 2 ? shortLocalDate(mid.start) : ""}</span>
        <span>{weeks.at(-1) ? shortLocalDate(weeks.at(-1)!.start) : ""}</span>
      </div>
    </section>
  );
}

function lastTarget(weeks: readonly ProgressWeek[]): number | null {
  return [...weeks].reverse().find((w) => w.proteinTargetG != null)?.proteinTargetG ?? null;
}

// ── Charts ──
// Bars and dots are HTML so they stay crisp at any width; lines are SVG with a non-scaling stroke.

const slot = (k: number, n: number) => ({ left: `${(k / n) * 100}%`, width: `${100 / n}%` });
const cx = (k: number, n: number) => ((k + 0.5) / n) * 100;

/** A reference line's sample beside its name in a chart's heading (PR3: every line on Progress says what it is, without covering the data). */
function Swatch({ color, dashed = false }: { color: string; dashed?: boolean }) {
  return <span className="mr-1 inline-block w-3 align-middle" style={{ borderTop: `1.5px ${dashed ? "dashed" : "solid"} ${color}` }} aria-hidden />;
}

/** The goal joins the weight chart when it is near enough not to flatten the line: within 60% of the data's own spread. */
function goalInView(t: ProgressTimeline, goalKg: number | null): boolean {
  if (goalKg == null || t.days.length < 2) return false;
  const vals = t.days.flatMap((d) => (d.kg != null ? [d.trendKg, d.kg] : [d.trendKg]));
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const spread = Math.max(1, hi - lo);
  return goalKg > lo - spread * 0.6 && goalKg < hi + spread * 0.6;
}

function Bars({ weeks, value, target, color, sel }: { weeks: ProgressWeek[]; value: (w: ProgressWeek) => number | null; target?: (w: ProgressWeek) => number | null; color: string; sel: number | null }) {
  const n = weeks.length;
  const vals = weeks.map(value);
  const targets = weeks.map((w) => (target ? target(w) : null));
  const top = Math.max(...vals.map((v) => v ?? 0), ...targets.map((v) => v ?? 0)) * 1.12 || 1;
  return (
    <>
      {vals.map((v, k) => (
        <span key={k} className="absolute bottom-0 flex h-full items-end justify-center" style={slot(k, n)}>
          {v != null && v > 0 && <span className="w-[62%] max-w-[14px] rounded-t-[3px] transition-opacity" style={{ height: `${Math.max(4, (v / top) * 100)}%`, background: color, opacity: (weeks[k].current ? 0.55 : 1) * (sel != null && sel !== k ? 0.45 : 1) }} />}
        </span>
      ))}
      {targets.map((tv, k) => (tv != null ? <span key={`t${k}`} className="absolute border-t border-dashed" style={{ ...slot(k, n), bottom: `${(tv / top) * 100}%`, borderColor: "var(--text-secondary)" }} /> : null))}
    </>
  );
}

/** What was eaten against maintenance, the gap between them shaded: under the line is a deficit, over it a surplus. */
function CaloriesChart({ weeks, sel, maintenance }: { weeks: ProgressWeek[]; sel: number | null; /** Draw maintenance and the gap to it; off when the log looks incomplete. */ maintenance: boolean }) {
  const n = weeks.length;
  const all = weeks.flatMap((w) => [w.kcal, maintenance ? w.maintenanceKcal : null]).filter((x): x is number => x != null);
  if (!all.length) return null;
  const pad = Math.max(80, (Math.max(...all) - Math.min(...all)) * 0.18);
  const lo = Math.min(...all) - pad;
  const hi = Math.max(...all) + pad;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const maint = weeks.map((w, k) => (maintenance && w.maintenanceKcal != null ? { k, v: w.maintenanceKcal } : null)).filter((p): p is { k: number; v: number } => p != null);
  const eaten = weeks.map((w, k) => (w.kcal != null ? { k, v: w.kcal } : null)).filter((p): p is { k: number; v: number } => p != null);
  // The gap, shaded over each run of weeks with both numbers.
  const runs: Array<Array<{ k: number; a: number; b: number }>> = [];
  weeks.forEach((w, k) => {
    if (!maintenance || w.kcal == null || w.maintenanceKcal == null) return;
    const last = runs.at(-1);
    const p = { k, a: w.kcal, b: w.maintenanceKcal };
    if (last && last.at(-1)!.k === k - 1) last.push(p);
    else runs.push([p]);
  });
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {runs
          .filter((r) => r.length >= 2)
          .map((r) => (
            <polygon key={r[0].k} points={[...r.map((p) => `${cx(p.k, n)},${y(p.b)}`), ...[...r].reverse().map((p) => `${cx(p.k, n)},${y(p.a)}`)].join(" ")} fill="var(--macro-kcal)" fillOpacity={0.16} />
          ))}
        {maint.length >= 2 && <polyline points={maint.map((p) => `${cx(p.k, n)},${y(p.v)}`).join(" ")} fill="none" stroke="var(--text-secondary)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {eaten.length >= 2 && <polyline points={eaten.map((p) => `${cx(p.k, n)},${y(p.v)}`).join(" ")} fill="none" stroke="var(--macro-kcal)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      </svg>
      {eaten.map((p) => (
        <span key={p.k} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${cx(p.k, n)}%`, top: `${y(p.v)}%`, width: p.k === sel ? 9 : 6, height: p.k === sel ? 9 : 6, background: "var(--macro-kcal)", opacity: weeks[p.k].current ? 0.55 : 1 }} />
      ))}
    </>
  );
}

function WeightChart({ t, pick, goalKg }: { t: ProgressTimeline; pick: ProgressWeek | null; goalKg: number | null }) {
  const total = Math.max(1, t.weeks.length * 7 * t.periodWeeks);
  if (t.days.length < 2) return null;
  const vals = t.days.flatMap((d) => (d.kg != null ? [d.trendKg, d.kg] : [d.trendKg]));
  let lo0 = Math.min(...vals);
  let hi0 = Math.max(...vals);
  const showGoal = goalInView(t, goalKg);
  if (showGoal) {
    lo0 = Math.min(lo0, goalKg!);
    hi0 = Math.max(hi0, goalKg!);
  }
  const span = Math.max(1, hi0 - lo0);
  const lo = lo0 - span * 0.1;
  const hi = hi0 + span * 0.1;
  const x = (date: string) => ((dayDiff(t.from, date) + 0.5) / total) * 100;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const path = t.days.map((d, k) => `${k === 0 ? "M" : "L"}${x(d.date).toFixed(2)},${y(d.trendKg).toFixed(2)}`).join(" ");
  // The picked week's trend, marked where the week ends (the number in the heading).
  const end = pick ? [...t.days].reverse().find((d) => d.date <= pick.end && d.date >= pick.start) : null;
  return (
    <>
      {showGoal && (
        <>
          <span className="absolute inset-x-0 border-t border-dashed" style={{ top: `${y(goalKg!)}%`, borderColor: "var(--chart-trend)", opacity: 0.7 }} />
        </>
      )}
      {t.days.length <= 200 &&
        t.days.map((d) => (d.kg != null ? <span key={d.date} className="absolute h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(d.date)}%`, top: `${y(d.kg)}%`, background: "var(--chart-raw)" }} /> : null))}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <path d={path} fill="none" stroke="var(--chart-trend)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {end && <span className="absolute h-[9px] w-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(end.date)}%`, top: `${y(end.trendKg)}%`, background: "var(--chart-trend)", border: "2px solid var(--surface)" }} />}
    </>
  );
}

/** A lift's weekly best estimated 1RM as dots joined up, and, when its change is clear, a faint straight line through its sessions (PR3, X1). */
function LiftChart({ l, sel, t }: { l: LiftWeeks; sel: number | null; t: ProgressTimeline }) {
  const n = l.e1rmKg.length;
  const total = Math.max(1, t.weeks.length * 7 * t.periodWeeks);
  const dx = (date: LocalDate) => ((dayDiff(t.from, date) + 0.5) / total) * 100;
  const present = l.e1rmKg.map((v, k) => (v != null ? { k, v } : null)).filter((p): p is { k: number; v: number } => p != null);
  if (!present.length) return null;
  const vals = [...present.map((p) => p.v), ...(l.fit?.clear ? [l.fit.fromKg, l.fit.toKg] : [])];
  const pad = Math.max(1, (Math.max(...vals) - Math.min(...vals)) * 0.15);
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {l.fit?.clear && <line x1={dx(l.fit.fromDate)} x2={dx(l.fit.toDate)} y1={y(l.fit.fromKg)} y2={y(l.fit.toKg)} stroke="var(--chart-lift)" strokeOpacity={0.4} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        <polyline points={present.map((p) => `${cx(p.k, n)},${y(p.v)}`).join(" ")} fill="none" stroke="var(--chart-lift)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {present.map((p) => (
        <span key={p.k} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${cx(p.k, n)}%`, top: `${y(p.v)}%`, width: p.k === sel ? 9 : 6, height: p.k === sel ? 9 : 6, background: "var(--chart-lift)" }} />
      ))}
    </>
  );
}

/**
 * Each week's value against the person's usual over the range (C7: their
 * own baseline, not a fixed number), as dots joined faintly, the usual
 * dashed. Sleep marks a week well under it hollow.
 */
function UsualDots({ weeks, value, usual, color, hollow, minPad, sel }: { weeks: ProgressWeek[]; value: (w: ProgressWeek) => number | null; usual: number | null; color: string; hollow?: (v: number, usual: number) => boolean; minPad: number; sel: number | null }) {
  const n = weeks.length;
  const present = weeks.map((w, k) => (value(w) != null ? { k, v: value(w) as number } : null)).filter((p): p is { k: number; v: number } => p != null);
  if (!present.length) return null;
  const vals = [...present.map((p) => p.v), ...(usual != null ? [usual] : [])];
  const pad = Math.max(minPad, (Math.max(...vals) - Math.min(...vals)) * 0.2);
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad * 1.8;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  return (
    <>
      {usual != null && <span className="absolute inset-x-0 border-t border-dashed" style={{ top: `${y(usual)}%`, borderColor: color, opacity: 0.7 }} />}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <polyline points={present.map((p) => `${cx(p.k, n)},${y(p.v)}`).join(" ")} fill="none" stroke={color} strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {present.map((p) => {
        const open = usual != null && hollow != null && hollow(p.v, usual);
        const size = p.k === sel ? 10 : 7;
        return <span key={p.k} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${cx(p.k, n)}%`, top: `${y(p.v)}%`, width: size, height: size, ...(open ? { border: `1.5px solid ${color}`, background: "var(--surface)" } : { background: color }), opacity: weeks[p.k].current ? 0.55 : 1 }} />;
      })}
    </>
  );
}

/**
 * The watch's HRV and resting heart rate (PR3g), on the same weeks, each
 * against the person's usual; only when a watch has sent them. The
 * heading reads the last full week, where a recent change shows.
 */
function watchRows(weeks: ProgressWeek[], s: ProgressTimeline["summary"], sel: number | null): RowSpec[] {
  const last = (f: (w: ProgressWeek) => number | null) => [...weeks].reverse().find((w) => !w.current && f(w) != null);
  const rows: RowSpec[] = [];
  if (weeks.some((w) => w.hrvMs != null)) {
    const w0 = last((w) => w.hrvMs);
    rows.push({
      id: "hrv",
      label: "HRV",
      color: "var(--chart-hrv)",
      summary: (
        <>
          {w0 ? `${n0(w0.hrvMs!)} ms last week` : "Not enough nights yet"}
          {s.usualHrvMs != null && (
            <>
              {" · "}
              <Swatch color="var(--chart-hrv)" dashed />
              your usual {n0(s.usualHrvMs)}
            </>
          )}
        </>
      ),
      week: (w) => (w.hrvMs != null ? `${n0(w.hrvMs)} ms a night` : "Not enough nights"),
      chart: <UsualDots weeks={weeks} value={(w) => w.hrvMs} usual={s.usualHrvMs} color="var(--chart-hrv)" minPad={2} sel={sel} />,
    });
  }
  if (weeks.some((w) => w.restingHr != null)) {
    const w0 = last((w) => w.restingHr);
    rows.push({
      id: "rhr",
      label: "Resting heart rate",
      color: "var(--chart-heart)",
      summary: (
        <>
          {w0 ? `${n0(w0.restingHr!)} bpm last week` : "Not enough nights yet"}
          {s.usualRestingHr != null && (
            <>
              {" · "}
              <Swatch color="var(--chart-heart)" dashed />
              your usual {n0(s.usualRestingHr)}
            </>
          )}
        </>
      ),
      week: (w) => (w.restingHr != null ? `${n0(w.restingHr)} bpm` : "Not enough nights"),
      chart: <UsualDots weeks={weeks} value={(w) => w.restingHr} usual={s.usualRestingHr} color="var(--chart-heart)" minPad={1} sel={sel} />,
    });
  }
  return rows;
}
