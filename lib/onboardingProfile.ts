// Canonical user profile. Single source of truth for both the on-screen
// profile form and the assistant's USER PROFILE prompt block.
//
// History: there used to be two parallel forms (`userCoachingProfile` and
// this onboarding profile). They were consolidated in P0.4. Legacy keys are
// migrated into this profile on load so existing user data is preserved.

export type OnboardingSex = "M" | "F" | "prefer_not_to_say";
export type OnboardingYearsBand = "new" | "1-2" | "3-5" | "5+";
export type OnboardingGoal = "hypertrophy" | "strength" | "both" | "general fitness";
export type OnboardingDays = 2 | 3 | 4 | 5 | 6;
export type OnboardingSessionLength = 45 | 60 | 75 | 90;
export type OnboardingRirFamiliarity = "yes" | "sort_of" | "no";
export type OnboardingUnits = "kg" | "lb";

/** Canonical equipment chip keys. Multi-select. */
export const EQUIPMENT_KEYS = [
  "barbell",
  "dumbbells",
  "machines",
  "cables",
  "bodyweight",
  "cardio",
] as const;
export type OnboardingEquipment = (typeof EQUIPMENT_KEYS)[number];

export const EQUIPMENT_LABELS: Record<OnboardingEquipment, string> = {
  barbell: "Barbell",
  dumbbells: "Dumbbells",
  machines: "Machines",
  cables: "Cables",
  bodyweight: "Bodyweight",
  cardio: "Cardio",
};

export type OnboardingProfile = {
  /** Optional display name the coach addresses the user by. */
  name?: string;
  /** Required. Unit system for inputs and AI responses. */
  units: OnboardingUnits;
  sex?: OnboardingSex;
  age?: number;
  /** Required. Stored canonically in kg; UI converts on display. */
  bodyweightKg?: number;
  /** Stored canonically in cm; UI converts on display when units = lb (inches). */
  heightCm?: number;
  yearsTrainingBand?: OnboardingYearsBand;
  primaryGoal?: OnboardingGoal;
  daysPerWeek?: OnboardingDays;
  sessionLengthMin?: OnboardingSessionLength;
  /** Multi-select equipment chips. */
  equipment?: OnboardingEquipment[];
  constraintsText?: string;
  /** Free-text the user told the coach — most valuable signal for the assistant. */
  trainingPrioritiesText?: string;
  rirFamiliarity?: OnboardingRirFamiliarity;
  /** ISO timestamp of first save — used by first-open routing as the "completed onboarding" gate. */
  completedAt?: string;
};

const STORAGE_KEY = "onboardingProfile";
const LEGACY_PROFILE_KEY = "userCoachingProfile";
const LEGACY_UNIT_KEY = "weightUnit";

export function isOnboardingComplete(profile: OnboardingProfile | null | undefined): boolean {
  if (!profile) return false;
  if (!profile.completedAt) return false;
  if (profile.units !== "kg" && profile.units !== "lb") return false;
  if (typeof profile.bodyweightKg !== "number" || !Number.isFinite(profile.bodyweightKg)) return false;
  return true;
}

// Legacy single-select bands → multi-select chip arrays. Conservative mapping:
// only expand to chips the user almost certainly has under that band.
const LEGACY_EQUIPMENT_BAND_MAP: Record<string, OnboardingEquipment[]> = {
  full_commercial: ["barbell", "dumbbells", "machines", "cables", "cardio", "bodyweight"],
  well_equipped_home: ["barbell", "dumbbells", "machines", "cables", "bodyweight"],
  limited_home: ["dumbbells", "bodyweight"],
  bodyweight: ["bodyweight"],
};

function normalizeEquipmentKey(raw: string): OnboardingEquipment | null {
  const k = raw.trim().toLowerCase();
  if (!k) return null;
  // Legacy chip keys from userCoachingProfile.
  if (k === "dumbbell" || k === "dumbells") return "dumbbells";
  if (k === "machine") return "machines";
  if (k === "cable") return "cables";
  if (k === "cardio machines") return "cardio";
  if ((EQUIPMENT_KEYS as readonly string[]).includes(k)) return k as OnboardingEquipment;
  return null;
}

