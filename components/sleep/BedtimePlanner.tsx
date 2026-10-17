"use client";

import { Caption, Row, RowGroup } from "@/components/physique/ui";
import { formatClock, formatHoursMin, parseClock } from "@/lib/physique/dayTotals";
import { FALL_ASLEEP_MIN, type BedtimePlan } from "@/lib/physique/sleepView";

/** Wake-time stepper size. OURS, the same step as the sleep sheet. */
const STEP_MIN = 15;

/**
 * Bevel's bedtime planner without the dial: a wake time with ±15 min
 * steppers, the lights-out it implies for the goal, and tonight's need
 * (goal plus a share of this week's debt).
 */
export default function BedtimePlanner({ plan, onWakeChange }: { plan: BedtimePlan; onWakeChange: (hhmm: string) => void }) {
  const shift = (delta: number) => onWakeChange(formatClock((parseClock(plan.wake) ?? 7 * 60) + delta));
  const needExtra = plan.needH - plan.goalH > 1 / 60;
  const btn = "flex h-11 w-11 items-center justify-center rounded-[12px] text-[20px] font-semibold transition-colors active:bg-[#26262a]";
  return (
    <section aria-label="Bedtime planner">
      <div className="mb-2">
        <Caption>Tonight</Caption>
      </div>
      <RowGroup>
        <div className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2">
          <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
            Wake up at
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shift(-STEP_MIN)} className={btn} style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Wake up 15 minutes earlier">
              −
            </button>
            <span className="w-[64px] text-center text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
              {plan.wake}
            </span>
            <button type="button" onClick={() => shift(STEP_MIN)} className={btn} style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Wake up 15 minutes later">
              +
            </button>
          </div>
        </div>
        <Row label="Lights out by" value={plan.lightsOut} sub={`For ${formatHoursMin(plan.goalH * 60)} asleep, ${FALL_ASLEEP_MIN} min to drop off`} />
        <Row
          label="Tonight's sleep needed"
          value={formatHoursMin(plan.needH * 60)}
          sub={needExtra ? `Goal plus a share of this week's debt · lights out ${plan.lightsOutForNeed}` : "Your goal, nothing to make up"}
        />
      </RowGroup>
    </section>
  );
}
