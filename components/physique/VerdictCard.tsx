"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ErrorLine, SecondaryButton, StatusDot } from "@/components/physique/ui";
import { applyRecommendation } from "@/lib/physique/io/recommendations";
import type { Now } from "@/lib/dates";
import type { PhysiqueAnalysis, Recommendation } from "@/lib/physique/types";
import { STATUS_HEX } from "@/lib/ui/status";
import { assistantHrefFor, stashAssistantPrompt } from "@/lib/ui/assistantPrompt";
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
 * The verdict line (DESIGN.md): dot, sentence, window and n, then flags as
 * plain rows and the recommendation row. Safety verdicts show no numbers.
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

  return (
    <section className="flex flex-col gap-3" aria-label="Verdict">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <StatusDot color={color} />
          <span className="text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
            {v.title}
          </span>
        </div>
        {!isSafety && (
          <p className="pl-4 text-[15px] leading-snug" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
            {v.detail}
          </p>
        )}
        {isSafety && (
          <p className="pl-4 text-[15px] leading-snug" style={{ color: "#a3a3a8" }}>
            {v.detail}
          </p>
        )}
        {caption && (
          <span className="pl-4 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
            {caption}
          </span>
        )}
      </div>

      {analysis.flags.length > 0 && (
        <ul className="flex flex-col divide-y divide-[#2a2a2e] overflow-hidden rounded-[12px]" style={{ background: "#141416" }}>
          {analysis.flags.slice(0, 3).map((f) => (
            <li key={f.id} className="flex flex-col px-4 py-2.5">
              <span className="text-[13px] font-medium" style={{ color: "#f2f2f0" }}>
                {f.title}
              </span>
              <span className="text-[12px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
                {f.detail}
              </span>
            </li>
          ))}
        </ul>
      )}

      {rec && analysis.recommendationLabel && (
        <div className="flex items-center justify-between gap-3 rounded-[12px] px-4 py-3" style={{ background: "#141416", border: "1px solid #2a2a2e" }}>
          <span className="text-[13px]" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
            {note ?? analysis.recommendationLabel}
          </span>
          {rec.kind === "confirm_days" ? (
            <Link href={`/body?date=${rec.dates[0] ?? ""}`} className="shrink-0 text-[13px] font-semibold" style={{ color: "#f2f2f0" }}>
              Open day
            </Link>
          ) : rec.kind === "log_more" && rec.what === "waist" ? null : button && !note ? (
            <SecondaryButton small onClick={apply} disabled={busy}>
              {button}
            </SecondaryButton>
          ) : null}
        </div>
      )}
      <ErrorLine text={error} />

      {analysis.goal && !isSafety && (
        <button type="button" onClick={askWhy} className="w-fit text-[13px] font-semibold" style={{ color: "#a3a3a8" }}>
          Ask why →
        </button>
      )}
    </section>
  );
}
