"use client";

import { useState } from "react";

/** Five-minute steps keep the stepper quick; exact minutes rarely matter for food. OURS. */
export const TIME_STEP_MIN = 5;

function toMin(hhmm: string): number {
  const h = Number(hhmm.slice(0, 2));
  const m = Number(hhmm.slice(3, 5));
  return (Number.isFinite(h) ? h : 12) * 60 + (Number.isFinite(m) ? m : 0);
}

function fromMin(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The logger's time chip: shows the meal time; tapping reveals − / + steps
 * of five minutes and an hour row, so a time is set without the system
 * picker.
 */
export default function TimeChip({ value, onChange, compact = false }: { value: string; onChange: (hhmm: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const step = (d: number) => onChange(fromMin(toMin(value) + d));
  return (
    <div className="flex flex-col items-start gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={`flex items-center gap-1.5 rounded-full font-medium transition-colors active:bg-[var(--surface-pressed)] ${compact ? "h-[30px] px-3 text-[12px]" : "h-[34px] px-3.5 text-[13px]"}`}
        style={{ background: "var(--surface-raised)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
        aria-label={`Time ${value}. Change`}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth={2} strokeLinecap="round" className="h-3.5 w-3.5" aria-hidden>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v4l2.5 2" />
        </svg>
        {value}
      </button>
      {open && (
        <div className="flex items-center gap-1.5" role="group" aria-label="Adjust time">
          {[
            { label: "−1 h", d: -60 },
            { label: `−${TIME_STEP_MIN}`, d: -TIME_STEP_MIN },
            { label: `+${TIME_STEP_MIN}`, d: TIME_STEP_MIN },
            { label: "+1 h", d: 60 },
          ].map((b) => (
            <button key={b.label} type="button" onClick={() => step(b.d)} className="h-[30px] rounded-full px-2.5 text-[12px] font-medium transition-colors active:bg-[var(--surface-pressed)]" style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
