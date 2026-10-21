"use client";

import { useRouter } from "next/navigation";
import { Chevron, StatusDot } from "@/components/physique/ui";
import type { Now } from "@/lib/dates";
import type { PhysiqueAnalysis } from "@/lib/physique/types";
import { STATUS_HEX } from "@/lib/ui/status";
import { assistantHrefFor, stashAssistantPrompt } from "@/lib/ui/assistantPrompt";
import { ASSISTANT_ENABLED } from "@/lib/features";
import type { WeightUnit } from "@/lib/units";

/** The "Ask why" prompt the assistant receives; it answers from the PHYSIQUE CONTEXT block. */
export function askWhyPrompt(analysis: PhysiqueAnalysis): string {
  return `Why does my Body tab say "${analysis.verdict.title}"? Explain it from my numbers.`;
}

/**
 * The verdict panel (DESIGN.md rev 4.1, facts only since Z3): dot and
 * title, the sentence, the window and n; then, in the same panel under
 * hairlines, the flags. No advice and no buttons that change the plan:
 * targets move in the weekly review, the goal in its own screen. Safety
 * verdicts show no numbers.
 */
export default function VerdictCard({ analysis }: { analysis: PhysiqueAnalysis; now?: Now; unit?: WeightUnit }) {
  const router = useRouter();
  const v = analysis.verdict;
  const color = STATUS_HEX[analysis.status.state];
  const isSafety = v.id.startsWith("SAFE-");
  const caption = v.windowDays ? `${v.windowDays} days${v.n ? ` · ${v.n} ${v.id.startsWith("SLEEP") ? "nights" : "weigh-ins"}` : ""}` : null;

  function askWhy() {
    const prompt = askWhyPrompt(analysis);
    if (stashAssistantPrompt(prompt)) router.push("/assistant");
    else router.push(assistantHrefFor(prompt));
  }

  const divider = { borderTop: "1px solid var(--border)" };
  return (
    <section className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }} aria-label="Verdict">
      <div className="flex flex-col gap-1 px-4 pb-3.5 pt-4">
        <div className="flex items-center gap-2">
          <StatusDot color={color} />
          <span className="text-[17px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)" }}>
            {v.title}
          </span>
        </div>
        {!isSafety && (
          <p className="pl-4 text-[15px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
            {v.detail}
          </p>
        )}
        {isSafety && (
          <p className="pl-4 text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            {v.detail}
          </p>
        )}
        {caption && (
          <span className="pl-4 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
            {caption}
          </span>
        )}
      </div>

      {analysis.flags.length > 0 && (
        <ul className="flex flex-col divide-y divide-[var(--border)]" style={divider}>
          {analysis.flags.slice(0, 3).map((f) => (
            <li key={f.id} className="flex flex-col gap-0.5 px-4 py-3">
              <span className="text-[13px] font-medium" style={{ color: "var(--text)" }}>
                {f.title}
              </span>
              <span className="text-[12px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                {f.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {ASSISTANT_ENABLED && analysis.goal && !isSafety && (
        <button type="button" onClick={askWhy} className="flex w-full items-center justify-between px-4 py-3 text-left text-[13px] font-semibold transition-colors active:bg-[var(--surface-raised)]" style={{ ...divider, color: "var(--text-secondary)" }}>
          Ask why
          <Chevron />
        </button>
      )}
    </section>
  );
}
