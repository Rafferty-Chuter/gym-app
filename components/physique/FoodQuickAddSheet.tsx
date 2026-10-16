"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import NumberPad, { parsePadValue } from "@/components/ui/NumberPad";
import { PrimaryButton, ErrorLine } from "@/components/physique/ui";
import type { SavedFood } from "@/lib/physique/types";
import type { QuickFood } from "@/lib/physique/io/bodyData";

type Field = "kcal" | "proteinG" | "carbsG" | "fatG";

const FIELDS: Array<{ key: Field; label: string; unit: string }> = [
  { key: "kcal", label: "kcal", unit: "" },
  { key: "proteinG", label: "Protein", unit: "g" },
  { key: "carbsG", label: "Carbs", unit: "g" },
  { key: "fatG", label: "Fat", unit: "g" },
];

type Props = {
  open: boolean;
  onClose: () => void;
  recent: readonly SavedFood[];
  dateLabel: string;
  onSave: (food: QuickFood, savedFoodId?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Quick add: optional label, kcal and P/C/F via the NumberPad, plus a Recent
 * row for one-tap re-log (two taps from the page: open, tap the food).
 * U4 replaces this with the full day log.
 */
export default function FoodQuickAddSheet({ open, onClose, recent, dateLabel, onSave }: Props) {
  return open ? <Inner onClose={onClose} recent={recent} dateLabel={dateLabel} onSave={onSave} /> : null;
}

function Inner({ onClose, recent, dateLabel, onSave }: Omit<Props, "open">) {
  const [label, setLabel] = useState("");
  const [values, setValues] = useState<Record<Field, string>>({ kcal: "", proteinG: "", carbsG: "", fatG: "" });
  const [field, setField] = useState<Field>("kcal");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const kcal = parsePadValue(values.kcal);
  const canSave = kcal != null && kcal > 0;

  async function submit(food: QuickFood, savedFoodId?: string) {
    setSaving(true);
    const r = await onSave(food, savedFoodId);
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  function saveTyped() {
    if (!canSave) return;
    void submit({
      label: label.trim() || "Quick add",
      kcal: Math.round(kcal),
      proteinG: Math.round(parsePadValue(values.proteinG) ?? 0),
      carbsG: Math.round(parsePadValue(values.carbsG) ?? 0),
      fatG: Math.round(parsePadValue(values.fatG) ?? 0),
    });
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Add food"
      footer={
        <div className="flex flex-col gap-2">
          <ErrorLine text={error} />
          <PrimaryButton onClick={saveTyped} disabled={!canSave || saving}>
            Log to {dateLabel}
          </PrimaryButton>
        </div>
      }
    >
      {recent.length > 0 && (
        <div className="mb-3">
          <p className="mb-2 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
            Recent
          </p>
          <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: "none" }}>
            {recent.map((f) => (
              <button
                key={f.id}
                type="button"
                disabled={saving}
                onClick={() => submit({ label: f.label, kcal: f.kcal, proteinG: f.proteinG, carbsG: f.carbsG, fatG: f.fatG }, f.id)}
                className="flex shrink-0 flex-col items-start rounded-[12px] px-3 py-2 text-left transition-colors active:bg-[#26262a]"
                style={{ background: "#1d1d20", maxWidth: 160 }}
                aria-label={`Log ${f.label}, ${f.kcal} kcal`}
              >
                <span className="max-w-full truncate text-[13px] font-semibold" style={{ color: "#f2f2f0" }}>
                  {f.label}
                </span>
                <span className="text-[11px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
                  {f.kcal} kcal · P {f.proteinG}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Label (optional)"
        className="mb-3 h-11 w-full rounded-[12px] px-3 text-[15px] outline-none focus:ring-1"
        style={{ background: "#1d1d20", color: "#f2f2f0", border: "1px solid #2a2a2e" }}
        aria-label="Food label"
        autoComplete="off"
        inputMode="text"
      />
      <div className="mb-3 grid grid-cols-4 gap-1" role="tablist" aria-label="Macro fields">
        {FIELDS.map((f) => {
          const selected = field === f.key;
          const v = values[f.key];
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setField(f.key)}
              className="flex flex-col items-center rounded-[12px] py-2 transition-colors"
              style={{ background: selected ? "#f2f2f0" : "#141416", color: selected ? "#0a0a0b" : "#f2f2f0", border: `1px solid ${selected ? "#f2f2f0" : "#2a2a2e"}` }}
            >
              <span className="text-[11px] font-medium tracking-[0.02em]" style={{ color: selected ? "#3a3a40" : "#6f6f76" }}>
                {f.label}
              </span>
              <span className="text-[17px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                {v === "" ? "–" : `${v}${f.unit}`}
              </span>
            </button>
          );
        })}
      </div>
      <NumberPad value={values[field]} onChange={(v) => setValues((s) => ({ ...s, [field]: v }))} decimals={0} maxIntDigits={4} />
    </Sheet>
  );
}
