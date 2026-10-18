"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import SleepDial from "@/components/sleep/SleepDial";
import { Chevron, SCard } from "@/components/sleep/parts";
import { formatHoursMin, parseClock } from "@/lib/physique/dayTotals";
import { USUAL_WAKE_MIN_NIGHTS, type TonightPlan } from "@/lib/physique/sleepScore";

function wakeLine(plan: TonightPlan): string {
  if (plan.wakeSource === "usual") return `Your usual, from ${plan.usualNights} nights`;
  if (plan.wakeSource === "override") return "Set for tomorrow only";
  return `Until ${USUAL_WAKE_MIN_NIGHTS} nights give your usual`;
}

/**
 * Tonight (S8, after Bevel's planner and WHOOP's "sleep needed"): the
 * wake time is read from your nights, so there is nothing to set. Lights
 * out and wind-down are worked back from it and tonight's need. A one-off
 * wake time for tomorrow sits behind the wake row.
 */
export default function TonightCard({ plan, onOverride }: { plan: TonightPlan; onOverride: (hhmm: string | null) => void }) {
  const [open, setOpen] = useState(false);
  const extra = plan.needH - plan.goalH > 1 / 60;
  return (
    <SCard title="Tonight" label="Tonight" className="flex flex-col items-stretch gap-4 px-4 pb-2 pt-4">
      <div className="grid grid-cols-2 text-center">
        <div className="flex flex-col">
          <span className="text-[12px]" style={{ color: "var(--sl-text-secondary)" }}>
            Wind down
          </span>
          <span className="text-[24px] font-semibold tracking-[-0.01em]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {plan.windDown}
          </span>
        </div>
        <div className="flex flex-col" style={{ borderLeft: "1px solid var(--sl-border)" }}>
          <span className="text-[12px]" style={{ color: "var(--sl-text-secondary)" }}>
            Lights out
          </span>
          <span className="text-[24px] font-semibold tracking-[-0.01em]" style={{ fontVariantNumeric: "tabular-nums" }}>
            {plan.bedtime}
          </span>
        </div>
      </div>
      <div className="flex justify-center">
        <SleepDial windDown={plan.windDown} bedtime={plan.bedtime} wake={plan.wake} needH={plan.needH} />
      </div>
      <p className="text-center text-[13px] leading-snug" style={{ color: "var(--sl-text-secondary)" }}>
        {extra ? `Your ${formatHoursMin(plan.goalH * 60)} goal plus some of this week's ${formatHoursMin(plan.debtH * 60)} debt.` : `Your ${formatHoursMin(plan.goalH * 60)} goal, with time to drop off.`}
      </p>
      <button type="button" onClick={() => setOpen(true)} className="-mx-4 flex min-h-[52px] items-center justify-between gap-3 px-4 text-left transition-colors active:bg-[var(--sl-surface-raised)]" style={{ borderTop: "1px solid var(--sl-border)" }} aria-label={`Wake up at ${plan.wake}. ${wakeLine(plan)}. Change for tomorrow`}>
        <span className="flex flex-col">
          <span className="text-[15px]">Wake up at {plan.wake}</span>
          <span className="text-[12px]" style={{ color: "var(--sl-text-tertiary)" }}>
            {wakeLine(plan)}
          </span>
        </span>
        <span style={{ color: "var(--sl-text-tertiary)" }}>
          <Chevron />
        </span>
      </button>
      {open && <WakeSheet plan={plan} onClose={() => setOpen(false)} onSave={(v) => (onOverride(v), setOpen(false))} />}
    </SCard>
  );
}

function WakeSheet({ plan, onClose, onSave }: { plan: TonightPlan; onClose: () => void; onSave: (hhmm: string | null) => void }) {
  const [value, setValue] = useState(plan.wake);
  const valid = parseClock(value) !== null;
  return (
    <Sheet
      open
      onClose={onClose}
      title="Tomorrow's wake time"
      footer={
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => onSave(value)} disabled={!valid}>
            Set for tomorrow
          </PrimaryButton>
          {plan.wakeSource === "override" && <SecondaryButton onClick={() => onSave(null)}>Back to my usual</SecondaryButton>}
        </div>
      }
    >
      <div className="flex flex-col gap-3 pb-2">
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          For an early start. It applies to tomorrow morning only; after that the plan goes back to your usual wake time, read from your nights.
        </p>
        <input type="time" value={value} onChange={(e) => setValue(e.target.value)} aria-label="Wake time tomorrow" className="h-[52px] w-full rounded-[12px] px-4 text-[22px] font-semibold outline-none" style={{ background: "var(--surface-raised)", color: "var(--text)", colorScheme: "dark" }} />
      </div>
    </Sheet>
  );
}
