/**
 * Builds a data-driven muscle-coverage brief for the LLM planner.
 *
 * Architecture:
 *   1. SessionType  →  identify which muscles are being trained
 *   2. Each muscle  →  read MUSCLE_RULES[muscle] for required patterns, counts, long-length bias
 *   3. Each pattern →  resolve matching catalog exercise IDs
 *   4. Emit a structured brief the LLM uses to select exercises bottom-up
 *
 * The session type is ONLY used to identify which muscles are in scope and,
 * where anatomy demands it, which sub-set of a muscle's patterns apply in this
 * session context (e.g. delts on a push day = anterior/medial, not rear).
 * Everything else — required pattern counts, long-length notes, programming
 * guidance — comes directly from MUSCLE_RULES, not from this file.
 */

import { EXERCISE_METADATA_LIBRARY } from "@/lib/exerciseMetadataLibrary";
import { MUSCLE_RULES, type MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import type { SessionType } from "@/lib/sessionTemplates";

// ---------------------------------------------------------------------------
// Pattern → catalog match criteria
// ---------------------------------------------------------------------------
// Each key is a movement-pattern token.  Values tell resolvePatternMatches()
// how to find matching exercises in EXERCISE_METADATA_LIBRARY.

type PatternMatchCriteria = {
  description: string;
  movementPatterns?: string[];
  requiredTags?: string[];
  excludeMovementPatterns?: string[];
  specificIds?: string[];
  longLengthNote?: string;
};

const PATTERN_MATCH: Record<string, PatternMatchCriteria> = {
  // ── Chest ─────────────────────────────────────────────────────────────────
  horizontal_press: {
    description: "Flat horizontal press — mid / sternal pec",
    movementPatterns: ["horizontal_push"],
    excludeMovementPatterns: ["incline_horizontal_push"],
  },
  incline_press: {
    description: "Incline press — clavicular / upper chest (anatomically separate from sternal head)",
    movementPatterns: ["incline_horizontal_push"],
    longLengthNote:
      "Clavicular head requires incline angle. Flat press does NOT adequately train it.",
  },
  "fly/isolation": {
    description: "Chest fly / pec-deck — horizontal adduction, stretch-biased isolation",
    movementPatterns: ["horizontal_adduction"],
    requiredTags: ["chest"],
  },

  // ── Delts ─────────────────────────────────────────────────────────────────
  vertical_press: {
    description: "Overhead / vertical press — anterior delt compound",
    movementPatterns: ["vertical_push"],
  },
  lateral_raise: {
    description: "Lateral / abduction isolation — medial delt ONLY; pressing does not train this head",
    movementPatterns: ["shoulder_abduction"],
    longLengthNote:
      "Medial delt (shoulder width) is exclusively recruited by abduction. Pressing of any kind is insufficient.",
  },
  rear_delt: {
    description: "Rear delt isolation — face pull / rear fly; posterior deltoid head",
    movementPatterns: ["horizontal_abduction"],
  },

  // ── Triceps ───────────────────────────────────────────────────────────────
  overhead_extension: {
    description: "Overhead triceps extension — arm overhead; maximally loads the LONG HEAD at full stretch",
    movementPatterns: ["elbow_extension_overhead"],
    longLengthNote:
      "Triceps longLengthBias = HIGH. Long head (largest portion) needs overhead position. Pushdowns cannot replicate this stretch.",
  },
  pushdown: {
    description: "Triceps pushdown — arm at side; lateral and medial head emphasis",
    movementPatterns: ["elbow_extension"],
    excludeMovementPatterns: ["elbow_extension_overhead"],
  },
  pressing_support: {
    description: "Compound pressing — indirect triceps stimulus already present from chest/shoulder work",
    movementPatterns: ["horizontal_push", "vertical_push"],
  },

  // ── Lats / Upper Back ─────────────────────────────────────────────────────
  vertical_pull: {
    description: "Vertical pull — lat width (pulldown, pull-up)",
    movementPatterns: ["vertical_pull"],
  },
  horizontal_pull: {
    description: "Horizontal row — back thickness, rhomboids, mid-trap; distinct fiber recruitment from pulldowns",
    movementPatterns: ["horizontal_pull"],
  },

  // ── Biceps ────────────────────────────────────────────────────────────────
  // Two anatomically distinct curl patterns — each targets a different emphasis:
  supinated_curl: {
    description: "Supinated / underhand curl — short head bias; standard elbow flexion with palm facing up",
    specificIds: ["biceps_curl"],
  },
  neutral_hammer_curl: {
    description:
      "Neutral / hammer curl — long head + brachialis emphasis; palm faces inward throughout ROM",
    specificIds: ["hammer_curl"],
    longLengthNote:
      "Neutral-grip curls recruit brachialis and the long biceps head differently from supinated curls. Both grips are needed for complete biceps development.",
  },

  // ── Quads ─────────────────────────────────────────────────────────────────
  squat_or_press: {
    description: "Squat or leg-press — quad-dominant compound",
    movementPatterns: ["squat", "machine_squat"],
  },
  knee_extension: {
    description: "Knee-extension isolation — direct VMO/quad stimulus the squat alone cannot fully replicate",
    movementPatterns: ["knee_extension"],
  },

  // ── Hamstrings ────────────────────────────────────────────────────────────
  hip_hinge: {
    description: "Hip hinge — hamstrings + glutes at long length (RDL, stiff-leg deadlift)",
    movementPatterns: ["hip_hinge"],
  },
  knee_curl: {
    description: "Knee curl / leg curl — hamstring isolation; short head undertrained by hinge alone",
    movementPatterns: ["knee_flexion"],
  },

  // ── Glutes ────────────────────────────────────────────────────────────────
  hip_thrust_bridge: {
    description: "Hip thrust / glute bridge — direct glute drive at shortened position",
    movementPatterns: ["hip_extension"],
  },
  squat_lunge_hinge: {
    description: "Squat, lunge, split-squat, or hinge — multi-joint glute involvement",
    movementPatterns: ["squat", "split_squat", "hip_hinge", "machine_squat"],
  },

  // ── Calves ────────────────────────────────────────────────────────────────
  standing_calf_raise: {
    description: "Standing calf raise — gastrocnemius (knee straight; full plantarflexion ROM)",
    specificIds: ["standing_or_seated_calf_raise"],
  },
  seated_calf_raise: {
    description: "Seated calf raise — soleus (knee bent; anatomically distinct from gastrocnemius)",
    specificIds: ["seated_calf_raise"],
  },
};

// ---------------------------------------------------------------------------
// Session-type → muscle scope
// ---------------------------------------------------------------------------
// This is the ONLY place session type matters.  It identifies:
//   - which muscles are being trained
//   - which subset of a muscle's patterns are contextually appropriate
//     (e.g. delts on pull day = rear delt only; OHP is a push pattern)
//
// Required pattern COUNTS come from MUSCLE_RULES, not from here.
// Pattern overrides are used only when anatomy makes certain patterns
// inappropriate for the session context.

type MuscleScope = {
  muscleId: MuscleRuleId;
  /**
   * Subset of MUSCLE_RULES[muscleId].keyMovementPatterns that are relevant
   * to THIS session type.  Must map to keys in PATTERN_MATCH.
   * If undefined: all patterns from MUSCLE_RULES are used.
   */
  contextPatterns: string[];
  /**
   * How many of contextPatterns are required.
   * Defaults to min(MUSCLE_RULES.requiredPatternCount, contextPatterns.length)
   * when not set explicitly — set explicitly only when the muscle is a PRIMARY
   * target of the session (e.g. biceps on pull day = 2 required, not 1).
   */
  requiredOverride?: number;
};

const SESSION_MUSCLE_SCOPE: Record<string, MuscleScope[]> = {
  // ── Push ──────────────────────────────────────────────────────────────────
  push: [
    {
      muscleId: "chest",
      contextPatterns: ["horizontal_press", "incline_press", "fly/isolation"],
      // MUSCLE_RULES requiredPatternCount = 2; both flat + incline are required
    },
    {
      muscleId: "delts",
      // Anterior (via pressing) + medial delt. Rear delt is a pull-day pattern.
      contextPatterns: ["vertical_press", "lateral_raise"],
    },
    {
      muscleId: "triceps",
      // Both isolation positions required. pressing_support is implicit (already present).
      contextPatterns: ["overhead_extension", "pushdown", "pressing_support"],
      requiredOverride: 2, // overhead + pushdown both required
    },
  ],

  // ── Pull ──────────────────────────────────────────────────────────────────
  pull: [
    {
      muscleId: "lats_upper_back",
      contextPatterns: ["vertical_pull", "horizontal_pull"],
      // MUSCLE_RULES requiredPatternCount = 2; both required
    },
    {
      muscleId: "delts",
      // On pull day only rear delt is a target; OHP/lateral raise are push movements.
      contextPatterns: ["rear_delt"],
      // requiredOverride = 1 (auto from min(2, 1))
    },
    {
      muscleId: "biceps",
      // Biceps is a PRIMARY target on pull day — both curl patterns are required.
      contextPatterns: ["supinated_curl", "neutral_hammer_curl"],
      requiredOverride: 2,
    },
  ],

  // ── Legs / Lower ──────────────────────────────────────────────────────────
  legs: [
    {
      muscleId: "quads",
      contextPatterns: ["squat_or_press", "knee_extension"],
      // MUSCLE_RULES requiredPatternCount = 2; both required
    },
    {
      muscleId: "hamstrings",
      contextPatterns: ["hip_hinge", "knee_curl"],
      // MUSCLE_RULES requiredPatternCount = 2; both required
    },
    {
      muscleId: "glutes",
      contextPatterns: ["squat_lunge_hinge", "hip_thrust_bridge"],
      // MUSCLE_RULES requiredPatternCount = 2; directWorkUsuallyNeeded = false
      // squat_lunge_hinge is covered by squat compounds; hip_thrust is optional unless user asks
      requiredOverride: 1,
    },
    {
      muscleId: "calves",
      contextPatterns: ["standing_calf_raise", "seated_calf_raise"],
      // MUSCLE_RULES requiredPatternCount = 2; standing required, seated optional
      requiredOverride: 1,
    },
  ],

  // ── Upper ─────────────────────────────────────────────────────────────────
  upper: [
    {
      muscleId: "chest",
      contextPatterns: ["horizontal_press", "incline_press"],
      requiredOverride: 1, // space is shared; at least flat press required
    },
    {
      muscleId: "lats_upper_back",
      contextPatterns: ["vertical_pull", "horizontal_pull"],
      requiredOverride: 1,
    },
    {
      muscleId: "delts",
      contextPatterns: ["vertical_press", "lateral_raise", "rear_delt"],
      requiredOverride: 2,
    },
    {
      muscleId: "triceps",
      contextPatterns: ["overhead_extension", "pushdown"],
      requiredOverride: 1,
    },
    {
      muscleId: "biceps",
      contextPatterns: ["supinated_curl", "neutral_hammer_curl"],
      requiredOverride: 1,
    },
  ],

  // ── Full body ──────────────────────────────────────────────────────────────
  full_body: [
    { muscleId: "chest",          contextPatterns: ["horizontal_press"],                     requiredOverride: 1 },
    { muscleId: "lats_upper_back",contextPatterns: ["vertical_pull", "horizontal_pull"],     requiredOverride: 1 },
    { muscleId: "delts",          contextPatterns: ["vertical_press", "lateral_raise"],      requiredOverride: 1 },
    { muscleId: "quads",          contextPatterns: ["squat_or_press"],                       requiredOverride: 1 },
    { muscleId: "hamstrings",     contextPatterns: ["hip_hinge", "knee_curl"],               requiredOverride: 1 },
    { muscleId: "glutes",         contextPatterns: ["squat_lunge_hinge"],                    requiredOverride: 1 },
  ],

  // ── Dedicated chest ───────────────────────────────────────────────────────
  chest: [
    {
      muscleId: "chest",
      contextPatterns: ["horizontal_press", "incline_press", "fly/isolation"],
      requiredOverride: 3,
    },
    {
      muscleId: "triceps",
      contextPatterns: ["overhead_extension", "pushdown"],
      requiredOverride: 1,
    },
  ],

  // ── Dedicated back ────────────────────────────────────────────────────────
  back: [
    {
      muscleId: "lats_upper_back",
      contextPatterns: ["vertical_pull", "horizontal_pull"],
    },
    {
      muscleId: "delts",
      contextPatterns: ["rear_delt"],
      requiredOverride: 1,
    },
    {
      muscleId: "biceps",
      contextPatterns: ["supinated_curl", "neutral_hammer_curl"],
      requiredOverride: 2,
    },
  ],

  // ── Shoulders ─────────────────────────────────────────────────────────────
  shoulders: [
    {
      muscleId: "delts",
      contextPatterns: ["vertical_press", "lateral_raise", "rear_delt"],
      // MUSCLE_RULES requiredPatternCount = 2; all three are valuable on a dedicated shoulder day
      requiredOverride: 3,
    },
  ],

  // ── Arms ──────────────────────────────────────────────────────────────────
  arms: [
    {
      muscleId: "biceps",
      contextPatterns: ["supinated_curl", "neutral_hammer_curl"],
      requiredOverride: 2,
    },
    {
      muscleId: "triceps",
      contextPatterns: ["overhead_extension", "pushdown"],
      requiredOverride: 2,
    },
  ],
};

// ---------------------------------------------------------------------------
// Catalog match resolution
// ---------------------------------------------------------------------------

function resolvePatternMatches(
  criteria: PatternMatchCriteria
): Array<{ id: string; name: string }> {
  return EXERCISE_METADATA_LIBRARY.filter((e) => {
    if (criteria.specificIds?.includes(e.id)) return true;
    if (!criteria.movementPatterns?.some((p) => e.movementPattern === p)) return false;
    if (criteria.excludeMovementPatterns?.includes(e.movementPattern)) return false;
    if (criteria.requiredTags && !criteria.requiredTags.every((t) => e.tags.includes(t)))
      return false;
    return true;
  }).map((e) => ({ id: e.id, name: e.name }));
}

// ---------------------------------------------------------------------------
// Public builder
// ---------------------------------------------------------------------------

export function buildMuscleCoverageBriefForLLM(sessionType: SessionType): string {
  const scope =
    sessionType === "lower"
      ? SESSION_MUSCLE_SCOPE["legs"]
      : SESSION_MUSCLE_SCOPE[sessionType] ?? [];

  if (scope.length === 0) return "";

  const lines: string[] = [];
  lines.push("MUSCLE COVERAGE BRIEF:");
  lines.push(
    "The following muscles are in scope for this session. For each muscle the required movement patterns are derived from the muscle's own training rules — NOT from a session template. Cover every [REQUIRED] pattern. Skip only if equipment prevents it (state why in plannerDebug)."
  );
  lines.push("");

  for (const entry of scope) {
    const rule = MUSCLE_RULES[entry.muscleId];
    if (!rule) continue;

    const patterns = entry.contextPatterns;

    // Required count: use explicit override, else min(MUSCLE_RULES.requiredPatternCount, scope count)
    const requiredCount =
      entry.requiredOverride !== undefined
        ? entry.requiredOverride
        : Math.min(rule.requiredPatternCount, patterns.length);

    const longFlag = rule.longLengthBias === "high" ? " ★ LONG-LENGTH BIAS" : "";
    lines.push(
      `▸ ${rule.displayName.toUpperCase()}${longFlag}`
    );
    lines.push(
      `  Rule: ${requiredCount} of ${patterns.length} patterns below are REQUIRED`
      + ` | weekly target ~${rule.typicalWeeklySetRange.target} sets | per-session ~${rule.typicalPerSessionSetRange.target} sets`
      + (rule.multiplePatternsRecommended ? " | multiple patterns recommended" : "")
    );

    for (let i = 0; i < patterns.length; i++) {
      const key = patterns[i];
      const criteria = PATTERN_MATCH[key];
      const label = i < requiredCount ? "[REQUIRED]" : "[optional]";

      if (!criteria) {
        lines.push(`  ${i + 1}. ${key} ${label}`);
        continue;
      }

      const matches = resolvePatternMatches(criteria);
      const matchStr =
        matches.length > 0
          ? matches.map((m) => `${m.id} ("${m.name}")`).join(", ")
          : "(no catalog match — pick closest available substitute)";

      lines.push(`  ${i + 1}. ${key} ${label} — ${criteria.description}`);
      if (criteria.longLengthNote) {
        lines.push(`     ⚠ ${criteria.longLengthNote}`);
      }
      lines.push(`     Catalog candidates: ${matchStr}`);
    }

    if (rule.programmingNotes?.length) {
      lines.push(`  → ${rule.programmingNotes.join(" ")}`);
    }
    lines.push("");
  }

  lines.push("SELECTION RULES:");
  lines.push("1. For each muscle above, pick one exercise per [REQUIRED] pattern from the listed candidates.");
  lines.push("2. Use exercise IDs EXACTLY as shown — never invent IDs.");
  lines.push("3. Add [optional] patterns only when they address a sub-region genuinely not yet covered.");
  lines.push("4. Document every pick in plannerDebug.perExercise (addedBecause, coverageAfterThisPick, stopConsidered).");
  lines.push("5. plannerDebug.finalStopReason: confirm every [REQUIRED] pattern is covered or explain any gap.");

  return lines.join("\n");
}
