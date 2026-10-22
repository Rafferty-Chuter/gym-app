"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";
import type { LocalDate } from "@/lib/dates";
import { firstReadParts } from "@/lib/physique/copy";
import type { Unlock, UnlockId } from "@/lib/physique/progressUnlocks";

const META: Record<UnlockId, { label: string; color: string; icon: string[]; href?: string }> = {
  goal: { label: "Set your goal", color: "var(--chart-trend)", icon: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z", "M12 12h.01"], href: "/body/goal" },
  weight: { label: "Weight trend", color: "var(--chart-trend)", icon: ["M4 19h16", "M5 15l4.5-4.5 3.5 3 6-6.5"] },
  maintenance: { label: "Calories vs maintenance", color: "var(--macro-kcal)", icon: ["M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-4 2.5-5 .3 1.5 1 2.5 2 3 0-3 .5-5.5.5-8z"], href: "/food" },
  lifts: { label: "Your lifts in kg", color: "var(--chart-lift)", icon: ["M6 8v8M18 8v8M3 10v4M21 10v4M6 12h12"], href: "/train" },
  sleep: { label: "Sleep against your usual", color: "var(--chart-sleep)", icon: ["M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"], href: "/sleep" },
  connections: { label: "What lines up with your lifts", color: "var(--text-tertiary)", icon: ["M7 11V8a5 5 0 0 1 10 0v3", "M5 11h14v10H5z"] },
};

/** "About 4 days", "About 3 weeks". */
function etaWords(days: number, pace: boolean): string {
  if (days <= 13) return `About ${days} ${days === 1 ? "day" : "days"}`;
  const w = Math.round(days / 7);
  return `About ${w} weeks${pace ? " at your pace" : ""}`;
}

/** "First read around Fri 6 Nov", with what it still needs once weigh-ins count: the date Home gives (IN12). */
function firstReadSub(read: NonNullable<Unlock["firstRead"]>, today: LocalDate): string {
  const { when, needs } = firstReadParts(read, today);
  return `First read ${when}${needs && read.from <= today ? ` · ${needs}` : ""}`;
}

function countWords(u: Unlock): string {
  if (u.unit === "days" && u.id === "weight") return `Day ${u.have} of ${u.need}`;
  return `${u.have} of ${u.need}${u.unit ? ` ${u.unit}` : ""}`;
}

function Glyph({ d, color }: { d: string[]; color: string }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }} aria-hidden>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
        {d.map((p) => (
          <path key={p} d={p} />
        ))}
      </svg>
    </span>
  );
}

/**
 * Progress before it has enough to read (PR5): one card listing each part
 * that is still waiting, what it needs and how far along it is (after
 * WHOOP's and Visible's calibration counts), roughly how long is left
 * (after Oura's "ready in about"), and where it gets logged. Parts drop off
 * as they open; the card goes when all have. "See an example" shows the
 * whole screen on made-up data, nothing saved.
 */
export default function FirstUse({ unlocks, today, onLogWeight, onExample }: { unlocks: Unlock[]; today: LocalDate; onLogWeight: () => void; onExample: () => void }) {
  const waiting = unlocks.filter((u) => !u.done);
  if (!waiting.length) return null;
  const fresh = unlocks.every((u) => !u.done || u.id === "goal") && unlocks.every((u) => u.id === "goal" || u.have === 0);
  const readyCount = unlocks.filter((u) => u.done && u.id !== "goal").length;
  const parts = unlocks.filter((u) => u.id !== "goal").length;
  return (
    <section aria-label="What Progress still needs" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex items-baseline justify-between gap-3 px-4 pb-3 pt-4">
        <span className="flex flex-col gap-0.5">
          <span className="text-[17px] font-semibold" style={{ color: "var(--text)" }}>
            {fresh ? "Progress fills in as you log" : "Still filling in"}
          </span>
          {fresh && (
            <span className="text-[12px]" style={{ color: "var(--text-tertiary)" }}>
              Each part shows once there&apos;s enough to read it honestly.
            </span>
          )}
        </span>
        {!fresh && (
          <span className="shrink-0 text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {readyCount} of {parts} ready
          </span>
        )}
      </div>
      {waiting.map((u) => {
        const m = META[u.id];
        const locked = u.id === "connections";
        const sub: ReactNode =
          u.id === "goal"
            ? "For the rate, the date and your targets"
            : u.needsAlongside
              ? "Log sleep or food alongside your sessions"
              : u.id === "sleep" && u.have === 0
                ? "Log a night, or connect Apple Health on Sleep"
                : u.startsOn
                  ? `Starting guess; your log takes over ${longLocalDate(u.startsOn)}`
                  : u.firstRead
                    ? firstReadSub(u.firstRead, today)
                    : u.etaDays != null && u.etaDays > 0
                      ? etaWords(u.etaDays, u.id === "connections")
                      : locked
                        ? "Sessions with sleep or food logged alongside"
                        : null;
        const body = (
          <>
            <Glyph d={m.icon} color={m.color} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold" style={{ color: locked ? "var(--text-secondary)" : "var(--text)" }}>
                  {m.label}
                </span>
                {u.id !== "goal" && (
                  <span className="shrink-0 text-[12px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                    {countWords(u)}
                  </span>
                )}
              </span>
              {u.id !== "goal" && (
                <span className="mt-1.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
                  <span className="block h-full rounded-full" style={{ width: `${Math.min(100, (u.have / u.need) * 100)}%`, background: "var(--primary)" }} />
                </span>
              )}
              {sub && (
                <span className="mt-1 text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {sub}
                </span>
              )}
            </span>
          </>
        );
        const cls = "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors active:bg-[var(--surface-raised)]";
        const style = { borderTop: "1px solid var(--border)" };
        if (u.id === "weight")
          return (
            <button key={u.id} type="button" onClick={onLogWeight} className={cls} style={style} aria-label={`${m.label}: ${countWords(u)}. Log weight`}>
              {body}
            </button>
          );
        if (m.href)
          return (
            <Link key={u.id} href={m.href} className={cls} style={style}>
              {body}
            </Link>
          );
        return (
          <div key={u.id} className={cls.replace(" transition-colors active:bg-[var(--surface-raised)]", "")} style={style}>
            {body}
          </div>
        );
      })}
      <div className="px-4 pb-4 pt-1">
        <button type="button" onClick={onExample} className="flex h-[40px] w-full items-center justify-center gap-1.5 rounded-[12px] text-[15px] font-semibold transition-colors active:bg-[var(--surface-pressed)]" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
            <path d="M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
          </svg>
          See an example
        </button>
      </div>
    </section>
  );
}
