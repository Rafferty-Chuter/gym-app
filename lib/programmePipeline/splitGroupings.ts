import type { SplitDefinition, SplitDayDef } from "@/lib/splitDefinition";

const PIPELINE_DEBUG = process.env.NODE_ENV !== "production";

/**
 * Standard split names map to muscle-group allocations only — no fixed exercise lists.
 */
export function splitDefinitionFromStandardType(
  splitType: "ppl" | "upper_lower" | "full_body" | "general",
  titleHint?: string
): SplitDefinition | null {
  if (splitType === "ppl") {
    if (PIPELINE_DEBUG) {
      console.log("[programmePipeline] standard split grouping used: ppl (muscle allocations only)");
    }
    return {
      title: titleHint?.trim() || "Push / Pull / Legs",
      source: "preset",
      days: [
        {
          dayLabel: "Push",
          targetMuscles: ["chest", "shoulders", "triceps"],
          notes: "Horizontal + vertical push",
        },
        {
          dayLabel: "Pull",
          targetMuscles: ["back", "biceps", "shoulders"],
          notes: "Vertical + horizontal pull; rear delt emphasis via template",
        },
        {
          dayLabel: "Legs",
          targetMuscles: ["quads", "hamstrings", "glutes", "calves"],
          notes: "Quad + hinge + isolation",
        },
      ],
    };
  }
  if (splitType === "upper_lower") {
    if (PIPELINE_DEBUG) {
      console.log("[programmePipeline] standard split grouping used: upper_lower (muscle allocations only)");
    }
    return {
      title: titleHint?.trim() || "Upper / Lower",
      source: "preset",
      days: [
        {
          dayLabel: "Upper",
          targetMuscles: ["chest", "back", "shoulders", "biceps", "triceps"],
          notes: "Chest, back, shoulders, arms",
        },
        {
          dayLabel: "Lower",
          targetMuscles: ["quads", "hamstrings", "glutes", "calves"],
          notes: "Quad + hinge + calves",
        },
      ],
    };
  }
  if (splitType === "full_body") {
    if (PIPELINE_DEBUG) {
      console.log("[programmePipeline] standard split grouping used: full_body (muscle allocations only)");
    }
    return {
      title: titleHint?.trim() || "Full body",
      source: "preset",
      days: [
        {
          dayLabel: "Full body",
          targetMuscles: [
            "chest",
            "back",
            "shoulders",
            "biceps",
            "triceps",
            "quads",
            "hamstrings",
            "glutes",
            "calves",
          ],
          notes: "Balanced full-body session",
        },
      ],
    };
  }
  return null;
}

export function splitDefinitionFromCustomDayGroups(
  days: Array<{ dayLabel: string; targetMuscles: string[] }>,
  titleHint?: string
): SplitDefinition {
  return {
    title: titleHint?.trim() || "Custom split",
    source: "parsed",
    days: days.map((d) => ({
      dayLabel: d.dayLabel,
      targetMuscles: d.targetMuscles,
      notes: undefined,
    })),
  };
}

/** Alternating upper/lower **muscle groupings** only (no session-template shortcuts). */
export function expandUpperLowerMuscleDays(dayCount: number, titleHint?: string): SplitDefinition {
  const ul = splitDefinitionFromStandardType("upper_lower");
  if (!ul || ul.days.length < 2) {
    return {
      title: titleHint?.trim() || `${dayCount}-Day Upper / Lower`,
      source: "preset",
      weeklyFrequencyHint: dayCount,
      days: [],
    };
  }
  const upper = ul.days[0];
  const lower = ul.days[1];
  const days: SplitDayDef[] = [];
  for (let i = 0; i < dayCount; i++) {
    const isUpper = i % 2 === 0;
    const template = isUpper ? upper : lower;
    days.push({
      dayLabel: isUpper ? `Upper ${Math.floor(i / 2) + 1}` : `Lower ${Math.floor(i / 2) + 1}`,
      targetMuscles: [...template.targetMuscles],
      notes: template.notes,
    });
  }
  return {
    title: titleHint?.trim() || `${dayCount}-Day Upper / Lower`,
    source: "preset",
    weeklyFrequencyHint: dayCount,
    days,
  };
}

/** Repeat PPL muscle-group days for N weekly cycles (e.g. 2 -> 6 days). */
export function expandPplMuscleDays(cycles: number, titleHint?: string): SplitDefinition {
  const ppl = splitDefinitionFromStandardType("ppl");
  if (!ppl || ppl.days.length < 3) {
    return {
      title: titleHint?.trim() || `PPL x${cycles}`,
      source: "preset",
      weeklyFrequencyHint: cycles * 3,
      days: [],
    };
  }

  const base = ppl.days;
  const days: SplitDayDef[] = [];
  for (let c = 0; c < cycles; c++) {
    for (let i = 0; i < base.length; i++) {
      const d = base[i];
      days.push({
        dayLabel: cycles > 1 ? `${d.dayLabel} ${c + 1}` : d.dayLabel,
        targetMuscles: [...d.targetMuscles],
        notes: d.notes,
      });
    }
  }
  return {
    title: titleHint?.trim() || (cycles > 1 ? `Push / Pull / Legs x${cycles}` : "Push / Pull / Legs"),
    source: "preset",
    weeklyFrequencyHint: cycles * 3,
    days,
  };
}

/** Body-part style week — muscle targets per day only. */
export function splitDefinitionBroMuscleOnly(): SplitDefinition {
  return {
    title: "Bro split (body-part)",
    source: "preset",
    days: [
      { dayLabel: "Chest", targetMuscles: ["chest"] },
      { dayLabel: "Back", targetMuscles: ["back"] },
      { dayLabel: "Shoulders", targetMuscles: ["shoulders"] },
      { dayLabel: "Legs", targetMuscles: ["quads", "hamstrings", "glutes", "calves"] },
      { dayLabel: "Arms", targetMuscles: ["biceps", "triceps"] },
    ],
  };
}
