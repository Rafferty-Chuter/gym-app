"use client";

import Link from "next/link";
import type { Chart, Tile, Tone } from "@/lib/physique/weekScorecard";

const TONE_COLOR: Record<Tone, string> = { good: "var(--status-good)", watch: "var(--status-watch)", neutral: "var(--text-secondary)" };

const W = 120;
const H = 32;

/** A week of values as a tiny chart: a line for the weight trend, bars with a dashed target for the rest. Empty days leave a gap. */
function MiniChart({ chart, tone }: { chart: Chart; tone: Tone }) {
  if (chart.kind === "none") return <div style={{ height: H }} aria-hidden />;
  const vals = chart.values;
  const present = vals.filter((v): v is number => v != null);
  if (present.length === 0) return <div style={{ height: H }} aria-hidden />;
  const slot = W / 7;
  if (chart.kind === "line") {
    const lo = Math.min(...present);
    const hi = Math.max(...present);
    const span = Math.max(hi - lo, 0.2);
    const y = (v: number) => 4 + (1 - (v - lo) / span) * (H - 8);
    const pts = vals.map((v, i) => (v == null ? null : `${(i * slot + slot / 2).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean);
    const last = vals.reduce<{ i: number; v: number } | null>((acc, v, i) => (v == null ? acc : { i, v }), null);
    return (
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
        <polyline points={pts.join(" ")} fill="none" stroke="var(--chart-trend)" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {last && <circle cx={last.i * slot + slot / 2} cy={y(last.v)} r={2.5} fill={TONE_COLOR[tone === "neutral" ? "neutral" : tone]} />}
      </svg>
    );
  }
  const max = Math.max(...present, chart.target ?? 0) * 1.08;
  const y = (v: number) => H - (v / max) * H;
  const bw = slot * 0.56;
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      {vals.map((v, i) =>
        v == null ? (
          <rect key={i} x={i * slot + (slot - bw) / 2} y={H - 2} width={bw} height={2} rx={1} fill="var(--border)" />
        ) : (
          <rect key={i} x={i * slot + (slot - bw) / 2} y={y(v)} width={bw} height={H - y(v)} rx={1.5} fill={chart.target != null && v >= chart.target * 0.97 ? "var(--green)" : "var(--chart-raw)"} />
        )
      )}
      {chart.target != null && <line x1={0} x2={W} y1={y(chart.target)} y2={y(chart.target)} stroke="var(--text-tertiary)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/**
 * The week at a glance (W4, after the summary grids in Gentler Streak and
 * WHOOP's weekly): six tiles, each one number, what it is measured
 * against, the change in its tone and the week as a tiny chart. A tile
 * opens the tab it comes from.
 */
export default function Scorecard({ tiles }: { tiles: Tile[] }) {
  return (
    <section aria-label="The week in numbers" className="grid grid-cols-2 gap-2">
      {tiles.map((t) => (
        <Link key={t.id} href={t.href} className="flex min-w-0 flex-col gap-1 rounded-[16px] px-3.5 pb-3 pt-3 transition-colors active:bg-[var(--surface-raised)]" style={{ background: "var(--surface)" }} aria-label={`${t.label}: ${t.value}. ${t.sub}.${t.delta ? ` ${t.delta.text}.` : ""} Open`}>
          <span className="text-[12px] font-medium" style={{ color: "var(--text-secondary)" }}>
            {t.label}
          </span>
          <span className="truncate text-[22px] font-semibold leading-tight tracking-[-0.01em]" style={{ color: t.value === "–" ? "var(--text-tertiary)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {t.value}
          </span>
          <span className="truncate text-[11px] font-semibold" style={{ color: t.delta ? TONE_COLOR[t.delta.tone] : "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {t.delta ? t.delta.text : " "}
          </span>
          <div className="mt-1">
            <MiniChart chart={t.chart} tone={t.delta?.tone ?? "neutral"} />
          </div>
          <span className="mt-1 line-clamp-2 text-[11px] leading-snug" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {t.sub}
          </span>
        </Link>
      ))}
    </section>
  );
}
