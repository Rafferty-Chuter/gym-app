"use client";

import { StatusDot } from "@/components/physique/ui";
import type { PhysiqueAnalysis, SleepStatus } from "@/lib/physique/types";
import { STATUS_HEX } from "@/lib/ui/status";

const DOT: Record<SleepStatus, string> = {
  ok: STATUS_HEX.good,
  short: STATUS_HEX.watch,
  severe: STATUS_HEX.attention,
  unknown: STATUS_HEX.unknown,
};

const SOURCE: Record<NonNullable<PhysiqueAnalysis["sleep"]["source"]>, string> = {
  manual: "Manual",
  wearable: "Wearable",
  mixed: "Mixed",
};

/** DESIGN.md verdict line: the engine's status dot, one sentence of rule copy, then the window and n. */
export default function SleepInsight({ read, text }: { read: PhysiqueAnalysis["sleep"]; text: string }) {
  return (
    <section aria-label="Sleep read" className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2.5">
        <span className="mt-[7px] flex">
          <StatusDot color={DOT[read.status]} />
        </span>
        <p className="text-[15px] leading-[1.45]" style={{ color: "#f2f2f0" }}>
          {text}
        </p>
      </div>
      <p className="pl-[18px] text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
        14 nights · {read.nightsLogged14} logged{read.source ? ` · ${SOURCE[read.source]}` : ""}
      </p>
    </section>
  );
}
