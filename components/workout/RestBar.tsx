"use client";

/** Rest-timer step, as Hevy's. PUB. */
export const REST_STEP_SEC = 15;

type Props = {
  exerciseName: string;
  remainingSec: number;
  totalSec: number;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
};

function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Rest timer bar (Hevy): pinned above the tab bar while a rest runs, with
 * the countdown large, a progress line, −15 / +15 and Skip.
 */
export default function RestBar({ exerciseName, remainingSec, totalSec, onAdjust, onSkip }: Props) {
  const pct = totalSec > 0 ? Math.max(0, Math.min(100, (remainingSec / totalSec) * 100)) : 0;
  const step = (label: string, delta: number) => (
    <button type="button" onClick={() => onAdjust(delta)} className="h-10 min-w-[52px] rounded-full px-3 text-[13px] font-semibold transition-colors active:bg-[var(--surface-pressed)]" style={{ background: "var(--surface-raised)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-label={`${delta < 0 ? "Shorten" : "Extend"} rest by ${REST_STEP_SEC} seconds`}>
      {label}
    </button>
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 z-30 flex justify-center px-4" style={{ bottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="pointer-events-auto w-full max-w-[560px] overflow-hidden rounded-[16px]" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }} role="status" aria-live="polite" aria-label={`Rest for ${exerciseName}: ${mmss(remainingSec)} left`}>
        <div className="h-[3px] w-full" style={{ background: "var(--surface-raised)" }} aria-hidden>
          <div className="h-full" style={{ width: `${pct}%`, background: "var(--status-good)", transition: "width 1s linear" }} />
        </div>
        <div className="flex items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex min-w-0 flex-col">
            <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
              Rest
            </span>
            <span className="truncate text-[12px]" style={{ color: "var(--text-secondary)" }}>
              {exerciseName}
            </span>
          </div>
          <span className="text-[28px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {mmss(remainingSec)}
          </span>
          <div className="flex items-center gap-1.5">
            {step(`−${REST_STEP_SEC}`, -REST_STEP_SEC)}
            {step(`+${REST_STEP_SEC}`, REST_STEP_SEC)}
            <button type="button" onClick={onSkip} className="h-10 rounded-full px-3.5 text-[13px] font-semibold transition-colors active:bg-[var(--primary-pressed)]" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }} aria-label="Skip rest">
              Skip
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
