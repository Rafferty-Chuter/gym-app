"use client";

import {
  EQUIPMENT_KEYS,
  EQUIPMENT_LABELS,
  type OnboardingProfile,
  type OnboardingSex,
  type OnboardingYearsBand,
  type OnboardingGoal,
  type OnboardingDays,
  type OnboardingSessionLength,
  type OnboardingRirFamiliarity,
  type OnboardingEquipment,
  type OnboardingUnits,
} from "@/lib/onboardingProfile";

const SEX_OPTIONS: Array<{ value: OnboardingSex; label: string }> = [
  { value: "M", label: "M" },
  { value: "F", label: "F" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

const YEARS_OPTIONS: Array<{ value: OnboardingYearsBand; label: string }> = [
  { value: "new", label: "New to lifting" },
  { value: "1-2", label: "1–2 years" },
  { value: "3-5", label: "3–5 years" },
  { value: "5+", label: "5+ years" },
];

const GOAL_OPTIONS: Array<{ value: OnboardingGoal; label: string }> = [
  { value: "hypertrophy", label: "Hypertrophy" },
  { value: "strength", label: "Strength" },
  { value: "both", label: "Both" },
  { value: "general fitness", label: "General fitness" },
];

const DAY_OPTIONS: OnboardingDays[] = [2, 3, 4, 5, 6];
const SESSION_LENGTH_OPTIONS: OnboardingSessionLength[] = [45, 60, 75, 90];

const RIR_OPTIONS: Array<{ value: OnboardingRirFamiliarity; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "sort_of", label: "Sort of" },
  { value: "no", label: "No — explain when used" },
];

type Props = {
  value: OnboardingProfile;
  onChange: (next: OnboardingProfile) => void;
};

const labelClass = "label-section block mb-1.5";
const helperClass = "text-[11px] text-app-tertiary mt-1";
const inputClass = "input-app w-full px-3 py-2.5 text-sm";
const optClass = "px-3 py-2 rounded-xl border text-sm font-medium transition";
const optActive = "border-teal-500/50 bg-teal-950/40 text-teal-100";
const optInactive = "border-zinc-700/80 bg-zinc-900/80 text-app-secondary hover:border-teal-900/50 hover:text-white";

export function OnboardingProfileFields({ value, onChange }: Props) {
  function set<K extends keyof OnboardingProfile>(key: K, v: OnboardingProfile[K]): void {
    onChange({ ...value, [key]: v });
  }

  // Bodyweight is stored canonically in kg; display in user's chosen unit.
  const bwDisplay =
    typeof value.bodyweightKg === "number"
      ? value.units === "lb"
        ? Math.round(value.bodyweightKg * 2.20462)
        : Math.round(value.bodyweightKg)
      : "";

  function setBodyweightFromInput(raw: string): void {
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      onChange({ ...value, bodyweightKg: undefined });
      return;
    }
    const kg = value.units === "lb" ? num / 2.20462 : num;
    onChange({ ...value, bodyweightKg: kg });
  }

  // Height: stored in cm. Display cm when units=kg, otherwise inches (whole number).
  const heightDisplay =
    typeof value.heightCm === "number"
      ? value.units === "lb"
        ? Math.round(value.heightCm / 2.54)
        : Math.round(value.heightCm)
      : "";

  function setHeightFromInput(raw: string): void {
    const num = Number(raw);
    if (!Number.isFinite(num) || num <= 0) {
      onChange({ ...value, heightCm: undefined });
      return;
    }
    const cm = value.units === "lb" ? num * 2.54 : num;
    onChange({ ...value, heightCm: cm });
  }

  function toggleEquipment(key: OnboardingEquipment): void {
    const current = value.equipment ?? [];
    const has = current.includes(key);
    const next = has ? current.filter((k) => k !== key) : [...current, key];
    onChange({ ...value, equipment: next.length > 0 ? next : undefined });
  }

  return (
    <div className="space-y-5">
      {/* 1 — Display name (optional) */}
      <div>
        <label className={labelClass}>Display name (optional)</label>
        <input
          type="text"
          value={value.name ?? ""}
          onChange={(e) => set("name", e.target.value)}
          placeholder="What should the coach call you?"
          maxLength={40}
          className={inputClass}
        />
      </div>

      {/* 2 — Units (required) */}
      <div>
        <label className={labelClass}>Units <span className="text-teal-400">*</span></label>
        <div className="flex gap-3">
          {(["kg", "lb"] as OnboardingUnits[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => set("units", u)}
              className={`flex-1 py-3 rounded-xl border text-sm font-semibold transition ${
                value.units === u ? optActive : optInactive
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      {/* 3 — Sex */}
      <div>
        <label className={labelClass}>Sex</label>
        <div className="flex flex-wrap gap-2">
          {SEX_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set("sex", value.sex === o.value ? undefined : o.value)}
              className={`${optClass} ${value.sex === o.value ? optActive : optInactive}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 — Age */}
      <div>
        <label className={labelClass}>Age</label>
        <input
          type="number"
          inputMode="numeric"
          min={13}
          max={99}
          value={typeof value.age === "number" ? value.age : ""}
          onChange={(e) => {
            const n = Number(e.target.value);
            set("age", Number.isFinite(n) && n > 0 ? n : undefined);
          }}
          placeholder="e.g. 32"
          className={inputClass}
        />
      </div>

      {/* 5 — Bodyweight (required) */}
      <div>
        <label className={labelClass}>Bodyweight <span className="text-teal-400">*</span></label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={1}
            step={0.5}
            value={bwDisplay}
            onChange={(e) => setBodyweightFromInput(e.target.value)}
            placeholder={value.units === "lb" ? "e.g. 180" : "e.g. 82"}
            className={`${inputClass} flex-1`}
          />
          <span className="text-sm text-app-tertiary w-8">{value.units}</span>
        </div>
      </div>

      {/* 6 — Height */}
      <div>
        <label className={labelClass}>Height</label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={1}
            step={value.units === "lb" ? 1 : 0.5}
            value={heightDisplay}
            onChange={(e) => setHeightFromInput(e.target.value)}
            placeholder={value.units === "lb" ? "e.g. 70 in" : "e.g. 178"}
            className={`${inputClass} flex-1`}
          />
          <span className="text-sm text-app-tertiary w-8">{value.units === "lb" ? "in" : "cm"}</span>
        </div>
      </div>

      {/* 7 — Years training */}
      <div>
        <label className={labelClass}>Years training</label>
        <div className="flex flex-wrap gap-2">
          {YEARS_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set("yearsTrainingBand", value.yearsTrainingBand === o.value ? undefined : o.value)}
              className={`${optClass} ${value.yearsTrainingBand === o.value ? optActive : optInactive}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 8 — Primary goal */}
      <div>
        <label className={labelClass}>Primary goal</label>
        <div className="flex flex-wrap gap-2">
          {GOAL_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set("primaryGoal", value.primaryGoal === o.value ? undefined : o.value)}
              className={`${optClass} ${value.primaryGoal === o.value ? optActive : optInactive}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* 9 — Days/week */}
      <div>
        <label className={labelClass}>Days available per week</label>
        <div className="flex gap-2">
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => set("daysPerWeek", value.daysPerWeek === d ? undefined : d)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition ${
                value.daysPerWeek === d ? optActive : optInactive
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* 10 — Session length */}
      <div>
        <label className={labelClass}>Session length target</label>
        <div className="flex gap-2">
          {SESSION_LENGTH_OPTIONS.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => set("sessionLengthMin", value.sessionLengthMin === m ? undefined : m)}
              className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition ${
                value.sessionLengthMin === m ? optActive : optInactive
              }`}
            >
              {m === 90 ? "90+" : m} min
            </button>
          ))}
        </div>
      </div>

      {/* 11 — Equipment (multi-select chips) */}
      <div>
        <label className={labelClass}>Equipment</label>
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_KEYS.map((key) => {
            const active = (value.equipment ?? []).includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleEquipment(key)}
                className={`${optClass} ${active ? optActive : optInactive}`}
              >
                {EQUIPMENT_LABELS[key]}
              </button>
            );
          })}
        </div>
        <p className={helperClass}>Pick everything you have access to.</p>
      </div>

      {/* 12 — Constraints */}
      <div>
        <label className={labelClass}>Injuries / constraints (optional)</label>
        <textarea
          value={value.constraintsText ?? ""}
          onChange={(e) => set("constraintsText", e.target.value)}
          placeholder='e.g. "Left knee — avoid heavy back squat, hack squat fine"'
          className={`${inputClass} resize-none min-h-[80px]`}
        />
        <p className={helperClass}>The coach uses this so you don&rsquo;t have to mention it every time.</p>
      </div>

      {/* 13 — Tell the coach what matters */}
      <div>
        <label className={labelClass}>Tell the coach what matters (optional)</label>
        <textarea
          value={value.trainingPrioritiesText ?? ""}
          onChange={(e) => set("trainingPrioritiesText", e.target.value)}
          placeholder="e.g. Build muscle overall, bring up chest and arms, keep legs ticking over, avoid irritating left shoulder"
          className={`${inputClass} resize-none min-h-[96px]`}
        />
        <p className={helperClass}>Free-text. The coach reads this verbatim.</p>
      </div>

      {/* 14 — RIR familiarity */}
      <div>
        <label className={labelClass}>Familiar with RIR / RPE?</label>
        <div className="flex flex-wrap gap-2">
          {RIR_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => set("rirFamiliarity", value.rirFamiliarity === o.value ? undefined : o.value)}
              className={`${optClass} ${value.rirFamiliarity === o.value ? optActive : optInactive}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Convenience: returns true when the spec's two required fields are present. */
export function isOnboardingFormSavable(profile: OnboardingProfile): boolean {
  return (
    (profile.units === "kg" || profile.units === "lb") &&
    typeof profile.bodyweightKg === "number" &&
    Number.isFinite(profile.bodyweightKg) &&
    profile.bodyweightKg > 0
  );
}
