"use client";

import type { AskSubject } from "@/lib/physique/askAbout";

/**
 * Hand a prefilled prompt to the assistant page. Mirrors Home's
 * `openAssistantWith`: the page reads `assistantQuickPrompt` and sends it
 * when `assistantAutoSend` is set; the query string is the fallback.
 */
export function assistantHrefFor(prompt: string): string {
  return `/assistant?q=${encodeURIComponent(prompt)}`;
}

export function stashAssistantPrompt(prompt: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    sessionStorage.setItem("assistantQuickPrompt", prompt);
    sessionStorage.setItem("assistantAutoSend", "1");
    return true;
  } catch {
    return false;
  }
}

/** Session key for what "Ask the coach why" was tapped on (PR3f); the assistant page sends it with the question. */
export const ASSISTANT_SUBJECT_KEY = "assistantSubject";

/** Hand a question and the connection or finding it is about to the assistant page, which sends both. */
export function stashAssistantAsk(prompt: string, subject: AskSubject): boolean {
  if (!stashAssistantPrompt(prompt)) return false;
  try {
    sessionStorage.setItem(ASSISTANT_SUBJECT_KEY, JSON.stringify(subject));
    return true;
  } catch {
    return false;
  }
}

/** Read and clear the stashed subject; null when absent or not the right shape. */
export function takeAssistantSubject(): AskSubject | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ASSISTANT_SUBJECT_KEY);
    sessionStorage.removeItem(ASSISTANT_SUBJECT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as AskSubject;
    return (v.kind === "connection" || v.kind === "finding") && typeof v.title === "string" && Array.isArray(v.facts) && v.facts.every((f) => typeof f === "string") ? v : null;
  } catch {
    return null;
  }
}
