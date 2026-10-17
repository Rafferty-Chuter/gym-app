"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import MacroPad, { macroNumbers, macrosToValues, type MacroField } from "@/components/food/MacroPad";
import TimeChip from "@/components/food/TimeChip";
import { ErrorLine, PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { entryClock } from "@/lib/physique/food/timeline";
import type { FoodInput } from "@/lib/physique/io/foodData";
import type { SaveResult } from "@/lib/physique/io/bodyData";
import type { FoodEntry } from "@/lib/physique/types";

type Props = {
  entry: FoodEntry | null;
  tz: string;
  onClose: () => void;
  onSave: (patch: Partial<FoodInput>) => Promise<SaveResult>;
  onRemove: () => Promise<SaveResult>;
};

const inputClass = "h-11 w-full min-w-0 rounded-[12px] px-3 text-[15px] outline-none focus:ring-1";
const inputStyle = { background: "#1d1d20", color: "#f2f2f0", border: "1px solid #2a2a2e" };

/** Edit one timeline entry: name, time, serving and macros; or remove it. */
export default function EntrySheet({ entry, tz, onClose, onSave, onRemove }: Props) {
  return entry ? <Inner key={entry.id} entry={entry} tz={tz} onClose={onClose} onSave={onSave} onRemove={onRemove} /> : null;
}

function Inner({ entry, tz, onClose, onSave, onRemove }: Props & { entry: FoodEntry }) {
  const [label, setLabel] = useState(entry.label);
  const [serving, setServing] = useState(entry.serving ?? "");
  const [time, setTime] = useState(entryClock(entry, tz));
  const [values, setValues] = useState(macrosToValues(entry));
  const [field, setField] = useState<MacroField>("kcal");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  async function save() {
    setBusy(true);
    const r = await onSave({ label: label.trim() || entry.label, serving: serving.trim(), time, ...macroNumbers(values) });
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  }
  async function remove() {
    if (!confirmRemove) {
      setConfirmRemove(true);
      return;
    }
    setBusy(true);
    const r = await onRemove();
    setBusy(false);
    if (r.ok) onClose();
    else setError(r.error);
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Edit entry"
      footer={
        <div className="flex flex-col gap-2">
          <ErrorLine text={error} />
          <PrimaryButton onClick={save} disabled={busy}>
            Save
          </PrimaryButton>
          <SecondaryButton onClick={remove} disabled={busy}>
            {confirmRemove ? "Remove for good" : "Remove"}
          </SecondaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className={inputClass} style={inputStyle} aria-label="Name" autoComplete="off" />
        <div className="flex items-center gap-2">
          <TimeChip value={time} onChange={setTime} />
          <input type="text" value={serving} onChange={(e) => setServing(e.target.value)} placeholder="Serving (1 bowl, 150 g)" className={`${inputClass} flex-1`} style={inputStyle} aria-label="Serving" autoComplete="off" />
        </div>
        <MacroPad values={values} field={field} onField={setField} onChange={setValues} />
      </div>
    </Sheet>
  );
}
