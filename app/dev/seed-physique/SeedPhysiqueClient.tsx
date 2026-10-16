"use client";

import { useState } from "react";
import Link from "next/link";
import { makeScenario, type ScenarioSpec } from "@/lib/physique/fixtures";
import { addDays } from "@/lib/dates";
import { useNow } from "@/lib/ui/useToday";
import { downloadAppLocalStorageSnapshot } from "@/lib/devDataTransfer";
import { kvGet, kvSet } from "@/lib/storage/kv";
import {
  clearPhysiqueData,
  dayFlagsStore,
  foodEntriesRepo,
  goalStore,
  profileStore,
  sleepNightsRepo,
  waistRepo,
  weighInsRepo,
} from "@/lib/physique/io/repos";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";

const WORKOUT_HISTORY_KEY = "workoutHistory";
const SEED_TAG = "[seed]";

type Preset = { id: string; label: string; spec: (today: string) => ScenarioSpec };

const PRESETS: Preset[] = [
  {
    id: "cut-3w",
    label: "3 weeks · cut on track (85 kg, −0.6 %/wk)",
    spec: (today) => ({
      seed: 11,
      days: 21,
      startDate: addDays(today, -20),
      bodyweightKg: 85,
      trueTdeeKcal: 2800,
      intake: { meanKcal: 2250, sdKcal: 250 },
      goal: { ratePctPerWeek: -0.6, targetKg: 80 },
      sleep: { meanH: 7.2, sdH: 0.5, loggedShare: 0.9 },
      lifts: [
        { name: "Squat", startE1rm: 150, profile: "linear", changePct: 1, perWeek: 2, cv: 0.03 },
        { name: "Bench Press", startE1rm: 110, profile: "linear", changePct: 0.5, perWeek: 2, cv: 0.03 },
      ],
      waist: { startCm: 86, changeCm: -1 },
    }),
  },
  {
    id: "gain-6w",
    label: "6 weeks · lean gain (80 kg, +0.25 %/wk)",
    spec: (today) => ({
      seed: 23,
      days: 42,
      startDate: addDays(today, -41),
      bodyweightKg: 80,
      trueTdeeKcal: 2900,
      intake: { meanKcal: 3150, sdKcal: 250 },
      goal: { ratePctPerWeek: 0.25, targetKg: 86, trainingStatus: "intermediate" },
      sleep: { meanH: 7.4, sdH: 0.5, loggedShare: 0.85 },
      lifts: [
        { name: "Squat", startE1rm: 140, profile: "linear", changePct: 3, perWeek: 2, cv: 0.03 },
        { name: "Bench Press", startE1rm: 100, profile: "linear", changePct: 2, perWeek: 2, cv: 0.03 },
        { name: "Romanian Deadlift", startE1rm: 160, profile: "linear", changePct: 1, perWeek: 1, cv: 0.03 },
      ],
      waist: { startCm: 82, changeCm: 0.5 },
    }),
  },
];

function readWorkouts(): StoredWorkout[] {
  const raw = kvGet<unknown>(WORKOUT_HISTORY_KEY);
  return Array.isArray(raw) ? (raw as StoredWorkout[]) : [];
}

function writeWorkouts(list: StoredWorkout[]) {
  const r = kvSet(WORKOUT_HISTORY_KEY, list);
  if (!r.ok) throw new Error(`Storage write failed: ${r.error}`);
  window.dispatchEvent(new CustomEvent("workoutHistoryChanged"));
}

export default function SeedPhysiqueClient() {
  const now = useNow();
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function seed(preset: Preset) {
    if (!now) return;
    setBusy(true);
    setStatus("Backing up first…");
    try {
      downloadAppLocalStorageSnapshot();
      const sc = makeScenario(preset.spec(now.today));
      await clearPhysiqueData();
      await weighInsRepo.bulkUpsert(sc.weighIns);
      await foodEntriesRepo.bulkUpsert(sc.foodEntries);
      await sleepNightsRepo.bulkUpsert(sc.sleepNights);
      await waistRepo.bulkUpsert(sc.waist);
      for (const [k, v] of Object.entries(sc.dayFlags)) await dayFlagsStore.set(k, v);
      if (sc.goal) await goalStore.set(sc.goal);
      await profileStore.set(sc.profile);
      const kept = readWorkouts().filter((w) => !(w.name ?? "").startsWith(SEED_TAG));
      writeWorkouts([...kept, ...sc.workouts]);
      setStatus(`Seeded ${preset.label}: ${sc.weighIns.length} weigh-ins, ${sc.foodEntries.length} food entries, ${sc.sleepNights.length} nights, ${sc.workouts.length} workouts.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    setBusy(true);
    try {
      await clearPhysiqueData();
      writeWorkouts(readWorkouts().filter((w) => !(w.name ?? "").startsWith(SEED_TAG)));
      setStatus("Cleared physique data and [seed] workouts.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen pb-28" style={{ background: "#0a0a0b", color: "#f2f2f0" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pt-6 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "#6f6f76" }}>
          Dev · seed physique data
        </p>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Scenarios</h1>
        <p className="text-[13px]" style={{ color: "#a3a3a8" }}>
          Seeding downloads a backup of everything first, then replaces the physique records and the [seed] workouts. Your own workouts are kept.
        </p>
        <div className="flex flex-col gap-2">
          {PRESETS.map((p) => (
            <PrimaryButton key={p.id} onClick={() => seed(p)} disabled={busy || !now}>
              Seed · {p.label}
            </PrimaryButton>
          ))}
          <SecondaryButton onClick={clear} disabled={busy}>
            Clear physique data
          </SecondaryButton>
        </div>
        {status && (
          <p className="text-[13px]" style={{ color: "#a3a3a8" }} role="status">
            {status}
          </p>
        )}
        <Link href="/body" className="text-[13px] font-semibold underline-offset-2 hover:underline" style={{ color: "#a3a3a8" }}>
          Open Body →
        </Link>
      </div>
    </main>
  );
}
