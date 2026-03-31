/**
 * Source: "A. Evidence-Based Hypertrophy Takeaways.pdf" provided by the user.
 * This file is intentionally concise so prompts can consume it deterministically.
 */

export const HYPERTROPHY_EVIDENCE_SOURCE = {
  title: "A. Evidence-Based Hypertrophy Takeaways",
  sourceType: "uploaded_pdf",
};

export function buildHypertrophyEvidencePromptBlock(): string {
  return `Evidence-based hypertrophy framework (source of truth for this phase; from uploaded PDF "${HYPERTROPHY_EVIDENCE_SOURCE.title}"):
- Volume matters strongly (dose-response): ≥2–3 sets/exercise tends to outperform 1 set.
- Practical weekly baseline: ~10+ sets per muscle; practical range often ~10–20 (muscle-dependent).
- Effort: hypertrophy needs sets near failure; heavy and lighter loads can both work when effort is high.
- Practical rep guidance: broad ~6–20 reps works; ~6–12 is often practical default.
- Frequency: with equal weekly volume, 1–3x/week can be similar; practically ~2 sessions/week per muscle is common.
- Recovery: major muscles commonly need ~48–72h after hard sessions; smaller muscles often recover faster but still need sensible spacing.
- Multi-pattern principle: most muscles benefit from multiple movement patterns and exercise angles.
- Long-muscle-length work: especially relevant for triceps long head, hamstrings, calves (include stretch-biased options).
- Full ROM and varied angles are generally useful.
- Compounds + isolations both play meaningful roles.

Minimum viable app-logic cues from the same PDF:
- Weekly check: flag under-coverage when a muscle is below practical minimum; flag overstack when clearly above useful range.
- Daily distribution check: if one muscle dominates session volume excessively (roughly >50%), treat as possible overstack unless intentional.
- Balance check: ensure complementary/synergist coverage (e.g., push should not omit direct triceps, pull should include vertical + horizontal pull).`;
}

