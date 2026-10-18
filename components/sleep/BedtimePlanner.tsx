"use client";

import { formatClock, formatHoursMin, parseClock } from "@/lib/physique/dayTotals";
import { FALL_ASLEEP_MIN, type BedtimePlan } from "@/lib/physique/sleepView";

/** Wake-time stepper size. OURS, the same step as the sleep sheet. */
const STEP_MIN = 15;

/**
 * Tonight (after Bevel's wind-down card): one lights-out time, for
 * tonight's need (the goal plus a share of this week's debt), and the
 * wake time it counts back from, with ±15 min steppers.
 */
export default function BedtimePlanner({ plan, onWakeChange }: { plan: BedtimePlan; onWakeChange: (hhmm: string) => void }) {
  const shift = (delta: number) => onWakeChange(formatClock((parseClock(plan.wake) ?? 7 * 60) + delta));
  const extra = plan.needH - plan.goalH > 1 / 60;
  const btn = "flex h-9 w-9 items-center justify-center rounded-full text-[18px] font-semibold transition-colors active:bg-[#26262a]";
  return (
    <section aria-label="Tonight" className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: "#141416" }}>
      <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0" }}>
        Tonight
      </span>
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col rounded-[12px] px-3 py-2.5" style={{ background: "#1d1d20" }}>
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
            Lights out
          </span>
          <span className="text-[24px] font-semibold leading-tight" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
            {plan.lightsOutForNeed}
          </span>
        </div>
        <div className="flex flex-col rounded-[12px] px-3 py-2.5" style={{ background: "#1d1d20" }}>
          <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
            Wake
          </span>
          <div className="flex items-center justify-between gap-1">
            <button type="button" onClick={() => shift(-STEP_MIN)} className={btn} style={{ color: "#f2f2f0" }} aria-label="Wake up 15 minutes earlier">
              −
            </button>
            <span className="text-[24px] font-semibold leading-tight" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
              {plan.wake}
            </span>
            <button type="button" onClick={() => shift(STEP_MIN)} className={btn} style={{ color: "#f2f2f0" }} aria-label="Wake up 15 minutes later">
              +
            </button>
          </div>
        </div>
      </div>
      <p className="text-[12px] leading-snug" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
        {extra
          ? `${formatHoursMin(plan.needH * 60)} asleep tonight: your ${formatHoursMin(plan.goalH * 60)} goal plus some of this week's ${formatHoursMin(plan.debtH * 60)} short. ${FALL_ASLEEP_MIN} min allowed to drop off.`
          : `${formatHoursMin(plan.needH * 60)} asleep tonight, your goal. Nothing to make up. ${FALL_ASLEEP_MIN} min allowed to drop off.`}
      </p>
    </section>
  );
}
