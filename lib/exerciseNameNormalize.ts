/**
 * Exercise name normalization.
 *
 * Two callsites:
 *  - `normalizeCasingOnly` — runs on user input (e.g. when they save a custom
 *    exercise). Per P0.7 spec: don't aggressively spell-correct user input;
 *    only fix mid-word casing like "TricEp" → "Tricep" while preserving short
 *    all-caps acronyms like "JM", "RDL", "EZ".
 *  - `normalizeExerciseName` — runs on read as a one-time migration of legacy
 *    workout history entries. Includes a small known-typo map ("dumbell" →
 *    "dumbbell") so users don't keep seeing the bad spelling.
 */

// Case-insensitive known-typo replacements. Keep the list short and only
// include spellings that are unambiguously misspelled — never override
// legitimate user choices.
const TYPO_PATTERNS: Array<[RegExp, string]> = [
  [/\bdumbells\b/gi, "dumbbells"],
  [/\bdumbell\b/gi, "dumbbell"],
  [/\bdumbel\b/gi, "dumbbell"],
  [/\bdumbells'\b/gi, "dumbbells'"],
];

/**
 * Normalize a single space- and hyphen-free token.
 *   - All-letters of length ≤ 4 that is already all-caps stays as-is (acronym
 *     preservation: "JM", "RDL", "EZ", "BB", "DB").
 *   - All-letters tokens otherwise → capitalize first letter, lowercase rest.
 *   - Tokens containing digits or other non-letters are left untouched.
 */
function normalizeWordToken(token: string): string {
  if (token.length === 0) return token;
  if (!/^[A-Za-z]+$/.test(token)) return token;
  if (token.length <= 4 && token === token.toUpperCase()) return token;
  return token[0].toUpperCase() + token.slice(1).toLowerCase();
}

/** Apply word-by-word casing rules across whitespace- and hyphen-separated tokens. */
function applyCasing(name: string): string {
  const collapsed = name.replace(/\s+/g, " ").trim();
  if (!collapsed) return collapsed;
  return collapsed
    .split(" ")
    .map((word) =>
      word
        .split("-")
        .map(normalizeWordToken)
        .join("-")
    )
    .join(" ");
}

/** Casing only — safe for user input. */
export function normalizeCasingOnly(name: string): string {
  if (typeof name !== "string") return name;
  return applyCasing(name);
}

/** Casing + known-typo fixes — used during migration of stored history. */
export function normalizeExerciseName(name: string): string {
  if (typeof name !== "string") return name;
  let normalized = name;
  for (const [pattern, replacement] of TYPO_PATTERNS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return applyCasing(normalized);
}
