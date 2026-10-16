"use client";

/**
 * Custom numeric keypad (DESIGN.md "Number pad"): a 3×4 grid with `.` and
 * backspace, and an optional ±step row above. The value is a string the
 * caller owns, so partial input such as "82." is representable. The system
 * keyboard is never shown for numeric entry.
 */

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** Max digits after the decimal point. 0 hides the `.` key. */
  decimals?: number;
  /** Max digits before the decimal point. */
  maxIntDigits?: number;
  /** When set, shows a −step / +step row. */
  step?: number | null;
  /** Lower bound for ± stepping. */
  min?: number;
  /** Upper bound for ± stepping. */
  max?: number;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Format a number with at most `decimals` places, trimming trailing zeros. */
export function formatPadValue(n: number, decimals: number): string {
  if (!Number.isFinite(n)) return "";
  const s = n.toFixed(decimals);
  return decimals > 0 ? s.replace(/\.?0+$/, "") : s;
}

export function parsePadValue(value: string): number | null {
  if (value.trim() === "" || value === ".") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function NumberPad({ value, onChange, decimals = 1, maxIntDigits = 5, step = null, min = 0, max = Infinity }: Props) {
  function press(key: string) {
    if (key === "⌫") {
      onChange(value.slice(0, -1));
      return;
    }
    if (key === ".") {
      if (decimals === 0 || value.includes(".")) return;
      onChange(value === "" ? "0." : `${value}.`);
      return;
    }
    const [intPart, fracPart] = value.split(".");
    if (value.includes(".")) {
      if ((fracPart ?? "").length >= decimals) return;
      onChange(`${value}${key}`);
      return;
    }
    if (intPart === "0") {
      onChange(key);
      return;
    }
    if (intPart.length >= maxIntDigits) return;
    onChange(`${value}${key}`);
  }

  function bump(delta: number) {
    const current = parsePadValue(value) ?? 0;
    const next = Math.min(max, Math.max(min, current + delta));
    onChange(formatPadValue(next, decimals));
  }

  const keyClass =
    "flex h-[52px] items-center justify-center rounded-[12px] text-[20px] font-semibold leading-none select-none transition-colors duration-100 active:bg-[#26262a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a3a40]";
  const keyStyle = { background: "#1d1d20", color: "#f2f2f0", fontVariantNumeric: "tabular-nums" as const };

  return (
    <div className="flex flex-col gap-2" role="group" aria-label="Number pad">
      {step != null && step > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => bump(-step)} className={`${keyClass} h-[44px] text-[17px]`} style={keyStyle} aria-label={`Minus ${step}`}>
            −{formatPadValue(step, decimals)}
          </button>
          <button type="button" onClick={() => bump(step)} className={`${keyClass} h-[44px] text-[17px]`} style={keyStyle} aria-label={`Plus ${step}`}>
            +{formatPadValue(step, decimals)}
          </button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <button key={k} type="button" onClick={() => press(k)} className={keyClass} style={keyStyle}>
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={() => press(".")}
          className={keyClass}
          style={{ ...keyStyle, color: decimals === 0 ? "#3a3a40" : keyStyle.color }}
          disabled={decimals === 0}
          aria-label="Decimal point"
        >
          .
        </button>
        <button type="button" onClick={() => press("0")} className={keyClass} style={keyStyle}>
          0
        </button>
        <button type="button" onClick={() => press("⌫")} className={keyClass} style={keyStyle} aria-label="Backspace">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="h-6 w-6" aria-hidden>
            <path d="M21 6H9l-6 6 6 6h12V6z" />
            <path d="M14 9l-4 6M10 9l4 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** The hero value shown above a NumberPad: value in `hero`, unit in `title` secondary. */
export function NumberPadValue({ value, unit, placeholder = "0", hint }: { value: string; unit?: string; placeholder?: string; hint?: string }) {
  const shown = value === "" ? placeholder : value;
  return (
    <div className="flex flex-col items-center gap-1 py-3">
      <div className="flex items-baseline gap-1.5" aria-live="polite">
        <span
          className="text-[34px] font-semibold leading-none tracking-[-0.02em]"
          style={{ color: value === "" ? "#6f6f76" : "#f2f2f0", fontVariantNumeric: "tabular-nums" }}
        >
          {shown}
        </span>
        {unit && (
          <span className="text-[20px] font-semibold leading-none" style={{ color: "#a3a3a8" }}>
            {unit}
          </span>
        )}
      </div>
      {hint && (
        <span className="text-[11px] font-medium tracking-[0.04em]" style={{ color: "#6f6f76" }}>
          {hint}
        </span>
      )}
    </div>
  );
}
