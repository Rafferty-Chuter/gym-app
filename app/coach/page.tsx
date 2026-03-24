"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
const COACH_AUTO_ANALYZE_KEY = "coachAutoAnalyze";

export default function CoachPage() {
  const router = useRouter();
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
  const [coachPrompt, setCoachPrompt] = useState("");

  useEffect(() => {
    function refresh() {
      const workouts = getWorkoutHistory();
      setStats(getStats(workouts));
    }
    refresh();
    window.addEventListener("workoutHistoryChanged", refresh);
    return () => window.removeEventListener("workoutHistoryChanged", refresh);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const shouldAutoAnalyze = sessionStorage.getItem(COACH_AUTO_ANALYZE_KEY) === "1";
    if (!shouldAutoAnalyze) return;
    sessionStorage.removeItem(COACH_AUTO_ANALYZE_KEY);
    handleAnalyze();
  }, [focus, experienceLevel, goal, unit]);

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

  function askCoach(prompt: string) {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("assistantQuickPrompt", prompt);
    }
    router.push("/assistant");
  }

  const hasRichAnalysis =
    Boolean(analysis.keyFocus) ||
    analysis.whatsGoingWell.length > 0 ||
    analysis.actionableSuggestions.length > 0 ||
    analysis.volumeBalance.length > 0;

  const summaryPositive =
    analysis.whatsGoingWell[0] ??
    `You have logged ${stats.totalWorkouts} sessions so far, which gives the coach a usable training signal.`;
  const summaryWatch =
    analysis.volumeBalance[0]?.summary ??
    analysis.actionableSuggestions[0] ??
    "Training distribution is still emerging. Keep logging sessions to unlock sharper recommendations.";
  const summaryNext =
    analysis.nextSessionAdjustmentPlan?.title ??
    analysis.actionableSuggestions[0] ??
    "Run one focused session, then re-open Coach for a clearer next-step recommendation.";

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

        <section className="card-app mb-6 border-indigo-900/35 bg-gradient-to-br from-indigo-950/30 via-zinc-900/92 to-violet-950/20">
          <h2 className="label-section mb-3 text-indigo-200/75">Coach Summary</h2>
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-900/30 bg-emerald-950/15 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-200/75">Positive</p>
              <p className="mt-1 text-sm text-app-secondary">{summaryPositive}</p>
            </div>
            <div className="rounded-xl border border-amber-900/35 bg-amber-950/15 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-200/75">Watch Item</p>
              <p className="mt-1 text-sm text-app-secondary">{summaryWatch}</p>
            </div>
            <div className="rounded-xl border border-teal-900/35 bg-zinc-900/65 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-teal-200/75">Next Step</p>
              <p className="mt-1 text-sm text-app-secondary">{summaryNext}</p>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            onClick={handleAnalyze}
            disabled={isLoading}
            className="w-full py-3 rounded-xl btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Analyzing…" : "Analyze Recent Training"}
          </button>
          <Link
            href="/assistant"
            className="w-full py-3 rounded-xl border border-teal-900/35 bg-zinc-900/70 text-sm font-semibold text-app-secondary text-center transition hover:text-white hover:border-teal-500/30"
          >
            Ask the Coach
          </Link>
        </div>

        {!hasRichAnalysis && !isLoading && (
          <section className="card-app mt-6 border-teal-900/35 bg-zinc-900/80">
            <h2 className="label-section mb-2">Coach is ready</h2>
            <p className="text-sm text-app-secondary">
              Keep logging workouts and run analysis to get weekly coaching direction, trend insights, and clearer next steps.
            </p>
            <p className="mt-2 text-xs text-app-meta">
              Current signal: {stats.totalWorkouts} workouts · {stats.totalSets} sets logged.
            </p>
          </section>
        )}

        <div className="card-app mt-6">
          <h2 className="text-lg font-bold text-white mb-4">This Week</h2>

          {analysis?.nextSessionAdjustmentPlan && (
            <div className="mb-6 rounded-2xl border border-teal-600/45 bg-gradient-to-b from-teal-900/35 to-zinc-900/65 px-4 py-4">
              <h3 className="text-xl font-bold text-white tracking-tight mb-2.5">Next Session</h3>
              <div className="rounded-xl border border-teal-700/35 bg-zinc-900/40 px-3.5 py-3">
                <p className="text-white font-semibold text-base">
                  {analysis.nextSessionAdjustmentPlan.title}
                </p>
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
              <h3 className="label-section mb-2 text-app-tertiary">Volume Balance</h3>
              <ul className="space-y-2 text-app-tertiary text-sm">
                {analysis?.volumeBalance?.map((item, i) => (
                  <li
                    key={i}
                    className="rounded-lg border border-zinc-800/70 bg-zinc-900/35 px-3 py-2.5"
                  >
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

        <div className="card-app mt-6">
          <h2 className="text-lg font-bold text-white mb-4">Trend</h2>
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
              Trend signals will improve as you log more sessions over the next 4-8 weeks.
            </p>
          )}
        </div>

        <div className="card-app mt-6">
          <h2 className="text-lg font-bold text-white mb-4">Ask the Coach</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
            <button
              type="button"
              onClick={() => askCoach("What is the single highest-impact adjustment I should make this week?")}
              className="rounded-xl border border-teal-900/35 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-app-secondary text-left transition hover:text-white hover:border-teal-500/30"
            >
              Highest-impact weekly change
            </button>
            <button
              type="button"
              onClick={() => askCoach("Build my next 2 sessions from this analysis and explain progression targets.")}
              className="rounded-xl border border-teal-900/35 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-app-secondary text-left transition hover:text-white hover:border-teal-500/30"
            >
              Plan next 2 sessions
            </button>
            <button
              type="button"
              onClick={() => askCoach("Explain why this recommendation matters for my stated goal right now.")}
              className="rounded-xl border border-teal-900/35 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-app-secondary text-left transition hover:text-white hover:border-teal-500/30"
            >
              Why this matters now
            </button>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={coachPrompt}
              onChange={(e) => setCoachPrompt(e.target.value)}
              placeholder="Ask a specific coaching question..."
              className="input-app flex-1 px-3 py-2.5 text-sm"
            />
            <button
              type="button"
              onClick={() => askCoach(coachPrompt.trim() || "Review my training and give me the clearest next step.")}
              className="rounded-xl btn-primary px-4 py-2.5 text-sm font-semibold"
            >
              Ask
            </button>
          </div>
        </div>

        <div className="card-app mt-6 mb-20">
          <h2 className="text-lg font-bold text-white mb-2">Why This Matters</h2>
          <p className="text-sm text-app-secondary">
            {analysis.nextSessionAdjustmentPlan?.rationale ??
              `Your current goal is "${goal}". Consistent weekly adjustments compound faster than one-off perfect sessions.`}
          </p>
        </div>
      </div>
    </main>
  );
}
