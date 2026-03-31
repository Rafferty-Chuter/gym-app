import type { SplitDefinition, SplitDayDef, SplitEmphasis } from "@/lib/splitDefinition";

const MUSCLE_ALIASES: Record<string, string> = {
  pecs: "chest",
  pec: "chest",
  "upper chest": "chest",
  lats: "back",
  "upper back": "back",
  traps: "back",
  rhomboids: "back",
  delts: "shoulders",
  shoulder: "shoulders",
  "rear delts": "shoulders",
  "front delts": "shoulders",
  "side delts": "shoulders",
  "leg day": "legs",
  quads: "legs",
  "quad": "legs",
  hams: "legs",
  hamstrings: "legs",
  "lower body": "legs",
  lower: "legs",
  bis: "biceps",
  bicep: "biceps",
  tris: "triceps",
  tricep: "triceps",
  abs: "core",
  "mid section": "core",
};

/** Map free text to a single canonical token, or null if unknown. */
export function normalizeMusclePhrase(raw: string): string | null {
  const t = raw.trim().toLowerCase().replace(/\s+/g, " ");
  if (!t) return null;
  if (t in MUSCLE_ALIASES) return MUSCLE_ALIASES[t];
  if (/^everything else$|^the rest$|^remaining muscles?$|^accessories?$/.test(t)) {
    return "arms";
  }
  const simple = [
    "chest",
    "back",
    "shoulders",
    "arms",
    "legs",
    "biceps",
    "triceps",
    "glutes",
    "hamstrings",
    "quads",
    "calves",
    "core",
  ];
  if (simple.includes(t)) return t;
  for (const [k, v] of Object.entries(MUSCLE_ALIASES)) {
    if (t === k) return v;
  }
  return null;
}

function uniqMuscles(tokens: (string | null)[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of tokens) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

/** Parse "chest and back", "shoulders, legs", "arms". */
export function parseMusclesFromPhrase(phrase: string): string[] {
  let p = phrase
    .replace(/^\s*(i want|give me|build me|make me|need|want)\s+/i, "")
    .replace(/^\s*and\s+/i, "")
    .trim();
  p = p.replace(/\s+on\s+(one|another|the other|a)\s+day\s*$/i, "").trim();
  const parts = p.split(/\s*(?:,|&|\/|\band\b)\s*/i).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    const n = normalizeMusclePhrase(part);
    if (n) out.push(n);
  }
  return uniqMuscles(out);
}

function inferEmphasis(t: string): SplitEmphasis | undefined {
  if (/\bupper\s+emphasis|upper\s+bias|upper\s+priority\b/.test(t)) return "upper_emphasis";
  if (/\blower\s+emphasis|lower\s+bias|lower\s+priority\b/.test(t)) return "lower_emphasis";
  if (/\bmaintenance\b/.test(t) && /\blower\b/.test(t)) return "lower_emphasis";
  if (/\bstrength\b/.test(t)) return "strength";
  if (/\bhypertrophy\b|\bmuscle\b/.test(t)) return "hypertrophy";
  return undefined;
}

function presetPpl(): SplitDefinition {
  return {
    title: "Push / Pull / Legs",
    source: "preset",
    days: [
      { dayLabel: "Push", targetMuscles: ["chest", "shoulders", "triceps"], notes: "Horizontal + vertical push" },
      {
        dayLabel: "Pull",
        targetMuscles: ["back", "biceps", "shoulders"],
        notes: "Vertical + horizontal pull; rear-delt coverage via template",
      },
      {
        dayLabel: "Legs",
        targetMuscles: ["quads", "hamstrings", "glutes", "calves"],
        notes: "Quad + hinge + isolation",
      },
    ],
  };
}

function presetUpperLower(dayCount: number | null): SplitDefinition {
  const n = dayCount ?? 4;
  const days: SplitDayDef[] = [];
  for (let i = 0; i < n; i++) {
    const isUpper = i % 2 === 0;
    days.push({
      dayLabel: isUpper ? `Upper ${Math.floor(i / 2) + 1}` : `Lower ${Math.floor(i / 2) + 1}`,
      targetMuscles: isUpper ? ["chest", "back", "shoulders", "arms"] : ["legs"],
      notes: isUpper ? "Upper-body balance" : "Lower-body patterns",
    });
  }
  return {
    title: `${n}-Day Upper / Lower`,
    source: "preset",
    weeklyFrequencyHint: n,
    days,
  };
}

