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
  savedFoodsRepo,
  sleepNightsRepo,
  waistRepo,
  weighInsRepo,
} from "@/lib/physique/io/repos";
import type { StoredWorkout } from "@/lib/trainingAnalysis";
import type { FoodEntry, SavedFood } from "@/lib/physique/types";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";

const WORKOUT_HISTORY_KEY = "workoutHistory";
const SEED_TAG = "[seed]";

type Scenario = ReturnType<typeof makeScenario>;
type Preset = { id: string; label: string; spec: (today: string) => ScenarioSpec; /** A change to the generated data (dev only), e.g. an effect for the connections. */ post?: (sc: Scenario) => Scenario };

/** Top sets 4% lighter after a night under 6.5 hours, so the report's connections have something to find (L1). */
function shortNightsCost(sc: Scenario): Scenario {
  const hours = new Map(sc.sleepNights.map((n) => [n.date, n.asleepMin / 60]));
  return {
    ...sc,
    workouts: sc.workouts.map((w) => {
      const h = hours.get(w.completedAt.slice(0, 10));
      if (h == null || h >= 6.5) return w;
      return { ...w, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((st) => ({ ...st, weight: String(Math.round((parseFloat(st.weight) * 0.96) / 2.5) * 2.5) })) })) };
    }),
  };
}

/** Top sets 3% heavier after a day of more carbs than usual (above the median), so a second connection shows (C7). Dev only. */
function higherCarbsHelp(sc: Scenario): Scenario {
  const carbs = new Map<string, number>();
  for (const e of sc.foodEntries) carbs.set(e.date, (carbs.get(e.date) ?? 0) + e.carbsG);
  const sorted = [...carbs.values()].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
  return {
    ...sc,
    workouts: sc.workouts.map((w) => {
      const c = carbs.get(addDays(w.completedAt.slice(0, 10), -1));
      if (c == null || c <= mid) return w;
      return { ...w, exercises: w.exercises.map((ex) => ({ ...ex, sets: ex.sets.map((st) => ({ ...st, weight: String(Math.round((parseFloat(st.weight) * 1.03) / 2.5) * 2.5) })) })) };
    }),
  };
}

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
    id: "not-yet-clear",
    label: "Not yet clear · same cut, eats to target, losing about 0.3 %/wk against −0.6 (research H)",
    spec: (today) => ({ seed: 3, days: 63, preDays: 21, startDate: startFor(today, 63), bodyweightKg: 85, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: -0.6, targetKg: 78 }, lifts: FLAT_LIFTS, sleep: SLEEP_OK }),
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
  {
    id: "connections",
    label: "CONNECTIONS · 16 weeks, 3 sessions a week, top sets 4% lighter after nights under 6.5 h and 3% heavier after higher-carb days",
    spec: (today) => ({
      seed: 18,
      days: 112,
      startDate: startFor(today, 112),
      bodyweightKg: 85,
      trueTdeeKcal: 2800,
      intake: "toTarget",
      goal: { ratePctPerWeek: -0.5, targetKg: 78 },
      sleep: { meanH: 7.0, sdH: 0.7, source: "manual", loggedShare: 1 },
      lifts: [
        { name: "Squat", startE1rm: 150, profile: "linear", changePct: 3, perWeek: 3, cv: 0.015 },
        { name: "Bench Press", startE1rm: 110, profile: "linear", changePct: 2, perWeek: 3, cv: 0.015 },
      ],
    }),
    post: (sc) => higherCarbsHelp(shortNightsCost(sc)),
  },
  {
    id: "underlog",
    label: "UNDER-LOGGING · eats about 2,800 at maintenance, logs 60% of it, cut goal, weight flat (E1)",
    spec: (today) => ({ seed: 23, days: 63, preDays: 21, startDate: startFor(today, 63), bodyweightKg: 85, trueTdeeKcal: 2800, intake: { meanKcal: 2800, sdKcal: 250 }, logShare: 0.6, goal: { ratePctPerWeek: -0.5, targetKg: 78 }, sleep: SLEEP_OK, lifts: FLAT_LIFTS }),
  },
  {
    id: "sleep-protein",
    label: "SHORT SLEEP + LOW PROTEIN · lean gain, 6.1 h a night, about 1.3 g/kg, lifts flat 8 weeks (E1)",
    spec: (today) => ({ seed: 29, days: 77, preDays: 21, startDate: startFor(today, 77), bodyweightKg: 80, trueTdeeKcal: 2800, intake: "toTarget", goal: { ratePctPerWeek: 0.25, confirmed: true, trainingStatus: "intermediate", targetKg: 85 }, sleep: { meanH: 6.1, sdH: 0.5, source: "manual", loggedShare: 0.95 }, lifts: FLAT_LIFTS, proteinShare: 0.15 }),
  },
];

