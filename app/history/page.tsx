"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { SecondaryButton } from "@/components/physique/ui";
import { RecordMark, workoutHref, workoutTitle } from "@/components/training/WorkoutViews";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { routineSummary } from "@/lib/training/routine";
import { formatDuration, formatVolume, groupByMonth, recordsByWorkout, workoutStats } from "@/lib/training/workoutSummary";

function monthKey(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "unknown";
}

function monthLabel(key: string): string {
  if (key === "unknown") return "Undated";
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }).replace(",", "") : "";
}

/**
 * Every finished workout (TR5, after Strong's History): grouped by month,
 * one compact row each with what it added up to and any records. Tapping a
 * row opens the workout. `?w=<completedAt>` links from charts still work.
 */
export default function HistoryPage() {
  const router = useRouter();
  const hydrated = useIsHydrated();
  const workouts = useWorkouts();
  const { unit } = useUnit();
  const u = unit === "lb" ? "lb" : "kg";

  useEffect(() => {
    const w = new URLSearchParams(window.location.search).get("w");
    if (w) window.location.replace(workoutHref({ completedAt: w }));
  }, []);

  const groups = useMemo(() => groupByMonth(workouts, monthKey, monthLabel), [workouts]);
  const records = useMemo(() => recordsByWorkout(workouts), [workouts]);

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption="Train" captionHref="/train" title="History" />

        {!hydrated ? null : workouts.length === 0 ? (
          <div className="flex flex-col items-start gap-3 pt-2">
            <p className="text-[15px] leading-relaxed" style={{ color: "#a3a3a8" }}>
              No workouts yet. Finish one and it shows here, with its sets and any records.
            </p>
            <SecondaryButton onClick={() => router.push("/train")}>Go to Train</SecondaryButton>
          </div>
        ) : (
          groups.map((g) => (
            <section key={g.key} className="flex flex-col gap-2" aria-label={g.label}>
              <p className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
                {g.label} · {g.items.length} {g.items.length === 1 ? "workout" : "workouts"}
              </p>
              <ul className="overflow-hidden rounded-[12px] divide-y divide-[#2a2a2e]" style={{ background: "#141416" }}>
                {g.items.map((w) => {
                  const st = workoutStats(w);
                  const recs = records.get(w.completedAt) ?? [];
                  const meta = [st.durationSec ? formatDuration(st.durationSec) : null, st.volume > 0 ? formatVolume(st.volume, u) : null, `${st.sets} ${st.sets === 1 ? "set" : "sets"}`].filter(Boolean).join(" · ");
                  return (
                    <li key={w.completedAt}>
                      <Link href={workoutHref(w)} className="flex w-full flex-col gap-1 px-4 py-3 transition-colors active:bg-[#1d1d20]">
                        <span className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-[15px] font-semibold" style={{ color: "#f2f2f0" }}>
                            {workoutTitle(w)}
                          </span>
                          <span className="shrink-0 text-[13px]" style={{ color: "#6f6f76" }}>
                            {shortDate(w.completedAt)}
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="truncate text-[13px]" style={{ color: "#a3a3a8", fontVariantNumeric: "tabular-nums" }}>
                            {meta}
                          </span>
                          <RecordMark kinds={recs.map((r) => r.kind)} />
                        </span>
                        <span className="truncate text-[12px]" style={{ color: "#6f6f76" }}>
                          {routineSummary({ exercises: (w.exercises ?? []).map((e) => ({ name: e.name, targetSets: 0 })) })}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
