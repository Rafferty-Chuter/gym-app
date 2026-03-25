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

const EMPTY_ANALYSIS = EMPTY_COACH_STRUCTURED_ANALYSIS;

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
  const [coachPrompt, setCoachPrompt] = useState("");

  useEffect(() => {
    function refresh() {
      const workouts = getWorkoutHistory();
      setStats(getStats(workouts));
      setAnalysis(
        buildCoachStructuredAnalysis(workouts, {
          focus,
          experienceLevel,
          goal,
          unit,
        })
      );
    }
    refresh();
    window.addEventListener("workoutHistoryChanged", refresh);
    return () => window.removeEventListener("workoutHistoryChanged", refresh);
  }, [focus, experienceLevel, goal, unit]);

  function askCoach(prompt: string) {
    const cleaned = prompt.trim();
    if (typeof window !== "undefined") {
      if (cleaned) {
        sessionStorage.setItem("assistantQuickPrompt", cleaned);
        sessionStorage.setItem("assistantAutoSend", "1");
      } else {
        sessionStorage.removeItem("assistantQuickPrompt");
        sessionStorage.removeItem("assistantAutoSend");
      }
    }
    router.push("/assistant");
  }

  const hasPositiveLine = Boolean(analysis.whatsGoingWell[0]);
  const summaryPositive =
    analysis.whatsGoingWell[0] ??
    (stats.totalWorkouts >= 3
      ? `You’ve got ${stats.totalWorkouts} sessions in the log — enough to see real patterns.`
      : "We’re still painting the picture. A few more logged sessions and this section gets much more useful.");
  const summaryWatch =
    analysis.volumeBalance[0]?.summary ??
    analysis.actionableSuggestions[0] ??
    (stats.totalWorkouts === 0
      ? "Log a workout and I’ll call out what stands out in how you’re training."
      : "Your training mix is still taking shape — keep logging and I’ll keep this sharper.");
  const summaryNext =
    analysis.nextSessionAdjustmentPlan?.title ??
    analysis.actionableSuggestions[0] ??
    (stats.totalWorkouts < 3
      ? "Log another session or two, then open your full review for a stronger next step."
      : "Finish your next solid session, then check the full review for the adjustment I’d make.");

  return (
    <main className="min-h-screen bg-zinc-950 text-white p-6 pb-28">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
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

        <section className="card-app mb-5 border-indigo-900/35 bg-gradient-to-br from-indigo-950/30 via-zinc-900/92 to-violet-950/20">
          <h2 className="label-section mb-3 text-indigo-200/75">Recent Training Review</h2>
          <div className="space-y-3">
            <div
              className={`rounded-xl px-3 py-2.5 ${
                hasPositiveLine
                  ? "border border-emerald-900/30 bg-emerald-950/15"
                  : "border border-zinc-700/60 bg-zinc-900/45"
              }`}
            >
              <p
                className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${
                  hasPositiveLine ? "text-emerald-200/75" : "text-zinc-400/85"
                }`}
              >
                {hasPositiveLine ? "What’s working" : "Training snapshot"}
              </p>
              <p className="mt-1 text-sm text-app-secondary leading-relaxed">{summaryPositive}</p>
            </div>
            <div className="rounded-xl border border-amber-900/35 bg-amber-950/15 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-amber-200/75">Worth watching</p>
              <p className="mt-1 text-sm text-app-secondary leading-relaxed">{summaryWatch}</p>
            </div>
            <div className="rounded-xl border border-teal-900/35 bg-zinc-900/65 px-3 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-teal-200/75">Next focus</p>
              <p className="mt-1 text-sm text-app-secondary leading-relaxed">{summaryNext}</p>
            </div>
          </div>
          <div className="mt-4 border-t border-indigo-800/30 pt-4">
            <Link
              href="/coach/review"
              className="flex w-full items-center justify-center rounded-lg border border-violet-500/35 bg-indigo-950/40 py-2.5 text-center text-sm font-semibold text-violet-100 shadow-sm shadow-black/25 transition hover:border-violet-400/45 hover:bg-indigo-900/45 active:translate-y-[0.5px]"
            >
              Open Full Review
            </Link>
            <p className="mt-2 text-center text-[11px] text-app-meta leading-snug">
              Detailed breakdown, evidence, and next steps on one screen.
            </p>
          </div>
        </section>

        <section className="mt-2 rounded-2xl border border-teal-300/35 bg-gradient-to-br from-teal-500/18 via-zinc-900/94 to-cyan-500/12 p-5 shadow-[0_18px_44px_-14px_rgba(20,184,166,0.35)] sm:p-6">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-teal-200/75">Assistant</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white">Ask the Coach</h2>
          <p className="mt-1 text-sm text-app-secondary">
            Get direct, tailored coaching from your current training data and goals.
          </p>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => askCoach("What is the single highest-impact adjustment I should make this week, given my current data confidence?")}
              className="rounded-xl border border-teal-900/35 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-app-secondary text-left transition hover:text-white hover:border-teal-500/30"
            >
              Highest-impact weekly change
            </button>
            <button
              type="button"
              onClick={() => askCoach("Build my next 2 sessions from this coach review and explain progression targets.")}
              className="rounded-xl border border-teal-900/35 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-app-secondary text-left transition hover:text-white hover:border-teal-500/30"
            >
              Plan next 2 sessions
            </button>
            <button
              type="button"
              onClick={() => askCoach("Explain why this recommendation matters for my stated goal and current training state.")}
              className="rounded-xl border border-teal-900/35 bg-zinc-900/70 px-3 py-2 text-xs font-semibold text-app-secondary text-left transition hover:text-white hover:border-teal-500/30"
            >
              Why this matters now
            </button>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              type="text"
              value={coachPrompt}
              onChange={(e) => setCoachPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  askCoach(coachPrompt);
                }
              }}
              placeholder="Ask a specific coaching question..."
              className="input-app flex-1 px-3 py-3 text-sm"
            />
            <button
              type="button"
              onClick={() => askCoach(coachPrompt)}
              className="rounded-xl bg-gradient-to-br from-teal-400 via-teal-500 to-cyan-500 px-5 py-3 text-sm font-bold text-zinc-950 shadow-[0_8px_24px_-12px_rgba(20,184,166,0.6)] transition hover:brightness-105 active:translate-y-[1px]"
            >
              Ask Coach
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
