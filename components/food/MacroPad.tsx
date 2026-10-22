"use client";

import NumberPad, { parsePadValue } from "@/components/ui/NumberPad";
import { CARBS_COLOR, FAT_COLOR, KCAL_COLOR, PROTEIN_COLOR } from "@/components/food/EnergyCharts";
import { macroKcal } from "@/lib/physique/food/timeline";
import { KCAL_PER_G_ALCOHOL } from "@/lib/food/extras";

export type MacroField = "kcal" | "proteinG" | "fatG" | "carbsG";
export type MacroValues = Record<MacroField, string>;

export const EMPTY_MACROS: MacroValues = { kcal: "", proteinG: "", fatG: "", carbsG: "" };

/** Field order follows MacroFactor's Quick Add: energy, protein, fat, carbs. PUB. */
export const MACRO_FIELDS: ReadonlyArray<{ key: MacroField; label: string; unit: string; color: string }> = [
  { key: "kcal", label: "kcal", unit: "", color: KCAL_COLOR },
  { key: "proteinG", label: "Protein", unit: "g", color: PROTEIN_COLOR },
  { key: "fatG", label: "Fat", unit: "g", color: FAT_COLOR },
  { key: "carbsG", label: "Carbs", unit: "g", color: CARBS_COLOR },
];

export function macroNumbers(v: MacroValues) {
  return {
    kcal: Math.round(parsePadValue(v.kcal) ?? 0),
    proteinG: Math.round(parsePadValue(v.proteinG) ?? 0),
    fatG: Math.round(parsePadValue(v.fatG) ?? 0),
    carbsG: Math.round(parsePadValue(v.carbsG) ?? 0),
  };
}

export function macrosToValues(m: { kcal: number; proteinG: number; fatG: number; carbsG: number }): MacroValues {
  const s = (n: number) => (Number.isFinite(n) && n > 0 ? String(Math.round(n)) : "");
  return { kcal: s(m.kcal), proteinG: s(m.proteinG), fatG: s(m.fatG), carbsG: s(m.carbsG) };
}

type Props = {
  values: MacroValues;
  field: MacroField;
  onField: (f: MacroField) => void;
  onChange: (next: MacroValues) => void;
  /** IN6: the food's alcohol in g when known, so a drink's calories are not read as a slip. */
  alcoholG?: number;
};

/**
 * The four macro fields as selectable tiles over the NumberPad, with the
 * "Macro sum is N kcal" line under them (MacroFactor's Quick Add). Used by
 * Quick add, the entry editor and Describe rows. Never the system keyboard.
 */
export default function MacroPad({ values, field, onField, onChange, alcoholG }: Props) {
  const nums = macroNumbers(values);
  const alcohol = alcoholG != null && alcoholG > 0 ? alcoholG : 0;
  const sum = Math.round(macroKcal(nums) + alcohol * KCAL_PER_G_ALCOHOL);
  const kcal = parsePadValue(values.kcal);
  const anyMacro = nums.proteinG + nums.fatG + nums.carbsG > 0;
  const gap = kcal != null && anyMacro ? Math.round(kcal - sum) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-4 gap-1" role="tablist" aria-label="Fields">
        {MACRO_FIELDS.map((f) => {
          const selected = field === f.key;
          const v = values[f.key];
          return (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onField(f.key)}
              className="flex flex-col items-center rounded-[12px] py-2 transition-colors"
              style={{ background: selected ? "var(--primary)" : "var(--surface)", color: selected ? "var(--text-on-primary)" : "var(--text)", border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}` }}
            >
              <span className="flex items-center gap-1 text-[11px] font-medium tracking-[0.02em]" style={{ color: selected ? "color-mix(in srgb, var(--text-on-primary) 70%, transparent)" : "var(--text-tertiary)" }}>
                <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: f.color }} aria-hidden />
                {f.label}
              </span>
              <span className="text-[17px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
                {v === "" ? "–" : `${v}${f.unit}`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="min-h-[16px] text-[11px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
        {anyMacro ? `${alcohol ? "Macros and alcohol sum to" : "Macro sum is"} ${sum.toLocaleString("en-GB")} kcal${gap != null && Math.abs(gap) > Math.max(30, sum * 0.1) ? ` · ${Math.abs(gap)} kcal ${gap > 0 ? "below" : "above"} the kcal entered` : ""}` : " "}
      </p>
      <NumberPad value={values[field]} onChange={(v) => onChange({ ...values, [field]: v })} decimals={0} maxIntDigits={4} />
    </div>
  );
}
