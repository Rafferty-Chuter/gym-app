import {
  EXERCISE_METADATA_LIBRARY,
  getExerciseById,
  getExerciseByIdOrName,
  type ExerciseMetadata,
} from "@/lib/exerciseMetadataLibrary";

export type SubstituteReason = {
  code:
    | "listed_substitute"
    | "movement_pattern_match"
    | "role_match"
    | "primary_muscle_overlap"
    | "equipment_compatible"
    | "bodyweight_fallback"
    | "downgraded_role_penalty";
  detail: string;
  scoreImpact: number;
};

export type RankedSubstitute = {
  exercise: ExerciseMetadata;
  score: number;
  reasons: SubstituteReason[];
};

export type RankedSubstituteOptions = {
  minScore?: number;
  maxResults?: number;
};

const ROLE_LEVEL: Record<ExerciseMetadata["role"], number> = {
  main_compound: 5,
  secondary_compound: 4,
  machine_compound: 3,
  accessory: 2,
  isolation: 1,
};

const ALIAS_BY_ID: Record<string, string[]> = {
  hack_squat_or_leg_press: [
    "back_squat",
    "goblet squat",
    "bulgarian split squat",
    "leg press",
    "split squat",
  ],
  leg_curl: ["nordic curl", "ghr", "romanian deadlift", "slider leg curl", "stability ball leg curl"],
  flat_barbell_bench_press: ["push up", "floor press", "flat dumbbell press"],
  incline_dumbbell_press: ["incline barbell press", "push up", "floor press"],
  lat_pulldown: ["pull-up", "assisted pull-up", "band pulldown", "chest-supported row"],
  overhead_press: ["dumbbell shoulder press", "pike push-up", "landmine press"],
};

const SOURCE_ALIAS_TO_ID: Record<string, string> = {
  "hack squat": "hack_squat_or_leg_press",
  "leg press": "hack_squat_or_leg_press",
  "seated ham curl": "leg_curl",
  "ham curl": "leg_curl",
  "machine chest press": "flat_barbell_bench_press",
  "chest press machine": "flat_barbell_bench_press",
  "lat pulldown": "lat_pulldown",
  "overhead press": "overhead_press",
};

function toSet(items: string[]): Set<string> {
  return new Set(items.map((x) => x.toLowerCase().trim()));
}

function normalizeEquipment(items: string[]): string[] {
  return items.map((x) => x.toLowerCase().trim());
}

function normalizeIdOrName(x: string): string {
  return x.toLowerCase().trim();
}

function isEquipmentCompatible(
  candidate: ExerciseMetadata,
  availableEquipment: string[]
): { ok: boolean; mode: "strict" | "partial" | "bodyweight" } {
  const available = toSet(normalizeEquipment(availableEquipment));
  const eq = normalizeEquipment(candidate.equipment);
  if (eq.length === 0) return { ok: true, mode: "strict" };

  const bodyweightHints = ["bodyweight", "floor", "none", "pullup_bar", "bar"];
  const isBodyweightish =
    eq.some((e) => e.includes("bodyweight")) || candidate.loadCategory.includes("bodyweight");

  const strict = eq.every((e) => {
    if (available.has(e)) return true;
    // Allow broad "barbell_or_dumbbells" style fields when either is present.
    if (e.includes("_or_")) {
      return e
        .split("_or_")
        .map((s) => s.trim())
        .some((part) => available.has(part));
    }
    if (e.includes("or")) {
      return e
        .split("or")
        .map((s) => s.trim())
        .some((part) => available.has(part));
    }
    return false;
  });
  if (strict) return { ok: true, mode: "strict" };

  const partial = eq.some((e) => available.has(e) || bodyweightHints.some((h) => e.includes(h)));
  if (partial) return { ok: true, mode: isBodyweightish ? "bodyweight" : "partial" };

  if (isBodyweightish) return { ok: true, mode: "bodyweight" };
  return { ok: false, mode: "partial" };
}

function primaryMuscleOverlap(a: ExerciseMetadata, b: ExerciseMetadata): number {
  const aSet = toSet(a.primaryMuscles);
  const bSet = toSet(b.primaryMuscles);
  let hits = 0;
  aSet.forEach((m) => {
    if (bSet.has(m)) hits += 1;
  });
  return hits;
}

function gatherListedSubstitutes(source: ExerciseMetadata, library: ExerciseMetadata[]): ExerciseMetadata[] {
  const out: ExerciseMetadata[] = [];
  const seen = new Set<string>();
  for (const raw of source.substitutes) {
    const found = getExerciseById(raw) ?? getExerciseByIdOrName(raw);
    if (found && !seen.has(found.id)) {
      seen.add(found.id);
      out.push(found);
    }
  }
  for (const alias of ALIAS_BY_ID[source.id] ?? []) {
    const found = getExerciseById(alias) ?? getExerciseByIdOrName(alias);
    if (found && !seen.has(found.id)) {
      seen.add(found.id);
      out.push(found);
    }
  }
  // If listed substitutes are not present in the library, soft-find by name similarity.
  for (const raw of [...source.substitutes, ...(ALIAS_BY_ID[source.id] ?? [])]) {
    const n = normalizeIdOrName(raw);
    const found = library.find(
      (ex) =>
        normalizeIdOrName(ex.id).includes(n) ||
        n.includes(normalizeIdOrName(ex.id)) ||
        normalizeIdOrName(ex.name).includes(n) ||
        n.includes(normalizeIdOrName(ex.name))
    );
    if (found && !seen.has(found.id)) {
      seen.add(found.id);
      out.push(found);
    }
  }
  return out;
}

