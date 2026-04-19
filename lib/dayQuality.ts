import { getExerciseByIdOrName, type ExerciseMetadata } from "@/lib/exerciseMetadataLibrary";
import type { SessionType } from "@/lib/sessionTemplates";
import type { BuilderStructuralIntent } from "@/lib/builderStructuralIntent";
import { MUSCLE_GROUP_RULES, type MuscleGroupId } from "@/lib/muscleGroupRules";
import {
  countDirectMuscleSetsByStimulusForBuiltDay,
  countMuscleSetsByStimulusForBuiltDay,
} from "@/lib/muscleSetCounting";
import { validateSessionAgainstTargetMuscles } from "@/lib/trainingKnowledge/muscleCoverage";

export type BuiltWorkoutLike = {
  sessionType: SessionType;
  exercises: Array<{
    exerciseId: string;
    exerciseName: string;
    // When validating real workouts, these fields exist; keep optional to avoid breaking callsites.
    sets?: { min: number; max: number };
  }>;
};

function metaForBuilt(ex: BuiltWorkoutLike["exercises"][0]): ExerciseMetadata | undefined {
  return getExerciseByIdOrName(ex.exerciseId) ?? getExerciseByIdOrName(ex.exerciseName);
}

function countBy(
  exercises: ExerciseMetadata[],
  pred: (e: ExerciseMetadata) => boolean
): number {
  return exercises.filter(pred).length;
}

/** Documented minimums enforced by validation + templates. */
export const MINIMUM_VIABLE_DAY_RULES = {
  push: [
    "At least 1 flat/horizontal chest press (compound or machine) — targets mid/sternal chest.",
    "At least 1 incline chest press — targets clavicular/upper chest; flat press alone is insufficient.",
    "At least 1 vertical shoulder press (overhead press).",
    "At least 1 lateral raise — mandatory for medial delt; pressing does not train it.",
    "At least 1 triceps overhead extension (triceps_overhead_extension) — long head via stretched position.",
    "At least 1 triceps pushdown (triceps_pushdown) — lateral/medial head complement.",
    "If user asks for more isolation: ≥1 extra isolation beyond those six roles (e.g. cable fly, extra shoulder work).",
  ],
  pull: [
    "At least 1 vertical pull (lat pulldown or pull-up) — lat width.",
    "At least 1 horizontal pull / row — back thickness, rhomboids.",
    "At least 1 rear-delt isolation (face pull, rear fly) — posterior delt; rows alone are insufficient.",
    "At least 1 supinated curl (biceps_curl) — short-head / standard biceps.",
    "At least 1 neutral/hammer curl (hammer_curl) — long head + brachialis; distinct from supinated.",
    "If user asks for more isolation: add extra row/curl or rear-delt slot via higher target count.",
  ],
  legs: [
    "At least 1 quad-dominant compound.",
    "At least 1 hip hinge / hamstring-loading compound.",
    "At least 1 additional quad-focused movement (second compound or isolation).",
    "At least 1 hamstring isolation.",
    "At least 1 calf or lower-leg isolation.",
    "If user asks for more isolation: ≥2 isolation/accessory lower movements beyond the baseline (e.g. leg curl + extension + calves).",
  ],
} as const;

export type DayQualityResult = {
  ok: boolean;
  warnings: string[];
  suggestedTargetCount: number;
};

export type DayQualityOptions = Record<string, never>

