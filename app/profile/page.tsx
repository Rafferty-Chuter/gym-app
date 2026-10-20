"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PageHeader from "@/components/ui/PageHeader";
import { Caption, Chevron, Row, RowGroup } from "@/components/physique/ui";
import NumberSheet from "@/components/physique/NumberSheet";
import RemindersSection from "@/components/physique/RemindersSection";
import AppleHealthSheet from "@/components/health/AppleHealthSheet";
import MusclePrioritiesSheet from "@/components/physique/MusclePrioritiesSheet";
import { useMusclePriorities } from "@/lib/physique/io/musclePriorities";
import { priorityOf } from "@/lib/training/volumeTargets";
import type { Phase } from "@/lib/training/progression";
import { GROUP_LABEL, VOLUME_GROUP_ORDER } from "@/lib/volumeAnalysis";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useSingleton } from "@/lib/storage/useStored";
import { goalStore, profileStore } from "@/lib/physique/io/repos";
import { getPhysiqueProfileSync } from "@/lib/physique/io/profile";
import { saveBasics } from "@/lib/physique/io/goalSetup";
import { receivedLabel, useHealthLink } from "@/lib/physique/io/healthLink";
import { useNativeHealth } from "@/lib/physique/io/nativeHealth";
import { BODY_FAT_OPTIONS, SEX_OPTIONS } from "@/lib/physique/profileOptions";
import { useUnit } from "@/lib/unit-preference";
import { setHeightUnit, useHeightUnit } from "@/lib/ui/heightUnit";
import { formatHeight } from "@/lib/units";
import HeightSheet from "@/components/physique/HeightSheet";
import { readAppearance, setAppearance, type Appearance } from "@/lib/ui/appearance";
import { getRestTimerSettings, REST_TIMER_SETTINGS_EVENT, setRestTimerSettings, type RestTimerSettings } from "@/lib/restTimerSettings";
import { downloadAllWorkoutsCsv } from "@/lib/exportWorkoutsCsv";
import type { Sex } from "@/lib/physique/types";


const pill = (on: boolean) => ({ background: on ? "var(--primary)" : "var(--surface-raised)", color: on ? "var(--text-on-primary)" : "var(--text-secondary)" });

/** On / off as a small switch inside a row. */
function Switch({ on, onChange, label }: { on: boolean; onChange: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onChange} className="relative h-7 w-12 shrink-0 rounded-full transition-colors" style={{ background: on ? "var(--primary)" : "var(--border-strong)" }}>
      <span className="absolute top-0.5 h-6 w-6 rounded-full transition-transform" style={{ left: 2, background: on ? "var(--text-on-primary)" : "var(--surface)", transform: on ? "translateX(20px)" : "translateX(0)" }} />
    </button>
  );
}

/**
 * Profile (CL1): units, who you are, Apple Health, training settings,
 * reminders, Apple Health, data. Every row saves on the tap. Nothing here
 * is a form to submit.
 */
