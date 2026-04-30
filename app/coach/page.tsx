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
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);

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
      ? `You've got ${stats.totalWorkouts} sessions in the log — enough to see real patterns.`
      : "We're still painting the picture. A few more logged sessions and this section gets much more useful.");
  const summaryWatch =
    analysis.volumeBalance[0]?.summary ??
    analysis.actionableSuggestions[0] ??
    (stats.totalWorkouts === 0
      ? "Log a workout and I'll call out what stands out in how you're training."
      : "Your training mix is still taking shape — keep logging and I'll keep this sharper.");
  const summaryNext =
    analysis.nextSessionAdjustmentPlan?.title ??
    analysis.actionableSuggestions[0] ??
    (stats.totalWorkouts < 3
      ? "Log another session or two, then open your full review for a stronger next step."
      : "Finish your next solid session, then check the full review for the adjustment I'd make.");

  const insights = [
    {
      tag: hasPositiveLine ? "What's working" : "Training snapshot",
      tagColor: hasPositiveLine ? "#6ee7b7" : "rgba(140,200,196,0.60)",
      tagBg: hasPositiveLine ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)",
      tagBorder: hasPositiveLine ? "rgba(52,211,153,0.20)" : "rgba(255,255,255,0.08)",
      text: summaryPositive,
    },
    {
      tag: "Worth watching",
      tagColor: "#fbbf24",
      tagBg: "rgba(251,191,36,0.07)",
      tagBorder: "rgba(251,191,36,0.18)",
      text: summaryWatch,
    },
    {
      tag: "Next focus",
      tagColor: "#00e5b0",
      tagBg: "rgba(0,229,176,0.07)",
      tagBorder: "rgba(0,229,176,0.18)",
      text: summaryNext,
    },
  ];

  const quickPrompts = [
    {
      label: "Highest-impact weekly change",
      prompt: "What is the single highest-impact adjustment I should make this week, given my current data confidence?",
    },
    {
      label: "Plan next 2 sessions",
      prompt: "Build my next 2 sessions from this coach review and explain progression targets.",
    },
    {
      label: "Why this matters now",
      prompt: "Explain why this recommendation matters for my stated goal and current training state.",
    },
  ];

  return (
    <main className="min-h-screen bg-zinc-950 text-white pb-28">
      <div className="max-w-2xl mx-auto">

        {/* ── Header ──────────────────────────────── */}
        <div className="px-6 pt-6 pb-0 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="label-section mb-1" style={{ color: "rgba(0,229,176,0.65)" }}>
              Training intelligence
            </p>
            <h1 className="text-3xl font-black tracking-tight text-white">Your Coach</h1>
          </div>
          <div className="flex items-center gap-2.5">
            <div
              className="inline-flex items-center rounded-lg border border-white/8 bg-zinc-900/70 p-0.5"
              role="group"
            >
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUnit(u)}
                  className={`min-w-[2.25rem] rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${
                    unit === u
                      ? "bg-[color:var(--color-accent)]/15 text-[color:var(--color-accent)]"
                      : "text-app-tertiary hover:text-app-secondary"
                  }`}
                >
                  {u}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-app-tertiary">Goal</span>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as PriorityGoal)}
                className="rounded-lg border border-white/8 bg-zinc-900/70 px-2 py-1.5 text-[11px] font-medium text-white focus:outline-none focus:ring-1 focus:ring-[color:var(--color-accent)]/40"
                aria-label="Priority goal"
              >
                {PRIORITY_GOAL_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Current assessment ───────────────────── */}
        <section className="px-6 py-7 border-b border-white/5">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] mb-3" style={{ color: "rgba(0,229,176,0.60)" }}>
            Current assessment
          </p>
          <p className="text-xl font-black tracking-tight leading-snug text-white" style={{ textWrap: "pretty" }}>
            {stats.totalWorkouts === 0
              ? "Log your first session."
              : stats.totalWorkouts < 3
              ? "Building your picture."
              : "Strong week — watch the gaps."}
          </p>
          <p className="mt-2.5 text-[15px] text-app-secondary leading-relaxed" style={{ textWrap: "pretty" }}>
            {stats.totalWorkouts === 0
              ? "Start a workout and I'll build a real assessment from your training data."
              : summaryPositive}
          </p>
        </section>

        {/* ── Insight rows ────────────────────────── */}
        <section>
          {insights.map((ins, i) => (
            <div key={i} className="border-b border-white/5">
              <button
                type="button"
                onClick={() => setExpandedInsight(expandedInsight === i ? null : i)}
                className="w-full flex items-start justify-between gap-3 px-6 py-5 text-left"
              >
                <div className="flex-1">
                  <span
                    className="inline-block text-[10px] font-bold uppercase tracking-[0.12em] rounded-md px-2 py-0.5 mb-2.5"
                    style={{ color: ins.tagColor, background: ins.tagBg, border: `1px solid ${ins.tagBorder}` }}
                  >
                    {ins.tag}
                  </span>
                  <p className={`text-sm leading-relaxed transition-colors ${expandedInsight === i ? "text-white" : "text-app-secondary"}`}>
                    {ins.text}
                  </p>
                </div>
                <svg
                  className="h-4 w-4 mt-1 shrink-0 text-app-tertiary transition-transform duration-150"
                  style={{ transform: expandedInsight === i ? "rotate(90deg)" : "none" }}
                  fill="none" stroke="currentColor" strokeWidth="1.75"
                  strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"
                >
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </button>
              {expandedInsight === i && (
                <div className="px-6 pb-5">
                  <p className="text-xs text-app-tertiary leading-relaxed">
                    Based on your logged sessions, training focus, and experience level. Open the full review for the evidence breakdown and specific targets.
                  </p>
                </div>
              )}
            </div>
          ))}
        </section>

        {/* ── Full review CTA ─────────────────────── */}
        <div className="px-6 py-5 border-b border-white/5">
          <Link
            href="/coach/review"
            className="flex w-full items-center justify-center rounded-xl py-3.5 text-sm font-bold transition-all hover:brightness-105 active:translate-y-[0.5px]"
            style={{
              color: "#00e5b0",
              background: "rgba(0,229,176,0.08)",
              border: "1px solid rgba(0,229,176,0.22)",
            }}
          >
            Open full training review →
          </Link>
          <p className="mt-2 text-center text-[11px] text-app-meta">
            Detailed breakdown, evidence, and progression targets.
          </p>
        </div>

        {/* ── Ask the Coach ────────────────────────── */}
        <section className="px-6 pt-6 pb-2">
          <p className="text-sm font-bold text-white mb-4">Ask a question</p>

          <div className="flex flex-col gap-2 mb-4">
            {quickPrompts.map((q) => (
              <button
                key={q.label}
                type="button"
                onClick={() => askCoach(q.prompt)}
                className="rounded-xl px-4 py-3 text-sm font-medium text-app-secondary text-left transition hover:text-white"
                style={{ background: "#0e1420", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                {q.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
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
              placeholder="Ask anything about your training…"
              className="input-app flex-1 px-3 py-3 text-sm"
            />
            <button
              type="button"
              onClick={() => askCoach(coachPrompt)}
              className="rounded-xl px-5 py-3 text-sm font-black transition-all hover:brightness-107 active:translate-y-[1px]"
              style={{
                background: "#00e5b0",
                color: "#001a13",
                boxShadow: "0 4px 0 rgba(0,80,45,0.45), 0 8px 24px -8px rgba(0,229,176,0.55)",
              }}
            >
              Ask
            </button>
          </div>
        </section>

      </div>
    </main>
  );
}
