"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import NumberPad, { NumberPadValue, formatPadValue, parsePadValue } from "@/components/ui/NumberPad";
import { BAR_OPTIONS, PLATE_OPTIONS, formatSide, platesPerSide } from "@/lib/workout/plates";

type Props = {
  /** Null keeps the sheet closed. */
  weight: number | null;
  unit: "kg" | "lb";
  onClose: () => void;
};

/** Plate colours follow the calibrated-plate convention; lb plates reuse the same ramp by rank. PUB. */
const PLATE_COLOURS: Record<number, string> = { 25: "#f26d7d", 20: "#7aa2ff", 15: "#f0c36a", 10: "#6fcf9f", 5: "#f2f2f0", 2.5: "#a3a3a8", 1.25: "#6f6f76" };
const LB_COLOURS: Record<number, string> = { 45: "#7aa2ff", 35: "#f0c36a", 25: "#6fcf9f", 10: "#f2f2f0", 5: "#a3a3a8", 2.5: "#6f6f76" };

/**
 * Plate calculator (Hevy): the target weight on the pad, a bar choice, the
 * plates per side as a drawing and a list. Pure maths in lib/workout/plates.
 */
export default function PlateCalculator({ weight, unit, onClose }: Props) {
  return weight != null ? <Inner key={`${weight}-${unit}`} weight={weight} unit={unit} onClose={onClose} /> : null;
}

function Inner({ weight, unit, onClose }: { weight: number; unit: "kg" | "lb"; onClose: () => void }) {
  const [value, setValue] = useState(weight > 0 ? formatPadValue(weight, 2) : "");
  const [bar, setBar] = useState(BAR_OPTIONS[unit][0]);
  const target = parsePadValue(value) ?? 0;
  const load = platesPerSide(target, bar, PLATE_OPTIONS[unit]);
  const colours = unit === "kg" ? PLATE_COLOURS : LB_COLOURS;
  const maxPlate = Math.max(...PLATE_OPTIONS[unit]);

  return (
    <Sheet open onClose={onClose} title="Plates">
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2" role="radiogroup" aria-label="Bar">
          <span className="text-[13px]" style={{ color: "#a3a3a8" }}>
            Bar
          </span>
          {BAR_OPTIONS[unit].map((b) => {
            const selected = b === bar;
            return (
              <button key={b} type="button" role="radio" aria-checked={selected} onClick={() => setBar(b)} className="h-[30px] rounded-full px-3 text-[12px] font-medium" style={{ background: selected ? "#f2f2f0" : "#1d1d20", color: selected ? "#0a0a0b" : "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
                {b} {unit}
              </button>
            );
          })}
        </div>

        <div className="flex h-[96px] items-center rounded-[12px] px-3" style={{ background: "#141416" }} aria-hidden>
          <div className="h-[6px] w-[26px] shrink-0 rounded-l" style={{ background: "#6f6f76" }} />
          <div className="h-[18px] w-[6px] shrink-0" style={{ background: "#a3a3a8" }} />
          <div className="flex h-full items-center gap-[3px] pl-[3px]">
            {load.perSide.map((p, i) => (
              <div key={i} className="flex shrink-0 items-center justify-center rounded-[3px] text-[9px] font-semibold" style={{ width: Math.max(8, 10 + (p / maxPlate) * 10), height: 28 + (p / maxPlate) * 52, background: colours[p] ?? "#a3a3a8", color: "#0a0a0b", fontVariantNumeric: "tabular-nums" }}>
                {p >= 10 ? p : ""}
              </div>
            ))}
          </div>
          <div className="h-[6px] min-w-[40px] flex-1 rounded-r" style={{ background: "#6f6f76" }} />
        </div>

        <div className="flex items-baseline justify-between">
          <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
            Per side
          </span>
          <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
            {formatSide(load.perSide)}
          </span>
        </div>
        <p className="text-[12px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
          {load.belowBar
            ? `Below the ${bar} ${unit} bar.`
            : load.remainder > 0
              ? `Loads ${load.achieved} ${unit}; ${load.remainder} ${unit} short with these plates.`
              : target > 0
                ? `${load.achieved} ${unit} with the ${bar} ${unit} bar.`
                : "Enter a weight."}
        </p>

        <NumberPadValue value={value} unit={unit} />
        <NumberPad value={value} onChange={setValue} decimals={unit === "kg" ? 2 : 1} step={unit === "kg" ? 2.5 : 5} max={unit === "kg" ? 500 : 1100} />
      </div>
    </Sheet>
  );
}
