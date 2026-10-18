"use client";

import { Caption, Row, RowGroup } from "@/components/physique/ui";
import { formatClock, formatHoursMin, parseClock } from "@/lib/physique/dayTotals";
import { FALL_ASLEEP_MIN, type BedtimePlan } from "@/lib/physique/sleepView";

/** Wake-time stepper size. OURS, the same step as the sleep sheet. */
const STEP_MIN = 15;

/**
 * Tonight (after Bevel's wind-down): the wake time with ±15 min steppers,
 * and one lights-out time, for tonight's need (the goal plus a share of
 * this week's debt).
 */
export default function BedtimePlanner({ plan, onWakeChange }: { plan: BedtimePlan; onWakeChange: (hhmm: string) => void }) {
  const shift = (delta: number) => onWakeChange(formatClock((parseClock(plan.wake) ?? 7 * 60) + delta));
  const extra = plan.needH - plan.goalH > 1 / 60;
  const btn = "flex h-9 w-9 items-center justify-center rounded-full text-[18px] font-semibold transition-colors active:bg-[#26262a]";
  return (
    <section aria-label="Tonight">
      <div className="mb-2">
        <Caption>Tonight</Caption>
      </div>
      <RowGroup>
        <Row
          label="Lights out"
          value={plan.lightsOutForNeed}
          sub={extra ? `For ${formatHoursMin(plan.needH * 60)} asleep: the goal plus some of this week's debt` : `For your ${formatHoursMin(plan.goalH * 60)} goal, ${FALL_ASLEEP_MIN} min to drop off`}
        />
        <div className="flex min-h-[56px] items-center justify-between gap-3 px-4 py-2">
          <span className="text-[15px]" style={{ color: "#a3a3a8" }}>
            Wake up
          </span>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => shift(-STEP_MIN)} className={btn} style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Wake up 15 minutes earlier">
              −
            </button>
            <span className="w-[60px] text-center text-[17px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
              {plan.wake}
            </span>
            <button type="button" onClick={() => shift(STEP_MIN)} className={btn} style={{ background: "#1d1d20", color: "#f2f2f0" }} aria-label="Wake up 15 minutes later">
              +
            </button>
          </div>
        </div>
      </RowGroup>
    </section>
  );
}
