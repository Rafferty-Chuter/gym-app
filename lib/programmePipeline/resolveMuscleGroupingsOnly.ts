import type { SplitDefinition } from "@/lib/splitDefinition";
import { tryNDayMuscleGroupingFromMessage, tryParseOnDayStructure } from "@/lib/splitParser";
import type { ParsedProgrammeRequest } from "./types";
import {
  expandPplMuscleDays,
  expandUpperLowerMuscleDays,
  splitDefinitionBroMuscleOnly,
  splitDefinitionFromCustomDayGroups,
  splitDefinitionFromStandardType,
} from "./splitGroupings";
import { parseCustomDayGrouping } from "@/lib/trainingKnowledge/customSplitParsing";

/**
 * Resolves a weekly split as **muscle allocations per day only**.
 * Does not use legacy session-type (push/pull/legs) template shortcuts — standard names map via `splitGroupings` only.
 */
export function resolveMuscleGroupingsOnly(
  parsed: ParsedProgrammeRequest,
  rawMessage: string
): SplitDefinition | null {
  const trimmed = rawMessage.trim();
  const t = trimmed.toLowerCase();

  if (parsed.customDayGroups && parsed.customDayGroups.length > 0) {
    return splitDefinitionFromCustomDayGroups(parsed.customDayGroups);
  }
  const parsedCustom = parseCustomDayGrouping(trimmed);
  if (parsedCustom.length >= 2) {
    return splitDefinitionFromCustomDayGroups(
      parsedCustom.map((d) => ({ dayLabel: d.dayLabel, targetMuscles: d.targetMuscles })),
      "Custom split"
    );
  }

  const onDay = tryParseOnDayStructure(trimmed);
  if (onDay && onDay.days.length >= 2 && onDay.days.some((d) => d.targetMuscles.length > 0)) {
    return onDay;
  }

  const mentionsPpl = /\b(ppl|push\s*pull\s*legs|push\s*pull)\b/.test(t);
  const mentionsUl = /\b(upper\s*[\/\s-]?\s*lower|upper lower)\b/.test(t);
  const mentionsFb = /\bfull[\s_-]?body\b/.test(t);
  const dayNumMatch = t.match(/\b([3-6])\s*(?:day|days)\b/);
  const nDays = dayNumMatch ? Number(dayNumMatch[1]) : null;

  if (parsed.splitType === "ppl" || mentionsPpl) {
    const wantsPplTwiceWeekly =
      /\b(twice|two\s+times|2\s*x|2\s*\/\s*week)\b/.test(t) ||
      (parsed.frequency != null && parsed.frequency >= 2 && /\b(?:times?\s+(?:a\s+)?week|x\s*\/\s*week|\/\s*week)\b/.test(t));
    if (wantsPplTwiceWeekly) {
      return expandPplMuscleDays(2);
    }
    return splitDefinitionFromStandardType("ppl");
  }

  if (parsed.splitType === "full_body" || mentionsFb) {
    return splitDefinitionFromStandardType("full_body");
  }

  if (parsed.splitType === "upper_lower" || mentionsUl) {
    if (nDays && nDays >= 3) {
      return expandUpperLowerMuscleDays(nDays);
    }
    return splitDefinitionFromStandardType("upper_lower");
  }

  if (/\b(bro split|body\s*part|one muscle per day)\b/.test(t)) {
    return splitDefinitionBroMuscleOnly();
  }

  const nDay = tryNDayMuscleGroupingFromMessage(trimmed);
  if (nDay && nDay.days.length > 0) {
    return nDay;
  }

  if (parsed.splitType === "custom" && onDay && onDay.days.length > 0) {
    return onDay;
  }

  return null;
}