/**
 * Realistic meals for the demo (polish): each day's single "Day total" becomes
 * breakfast, lunch, a snack and dinner with real names and local times, the
 * parts adding up exactly to the day's kcal and macros, so every engine read
 * is unchanged and the Food tab looks as it will for a real user.
 */
const MEALS: ReadonlyArray<{ time: string; share: number; foods: ReadonlyArray<readonly [string, string]> }> = [
  { time: "08:05", share: 0.22, foods: [["Porridge with banana and honey", "1 bowl"], ["Greek yoghurt, granola and berries", "1 bowl"], ["2 eggs on sourdough toast", "2 slices"], ["Protein pancakes with blueberries", "3 pancakes"]] },
  { time: "13:10", share: 0.3, foods: [["Chicken, rice and broccoli", "1 box"], ["Tuna sandwich and an apple", "1 sandwich"], ["Chicken Caesar wrap", "1 wrap"], ["Beef chilli with rice", "1 bowl"]] },
  { time: "16:20", share: 0.13, foods: [["Whey protein shake", "1 scoop"], ["Protein bar", "1 bar"], ["Cottage cheese and pineapple", "1 pot"], ["Rice cakes with peanut butter", "3 cakes"]] },
  { time: "19:40", share: 0.35, foods: [["Salmon, new potatoes and green beans", "1 plate"], ["Turkey mince bolognese", "1 plate"], ["Chicken stir-fry with noodles", "1 plate"], ["Steak, sweet potato and salad", "1 plate"]] },
];

const savedIdFor = (label: string) => `seed-sf-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

function asMeals(entries: readonly FoodEntry[]): FoodEntry[] {
  return entries.flatMap((e, dayIndex) => {
    if (e.label !== "Day total") return [e];
    const out: FoodEntry[] = [];
    const left = { kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG };
    MEALS.forEach((m, i) => {
      const last = i === MEALS.length - 1;
      const part = (v: number, key: keyof typeof left) => (last ? left[key] : Math.round(v * m.share));
      const meal = { kcal: part(e.kcal, "kcal"), proteinG: part(e.proteinG, "proteinG"), carbsG: part(e.carbsG, "carbsG"), fatG: part(e.fatG, "fatG") };
      for (const k of Object.keys(left) as Array<keyof typeof left>) left[k] -= meal[k];
      const [label, serving] = m.foods[dayIndex % m.foods.length];
      out.push({ ...e, ...meal, id: `${e.id}-${i}`, label, serving, time: m.time, method: "saved", savedFoodId: savedIdFor(label) });
    });
    return out;
  });
}

/** The demo meals as saved foods, so the logger's go-tos and latest list fill as they do for a real user. */
function savedFromMeals(entries: readonly FoodEntry[]): SavedFood[] {
  const byId = new Map<string, SavedFood>();
  for (const e of [...entries].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    if (!e.savedFoodId) continue;
    const prev = byId.get(e.savedFoodId);
    byId.set(e.savedFoodId, { id: e.savedFoodId, label: e.label, kcal: e.kcal, proteinG: e.proteinG, carbsG: e.carbsG, fatG: e.fatG, serving: e.serving, lastUsedAt: `${e.date}T${e.time ?? "12:00"}:00.000Z`, useCount: (prev?.useCount ?? 0) + 1, schemaVersion: 1 });
  }
  return [...byId.values()];
}

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
      const generated = makeScenario(preset.spec(now.today));
      const sc = preset.post ? preset.post(generated) : generated;
      await clearPhysiqueData();
      await weighInsRepo.bulkUpsert(sc.weighIns);
      const meals = asMeals(sc.foodEntries);
      await foodEntriesRepo.bulkUpsert(meals);
      await savedFoodsRepo.bulkUpsert(savedFromMeals(meals));
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
          Open Progress →
        </Link>
      </div>
    </main>
  );
}
