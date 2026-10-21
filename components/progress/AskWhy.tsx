"use client";

import { useRouter } from "next/navigation";
import { askPrompt, type AskSubject } from "@/lib/physique/askAbout";
import { ASSISTANT_ENABLED } from "@/lib/features";
import { assistantHrefFor, stashAssistantAsk } from "@/lib/ui/assistantPrompt";

/**
 * "Ask the coach why" under an opened connection or finding (PR3f): the
 * cards stay short and the assistant explains, from the engine's own
 * numbers for that item. Hidden while the assistant is parked
 * (`ASSISTANT_ENABLED`, the founder's call of 2026-10-17).
 */
export default function AskWhy({ subject }: { subject: AskSubject }) {
  const router = useRouter();
  if (!ASSISTANT_ENABLED) return null;
  function ask() {
    const prompt = askPrompt(subject);
    router.push(stashAssistantAsk(prompt, subject) ? "/assistant" : assistantHrefFor(prompt));
  }
  return (
    <button type="button" onClick={ask} className="flex h-[32px] w-fit items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold transition-colors active:bg-[var(--surface-raised)]" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      Ask the coach why
    </button>
  );
}
