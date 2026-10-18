"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Row, RowGroup } from "@/components/physique/ui";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { planLine, planPosition, type PhasePlan, type PlannedPhase } from "@/lib/physique/phasePlan";
import { formatWeight, type WeightUnit } from "@/lib/units";
import { dayDiff, type LocalDate } from "@/lib/dates";

const PHASE_COLOR: Record<PlannedPhase["kind"], string> = { cut: "var(--text)", lean_bulk: "var(--text)", maintain: "var(--text-tertiary)", next: "var(--border)" };

/**
 * The phase strip (G1): one thin bar under the goal's ETA, the current
 * phase in white, maintenance in grey, what comes after in the dark
 * surface, a mark for today; one line of words under it. Tap for the
 * dates, the notes and the milestones. Nothing else on Body changes.
 */
export default function PhaseStrip({ plan, today, unit }: { plan: PhasePlan; today: LocalDate; unit: WeightUnit }) {
  const [open, setOpen] = useState(false);
  const dated = plan.phases.filter((p) => p.end);
  const first = plan.phases[0];
  const last = dated[dated.length - 1];
  const total = first && last?.end ? Math.max(1, dayDiff(first.start, last.end)) : null;
  const position = planPosition(plan, today);
  // The undated tail takes a fixed slice so the strip always shows what comes after.
  const tailShare = 0.12;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="mt-3 flex w-full flex-col gap-1.5 text-left" aria-label="Phases. Open details" style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        <div className="relative flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full" aria-hidden>
          {plan.phases.map((p) => {
            const share = p.end && total ? (dayDiff(p.start, p.end) / total) * (1 - tailShare) : p.kind === "next" || !p.end ? tailShare : 0;
            return <div key={p.kind + p.start} style={{ flex: `${Math.max(share, 0.02)} 0 0`, background: PHASE_COLOR[p.kind] }} />;
          })}
          {position != null && <div className="absolute top-0 h-full w-[2px]" style={{ left: `${position * (1 - tailShare) * 100}%`, background: "var(--status-good)" }} />}
        </div>
        <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
          {planLine(plan, shortLocalDate)}
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Phases" ariaLabel="Phases">
        <div className="flex flex-col gap-3">
          <RowGroup>
            {plan.phases.map((p) => (
              <Row key={p.kind + p.start} label={p.label} sub={p.note} value={<span className="text-[13px] font-medium" style={{ color: p.current ? "var(--status-good)" : "var(--text-secondary)" }}>{p.end ? `${shortLocalDate(p.start)} to ${shortLocalDate(p.end)}` : p.kind === "next" ? `from ${shortLocalDate(p.start)}` : `from ${shortLocalDate(p.start)}`}</span>} />
            ))}
          </RowGroup>
          {plan.milestones.length > 0 && (
            <RowGroup>
              {plan.milestones.map((m) => (
                <Row key={m.label} label={m.label} sub={m.reached ? "Reached" : m.date ? `Around ${longLocalDate(m.date)} at the current rate` : "No date at the current rate"} value={formatWeight(m.kg, unit)} />
              ))}
            </RowGroup>
          )}
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Dates follow the trend, so they move as you log. Maintenance after a cut is there to measure the new maintenance, not to rest. A diet break is offered separately when adherence says so.
          </p>
        </div>
      </Sheet>
    </>
  );
}
