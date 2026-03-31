import type { ParsedProgrammeRequest } from "@/lib/programmePipeline/types";
import type { SplitDefinition } from "@/lib/splitDefinition";
import {
  expandPplMuscleDays,
  expandUpperLowerMuscleDays,
  splitDefinitionFromCustomDayGroups,
  splitDefinitionFromStandardType,
} from "@/lib/programmePipeline/splitGroupings";
import { parseCustomDayGrouping } from "@/lib/trainingKnowledge/customSplitParsing";

export function buildSplitFromGrouping(
  parsed: ParsedProgrammeRequest,
  message: string
): SplitDefinition | null {
  const t = message.toLowerCase();
  if (parsed.customDayGroups?.length) {
    return splitDefinitionFromCustomDayGroups(parsed.customDayGroups, "Custom split");
  }
  const custom = parseCustomDayGrouping(message);
  if (custom.length >= 2) {
    return splitDefinitionFromCustomDayGroups(
      custom.map((d) => ({ dayLabel: d.dayLabel, targetMuscles: d.targetMuscles })),
      "Custom split"
    );
  }
  if (parsed.splitType === "ppl" || /\bppl|push\s*pull\s*legs\b/.test(t)) {
    if (/\btwice|2\s*x|two\s+times\b/.test(t)) return expandPplMuscleDays(2);
    return splitDefinitionFromStandardType("ppl");
  }
  if (parsed.splitType === "upper_lower" || /\bupper\s*[\/\s-]?\s*lower\b/.test(t)) {
    const days = Number(t.match(/\b([3-6])\s*day/)?.[1] ?? 0);
    if (days >= 3) return expandUpperLowerMuscleDays(days);
    return splitDefinitionFromStandardType("upper_lower");
  }
  if (parsed.splitType === "full_body" || /\bfull[\s_-]?body\b/.test(t)) {
    return splitDefinitionFromStandardType("full_body");
  }
  return null;
}

