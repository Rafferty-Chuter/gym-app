"use client";

import { useState } from "react";
import Link from "next/link";
import { makeScenario, type LiftSpec, type ScenarioSpec } from "@/lib/physique/fixtures";
import { addDays } from "@/lib/dates";
import { useNow } from "@/lib/ui/useToday";
import { downloadAppLocalStorageSnapshot } from "@/lib/devDataTransfer";
import { kvGet, kvSet } from "@/lib/storage/kv";
import {
  clearPhysiqueData,
  dayFlagsStore,
  foodEntriesRepo,
  goalHistoryRepo,
  goalStore,
  profileStore,
  programStore,
  sleepNightsRepo,
  waistRepo,
  weighInsRepo,
} from "@/lib/physique/io/repos";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";

const WORKOUT_HISTORY_KEY = "workoutHistory";
const SEED_TAG = "[seed]";

type Preset = { id: string; label: string; spec: (today: string) => ScenarioSpec };

/**
 * Scenario presets. The P5 rows mirror `lib/physique/__tests__/judgeHelpers.ts`
 * (the ticket's scenario table) with `startDate` moved so the data ends
 * today. `preDays` gives the lifts a pre-phase baseline; `manualInitialTdee`
 * pins the expenditure seed so the coach can be made to lag the true TDEE.
 */
const SLEEP_OK = { meanH: 7.3, sdH: 0.5, loggedShare: 0.9 } as const;
const FLAT_LIFTS: LiftSpec[] = [
  { name: "Squat", startE1rm: 150, profile: "linear", changePct: 0, perWeek: 2, cv: 0.03 },
  { name: "Bench Press", startE1rm: 110, profile: "linear", changePct: 0, perWeek: 2, cv: 0.03 },
];
function stepLifts(changePct: number, atDay: number, cv: number): LiftSpec[] {
  return [
    { name: "Squat", startE1rm: 150, profile: "step", changePct, atDay, perWeek: 2, cv },
    { name: "Bench Press", startE1rm: 110, profile: "step", changePct, atDay, perWeek: 2, cv },
  ];
}
function startFor(today: string, days: number) {
  return addDays(today, -(days - 1));
}

