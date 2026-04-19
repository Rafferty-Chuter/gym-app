import type { SessionType } from "@/lib/sessionTemplates";
import type { SplitDayDef } from "@/lib/splitDefinition";

/** Best-effort session type for the single-session LLM planner from a programme day definition. */
export function inferSessionTypeHintFromDay(day: SplitDayDef): SessionType {
  const t = `${day.dayLabel} ${day.targetMuscles.join(" ")}`.toLowerCase();
  if (/\blegs?\b|\bleg day\b|\blower body\b/.test(t)) return "legs";
  if (/\bpush\b|\bpush day\b/.test(t)) return "push";
  if (/\bpull\b|\bpull day\b/.test(t)) return "pull";
  if (/\bchest\b/.test(t) && !/\bback\b/.test(t)) return "chest";
  if (/\bback\b/.test(t) && !/\bchest\b/.test(t)) return "back";
  if (/\bshoulders?\b|\bdelts?\b/.test(t)) return "shoulders";
  if (/\barms?\b/.test(t)) return "arms";
  if (/\bupper\b/.test(t)) return "upper";
  if (/\blower\b/.test(t)) return "legs";
  if (/\bfull[\s-_]?body\b/.test(t)) return "full_body";

  const m = new Set(day.targetMuscles.map((x) => x.toLowerCase().trim()));
  const hasChest = m.has("chest");
  const hasBack = m.has("back");
  const hasLegs = m.has("legs") || m.has("quads") || m.has("hamstrings") || m.has("glutes");
  const hasShoulders = m.has("shoulders");
  const hasArms = m.has("arms") || m.has("biceps") || m.has("triceps");

  if (hasLegs && !hasChest && !hasBack) return "legs";
  if (hasChest && (hasShoulders || m.has("triceps")) && !hasBack) return "push";
  if (hasBack && (hasArms || m.has("biceps")) && !hasChest) return "pull";
  if (hasChest && hasBack) return "upper";
  if (hasShoulders && hasArms) return "shoulders";

  return "upper";
}