function normalizeEquipmentList(raw: unknown): OnboardingEquipment[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const seen = new Set<OnboardingEquipment>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const key = normalizeEquipmentKey(item);
    if (key) seen.add(key);
  }
  return seen.size > 0 ? Array.from(seen) : undefined;
}

type LegacyOnboardingShape = {
  equipmentBand?: string;
  methodologies?: unknown;
  equipment?: unknown;
  heightCm?: unknown;
  trainingPrioritiesText?: unknown;
};

type LegacyUserCoachingProfile = {
  goal?: unknown;
  trainingDaysAvailable?: unknown;
  equipment?: unknown;
  injuries?: unknown;
  trainingPrioritiesText?: unknown;
  availableSessionTime?: unknown;
};

/**
 * Migrate any pre-P0.4 storage into the canonical onboarding profile.
 * Pure read-side merge — caller persists if anything was filled in.
 */
function applyLegacyMigration(profile: OnboardingProfile): { merged: OnboardingProfile; changed: boolean } {
  if (typeof window === "undefined") return { merged: profile, changed: false };

  const merged: OnboardingProfile = { ...profile };
  const legacyShape = profile as OnboardingProfile & LegacyOnboardingShape;
  let changed = false;

  // 1. Equipment: prefer existing multi-select array; otherwise migrate from
  //    legacy single-select band; otherwise leave undefined.
  if (!merged.equipment || merged.equipment.length === 0) {
    const fromArray = normalizeEquipmentList(legacyShape.equipment);
    if (fromArray) {
      merged.equipment = fromArray;
      changed = true;
    } else if (typeof legacyShape.equipmentBand === "string") {
      const mapped = LEGACY_EQUIPMENT_BAND_MAP[legacyShape.equipmentBand];
      if (mapped && mapped.length > 0) {
        merged.equipment = [...mapped];
        changed = true;
      }
    }
  }

  // 2. Pull free-text + equipment + days from the legacy userCoachingProfile if present.
  try {
    const raw = window.localStorage.getItem(LEGACY_PROFILE_KEY);
    if (raw) {
      const legacy = JSON.parse(raw) as LegacyUserCoachingProfile;
      if (legacy && typeof legacy === "object") {
        if (!merged.trainingPrioritiesText) {
          const text = legacy.trainingPrioritiesText;
          if (typeof text === "string" && text.trim()) {
            merged.trainingPrioritiesText = text.trim();
            changed = true;
          }
        }
        if (!merged.equipment || merged.equipment.length === 0) {
          const eq = normalizeEquipmentList(legacy.equipment);
          if (eq) {
            merged.equipment = eq;
            changed = true;
          }
        }
        if (!merged.constraintsText && Array.isArray(legacy.injuries)) {
          const joined = legacy.injuries
            .map((v) => (typeof v === "string" ? v.trim() : ""))
            .filter((v) => v.length > 0)
            .join(", ");
          if (joined) {
            merged.constraintsText = joined;
            changed = true;
          }
        }
        if (!merged.daysPerWeek && typeof legacy.trainingDaysAvailable === "number") {
          const clamped = Math.max(2, Math.min(6, Math.round(legacy.trainingDaysAvailable)));
          if (clamped >= 2 && clamped <= 6) {
            merged.daysPerWeek = clamped as OnboardingDays;
            changed = true;
          }
        }
        if (!merged.sessionLengthMin && typeof legacy.availableSessionTime === "number") {
          const candidate = [45, 60, 75, 90].reduce((best, opt) =>
            Math.abs(opt - (legacy.availableSessionTime as number)) < Math.abs(best - (legacy.availableSessionTime as number))
              ? opt
              : best
          , 60) as OnboardingSessionLength;
          merged.sessionLengthMin = candidate;
          changed = true;
        }
      }
    }
  } catch {
    /* swallow — corrupt legacy entry should not block migration */
  }

  // 3. weightUnit legacy key → units if not already set.
  if (merged.units !== "kg" && merged.units !== "lb") {
    try {
      const u = window.localStorage.getItem(LEGACY_UNIT_KEY);
      if (u === "kg" || u === "lb") {
        merged.units = u;
        changed = true;
      }
    } catch {
      /* ignore */
    }
  }

  return { merged, changed };
}

