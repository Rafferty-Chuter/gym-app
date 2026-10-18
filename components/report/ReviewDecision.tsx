"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LocalDate, Now } from "@/lib/dates";
import type { WeightUnit } from "@/lib/units";
import { completeReview, type ReviewModel } from "@/lib/physique/io/review";
import { hasQuestions } from "@/lib/physique/review";
import { fmtKcal } from "@/lib/physique/copy";
import WaistSheet from "@/components/physique/WaistSheet";
import { Caption, ErrorLine, PrimaryButton, Row, RowGroup, SecondaryButton } from "@/components/physique/ui";
import { longLocalDate } from "@/components/charts/TimeSeriesChart";

/** Two-way pill choice for a day question. */
function Pills<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: string }>; value: T | undefined; onChange: (v: T) => void; label: string }) {
  return (
    <div className="flex shrink-0 gap-1.5" role="group" aria-label={label}>
      {options.map((o) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={selected}
            className="h-[30px] rounded-full px-3 text-[12px] font-medium leading-[30px] transition-colors"
            style={{ background: selected ? "var(--primary)" : "var(--surface-raised)", color: selected ? "var(--text-on-primary)" : "var(--text)" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The week's decision (G3, now inside the weekly report): the check-in's
 * questions when there are any, then one decision. Accepting updates the
 * food targets and the training week together; keeping changes nothing.
 */
export default function ReviewDecision({ model, now, unit }: { model: ReviewModel; now: Now; unit: WeightUnit }) {
  const router = useRouter();
  const { review, reviewed, hasProgram } = model;
  const d = review.decision;
  const q = review.questions;
  const [partial, setPartial] = useState<Record<LocalDate, "partial" | "full">>({});
  const [unlogged, setUnlogged] = useState<Record<LocalDate, "fasting" | "skip">>({});
  const [waistCm, setWaistCm] = useState<number | null>(null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string[] | null>(null);
  const open = !reviewed && !done && hasProgram;
  const askAnything = open && (hasQuestions(q) || q.waterEvents.length > 0);

  async function run(choice: "accept" | "keep") {
    setBusy(true);
    setError(null);
    const r = await completeReview(model, { partialDays: partial, unloggedDays: unlogged, waistCm }, choice, now, unit, new Date().toISOString());
    setBusy(false);
    if (r.ok) setDone(r.lines);
    else setError(r.error);
  }

  return (
    <>
        {askAnything && (
          <section aria-label="Before you decide">
            <div className="mb-2">
              <Caption>Before you decide</Caption>
            </div>
            <RowGroup>
              {q.partialDays.map((p) => (
                <div key={p.date} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[15px]" style={{ color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>
                      {longLocalDate(p.date)} · {fmtKcal(p.kcal)} kcal
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      Looks like part of a day. Partial days stay out of the estimate.
                    </span>
                  </div>
                  <Pills
                    label={`${longLocalDate(p.date)} partial or full`}
                    value={partial[p.date]}
                    onChange={(v) => setPartial((s) => ({ ...s, [p.date]: v }))}
                    options={[
                      { value: "partial", label: "Partial" },
                      { value: "full", label: "Full day" },
                    ]}
                  />
                </div>
              ))}
              {q.unloggedDays.map((date) => (
                <div key={date} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[15px]" style={{ color: "var(--text)" }}>
                      {longLocalDate(date)}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      Nothing logged. Fasted counts as 0 kcal; skipped stays out.
                    </span>
                  </div>
                  <Pills
                    label={`${longLocalDate(date)} fasted or skip`}
                    value={unlogged[date]}
                    onChange={(v) => setUnlogged((s) => ({ ...s, [date]: v }))}
                    options={[
                      { value: "fasting", label: "Fasted" },
                      { value: "skip", label: "Skip" },
                    ]}
                  />
                </div>
              ))}
              {q.weighIn && (
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[15px]" style={{ color: "var(--text)" }}>
                      {q.weighIn.lastWeighInDate ? `No weigh-in since ${longLocalDate(q.weighIn.lastWeighInDate)}` : "No weigh-in yet"}
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                      The trend needs one this week.
                    </span>
                  </div>
                  <Link href="/body" className="h-[30px] shrink-0 rounded-full px-3 text-[12px] font-medium leading-[30px]" style={{ background: "var(--surface-raised)", color: "var(--text)" }}>
                    Log
                  </Link>
                </div>
              )}
              {q.waist && (
                <Row
                  label="Waist"
                  sub={q.waist.lastCm != null && q.waist.lastDate ? `Last ${q.waist.lastCm.toFixed(1)} cm on ${longLocalDate(q.waist.lastDate)}` : "Weekly, optional"}
                  value={waistCm != null ? `${waistCm.toFixed(1)} cm` : <span style={{ color: "var(--text-tertiary)" }}>Add</span>}
                  onClick={() => setSheet(true)}
                  ariaLabel="Log waist"
                />
              )}
            </RowGroup>
          </section>
        )}

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
              <div className="flex flex-col gap-2">
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


    <WaistSheet
      open={sheet}
      onClose={() => setSheet(false)}
      lastCm={waistCm ?? q.waist?.lastCm ?? null}
      dateLabel="Today"
      onSave={async (cm) => {
        setWaistCm(cm);
        return { ok: true as const };
      }}
    />
    </>
  );
}
