"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useUnit } from "@/lib/unit-preference";
import { usePriorityGoal, PRIORITY_GOAL_OPTIONS, type PriorityGoal } from "@/lib/priorityGoal";
import { useTrainingFocus } from "@/lib/trainingFocus";
import { useExperienceLevel } from "@/lib/experienceLevel";
import { getStoredUserProfile } from "@/lib/userProfile";

const PROFILE_STORAGE_KEY = "userCoachingProfile";

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export default function ProfilePage() {
  const { unit, setUnit } = useUnit();
  const { goal, setGoal } = usePriorityGoal();
  const { focus } = useTrainingFocus();
  const { experienceLevel } = useExperienceLevel();
  const initial = useMemo(() => getStoredUserProfile(focus, experienceLevel, goal), [experienceLevel, focus, goal]);

  const EQUIPMENT_CHIPS: Array<{ key: string; label: string }> = [
    { key: "barbell", label: "Barbell" },
    { key: "dumbbell", label: "Dumbbells" },
    { key: "machine", label: "Machines" },
    { key: "cables", label: "Cables" },
    { key: "bodyweight", label: "Bodyweight" },
    { key: "cardio machines", label: "Cardio machines" },
    { key: "other", label: "Other" },
  ];

  function trainingDaysToUi(v: number): 2 | 3 | 4 | 5 {
    if (v <= 2) return 2;
    if (v === 3) return 3;
    if (v === 4) return 4;
    return 5;
  }

  const [trainingDays, setTrainingDays] = useState<number>(trainingDaysToUi(initial.trainingDaysAvailable));
  const [selectedEquipment, setSelectedEquipment] = useState<string[]>(initial.equipment);
  const [otherEquipmentText, setOtherEquipmentText] = useState<string>("");
  const [injuriesCsv, setInjuriesCsv] = useState<string>((initial.injuries ?? []).join(", "));
  const [trainingPrioritiesText, setTrainingPrioritiesText] = useState<string>(initial.trainingPrioritiesText ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTrainingDays(trainingDaysToUi(initial.trainingDaysAvailable));
    setSelectedEquipment(initial.equipment);
    setInjuriesCsv((initial.injuries ?? []).join(", "));
    setTrainingPrioritiesText(initial.trainingPrioritiesText ?? "");
  }, [initial]);

  function saveProfile() {
    const equipment =
      selectedEquipment.includes("other") && otherEquipmentText.trim()
        ? [...selectedEquipment.filter((k) => k !== "other"), otherEquipmentText.trim()]
        : selectedEquipment.filter((k) => k !== "other");

    const payload = {
      goal,
      trainingDaysAvailable: Math.max(1, Math.min(7, trainingDays || 3)),
      equipment,
      injuries: parseList(injuriesCsv),
      trainingPrioritiesText,
    };
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(payload));
    setSaved(true);
    window.dispatchEvent(new Event("workoutHistoryChanged"));
    window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 pb-28 pt-8 text-white">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight">Profile</h1>
        <p className="mt-1 text-sm text-app-secondary">Quick onboarding so the coach uses your real context.</p>

        <section className="mt-6 rounded-2xl border border-teal-900/35 bg-zinc-900/90 p-5">
          <div className="space-y-4">
            <div>
              <label className="label-section block mb-1.5">Goal</label>
              <select
                value={goal}
                onChange={(e) => setGoal(e.target.value as PriorityGoal)}
                className="input-app w-full px-3 py-2.5 text-sm"
              >
                {PRIORITY_GOAL_OPTIONS.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="label-section block mb-1.5">Typical training frequency</label>
              <select
                value={trainingDays}
                onChange={(e) => setTrainingDays(Number(e.target.value))}
                className="input-app w-full px-3 py-2.5 text-sm"
              >
                <option value={2}>2 days</option>
                <option value={3}>3 days</option>
                <option value={4}>4 days</option>
                <option value={5}>5+ days</option>
              </select>
            </div>

            <div>
              <label className="label-section block mb-1.5">Tell the coach what matters</label>
              <textarea
                value={trainingPrioritiesText}
                onChange={(e) => setTrainingPrioritiesText(e.target.value)}
                className="input-app w-full px-3 py-3 text-sm resize-none min-h-[96px]"
                placeholder="e.g. What do you want to build, improve, or avoid? Build muscle overall, bring up chest and arms, keep legs ticking over, avoid irritating left shoulder"
              />
            </div>

            <div>
              <label className="label-section block mb-1.5">Equipment you have</label>
              <div className="flex flex-wrap gap-2">
                {EQUIPMENT_CHIPS.map((chip) => {
                  const active = selectedEquipment.includes(chip.key);
                  return (
                    <button
                      key={chip.key}
                      type="button"
                      onClick={() => {
                        setSelectedEquipment((prev) => {
                          const isOn = prev.includes(chip.key);
                          const next = isOn ? prev.filter((k) => k !== chip.key) : [...prev, chip.key];
                          if (chip.key === "other" && !isOn) setOtherEquipmentText("");
                          return next;
                        });
                      }}
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        active
                          ? "border-teal-500/45 bg-teal-950/35 text-teal-100"
                          : "border-teal-900/35 bg-zinc-900/70 text-app-secondary hover:text-white"
                      }`}
                    >
                      {chip.label}
                    </button>
                  );
                })}
              </div>
              {selectedEquipment.includes("other") && (
                <input
                  type="text"
                  value={otherEquipmentText}
                  onChange={(e) => setOtherEquipmentText(e.target.value)}
                  className="input-app mt-3 w-full px-3 py-2.5 text-sm"
                  placeholder="e.g. kettlebells, bands"
                />
              )}
            </div>

            <div>
              <label className="label-section block mb-1.5">Injuries / limitations (optional)</label>
              <input
                type="text"
                value={injuriesCsv}
                onChange={(e) => setInjuriesCsv(e.target.value)}
                className="input-app w-full px-3 py-2.5 text-sm"
                placeholder="left shoulder, lower back"
              />
            </div>

            <div>
              <label className="label-section block mb-1.5">Units</label>
              <div className="flex gap-2">
                {(["kg", "lb"] as const).map((u) => (
                  <button
                    key={u}
                    type="button"
                    onClick={() => setUnit(u)}
                    className={`flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                      unit === u
                        ? "border-teal-500/45 bg-teal-950/35 text-teal-100"
                        : "border-teal-900/35 bg-zinc-900/70 text-app-secondary hover:text-white"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <button type="button" onClick={saveProfile} className="mt-5 w-full rounded-xl btn-primary py-3">
            {saved ? "Saved" : "Save Profile"}
          </button>
        </section>

        <section className="mt-8 rounded-2xl border border-zinc-700/80 bg-zinc-900/60 p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 mb-1">Temporary</p>
          <p className="text-sm text-zinc-400 mb-4">
            Move your saved workouts, templates, profile, and assistant chats to another device.
          </p>
          <Link
            href="/dev/data-transfer"
            className="flex w-full items-center justify-center rounded-xl border border-teal-500/40 bg-teal-950/40 px-4 py-3 text-sm font-bold text-teal-100 hover:bg-teal-900/50 hover:border-teal-400/50 transition-colors"
          >
            Data Tools
          </Link>
        </section>
      </div>
    </main>
  );
}

