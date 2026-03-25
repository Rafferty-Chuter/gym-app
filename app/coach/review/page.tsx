"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getWorkoutHistory, getStats } from "@/lib/trainingAnalysis";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal } from "@/lib/priorityGoal";
import {
  buildCoachStructuredAnalysis,
  EMPTY_COACH_STRUCTURED_ANALYSIS,
  type CoachStructuredAnalysis,
} from "@/lib/coachStructuredAnalysis";
import { getEvidenceCardsForReferencedIds } from "@/lib/evidenceMapping";

const EMPTY_ANALYSIS = EMPTY_COACH_STRUCTURED_ANALYSIS;

export default function CoachReviewPage() {
  const { unit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal } = usePriorityGoal();
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalExercises: 0,
    totalSets: 0,
  });
  const [analysis, setAnalysis] = useState<CoachStructuredAnalysis>(EMPTY_ANALYSIS);
  const [isLoading, setIsLoading] = useState(true);
  const [evidenceOpenKey, setEvidenceOpenKey] = useState<string | null>(null);

  useEffect(() => {
    function refreshStats() {
      const workouts = getWorkoutHistory();
      setStats(getStats(workouts));
    }
    refreshStats();
    window.addEventListener("workoutHistoryChanged", refreshStats);
    return () => window.removeEventListener("workoutHistoryChanged", refreshStats);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setEvidenceOpenKey(null);
    try {
      const allWorkouts = getWorkoutHistory();
      const result = buildCoachStructuredAnalysis(allWorkouts, {
        focus,
        experienceLevel,
        goal,
        unit,
      });
      if (!cancelled) setAnalysis(result);
    } finally {
      if (!cancelled) setIsLoading(false);
    }
    return () => {
      cancelled = true;
    };
  }, [focus, experienceLevel, goal, unit]);

  const hasRichAnalysis =
    Boolean(analysis.keyFocus) ||
    analysis.whatsGoingWell.length > 0 ||
    analysis.actionableSuggestions.length > 0 ||
    analysis.volumeBalance.length > 0;

  const coachState = useMemo<
    "no_data" | "low_data" | "enough_data" | "strong_progress" | "imbalance_or_plateau"
  >(() => {
    if (stats.totalWorkouts === 0) return "no_data";
    if (stats.totalWorkouts < 3) return "low_data";
    if (analysis.whatsGoingWell.length > 0 && analysis.actionableSuggestions.length === 0) return "strong_progress";
    if (analysis.actionableSuggestions.length > 0) return "imbalance_or_plateau";
    return "enough_data";
  }, [analysis.actionableSuggestions.length, analysis.whatsGoingWell.length, stats.totalWorkouts]);

  const statusBadges = useMemo(() => {
    const tags: { label: string; className: string }[] = [];
    if (coachState === "no_data") tags.push({ label: "Limited data", className: "border-zinc-600/50 bg-zinc-800/80 text-zinc-300" });
    else if (coachState === "low_data") {
      tags.push({ label: "Early signal", className: "border-amber-500/35 bg-amber-950/30 text-amber-100/90" });
      tags.push({ label: "Limited data", className: "border-zinc-600/50 bg-zinc-800/70 text-zinc-300" });
    } else if (coachState === "strong_progress")
      tags.push({ label: "Stable", className: "border-emerald-500/35 bg-emerald-950/25 text-emerald-100/90" });
    else if (coachState === "imbalance_or_plateau")
      tags.push({ label: "Watch", className: "border-amber-500/40 bg-amber-950/35 text-amber-100/90" });
    else tags.push({ label: "Taking shape", className: "border-teal-600/35 bg-teal-950/25 text-teal-100/85" });
    return tags;
  }, [coachState]);

  const sessionsLast28Days = useMemo(() => {
    const all = getWorkoutHistory();
    const cutoff = Date.now() - 28 * 24 * 60 * 60 * 1000;
    return all.filter((w) => new Date(w.completedAt).getTime() >= cutoff).length;
  }, [isLoading, stats.totalWorkouts]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 pb-28">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <Link href="/coach" className="text-app-secondary hover:text-white transition-colors text-sm font-medium">
            ← Coach
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-white">Coach Review</h1>
          <p className="mt-1 text-sm text-app-secondary">Updates each time you open it.</p>
        </header>

        {isLoading ? (
          <section className="rounded-2xl border border-violet-800/40 bg-gradient-to-br from-indigo-950/50 via-zinc-900/90 to-violet-950/20 px-5 py-6 shadow-lg shadow-black/30">
            <p className="text-sm font-semibold text-white">Building your review…</p>
            <p className="mt-1.5 text-sm text-app-secondary">Using your log and your goal.</p>
          </section>
        ) : (
          <>
            {!hasRichAnalysis && (
              <section className="mb-6 rounded-xl border border-teal-800/40 bg-zinc-900/75 px-4 py-4">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {statusBadges.map((b) => (
                    <span
                      key={b.label}
                      className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${b.className}`}
                    >
                      {b.label}
                    </span>
                  ))}
                </div>
                <h2 className="text-base font-bold text-white">Not enough to review yet</h2>
                <p className="mt-1.5 text-sm text-app-secondary leading-snug">
                  {coachState === "no_data"
                    ? "Log a workout first — then this page has something to say."
                    : "Still early. A few more sessions and this tightens up."}
                </p>
                <p className="mt-2 text-[11px] text-app-meta tabular-nums">
                  So far: {stats.totalWorkouts} workouts · {stats.totalSets} sets
                </p>
              </section>
            )}

            {/* Primary: this week’s headline recommendation */}
            {hasRichAnalysis && (
              <section className="relative mb-7 overflow-hidden rounded-2xl border-2 border-teal-500/45 bg-gradient-to-b from-teal-950/50 via-zinc-900/95 to-zinc-950 shadow-[0_20px_50px_-28px_rgba(20,184,166,0.35)] ring-1 ring-teal-400/15">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_85%_60%_at_50%_-20%,rgba(45,212,191,0.14),transparent_55%)]"
                  aria-hidden
                />
                <div className="relative px-4 pb-5 pt-4 sm:px-5 sm:pt-5">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-md border border-teal-400/30 bg-teal-950/40 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-teal-200/90">
                      This week so far
                    </span>
                    {statusBadges.map((b) => (
                      <span
                        key={b.label}
                        className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${b.className}`}
                      >
                        {b.label}
                      </span>
                    ))}
                  </div>

                  {analysis?.nextSessionAdjustmentPlan ? (
                    <>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-300/75">Start here</p>
                      <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white sm:text-[1.65rem] leading-tight">
                        {analysis.nextSessionAdjustmentPlan.title}
                      </h2>
                      <p className="mt-3 text-sm leading-relaxed text-teal-100/85">
                        {analysis.nextSessionAdjustmentPlan.rationale}
                      </p>
                      <div className="mt-4 border-t border-teal-800/40 pt-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-200/65">Your checklist</p>
                        <ol className="mt-2 space-y-2.5">
                          {analysis.nextSessionAdjustmentPlan.adjustments.map((adj, i) => (
                            <li key={i} className="flex gap-3 text-sm text-app-secondary">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-500/20 text-xs font-bold text-teal-100">
                                {i + 1}
                              </span>
                              <span className="min-w-0 pt-0.5 leading-snug">{adj.instruction}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    </>
                  ) : analysis?.keyFocus ? (
                    <>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-300/75">Main thing</p>
                      <h2 className="mt-1 text-xl font-extrabold tracking-tight text-white leading-snug sm:text-2xl">
                        {analysis.keyFocus}
                      </h2>
                      {analysis.keyFocusEvidenceCardIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setEvidenceOpenKey((k) => (k === "keyFocus" ? null : "keyFocus"))}
                          className="mt-3 text-[11px] font-semibold text-teal-400/90 hover:text-teal-300 underline-offset-2 hover:underline"
                          aria-expanded={evidenceOpenKey === "keyFocus"}
                        >
                          {evidenceOpenKey === "keyFocus" ? "Hide" : "Evidence"}
                        </button>
                      )}
                      {evidenceOpenKey === "keyFocus" && analysis.keyFocusEvidenceCardIds.length > 0 && (
                        <div className="mt-3 space-y-2.5 border-t border-teal-800/35 pt-3">
                          {getEvidenceCardsForReferencedIds(analysis.keyFocusEvidenceCardIds).map((card) => (
                            <div key={card.id} className="rounded-lg border border-teal-900/30 bg-black/20 px-3 py-2">
                              <p className="text-xs font-semibold text-white">{card.title}</p>
                              <p className="mt-1 text-[11px] text-app-tertiary leading-relaxed">{card.summary}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl font-bold text-white">No single headline this week</h2>
                      <p className="mt-2 text-sm text-app-secondary">
                        Weekly balance and notes below carry the picture.
                      </p>
                    </>
                  )}
                </div>
              </section>
            )}

            {/* Secondary: supporting context (lighter weight) */}
            {hasRichAnalysis && (
              <section className="mb-6 rounded-xl border border-zinc-800/90 bg-zinc-900/55 px-4 py-4 sm:px-5">
                <div className="mb-4 flex items-end justify-between gap-2 border-b border-zinc-800/70 pb-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">This week so far</p>
                    <h2 className="text-base font-bold text-zinc-200">More from this week</h2>
                  </div>
                  <p className="text-[10px] tabular-nums text-zinc-500">
                    {stats.totalWorkouts} workouts · {stats.totalSets} sets
                  </p>
                </div>

                {analysis?.nextSessionAdjustmentPlan && analysis?.keyFocus && (
                  <div className="mb-4 rounded-lg border border-teal-900/35 bg-teal-950/10 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-200/65">Also worth noting</h3>
                      {analysis.keyFocusEvidenceCardIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setEvidenceOpenKey((k) => (k === "keyFocus" ? null : "keyFocus"))}
                          className="text-[10px] font-semibold text-teal-500/85 hover:text-teal-300 underline-offset-2 hover:underline"
                          aria-expanded={evidenceOpenKey === "keyFocus"}
                        >
                          {evidenceOpenKey === "keyFocus" ? "Hide" : "Evidence"}
                        </button>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm text-app-secondary leading-snug">{analysis.keyFocus}</p>
                    {evidenceOpenKey === "keyFocus" && analysis.keyFocusEvidenceCardIds.length > 0 && (
                      <div className="mt-3 space-y-2 border-t border-teal-900/30 pt-3">
                        {getEvidenceCardsForReferencedIds(analysis.keyFocusEvidenceCardIds).map((card) => (
                          <div key={card.id}>
                            <p className="text-xs font-medium text-white">{card.title}</p>
                            <p className="mt-1 text-[11px] text-app-tertiary leading-relaxed">{card.summary}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {analysis?.whatsGoingWell?.length > 0 && (
                  <div className="mb-4">
                    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200/55">
                      What&apos;s going well
                    </h3>
                    <ul className="space-y-1.5 text-sm text-app-secondary">
                      {analysis.whatsGoingWell.map((item, i) => (
                        <li
                          key={i}
                          className="flex gap-2 rounded-md border border-emerald-900/25 bg-emerald-950/10 px-2.5 py-2 leading-snug"
                        >
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-emerald-400/70" aria-hidden />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis?.volumeBalance?.length > 0 && (
                  <div className="mb-4">
                    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
                      Weekly balance
                    </h3>
                    <ul className="space-y-1.5 text-sm">
                      {analysis.volumeBalance.map((item, i) => (
                        <li key={i} className="rounded-md border border-zinc-800/80 bg-black/15 px-2.5 py-2">
                          <p className="text-xs font-semibold text-zinc-300">{item.label}</p>
                          <p className="mt-0.5 text-[13px] leading-snug text-app-tertiary">{item.summary}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {analysis?.actionableSuggestions?.length > 0 && (
                  <div>
                    <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-200/55">
                      Before changing more
                    </h3>
                    <ul className="space-y-1.5">
                      {analysis.actionableSuggestions.map((item, i) => {
                        const sugKey = `suggestion-${i}`;
                        const ids = analysis.actionableSuggestionEvidenceCardIds[i] ?? [];
                        const hasEvidence = ids.length > 0;
                        return (
                          <li key={i} className="rounded-md border border-zinc-800/70 bg-zinc-950/40 px-2.5 py-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <p className="min-w-0 flex-1 text-[13px] leading-snug text-app-secondary">
                                <span className="mr-1.5 font-mono text-[11px] text-app-meta">{i + 1}.</span>
                                {item}
                              </p>
                              {hasEvidence && (
                                <button
                                  type="button"
                                  onClick={() => setEvidenceOpenKey((k) => (k === sugKey ? null : sugKey))}
                                  className="shrink-0 text-[10px] font-semibold text-teal-500/85 hover:text-teal-300 underline-offset-2 hover:underline"
                                  aria-expanded={evidenceOpenKey === sugKey}
                                >
                                  {evidenceOpenKey === sugKey ? "Hide" : "Evidence"}
                                </button>
                              )}
                            </div>
                            {evidenceOpenKey === sugKey && hasEvidence && (
                              <div className="mt-2 space-y-2 border-t border-zinc-800/60 pt-2">
                                {getEvidenceCardsForReferencedIds(ids).map((card) => (
                                  <div key={card.id}>
                                    <p className="text-xs font-medium text-white">{card.title}</p>
                                    <p className="mt-0.5 text-[11px] text-app-tertiary leading-relaxed">{card.summary}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </section>
            )}

            {/* Trend: longitudinal, distinct from weekly volume bullets */}
            {!isLoading && (
              <section className="mb-5 border-l-2 border-indigo-500/50 bg-indigo-950/[0.12] pl-4 pr-3 py-3.5">
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded border border-indigo-500/25 bg-indigo-950/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-indigo-200/80">
                    4–8 weeks
                  </span>
                  <h2 className="text-sm font-bold text-indigo-100/95">Longer-term read</h2>
                </div>
                <p className="text-[13px] leading-relaxed text-indigo-100/70">
                  {sessionsLast28Days === 0
                    ? "No sessions in the last month. Too early for a real trend — a few steady weeks fix that."
                    : sessionsLast28Days < 6
                      ? `${sessionsLast28Days} session${sessionsLast28Days === 1 ? "" : "s"} in the last month. Thin for a long-term read — keep logging and this sharpens.`
                      : `${sessionsLast28Days} sessions in the last month. Enough rhythm that the pattern means something. Boring consistency usually beats one hero week.`}
                </p>
              </section>
            )}

            {/* Why: compact footer note */}
            {!isLoading && hasRichAnalysis && (
              <section className="rounded-lg border border-dashed border-zinc-700/60 bg-zinc-950/50 px-3 py-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Why this matters</p>
                <p className="mt-1 text-[13px] leading-snug text-app-tertiary">
                  {analysis.nextSessionAdjustmentPlan?.rationale
                    ? `For ${goal}, small weekly shifts usually beat forcing a big overhaul too soon. The block above is what to run with first.`
                    : `This read tracks toward ${goal}. More weeks in the log means less guesswork here.`}
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
