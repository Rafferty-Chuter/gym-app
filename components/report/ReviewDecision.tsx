"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Now } from "@/lib/dates";
import type { WeightUnit } from "@/lib/units";
import { completeReview, type ReviewModel } from "@/lib/physique/io/review";
import { Caption, ErrorLine, PrimaryButton, Row, RowGroup, SecondaryButton } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

/**
 * The week's decision (G3, now inside the weekly report): one decision.
 * Accepting updates the food targets and the training week together;
 * keeping changes nothing. The questions that came first ("Before you
 * decide") went in C11: part-logged days are left out by the engine, and
 * days, weigh-ins and waist are logged where they live.
 */
export default function ReviewDecision({ model, now, unit }: { model: ReviewModel; now: Now; unit: WeightUnit }) {
  const router = useRouter();
  const { review, reviewed, hasProgram } = model;
  const d = review.decision;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);

  async function run(choice: "accept" | "keep") {
    setBusy(true);
    setError(null);
    const r = await completeReview(model, { partialDays: {}, unloggedDays: {}, waistCm: null }, choice, now, unit, new Date().toISOString());
    setBusy(false);
    if (r.ok) setDone(r.lines);
    else setError(r.error);
  }

  return (
    <>
        {hasProgram ? (
          <section className="flex flex-col gap-3 rounded-[16px] p-4" style={{ background: "var(--surface)" }} aria-label="Decision">
            <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
              This week&apos;s decision
            </span>
            <div className="flex flex-col gap-1">
              <span className="text-[17px] font-semibold">{done ? "Reviewed" : d.title}</span>
              {(done ?? d.lines).map((line) => (
                <span key={line} className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {line}
                </span>
              ))}
            </div>
            {reviewed && !done ? (
              <Caption>
                Reviewed {longLocalDate(reviewed.date)} · {reviewed.accepted ? "accepted" : "kept as it was"}
              </Caption>
            ) : done ? (
              <div className="flex gap-2">
                <Link href="/" className="h-[36px] rounded-[12px] px-3 text-[13px] font-semibold leading-[36px]" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
                  Home
                </Link>
                <Link href="/body" className="h-[36px] rounded-[12px] px-3 text-[13px] font-semibold leading-[36px]" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
                  Body
                </Link>
              </div>
            ) : d.kind === "accept" ? (
              <div data-no-print className="flex flex-col gap-2">
                <PrimaryButton onClick={() => void run("accept")} disabled={busy}>
                  Accept
                </PrimaryButton>
                <SecondaryButton onClick={() => void run("keep")} disabled={busy}>
                  Keep current
                </SecondaryButton>
              </div>
            ) : (
              <PrimaryButton onClick={() => void run("keep")} disabled={busy}>
                Done
              </PrimaryButton>
            )}
            <ErrorLine text={error} />
          </section>
        ) : (
          <RowGroup>
            <Row label="No goal yet" sub="Set one and each week ends in a decision on your targets" value={<span style={{ color: "var(--text-tertiary)" }}>Set</span>} onClick={() => router.push("/body/goal")} ariaLabel="Set a goal" />
          </RowGroup>
        )}


    </>
  );
}
