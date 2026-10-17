"use client";

import Link from "next/link";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { usePhysiqueAnalysis } from "@/lib/physique/io/analysis";
import { STATUS_HEX } from "@/lib/ui/status";
import { StatusDot } from "@/components/physique/ui";

/**
 * Home's verdict line (05-design §9.3): the status dot, the verdict title
 * and detail, its window, and a link into Body. The Today strip carries
 * the numbers; this carries the judgement.
 */
export default function PhysiqueHomeCard() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit: rawUnit } = useUnit();
  const analysis = usePhysiqueAnalysis(hydrated ? now : null, rawUnit === "lb" ? "lb" : "kg");
  if (!analysis) {
    return <div className="h-[64px] rounded-[12px]" style={{ background: "#141416" }} aria-hidden />;
  }
  const v = analysis.verdict;
  const caption = v.windowDays ? `${v.windowDays} days${v.n ? ` · ${v.n} ${v.id.startsWith("SLEEP") ? "nights" : "weigh-ins"}` : ""}` : null;
  // While the week's review is due, the card opens it; the verdict still reads as on Body.
  const due = analysis.checkInDue;
  return (
    <Link href={due ? "/review" : "/body"} className="flex flex-col gap-1 rounded-[12px] px-4 py-3 transition-colors active:bg-[#1d1d20]" style={{ background: "#141416" }} aria-label={`${v.title}. Open ${due ? "review" : "Body"}`}>
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <StatusDot color={STATUS_HEX[analysis.status.state]} />
          <span className="truncate text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
            {v.title}
          </span>
          {due && (
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "#1d1d20", color: "#a3a3a8" }}>
              Review ready
            </span>
          )}
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke="#6f6f76" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0" aria-hidden>
          <path d="M9 6l6 6-6 6" />
        </svg>
      </span>
      <span className="pl-4 text-[13px] leading-snug" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
        {v.detail}
      </span>
      {caption && (
        <span className="pl-4 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
          {caption}
        </span>
      )}
    </Link>
  );
}
