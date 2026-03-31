import { tryParseOnDayStructure } from "@/lib/splitParser";
import {
  DAY_TYPE_RULES,
  inferDayTypeFromTargets,
  type DayType,
} from "@/lib/trainingKnowledge/sessionTemplates";

type ParsedCustomDay = { dayLabel: string; targetMuscles: string[]; dayType: DayType };

export function parseCustomDayGrouping(message: string): ParsedCustomDay[] {
  const parsed = tryParseOnDayStructure(message.trim());
  if (!parsed?.days?.length) return [];
  return parsed.days.map((d) => ({
    dayLabel: d.dayLabel,
    targetMuscles: d.targetMuscles,
    dayType: inferDayTypeFromTargets(d.targetMuscles),
  }));
}

export function mergeDayTypeRules(groupedMuscles: string[]): {
  dayType: DayType;
  cappedExerciseMax: number;
  requiredPatterns: string[];
} {
  const dayType = inferDayTypeFromTargets(groupedMuscles);
  const base = DAY_TYPE_RULES[dayType];
  const extraGroups = Math.max(0, groupedMuscles.length - 3);
  const cappedExerciseMax = Math.min(9, base.typicalExerciseCountRange.max + Math.floor(extraGroups / 2));
  return {
    dayType,
    cappedExerciseMax,
    requiredPatterns: base.requiredMovementPatterns,
  };
}

export function buildCustomDay(groupedMuscles: string[], context?: { dayLabel?: string }) {
  const merged = mergeDayTypeRules(groupedMuscles);
  return {
    dayLabel: context?.dayLabel ?? groupedMuscles.map((m) => m[0].toUpperCase() + m.slice(1)).join(" + "),
    targetMuscles: groupedMuscles,
    notes: `Custom day (${merged.dayType}) with capped size ${merged.cappedExerciseMax}.`,
  };
}

export function reviewCustomDay(groupedMuscles: string[], session: { exercises?: Array<unknown> }) {
  const merged = mergeDayTypeRules(groupedMuscles);
  const count = session.exercises?.length ?? 0;
  const warnings: string[] = [];
  if (count > merged.cappedExerciseMax) warnings.push("Custom day may be too long for quality execution.");
  if (groupedMuscles.length >= 4 && count < 5) warnings.push("Custom day may be underbuilt for number of muscle groups.");
  return {
    dayType: merged.dayType,
    warnings,
  };
}

