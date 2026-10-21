"use client";

import { useState, type ReactNode } from "react";
import Sheet from "@/components/ui/Sheet";
import NumberPad, { NumberPadValue, parsePadValue } from "@/components/ui/NumberPad";
import { PrimaryButton } from "@/components/physique/ui";
import { setHeightUnit, useHeightUnit } from "@/lib/ui/heightUnit";
import { CM_PER_INCH, cmToFtIn, ftInToCm, type HeightUnit } from "@/lib/units";

/** Heights the profile accepts, cm. Matches the maintenance formula's sensible range. OURS. */
export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 230;

/** Starting point for feet and inches when nothing is stored yet. */
const DEFAULT_CM = 175;
/** The accepted range in whole inches, inside the cm range: 4 ft 0 in to 7 ft 6 in. */
const IN_MIN = Math.ceil(HEIGHT_MIN_CM / CM_PER_INCH);
const IN_MAX = Math.floor(HEIGHT_MAX_CM / CM_PER_INCH);

/**
 * Height in centimetres or feet and inches (C5). The cm / ft switch sets
 * the display unit everywhere; what is saved is always whole centimetres.
 */
export default function HeightSheet({ open, onClose, initialCm, onSave }: { open: boolean; onClose: () => void; initialCm: number | null; onSave: (cm: number) => void }) {
  return open ? <Inner onClose={onClose} initialCm={initialCm} onSave={onSave} /> : null;
}

function Inner({ onClose, initialCm, onSave }: { onClose: () => void; initialCm: number | null; onSave: (cm: number) => void }) {
  const h = useHeightInput(initialCm);
  return (
    <Sheet
      open
      onClose={onClose}
      title="Height"
      footer={
        <PrimaryButton
          onClick={() => {
            if (h.ok && h.cm != null) {
              onSave(h.cm);
              onClose();
            }
          }}
          disabled={!h.ok}
        >
          Save
        </PrimaryButton>
      }
    >
      {h.view}
    </Sheet>
  );
}

/** The height picker itself, cm or ft / in, for the sheet and for the first-run setup (O1). */
export function useHeightInput(initialCm: number | null): { cm: number | null; ok: boolean; view: ReactNode } {
  const unit = useHeightUnit();
  const [cmText, setCmText] = useState(initialCm != null ? String(Math.round(initialCm)) : "");
  const start = cmToFtIn(initialCm ?? DEFAULT_CM);
  // Feet and inches as one count of inches, so 5 ft 11 in plus an inch is 6 ft 0 in.
  const [totalIn, setTotalIn] = useState(start.ft * 12 + start.inch);
  const ft = Math.floor(totalIn / 12);
  const inch = totalIn % 12;

  const cm = unit === "cm" ? parsePadValue(cmText) : ftInToCm(ft, inch);
  const ok = cm != null && cm >= HEIGHT_MIN_CM && cm <= HEIGHT_MAX_CM;

  const switchTo = (u: HeightUnit) => {
    if (u === unit) return;
    // Carry the number across so switching never loses what was typed.
    if (u === "ft" && cm != null && cm >= HEIGHT_MIN_CM && cm <= HEIGHT_MAX_CM) {
      const f = cmToFtIn(cm);
      setTotalIn(f.ft * 12 + f.inch);
    }
    if (u === "cm") setCmText(String(ftInToCm(ft, inch)));
    setHeightUnit(u);
  };

  const pill = (on: boolean) => ({ background: on ? "var(--primary)" : "var(--surface-raised)", color: on ? "var(--text-on-primary)" : "var(--text-secondary)" });

  const view = (
    <>
      <div className="flex justify-center pb-3">
        <span className="flex gap-1" role="radiogroup" aria-label="Height units">
          {(["cm", "ft"] as const).map((u) => (
            <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => switchTo(u)} className="h-8 rounded-full px-3.5 text-[13px] font-medium" style={pill(unit === u)}>
              {u === "cm" ? "cm" : "ft / in"}
            </button>
          ))}
        </span>
      </div>
      {unit === "cm" ? (
        <>
          <NumberPadValue value={cmText} unit="cm" />
          <NumberPad value={cmText} onChange={setCmText} decimals={0} step={1} min={HEIGHT_MIN_CM} max={HEIGHT_MAX_CM} />
        </>
      ) : (
        <div className="flex flex-col gap-3 pb-4 pt-2">
          <Stepper label="Feet" value={ft} unit="ft" canDown={totalIn - 12 >= IN_MIN} canUp={totalIn + 12 <= IN_MAX} onStep={(d) => setTotalIn(totalIn + 12 * d)} />
          <Stepper label="Inches" value={inch} unit="in" canDown={totalIn - 1 >= IN_MIN} canUp={totalIn + 1 <= IN_MAX} onStep={(d) => setTotalIn(totalIn + d)} />
          <p className="text-center text-[13px]" style={{ color: ok ? "var(--text-secondary)" : "var(--status-attention)", fontVariantNumeric: "tabular-nums" }}>
            {ok ? `${cm} cm` : `Between ${HEIGHT_MIN_CM} and ${HEIGHT_MAX_CM} cm`}
          </p>
        </div>
      )}
    </>
  );
  return { cm, ok, view };
}

function Stepper({ label, value, unit, canDown, canUp, onStep }: { label: string; value: number; unit: string; canDown: boolean; canUp: boolean; onStep: (delta: 1 | -1) => void }) {
  const btn = (delta: 1 | -1) => (
    <button
      type="button"
      onClick={() => onStep(delta)}
      disabled={delta < 0 ? !canDown : !canUp}
      className="flex h-12 w-12 items-center justify-center rounded-full text-[22px] font-medium transition-colors active:bg-[var(--surface-pressed)] disabled:opacity-40"
      style={{ background: "var(--surface-raised)", color: "var(--text)" }}
      aria-label={`${delta < 0 ? "Fewer" : "More"} ${label.toLowerCase()}`}
    >
      {delta < 0 ? "−" : "+"}
    </button>
  );
  return (
    <div className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3" style={{ background: "var(--surface)" }}>
      <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <div className="flex items-center gap-4">
        {btn(-1)}
        <span className="w-[4.5rem] text-center text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }} aria-live="polite">
          {value}
          <span className="ml-1 text-[15px] font-medium" style={{ color: "var(--text-secondary)" }}>
            {unit}
          </span>
        </span>
        {btn(1)}
      </div>
    </div>
  );
}
