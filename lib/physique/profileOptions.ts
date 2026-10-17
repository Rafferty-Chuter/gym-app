import type { BodyFatCategory, Sex } from "@/lib/physique/types";

/** Shared by the goal flow and the Profile page so the words never drift. */
export const SEX_OPTIONS: ReadonlyArray<{ v: Sex; label: string }> = [
  { v: "M", label: "Male" },
  { v: "F", label: "Female" },
  { v: "prefer_not_to_say", label: "Prefer not to say" },
];

export const BODY_FAT_OPTIONS: ReadonlyArray<{ v: BodyFatCategory; label: string }> = [
  { v: "lean", label: "Lean" },
  { v: "athletic", label: "Athletic" },
  { v: "average", label: "Average" },
  { v: "above_average", label: "Above average" },
  { v: "high", label: "High" },
];
