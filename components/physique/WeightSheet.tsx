"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import NumberPad, { NumberPadValue, formatPadValue, parsePadValue } from "@/components/ui/NumberPad";
import { PrimaryButton, SecondaryButton, ErrorLine } from "@/components/physique/ui";
import { displayToKg, kgToDisplay, type WeightUnit } from "@/lib/units";
import { sanityCheck, SANITY_PCT } from "@/lib/physique/weight";

type Props = {
  open: boolean;
  onClose: () => void;
  unit: WeightUnit;
  /** Prefill: the last weigh-in in kg. */
  lastKg: number | null;
  /** Current trend in kg, for the sanity check. */
  trendKg: number | null;
  dateLabel: string;
  onSave: (kg: number) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/** Weight entry: NumberPad prefilled with the last value, ±0.1 steps, 3% sanity check on save. */
export default function WeightSheet({ open, onClose, unit, lastKg, trendKg, dateLabel, onSave }: Props) {
  const initial = lastKg != null ? formatPadValue(kgToDisplay(lastKg, unit), 1) : "";
  return open ? <Inner key={`${initial}-${dateLabel}`} initial={initial} onClose={onClose} unit={unit} trendKg={trendKg} dateLabel={dateLabel} onSave={onSave} /> : null;
}

function Inner({ initial, onClose, unit, trendKg, dateLabel, onSave }: Omit<Props, "open" | "lastKg"> & { initial: string }) {
  const [value, setValue] = useState(initial);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const n = parsePadValue(value);
  const kg = n != null && n > 0 ? displayToKg(n, unit) : null;

  async function save(force: boolean) {
    if (kg == null) return;
    const check = sanityCheck(kg, trendKg);
    if (!check.ok && !force) {
      setConfirm(true);
      return;
    }
    setSaving(true);
    const r = await onSave(kg);
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  const pctOff = trendKg && kg ? Math.round((Math.abs(kg - trendKg) / trendKg) * 100) : 0;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Weight"
      footer={
        confirm ? (
          <div className="flex flex-col gap-2">
            <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
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
          </div>
        )
      }
    >
      <NumberPadValue value={value} unit={unit} hint={dateLabel} />
      <NumberPad value={value} onChange={(v) => { setValue(v); setConfirm(false); }} decimals={1} step={0.1} max={unit === "kg" ? 400 : 880} />
    </Sheet>
  );
}
