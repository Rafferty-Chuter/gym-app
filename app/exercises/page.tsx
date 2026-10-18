"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/ui/PageHeader";
import { Caption, Chevron } from "@/components/physique/ui";
import { exerciseSubtitle } from "@/components/training/ExercisePickerSheet";
import { exerciseHref } from "@/components/training/WorkoutViews";
import { getExerciseById, getExerciseByName, sameExercise, searchExercises } from "@/lib/exerciseLibrary";
import { useWorkouts } from "@/lib/physique/io/workouts";
import { loggedExercises } from "@/lib/training/exerciseHistory";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";

/** Library matches shown under a search, after the logged ones. OURS: enough to find one, not a catalogue dump. */
const LIBRARY_MATCHES_SHOWN = 12;

function shortDate(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "";
}

function matches(name: string, q: string): boolean {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const n = name.toLowerCase();
  return words.every((w) => n.includes(w));
}

/**
 * Every exercise you have logged (TR7, after Strong's Exercises tab), most
 * recent first, each opening its chart, records and sessions. A search
 * also lists library exercises you have not logged yet.
 */
export default function ExercisesPage() {
  const hydrated = useIsHydrated();
  const workouts = useWorkouts();
  const [query, setQuery] = useState("");
  const logged = useMemo(() => loggedExercises(workouts), [workouts]);
  const q = query.trim();
  const found = useMemo(() => (q ? searchExercises(q) : []), [q]);
  const shownLogged = useMemo(() => (q ? logged.filter((e) => matches(e.name, q) || found.some((x) => sameExercise({ name: x.name, exerciseId: x.id }, e))) : logged), [logged, q, found]);
  const library = useMemo(() => found.filter((x) => !logged.some((e) => sameExercise({ name: x.name, exerciseId: x.id }, e))).slice(0, LIBRARY_MATCHES_SHOWN), [logged, found]);

  if (!hydrated) return <main className="min-h-screen" style={{ background: "var(--page)" }} />;

  const row = (key: string, href: string, name: string, sub: string, value?: string) => (
    <li key={key}>
      <Link href={href} className="flex min-h-[56px] w-full items-center gap-3 px-4 py-2 transition-colors active:bg-[var(--surface-raised)]">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px]" style={{ color: "var(--text)" }}>
            {name}
          </span>
          <span className="truncate text-[12px]" style={{ color: "var(--text-tertiary)" }}>
            {sub}
          </span>
        </span>
        {value && (
          <span className="shrink-0 text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {value}
          </span>
        )}
        <Chevron />
      </Link>
    </li>
  );

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 sm:px-6">
        <PageHeader back={{ href: "/train", label: "Train" }} title="Exercises" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search exercises"
          aria-label="Search exercises"
          className="h-[40px] w-full rounded-[10px] px-3 text-[15px] outline-none placeholder:text-[var(--text-tertiary)]"
          style={{ background: "var(--surface-raised)", color: "var(--text)" }}
        />

        {logged.length === 0 && !q ? (
          <p className="text-[15px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            Exercises you log show here, each with its chart, records and past sessions. Search to look one up now.
          </p>
        ) : (
          <section className="flex flex-col gap-2">
            <Caption>{q ? `Logged · ${shownLogged.length}` : `Logged · ${logged.length}`}</Caption>
            {shownLogged.length === 0 ? (
              <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                Nothing logged matches &ldquo;{q}&rdquo;.
              </p>
            ) : (
              <ul className="overflow-hidden rounded-[12px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }}>
                {shownLogged.map((e) => {
                  const meta = (e.exerciseId ? getExerciseById(e.exerciseId) : null) ?? getExerciseByName(e.name);
                  return row(`l-${e.name}`, exerciseHref(e), e.name, `${exerciseSubtitle(meta)} · ${e.sessions} ${e.sessions === 1 ? "session" : "sessions"}`, shortDate(e.lastAt));
                })}
              </ul>
            )}
          </section>
        )}

        {library.length > 0 && (
          <section className="flex flex-col gap-2">
            <Caption>Not logged yet</Caption>
            <ul className="overflow-hidden rounded-[12px] divide-y divide-[var(--border)]" style={{ background: "var(--surface)" }}>
              {library.map((x) => row(`x-${x.id}`, exerciseHref({ name: x.name, exerciseId: x.id }), x.name, exerciseSubtitle(x)))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
