"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import type { LocalDate, Now } from "@/lib/dates";
import type { WeightUnit } from "@/lib/units";
import { completeReview, useReview, type ReviewModel } from "@/lib/physique/io/review";
import { hasQuestions, type ReviewRead } from "@/lib/physique/review";
import { fmtKcal } from "@/lib/physique/copy";
import PageHeader from "@/components/ui/PageHeader";
import WaistSheet from "@/components/physique/WaistSheet";
import { Caption, ErrorLine, PrimaryButton, Row, RowGroup, SecondaryButton, StatusDot } from "@/components/physique/ui";
import { longLocalDate, shortLocalDate } from "@/components/charts/TimeSeriesChart";
import { STATUS_HEX } from "@/lib/ui/status";

/**
 * The Monday review (06-execution A7, G3): last week's nutrition, training
 * and sleep as three reads, the check-in's questions, and one decision.
 * Accepting updates the food targets and the training week together.
 */
export default function ReviewPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) return <Shell />;
  return <ReviewContent now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

function Shell() {
  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto max-w-2xl px-5 pt-5 sm:px-6">
        <div className="h-11 rounded-[12px]" style={{ background: "#141416" }} />
      </div>
    </main>
  );
}

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
            style={{ background: selected ? "#f2f2f0" : "#1d1d20", color: selected ? "#0a0a0b" : "#f2f2f0" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ReviewContent({ now, unit }: { now: Now; unit: WeightUnit }) {
  const model = useReview(now, unit);
  if (!model) return <Shell />;
  return <ReviewBody key={model.plan.weekStart} model={model} now={now} unit={unit} />;
}

function ReviewBody({ model, now, unit }: { model: ReviewModel; now: Now; unit: WeightUnit }) {
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

  const caption = `${shortLocalDate(review.week.start)} to ${shortLocalDate(review.week.end)}${review.week.complete ? "" : ` · ${review.week.daysCovered} of 7 days`}`;
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
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption={caption} title="Review" />

        <section className="flex flex-col gap-1" aria-label="Verdict">
          <span className="flex items-center gap-2">
            <StatusDot color={STATUS_HEX[review.verdict.state]} />
            <span className="text-[15px] font-semibold">{review.verdict.title}</span>
          </span>
          <p className="pl-4 text-[13px] leading-snug" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
            {review.verdict.detail}
          </p>
          {review.verdict.recommendationLabel && (
            <span className="pl-4 text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
              {review.verdict.recommendationLabel}
            </span>
          )}
        </section>

        <section aria-label="Last week">
          <RowGroup>
            <ReadRow label="Nutrition" read={review.reads.nutrition} />
            <ReadRow label="Training" read={review.reads.training} />
            <ReadRow label="Sleep" read={review.reads.sleep} />
          </RowGroup>
        </section>

        {askAnything && (
          <section aria-label="Before you decide">
            <div className="mb-2">
              <Caption>Before you decide</Caption>
            </div>
            <RowGroup>
              {q.partialDays.map((p) => (
                <div key={p.date} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-[15px]" style={{ color: "#f2f2f0", fontVariantNumeric: "tabular-nums" }}>
                      {longLocalDate(p.date)} · {fmtKcal(p.kcal)} kcal
                    </span>
                    <span className="text-[11px]" style={{ color: "#6f6f76" }}>
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
                    <span className="text-[15px]" style={{ color: "#f2f2f0" }}>
                      {longLocalDate(date)}
                    </span>
                    <span className="text-[11px]" style={{ color: "#6f6f76" }}>
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
                    <span className="text-[15px]" style={{ color: "#f2f2f0" }}>
                      {q.weighIn.lastWeighInDate ? `No weigh-in since ${longLocalDate(q.weighIn.lastWeighInDate)}` : "No weigh-in yet"}
                    </span>
                    <span className="text-[11px]" style={{ color: "#6f6f76" }}>
                      The trend needs one this week.
                    </span>
                  </div>
                  <Link href="/body" className="h-[30px] shrink-0 rounded-full px-3 text-[12px] font-medium leading-[30px]" style={{ background: "#1d1d20", color: "#f2f2f0" }}>
                    Log
                  </Link>
                </div>
              )}
              {q.waist && (
                <Row
                  label="Waist"
                  sub={q.waist.lastCm != null && q.waist.lastDate ? `Last ${q.waist.lastCm.toFixed(1)} cm on ${longLocalDate(q.waist.lastDate)}` : "Weekly, optional"}
                  value={waistCm != null ? `${waistCm.toFixed(1)} cm` : <span style={{ color: "#6f6f76" }}>Add</span>}
                  onClick={() => setSheet(true)}
                  ariaLabel="Log waist"
                />
              )}
            </RowGroup>
          </section>
        )}

        {hasProgram ? (
          <section className="flex flex-col gap-3 rounded-[12px] p-4" style={{ background: "#141416" }} aria-label="Decision">
            <div className="flex flex-col gap-1">
              <span className="text-[17px] font-semibold">{done ? "Reviewed" : d.title}</span>
              {(done ?? d.lines).map((line) => (
                <span key={line} className="text-[13px] leading-snug" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
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
                <Link href="/" className="h-[36px] rounded-[12px] px-3 text-[13px] font-semibold leading-[36px]" style={{ background: "#1d1d20", color: "#f2f2f0" }}>
                  Home
                </Link>
                <Link href="/body" className="h-[36px] rounded-[12px] px-3 text-[13px] font-semibold leading-[36px]" style={{ background: "#1d1d20", color: "#f2f2f0" }}>
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
            <Row label="No goal yet" sub="Set one and each week ends in a decision" value={<span style={{ color: "#6f6f76" }}>Set</span>} onClick={() => router.push("/body/goal")} ariaLabel="Set a goal" />
          </RowGroup>
        )}

        {hasProgram && (
          <div className="pb-2">
            <Caption>One decision a week. Keeping changes nothing.</Caption>
          </div>
        )}
      </div>

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
    </main>
  );
}
