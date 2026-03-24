"use client";

import { useState } from "react";
import Link from "next/link";

export type CoachInsight = {
  mainInsight: string;
  supportingData: string;
  nextAction: string;
  whyItMatters: string;
  whatToDo: string;
  howHard?: string;
};

type CoachInsightCardProps = {
  insight: CoachInsight;
  onAskCoach?: () => void;
  onStartSession?: () => void;
  startLabel?: string;
};

export default function CoachInsightCard({
  insight,
  onAskCoach,
  onStartSession,
  startLabel = "Start Session",
}: CoachInsightCardProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section className="rounded-2xl border border-teal-950/40 bg-gradient-to-br from-zinc-900 from-[42%] to-teal-950/35 p-5 shadow-lg shadow-black/50">
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full text-left"
        aria-expanded={expanded}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-home-tertiary">
          Coach Insight
        </p>
        <h2 className="mt-1.5 text-lg font-bold text-white">{insight.mainInsight}</h2>
        <p className="mt-2 text-sm text-home-secondary">{insight.supportingData}</p>
        <p className="mt-1 text-sm text-teal-200">{insight.nextAction}</p>
      </button>

      <div className="mt-4 flex flex-wrap gap-2">
        {onStartSession ? (
          <button
            type="button"
            onClick={onStartSession}
            className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold"
          >
            {startLabel}
          </button>
        ) : (
          <Link href="/workout" className="btn-primary px-4 py-2 rounded-xl text-sm font-semibold">
            {startLabel}
          </Link>
        )}
        <button
          type="button"
          onClick={() => {
            setExpanded((prev) => !prev);
          }}
          className="px-4 py-2 rounded-xl border border-teal-900/40 bg-zinc-900/70 text-sm text-app-secondary hover:text-white hover:border-teal-500/30 transition"
        >
          Why this?
        </button>
        <button
          type="button"
          onClick={() => onAskCoach?.()}
          className="px-4 py-2 rounded-xl border border-teal-900/40 bg-zinc-900/70 text-sm text-app-secondary hover:text-white hover:border-teal-500/30 transition"
        >
          Ask the Coach
        </button>
      </div>

      {expanded && (
        <div className="mt-4 rounded-xl border border-teal-900/35 bg-zinc-900/70 p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-home-tertiary">
            Why it matters
          </p>
          <p className="text-sm text-home-secondary">{insight.whyItMatters}</p>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-home-tertiary pt-1">
            What to do
          </p>
          <p className="text-sm text-home-secondary">{insight.whatToDo}</p>
          {insight.howHard && (
            <>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-home-tertiary pt-1">
                How hard
              </p>
              <p className="text-sm text-home-secondary">{insight.howHard}</p>
            </>
          )}
        </div>
      )}
    </section>
  );
}
