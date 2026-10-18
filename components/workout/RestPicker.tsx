"use client";

import Sheet from "@/components/ui/Sheet";
import { REST_STEP_SEC } from "@/components/workout/RestBar";

/** Rest choices, as Hevy's and Strong's pickers offer them. PUB. 0 turns the timer off for the exercise. */
export const REST_PRESETS_SEC = [0, 30, 45, 60, 90, 120, 150, 180, 240, 300] as const;
/** Longest rest the picker sets, s. Matches the page's own clamp. */
export const REST_MAX_SEC = 600;

const label = (sec: number) => (sec === 0 ? "Off" : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`);

/**
 * The rest time for one exercise (C4): tap the rest time under an
 * exercise to open it. A preset or −15 / +15 sets how long the timer runs
 * after each set; Off stops it starting.
 */
export default function RestPicker({ open, exerciseName, valueSec, onChange, onClose }: { open: boolean; exerciseName: string; valueSec: number; onChange: (sec: number) => void; onClose: () => void }) {
  const set = (sec: number) => onChange(Math.max(0, Math.min(REST_MAX_SEC, sec)));
  const step = (delta: number) => (
    <button
      type="button"
      onClick={() => set(valueSec + delta)}
      disabled={delta < 0 ? valueSec <= 0 : valueSec >= REST_MAX_SEC}
      className="h-11 min-w-[64px] rounded-full px-4 text-[15px] font-semibold transition-colors active:bg-[var(--surface-pressed)] disabled:opacity-40"
      style={{ background: "var(--surface-raised)", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}
      aria-label={`${delta < 0 ? "Shorten" : "Lengthen"} rest by ${REST_STEP_SEC} seconds`}
    >
      {delta < 0 ? `−${REST_STEP_SEC}` : `+${REST_STEP_SEC}`}
    </button>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`Rest · ${exerciseName}`}
      footer={
        <button type="button" onClick={onClose} className="h-[48px] w-full rounded-[12px] text-[15px] font-semibold transition-colors active:bg-[var(--primary-pressed)]" style={{ background: "var(--primary)", color: "var(--text-on-primary)" }}>
          Done
        </button>
      }
    >
      <div className="flex flex-col gap-5 pb-2">
        <div className="flex items-center justify-between gap-3">
          {step(-REST_STEP_SEC)}
          <span className="text-[40px] font-semibold leading-none tracking-[-0.02em]" style={{ color: valueSec === 0 ? "var(--text-tertiary)" : "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
            {label(valueSec)}
          </span>
          {step(REST_STEP_SEC)}
        </div>
        <div className="grid grid-cols-5 gap-2" role="group" aria-label="Rest presets">
          {REST_PRESETS_SEC.map((sec) => {
            const on = sec === valueSec;
            return (
              <button
                key={sec}
                type="button"
                onClick={() => set(sec)}
                aria-pressed={on}
                className="h-11 rounded-[10px] text-[14px] font-semibold transition-colors"
                style={{ background: on ? "var(--primary)" : "var(--surface-raised)", color: on ? "var(--text-on-primary)" : "var(--text)", fontVariantNumeric: "tabular-nums" }}
              >
                {label(sec)}
              </button>
            );
          })}
        </div>
        <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          Starts after each set you tick for this exercise.
        </p>
      </div>
    </Sheet>
  );
}
