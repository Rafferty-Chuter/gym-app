"use client";

import type { Contributor, RatingWord } from "@/lib/physique/sleepView";
import { STATUS_HEX } from "@/lib/ui/status";

const WORD_COLOR: Record<RatingWord, string> = {
  Poor: STATUS_HEX.attention,
  Fair: STATUS_HEX.watch,
  Good: STATUS_HEX.good,
  Excellent: STATUS_HEX.good,
};

/**
 * Contributors as Bevel's two-column grid: word in the status colour, the
 * label under it, a 4px bar. Debt is left out here; the 14-night card
 * says it in words. Never a score.
 */
export default function SleepContributors({ items }: { items: Contributor[] }) {
  const shown = items.filter((c) => c.id !== "debt");
  return (
    <section aria-label="Contributors" className="rounded-[16px] p-4" style={{ background: "#141416" }}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-[17px] font-semibold" style={{ color: "#f2f2f0" }}>
          Contributors
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
          Last 7 nights
        </span>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {shown.map((c) => (
          <li key={c.id} className="flex flex-col rounded-[12px] px-3 py-2.5" style={{ background: "#1d1d20" }} aria-label={`${c.label}: ${c.word ?? "Early read"}. ${c.detail}`}>
            <span className="text-[15px] font-semibold" style={{ color: c.word ? WORD_COLOR[c.word] : "#6f6f76" }}>
              {c.word ?? "Early read"}
            </span>
            <span className="text-[12px]" style={{ color: "#a3a3a8" }}>
              {c.label}
            </span>
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full" style={{ background: "#2a2a2e" }} aria-hidden>
              <div className="h-full rounded-full" style={{ width: `${Math.round(c.fill * 100)}%`, background: c.word ? WORD_COLOR[c.word] : "#6f6f76" }} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
