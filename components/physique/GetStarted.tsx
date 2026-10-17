"use client";

import { useMemo } from "react";
import { createSingleton } from "@/lib/storage/repo";
import { useSingleton } from "@/lib/storage/useStored";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useBodyData } from "@/lib/physique/io/bodyData";
import { usePushLink } from "@/lib/physique/io/pushLink";
import { getStoredTemplates } from "@/lib/templateStorage";
import { Chevron } from "@/components/physique/ui";

export type OnboardingState = { dismissedAt: string };

/** Hidden by hand; the card also goes on its own once every step is done. */
export const onboardingStore = createSingleton<OnboardingState>("physique.v1.onboarding");

type Step = { key: "weigh" | "goal" | "food" | "routine" | "reminders"; title: string; sub: string; href: string; done: boolean };

/**
 * The first-run path on Home (B7): five steps, each one tap, each ticked
 * from the data itself. No welcome screen, no tour: the app is the tour.
 * Goes away when all five are done or when hidden.
 */
export default function GetStarted() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const data = useBodyData();
  const link = usePushLink();
  const state = useSingleton(onboardingStore);
  const templates = useMemo(() => (hydrated ? getStoredTemplates().length : 0), [hydrated]);
  if (!hydrated || !now || state?.dismissedAt) return null;

  const steps: Step[] = [
    { key: "weigh", title: "Weigh in", sub: "The trend starts with one entry. Mornings, after the bathroom.", href: `/body?date=${now.today}`, done: data.weighIns.length > 0 },
    { key: "goal", title: "Set a goal", sub: "Targets and the verdict come from it.", href: "/body/goal", done: data.goal != null },
    { key: "food", title: "Log a food", sub: "Search, scan a barcode, or describe a meal.", href: "/food?log=1", done: data.foodEntries.length > 0 },
    { key: "routine", title: "Build a routine", sub: "Start workout then logs it set by set.", href: "/templates/new", done: templates > 0 },
    { key: "reminders", title: "Turn on reminders", sub: "One a day, only when a day is missing.", href: "/profile", done: link?.enabled === true },
  ];
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <section className="rounded-[12px] p-4" style={{ background: "#141416", border: "1px solid #2a2a2e" }} aria-label="Get started">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76", fontVariantNumeric: "tabular-nums" }}>
          Get started · {done} of {steps.length} done
        </span>
        <button type="button" onClick={() => void onboardingStore.set({ dismissedAt: new Date().toISOString() })} className="text-[12px] font-medium" style={{ color: "#6f6f76" }} aria-label="Hide the get started steps">
          Hide
        </button>
      </div>
      <ol className="flex flex-col">
        {steps.map((s) => (
          <li key={s.key}>
            {/* Plain anchors: the Body and Food tabs read the query in a state initialiser, which a soft navigation would miss. */}
            <a href={s.href} className="flex items-center gap-3 rounded-[10px] px-1 py-2.5 transition-colors active:bg-[#1d1d20]" aria-label={`${s.title}${s.done ? ", done" : ""}. ${s.sub}`}>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: s.done ? "#00e5b0" : "transparent", border: s.done ? "none" : "1.5px solid #3a3a40" }} aria-hidden>
                {s.done && (
                  <svg viewBox="0 0 24 24" fill="none" stroke="#0a0a0b" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[15px] font-semibold" style={{ color: s.done ? "#a3a3a8" : "#f2f2f0", textDecoration: s.done ? "line-through" : "none" }}>
                  {s.title}
                </span>
                {!s.done && (
                  <span className="text-[12px]" style={{ color: "#a3a3a8" }}>
                    {s.sub}
                  </span>
                )}
              </span>
              {!s.done && <Chevron />}
            </a>
          </li>
        ))}
      </ol>
    </section>
  );
}
