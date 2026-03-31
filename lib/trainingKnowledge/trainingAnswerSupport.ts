import type { AssistantStructuredProgramme } from "@/lib/programmePipeline/types";
import { MUSCLE_RULES, type MuscleRuleId } from "@/lib/trainingKnowledge/muscleRules";
import {
  detectMissingMovementPatterns,
  getPrimaryWorkForMuscle,
  getIndirectWorkForMuscle,
  suggestMissingWorkForMuscle,
} from "@/lib/trainingKnowledge/muscleCoverage";
import {
  explainWhatExerciseContributes,
} from "@/lib/trainingKnowledge/exerciseSelection";
import { areExercisesRedundant } from "@/lib/trainingKnowledge/exerciseRedundancy";
import { suggestSubstitute } from "@/lib/trainingKnowledge/exerciseSubstitutions";
import { getExerciseIntelligence } from "@/lib/trainingKnowledge/exerciseMetadata";
import { validateDayStructure } from "@/lib/trainingKnowledge/dayValidity";
import {
  evaluateRestSpacing,
  evaluateSplitCoverage,
  evaluateSplitFrequency,
  suggestSplitFixes,
} from "@/lib/trainingKnowledge/splitValidation";
import {
  classifySessionFatigue,
  getProgrammeFatigueProfile,
  getSessionFatigueScore,
} from "@/lib/trainingKnowledge/fatigueScoring";
import { estimateRecoveryWindow, isBackToBackSchedulingTooAggressive } from "@/lib/trainingKnowledge/recoveryHeuristics";

function detectMuscle(message: string): MuscleRuleId | null {
  const t = message.toLowerCase();
  if (/\bchest|pec/.test(t)) return "chest";
  if (/\b(back|lats?|upper back)\b/.test(t)) return "lats_upper_back";
  if (/\bshoulder|delts?\b/.test(t)) return "delts";
  if (/\bbiceps?\b/.test(t)) return "biceps";
  if (/\btriceps?\b/.test(t)) return "triceps";
  if (/\bquads?\b/.test(t)) return "quads";
  if (/\bhamstrings?\b/.test(t)) return "hamstrings";
  if (/\bglutes?\b/.test(t)) return "glutes";
  if (/\bcalves?\b/.test(t)) return "calves";
  if (/\b(core|abs?)\b/.test(t)) return "abs_core";
  return null;
}

function pickDay(programme: AssistantStructuredProgramme, message: string) {
  const t = message.toLowerCase();
  const day = programme.days.find((d) => {
    const s = d.sessionType.toLowerCase();
    return (
      (/\bpush\b/.test(t) && s.includes("push")) ||
      (/\bpull\b/.test(t) && s.includes("pull")) ||
      ((/\blegs?\b|\blower\b/.test(t)) && (s.includes("legs") || s.includes("lower"))) ||
      (/\bupper\b/.test(t) && s.includes("upper"))
    );
  });
  return day ?? programme.days[0];
}

