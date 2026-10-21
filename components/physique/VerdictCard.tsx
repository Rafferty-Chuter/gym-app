"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Chevron, ErrorLine, SecondaryButton, StatusDot } from "@/components/physique/ui";
import { applyRecommendation } from "@/lib/physique/io/recommendations";
import type { Now } from "@/lib/dates";
import type { PhysiqueAnalysis, Recommendation } from "@/lib/physique/types";
import { STATUS_HEX } from "@/lib/ui/status";
import { assistantHrefFor, stashAssistantPrompt } from "@/lib/ui/assistantPrompt";
import { ASSISTANT_ENABLED } from "@/lib/features";
import type { WeightUnit } from "@/lib/units";

/** The "Ask why" prompt the assistant receives; it answers from the PHYSIQUE CONTEXT block. */
export function askWhyPrompt(analysis: PhysiqueAnalysis): string {
  return `Why does my Body tab say "${analysis.verdict.title}"? Explain the verdict from my numbers and what, if anything, I should change.`;
}

function applyLabel(rec: Recommendation): string | null {
  switch (rec.kind) {
    case "change_rate":
      return "Apply";
    case "refresh_targets":
      return "Update targets";
    default:
      return null;
  }
}

/**
 * The verdict panel (DESIGN.md rev 4.1): dot and title, the sentence, the
 * window and n; then, in the same panel under hairlines, the flags, the
 * recommendation with its button, and "Ask why". One surface, not a line
 * with boxes floating under it. Safety verdicts show no numbers.
 */
export default function VerdictCard({ analysis, now, unit }: { analysis: PhysiqueAnalysis; now: Now; unit: WeightUnit }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const v = analysis.verdict;
  const color = STATUS_HEX[analysis.status.state];
  const isSafety = v.id.startsWith("SAFE-");
  const rec = analysis.recommendation;
  const button = rec ? applyLabel(rec) : null;
  const caption = v.windowDays ? `${v.windowDays} days${v.n ? ` · ${v.n} ${v.id.startsWith("SLEEP") ? "nights" : "weigh-ins"}` : ""}` : null;

  async function apply() {
    if (!rec) return;
    setBusy(true);
    setError(null);
    const r = await applyRecommendation(rec, now, unit, new Date().toISOString());
    setBusy(false);
    if (r.ok) setNote(r.summary);
    else setError(r.error);
  }

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

      {rec && analysis.recommendationLabel && (
        <div className="flex items-center justify-between gap-3 px-4 py-3" style={divider}>
          <span className="text-[13px] font-medium" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
            {note ?? analysis.recommendationLabel}
          </span>
          {rec.kind === "confirm_days" ? (
            // Partial food days are confirmed on Food, on that day. A plain anchor: Food reads `?date=` when it loads, which a soft navigation would miss (A1).
            <a href={`/food?date=${rec.dates[0] ?? ""}`} className="shrink-0 text-[13px] font-semibold" style={{ color: "var(--text)" }}>
              Open day
            </a>
          ) : rec.kind === "log_more" && rec.what === "waist" ? null : button && !note ? (
            <SecondaryButton small onClick={apply} disabled={busy}>
              {button}
            </SecondaryButton>
          ) : null}
        </div>
      )}
      {error && (
        <div className="px-4 pb-3">
          <ErrorLine text={error} />
        </div>
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
