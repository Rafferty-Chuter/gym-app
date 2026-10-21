"use client";

import { useRef, useState, type ReactNode } from "react";
import { shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { formatHoursMin } from "@/lib/physique/dayTotals";
import { dayDiff } from "@/lib/dates";
import type { ProgressRange, ProgressTimeline, ProgressWeek } from "@/lib/physique/progressTimeline";
import { formatBodyWeight, kgToDisplay, type WeightUnit } from "@/lib/units";

const RANGES: ProgressRange[] = ["1M", "3M", "6M", "All"];
const RANGE_WORDS: Record<ProgressRange, string> = { "1M": "this month", "3M": "3 months", "6M": "6 months", All: "all time" };

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const signed = (v: number, digits = 1) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(digits)}`;
const hm = (h: number) => formatHoursMin(Math.round(h * 60));

/** One chart's rows: its id (the Home tiles link to it), name, colour and what the range adds up to. */
type RowSpec = { id: string; label: string; color: string; summary: string | null; chart: ReactNode };

/**
 * The Progress timeline (PR1): weight, calories against maintenance,
 * protein, training, strength and sleep, one chart each, all on the same
 * weeks. Drag or tap across any chart and one line runs through all of
 * them, with that week's numbers underneath, so what moved together can be
 * seen without the app saying it.
 */
export default function Timeline({ t, range, onRange, unit }: { t: ProgressTimeline; range: ProgressRange; onRange: (r: ProgressRange) => void; unit: WeightUnit }) {
  const weeks = t.weeks;
  const n = Math.max(1, weeks.length);
  const lastWithData = (() => {
    for (let k = weeks.length - 1; k >= 0; k--) if (weeks[k].kcal != null || weeks[k].trendKg != null || weeks[k].sessions > 0) return k;
    return weeks.length - 1;
  })();
  const [picked, setPicked] = useState<number | null>(null);
  const sel = Math.min(picked ?? lastWithData, weeks.length - 1);
  const stackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function pick(clientX: number) {
    const el = stackRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const k = Math.floor(((clientX - r.left) / r.width) * n);
    setPicked(Math.max(0, Math.min(n - 1, k)));
  }

  const s = t.summary;
  const kgUnit = unit === "lb" ? "lb" : "kg";
  const rows: RowSpec[] = [
    { id: "weight", label: "Weight", color: "var(--chart-trend)", summary: s.trendChangeKg != null ? `${signed(kgToDisplay(s.trendChangeKg, unit))} ${kgUnit} over ${RANGE_WORDS[range]}` : null, chart: <WeightChart t={t} /> },
    {
      id: "calories",
      label: "Calories",
      color: "var(--macro-kcal)",
      summary: s.kcal != null ? `${n0(s.kcal)} a day${s.balanceKcal != null ? ` · ${n0(Math.abs(s.balanceKcal))} ${s.balanceKcal < 0 ? "under" : "over"} maintenance` : ""}` : null,
      chart: <CaloriesChart weeks={weeks} />,
    },
    { id: "protein", label: "Protein", color: "var(--macro-protein)", summary: s.proteinG != null ? `${n0(s.proteinG)} g a day` : null, chart: <Bars weeks={weeks} value={(w) => w.proteinG} target={(w) => w.proteinTargetG} color="var(--macro-protein)" /> },
    { id: "training", label: "Training", color: "var(--chart-training)", summary: s.setsPerWeek != null ? `${n0(s.setsPerWeek)} hard sets a week` : null, chart: <Bars weeks={weeks} value={(w) => (w.sessions > 0 ? w.hardSets : null)} color="var(--chart-training)" /> },
    { id: "strength", label: "Strength", color: "var(--chart-training)", summary: s.strengthPct != null ? `${signed(s.strengthPct)}% · ${t.lifts.slice(0, 3).join(", ")}` : null, chart: <StrengthChart weeks={weeks} /> },
    { id: "sleep", label: "Sleep", color: "var(--chart-sleep)", summary: s.sleepH != null ? `${hm(s.sleepH)} a night` : null, chart: <Bars weeks={weeks} value={(w) => w.sleepH} fixedTarget={7} color="var(--chart-sleep)" minTop={9} /> },
  ];

  const w = weeks[sel];
  const mid = weeks[Math.floor((weeks.length - 1) / 2)];
  return (
    <section aria-label="Over time" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
          Over time
        </span>
        <div className="flex gap-1" role="tablist" aria-label="Range">
          {RANGES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={r === range} onClick={() => { setPicked(null); onRange(r); }} className="h-[28px] rounded-full px-2.5 text-[12px] font-medium" style={{ background: r === range ? "var(--primary)" : "var(--surface-raised)", color: r === range ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
              {r}
            </button>
          ))}
        </div>
      </div>

      <div
        ref={stackRef}
        className="relative mx-4 select-none"
        style={{ touchAction: "pan-y" }}
        onPointerDown={(e) => {
          dragging.current = true;
          pick(e.clientX);
        }}
        onPointerMove={(e) => {
          if (dragging.current || e.pointerType === "mouse") pick(e.clientX);
        }}
        onPointerUp={() => (dragging.current = false)}
        onPointerLeave={() => (dragging.current = false)}
        aria-hidden
      >
        {/* The picked week, one column through every chart. */}
        <span className="pointer-events-none absolute inset-y-0 z-0" style={{ left: `${(sel / n) * 100}%`, width: `${100 / n}%`, background: "var(--surface-raised)", opacity: 0.7, borderRadius: 4 }} />
        {rows.map((r) => (
          <div key={r.id} id={r.id} className="relative z-[1] scroll-mt-24 pb-3 pt-2.5" style={{ borderTop: r.id === "weight" ? undefined : "1px solid var(--border)" }}>
            <div className="mb-1.5 flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
                {r.label}
              </span>
              <span className="truncate text-[11px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {r.summary ?? "Not enough logged yet"}
              </span>
            </div>
            <div className="relative h-[52px]">{r.chart}</div>
          </div>
        ))}
      </div>

      <div className="mx-4 flex justify-between pb-3 pt-1 text-[10px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }} aria-hidden>
        <span>{weeks[0] ? shortLocalDate(weeks[0].start) : ""}</span>
        <span>{mid && weeks.length > 2 ? shortLocalDate(mid.start) : ""}</span>
        <span>{weeks.at(-1) ? shortLocalDate(weeks.at(-1)!.start) : ""}</span>
      </div>

      {w && <WeekDetail w={w} unit={unit} />}
    </section>
  );
}

// ── The picked week ──

function WeekDetail({ w, unit }: { w: ProgressWeek; unit: WeightUnit }) {
  const kgUnit = unit === "lb" ? "lb" : "kg";
  const cells: Array<[string, string, string | null]> = [
    ["Weight", w.trendKg != null ? formatBodyWeight(w.trendKg, unit) : "–", w.trendChangeKg != null ? `${signed(kgToDisplay(w.trendChangeKg, unit))} ${kgUnit} on the week` : null],
    ["Calories", w.kcal != null ? `${n0(w.kcal)} a day` : "–", w.balanceKcal != null ? `${n0(Math.abs(w.balanceKcal))} ${w.balanceKcal < 0 ? "under" : "over"} maintenance` : w.foodDays ? `${w.foodDays} days logged` : null],
    ["Protein", w.proteinG != null ? `${n0(w.proteinG)} g a day` : "–", w.proteinTargetG != null && w.proteinG != null ? `target ${n0(w.proteinTargetG)} g` : null],
    ["Training", w.sessions ? `${w.sessions} ${w.sessions === 1 ? "session" : "sessions"}` : "–", w.sessions ? `${w.hardSets} hard sets` : null],
    ["Strength", w.strengthPct != null ? `${signed(w.strengthPct)}%` : "–", w.strengthPct != null ? "main lifts" : null],
    ["Sleep", w.sleepH != null ? `${hm(w.sleepH)} a night` : "–", w.nights ? `${w.nights} nights` : null],
  ];
  const days = dayDiff(w.start, w.end) + 1;
  return (
    <div className="flex flex-col gap-2 px-4 pb-4 pt-3" style={{ borderTop: "1px solid var(--border)" }} aria-live="polite">
      <span className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
        Week of {shortLocalDate(w.start)}
        {w.current && <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}> · {days} of 7 days so far</span>}
      </span>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
        {cells.map(([label, value, sub]) => (
          <div key={label} className="flex min-w-0 flex-col">
            <dt className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
              {label}
            </dt>
            <dd className="truncate text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
              {value}
            </dd>
            {sub && (
              <dd className="truncate text-[11px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {sub}
              </dd>
            )}
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Charts ──
// Bars and dots are HTML so they stay crisp at any width; lines are SVG with a non-scaling stroke.

const slot = (k: number, n: number) => ({ left: `${(k / n) * 100}%`, width: `${100 / n}%` });

function Bars({ weeks, value, target, fixedTarget, color, minTop = 0 }: { weeks: ProgressWeek[]; value: (w: ProgressWeek) => number | null; target?: (w: ProgressWeek) => number | null; fixedTarget?: number; color: string; minTop?: number }) {
  const n = weeks.length;
  const vals = weeks.map(value);
  const targets = weeks.map((w) => (target ? target(w) : null));
  const top = Math.max(minTop, ...vals.map((v) => v ?? 0), ...targets.map((v) => v ?? 0), fixedTarget ?? 0) * 1.08 || 1;
  return (
    <>
      {vals.map((v, k) => (
        <span key={k} className="absolute bottom-0 flex h-full items-end justify-center" style={slot(k, n)}>
          {v != null && v > 0 && <span className="w-[62%] max-w-[14px] rounded-t-[3px]" style={{ height: `${Math.max(4, (v / top) * 100)}%`, background: color, opacity: weeks[k].current ? 0.55 : 1 }} />}
        </span>
      ))}
      {targets.map((tv, k) => (tv != null ? <span key={`t${k}`} className="absolute border-t border-dashed" style={{ ...slot(k, n), bottom: `${(tv / top) * 100}%`, borderColor: "var(--text-tertiary)" }} /> : null))}
      {fixedTarget != null && <span className="absolute inset-x-0 border-t border-dashed" style={{ bottom: `${(fixedTarget / top) * 100}%`, borderColor: "var(--text-tertiary)", opacity: 0.8 }} />}
    </>
  );
}

function CaloriesChart({ weeks }: { weeks: ProgressWeek[] }) {
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
          {w.kcal != null && <span className="w-[62%] max-w-[14px] rounded-t-[3px]" style={{ height: `${Math.max(4, y(w.kcal))}%`, background: "var(--macro-kcal)", opacity: w.current ? 0.55 : 1 }} />}
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

function WeightChart({ t }: { t: ProgressTimeline }) {
  const total = Math.max(1, t.weeks.length * 7);
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
  return (
    <>
      {t.days.length <= 200 &&
        t.days.map((d) => (d.kg != null ? <span key={d.date} className="absolute h-[3px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${x(d.date)}%`, top: `${y(d.kg)}%`, background: "var(--chart-raw)" }} /> : null))}
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <path d={path} fill="none" stroke="var(--chart-trend)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
    </>
  );
}

function StrengthChart({ weeks }: { weeks: ProgressWeek[] }) {
  const n = weeks.length;
  const vals = weeks.map((w) => w.strengthPct);
  const present = vals.filter((v): v is number => v != null);
  if (present.length < 2) return null;
  const lo = Math.min(-2, ...present);
  const hi = Math.max(2, ...present);
  const y = (v: number) => 100 - ((v - lo) / (hi - lo)) * 100;
  const pts = vals.map((v, k) => (v == null ? null : { x: ((k + 0.5) / n) * 100, y: y(v) })).filter((p): p is { x: number; y: number } => p != null);
  return (
    <>
      <span className="absolute inset-x-0 border-t border-dashed" style={{ top: `${y(0)}%`, borderColor: "var(--text-tertiary)", opacity: 0.8 }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
        <polyline points={pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")} fill="none" stroke="var(--chart-training)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {pts.map((p, k) => (
        <span key={k} className="absolute h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full" style={{ left: `${p.x}%`, top: `${p.y}%`, background: "var(--surface)", border: "1.5px solid var(--chart-training)" }} />
      ))}
    </>
  );
}
