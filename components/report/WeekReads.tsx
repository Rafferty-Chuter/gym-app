"use client";

import { RowGroup, StatusDot } from "@/components/physique/ui";
import type { ReviewRead } from "@/lib/physique/review";
import { STATUS_HEX } from "@/lib/ui/status";

function ReadRow({ label, read }: { label: string; read: ReviewRead }) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3">
      <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
        {label}
      </span>
      <span className="flex items-center gap-2">
        <StatusDot color={STATUS_HEX[read.state]} />
        <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
          {read.title}
        </span>
      </span>
      <span className="pl-4 text-[12px] leading-snug" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
        {read.detail}
      </span>
    </div>
  );
}

/** The week in three reads (G3): nutrition, training and sleep, each with its dot and one line. */
export default function WeekReads({ nutrition, training, sleep }: { nutrition: ReviewRead; training: ReviewRead; sleep: ReviewRead }) {
  return (
    <section aria-label="The week">
      <RowGroup>
        <ReadRow label="Nutrition" read={nutrition} />
        <ReadRow label="Training" read={training} />
        <ReadRow label="Sleep" read={sleep} />
      </RowGroup>
    </section>
  );
}