export function tryAnswerFromTrainingKnowledge(params: {
  message: string;
  activeProgramme?: AssistantStructuredProgramme | null;
}): string | null {
  const text = params.message.toLowerCase();
  if (/\bdoes\s+bench\s+count\s+for\s+triceps\b/.test(text)) {
    const bench = getExerciseIntelligence("flat_barbell_bench_press");
    if (!bench) return null;
    return "Yes. Bench gives triceps meaningful indirect stimulus, but if triceps growth is a priority it usually works better to pair benching with at least one direct extension movement.";
  }
  if (/\bwhat\s+does\s+jm\s+press\b.*\b(train|hit)\b/.test(text) || /\bwhat\s+does\s+jm\s+press\s+actually\s+train\b/.test(text)) {
    return (
      explainWhatExerciseContributes("jm_press", "triceps hypertrophy") ??
      "JM Press is mostly triceps-focused pressing work, with some chest and shoulder contribution."
    );
  }
  if (/\bare\b.+\band\b.+\bredundant\b/.test(text)) {
    const pairs: Array<[string, string]> = [
      ["flat_barbell_bench_press", "flat_dumbbell_press"],
      ["lat_pulldown", "pull_up"],
      ["chest_supported_row", "barbell_row"],
    ];
    const hit = pairs.find(([a, b]) => text.includes(a.split("_")[0]) && text.includes(b.split("_")[0]));
    if (hit) {
      const r = areExercisesRedundant(hit[0], hit[1]);
      return r.redundant
        ? "Those two are highly overlapping. Keep one as the heavy anchor and swap the other for a different pattern or length-bias variation."
        : "They overlap a bit, but they can work together if you use different intent (load/rep focus or angle).";
    }
  }
  if (/\bwhat\s+should\s+replace\b/.test(text) && /\b(machine|equipment|don't have|dont have)\b/.test(text)) {
    const sub = suggestSubstitute("lat_pulldown", ["dumbbells", "bench", "pullup_bar"], []);
    if (sub) return `A practical swap is ${sub}; it keeps similar pulling intent with your available setup.`;
  }

  const p = params.activeProgramme;
  if (!p?.days?.length) return null;
  if (/\bis this session too fatiguing\b/.test(text) || (/\btoo fatiguing\b/.test(text) && /\bsession|workout\b/.test(text))) {
    const day = pickDay(p, params.message);
    const score = getSessionFatigueScore({
      sessionType: day.sessionType as any,
      exercises: day.exercises.map((e) => ({
        exerciseName: e.exerciseName,
        sets: e.sets,
        reps: e.reps,
        rir: e.rir,
      })),
    });
    const cls = classifySessionFatigue(score, (day.sessionType in ({ push:1,pull:1,legs:1,upper:1,lower:1,full_body:1,chest:1,back:1,shoulders:1,arms:1 } as any) ? day.sessionType : "upper") as any);
    return cls === "high"
      ? "This session is likely more fatiguing than needed right now. Keep the main compounds, then stop before adding another heavy lift."
      : "This looks manageable for fatigue if recovery is normal. Keep effort controlled and avoid taking every set to failure.";
  }
  if (/\bshould i add another exercise\b/.test(text)) {
    const day = pickDay(p, params.message);
    const score = getSessionFatigueScore({
      sessionType: day.sessionType as any,
      exercises: day.exercises.map((e) => ({
        exerciseName: e.exerciseName,
        sets: e.sets,
        reps: e.reps,
        rir: e.rir,
      })),
    });
    const cls = classifySessionFatigue(score, (day.sessionType as any));
    return cls === "high"
      ? "I would stop here. You already have enough useful work, and adding another exercise is likely more fatigue than stimulus."
      : "You can add one low-fatigue accessory if it fills a clear gap; skip another heavy compound.";
  }
  if (/\bis it okay to train this again tomorrow\b/.test(text)) {
    const day = pickDay(p, params.message);
    const first = (day.targetMuscles?.[0] ?? day.sessionType ?? "this muscle group").toString();
    const win = estimateRecoveryWindow(first);
    return `Usually give hard work on that area about ${win.min}-${win.max} hours before repeating it hard. If performance is down or soreness is high, wait longer or run a low-fatigue day.`;
  }
  if (/\blow[-\s]?fatigue mode\b/.test(text) || /\brecovery[-\s]?sensitive\b/.test(text)) {
    return "Low-fatigue mode keeps stimulus while reducing recovery cost: fewer sets, more reps in reserve, less failure work, and more machine/isolation emphasis over stacking heavy compounds.";
  }
  if (/\bis this push day too bloated\b/.test(text) || (/\bpush day\b/.test(text) && /\bbloated\b/.test(text))) {
    const day = pickDay(p, "push day");
    const v = validateDayStructure({
      dayLabel: day.dayLabel,
      targetMuscles: day.targetMuscles,
      exercises: day.exercises.map((e) => ({ exerciseName: e.exerciseName })),
    });
    if (v.issues.some((i) => i.toLowerCase().includes("bloated"))) {
      return `It looks bloated: ${v.issues.find((i) => i.toLowerCase().includes("bloated"))}. Trim one overlapping press and keep one direct delt + one direct triceps movement.`;
    }
    return "It doesn’t look excessively bloated right now. Keep it focused by capping overlap and making sure each movement has a clear job.";
  }
  if (
    /\bwhat'?s better for me\b/.test(text) &&
    /\b(ppl|upper\/?lower|upper lower)\b/.test(text)
  ) {
    const fatigue = getProgrammeFatigueProfile(p);
    const freq = evaluateSplitFrequency(p).estimatedExposures;
    const coverage = evaluateSplitCoverage(p);
    const rest = evaluateRestSpacing(p);
    const fixes = suggestSplitFixes(p);
    const chestExp = freq["chest"] ?? 0;
    const backExp = (freq["lats_upper_back"] ?? freq["back"] ?? 0) as number;
    return `For most people, the better split is the one you recover from and repeat consistently. In your current setup, chest/back exposures are about ${chestExp}/${backExp} per week, ${
      rest.length ? "recovery spacing has a few tight spots" : "recovery spacing looks reasonable"
    }, and ${coverage.missingMuscles.length ? `you’re missing ${coverage.missingMuscles.join(", ")}` : "major groups are covered"}. ${
      isBackToBackSchedulingTooAggressive(p) ? "Fatigue spacing looks aggressive in places." : "Fatigue spacing looks manageable."
    } ${
      fixes[0] ? `Best next tweak: ${fixes[0]}` : "If progress and recovery are good, either PPL or upper/lower can work well."
    } Weekly fatigue profile is roughly ${Math.round(fatigue.weeklyScore)} points.`;
  }
  const day = pickDay(p, params.message);
  const session = {
    targetMuscles: day.targetMuscles,
    exercises: day.exercises.map((e) => ({ exerciseName: e.exerciseName, sets: e.sets })),
  };
  const m = detectMuscle(params.message);
  if (m) {
    const rule = MUSCLE_RULES[m];
    const primary = Math.round(getPrimaryWorkForMuscle(session, m));
    const indirect = Math.round(getIndirectWorkForMuscle(session, m));
    const missingPatterns = detectMissingMovementPatterns(session, m);
    const status =
      primary < rule.typicalPerSessionSetRange.min
        ? "a bit light"
        : primary > rule.typicalPerSessionSetRange.high
          ? "on the high side"
          : "in a practical range";
    const patternLine = missingPatterns.length ? ` ${missingPatterns[0]}` : "";
    return `${rule.displayName} on ${day.dayLabel} is ${status} (about ${primary} direct + ${indirect} indirect sets). ${suggestMissingWorkForMuscle(
      session,
      m
    )}${patternLine}`;
  }
  if (/\bwhat'?s missing\b/i.test(params.message) && /\bleg|lower\b/i.test(params.message)) {
    const gaps: string[] = [];
    for (const mId of ["quads", "hamstrings", "glutes", "calves"] as MuscleRuleId[]) {
      const primary = getPrimaryWorkForMuscle(session, mId);
      if (primary < MUSCLE_RULES[mId].typicalPerSessionSetRange.min) gaps.push(MUSCLE_RULES[mId].displayName);
    }
    if (gaps.length) return `Main leg-day gaps right now: ${gaps.join(", ")}. Add one direct movement for the first gap and keep effort high with clean reps.`;
  }
  return null;
}

