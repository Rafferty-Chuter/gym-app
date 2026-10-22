"use client";

import { SCard, SRow } from "@/components/sleep/parts";
import { ALC_WINDOW_DAYS, type AlcoholRead } from "@/lib/physique/alcohol";
import { ALCOHOL_EVIDENCE, alcoholRow, alcoholSameDaysNote } from "@/lib/physique/alcoholWords";
import type { WeightUnit } from "@/lib/units";

/**
 * After drinking (IN9): resting heart rate, HRV and sleep after drinking
 * evenings against dry ones, and the scale the mornings after, from
 * `lib/physique/alcohol.ts`. After WHOOP's behaviour rows and Bevel's
 * "5 yes's and 5 no's": one number a row with the lag and both counts
 * under it, or how far along the count is. Nothing for someone with no
 * drinking evening logged; never a judgement about drinking.
 */
export default function AlcoholCard({ read, unit }: { read: AlcoholRead; unit: WeightUnit }) {
  if (!read.drinkEvenings || !read.items.length) return null;
  const note = alcoholSameDaysNote(read);
  const months = Math.round(ALC_WINDOW_DAYS / 30);
  return (
    <SCard
      title="After drinking"
      aside={
        <span className="text-[12px]" style={{ color: "var(--sl-text-tertiary)" }}>
          Last {months} months
        </span>
      }
      label="After drinking"
      className="divide-y divide-[var(--sl-border)]"
    >
      {read.items.map((l) => {
        const w = alcoholRow(l, unit);
        // "No clear link" in a quieter weight than a number, as Connections sets it.
        const value = l.state === "none" ? <span className="text-[13px] font-normal">{w.value}</span> : w.value;
        return <SRow key={l.id} label={w.label} sub={w.sub} value={value} valueColor={l.state === "linked" ? undefined : "var(--sl-text-tertiary)"} />;
      })}
      <div className="flex flex-col gap-1.5 px-4 py-3 text-[12px] leading-snug" style={{ color: "var(--sl-text-tertiary)" }}>
        {note && <p style={{ color: "var(--sl-text-secondary)" }}>{note}</p>}
        <p>Evenings with {read.thresholdG} g of alcohol or more, against evenings with none, each against your own usual.</p>
        <details>
          <summary className="cursor-pointer font-medium">What studies found</summary>
          <p className="mt-1.5">{ALCOHOL_EVIDENCE.nights.text}</p>
          <p className="mt-1">{ALCOHOL_EVIDENCE.strength.text}</p>
          <ul className="mt-1.5 flex flex-col gap-0.5 text-[11px]">
            <li>{ALCOHOL_EVIDENCE.nights.source}</li>
            <li>{ALCOHOL_EVIDENCE.strength.source}</li>
          </ul>
        </details>
      </div>
    </SCard>
  );
}
