"use client";

import { useEffect, useMemo, useState } from "react";
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

  const [trainingDays, setTrainingDays] = useState<number>(initial.trainingDaysAvailable);
  const [equipmentCsv, setEquipmentCsv] = useState<string>(initial.equipment.join(", "));
  const [injuriesCsv, setInjuriesCsv] = useState<string>((initial.injuries ?? []).join(", "));
  const [sessionTime, setSessionTime] = useState<number>(initial.availableSessionTime ?? 60);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setTrainingDays(initial.trainingDaysAvailable);
    setEquipmentCsv(initial.equipment.join(", "));
    setInjuriesCsv((initial.injuries ?? []).join(", "));
    setSessionTime(initial.availableSessionTime ?? 60);
  }, [initial]);

  function saveProfile() {
    const payload = {
      goal,
      trainingDaysAvailable: Math.max(1, Math.min(7, trainingDays || 3)),
      equipment: parseList(equipmentCsv),
      injuries: parseList(injuriesCsv),
      availableSessionTime: Math.max(20, Math.min(180, sessionTime || 60)),
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
        <p className="mt-1 text-sm text-app-secondary">Adjust your constraints so coaching recommendations stay relevant.</p>

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
              <label className="label-section block mb-1.5">Training days available</label>
              <input
                type="number"
                min={1}
                max={7}
                value={trainingDays}
                onChange={(e) => setTrainingDays(Number(e.target.value))}
                className="input-app w-full px-3 py-2.5 text-sm"
              />
            </div>

            <div>
              <label className="label-section block mb-1.5">Equipment (comma separated)</label>
              <input
                type="text"
                value={equipmentCsv}
                onChange={(e) => setEquipmentCsv(e.target.value)}
                className="input-app w-full px-3 py-2.5 text-sm"
                placeholder="barbell, dumbbell, machine"
              />
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
              <label className="label-section block mb-1.5">Session time (minutes)</label>
              <input
                type="number"
                min={20}
                max={180}
                value={sessionTime}
                onChange={(e) => setSessionTime(Number(e.target.value))}
                className="input-app w-full px-3 py-2.5 text-sm"
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
      </div>
    </main>
  );
}

