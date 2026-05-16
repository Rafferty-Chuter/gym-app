// Dev-only console.log. No-op in production builds — Next.js inlines
// process.env.NODE_ENV at build time so the conditional dead-code-eliminates.
// Use for diagnostic logging that should help local debugging but never
// pollute a tester's browser console.
export function devLog(...args: unknown[]): void {
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
}
