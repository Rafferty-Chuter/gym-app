/**
 * Feature switches. One place, so a parked feature leaves no stray entry
 * points and comes back with one change.
 */

/**
 * The chat assistant is parked (founder's call, 2026-10-17: the wording on
 * the Home card did not land with him or a friend). The engine's verdicts,
 * the week report and the gap lists stay; the chat, the "Ask why" links and
 * the coach-profile banner hide until this is true again. The route, the
 * API and the tests are untouched so it can return once the rest is solid.
 */
export const ASSISTANT_ENABLED = false;
