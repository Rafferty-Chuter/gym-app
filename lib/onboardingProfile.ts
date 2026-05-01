// User onboarding profile — the 13-field "first-open" capture spec'd in
// Product/onboarding-profile-spec.md. Persists to localStorage; rendered into
// the assistant system prompt as a cached USER PROFILE block so the coach
// has stable context (vocabulary, constraints, schedule, sophistication)
// without re-asking every conversation.
//
// Required: units, bodyweightKg. Everything else is skippable; skipped fields
// render as "(not provided)" in the prompt block, which the assistant treats
// as a cold-start gap rather than an explicit no.

export type OnboardingSex = "M" | "F" | "prefer_not_to_say";
export type OnboardingYearsBand = "new" | "1-2" | "3-5" | "5+";
export type OnboardingGoal = "hypertrophy" | "strength" | "both" | "general fitness";
export type OnboardingDays = 2 | 3 | 4 | 5 | 6;
export type OnboardingSessionLength = 45 | 60 | 75 | 90;
export type OnboardingEquipmentBand =
  | "full_commercial"
  | "well_equipped_home"
  | "limited_home"
  | "bodyweight";
export type OnboardingMethodology =
  | "nippard"
  | "israetel"
  | "rp"
  | "helms"
  | "beardsley"
  | "mix"
  | "none";
export type OnboardingRirFamiliarity = "yes" | "sort_of" | "no";

export type OnboardingUnits = "kg" | "lb";

export type OnboardingProfile = {
  /** Field 1. Optional. */
  name?: string;
  /** Field 2. Required. */
  units: OnboardingUnits;
  /** Field 3. */
  sex?: OnboardingSex;
  /** Field 4. */
  age?: number;
  /** Field 5. Required. Stored canonically in kg; UI converts on display. */
  bodyweightKg?: number;
  /** Field 6. */
  yearsTrainingBand?: OnboardingYearsBand;
  /** Field 7. */
  primaryGoal?: OnboardingGoal;
  /** Field 8. */
  daysPerWeek?: OnboardingDays;
  /** Field 9. */
  sessionLengthMin?: OnboardingSessionLength;
  /** Field 10. */
  equipmentBand?: OnboardingEquipmentBand;
  /** Field 11. */
  constraintsText?: string;
  /** Field 12. Multi-select. */
  methodologies?: OnboardingMethodology[];
  /** Field 13. */
  rirFamiliarity?: OnboardingRirFamiliarity;
  /** ISO timestamp of first save — used by first-open routing as the "completed onboarding" gate. */
  completedAt?: string;
};

const STORAGE_KEY = "onboardingProfile";

export function isOnboardingComplete(profile: OnboardingProfile | null | undefined): boolean {
  if (!profile) return false;
  if (!profile.completedAt) return false;
  // Required-field check: units + bodyweight per spec.
  if (profile.units !== "kg" && profile.units !== "lb") return false;
  if (typeof profile.bodyweightKg !== "number" || !Number.isFinite(profile.bodyweightKg)) return false;
  return true;
}

export function loadOnboardingProfile(): OnboardingProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingProfile;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveOnboardingProfile(profile: OnboardingProfile): void {
  if (typeof window === "undefined") return;
  const toSave: OnboardingProfile = {
    ...profile,
    completedAt: profile.completedAt ?? new Date().toISOString(),
  };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    window.dispatchEvent(new Event("onboardingProfileChanged"));
  } catch {
    /* swallow — localStorage failures shouldn't crash the form */
  }
}

const SEX_LABELS: Record<OnboardingSex, string> = {
  M: "M",
  F: "F",
  prefer_not_to_say: "prefer not to say",
};

const YEARS_LABELS: Record<OnboardingYearsBand, string> = {
  new: "new to lifting",
  "1-2": "1–2 years",
  "3-5": "3–5 years",
  "5+": "5+ years",
};

const EQUIPMENT_LABELS: Record<OnboardingEquipmentBand, string> = {
  full_commercial: "full commercial gym",
  well_equipped_home: "well-equipped home gym",
  limited_home: "limited home setup",
  bodyweight: "bodyweight only",
};

const RIR_LABELS: Record<OnboardingRirFamiliarity, string> = {
  yes: "familiar with RIR/RPE",
  sort_of: "roughly familiar with RIR/RPE",
  no: "not familiar with RIR/RPE — explain when used",
};

const NOT_PROVIDED = "(not provided)";

/**
 * Build the USER PROFILE prompt block. Skipped fields render as "(not provided)"
 * so the assistant can treat them as cold-start gaps rather than explicit nos.
 * Format follows Product/onboarding-profile-spec.md.
 */
export function formatUserProfileBlock(profile: OnboardingProfile | null | undefined): string {
  if (!profile) return "";

  const name = profile.name?.trim() || NOT_PROVIDED;
  const units = profile.units;
  const sex = profile.sex ? SEX_LABELS[profile.sex] : NOT_PROVIDED;
  const age = typeof profile.age === "number" && Number.isFinite(profile.age) ? `${profile.age}` : NOT_PROVIDED;
  const bw =
    typeof profile.bodyweightKg === "number" && Number.isFinite(profile.bodyweightKg)
      ? units === "lb"
        ? `${Math.round(profile.bodyweightKg * 2.20462)}lb`
        : `${Math.round(profile.bodyweightKg)}kg`
      : NOT_PROVIDED;
  const years = profile.yearsTrainingBand ? YEARS_LABELS[profile.yearsTrainingBand] : NOT_PROVIDED;
  const goal = profile.primaryGoal ?? NOT_PROVIDED;
  const days = profile.daysPerWeek ? `${profile.daysPerWeek}` : NOT_PROVIDED;
  const sessionLen = profile.sessionLengthMin ? `${profile.sessionLengthMin}` : NOT_PROVIDED;
  const equipment = profile.equipmentBand ? EQUIPMENT_LABELS[profile.equipmentBand] : NOT_PROVIDED;
  const constraints = profile.constraintsText?.trim() || "(none reported)";
  const rir = profile.rirFamiliarity ? RIR_LABELS[profile.rirFamiliarity] : NOT_PROVIDED;

  return [
    "USER PROFILE (self-reported during onboarding; user-edited is authoritative; treat (not provided) as a cold-start gap, not an explicit no):",
    `- Name: ${name}`,
    `- Sex: ${sex}, age ${age}, bodyweight ${bw}`,
    `- Training: ${years}, goal ${goal}`,
    `- Schedule: ${days} days/week, ${sessionLen}-min sessions`,
    `- Equipment: ${equipment}`,
    `- Constraints: ${constraints}`,
    `- RIR familiarity: ${rir}`,
  ].join("\n");
}
