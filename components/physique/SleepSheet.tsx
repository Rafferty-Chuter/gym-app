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
  /** "Last night", or "Night of Fri 16 Oct" (NightHero's `nightLabel`). */
  nightTitle: string;
  onSave: (input: SleepInput) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Sleep entry (S10, simpler): bedtime and wake time with ±15 min steppers
 * and hours asleep prefilled from them. Three numbers, nothing else; the
 * 8-hour reference is fixed (C8). A night from Apple Health is shown, not
 * edited: the watch is the record, and the Health app is where it changes.
 */
export default function SleepSheet(props: Props) {
  if (!props.open) return null;
  return props.existing?.source === "healthkit" ? <WatchNight {...props} night={props.existing} /> : <Inner key={props.nightTitle} {...props} />;
}

const STEP_MIN = 15;

function WatchNight({ onClose, nightTitle, night }: Props & { night: SleepNight }) {
  const rows = [
    { label: "Bedtime", value: night.bedtime ?? "–" },
    { label: "Woke up", value: night.wakeTime ?? "–" },
    { label: "Asleep", value: formatHoursMin(night.asleepMin) },
  ];
  return (
    <Sheet open onClose={onClose} title="Sleep" footer={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
      <p className="mb-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
        {nightTitle} · from Apple Health
      </p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
            {r.label}
          </span>
          <span className="text-[17px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
            {r.value}
          </span>
        </div>
      ))}
      <p className="mt-3 text-[12px]" style={{ color: "var(--text-tertiary)" }}>
        Your watch recorded this night. To change it, edit it in the Health app.
      </p>
    </Sheet>
  );
}

function Inner({ onClose, prefill, existing, nightTitle, onSave }: Props) {
  const [bed, setBed] = useState(existing?.bedtime ?? prefill.bedtime);
  const [wake, setWake] = useState(existing?.wakeTime ?? prefill.wakeTime);
  const [asleepTouched, setAsleepTouched] = useState(existing != null);
  const [asleep, setAsleep] = useState(existing?.asleepMin ?? Math.max(0, minutesInBed(prefill.bedtime, prefill.wakeTime) - ASLEEP_OFFSET_MIN));
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
    // Wake-ups are no longer asked; a value logged before is kept.
    const r = await onSave({ bedtime: bed, wakeTime: wake, asleepMin: Math.round(asleepShown), inBedMin: inBed, wakeups: existing?.wakeups });
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
        {nightTitle}
      </p>
      <Stepper label="Bedtime" value={bed} onMinus={() => shift(setBed, bed, -STEP_MIN)} onPlus={() => shift(setBed, bed, STEP_MIN)} />
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
