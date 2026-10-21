// ── Feedback form (TR4) ──

/**
 * The feedback form's address, or null when it shouldn't be offered. Only an
 * http(s) URL counts: a blank, whitespace or mistyped variable hides every
 * "Send feedback" entry instead of showing one that goes nowhere.
 */
export function feedbackUrlFrom(raw: string | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The tester feedback form (a Tally form, FT6), read once at build time.
 * Profile, Support and the error screen (TR3) use this, never the variable
 * directly. The literal `process.env.NEXT_PUBLIC_…` reference is what lets
 * Next inline it into the client bundle.
 */
export const FEEDBACK_URL: string | null = feedbackUrlFrom(process.env.NEXT_PUBLIC_TALLY_FEEDBACK_URL);
