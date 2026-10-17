"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import NumberPad, { NumberPadValue, formatPadValue, parsePadValue } from "@/components/ui/NumberPad";
import { PrimaryButton } from "@/components/physique/ui";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  unit?: string;
  hint?: string;
  initial: number | null;
  decimals?: number;
  step?: number | null;
  min?: number;
  max?: number;
  onSave: (value: number) => void;
};

/** A generic "enter one number" sheet (height, age, …). */
export default function NumberSheet(props: Props) {
  return props.open ? <Inner key={props.title} {...props} /> : null;
}

function Inner({ onClose, title, unit, hint, initial, decimals = 0, step = null, min = 0, max = Infinity, onSave }: Props) {
  const [value, setValue] = useState(initial != null ? formatPadValue(initial, decimals) : "");
  const n = parsePadValue(value);
  const ok = n != null && n >= min && n <= max;
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        <PrimaryButton
          onClick={() => {
            if (ok && n != null) {
              onSave(n);
              onClose();
            }
          }}
          disabled={!ok}
        >
          Save
        </PrimaryButton>
      }
    >
      <NumberPadValue value={value} unit={unit} hint={hint} />
      <NumberPad value={value} onChange={setValue} decimals={decimals} step={step} min={min} max={max} />
    </Sheet>
  );
}