export function loadOnboardingProfile(): OnboardingProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingProfile;
    if (!parsed || typeof parsed !== "object") return null;

    const { merged, changed } = applyLegacyMigration(parsed);
    if (changed) {
      // Persist the migrated shape so subsequent loads are cheap and the
      // legacy entries can be safely retired later.
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        /* ignore */
      }
    }
    return merged;
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

const RIR_LABELS: Record<OnboardingRirFamiliarity, string> = {
  yes: "familiar with RIR/RPE",
  sort_of: "roughly familiar with RIR/RPE",
  no: "not familiar with RIR/RPE — explain when used",
};

const NOT_PROVIDED = "(not provided)";

/**
 * Build the USER PROFILE prompt block. Skipped fields render as "(not provided)"
 * so the assistant can treat them as cold-start gaps rather than explicit nos.
 */
export function formatUserProfileBlock(profile: OnboardingProfile | null | undefined): string {
  if (!profile) return "";

  const name = profile.name?.trim() || NOT_PROVIDED;
  const units = profile.units;
  const sex = profile.sex ? SEX_LABELS[profile.sex] : NOT_PROVIDED;
  const age =
    typeof profile.age === "number" && Number.isFinite(profile.age) ? `${profile.age}` : NOT_PROVIDED;
  const bw =
    typeof profile.bodyweightKg === "number" && Number.isFinite(profile.bodyweightKg)
      ? units === "lb"
        ? `${Math.round(profile.bodyweightKg * 2.20462)}lb`
        : `${Math.round(profile.bodyweightKg)}kg`
      : NOT_PROVIDED;
  const height =
    typeof profile.heightCm === "number" && Number.isFinite(profile.heightCm)
      ? units === "lb"
        ? (() => {
            const totalInches = profile.heightCm! / 2.54;
            const feet = Math.floor(totalInches / 12);
            const inches = Math.round(totalInches - feet * 12);
            return `${feet}'${inches}"`;
          })()
        : `${Math.round(profile.heightCm)}cm`
      : NOT_PROVIDED;
  const years = profile.yearsTrainingBand ? YEARS_LABELS[profile.yearsTrainingBand] : NOT_PROVIDED;
  const goal = profile.primaryGoal ?? NOT_PROVIDED;
  const days = profile.daysPerWeek ? `${profile.daysPerWeek}` : NOT_PROVIDED;
  const sessionLen = profile.sessionLengthMin ? `${profile.sessionLengthMin}` : NOT_PROVIDED;
  const equipment =
    profile.equipment && profile.equipment.length > 0
      ? profile.equipment.map((k) => EQUIPMENT_LABELS[k].toLowerCase()).join(", ")
      : NOT_PROVIDED;
  const constraints = profile.constraintsText?.trim() || "(none reported)";
  const priorities = profile.trainingPrioritiesText?.trim() || NOT_PROVIDED;
  const rir = profile.rirFamiliarity ? RIR_LABELS[profile.rirFamiliarity] : NOT_PROVIDED;

  return [
    "USER PROFILE (self-reported; user-edited is authoritative; treat (not provided) as a cold-start gap, not an explicit no):",
    `- Name: ${name}`,
    `- Sex: ${sex}, age ${age}, bodyweight ${bw}, height ${height}`,
    `- Training: ${years}, goal ${goal}`,
    `- Schedule: ${days} days/week, ${sessionLen}-min sessions`,
    `- Equipment: ${equipment}`,
    `- Constraints: ${constraints}`,
    `- What the user told the coach matters: ${priorities}`,
    `- RIR familiarity: ${rir}`,
  ].join("\n");
}
