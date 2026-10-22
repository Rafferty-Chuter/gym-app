"use client";

import Link from "next/link";
import { Chevron } from "@/components/physique/ui";
import type { StuckLift } from "@/lib/physique/liftPlateau";
import { stuckChangesLine, stuckTitle, stuckValue } from "@/lib/physique/liftPlateauWords";
import type { WeightUnit } from "@/lib/units";

/**
 * One stuck lift (IN4): the fact in a lifter's terms, the level it sits at
 * (estimated 1RM), and what changed since its best as before → after, on
 * the lift's own page. On Progress the same fact is a Spotted row (IN10).
 */
export function StalledLiftRow({ lift, unit, href }: { lift: StuckLift; unit: WeightUnit; href?: string }) {
  const inner = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline justify-between gap-3">
          <span className="min-w-0 text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            {stuckTitle(lift, unit)}
          </span>
          <span className="shrink-0 text-[15px] font-medium" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {stuckValue(lift, unit)}
          </span>
        </span>
        <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
          {stuckChangesLine(lift, unit)}
        </span>
      </span>
      {href && <Chevron />}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3 text-left";
  return href ? (
    <Link href={href} className={`${cls} transition-colors active:bg-[var(--surface-raised)]`} aria-label={`${stuckTitle(lift, unit)}, about ${stuckValue(lift, unit)} estimated 1RM. ${stuckChangesLine(lift, unit)}. Open its history`}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}
