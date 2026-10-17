"use client";

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
