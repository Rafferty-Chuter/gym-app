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

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 pb-28">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <Link href="/coach" className="text-app-secondary hover:text-white transition-colors text-sm font-medium">
            ← Coach
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-white">Coach Review</h1>
          <p className="mt-1 text-sm text-app-secondary">
            Full structured read on your week, trends, and next steps — refreshed when you open this screen.
          </p>
        </header>

        {isLoading ? (
          <section className="card-app border-violet-900/35 bg-gradient-to-br from-indigo-950/40 via-zinc-900/92 to-violet-950/25">
            <p className="text-sm font-semibold text-white">Running Coach Review…</p>
            <p className="mt-2 text-sm text-app-secondary">Crunching your training history and goals.</p>
          </section>
        ) : (
          <>
            {!hasRichAnalysis && (
              <section className="card-app mb-6 border-teal-900/35 bg-zinc-900/80">
                <h2 className="label-section mb-2">Coach is ready</h2>
                <p className="text-sm text-app-secondary">
                  {coachState === "no_data"
                    ? "Log your first workout to unlock a personalized Coach Review."
                    : "Log another 1-2 sessions and rerun Coach Review to increase recommendation confidence."}
                </p>
                <p className="mt-2 text-xs text-app-meta">
                  Current signal: {stats.totalWorkouts} workouts · {stats.totalSets} sets logged.
                </p>
              </section>
            )}

            <div className="card-app mb-6">
              <h2 className="text-lg font-bold text-white mb-4">This Week</h2>

              {analysis?.nextSessionAdjustmentPlan && (
                <div className="mb-6 rounded-2xl border border-teal-600/45 bg-gradient-to-b from-teal-900/35 to-zinc-900/65 px-4 py-4">
                  <h3 className="text-xl font-bold text-white tracking-tight mb-2.5">Next Session</h3>
                  <div className="rounded-xl border border-teal-700/35 bg-zinc-900/40 px-3.5 py-3">
                    <p className="text-white font-semibold text-base">{analysis.nextSessionAdjustmentPlan.title}</p>
                    <p className="mt-2 text-sm text-app-secondary leading-relaxed">
                      {analysis.nextSessionAdjustmentPlan.rationale}
                    </p>
                    <ul className="mt-3.5 space-y-2 text-sm text-app-secondary list-disc pl-4 marker:text-teal-500/90">
                      {analysis.nextSessionAdjustmentPlan.adjustments.map((adj, i) => (
                        <li key={i}>{adj.instruction}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {analysis?.keyFocus && (
                <div className="mb-4 rounded-xl border border-teal-700/40 bg-teal-950/25 px-3.5 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                    <h3 className="label-section">Key Focus</h3>
                    {analysis.keyFocusEvidenceCardIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setEvidenceOpenKey((k) => (k === "keyFocus" ? null : "keyFocus"))}
                        className="shrink-0 text-[11px] font-medium text-teal-500/80 hover:text-teal-300 transition-colors underline-offset-2 hover:underline"
                        aria-expanded={evidenceOpenKey === "keyFocus"}
                      >
                        {evidenceOpenKey === "keyFocus" ? "Hide evidence" : "Evidence"}
                      </button>
                    )}
                  </div>
                  <p className="text-sm text-app-secondary">{analysis.keyFocus}</p>
                  {evidenceOpenKey === "keyFocus" && analysis.keyFocusEvidenceCardIds.length > 0 && (
                    <div className="mt-3 space-y-3 border-t border-teal-800/35 pt-3">
                      {getEvidenceCardsForReferencedIds(analysis.keyFocusEvidenceCardIds).map((card) => (
                        <div key={card.id}>
                          <p className="text-xs font-medium text-white">{card.title}</p>
                          <p className="mt-1 text-xs text-app-tertiary leading-relaxed">{card.summary}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {analysis?.whatsGoingWell?.length > 0 && (
                <div className="mb-4">
                  <h3 className="label-section mb-2">What&apos;s Going Well</h3>
                  <ul className="space-y-2 text-app-secondary text-sm">
                    {analysis.whatsGoingWell.map((item, i) => (
                      <li key={i} className="rounded-lg border border-emerald-900/30 bg-emerald-950/15 px-3 py-2.5">
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis?.volumeBalance?.length > 0 && (
                <div className="mb-4">
                  <h3 className="label-section mb-2 text-app-tertiary">Volume Balance</h3>
                  <ul className="space-y-2 text-app-tertiary text-sm">
                    {analysis.volumeBalance.map((item, i) => (
                      <li key={i} className="rounded-lg border border-zinc-800/70 bg-zinc-900/35 px-3 py-2.5">
                        <p className="text-app-secondary font-medium">{item.label}</p>
                        <p className="mt-1 text-app-tertiary">{item.summary}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis?.actionableSuggestions?.length > 0 && (
                <div>
                  <h3 className="label-section mb-2">Next Step Recommendations</h3>
                  <ul className="space-y-2 text-app-secondary text-sm">
                    {analysis.actionableSuggestions.map((item, i) => {
                      const sugKey = `suggestion-${i}`;
                      const ids = analysis.actionableSuggestionEvidenceCardIds[i] ?? [];
                      const hasEvidence = ids.length > 0;
                      return (
                        <li key={i} className="rounded-lg border border-teal-900/30 bg-zinc-900/45 px-3 py-2.5">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="min-w-0 flex-1 text-sm text-app-secondary">
                              <span className="text-app-meta mr-2">{i + 1}.</span>
                              <span>{item}</span>
                            </p>
                            {hasEvidence && (
                              <button
                                type="button"
                                onClick={() => setEvidenceOpenKey((k) => (k === sugKey ? null : sugKey))}
                                className="shrink-0 text-[11px] font-medium text-teal-500/80 hover:text-teal-300 transition-colors underline-offset-2 hover:underline"
                                aria-expanded={evidenceOpenKey === sugKey}
                              >
                                {evidenceOpenKey === sugKey ? "Hide evidence" : "Evidence"}
                              </button>
                            )}
                          </div>
                          {evidenceOpenKey === sugKey && hasEvidence && (
                            <div className="mt-3 space-y-3 border-t border-teal-900/40 pt-3">
                              {getEvidenceCardsForReferencedIds(ids).map((card) => (
                                <div key={card.id}>
                                  <p className="text-xs font-medium text-white">{card.title}</p>
                                  <p className="mt-1 text-xs text-app-tertiary leading-relaxed">{card.summary}</p>
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
            </div>

            <div className="card-app mb-6">
              <h2 className="text-lg font-bold text-white mb-4">Trend (4-8 weeks)</h2>
              {analysis.volumeBalance.length > 0 ? (
                <ul className="space-y-2 text-sm">
                  {analysis.volumeBalance.slice(0, 3).map((item, i) => (
                    <li key={`${item.label}-${i}`} className="rounded-lg border border-zinc-800/70 bg-zinc-900/35 px-3 py-2.5">
                      <p className="text-app-secondary font-medium">{item.label}</p>
                      <p className="mt-1 text-app-tertiary">{item.summary}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-app-secondary">
                  Trend signals are limited right now. Keep logging for the next few weeks to detect progress or plateaus
                  reliably.
                </p>
              )}
            </div>

            <div className="card-app mb-4">
              <h2 className="text-lg font-bold text-white mb-2">Why This Matters</h2>
              <p className="text-sm text-app-secondary">
                {analysis.nextSessionAdjustmentPlan?.rationale ??
                  `Your current goal is "${goal}". Consistent weekly adjustments compound faster than one-off perfect sessions.`}
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