function presetBroSplit(): SplitDefinition {
  return {
    title: "Bro split (body-part)",
    source: "preset",
    days: [
      { dayLabel: "Chest", targetMuscles: ["chest"] },
      { dayLabel: "Back", targetMuscles: ["back"] },
      { dayLabel: "Shoulders", targetMuscles: ["shoulders"] },
      { dayLabel: "Legs", targetMuscles: ["legs"] },
      { dayLabel: "Arms", targetMuscles: ["arms"] },
    ],
  };
}

/**
 * Heuristic: "4 day split where chest is trained twice and legs once"
 * → push-biased + pull + legs + upper with chest repeat.
 */
function presetFrequencySplit(t: string, dayCount: number): SplitDefinition | null {
  const chestTwice = /\bchest\s+(?:is\s+)?trained\s+twice|twice.*\bchest\b|chest\s+twice\b/.test(t);
  const legsOnce = /\blegs\s+(?:is\s+)?trained\s+once|once.*\blegs\b|legs\s+once\b/.test(t);
  if (dayCount === 4 && chestTwice && legsOnce) {
    return {
      title: "4-Day split (chest 2×, legs 1×)",
      source: "preset",
      weeklyFrequencyHint: 4,
      emphasis: "upper_emphasis",
      days: [
        { dayLabel: "Push (chest priority)", targetMuscles: ["chest", "shoulders", "triceps"] },
        { dayLabel: "Pull", targetMuscles: ["back", "biceps"] },
        { dayLabel: "Legs", targetMuscles: ["legs"] },
        { dayLabel: "Upper (chest + accessories)", targetMuscles: ["chest", "back", "arms"] },
      ],
    };
  }
  return null;
}

/**
 * Parse "X on one day, Y on another day" style lines.
 */
export function tryParseOnDayStructure(message: string): SplitDefinition | null {
  const stripped = message
    .replace(/^\s*(i want|i'd like|give me|build me|make me|can you|please)\s+/i, "")
    .trim();
  const t = stripped.toLowerCase();

  const onDayPattern = /([^,]+?)\s+on\s+(?:one|another|the\s+other|a)\s+day/gi;
  const matches: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = onDayPattern.exec(stripped)) !== null) {
    let chunk = m[1].trim().replace(/^\s*and\s+/i, "").trim();
    chunk = chunk.replace(/^i want\s+/i, "").trim();
    if (chunk) matches.push(chunk);
  }

  if (matches.length === 0) return null;

  const days: SplitDayDef[] = matches.map((phrase, i) => {
    const muscles = parseMusclesFromPhrase(phrase);
    const label =
      muscles.length > 0
        ? muscles.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(" + ")
        : `Day ${i + 1}`;
    return {
      dayLabel: label,
      targetMuscles: muscles.length > 0 ? muscles : ["upper"],
      notes: muscles.length === 0 ? `Could not parse muscles from: ${phrase}` : undefined,
    };
  });

  if (days.length === 0) return null;

  return {
    title: "Custom split (parsed)",
    source: "parsed",
    emphasis: inferEmphasis(t),
    days,
  };
}

function tryNamedSplit(message: string): SplitDefinition | null {
  const t = message.toLowerCase();
  if (/\b(push\s*pull\s*legs|ppl)\b/.test(t)) return presetPpl();
  if (/\b(bro split|body\s*part|one muscle|single muscle)\b/.test(t)) return presetBroSplit();
  if (/\b(upper\s*[\/\s-]?\s*lower|upper lower)\b/.test(t)) {
    const dm = t.match(/\b([3-6])\s*(?:day|days)\b/);
    const n = dm ? Number(dm[1]) : 4;
    return presetUpperLower(n);
  }
  return null;
}

