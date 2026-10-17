"use client";

import { Caption } from "@/components/physique/ui";
import type { Contributor, RatingWord } from "@/lib/physique/sleepView";
import { STATUS_HEX } from "@/lib/ui/status";

const WORD_COLOR: Record<RatingWord, string> = {
  Poor: STATUS_HEX.attention,
  Fair: STATUS_HEX.watch,
  Good: STATUS_HEX.good,
  Excellent: STATUS_HEX.good,
};

/** DESIGN.md contributor list (from Bevel): label · word in the status colour · a 4px bar. Never a score. */
export default function SleepContributors({ items }: { items: Contributor[] }) {
  return (
    <section aria-label="Contributors">
      <div className="mb-2">
        <Caption>Contributors · last 7 nights</Caption>
      </div>
      <ul className="overflow-hidden rounded-[12px] divide-y divide-[#2a2a2e]" style={{ background: "#141416" }}>
        {items.map((c) => (
          <li key={c.id} className="px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-[15px]" style={{ color: "#f2f2f0" }}>
                {c.label}
              </span>
              <span className="text-[13px] font-semibold" style={{ color: c.word ? WORD_COLOR[c.word] : "#6f6f76" }}>
                {c.word ?? "Early read"}
              </span>
            </div>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full" style={{ background: "#1d1d20" }} aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.round(c.fill * 100)}%`, background: "#a3a3a8", transition: "width 150ms" }} />
            </div>
            <p className="mt-1.5 text-[11px]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
              {c.detail}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