function scoreSubstitute(
  source: ExerciseMetadata,
  candidate: ExerciseMetadata,
  availableEquipment: string[],
  isListedSubstitute: boolean
): RankedSubstitute | null {
  if (source.id === candidate.id) return null;

  let score = 0;
  const reasons: SubstituteReason[] = [];

  if (isListedSubstitute) {
    score += 20;
    reasons.push({
      code: "listed_substitute",
      detail: "Explicitly listed as a substitute for this movement.",
      scoreImpact: 20,
    });
  }

  if (source.movementPattern === candidate.movementPattern) {
    score += 30;
    reasons.push({
      code: "movement_pattern_match",
      detail: `Matches movement pattern (${source.movementPattern}).`,
      scoreImpact: 30,
    });
  } else if (source.tags.some((t) => candidate.tags.includes(t))) {
    score += 10;
    reasons.push({
      code: "movement_pattern_match",
      detail: "Partial pattern similarity via shared movement tags.",
      scoreImpact: 10,
    });
  }

  if (source.role === candidate.role) {
    score += 15;
    reasons.push({
      code: "role_match",
      detail: `Same role (${source.role}).`,
      scoreImpact: 15,
    });
  } else {
    const delta = ROLE_LEVEL[candidate.role] - ROLE_LEVEL[source.role];
    if (delta >= 0) {
      score += 6;
      reasons.push({
        code: "role_match",
        detail: "Comparable or higher role demand retained.",
        scoreImpact: 6,
      });
    } else if (delta <= -3) {
      score -= 20;
      reasons.push({
        code: "downgraded_role_penalty",
        detail: "Large downgrade in role demand (compound to small isolation).",
        scoreImpact: -20,
      });
    } else {
      score -= 6;
      reasons.push({
        code: "downgraded_role_penalty",
        detail: "Mild role downgrade from the original movement.",
        scoreImpact: -6,
      });
    }
  }

  const overlap = primaryMuscleOverlap(source, candidate);
  if (overlap > 0) {
    const bonus = Math.min(25, overlap * 12);
    score += bonus;
    reasons.push({
      code: "primary_muscle_overlap",
      detail: `Overlaps ${overlap} primary muscle group(s).`,
      scoreImpact: bonus,
    });
  } else {
    score -= 10;
    reasons.push({
      code: "primary_muscle_overlap",
      detail: "No primary muscle overlap with source movement.",
      scoreImpact: -10,
    });
  }

  const equipment = isEquipmentCompatible(candidate, availableEquipment);
  if (!equipment.ok) return null;
  if (equipment.mode === "strict") {
    score += 12;
    reasons.push({
      code: "equipment_compatible",
      detail: "Fully compatible with available equipment.",
      scoreImpact: 12,
    });
  } else if (equipment.mode === "partial") {
    score += 4;
    reasons.push({
      code: "equipment_compatible",
      detail: "Partially compatible with available equipment.",
      scoreImpact: 4,
    });
  } else {
    score += 6;
    reasons.push({
      code: "bodyweight_fallback",
      detail: "Usable bodyweight/minimal-equipment fallback.",
      scoreImpact: 6,
    });
  }

  return { exercise: candidate, score, reasons };
}

export function getRankedSubstitutes(
  sourceExerciseIdOrName: string,
  availableEquipment: string[],
  exerciseLibrary: ExerciseMetadata[] = EXERCISE_METADATA_LIBRARY,
  options: RankedSubstituteOptions = {}
): RankedSubstitute[] {
  const aliasResolved = SOURCE_ALIAS_TO_ID[sourceExerciseIdOrName.toLowerCase().trim()];
  const source =
    (aliasResolved ? exerciseLibrary.find((ex) => ex.id === aliasResolved) : undefined) ??
    exerciseLibrary.find((ex) => ex.id === sourceExerciseIdOrName) ??
    exerciseLibrary.find((ex) => ex.name.toLowerCase() === sourceExerciseIdOrName.toLowerCase()) ??
    getExerciseByIdOrName(sourceExerciseIdOrName);
  if (!source) return [];

  const listedIds = new Set(gatherListedSubstitutes(source, exerciseLibrary).map((x) => x.id));
  const ranked = exerciseLibrary
    .map((candidate) =>
      scoreSubstitute(source, candidate, availableEquipment, listedIds.has(candidate.id))
    )
    .filter((x): x is RankedSubstitute => Boolean(x))
    .sort((a, b) => b.score - a.score);

  const minScore = options.minScore ?? 20;
  const maxResults = options.maxResults ?? 5;
  return ranked.filter((x) => x.score >= minScore).slice(0, maxResults);
}

export function getBestSubstitute(
  sourceExerciseIdOrName: string,
  availableEquipment: string[],
  exerciseLibrary: ExerciseMetadata[] = EXERCISE_METADATA_LIBRARY
): RankedSubstitute | undefined {
  return getRankedSubstitutes(sourceExerciseIdOrName, availableEquipment, exerciseLibrary, {
    maxResults: 1,
  })[0];
}