function tryNDaySplit(message: string): SplitDefinition | null {
  const t = message.toLowerCase();
  const dm = t.match(/\b([3-6])\s*(?:day|days)\b/);
  if (!dm) return null;
  const n = Number(dm[1]);
  const programmeContext =
    /\b(split|programme|program|routine|weekly|training plan|schedule|workout plan|lifting)\b/.test(t) ||
    /\b(build|make|give|want|need|design|create)\b.*\b(day|days|split|plan|routine)\b/.test(t);
  if (!programmeContext) return null;
  const freq = presetFrequencySplit(t, n);
  if (freq) return freq;

  if (/\bupper\s*[\/\s-]?\s*lower\b/.test(t)) return presetUpperLower(n);

  const cycle: SplitDayDef[] = [];
  const patterns: Array<{ label: string; muscles: string[] }> = [
    { label: "Upper A", muscles: ["chest", "back", "shoulders", "arms"] },
    { label: "Lower A", muscles: ["legs"] },
    { label: "Push", muscles: ["chest", "shoulders", "triceps"] },
    { label: "Pull", muscles: ["back", "biceps"] },
    { label: "Legs", muscles: ["legs"] },
    { label: "Full mix", muscles: ["chest", "back", "legs"] },
  ];
  for (let i = 0; i < n; i++) {
    const p = patterns[i % patterns.length];
    cycle.push({ dayLabel: `${p.label}`, targetMuscles: [...p.muscles] });
  }
  return {
    title: `${n}-Day plan`,
    source: "preset",
    weeklyFrequencyHint: n,
    days: cycle,
  };
}

/**
 * N-day programme as **muscle groupings per day** only (no named PPL/UL presets — those go through programmePipeline splitGroupings).
 */
export function tryNDayMuscleGroupingFromMessage(message: string): SplitDefinition | null {
  const trimmed = message.trim();
  if (trimmed.length < 8) return null;
  const t = trimmed.toLowerCase();
  const dm = t.match(/\b([3-6])\s*(?:day|days)\b/);
  if (!dm) return null;
  const n = Number(dm[1]);
  const programmeContext =
    /\b(split|programme|program|routine|weekly|training plan|schedule|workout plan|lifting)\b/.test(t) ||
    /\b(build|make|give|want|need|design|create)\b.*\b(day|days|split|plan|routine)\b/.test(t);
  if (!programmeContext) return null;

  const freq = presetFrequencySplit(t, n);
  if (freq) return freq;

  const cycle: SplitDayDef[] = [];
  const patterns: Array<{ label: string; muscles: string[] }> = [
    { label: "Upper A", muscles: ["chest", "back", "shoulders", "arms"] },
    { label: "Lower A", muscles: ["quads", "hamstrings", "glutes", "calves"] },
    { label: "Push", muscles: ["chest", "shoulders", "triceps"] },
    { label: "Pull", muscles: ["back", "biceps", "shoulders"] },
    { label: "Legs", muscles: ["quads", "hamstrings", "glutes", "calves"] },
    { label: "Full mix", muscles: ["chest", "back", "legs"] },
  ];
  for (let i = 0; i < n; i++) {
    const p = patterns[i % patterns.length];
    cycle.push({ dayLabel: `${p.label}`, targetMuscles: [...p.muscles] });
  }
  return {
    title: `${n}-Day plan`,
    source: "preset",
    weeklyFrequencyHint: n,
    days: cycle,
  };
}

/**
 * Parse user text into a split definition. Returns null when no structured split can be inferred.
 */
export function parseSplitFromMessage(message: string): SplitDefinition | null {
  const trimmed = message.trim();
  if (trimmed.length < 8) return null;

  const onDay = tryParseOnDayStructure(trimmed);
  if (onDay && onDay.days.length >= 1) {
    const hasParsedMuscles = onDay.days.some((d) => d.targetMuscles.length > 0);
    if (hasParsedMuscles) return onDay;
  }

  const named = tryNamedSplit(trimmed);
  if (named) return named;

  const nDay = tryNDaySplit(trimmed);
  if (nDay) return nDay;

  return null;
}
