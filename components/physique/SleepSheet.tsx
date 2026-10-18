"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { PrimaryButton, ErrorLine } from "@/components/physique/ui";
import { ASLEEP_OFFSET_MIN, formatClock, formatHoursMin, minutesInBed, parseClock } from "@/lib/physique/dayTotals";
import type { SleepInput } from "@/lib/physique/io/bodyData";
import type { SleepNight } from "@/lib/physique/types";

type Props = {
  open: boolean;
  onClose: () => void;
  prefill: { bedtime: string; wakeTime: string };
  existing: SleepNight | null;
  dateLabel: string;
  onSave: (input: SleepInput) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/** Sleep entry: bedtime and wake with ±15 min steppers, hours asleep prefilled, wake-ups. ≤4 taps. The sleep goal lives in Profile (B2). */
export default function SleepSheet(props: Props) {
  return props.open ? <Inner key={props.dateLabel} {...props} /> : null;
}

const STEP_MIN = 15;
const WAKEUPS: Array<{ v: NonNullable<SleepNight["wakeups"]>; label: string }> = [
  { v: "0", label: "0" },
  { v: "1-2", label: "1–2" },
  { v: "3+", label: "3+" },
];

function Inner({ onClose, prefill, existing, dateLabel, onSave }: Props) {
  const [bed, setBed] = useState(existing?.bedtime ?? prefill.bedtime);
  const [wake, setWake] = useState(existing?.wakeTime ?? prefill.wakeTime);
  const [asleepTouched, setAsleepTouched] = useState(existing != null);
  const [asleep, setAsleep] = useState(existing?.asleepMin ?? Math.max(0, minutesInBed(prefill.bedtime, prefill.wakeTime) - ASLEEP_OFFSET_MIN));
  const [wakeups, setWakeups] = useState<SleepNight["wakeups"]>(existing?.wakeups);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const inBed = minutesInBed(bed, wake);
  const asleepShown = asleepTouched ? Math.min(asleep, inBed) : Math.max(0, inBed - ASLEEP_OFFSET_MIN);

  function shift(setter: (v: string) => void, current: string, delta: number) {
    const m = parseClock(current) ?? 0;
    setter(formatClock(m + delta));
  }


  async function save() {
    setSaving(true);
    const r = await onSave({ bedtime: bed, wakeTime: wake, asleepMin: Math.round(asleepShown), inBedMin: inBed, wakeups });
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Sleep"
      footer={
        <div className="flex flex-col gap-2">
          <ErrorLine text={error} />
          <PrimaryButton onClick={save} disabled={saving || inBed === 0}>
            Save {formatHoursMin(asleepShown)}
          </PrimaryButton>
        </div>
      }
    >
      <p className="mb-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
        Night before {dateLabel}
      </p>
      <Stepper label="Lights out" value={bed} onMinus={() => shift(setBed, bed, -STEP_MIN)} onPlus={() => shift(setBed, bed, STEP_MIN)} />
      <Stepper label="Woke up" value={wake} onMinus={() => shift(setWake, wake, -STEP_MIN)} onPlus={() => shift(setWake, wake, STEP_MIN)} />
      <Stepper
        label="Asleep"
        value={formatHoursMin(asleepShown)}
        sub={`In bed ${formatHoursMin(inBed)}`}
        onMinus={() => {
          setAsleepTouched(true);
          setAsleep(Math.max(0, asleepShown - STEP_MIN));
        }}
        onPlus={() => {
          setAsleepTouched(true);
          setAsleep(Math.min(inBed, asleepShown + STEP_MIN));
        }}
      />
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
          Wake-ups
        </span>
        <div className="flex gap-1" role="radiogroup" aria-label="Wake-ups">
          {WAKEUPS.map((w) => {
            const selected = wakeups === w.v;
            return (
              <button
                key={w.v}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setWakeups(selected ? undefined : w.v)}
                className="h-[30px] rounded-full px-3 text-[12px] font-medium"
                style={{ background: selected ? "var(--primary)" : "var(--surface-raised)", color: selected ? "var(--text-on-primary)" : "var(--text-secondary)" }}
              >
                {w.label}
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
}

function Stepper({
  label,
  value,
  sub,
  stepText = "15 minutes",
  onMinus,
  onPlus,
  minusDisabled,
  plusDisabled,
}: {
  label: string;
  value: string;
  sub?: string;
  stepText?: string;
  onMinus: () => void;
  onPlus: () => void;
  minusDisabled?: boolean;
  plusDisabled?: boolean;
}) {
  const btn = "flex h-11 w-11 items-center justify-center rounded-[12px] text-[20px] font-semibold transition-colors active:bg-[var(--surface-pressed)] disabled:opacity-40";
  return (
    <div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex flex-col">
        <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
          {label}
        </span>
        {sub && (
          <span className="text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {sub}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onMinus} disabled={minusDisabled} className={btn} style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label={`${label} earlier by ${stepText}`}>
          −
        </button>
        <span className="w-[72px] text-center text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
          {value}
        </span>
        <button type="button" onClick={onPlus} disabled={plusDisabled} className={btn} style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label={`${label} later by ${stepText}`}>
          +
        </button>
      </div>
    </div>
  );
}
