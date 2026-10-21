"use client";

import Link from "next/link";
import { Chevron, StatusDot } from "@/components/physique/ui";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { addDays, type LocalDate } from "@/lib/dates";
import { fmtKcal } from "@/lib/physique/copy";
import { weekStart } from "@/lib/physique/food/week";
import { defaultReportWeek } from "@/lib/physique/weekReport";
import type { PhysiqueAnalysis, PhysiqueProgram } from "@/lib/physique/types";
import { STATUS_HEX } from "@/lib/ui/status";

const divider = { borderTop: "1px solid var(--border)" };

/**
 * This week (PR1), the top of Progress: where things stand in one line
 * with its flags, the food targets and whether this week's check-in moved
 * them, and the way into the full weekly report. The weekly report is the
 * steady check-in; the timeline below is the longer view.
 */
export default function ThisWeekCard({ analysis, program, today }: { analysis: PhysiqueAnalysis; program: PhysiqueProgram | null; today: LocalDate }) {
  const v = analysis.verdict;
  const isSafety = v.id.startsWith("SAFE-");
  const history = program?.history ?? [];
  const current = history.at(-1) ?? null;
  const previous = history.at(-2) ?? null;
  const movedThisWeek = current != null && previous != null && current.startDate >= weekStart(today) && current.kcal !== previous.kcal;
  const reportWeek = defaultReportWeek(today);
  return (
    <section aria-label="This week" className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
      <div className="flex flex-col gap-1 px-4 pb-3.5 pt-4">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
          This week
        </span>
        <span className="flex items-center gap-2">
          <StatusDot color={STATUS_HEX[analysis.status.state]} />
          <span className="text-[20px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)" }}>
            {v.title}
          </span>
        </span>
        <p className="pl-4 text-[15px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: isSafety ? undefined : "tabular-nums" }}>
          {v.detail}
        </p>
      </div>
      {analysis.flags.slice(0, 2).map((f) => (
        <div key={f.id} className="flex flex-col gap-0.5 px-4 py-3" style={divider}>
          <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
            {f.title}
          </span>
          <span className="text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {f.detail}
          </span>
        </div>
      ))}
      {current && (
        <div className="flex items-baseline justify-between gap-3 px-4 py-3" style={divider}>
          <span className="flex min-w-0 flex-col">
            <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
              Targets
            </span>
            <span className="text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {movedThisWeek ? `Updated ${longLocalDate(current.startDate)} from ${fmtKcal(previous!.kcal)}, as maintenance moved` : `P ${current.proteinG} · F ${current.fatG} · C ${current.carbsG} g`}
            </span>
          </span>
          <span className="shrink-0 whitespace-nowrap text-[17px] font-semibold" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {fmtKcal(current.kcal)} kcal
          </span>
        </div>
      )}
      <Link href={`/report?week=${reportWeek}`} className="flex min-h-[48px] items-center justify-between gap-3 px-4 py-2.5 transition-colors active:bg-[var(--surface-raised)]" style={divider} aria-label={`Weekly report, ${shortLocalDate(reportWeek)} to ${shortLocalDate(addDays(reportWeek, 6))}. Open`}>
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Weekly report
          </span>
          <span className="truncate text-[13px]" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            {shortLocalDate(reportWeek)} to {shortLocalDate(addDays(reportWeek, 6))}
          </span>
        </span>
        <Chevron />
      </Link>
    </section>
  );
}
