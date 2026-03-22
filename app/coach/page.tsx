"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getWorkoutHistory, getStats } from "@/lib/trainingAnalysis";
import { useUnit } from "@/lib/unit-preference";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";
import { usePriorityGoal, PRIORITY_GOAL_OPTIONS, type PriorityGoal } from "@/lib/priorityGoal";
import {
  buildCoachStructuredAnalysis,
  EMPTY_COACH_STRUCTURED_ANALYSIS,
  type CoachStructuredAnalysis,
} from "@/lib/coachStructuredAnalysis";
import { getEvidenceCardsForReferencedIds } from "@/lib/evidenceMapping";

const EMPTY_ANALYSIS = EMPTY_COACH_STRUCTURED_ANALYSIS;

export default function CoachPage() {
  const { unit, setUnit } = useUnit();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const { goal, setGoal } = usePriorityGoal();
  const [stats, setStats] = useState({
    totalWorkouts: 0,
    totalExercises: 0,
    totalSets: 0,
  });
  const [analysis, setAnalysis] = useState<CoachStructuredAnalysis>(EMPTY_ANALYSIS);
  const [isLoading, setIsLoading] = useState(false);
  /** `keyFocus` | `suggestion-${i}` — which evidence block is expanded */
  const [evidenceOpenKey, setEvidenceOpenKey] = useState<string | null>(null);

  useEffect(() => {
    function refresh() {
      const workouts = getWorkoutHistory();
      setStats(getStats(workouts));
    }
    refresh();
    window.addEventListener("workoutHistoryChanged", refresh);
    return () => window.removeEventListener("workoutHistoryChanged", refresh);
  }, []);

  async function handleAnalyze() {
    const allWorkouts = getWorkoutHistory();
    setIsLoading(true);
    try {
      setEvidenceOpenKey(null);
      const result = buildCoachStructuredAnalysis(allWorkouts, {
        focus,
        experienceLevel,
        goal,
        unit,
      });
      
      console.log("COACH OUTPUT:", result);
      
      setAnalysis(result);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <Link href="/" className="text-app-secondary hover:text-white transition-colors text-sm font-medium">
            ← Home
          </Link>
          <h1 className="text-3xl font-bold text-white">Coach</h1>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center rounded-full border border-teal-900/40 bg-zinc-900/70 p-0.5">
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`min-w-[2.25rem] rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                    unit === u
                      ? "bg-teal-500/25 text-teal-100 shadow-sm shadow-teal-950/30"
                      : "text-app-tertiary hover:text-app-secondary"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium text-app-tertiary">Goal</span>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as PriorityGoal)}
                className="rounded-lg border border-teal-900/40 bg-zinc-900/70 px-2.5 py-1.5 text-[11px] font-medium text-white focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                aria-label="Priority goal"
              >
                {PRIORITY_GOAL_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <section className="card-app mb-6">
          <h2 className="label-section mb-2">Your stats</h2>
          <ul className="space-y-2 text-app-secondary text-sm">
            <li>Total workouts logged: <span className="text-white font-medium">{stats.totalWorkouts}</span></li>
            <li>Total exercises logged: <span className="text-white font-medium">{stats.totalExercises}</span></li>
            <li>Total sets logged: <span className="text-white font-medium">{stats.totalSets}</span></li>
          </ul>
        </section>

        <button
          onClick={handleAnalyze}
          disabled={isLoading}
          className="w-full py-3 rounded-xl btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Analyzing…" : "Analyze Recent Training"}
        </button>

        <div className="card-app mt-6">
          <h2 className="text-lg font-bold text-white mb-4">Analysis</h2>

          {analysis?.keyFocus && (
            <div className="mb-4 rounded-xl border border-teal-700/40 bg-teal-950/25 px-3.5 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <h3 className="label-section">Key Focus</h3>
                {analysis.keyFocusEvidenceCardIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setEvidenceOpenKey((k) => (k === "keyFocus" ? null : "keyFocus"))
                    }
                    className="shrink-0 text-[11px] font-medium text-teal-500/80 hover:text-teal-300 transition-colors underline-offset-2 hover:underline"
                    aria-expanded={evidenceOpenKey === "keyFocus"}
                  >
                    {evidenceOpenKey === "keyFocus" ? "Hide evidence" : "Evidence"}
                  </button>
                )}
              </div>
              <p className="text-sm text-app-secondary">{analysis.keyFocus}</p>
              {evidenceOpenKey === "keyFocus" &&
                analysis.keyFocusEvidenceCardIds.length > 0 && (
                  <div className="mt-3 space-y-3 border-t border-teal-800/35 pt-3">
                    {getEvidenceCardsForReferencedIds(analysis.keyFocusEvidenceCardIds).map(
                      (card) => (
                        <div key={card.id}>
                          <p className="text-xs font-medium text-white">{card.title}</p>
                          <p className="mt-1 text-xs text-app-tertiary leading-relaxed">
                            {card.summary}
                          </p>
                        </div>
                      )
                    )}
                  </div>
                )}
            </div>
          )}

          {analysis?.whatsGoingWell?.length > 0 && (
            <div className="mb-4">
              <h3 className="label-section mb-2">What&apos;s Going Well</h3>
              <ul className="space-y-2 text-app-secondary text-sm">
                {analysis.whatsGoingWell.map((item, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-emerald-900/30 bg-emerald-950/15 px-3 py-2.5"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis?.volumeBalance?.length > 0 && (
            <div className="mb-4">
              <h3 className="label-section mb-2">Volume &amp; Balance</h3>
              <ul className="space-y-2 text-app-secondary text-sm">
                {analysis?.volumeBalance?.map((item, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-teal-900/30 bg-zinc-900/45 px-3 py-2.5"
                  >
                    <p className="text-white font-medium">{item.label}</p>
                    <p className="mt-1 text-app-secondary">{item.summary}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {analysis?.actionableSuggestions?.length > 0 && (
            <div>
              <h3 className="label-section mb-2">Actionable Suggestions</h3>
              <ul className="space-y-2 text-app-secondary text-sm">
                {analysis?.actionableSuggestions?.map((item, i) => {
                  const sugKey = `suggestion-${i}`;
                  const ids = analysis.actionableSuggestionEvidenceCardIds[i] ?? [];
                  const hasEvidence = ids.length > 0;
                  return (
                    <li
                      key={i}
                      className="rounded-lg border border-teal-900/30 bg-zinc-900/45 px-3 py-2.5"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="min-w-0 flex-1 text-sm text-app-secondary">
                          <span className="text-app-meta mr-2">{i + 1}.</span>
                          <span>{item}</span>
                        </p>
                        {hasEvidence && (
                          <button
                            type="button"
                            onClick={() =>
                              setEvidenceOpenKey((k) => (k === sugKey ? null : sugKey))
                            }
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
                              <p className="mt-1 text-xs text-app-tertiary leading-relaxed">
                                {card.summary}
                              </p>
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
      </div>
    </main>
  );
}
