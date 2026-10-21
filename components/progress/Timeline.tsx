"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { usePick } from "@/components/charts/usePick";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { formatEffect } from "@/lib/physique/liftEffect";
import { dayDiff, type LocalDate } from "@/lib/dates";
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
 */
export type TimelineFocus = {
  label: string;
  charts: string[];
  from?: LocalDate;
  onClear: () => void;
};

/** One chart's row: its id (the Home tiles link to it), name, colour, what the range adds up to, what the picked week holds, and an optional page it opens. */
type RowSpec = { id: string; group?: string; label: string; color: string; href?: string; summary: ReactNode | null; week: (w: ProgressWeek) => ReactNode; chart: ReactNode; height?: number };

/**
 * The Progress timeline (PR1, PR3): weight against the goal, calories
 * against maintenance, protein against target, hard sets, each main lift's
 * estimated 1RM in kilos, and sleep against the person's usual, all on the
 * same weeks, every reference line named in its heading. Tap or drag across any chart
 * (T1) and one column runs through all of them, each chart's heading turns
 * to that week's number and the week's dates show at the top. Tapping the
 * week again goes back to the range.
 */
export default function Timeline({ t, range, onRange, unit, goalKg, focus }: { t: ProgressTimeline; range: ProgressRange; onRange: (r: ProgressRange) => void; unit: WeightUnit; /** The goal's target, drawn on the weight chart. */ goalKg?: number | null; focus?: TimelineFocus | null }) {
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
    href: `/exercise?name=${encodeURIComponent(l.name)}`,
    summary: l.fit ? `${formatWeight(l.fit.toKg, unit, 0)} est. 1RM · ${formatEffect(l.fit.toKg - l.fit.fromKg, unit)}` : lastValue(l) != null ? `${formatWeight(lastValue(l)!, unit, 0)} est. 1RM` : null,
    week: (w) => {
      const v = l.e1rmKg[weeks.indexOf(w)];
      return v != null ? `${formatWeight(v, unit, 0)} est. 1RM` : "Not trained";
    },
    chart: <LiftChart l={l} sel={sel} />,
  }));
  const rows: RowSpec[] = [
    {
      id: "weight",
      label: "Weight",
      color: "var(--chart-trend)",
      summary:
        s.trendChangeKg != null ? (
          <>
            {signed(kgToDisplay(s.trendChangeKg, unit))} {kgUnit} over {RANGE_WORDS[range]}
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
            {s.balanceKcal != null && (
              <>
                {` · ${n0(Math.abs(s.balanceKcal))} ${s.balanceKcal < 0 ? "under" : "over"} `}
                <Swatch color="var(--text-secondary)" />
                maintenance
              </>
            )}
          </>
        ) : null,
      week: (w) => (w.kcal != null ? `${n0(w.kcal)} a day${w.balanceKcal != null ? ` · ${n0(Math.abs(w.balanceKcal))} ${w.balanceKcal < 0 ? "under" : "over"} maintenance` : ""}` : w.foodDays ? `${w.foodDays} ${w.foodDays === 1 ? "day" : "days"} logged` : "Not logged"),
      chart: <CaloriesChart weeks={weeks} sel={sel} />,
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
      chart: <SleepChart weeks={weeks} usual={s.usualSleepH} sel={sel} />,
    },
  ];

  const w = sel != null ? weeks[sel] : null;
  const mid = weeks[Math.floor((weeks.length - 1) / 2)];
  const bright = (r: RowSpec) => !focus || focus.charts.includes(r.id) || (r.group != null && focus.charts.includes(r.group));
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
        {rows.map((r, i) => (
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
                {w ? r.week(w) : (r.summary ?? "Not enough logged yet")}
              </span>
            </div>
            <div className="relative" style={{ height: r.height ?? 52 }}>
              {r.chart}
            </div>
          </div>
        ))}
      </div>

      <div className="mx-4 flex justify-between pb-3 pt-1 text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }} aria-hidden>
        <span>{weeks[0] ? shortLocalDate(weeks[0].start) : ""}</span>
        <span>{mid && weeks.length > 2 ? shortLocalDate(mid.start) : ""}</span>
        <span>{weeks.at(-1) ? shortLocalDate(weeks.at(-1)!.start) : ""}</span>
      </div>
    </section>
  );
}

