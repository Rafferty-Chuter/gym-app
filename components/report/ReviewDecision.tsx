"use client";

import { useRouter } from "next/navigation";
import type { ReviewModel } from "@/lib/physique/io/review";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { fmtKcal } from "@/lib/physique/copy";
import { Caption, Row, RowGroup } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * The week's targets (A2: read-only). Targets follow the maintenance
 * estimate by themselves on the check-in day (`AutoCheckIn`), so this only
 * says where they are and what changed: the new numbers, when they moved
 * and from what, or that the check-in found no change. No buttons.
 */
export default function ReviewDecision({ model }: { model: ReviewModel }) {
  const router = useRouter();
  const { reviewed, hasProgram, plan } = model;
  const { program } = useBodyData();

  if (!hasProgram) {
    return (
      <RowGroup>
        <Row label="No goal set" sub="With a goal, food targets follow the maintenance estimate each week" value={<span style={{ color: "var(--text-tertiary)" }}>Set</span>} onClick={() => router.push("/body/goal")} ariaLabel="Set a goal" />
      </RowGroup>
    );
  }

  const history = program?.history ?? [];
  const current = history.at(-1) ?? null;
  const previous = history.at(-2) ?? null;
  // The check-in moved the targets when the newest entry starts in its week.
  const movedThisWeek = reviewed != null && current != null && previous != null && current.startDate >= plan.weekStart && current.kcal !== previous.kcal;
  const weekday = WEEKDAY[new Date(`${plan.weekStart}T12:00:00Z`).getUTCDay()];
  const status = reviewed
    ? movedThisWeek
      ? `Updated ${longLocalDate(reviewed.date)}: ${fmtKcal(previous!.kcal)} → ${fmtKcal(current!.kcal)} kcal, as maintenance moved to about ${fmtKcal(current!.tdeeAtAccept)}.`
      : `Checked ${longLocalDate(reviewed.date)}: no change.`
    : `Targets follow the maintenance estimate each ${weekday}.`;

  return (
    <section className="flex flex-col gap-1.5 rounded-[16px] p-4" style={{ background: "var(--surface)" }} aria-label="Targets">
      <Caption>Targets</Caption>
      {current && (
        <>
          <span className="text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {fmtKcal(current.kcal)} kcal a day
          </span>
          <span className="text-[13px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            Protein {current.proteinG} g · fat {current.fatG} g · carbs {current.carbsG} g
          </span>
        </>
      )}
      <span className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
        {status}
      </span>
    </section>
  );
}
