/**
 * The physique profile merges the onboarding profile (sex, age, height,
 * units) with physique-only settings. Reads storage; everything downstream
 * is pure.
 */

import { loadOnboardingProfile, saveOnboardingProfile, type OnboardingProfile, type OnboardingYearsBand } from "@/lib/onboardingProfile";
import { profileStore, weighInsRepo, foodEntriesRepo } from "@/lib/physique/io/repos";
import type { PhysiqueProfile, Sex } from "@/lib/physique/types";

export const DEFAULT_PHYSIQUE_PROFILE: PhysiqueProfile = {
  generalActivity: "moderate",
  checkInWeekday: 1,
  proteinLevel: "moderate",
  dietType: "balanced",
  sleepGoalH: 8,
  schemaVersion: 1,
};

/** Default age when onboarding has none (02 §1.1). OURS. */
export const DEFAULT_AGE = 30;

export type ResolvedProfile = PhysiqueProfile & {
  sex: Sex;
  age: number;
  /** Fields the goal flow must ask for before a goal can be created. */
  missing: Array<"heightCm" | "sex">;
};

function coerceSex(v: unknown): Sex | undefined {
  return v === "M" || v === "F" || v === "prefer_not_to_say" ? v : undefined;
}

function coerceActivity(v: unknown): PhysiqueProfile["generalActivity"] {
  return v === "low" || v === "moderate" || v === "high" ? v : DEFAULT_PHYSIQUE_PROFILE.generalActivity;
}

export function resolveProfile(
  onboarding: OnboardingProfile | null,
  stored: PhysiqueProfile | null,
  firstLoggedDate: string | null
): ResolvedProfile {
  const base: PhysiqueProfile = { ...DEFAULT_PHYSIQUE_PROFILE, ...(stored ?? {}) };
  // Stored values are checked as onboarding's are, so a stray value never reaches the maintenance formula as NaN.
  base.generalActivity = coerceActivity(base.generalActivity);
  const sex = coerceSex(onboarding?.sex) ?? coerceSex(base.sex);
  const age =
    typeof onboarding?.age === "number" && Number.isFinite(onboarding.age) ? onboarding.age : base.age ?? DEFAULT_AGE;
  const heightCm =
    typeof onboarding?.heightCm === "number" && Number.isFinite(onboarding.heightCm) ? onboarding.heightCm : base.heightCm;
  const missing: ResolvedProfile["missing"] = [];
  if (!heightCm) missing.push("heightCm");
  if (!sex) missing.push("sex");
  return {
    ...base,
    sex: sex ?? "prefer_not_to_say",
    age,
    heightCm,
    expenditureStartDate: base.expenditureStartDate ?? firstLoggedDate ?? undefined,
    missing,
  };
}

/** First day with both a weigh-in and logged food (02 §4.2 seed date). */
export function firstLoggedDate(weighInDates: readonly string[], foodDates: readonly string[]): string | null {
  const food = new Set(foodDates);
  const both = weighInDates.filter((d) => food.has(d)).sort();
  if (both.length > 0) return both[0];
  return null;
}

export async function getPhysiqueProfile(): Promise<ResolvedProfile> {
  const onboarding = loadOnboardingProfile();
  const stored = await profileStore.get();
  const [weighIns, food] = await Promise.all([weighInsRepo.list(), foodEntriesRepo.list()]);
  return resolveProfile(
    onboarding,
    stored,
    firstLoggedDate(
      weighIns.map((w) => w.date),
      food.map((f) => f.date)
    )
  );
}

/** Synchronous variant for render paths (uses repo snapshots). */
export function getPhysiqueProfileSync(): ResolvedProfile {
  const onboarding = loadOnboardingProfile();
  const stored = profileStore.snapshot();
  return resolveProfile(
    onboarding,
    stored,
    firstLoggedDate(
      weighInsRepo.snapshot().map((w) => w.date),
      foodEntriesRepo.snapshot().map((f) => f.date)
    )
  );
}

export async function savePhysiqueProfile(patch: Partial<PhysiqueProfile>): Promise<void> {
  const current = (await profileStore.get()) ?? DEFAULT_PHYSIQUE_PROFILE;
  await profileStore.set({ ...current, ...patch, schemaVersion: 1 });
}

/** Merge the fields the goal flow collects into the onboarding profile (the canonical home for sex/age/height). */
export function saveOnboardingBasics(patch: { sex?: Sex; age?: number; heightCm?: number; yearsTrainingBand?: OnboardingYearsBand }): void {
  const current = loadOnboardingProfile() ?? ({ units: "kg" } as OnboardingProfile);
  saveOnboardingProfile({ ...current, ...patch });
}