const PRESETS: Preset[] = [
  {
    id: "ontrack",
    label: "ON-TRACK · 85 kg cut at −0.6, eats to target, 6 weeks, lifts flat",
    spec: (today) => ({ seed: 31, days: 63, preDays: 21, startDate: startFor(today, 63), bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, targetKg: 78 }, lifts: FLAT_LIFTS, sleep: SLEEP_OK, waist: { startCm: 86, changeCm: -2 } }),
  },
  {
    id: "watch",
    label: "WATCH · ON-TRACK with Apple Watch nights: HRV, resting HR and stages, HRV down 20 % over the last 9 days",
    spec: (today) => ({ seed: 33, days: 63, preDays: 21, startDate: startFor(today, 63), bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, targetKg: 78 }, lifts: FLAT_LIFTS, sleep: { meanH: 7.3, sdH: 0.5, loggedShare: 1, source: "healthkit", hrv: { meanMs: 48, sdPct: 10, rhrBpm: 52, dropFromDay: 54, dropPct: 20 } }, waist: { startCm: 86, changeCm: -2 } }),
  },
  {
    id: "loss1",
    label: "LOSS-1 · 90 kg at −1.0 goal, coach seeded low, losing ≈1.5, two lifts −8%",
    spec: (today) => {
      const startDate = startFor(today, 56);
      return {
        seed: 41,
        days: 56,
        preDays: 21,
        startDate,
        bodyweightKg: 90,
        trueTdeeKcal: 3500,
        intake: "toTarget",
        goal: { ratePctPerWeek: -1.0, confirmed: true, targetKg: 75 },
        foodLogFromDay: 21,
        profile: { manualInitialTdee: 2400, expenditureStartDate: addDays(startDate, 21) },
        lifts: stepLifts(-8, 35, 0.03),
        sleep: SLEEP_OK,
      };
    },
  },
  {
    id: "adh1",
    label: "ADH-1 · same cut at −0.6, eating 500 kcal under target",
    spec: (today) => {
      const startDate = startFor(today, 56);
      return {
        seed: 43,
        days: 56,
        preDays: 21,
        startDate,
        bodyweightKg: 90,
        trueTdeeKcal: 3500,
        intake: "toTarget",
        intakeOffsetKcal: -500,
        goal: { ratePctPerWeek: -0.6, confirmed: true, targetKg: 75 },
        foodLogFromDay: 21,
        profile: { manualInitialTdee: 2800, expenditureStartDate: addDays(startDate, 21) },
        lifts: stepLifts(-8, 35, 0.03),
        sleep: SLEEP_OK,
      };
    },
  },
  {
    id: "sleep1",
    label: "SLEEP-1 · 85 kg cut, 6.6 h on 13 of 14 nights, two lifts −3%",
    spec: (today) => ({ seed: 51, days: 42, preDays: 7, startDate: startFor(today, 42), bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, targetKg: 78 }, sleep: { meanH: 6.6, sdH: 0.4, source: "manual", loggedShare: 13 / 14 }, lifts: stepLifts(-3, 28, 0) }),
  },
  {
    id: "gain1",
    label: "GAIN-1 · 80 kg intermediate at +0.75, 8 weeks",
    spec: (today) => ({ seed: 61, days: 77, preDays: 21, startDate: startFor(today, 77), bodyweightKg: 80, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: 0.75, confirmed: true, trainingStatus: "intermediate", targetKg: 88 }, sleep: SLEEP_OK, lifts: [
      { name: "Squat", startE1rm: 140, profile: "linear", changePct: 4, perWeek: 2, cv: 0.03 },
      { name: "Bench Press", startE1rm: 100, profile: "linear", changePct: 3, perWeek: 2, cv: 0.03 },
    ] }),
  },
  {
    id: "data-rate",
    label: "DATA-RATE · 10 days of data",
    spec: (today) => ({ seed: 71, days: 10, startDate: startFor(today, 10), bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, targetKg: 78 }, sleep: SLEEP_OK }),
  },
  {
    id: "safe4",
    label: "SAFE-4 · goal injected with a BMI < 18.5 target (58 kg)",
    spec: (today) => ({ seed: 81, days: 30, startDate: startFor(today, 30), bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, targetKg: 58 }, sleep: SLEEP_OK }),
  },
  {
    id: "nogoal",
    label: "NO-GOAL · 30 days of logging, no goal",
    spec: (today) => ({ seed: 91, days: 30, startDate: startFor(today, 30), bodyweightKg: 85, trueTdeeKcal: 2800, goal: null, sleep: SLEEP_OK }),
  },
  {
    id: "cut-3w",
    label: "Early read · 3 weeks of a cut (fixed intake)",
    spec: (today) => ({
      seed: 11,
      days: 21,
      startDate: startFor(today, 21),
      bodyweightKg: 85,
      trueTdeeKcal: 2800,
      intake: { meanKcal: 2250, sdKcal: 250 },
      goal: { ratePctPerWeek: -0.6, targetKg: 80 },
      sleep: SLEEP_OK,
      lifts: FLAT_LIFTS,
      waist: { startCm: 86, changeCm: -1 },
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
      if (sc.goal) {
        await goalStore.set(sc.goal);
        await goalHistoryRepo.upsert({ ...sc.goal, date: sc.goal.startDate });
      }
      if (sc.program) await programStore.set(sc.program);
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
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-4 px-5 pt-6 sm:px-6">
        <p className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
          Dev · seed physique data
        </p>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Scenarios</h1>
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Seeding downloads a backup of everything first, then replaces the physique records and the [seed] workouts. Your own workouts are kept.
        </p>
        <div className="flex flex-col gap-2">
          {PRESETS.map((p) => (
            <PrimaryButton key={p.id} onClick={() => seed(p)} disabled={busy || !now}>
              Seed · {p.label}
            </PrimaryButton>
          ))}
          <SecondaryButton onClick={clear} disabled={busy}>
            Cold start · clear physique data
          </SecondaryButton>
        </div>
        {status && (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }} role="status">
            {status}
          </p>
        )}
        <Link href="/body" className="text-[13px] font-semibold underline-offset-2 hover:underline" style={{ color: "var(--text-secondary)" }}>
          Open Body →
        </Link>
      </div>
    </main>
  );
}
