"use client";

import type { ScaleJump } from "@/lib/physique/scaleJump";
import { jumpCauseLine, jumpHeadline, jumpSettleLine } from "@/lib/physique/scaleJumpWords";
import type { WeightUnit } from "@/lib/units";

/**
 * Today's weigh-in when it jumped (IN2): the move in kilos since the last
 * weigh-in, what was logged behind it in its own units,
 * and how long their past jumps took to go. Shown only on a jump morning;
 * the words live in `scaleJumpWords.ts`.
 */
export default function ScaleJumpCard({ jump, unit }: { jump: ScaleJump; unit: WeightUnit }) {
  const settle = jumpSettleLine(jump);
  return (
    <section className="mt-2.5 rounded-[16px] px-3.5 py-3" style={{ background: "var(--surface)" }} aria-label="Today's weigh-in">
      <p className="text-[15px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
        {jumpHeadline(jump, unit, true)}
      </p>
      <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
        {jumpCauseLine(jump, true)}
      </p>
      {settle && (
        <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          {settle}
        </p>
      )}
    </section>
  );
}
