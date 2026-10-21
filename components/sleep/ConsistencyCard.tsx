"use client";

import { ChartTip, useContainerWidth } from "@/components/charts/ChartTip";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import { usePick } from "@/components/charts/usePick";
import { RATE_COLOR, SCard } from "@/components/sleep/parts";
import { CONSISTENCY_MIN_NIGHTS, type ConsistencyRead } from "@/lib/physique/sleepScore";

/** Minutes either side of the usual wake time the strip shows. OURS: 90 min fits a weekend lie-in. */
const RANGE_MIN = 90;
const HEIGHT = 112;
/** The right-hand gutter for the usual time and "earlier" / "later", px (Tailwind right-10). */
const GUTTER = 40;

function offsetText(min: number): string {
  const m = Math.round(Math.abs(min));
  if (m < 5) return "on time";
  return `${m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`} ${min > 0 ? "late" : "early"}`;
}

/**
 * Wake-time consistency (S8): a week of mornings on a strip around your
 * usual wake time, one dot a morning (a gap when there is no night), with
 * the spread worded. Wake time, not bedtime: a fixed wake time is the
 * anchor sleep medicine starts from. A tap on a morning gives its wake time (T1).
 */
export default function ConsistencyCard({ read }: { read: ConsistencyRead }) {
  const usual = read.usual;
  const word = read.word;
  const [box, width] = useContainerWidth<HTMLDivElement>();
  const n = read.days.length;
  const { active, bind } = usePick({ xs: read.days.map((d, i) => (d.offsetMin !== null ? (i + 0.5) / n : null)), share: true, data: `${read.days[0]?.date}:${n}` });
  const day = active != null ? read.days[active] : null;
  const yOf = (offset: number) => HEIGHT / 2 + (Math.max(-RANGE_MIN, Math.min(RANGE_MIN, offset)) / RANGE_MIN) * (HEIGHT / 2 - 10);
  return (
    <SCard
      title="Consistency"
      aside={
        word ? (
          <span className="text-[13px] font-semibold" style={{ color: RATE_COLOR[word] }}>
            {word}
          </span>
        ) : null
      }
      label="Wake-time consistency"
      className="flex flex-col gap-3 px-4 py-4"
    >
      <p className="text-[15px] leading-snug">
        {word && read.spreadMin !== null
          ? `Wake time within about ${Math.round(read.spreadMin)} min of ${usual?.hhmm ?? "usual"} over ${read.nights} mornings.`
          : `${read.nights} of ${CONSISTENCY_MIN_NIGHTS} mornings with a wake time. The read starts at ${CONSISTENCY_MIN_NIGHTS}.`}
      </p>
      {usual && (
        <div ref={box} className="relative" style={{ height: HEIGHT }}>
          <div className="absolute left-0 right-10 border-t border-dashed" style={{ top: HEIGHT / 2, borderColor: "var(--sl-accent-dim)" }} />
          <span className="absolute right-0 text-[11px] font-medium" style={{ top: HEIGHT / 2 - 8, color: "var(--sl-accent)", fontVariantNumeric: "tabular-nums" }}>
            {usual.hhmm}
          </span>
          <span className="absolute right-0 top-0 text-[10px]" style={{ color: "var(--sl-text-tertiary)" }}>
            earlier
          </span>
          <span className="absolute bottom-0 right-0 text-[10px]" style={{ color: "var(--sl-text-tertiary)" }}>
            later
          </span>
          <div
            {...bind}
            className="absolute inset-y-0 left-0 right-10 grid rounded-[6px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--sl-text-tertiary)]"
            style={{ ...bind.style, gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
            role="group"
            aria-label={read.days.map((d) => `${longLocalDate(d.date)}: ${d.wake ? `${d.wake}, ${d.offsetMin !== null ? offsetText(d.offsetMin) : ""}` : "no night"}`).join("; ")}
          >
            {read.days.map((d, i) => (
              <div key={d.date} className="relative rounded-[4px]" style={{ background: active === i ? "var(--sl-surface-raised)" : undefined }}>
                {d.offsetMin !== null && (
                  <span className={`absolute left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${active === i ? "h-[13px] w-[13px]" : "h-[10px] w-[10px]"}`} style={{ top: yOf(d.offsetMin), background: Math.abs(d.offsetMin) > 30 ? "var(--sl-rate-fair)" : "var(--sl-accent)", opacity: active != null && active !== i ? 0.4 : 1 }} />
                )}
              </div>
            ))}
          </div>
          {day && day.offsetMin !== null && (
            <ChartTip
              sleep
              x={((active! + 0.5) / n) * Math.max(0, width - GUTTER)}
              y={yOf(day.offsetMin)}
              width={Math.max(0, width - GUTTER)}
              title={longLocalDate(day.date)}
              rows={[
                { label: "Woke", value: day.wake ?? "–" },
                { label: `Usual ${usual.hhmm}`, value: offsetText(day.offsetMin) },
              ]}
              w={164}
            />
          )}
        </div>
      )}
      <div className="mr-10 grid" style={{ gridTemplateColumns: `repeat(${read.days.length}, minmax(0, 1fr))` }}>
        {read.days.map((d) => (
          <span key={d.date} className="text-center text-[10px] font-medium" style={{ color: "var(--sl-text-tertiary)" }}>
            {longLocalDate(d.date).charAt(0)}
          </span>
        ))}
      </div>
    </SCard>
  );
}
