"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { WeekReport } from "@/lib/physique/weekReport";
import type { Chart, Tile, TileId, Tone } from "@/lib/physique/weekScorecard";
import { FIBRE_TARGET_G, pctOfBodyWeight } from "@/lib/physique/weekScorecard";
import type { PhysiqueGoal } from "@/lib/physique/types";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { bandLabel } from "@/lib/training/volumeTargets";
import { formatBodyWeight, formatWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import { formatRate } from "@/components/physique/WeightChartCard";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { usePick } from "@/components/charts/usePick";
import type { LocalDate } from "@/lib/dates";

const TONE_COLOR: Record<Tone, string> = { good: "var(--status-good)", watch: "var(--status-watch)", neutral: "var(--text-secondary)" };

const n = (v: number) => Math.round(v).toLocaleString("en-GB");
const dash = <span style={{ color: "var(--text-tertiary)" }}>–</span>;
const sign = (v: number) => (v > 0 ? "+" : v < 0 ? "−" : "");

// ── Table ──

export type ReportRow = {
  label: string;
  sub?: string | null;
  now: ReactNode;
  prev?: ReactNode;
  status?: { text: string; tone: Tone } | null;
};

/**
 * One section of the report (W6): a heading, an optional headline figure,
 * and rows of this week against last week, each with what it is measured
 * against and, when the scorecard has one, its read in its tone.
 */
function Section({ title, aside, headline, rows, href, children }: { title: string; aside?: string; headline?: ReactNode; rows: ReportRow[]; href?: string; children?: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3 rounded-[16px] px-4 pb-2 pt-4" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          {href ? (
            <Link href={href} className="underline-offset-4 active:underline">
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        {aside && (
          <span className="text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {aside}
          </span>
        )}
      </div>
      {headline}
      <table className="w-full border-collapse text-left" style={{ fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
            <th scope="col" className="pb-1.5 font-medium">
              <span className="sr-only">Measure</span>
            </th>
            <th scope="col" className="w-[104px] pb-1.5 text-right font-medium">
              This week
            </th>
            <th scope="col" className="w-[84px] pb-1.5 text-right font-medium">
              Last week
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t align-top" style={{ borderColor: "var(--border)" }}>
              <th scope="row" className="py-2.5 pr-2 text-left font-normal">
                <span className="block text-[14px]" style={{ color: "var(--text)" }}>
                  {r.label}
                </span>
                {r.sub && (
                  <span className="block text-[11px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
                    {r.sub}
                  </span>
                )}
              </th>
              <td className="py-2.5 text-right">
                <span className="block whitespace-nowrap text-[15px] font-semibold" style={{ color: "var(--text)" }}>
                  {r.now}
                </span>
                {r.status && (
                  <span className="block text-[11px] font-semibold leading-snug" style={{ color: TONE_COLOR[r.status.tone] }}>
                    {r.status.text}
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap py-2.5 pl-2 text-right text-[14px]" style={{ color: "var(--text-secondary)" }}>
                {r.prev ?? dash}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {children}
    </section>
  );
}

/** The week as a tiny chart: the weight trend as a line, an empty day leaving a gap, the picked day marked (T1). */
function MiniChart({ chart, active }: { chart: Chart; active: number | null }) {
  const W = 120;
  const H = 36;
  if (chart.kind !== "line") return null;
  const vals = chart.values;
  const present = vals.filter((v): v is number => v != null);
  if (present.length < 2) return null;
  const slot = W / 7;
  const lo = Math.min(...present);
  const hi = Math.max(...present);
  const span = Math.max(hi - lo, 0.2);
  const y = (v: number) => 4 + (1 - (v - lo) / span) * (H - 8);
  const pts = vals.map((v, i) => (v == null ? null : `${(i * slot + slot / 2).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
  const on = active != null ? vals[active] : null;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden className="block overflow-visible">
      {on != null && <line x1={active! * slot + slot / 2} x2={active! * slot + slot / 2} y1={0} y2={H} stroke="var(--border-strong)" strokeWidth={1} />}
      <polyline points={pts.join(" ")} fill="none" stroke="var(--chart-trend)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
      {on != null && <circle cx={active! * slot + slot / 2} cy={y(on)} r={3.5} fill="var(--chart-trend)" stroke="var(--surface)" strokeWidth={1.5} />}
    </svg>
  );
}

/** The week's weight change in large type with its line beside it; a tap on the line gives one day's trend weight in its place (T1). */
function WeightHeadline({ weekPct, weekKg, chart, dates, unit }: { weekPct: string | null; weekKg: string | null; chart: Chart | null; dates: LocalDate[]; unit: WeightUnit }) {
  const vals = chart?.kind === "line" ? chart.values : [];
  const { active, bind } = usePick({ xs: vals.map((v, i) => (v != null ? (i + 0.5) / 7 : null)), share: true, data: `${dates[0]}:${vals.length}` });
  const day = active != null && vals[active] != null ? { date: dates[active], kg: vals[active] as number } : null;
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col" aria-live="polite">
        <span className="text-[30px] font-semibold leading-none tracking-[-0.02em]" style={{ color: day || weekPct ? "var(--text)" : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
          {day ? formatBodyWeight(day.kg, unit) : (weekPct ?? "–")}
        </span>
        <span className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {day ? (
            `Trend on ${longLocalDate(day.date)}`
          ) : weekPct ? (
            <>
              of body weight this week · <span className="whitespace-nowrap">{weekKg}</span>
            </>
          ) : (
            "Needs a trend at both ends of the week"
          )}
        </span>
      </div>
      {chart?.kind === "line" && vals.filter((v) => v != null).length >= 2 && (
        <div {...bind} role="group" aria-label="Weight trend by day" className="shrink-0 rounded-[6px] py-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-strong)]">
          <MiniChart chart={chart} active={active} />
        </div>
      )}
    </div>
  );
}

// ── Sections ──

type Props = {
  report: WeekReport;
  prev: WeekReport | null;
  tiles: Tile[];
  unit: WeightUnit;
  goal: PhysiqueGoal | null;
  /** Strength engine's change since the phase began, by lift name. */
  sincePhase: Map<string, number | null>;
};

/**
 * The report's numbers (W6, replacing the tile grid and "All the
 * numbers"): body weight first, its change as a share of body weight,
 * then nutrition, training, and sleep and recovery, each this week
 * against last week. Every number is the engine's; nothing is worked out
 * here but the percentage and the energy balance, which are plain
 * arithmetic on them.
 */
export default function ReportSections({ report: r, prev: p, tiles, unit, goal, sincePhase }: Props) {
  const tile = (id: TileId) => tiles.find((t) => t.id === id) ?? null;
  const w = (kg: number | null | undefined) => (kg == null ? dash : formatBodyWeight(kg, unit));
  const kgDelta = (kg: number | null | undefined) => (kg == null ? dash : `${sign(kg)}${Math.abs(kgToDisplay(kg, unit)).toFixed(2)} ${unit}`);
  const pct = (wk: WeekReport["weight"] | undefined) => (wk ? pctOfBodyWeight(wk.deltaKg, wk.startTrendKg) : null);
  const days = (logged: number, of: number) => `${logged} of ${of}`;

  // ── Body weight ──
  const weekPct = pct(r.weight);
  const weekKg = r.weight.deltaKg == null ? null : `${sign(r.weight.deltaKg)}${Math.abs(kgToDisplay(r.weight.deltaKg, unit)).toFixed(2)} ${unit}`;
  const weightTile = tile("weight");
  const sinceKg = goal && r.weight.endTrendKg != null ? r.weight.endTrendKg - goal.startTrendKg : null;
  const weightRows: ReportRow[] = [
    { label: "Trend weight", sub: "End of the week", now: w(r.weight.endTrendKg), prev: w(p?.weight.endTrendKg) },
    { label: "Change", sub: "Trend, start to end of the week", now: kgDelta(r.weight.deltaKg), prev: kgDelta(p?.weight.deltaKg) },
    { label: "Change, % of body weight", now: weekPct ?? dash, prev: pct(p?.weight) ?? dash },
    {
      label: r.weight.rateWindowDays ? `Rate over ${Math.round(r.weight.rateWindowDays / 7)} weeks` : "Rate",
      sub: goal && goal.type !== "maintain" ? `Plan ${formatRate(goal.ratePctPerWeek)}` : r.weight.rateWindowDays ? null : "Early read · not enough weigh-ins yet",
      now: r.weight.ratePctPerWeek == null ? dash : formatRate(r.weight.ratePctPerWeek),
      prev: p?.weight.ratePctPerWeek == null ? dash : formatRate(p.weight.ratePctPerWeek),
      status: weightTile?.delta ?? null,
    },
    { label: "Weigh-ins", now: days(r.weight.weighIns, r.daysCovered), prev: p ? days(p.weight.weighIns, p.daysCovered) : dash },
  ];
  if (goal && sinceKg != null) {
    const sincePct = pctOfBodyWeight(sinceKg, goal.startTrendKg);
    weightRows.push({
      label: "Since your goal started",
      sub: `From ${formatBodyWeight(goal.startTrendKg, unit)} on ${shortLocalDate(goal.startDate)}`,
      now: (
        <>
          {kgDelta(sinceKg)}
          {sincePct && <span className="block text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>{sincePct}</span>}
        </>
      ),
    });
  }
  if (r.waist.latestCm != null) {
    weightRows.push({ label: "Waist", sub: r.waist.deltaCm == null ? null : `${sign(r.waist.deltaCm)}${Math.abs(r.waist.deltaCm).toFixed(1)} cm over ${r.waist.weeks} weeks`, now: `${r.waist.latestCm.toFixed(1)} cm`, prev: p?.waist.latestCm != null ? `${p.waist.latestCm.toFixed(1)} cm` : dash });
  }

  const weightHeadline = <WeightHeadline weekPct={weekPct} weekKg={weekKg} chart={weightTile?.chart ?? null} dates={r.days.map((d) => d.date)} unit={unit} />;

  // ── Nutrition ──
  const f = r.food;
  const balance = (rep: WeekReport | null) => (rep && rep.food.meanKcal != null && rep.expenditure.endKcal != null ? rep.food.meanKcal - rep.expenditure.endKcal : null);
  const balanceText = (v: number | null) => (v == null ? dash : Math.abs(v) < 25 ? "Even" : `${n(Math.abs(v))} ${v < 0 ? "deficit" : "surplus"}`);
  const nutritionRows: ReportRow[] = [
    { label: "Calories a day", sub: f.targetKcal != null ? `Target ${n(f.targetKcal)}` : "No target set", now: f.meanKcal == null ? dash : n(f.meanKcal), prev: p?.food.meanKcal == null ? dash : n(p.food.meanKcal), status: tile("calories")?.delta ?? null },
    { label: "Protein a day", sub: [f.targetProteinG != null ? `Target ${n(f.targetProteinG)} g` : null, f.proteinGPerKg != null ? `${f.proteinGPerKg.toFixed(1)} g/kg` : null].filter(Boolean).join(" · ") || null, now: f.meanProteinG == null ? dash : `${n(f.meanProteinG)} g`, prev: p?.food.meanProteinG == null ? dash : `${n(p.food.meanProteinG)} g`, status: tile("protein")?.delta ?? null },
  ];
  if (f.meanFibreG != null || p?.food.meanFibreG != null) {
    nutritionRows.push({ label: "Fibre a day", sub: `Target ${FIBRE_TARGET_G} g`, now: f.meanFibreG == null ? dash : `${n(f.meanFibreG)} g`, prev: p?.food.meanFibreG == null ? dash : `${n(p.food.meanFibreG)} g`, status: tile("fibre")?.delta ?? null });
  }
  nutritionRows.push(
    { label: "Maintenance", sub: r.expenditure.state === "holding" ? "Holding until logging resumes" : "Estimated from food and the trend", now: r.expenditure.endKcal == null ? dash : n(r.expenditure.endKcal), prev: p?.expenditure.endKcal == null ? dash : n(p.expenditure.endKcal) },
    { label: "Energy balance", sub: "Calories against maintenance, kcal a day", now: balanceText(balance(r)), prev: balanceText(balance(p)) },
    { label: "Days logged", sub: f.partial > 0 ? `${f.partial} left out as part-logged` : null, now: days(f.daysLogged, r.daysCovered), prev: p ? days(p.food.daysLogged, p.daysCovered) : dash },
  );

  // ── Training ──
  const t = r.training;
  const strength = tile("strength");
  const trainingRows: ReportRow[] = [
    { label: "Training days", sub: `${t.sessions} ${t.sessions === 1 ? "session" : "sessions"}`, now: `${t.days}`, prev: p ? `${p.training.days}` : dash },
    { label: "Hard sets", now: `${t.hardSets}`, prev: p ? `${p.training.hardSets}` : dash, status: tile("training")?.delta ?? null },
  ];
  if (strength && strength.value !== "–") trainingRows.push({ label: "Main lifts", sub: strength.sub, now: strength.value, status: strength.delta, prev: dash });
  if (t.priority) trainingRows.push({ label: "Priority muscles", sub: "In their set range", now: `${t.priority.inRange} of ${t.priority.muscles}`, prev: p?.training.priority ? `${p.training.priority.inRange} of ${p.training.priority.muscles}` : dash, status: tile("priority")?.delta ?? null });
  for (const l of t.lifts) {
    const since = sincePhase.get(l.name) ?? null;
    trainingRows.push({ label: l.name, sub: since == null ? "Best est. 1RM" : `Best est. 1RM · ${sign(since)}${Math.abs(since).toFixed(1)} % since your goal started`, now: formatWeight(l.e1rmKg, unit), prev: l.prevE1rmKg != null ? formatWeight(l.prevE1rmKg, unit) : dash });
  }

  // ── Sleep and recovery ──
  const s = r.sleep;
  const h = r.health;
  const sleepRows: ReportRow[] = [
    { label: "Sleep a night", now: s.meanH == null ? dash : formatHoursMin(s.meanH * 60), prev: p?.sleep.meanH == null ? dash : formatHoursMin(p.sleep.meanH * 60), status: tile("sleep")?.delta ?? null },
    { label: "Nights under 8 hours", now: s.nights ? `${s.shortNights}` : dash, prev: p?.sleep.nights ? `${p.sleep.shortNights}` : dash },
    { label: "Wake time spread", sub: "Most to least consistent morning", now: s.wakeSpreadMin == null ? dash : `±${s.wakeSpreadMin} min`, prev: p?.sleep.wakeSpreadMin == null ? dash : `±${p.sleep.wakeSpreadMin} min`, status: tile("wake")?.delta ?? null },
  ];
  if (h.meanRhr != null || p?.health.meanRhr != null) sleepRows.push({ label: "Resting heart rate", sub: h.usualRhr != null ? `Usually ${h.usualRhr} bpm` : null, now: h.meanRhr == null ? dash : `${h.meanRhr} bpm`, prev: p?.health.meanRhr == null ? dash : `${p.health.meanRhr} bpm`, status: tile("rhr")?.delta ?? null });
  if (h.meanSteps != null || p?.health.meanSteps != null) sleepRows.push({ label: "Steps a day", now: h.meanSteps == null ? dash : n(h.meanSteps), prev: p?.health.meanSteps == null ? dash : n(p.health.meanSteps), status: tile("steps")?.delta ?? null });

  return (
    <>
      <Section title="Body weight" aside={`${r.weight.weighIns} of ${r.daysCovered} days weighed`} headline={weightHeadline} rows={weightRows} href="/body" />
      <Section title="Nutrition" aside={`${f.daysLogged} of ${r.daysCovered} days logged`} rows={nutritionRows} href="/food" />
      <Section title="Training" aside={`${t.hardSets} hard sets`} rows={trainingRows} href="/train">
        {t.byMuscle.length > 0 && (
          <div className="flex flex-col gap-1.5 border-t pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
            <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
              Hard sets by muscle
            </span>
            {t.byMuscle.map((m) => {
              const max = t.byMuscle[0]?.sets ?? 1;
              return (
                <div key={m.group} className="flex items-center gap-3 text-[12px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  <span className="w-[88px] shrink-0 truncate" style={{ color: "var(--text-secondary)" }}>
                    {m.label}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
                    <div className="h-full rounded-full" style={{ width: `${(m.sets / max) * 100}%`, background: "var(--text-secondary)" }} />
                  </div>
                  <span className="w-[72px] shrink-0 text-right" style={{ color: m.read === "over" ? "var(--status-attention)" : m.read === "under" ? "var(--status-watch)" : m.read === "in_range" ? "var(--status-good)" : "var(--text)" }}>
                    {m.sets}
                    {m.band ? <span style={{ color: "var(--text-tertiary)" }}>{` · ${bandLabel(m.band)}`}</span> : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Section>
      <Section title="Sleep and recovery" aside={`${s.nights} of ${r.daysCovered} nights`} rows={sleepRows} href="/sleep" />
    </>
  );
}

