import {
  EXERCISE_METADATA_LIBRARY,
  getExerciseByIdOrName,
} from "@/lib/exerciseMetadataLibrary";

export type RequestedExerciseConstraint = {
  exerciseIds: string[];
  hardRequirement: boolean;
};

/**
 * True when `before` (text immediately preceding an exercise mention) indicates the user
 * is ruling that movement out, not asking for it.
 */
export function looksNegatedBeforeExercise(before: string): boolean {
  const b = before.trimEnd();
  if (!b) return false;
  return (
    /\bno\s*$/i.test(b) ||
    /\bwithout\s+(?:any\s*)?$/i.test(b) ||
    /\bw\/o\s+(?:any\s*)?$/i.test(b) ||
    /\bavoid\s*$/i.test(b) ||
    /\bexcluding\s*$/i.test(b) ||
    /\bexclude\s*$/i.test(b) ||
    /\bskip\s*$/i.test(b) ||
    /\bdrop\s*$/i.test(b) ||
    /\bremove\s*$/i.test(b) ||
    /\bnever\s+(?:want|need|include|use|add)\s*$/i.test(b) ||
    /\bnot\s+any\s*$/i.test(b) ||
    /\bnot\s+include\s*$/i.test(b) ||
    /\blacking\s*$/i.test(b) ||
    /\bfree\s+of\s*$/i.test(b) ||
    /\b(?:don't|dont|doesn't|doesnt|didn't|didnt|mustn't|mustnt|shouldn't|shouldnt|can't|cant|won't|wont)\s+(?:want|need|like|use|include|add|have)\s+(?:any\s*)?$/i.test(
      b
    ) ||
    /\b(?:doesn't|doesnt|don't|dont)\s+have\s+any\s*$/i.test(b) ||
    /\bnot\s+have\s+any\s*$/i.test(b)
  );
}

const PREFIX_LEN = 120;

function hasNonNegatedSubstringMention(t: string, needle: string): boolean {
  if (!needle) return false;
  let start = 0;
  while (true) {
    const idx = t.indexOf(needle, start);
    if (idx < 0) return false;
    const before = t.slice(Math.max(0, idx - PREFIX_LEN), idx);
    if (!looksNegatedBeforeExercise(before)) return true;
    start = idx + 1;
  }
}

function addAliasIfNotNegated(t: string, matchedIds: Set<string>, id: string, pattern: RegExp): void {
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const before = t.slice(Math.max(0, m.index - PREFIX_LEN), m.index);
    if (!looksNegatedBeforeExercise(before)) matchedIds.add(id);
  }
}

/**
 * Deterministic extraction of library exercise ids the user asked to include.
 * Mentions inside negation ("no lateral raises", "without bench") are ignored.
 */
export function parseRequestedExerciseConstraints(message: string): RequestedExerciseConstraint {
  const t = message.toLowerCase();
  const hardRequirement =
    /\b(include|includes|including|with|must include|need|specifically|make sure|ensure|containing)\b/.test(
      t
    );

  const aliasById: Array<{ id: string; patterns: RegExp[] }> = [
    {
      id: "flat_barbell_bench_press",
      patterns: [
        /\bflat barbell bench( press)?\b/,
        /\bbarbell bench press\b/,
        /\bbarbell bench\b/,
        /\bflat bench( press)?\b/,
        /\bflat bench\b/,
      ],
    },
    {
      id: "incline_dumbbell_press",
      patterns: [
        /\bincline dumbbell press\b/,
        /\bincline dumbell press\b/,
        /\bincline dumbel press\b/,
        /\bincline db press\b/,
        /\bincline db\b/,
        /\bincline barbell press\b/,
        /\bincline smith press\b/,
        /\bincline machine press\b/,
        /\bincline bench press\b/,
        /\bincline press\b/,
        /\bincline bench\b/,
      ],
    },
    {
      id: "overhead_press",
      patterns: [/\boverhead press\b/, /\bohp\b/, /\bmilitary press\b/],
    },
    {
      id: "jm_press",
      patterns: [/\bjm\s*press\b/, /\bj\.m\.\s*press\b/],
    },
  ];

  const matchedIds = new Set<string>();
  for (const { id, patterns } of aliasById) {
    for (const p of patterns) {
      addAliasIfNotNegated(t, matchedIds, id, p);
    }
  }

  if (/\bbench press\b/.test(t) && !/\bincline\s+bench\s+press\b/.test(t)) {
    const re = /\bbench press\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(t)) !== null) {
      const before = t.slice(Math.max(0, m.index - PREFIX_LEN), m.index);
      if (!looksNegatedBeforeExercise(before)) {
        matchedIds.add("flat_barbell_bench_press");
        break;
      }
    }
  }

  const byLibraryNames = EXERCISE_METADATA_LIBRARY.filter((ex) => {
    const nameLower = ex.name.toLowerCase();
    return nameLower && hasNonNegatedSubstringMention(t, nameLower);
  }).map((ex) => ex.id);

  const merged = Array.from(new Set([...matchedIds, ...byLibraryNames]))
    .map((id) => getExerciseByIdOrName(id)?.id ?? null)
    .filter((id): id is string => Boolean(id));
  return { exerciseIds: merged, hardRequirement };
}

/**
 * Exercise ids the user ruled out by negation only (no positive mention of that name in the message).
 * Complements {@link parseRequestedExerciseConstraints}; safe without an LLM.
 */
export function parseExcludedExerciseIds(message: string): string[] {
  const t = message.toLowerCase();
  const out = new Set<string>();
  for (const ex of EXERCISE_METADATA_LIBRARY) {
    const nameLower = ex.name.toLowerCase();
    if (!nameLower || !t.includes(nameLower)) continue;
    if (!hasNonNegatedSubstringMention(t, nameLower)) {
      const id = getExerciseByIdOrName(ex.id)?.id;
      if (id) out.add(id);
    }
  }
  return [...out];
}
