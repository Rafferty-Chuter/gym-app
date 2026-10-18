"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import NumberPad, { NumberPadValue, formatPadValue, parsePadValue } from "@/components/ui/NumberPad";
import { PrimaryButton, SecondaryButton, ErrorLine } from "@/components/physique/ui";
import { BODYWEIGHT_DECIMALS, displayToKg, kgToDisplay, type WeightUnit } from "@/lib/units";
import { sanityCheck, SANITY_PCT } from "@/lib/physique/weight";
import { addDays, type LocalDate } from "@/lib/dates";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

type Result = { ok: true } | { ok: false; error: string };

type Props = {
  open: boolean;
  onClose: () => void;
  unit: WeightUnit;
  /** The day being logged; the sheet's date row moves it (backfill). */
  date: LocalDate;
  today: LocalDate;
  onDateChange?: (date: LocalDate) => void;
  /** Prefill: the entry on `date` if any, else the last weigh-in, in kg. */
  lastKg: number | null;
  /** Current trend in kg, for the sanity check. */
  trendKg: number | null;
  /** True when `date` already has an entry (enables delete). */
  hasEntry?: boolean;
  onSave: (kg: number, date: LocalDate) => Promise<Result>;
  onDelete?: (date: LocalDate) => Promise<Result>;
};

/** The date dropdown lists this many days back (backfill beyond it goes through the arrows). OURS. */
export const DATE_PICKER_DAYS = 60;

/**
 * Weight entry (MacroFactor's sheet): a date row (arrows plus a dropdown
 * of the last 60 days) for backfill, the value prefilled with the last
 * entry, ±0.1 steps, the 3% sanity check on save, and delete when the day
 * already has an entry. Two taps: open, Save. No body-fat field (C10): the
 * engine never used it; a scale's reading from Apple Health still shows on
 * the entry.
 */
export default function WeightSheet(props: Props) {
  if (!props.open) return null;
  const initial = props.lastKg != null ? formatPadValue(kgToDisplay(props.lastKg, props.unit), BODYWEIGHT_DECIMALS[props.unit]) : "";
  return <Inner key={`${initial}-${props.date}`} {...props} initial={initial} />;
}

function Inner({ initial, onClose, unit, date, today, onDateChange, trendKg, hasEntry, onSave, onDelete }: Props & { initial: string }) {
  const [value, setValue] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const n = parsePadValue(value);
  const kg = n != null && n > 0 ? displayToKg(n, unit) : null;
  const isToday = date === today;
  const dateLabel = (d: LocalDate) => (d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : longLocalDate(d));

  async function save(force: boolean) {
    if (kg == null) return;
    const check = sanityCheck(kg, trendKg);
    if (!check.ok && !force) {
      setConfirm(true);
      return;
    }
    setSaving(true);
    const r = await onSave(kg, date);
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  async function remove() {
    if (!onDelete) return;
    setSaving(true);
    const r = await onDelete(date);
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  const pctOff = trendKg && kg ? Math.round((Math.abs(kg - trendKg) / trendKg) * 100) : 0;
  const arrow = "flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors active:bg-[var(--surface-pressed)] disabled:opacity-30";
  const options = Array.from({ length: DATE_PICKER_DAYS }, (_, i) => addDays(today, -i));
  if (!options.includes(date)) options.push(date);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Weight"
      footer={
        confirm ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              That is {pctOff}% from your trend (more than {Math.round(SANITY_PCT * 100)}%). Save it anyway?
            </p>
            <div className="grid grid-cols-2 gap-2">
              <SecondaryButton onClick={() => setConfirm(false)}>Edit</SecondaryButton>
              <PrimaryButton onClick={() => save(true)} disabled={saving}>
                Save anyway
              </PrimaryButton>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <ErrorLine text={error} />
            <PrimaryButton onClick={() => save(false)} disabled={kg == null || saving}>
              Save
            </PrimaryButton>
            {hasEntry && onDelete && (
              <button type="button" onClick={remove} disabled={saving} className="h-[40px] text-[13px] font-semibold" style={{ color: "var(--text-secondary)" }}>
                Delete this entry
              </button>
            )}
          </div>
        )
      }
    >
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => onDateChange?.(addDays(date, -1))} disabled={!onDateChange} className={arrow} style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label="Previous day">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <label className="relative flex h-9 min-w-0 flex-1 items-center justify-center rounded-[10px]" style={{ background: "var(--surface-raised)" }}>
          <span className="pointer-events-none truncate text-[13px] font-medium" style={{ color: "var(--text)" }}>
            {dateLabel(date)}
          </span>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="pointer-events-none ml-1 h-3.5 w-3.5 shrink-0" aria-hidden>
            <path d="M6 9l6 6 6-6" />
          </svg>
          <select value={date} onChange={(e) => onDateChange?.(e.target.value)} disabled={!onDateChange} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Date">
            {options.map((d) => (
              <option key={d} value={d}>
                {dateLabel(d)}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => onDateChange?.(addDays(date, 1))} disabled={!onDateChange || isToday} className={arrow} style={{ background: "var(--surface-raised)", color: "var(--text)" }} aria-label="Next day">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <NumberPadValue value={value} unit={unit} hint={hasEntry ? "Editing this day's entry" : "This morning, after the bathroom"} />
      <NumberPad
        value={value}
        onChange={(v) => {
          setValue(v);
          setConfirm(false);
        }}
        decimals={BODYWEIGHT_DECIMALS[unit]}
        step={0.1}
        max={unit === "kg" ? 400 : 880}
      />
    </Sheet>
  );
}
