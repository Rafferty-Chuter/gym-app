import type { AssistantStructuredProgramme } from "@/lib/programmePipeline/types";
import type { MuscleGroupId } from "@/lib/muscleGroupRules";
import { MUSCLE_GROUP_RULES } from "@/lib/muscleGroupRules";
import { countDirectMuscleSetsByStimulusForProgrammeDay } from "@/lib/muscleSetCounting";
import { getExerciseByIdOrName } from "@/lib/exerciseMetadataLibrary";
import { mapExerciseToMuscleStimulus } from "@/lib/muscleGroupMapper";

function detectDayTypeFromQuestion(message: string): "push" | "pull" | "legs" | "upper" | "lower" | "arms" | null {
  const t = message.toLowerCase();
  if (/\bpush\s*day\b/.test(t) || /\bpush\b/.test(t) && /\bday\b/.test(t)) return "push";
  if (/\bpull\s*day\b/.test(t) || /\bpull\b/.test(t) && /\bday\b/.test(t)) return "pull";
  if (/\bleg\s*day\b/.test(t) || /\blegs?\b/.test(t) && /\bday\b/.test(t) || /\blower\s*body\b/.test(t)) return "legs";
  if (/\bupper\s*day\b/.test(t) || /\bupper\b/.test(t) && /\bday\b/.test(t)) return "upper";
  if (/\blower\s*day\b/.test(t) || /\blower\b/.test(t) && /\bday\b/.test(t)) return "lower";
  if (/\barms\s*day\b/.test(t) || /\barms\b/.test(t) && /\bday\b/.test(t)) return "arms";
  return null;
}

function pickMusclesToDiscuss(params: {
  dayType: ReturnType<typeof detectDayTypeFromQuestion>;
  message: string;
}): MuscleGroupId[] {
  const t = params.message.toLowerCase();
  const wantsShoulders = /\bshoulder/.test(t) || /\bdelts/.test(t);
  const wantsTriceps = /\btriceps/.test(t);
  const wantsBiceps = /\bbiceps/.test(t);
  const wantsQuads = /\bquads?\b/.test(t);
  const wantsHamstrings = /\bhamstrings?\b/.test(t);
  const wantsCalves = /\bcalves?\b/.test(t);

  if (params.dayType === "push") {
    const out: MuscleGroupId[] = [];
    if (wantsShoulders) out.push("delts");
    if (wantsTriceps) out.push("triceps");
    if (out.length === 0) out.push("chest", "delts", "triceps");
    return out;
  }
  if (params.dayType === "pull") {
    const out: MuscleGroupId[] = [];
    if (wantsShoulders) out.push("delts");
    if (wantsBiceps) out.push("biceps");
    if (out.length === 0) out.push("lats_upper_back", "delts", "biceps");
    return out;
  }
  if (params.dayType === "legs" || params.dayType === "lower") {
    const out: MuscleGroupId[] = [];
    if (wantsQuads) out.push("quads");
    if (wantsHamstrings) out.push("hamstrings");
    if (out.length === 0) out.push("quads", "hamstrings", "glutes");
    if (wantsCalves || out.includes("calves")) out.push("calves");
    // If the user didn't mention calves, still check them for “leg day enough” type questions.
    if (out.length <= 3 && !/\bcalf\b/.test(t) && /\benhough\b/.test(t)) out.push("calves");
    return out;
  }
  if (params.dayType === "upper") {
    return /\btriceps\b/.test(t)
      ? ["delts", "triceps", "chest"]
      : wantsBiceps
        ? ["lats_upper_back", "biceps", "delts"]
        : ["chest", "lats_upper_back", "delts", "biceps", "triceps"];
  }
  if (params.dayType === "arms") return wantsBiceps ? ["biceps", "triceps"] : ["biceps", "triceps"];
  return [];
}

function formatSetStatus(sets: number, rule: (typeof MUSCLE_GROUP_RULES)[keyof typeof MUSCLE_GROUP_RULES]): string {
  if (sets < rule.typicalPerSessionSetRange.min) return `under (~${Math.round(sets)} vs min ${rule.typicalPerSessionSetRange.min})`;
  if (sets > rule.typicalPerSessionSetRange.high) return `high (~${Math.round(sets)}; watch recovery)`;
  return `in a practical range (~${Math.round(sets)} sets)`;
}

export function programmeDayMuscleCoverageSummaryForQuestion(params: {
  programme: AssistantStructuredProgramme;
  message: string;
}): string | null {
  const dayType = detectDayTypeFromQuestion(params.message);
  if (!dayType) return null;

  const musclesToDiscuss = pickMusclesToDiscuss({ dayType, message: params.message });
  if (!musclesToDiscuss.length) return null;

  // Find a best-matching programme day.
  const dayIdx = params.programme.days.findIndex((d) => {
    const st = String(d.sessionType ?? "").toLowerCase();
    if (dayType === "push") return st === "push";
    if (dayType === "pull") return st === "pull";
    if (dayType === "legs") return st === "legs" || st === "lower";
    if (dayType === "upper") return st === "upper";
    if (dayType === "lower") return st === "lower" || st === "legs";
    if (dayType === "arms") return st === "arms";
    return false;
  });

  if (dayIdx < 0) return null;

  const directSetsByMuscle = countDirectMuscleSetsByStimulusForProgrammeDay(params.programme, dayIdx);

  const day = params.programme.days[dayIdx];
  const lines: string[] = [];
  lines.push(`Muscle-aware planned session coverage (from your active programme):`);
  lines.push(`Day: ${day.dayLabel} (${day.sessionType})`);

  for (const m of musclesToDiscuss) {
    const rule = MUSCLE_GROUP_RULES[m];
    const sets = directSetsByMuscle[m] ?? 0;

    // Long-length bias note (optional heuristic).
    let longBiasNote = "";
    if (rule.longLengthBias === "high") {
      const hasStretch = (day.exercises ?? []).some((ex) => {
        const meta = getExerciseByIdOrName(ex.exerciseName);
        if (!meta) return false;
        if (meta.lengthBias !== "stretch_biased") return false;
        return mapExerciseToMuscleStimulus(meta).direct.includes(m);
      });
      if (!hasStretch && sets < rule.typicalPerSessionSetRange.target) {
        longBiasNote = " (no obvious stretch-biased direct work detected)";
      }
    }

    lines.push(`- ${rule.displayName}: ${formatSetStatus(sets, rule)}${longBiasNote}`);
  }

  return lines.join("\n");
}

