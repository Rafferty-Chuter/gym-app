"use client";

import Sheet from "@/components/ui/Sheet";
import { GROUP_LABEL, VOLUME_GROUP_ORDER, type MuscleGroup } from "@/lib/volumeAnalysis";
import { setMusclePriority, useMusclePriorities } from "@/lib/physique/io/musclePriorities";
import { EMPHASISE_MAX, PRIORITY_LABEL, bandLabel, emphasisedCount, priorityOf, targetBand, type Priority } from "@/lib/training/volumeTargets";
import type { Phase } from "@/lib/training/progression";

const ORDER: readonly Priority[] = ["maintain", "grow", "emphasise"];

/**
 * Profile → Muscle priorities (T5), after RP's Emphasise / Grow / Maintain:
 * one row per muscle, three pills, the weekly band it implies under the
 * name. Emphasise is limited to three muscles.
 */
export default function MusclePrioritiesSheet({ open, onClose, phase }: { open: boolean; onClose: () => void; phase: Phase }) {
  const priorities = useMusclePriorities();
  const emphasised = emphasisedCount(priorities);
  return (
    <Sheet open={open} onClose={onClose} title="Muscle priorities" ariaLabel="Muscle priorities">
      <div className="flex flex-col gap-3">
        <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
          {`Grow is the default. Emphasise up to ${EMPHASISE_MAX} muscles you want to bring up, and Maintain what can wait on a cut. Each sets the week's band of hard sets.`}
        </p>
        <ul className="flex flex-col overflow-hidden rounded-[12px] divide-y divide-[#2a2a2e]" style={{ background: "#141416" }}>
          {VOLUME_GROUP_ORDER.map((g: MuscleGroup) => {
            const p = priorityOf(priorities, g);
            return (
              <li key={g} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="text-[15px]" style={{ color: "#f2f2f0" }}>
                    {GROUP_LABEL[g]}
                  </span>
                  <span className="text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
                    {bandLabel(targetBand(g, p, phase))} sets
                  </span>
                </div>
                <div className="flex shrink-0 gap-1" role="radiogroup" aria-label={`${GROUP_LABEL[g]} priority`}>
                  {ORDER.map((o) => {
                    const selected = o === p;
                    const blocked = o === "emphasise" && !selected && emphasised >= EMPHASISE_MAX;
                    return (
                      <button key={o} type="button" role="radio" aria-checked={selected} disabled={blocked} onClick={() => void setMusclePriority(g, o)} className="h-8 rounded-full px-2.5 text-[12px] font-medium transition-colors disabled:opacity-40" style={{ background: selected ? "#f2f2f0" : "#1d1d20", color: selected ? "#0a0a0b" : "#a3a3a8" }}>
                        {PRIORITY_LABEL[o]}
                      </button>
                    );
                  })}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Sheet>
  );
}
