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
  /** The entry's body fat on `date`, if any (R4). */
  bodyFatPct?: number | null;
  /** `bodyFatPct` undefined keeps what is stored, null clears it. */
  onSave: (kg: number, date: LocalDate, bodyFatPct?: number | null) => Promise<Result>;
  onDelete?: (date: LocalDate) => Promise<Result>;
};

/** The date dropdown lists this many days back (backfill beyond it goes through the arrows). OURS. */
export const DATE_PICKER_DAYS = 60;

/** Body fat is a display-only reading; the engine never uses it. Plausible range for the check. OURS. */
const BODY_FAT_RANGE = { min: 3, max: 60 };

type Field = "weight" | "bodyFat";

/**
 * Weight entry (MacroFactor's sheet): a date row (arrows plus a dropdown
 * of the last 60 days) for backfill, the value prefilled with the last
 * entry, ±0.1 steps, an optional body-fat field, the 3% sanity check on
 * save, and delete when the day already has an entry. Two taps: open, Save.
 */
export default function WeightSheet(props: Props) {
  if (!props.open) return null;
  const initial = props.lastKg != null ? formatPadValue(kgToDisplay(props.lastKg, props.unit), BODYWEIGHT_DECIMALS[props.unit]) : "";
  return <Inner key={`${initial}-${props.date}`} {...props} initial={initial} />;
}

function Inner({ initial, onClose, unit, date, today, onDateChange, trendKg, hasEntry, bodyFatPct, onSave, onDelete }: Props & { initial: string }) {
  const [value, setValue] = useState(initial);
  const [bodyFat, setBodyFat] = useState(typeof bodyFatPct === "number" ? formatPadValue(bodyFatPct, 1) : "");
  const [field, setField] = useState<Field>("weight");
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const n = parsePadValue(value);
  const kg = n != null && n > 0 ? displayToKg(n, unit) : null;
  const bf = parsePadValue(bodyFat);
  const bfOk = bf == null || (bf >= BODY_FAT_RANGE.min && bf <= BODY_FAT_RANGE.max);
  const isToday = date === today;
  const dateLabel = (d: LocalDate) => (d === today ? "Today" : d === addDays(today, -1) ? "Yesterday" : longLocalDate(d));

  async function save(force: boolean) {
    if (kg == null || !bfOk) return;
    const check = sanityCheck(kg, trendKg);
    if (!check.ok && !force) {
      setConfirm(true);
      return;
    }
    setSaving(true);
    const r = await onSave(kg, date, bodyFat.trim() === "" ? (typeof bodyFatPct === "number" ? null : undefined) : bf);
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
            <ErrorLine text={error ?? (!bfOk ? `Body fat between ${BODY_FAT_RANGE.min} and ${BODY_FAT_RANGE.max} %, or leave it blank.` : null)} />
            <PrimaryButton onClick={() => save(false)} disabled={kg == null || !bfOk || saving}>
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

      <div className="mt-3 grid grid-cols-2 gap-1" role="tablist" aria-label="Fields">
        {(
          [
            { key: "weight", label: "Weight", shown: value === "" ? "–" : `${value} ${unit}` },
            { key: "bodyFat", label: "Body fat", shown: bodyFat === "" ? "optional" : `${bodyFat} %` },
          ] as const
        ).map((f) => {
          const selected = field === f.key;
          return (
            <button key={f.key} type="button" role="tab" aria-selected={selected} onClick={() => setField(f.key)} className="flex flex-col items-center rounded-[12px] py-2 transition-colors" style={{ background: selected ? "var(--primary)" : "var(--surface)", color: selected ? "var(--text-on-primary)" : "var(--text)", border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}` }}>
              <span className="text-[11px] font-medium tracking-[0.02em]" style={{ color: selected ? "color-mix(in srgb, var(--text-on-primary) 70%, transparent)" : "var(--text-tertiary)" }}>
                {f.label}
              </span>
              <span className="text-[17px] font-semibold" style={{ fontVariantNumeric: "tabular-nums", color: f.key === "bodyFat" && bodyFat === "" ? (selected ? "var(--border-strong)" : "var(--text-tertiary)") : undefined }}>
                {f.shown}
              </span>
            </button>
          );
        })}
      </div>

      {field === "weight" ? (
        <>
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
        </>
      ) : (
        <>
          <NumberPadValue value={bodyFat} unit="%" placeholder="–" hint="From a scale or calipers. Shown with the entry; the engine does not use it." />
          <NumberPad value={bodyFat} onChange={setBodyFat} decimals={1} step={0.1} maxIntDigits={2} max={BODY_FAT_RANGE.max} />
        </>
      )}
    </Sheet>
  );
}
