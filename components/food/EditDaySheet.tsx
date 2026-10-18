"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import NumberPad, { NumberPadValue, formatPadValue, parsePadValue } from "@/components/ui/NumberPad";
import { ErrorLine, PrimaryButton } from "@/components/physique/ui";
import type { SaveResult } from "@/lib/physique/io/bodyData";
import type { DayFlags } from "@/lib/physique/types";

type Status = "complete" | "partial" | "fasting";

type Props = {
  open: boolean;
  onClose: () => void;
  dateLabel: string;
  flags: DayFlags | undefined;
  /** Sum of the day's entries, shown under the override. */
  entriesKcal: number;
  onSave: (next: { status: Status; overrideKcal: number | null }) => Promise<SaveResult>;
};

const STATUSES: ReadonlyArray<{ id: Status; label: string; sub: string }> = [
  { id: "complete", label: "Complete", sub: "Counts toward expenditure" },
  { id: "partial", label: "Partial", sub: "Skipped by the engine" },
  { id: "fasting", label: "Fasting", sub: "Counts as 0 kcal" },
];

/**
 * "Edit day" (MacroFactor's Edit Day, 05-design §9.8): mark the day
 * complete, partial or fasting, and optionally set a total that overrides
 * the entries. The number goes through the pad.
 */
export default function EditDaySheet(props: Props) {
  return props.open ? <Inner key={props.dateLabel} {...props} /> : null;
}

function Inner({ onClose, dateLabel, flags, entriesKcal, onSave }: Props) {
  const [status, setStatus] = useState<Status>(flags?.status ?? "complete");
  const [override, setOverride] = useState(typeof flags?.kcalOverride === "number" ? formatPadValue(flags.kcalOverride, 0) : "");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const n = parsePadValue(override);

  async function save() {
    setSaving(true);
    const r = await onSave({ status, overrideKcal: n != null && n > 0 ? Math.round(n) : null });
    setSaving(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit day"
      footer={
        <div className="flex flex-col gap-2">
          <ErrorLine text={error} />
          <PrimaryButton onClick={save} disabled={saving}>
            Save
          </PrimaryButton>
        </div>
      }
    >
      <p className="mb-3 text-[13px]" style={{ color: "var(--text-secondary)" }}>
        {dateLabel}
      </p>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label="Day status">
        {STATUSES.map((s) => {
          const selected = status === s.id;
          return (
            <button key={s.id} type="button" role="radio" aria-checked={selected} onClick={() => setStatus(s.id)} className="flex flex-col items-center rounded-[12px] px-1 py-2 text-center transition-colors" style={{ background: selected ? "var(--primary)" : "var(--surface)", color: selected ? "var(--text-on-primary)" : "var(--text)", border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}` }}>
              <span className="text-[13px] font-semibold">{s.label}</span>
              <span className="text-[10px]" style={{ color: selected ? "color-mix(in srgb, var(--text-on-primary) 70%, transparent)" : "var(--text-tertiary)" }}>
                {s.sub}
              </span>
            </button>
          );
        })}
      </div>
      {status !== "fasting" && (
        <>
          <NumberPadValue value={override} unit="kcal" placeholder="–" hint={override === "" ? `Using the entries: ${Math.round(entriesKcal).toLocaleString("en-GB")} kcal. Enter a total to override them.` : `Overrides the ${Math.round(entriesKcal).toLocaleString("en-GB")} kcal from entries. Clear to use them again.`} />
          <NumberPad value={override} onChange={setOverride} decimals={0} maxIntDigits={5} />
        </>
      )}
    </Sheet>
  );
}
