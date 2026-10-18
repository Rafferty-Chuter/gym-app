"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import NumberPad, { NumberPadValue, formatPadValue, parsePadValue } from "@/components/ui/NumberPad";
import { PrimaryButton, ErrorLine } from "@/components/physique/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  lastCm: number | null;
  dateLabel: string;
  onSave: (cm: number) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/** Weekly waist (02 §1.1 protocol shown inline). Stored in cm. */
export default function WaistSheet({ open, onClose, lastCm, dateLabel, onSave }: Props) {
  const initial = lastCm != null ? formatPadValue(lastCm, 1) : "";
  return open ? <Inner key={`${initial}-${dateLabel}`} initial={initial} onClose={onClose} dateLabel={dateLabel} onSave={onSave} /> : null;
}

function Inner({ initial, onClose, dateLabel, onSave }: { initial: string; onClose: () => void; dateLabel: string; onSave: Props["onSave"] }) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const n = parsePadValue(value);
  const ok = n != null && n >= 40 && n <= 200;

  async function save() {
    if (!ok || n == null) return;
    setSaving(true);
    const r = await onSave(n);
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Waist"
      footer={
        <div className="flex flex-col gap-2">
          <ErrorLine text={error} />
          <PrimaryButton onClick={save} disabled={!ok || saving}>
            Save
          </PrimaryButton>
        </div>
      }
    >
      <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
        Morning, before food, at the navel, tape snug but not tight, relaxed after a normal breath out. Once a week is enough.
      </p>
      <NumberPadValue value={value} unit="cm" hint={dateLabel} />
      <NumberPad value={value} onChange={setValue} decimals={1} step={0.5} min={40} max={200} />
    </Sheet>
  );
}
