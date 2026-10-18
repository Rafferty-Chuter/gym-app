"use client";

import Link from "next/link";
import { StatusDot } from "@/components/physique/ui";
import { STATUS_HEX } from "@/lib/ui/status";

/**
 * The verdict line before the judge exists (U2a). "Calibrating" plus what is
 * missing, never a placeholder number. U2b replaces this with the real
 * verdict from `PhysiqueAnalysis`.
 */
export type CalibratingItem = { text: string };

export default function VerdictPlaceholder({ hasGoal, items }: { hasGoal: boolean; items: CalibratingItem[] }) {
  if (!hasGoal) {
    return (
      <section className="flex flex-col gap-2" aria-label="Verdict">
        <div className="flex items-center gap-2">
          <StatusDot color={STATUS_HEX.unknown} />
          <span className="text-[15px]" style={{ color: "var(--text)" }}>
            Set a target weight to get a verdict.
          </span>
        </div>
        <Link
          href="/body/goal"
          className="inline-flex h-[36px] w-fit items-center rounded-[12px] px-3 text-[13px] font-semibold"
          style={{ background: "var(--surface-raised)", color: "var(--text)" }}
        >
          Set goal
        </Link>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-1.5" aria-label="Verdict">
      <div className="flex items-center gap-2">
        <StatusDot color={STATUS_HEX.unknown} />
        <span className="text-[15px]" style={{ color: "var(--text)" }}>
          Calibrating
        </span>
      </div>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-0.5 pl-4">
          {items.map((it) => (
            <li key={it.text} className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {it.text}
            </li>
          ))}
        </ul>
      ) : (
        <p className="pl-4 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Enough data is in. The first verdict arrives with the next step of the build.
        </p>
      )}
    </section>
  );
}