export default function ProfilePage() {
  const hydrated = useIsHydrated();
  const router = useRouter();
  const { unit, setUnit } = useUnit();
  const heightUnit = useHeightUnit();
  // Read after hydration so the server's "Auto" never mismatches a stored choice.
  const [picked, setPicked] = useState<Appearance | null>(null);
  const appearance: Appearance = picked ?? (hydrated ? readAppearance() : "auto");
  const pickAppearance = (a: Appearance) => {
    setAppearance(a);
    setPicked(a);
  };
  const priorities = useMusclePriorities();
  const physiqueGoal = useSingleton(goalStore);
  const phase: Phase = physiqueGoal?.type === "lose" ? "cut" : physiqueGoal?.type === "gain" ? "lean_bulk" : "maintain";
  const emphasised = VOLUME_GROUP_ORDER.filter((g) => priorityOf(priorities, g) === "emphasise").map((g) => GROUP_LABEL[g]);
  const prioritiesSub = emphasised.length > 0 ? `Emphasising ${emphasised.join(", ").toLowerCase()}` : "Every muscle set to grow";
  // Subscribed so a saved height, age or sex re-renders; the resolver reads storage and fills defaults.
  const profile = useSingleton(profileStore);
  const resolved = hydrated && profile !== undefined ? getPhysiqueProfileSync() : null;
  const healthLink = useHealthLink();
  const nativeHealth = useNativeHealth();
  const [sheet, setSheet] = useState<"height" | "age" | "health" | "priorities" | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [rest, setRest] = useState<RestTimerSettings>(() => getRestTimerSettings());
  useEffect(() => {
    const sync = () => setRest(getRestTimerSettings());
    window.addEventListener(REST_TIMER_SETTINGS_EVENT, sync);
    return () => window.removeEventListener(REST_TIMER_SETTINGS_EVENT, sync);
  }, []);
  function toggleRest(key: keyof RestTimerSettings) {
    const next = { ...rest, [key]: !rest[key] };
    setRest(next);
    setRestTimerSettings(next);
  }


  function exportCsv() {
    try {
      const { rows, workouts } = downloadAllWorkoutsCsv();
      setExportStatus(workouts === 0 ? "No workouts logged yet." : `Exported ${workouts} workouts, ${rows} rows.`);
    } catch (err) {
      setExportStatus(`Export failed: ${(err as Error).message}`);
    }
    window.setTimeout(() => setExportStatus(null), 4000);
  }

  const feedbackUrl = process.env.NEXT_PUBLIC_TALLY_FEEDBACK_URL;
  const sex: Sex | undefined = resolved?.sex && resolved.missing.includes("sex") ? undefined : resolved?.sex;
  const healthSub = nativeHealth ? (nativeHealth.lastSyncAt ? `Read on this iPhone · last ${receivedLabel(nativeHealth.lastSyncAt, new Date())}` : "Connected · not read yet") : healthLink ? (healthLink.lastPayloadAt ? `Auto-upload on · last received ${receivedLabel(healthLink.lastPayloadAt, new Date())}` : "Token ready · waiting for the first upload") : "Sleep, HRV and weight arrive on their own";

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader caption="Settings" title="Profile" />

        <section className="flex flex-col gap-2" aria-label="Units">
          <Caption>Units</Caption>
          <RowGroup>
            <Row
              label="Weight"
              value={
                <span className="flex gap-1" role="radiogroup" aria-label="Weight units">
                  {(["kg", "lb"] as const).map((u) => (
                    <button key={u} type="button" role="radio" aria-checked={unit === u} onClick={() => setUnit(u)} className="h-8 rounded-full px-3 text-[13px] font-medium" style={pill(unit === u)}>
                      {u}
                    </button>
                  ))}
                </span>
              }
              sub="Body weights stay in kg underneath. Logged workouts switch to the new unit."
            />
            <Row
              label="Height"
              value={
                <span className="flex gap-1" role="radiogroup" aria-label="Height units">
                  {(["cm", "ft"] as const).map((u) => (
                    <button key={u} type="button" role="radio" aria-checked={heightUnit === u} onClick={() => setHeightUnit(u)} className="h-8 rounded-full px-3 text-[13px] font-medium" style={pill(heightUnit === u)}>
                      {u === "cm" ? "cm" : "ft / in"}
                    </button>
                  ))}
                </span>
              }
            />
            <Row
              label="Appearance"
              value={
                <span className="flex gap-1" role="radiogroup" aria-label="Appearance">
                  {(["auto", "light", "dark"] as const).map((a) => (
                    <button key={a} type="button" role="radio" aria-checked={appearance === a} onClick={() => pickAppearance(a)} className="h-8 rounded-full px-3 text-[13px] font-medium" style={pill(appearance === a)}>
                      {a === "auto" ? "Auto" : a === "light" ? "Light" : "Dark"}
                    </button>
                  ))}
                </span>
              }
              sub="Auto follows your phone."
            />
          </RowGroup>
        </section>

        <section className="flex flex-col gap-2" aria-label="About you">
          <Caption>About you</Caption>
          <RowGroup>
            <Row
              label="Sex"
              value={
                <span className="flex flex-wrap justify-end gap-1" role="radiogroup" aria-label="Sex">
                  {SEX_OPTIONS.map((o) => (
                    <button key={o.v} type="button" role="radio" aria-checked={sex === o.v} onClick={() => void saveBasics({ sex: o.v })} className="h-8 rounded-full px-3 text-[12px] font-medium" style={pill(sex === o.v)}>
                      {o.v === "prefer_not_to_say" ? "Not said" : o.label}
                    </button>
                  ))}
                </span>
              }
            />
            <Row label="Height" value={resolved?.heightCm ? formatHeight(resolved.heightCm, heightUnit) : <span style={{ color: "var(--text-tertiary)" }}>Add</span>} trailing={<Chevron />} onClick={() => setSheet("height")} ariaLabel="Height. Edit" />
            <Row label="Age" value={resolved ? `${resolved.age}` : "–"} trailing={<Chevron />} onClick={() => setSheet("age")} ariaLabel="Age. Edit" />
            <Row
              label="Body fat, roughly"
              sub="Sets the protein target. Skip it and protein uses a bodyweight rule."
              value={null}
              below={
                <span className="flex flex-wrap gap-1" role="radiogroup" aria-label="Body fat category">
                  {BODY_FAT_OPTIONS.map((o) => (
                    <button key={o.v} type="button" role="radio" aria-checked={resolved?.bodyFatCategory === o.v} onClick={() => void saveBasics({ bodyFatCategory: o.v })} className="h-8 rounded-full px-2.5 text-[12px] font-medium" style={pill(resolved?.bodyFatCategory === o.v)}>
                      {o.label}
                    </button>
                  ))}
                </span>
              }
            />
          </RowGroup>
          <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            The maintenance estimate needs sex, height and age. Target weight and pace live under Body.
          </p>
        </section>

        <section className="flex flex-col gap-2" aria-label="Connected">
          <Caption>Connected</Caption>
          <RowGroup>
            <Row label="Apple Health" sub={healthSub} value="" trailing={<Chevron />} onClick={() => setSheet("health")} ariaLabel="Apple Health. Open settings" />
          </RowGroup>
        </section>

        <section className="flex flex-col gap-2" aria-label="Training">
          <Caption>Training</Caption>
          <RowGroup>
            <Row label="Muscle priorities" sub={prioritiesSub} value="" trailing={<Chevron />} onClick={() => setSheet("priorities")} ariaLabel="Muscle priorities. Edit" />
            <Row label="Rest timer vibration" value={<Switch on={rest.vibrate} onChange={() => toggleRest("vibrate")} label="Vibrate when the rest timer ends" />} />
            <Row label="Rest timer sound" value={<Switch on={rest.sound} onChange={() => toggleRest("sound")} label="Play a sound when the rest timer ends" />} />
          </RowGroup>
        </section>

        <RemindersSection />

        <section className="flex flex-col gap-2" aria-label="Data">
          <Caption>Data</Caption>
          <RowGroup>
            <Row label="Import" sub="Daily log, sample data, Hevy, Strong, Rep Count" value="" trailing={<Chevron />} onClick={() => router.push("/profile/import")} ariaLabel="Import. Open" />
            <Row label="Export workouts" sub={exportStatus ?? "A CSV of every logged set"} value="" trailing={<Chevron />} onClick={exportCsv} ariaLabel="Export workouts as CSV" />
            <Row label="Move to another phone" sub="Copy everything as text and paste it there" value="" trailing={<Chevron />} onClick={() => router.push("/dev/data-transfer")} ariaLabel="Move to another phone. Open" />
            {feedbackUrl && <Row label="Send feedback" sub="Opens a short form" value="" trailing={<Chevron />} onClick={() => window.open(feedbackUrl, "_blank", "noopener,noreferrer")} ariaLabel="Send feedback. Opens in a new tab" />}
          </RowGroup>
          <p className="pb-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Everything stays on this phone. Export before switching phones.
          </p>
        </section>
      </div>

      <HeightSheet open={sheet === "height"} onClose={() => setSheet(null)} initialCm={resolved?.heightCm ?? null} onSave={(v) => void saveBasics({ heightCm: v })} />
      <NumberSheet open={sheet === "age"} onClose={() => setSheet(null)} title="Age" initial={resolved?.age ?? null} decimals={0} step={1} min={13} max={100} onSave={(v) => void saveBasics({ age: v })} />
      <AppleHealthSheet open={sheet === "health"} onClose={() => setSheet(null)} />
      <MusclePrioritiesSheet open={sheet === "priorities"} onClose={() => setSheet(null)} phase={phase} />
    </main>
  );
}