function lastValue(l: LiftWeeks): number | null {
  return [...l.e1rmKg].reverse().find((v): v is number => v != null) ?? null;
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
function CaloriesChart({ weeks, sel }: { weeks: ProgressWeek[]; sel: number | null }) {
  const n = weeks.length;
  const all = weeks.flatMap((w) => [w.kcal, w.maintenanceKcal]).filter((x): x is number => x != null);
  if (!all.length) return null;
  const pad = Math.max(80, (Math.max(...all) - Math.min(...all)) * 0.18);
  const lo = Math.min(...all) - pad;
  const hi = Math.max(...all) + pad;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const maint = weeks.map((w, k) => (w.maintenanceKcal != null ? { k, v: w.maintenanceKcal } : null)).filter((p): p is { k: number; v: number } => p != null);
  const eaten = weeks.map((w, k) => (w.kcal != null ? { k, v: w.kcal } : null)).filter((p): p is { k: number; v: number } => p != null);
  // The gap, shaded over each run of weeks with both numbers.
  const runs: Array<Array<{ k: number; a: number; b: number }>> = [];
  weeks.forEach((w, k) => {
    if (w.kcal == null || w.maintenanceKcal == null) return;
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

/** A lift's weekly best estimated 1RM as dots joined up, with a faint straight line through them for the direction (PR3, X1). */
function LiftChart({ l, sel }: { l: LiftWeeks; sel: number | null }) {
  const n = l.e1rmKg.length;
  const present = l.e1rmKg.map((v, k) => (v != null ? { k, v } : null)).filter((p): p is { k: number; v: number } => p != null);
  if (!present.length) return null;
  const vals = [...present.map((p) => p.v), ...(l.fit ? [l.fit.fromKg, l.fit.toKg] : [])];
  const pad = Math.max(1, (Math.max(...vals) - Math.min(...vals)) * 0.15);
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  return (
    <>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        {l.fit && <line x1={cx(l.fit.fromIdx, n)} x2={cx(l.fit.toIdx, n)} y1={y(l.fit.fromKg)} y2={y(l.fit.toKg)} stroke="var(--chart-lift)" strokeOpacity={0.4} strokeWidth={3} strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        <polyline points={present.map((p) => `${cx(p.k, n)},${y(p.v)}`).join(" ")} fill="none" stroke="var(--chart-lift)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {present.map((p) => (
        <span key={p.k} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${cx(p.k, n)}%`, top: `${y(p.v)}%`, width: p.k === sel ? 9 : 6, height: p.k === sel ? 9 : 6, background: "var(--chart-lift)" }} />
      ))}
    </>
  );
}

/** Each week's average night against the person's usual (C7: their own baseline, not a fixed 7 or 8 hours); a week well under it is hollow. */
function SleepChart({ weeks, usual, sel }: { weeks: ProgressWeek[]; usual: number | null; sel: number | null }) {
  const n = weeks.length;
  const present = weeks.map((w, k) => (w.sleepH != null ? { k, v: w.sleepH } : null)).filter((p): p is { k: number; v: number } => p != null);
  if (!present.length) return null;
  const vals = [...present.map((p) => p.v), ...(usual != null ? [usual] : [])];
  const pad = Math.max(0.25, (Math.max(...vals) - Math.min(...vals)) * 0.2);
  const lo = Math.min(...vals) - pad;
  const hi = Math.max(...vals) + pad * 1.8;
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  return (
    <>
      {usual != null && (
        <>
          <span className="absolute inset-x-0 border-t border-dashed" style={{ top: `${y(usual)}%`, borderColor: "var(--chart-sleep)", opacity: 0.7 }} />
        </>
      )}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <polyline points={present.map((p) => `${cx(p.k, n)},${y(p.v)}`).join(" ")} fill="none" stroke="var(--chart-sleep)" strokeOpacity={0.55} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {present.map((p) => {
        const short = usual != null && p.v < usual - SHORT_WEEK_H;
        const size = p.k === sel ? 10 : 7;
        return <span key={p.k} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${cx(p.k, n)}%`, top: `${y(p.v)}%`, width: size, height: size, ...(short ? { border: "1.5px solid var(--chart-sleep)", background: "var(--surface)" } : { background: "var(--chart-sleep)" }), opacity: weeks[p.k].current ? 0.55 : 1 }} />;
      })}
    </>
  );
}