export function validateBuiltDayQuality(
  built: BuiltWorkoutLike,
  intent: BuilderStructuralIntent | undefined,
  opts?: DayQualityOptions
): DayQualityResult {
  const warnings: string[] = [];
  const st = built.sessionType;
  const metas = built.exercises.map(metaForBuilt).filter((m): m is ExerciseMetadata => Boolean(m));

  const intendedMusclesForSession: MuscleGroupId[] = (() => {
    if (st === "push") return ["chest", "delts", "triceps"];
    if (st === "pull") return ["lats_upper_back", "delts", "biceps"];
    if (st === "legs" || st === "lower") return ["quads", "hamstrings", "glutes", "calves"];
    if (st === "upper") return ["chest", "lats_upper_back", "delts", "biceps", "triceps"];
    if (st === "full_body")
      return ["chest", "lats_upper_back", "delts", "biceps", "triceps", "quads", "hamstrings", "glutes", "calves"];
    if (st === "arms") return ["biceps", "triceps"];
    if (st === "shoulders") return ["delts"];
    return [];
  })();

  const sharedCoverage = validateSessionAgainstTargetMuscles(
    {
      targetMuscles: intendedMusclesForSession,
      exercises: built.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.exerciseName,
        sets: e.sets,
      })),
    },
    intendedMusclesForSession
  );
  if (!sharedCoverage.ok) {
    warnings.push(...sharedCoverage.issues);
  }

  // Muscle-set validation is v1 heuristic: conservative thresholds + direct-when-usual.
  const directSets = countDirectMuscleSetsByStimulusForBuiltDay(built as any);
  const totalSets = countMuscleSetsByStimulusForBuiltDay(built as any);

  for (const g of intendedMusclesForSession) {
    const rule = MUSCLE_GROUP_RULES[g];
    const d = directSets[g] ?? 0;
    const t = totalSets[g] ?? 0;

    if (rule.directWorkUsuallyNeeded) {
      if (d < rule.typicalPerSessionSetRange.min) {
        warnings.push(`${rule.displayName} appears under-covered: only ~${Math.round(d)} direct set(s) on this session.`);
      }
    } else {
      if (t < rule.typicalPerSessionSetRange.min) {
        warnings.push(`${rule.displayName} appears under-covered: only ~${Math.round(t)} set(s) on this session.`);
      }
    }

    // v1 is heuristic, not dogma: allow a small slack because we count max(setMin,setMax) as a conservative estimate.
    if (t > rule.typicalPerSessionSetRange.high * 1.25) {
      warnings.push(
        `${rule.displayName} volume on this session looks high (~${Math.round(t)} set(s)); watch recovery and avoid stacking similar patterns.`
      );
    }
  }

  // Daily distribution check (from uploaded PDF minimum viable app logic):
  // if one intended muscle dominates most of the session's direct set volume, flag as potential overstack.
  const totalDirectForIntended = intendedMusclesForSession.reduce((sum, g) => sum + (directSets[g] ?? 0), 0);
  if (totalDirectForIntended > 0) {
    for (const g of intendedMusclesForSession) {
      const share = (directSets[g] ?? 0) / totalDirectForIntended;
      if (share > 0.5) {
        const name = MUSCLE_GROUP_RULES[g].displayName;
        warnings.push(
          `${name} dominates this session (~${Math.round(share * 100)}% of direct intended-muscle volume); consider balancing patterns unless emphasis is intentional.`
        );
      }
    }
  }

  const hasHorizontalPush = countBy(
    metas,
    (e) => e.tags.includes("horizontal_push") && ["main_compound", "secondary_compound", "machine_compound"].includes(e.role)
  );
  const hasVerticalPush = countBy(
    metas,
    (e) => e.tags.includes("vertical_push") && ["main_compound", "secondary_compound", "machine_compound"].includes(e.role)
  );
  const hasChestIso = countBy(metas, (e) => e.tags.includes("chest") && e.role === "isolation");
  const hasTriIso = countBy(
    metas,
    (e) => (e.tags.includes("triceps") || e.primaryMuscles.some((p) => p.toLowerCase().includes("triceps"))) && (e.role === "isolation" || e.role === "accessory")
  );

  const hasVertPull = countBy(metas, (e) => e.tags.includes("vertical_pull"));
  const hasHorizPull = countBy(metas, (e) => e.tags.includes("horizontal_pull"));
  const hasRearOrUpperIso = countBy(
    metas,
    (e) =>
      e.role === "isolation" &&
      e.tags.includes("pull") &&
      e.tags.includes("back") &&
      !e.tags.includes("biceps")
  );
  const hasBicepsIso = countBy(
    metas,
    (e) =>
      e.role === "isolation" &&
      (e.tags.includes("biceps") || e.primaryMuscles.some((p) => p.toLowerCase().includes("biceps")))
  );

  const hasInclineCompound = countBy(
    metas,
    (e) =>
      e.movementPattern.includes("incline") &&
      ["main_compound", "secondary_compound", "machine_compound"].includes(e.role)
  );

  const quadComp = countBy(
    metas,
    (e) => e.tags.includes("quad_dominant") && ["main_compound", "machine_compound", "secondary_compound"].includes(e.role)
  );
  const hinge = countBy(
    metas,
    (e) => e.tags.includes("hip_hinge") && ["main_compound", "secondary_compound"].includes(e.role)
  );
  const quadAny = countBy(metas, (e) => e.tags.includes("quad_dominant"));
  const hamIso = countBy(
    metas,
    (e) => e.tags.includes("hamstring") && e.role === "isolation"
  );
  const calf = countBy(metas, (e) => e.tags.includes("calf"));

  const isolationCount = countBy(metas, (e) => e.role === "isolation" || e.role === "accessory");

  if (st === "push") {
    if (hasHorizontalPush < 1) warnings.push("Push day missing a clear horizontal chest press.");
    if (hasVerticalPush < 1) warnings.push("Push day missing a vertical shoulder press (e.g. overhead press).");

    // Incline / upper chest: flat press alone leaves the clavicular head undertrained.
    if (hasInclineCompound < 1) {
      warnings.push(
        "Push day missing an incline/upper-chest compound (e.g. incline_dumbbell_press). Flat press targets mid-chest; incline press is needed to train the clavicular head. Add incline_dumbbell_press or similar."
      );
    }

    // Medial delt: lateral raise is mandatory — pressing alone does not train it.
    const hasLateralRaise = countBy(
      metas,
      (e) => e.tags.includes("lateral_raise") || (e.tags.includes("shoulders") && (e.role === "isolation" || e.role === "accessory") && !e.tags.includes("vertical_push"))
    );
    if (hasLateralRaise < 1) {
      warnings.push("Push day: medial delt (lateral raise) not covered — pressing alone does not train the side delt effectively.");
    }

    // Triceps: two distinct heads need two different exercises.
    const hasOverheadTri = countBy(
      metas,
      (e) =>
        e.id === "triceps_overhead_extension" ||
        e.tags.includes("triceps_long_head") ||
        e.movementPattern === "elbow_extension_overhead"
    );
    const hasPushdownTri = countBy(
      metas,
      (e) =>
        e.id === "triceps_pushdown" ||
        e.tags.includes("triceps_lateral_head") ||
        (e.primaryMuscles.some((p) => p.toLowerCase().includes("triceps")) && e.movementPattern === "elbow_extension")
    );
    if (hasTriIso < 1) {
      warnings.push("Push day missing direct triceps work.");
    } else if (hasTriIso < 2) {
      warnings.push(
        "Push day has only one triceps exercise. The triceps long head requires overhead loading (triceps_overhead_extension) while the lateral/medial heads are best trained by pushdowns (triceps_pushdown). Add both for complete triceps development."
      );
    } else if (hasOverheadTri < 1) {
      warnings.push(
        "Push day triceps work missing an overhead extension (triceps_overhead_extension). The long head — the largest triceps portion — needs a stretched position; pushdowns alone cannot replicate this. Add triceps_overhead_extension."
      );
    } else if (hasPushdownTri < 1) {
      warnings.push(
        "Push day triceps work missing a pushdown (triceps_pushdown). Overhead extensions bias the long head; add triceps_pushdown to also target the lateral and medial heads."
      );
    }

    if (intent?.moreIsolation && isolationCount < 3) {
      warnings.push("More isolation requested: expected at least three isolation/accessory movements on push day.");
    }
  }

  if (st === "pull" || st === "back") {
    if (hasVertPull < 1) warnings.push("Pull day missing a vertical pull (lat pulldown or pull-up).");
    if (hasHorizPull < 1) warnings.push("Pull day missing a horizontal pull / row.");
    if (hasRearOrUpperIso < 1)
      warnings.push("Pull day missing rear-delt / upper-back isolation (face pull or rear fly).");

    // Biceps: two distinct curl grips target different heads — mirrors push requiring 2 tricep exercises.
    const hasSupinatedCurl = countBy(
      metas,
      (e) =>
        e.id === "biceps_curl" ||
        (e.primaryMuscles.some((p) => p.toLowerCase().includes("biceps")) &&
          e.movementPattern === "elbow_flexion" &&
          e.lengthBias === "neutral")
    );
    const hasNeutralCurl = countBy(
      metas,
      (e) =>
        e.id === "hammer_curl" ||
        (e.primaryMuscles.some((p) => p.toLowerCase().includes("biceps")) &&
          e.movementPattern === "elbow_flexion" &&
          e.lengthBias !== "neutral" &&
          e.id !== "biceps_curl")
    );

    if (hasBicepsIso < 1) {
      warnings.push("Pull day missing direct biceps work.");
    } else if (hasBicepsIso < 2) {
      warnings.push(
        "Pull day has only one bicep exercise. A supinated curl (biceps_curl, short-head emphasis) and a neutral/hammer curl (hammer_curl, long-head + brachialis) target distinct aspects of the biceps. Add both."
      );
    } else if (hasSupinatedCurl < 1) {
      warnings.push(
        "Pull day biceps missing a supinated curl (biceps_curl). Hammer curls alone bias the long head; add a standard supinated curl for full biceps development."
      );
    } else if (hasNeutralCurl < 1) {
      warnings.push(
        "Pull day biceps missing a neutral/hammer curl (hammer_curl). Supinated curls alone under-develop the brachialis and long head; add hammer_curl."
      );
    }

    if (intent?.moreIsolation && isolationCount < 3) {
      warnings.push("More isolation requested: expected extra curl/rear-delt or similar on pull day.");
    }
  }

  if (st === "upper") {
    const compoundCount = countBy(metas, (e) =>
      ["main_compound", "secondary_compound", "machine_compound"].includes(e.role)
    );
    if (hasHorizontalPush < 1) {
      warnings.push("Upper day missing a horizontal pressing pattern (bench / incline / similar).");
    }
    if (hasHorizPull < 1 && hasVertPull < 1) {
      warnings.push("Upper day missing a pull (row, pulldown, or chin-up).");
    }
    if (compoundCount < 3) {
      warnings.push("Upper day expected at least three compound upper movements.");
    }
    if (built.exercises.length < 4) {
      warnings.push(`Upper day is thin (${built.exercises.length} exercise(s)); expected at least four movements.`);
    }
  }

  if (st === "legs" || st === "lower") {
    if (quadComp < 1) warnings.push("Leg day missing a quad-dominant compound.");
    if (hinge < 1) warnings.push("Leg day missing a hinge pattern.");
    if (quadAny < 2) warnings.push("Leg day should include a second quad-focused movement.");
    if (hamIso < 1) warnings.push("Leg day missing hamstring isolation.");
    if (calf < 1) warnings.push("Leg day missing calf work.");
    if (intent?.moreIsolation && isolationCount < 4) {
      warnings.push("More isolation requested: leg day should stack more direct isolation (curl, extension, calves, etc.).");
    }
  }

  const baseTemplateCount =
    st === "push"
      ? 6
      : st === "pull"
        ? 5
        : st === "legs" || st === "lower"
          ? 6
          : st === "upper"
            ? 6
            : 4;
  const suggestedTargetCount = Math.max(built.exercises.length + 1, baseTemplateCount);

  return {
    ok: warnings.length === 0,
    warnings,
    suggestedTargetCount,
  };
}

export function sessionTypesNeedingFullLegTemplate(): SessionType[] {
  return ["legs", "lower"];
}
