import type { AssistantStructuredProgramme } from "@/lib/programmePipeline/types";
import { mapTargetTokenToMuscleGroup } from "@/lib/muscleGroupMapper";

function dayTargets(day: AssistantStructuredProgramme["days"][number]): string[] {
  return (day.targetMuscles ?? []).map((x) => x.toLowerCase());
}

export function evaluateSplitCoverage(programme: AssistantStructuredProgramme): {
  missingMuscles: string[];
  skewedMuscleEmphasis: string[];
} {
  const counts = new Map<string, number>();
  for (const d of programme.days ?? []) {
    for (const m of dayTargets(d)) {
      const key = mapTargetTokenToMuscleGroup(m) ?? m;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const large = ["chest", "lats_upper_back", "quads", "hamstrings", "glutes"];
  const missingMuscles = large.filter((m) => (counts.get(m) ?? 0) === 0);
  const skewedMuscleEmphasis = [...counts.entries()]
    .filter(([, n]) => n >= Math.max(3, Math.ceil(programme.days.length * 0.8)))
    .map(([k]) => k);
  return { missingMuscles, skewedMuscleEmphasis };
}

export function evaluateSplitFrequency(programme: AssistantStructuredProgramme): {
  estimatedExposures: Record<string, number>;
} {
  const out: Record<string, number> = {};
  for (const d of programme.days ?? []) {
    for (const m of dayTargets(d)) {
      const key = mapTargetTokenToMuscleGroup(m) ?? m;
      out[key] = (out[key] ?? 0) + 1;
    }
  }
  return { estimatedExposures: out };
}

export function evaluateRestSpacing(programme: AssistantStructuredProgramme): string[] {
  const issues: string[] = [];
  const large = new Set(["chest", "back", "quads", "hamstrings", "glutes", "lats_upper_back"]);
  for (let i = 1; i < (programme.days?.length ?? 0); i++) {
    const prev = new Set(dayTargets(programme.days[i - 1]));
    const cur = new Set(dayTargets(programme.days[i]));
    for (const m of large) {
      if (prev.has(m) && cur.has(m)) {
        issues.push(`Back-to-back loading for ${m} on ${programme.days[i - 1].dayLabel} -> ${programme.days[i].dayLabel}.`);
      }
    }
  }
  return issues;
}

export function detectSkewedMuscleEmphasis(programme: AssistantStructuredProgramme): string[] {
  return evaluateSplitCoverage(programme).skewedMuscleEmphasis;
}

export function detectUnrealisticSplit(programme: AssistantStructuredProgramme): string[] {
  const issues: string[] = [];
  if ((programme.days?.length ?? 0) < 2) issues.push("Split has too few days to distribute workload sensibly.");
  for (const d of programme.days ?? []) {
    if ((d.exercises?.length ?? 0) > 9) issues.push(`${d.dayLabel} may be unrealistically long.`);
  }
  issues.push(...evaluateRestSpacing(programme));
  return issues;
}

export function suggestSplitFixes(programme: AssistantStructuredProgramme): string[] {
  const fixes: string[] = [];
  const coverage = evaluateSplitCoverage(programme);
  if (coverage.missingMuscles.length) {
    fixes.push(`Add exposure for missing groups: ${coverage.missingMuscles.join(", ")}.`);
  }
  const restIssues = evaluateRestSpacing(programme);
  if (restIssues.length) fixes.push("Reorder days to avoid repeated hard loading on consecutive days.");
  if (detectSkewedMuscleEmphasis(programme).length)
    fixes.push("Reduce over-emphasized group duplication and rebalance weekly targets.");
  return fixes;
}

