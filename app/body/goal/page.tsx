"use client";

import { BODY_FAT_OPTIONS, SEX_OPTIONS } from "@/lib/physique/profileOptions";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useUnit } from "@/lib/unit-preference";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";
import { useNow } from "@/lib/ui/useToday";
import { useRepo, useSingleton } from "@/lib/storage/useStored";
import { goalStore, profileStore, weighInsRepo } from "@/lib/physique/io/repos";
import { createGoal, loadGoalContext, previewGoal, saveBasics, type GoalContext } from "@/lib/physique/io/goalSetup";
import { CUT_REFUSED_ABOVE, GAIN_REFUSED_ABOVE, rateBands } from "@/lib/physique/targets";
import { displayToKg, formatWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import type { Now } from "@/lib/dates";
import type { BodyFatCategory, Sex, TrainingStatus } from "@/lib/physique/types";
import NumberPad, { NumberPadValue, formatPadValue, parsePadValue } from "@/components/ui/NumberPad";
import NumberSheet from "@/components/physique/NumberSheet";
import RateSlider from "@/components/physique/RateSlider";
import { Caption, Chevron, ErrorLine, PrimaryButton, Row, RowGroup, SecondaryButton } from "@/components/physique/ui";
import { formatRate } from "@/components/physique/WeightChartCard";
import { STATUS_HEX } from "@/lib/ui/status";

type Step = "basics" | "target" | "rate" | "confirm";

/** Slowest magnitude the slider offers (below the green band, needs a confirm). OURS. */
const MIN_MAG = 0.1;
/** The youngest age that gets deficit targets (SAFE-0). PUB. */
const ADULT_AGE = 18;

const STATUS_LABEL: Record<TrainingStatus, string> = { novice: "Novice", intermediate: "Intermediate", advanced: "Advanced" };
const STATUS_ORDER: TrainingStatus[] = ["novice", "intermediate", "advanced"];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function monthYear(date: string): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

export default function GoalPage() {
  const hydrated = useIsHydrated();
  const now = useNow();
  const { unit } = useUnit();
  if (!hydrated || !now) {
    return <main className="min-h-screen" style={{ background: "var(--page)" }} />;
  }
  return <Wizard now={now} unit={unit === "lb" ? "lb" : "kg"} />;
}

function Wizard({ now, unit }: { now: Now; unit: WeightUnit }) {
  const router = useRouter();
  // Subscribing keeps the context fresh after step 0 saves the basics.
  const weighIns = useRepo(weighInsRepo);
  const storedProfile = useSingleton(profileStore);
  const activeGoal = useSingleton(goalStore);
  const [version, setVersion] = useState(0);
  const ctx = useMemo(
    () => loadGoalContext(now, unit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [now, unit, weighIns, storedProfile, activeGoal, version]
  );

  const needsBasics = ctx.profile.missing.length > 0;
  const [step, setStep] = useState<Step>(needsBasics ? "basics" : "target");
  const [targetText, setTargetText] = useState(() => {
    const start = activeGoal?.targetKg ?? ctx.trendKg;
    return start != null ? formatPadValue(kgToDisplay(start, unit), 1) : "";
  });
  const [status, setStatus] = useState<TrainingStatus>(ctx.statusFromLifts ?? ctx.statusFromYears);
  const [statusSource, setStatusSource] = useState<"lifts" | "years" | "you">(ctx.statusFromLifts ? "lifts" : "years");
  const [magnitude, setMagnitude] = useState<number | null>(null);
  const [confirmedOutside, setConfirmedOutside] = useState(false);
  const [startToday, setStartToday] = useState(true);
  const [safety, setSafety] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetDisplay = parsePadValue(targetText);
  const targetKg = targetDisplay != null && targetDisplay > 0 ? displayToKg(targetDisplay, unit) : null;
  const trendKg = ctx.trendKg;

  const draft = useMemo(() => {
    if (targetKg == null || trendKg == null) return null;
    const type = targetKg < trendKg - 0.68 ? "lose" : targetKg > trendKg + 0.68 ? "gain" : "maintain";
    const bands = rateBands(status, { nearGoal: Math.abs(trendKg - targetKg) <= 0.02 * trendKg });
    const defaultMag = type === "lose" ? -bands.cut.default : type === "gain" ? bands.gain.default : 0;
    const mag = magnitude ?? defaultMag;
    const rate = type === "lose" ? -mag : type === "gain" ? mag : 0;
    return { type, mag, rate, bands } as const;
  }, [targetKg, trendKg, status, magnitude]);

  const preview = useMemo(() => {
    if (!draft || targetKg == null) return null;
    return previewGoal(ctx, { targetKg, ratePctPerWeek: draft.rate, status }, now);
  }, [ctx, draft, targetKg, status, now]);

  const underage = ctx.profile.age < ADULT_AGE;
  const safetyForcesMaintenance = safety === true || (underage && draft?.type === "lose");

  function cycleStatus() {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(status) + 1) % STATUS_ORDER.length];
    setStatus(next);
    setStatusSource("you");
    setConfirmedOutside(false);
  }

  function switchToMaintenance() {
    if (trendKg == null) return;
    setTargetText(formatPadValue(kgToDisplay(trendKg, unit), 1));
    setMagnitude(null);
  }

  async function submit() {
    if (!draft || targetKg == null || !preview || !preview.validation.ok) return;
    if (safety === null) {
      setError("Answer the safety question first.");
      return;
    }
    setSaving(true);
    setError(null);
    const r = await createGoal(ctx, { targetKg, ratePctPerWeek: draft.rate, status }, now, {
      startToday,
      safety: { pregnantOrEdHistory: safety },
      nowIso: new Date().toISOString(),
    });
    setSaving(false);
    if (r.ok) router.push("/body");
    else setError(r.error);
  }

  const stepIndex = step === "basics" ? 0 : step === "target" ? 1 : step === "rate" ? 2 : 3;

  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 pt-4 sm:px-6">
        <div className="flex items-center justify-between">
          <Link href="/body" className="flex items-center gap-1 text-[15px]" style={{ color: "var(--text-secondary)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
            Body
          </Link>
          <Caption>{needsBasics ? `Step ${stepIndex + 1} of 4` : `Step ${stepIndex} of 3`}</Caption>
        </div>

        {step === "basics" && <BasicsStep ctx={ctx} onDone={() => { setVersion((v) => v + 1); setStep("target"); }} />}

        {step === "target" && (
          <section className="flex flex-col gap-4" aria-label="Target weight">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Target weight</h1>
            {trendKg == null ? (
              <div className="flex flex-col gap-3">
                <p className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
                  Log a weigh-in first so the goal starts from your current weight.
                </p>
                <Link href="/body" className="inline-flex h-[44px] w-fit items-center rounded-[12px] px-4 text-[15px] font-semibold" style={{ background: "var(--surface-raised)" }}>
                  Log weight
                </Link>
              </div>
            ) : (
              <>
                <NumberPadValue value={targetText} unit={unit} hint={`Now ${formatWeight(trendKg, unit)} (${ctx.trendSource === "trend" ? "trend" : ctx.trendSource === "weigh-in" ? "last weigh-in" : "from your profile"})`} />
                <NumberPad value={targetText} onChange={(v) => { setTargetText(v); setMagnitude(null); setConfirmedOutside(false); }} decimals={1} step={0.5} max={unit === "kg" ? 300 : 660} />
                <p className="min-h-[22px] text-center text-[15px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {draft && targetKg != null
                    ? draft.type === "maintain"
                      ? "Maintain, within 0.7 kg of where you are"
                      : `${draft.type === "lose" ? "Cut" : "Lean gain"} · ${formatWeight(Math.abs(targetKg - trendKg), unit)} to go`
                    : " "}
                </p>
                <PrimaryButton onClick={() => setStep(draft?.type === "maintain" ? "confirm" : "rate")} disabled={!draft || targetKg == null || targetKg < 30}>
                  Next
                </PrimaryButton>
              </>
            )}
          </section>
        )}

        {step === "rate" && draft && draft.type !== "maintain" && trendKg != null && preview && (
          <section className="flex flex-col gap-4" aria-label="Weekly rate">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em]">How fast</h1>
            <button
              type="button"
              onClick={cycleStatus}
              className="flex h-[30px] w-fit items-center gap-1.5 rounded-full px-3 text-[12px] font-medium"
              style={{ background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
              aria-label={`Training status ${STATUS_LABEL[status]}. Tap to change`}
            >
              <span style={{ color: "var(--text)" }}>{STATUS_LABEL[status]}</span>
              <span>· {statusSource === "lifts" ? "from your lifts" : statusSource === "years" ? "from your training years" : "set by you"}</span>
            </button>
            <div className="rounded-[12px] px-4 py-3" style={{ background: "var(--surface)" }}>
              <div className="flex items-baseline justify-between">
                <span className="text-[34px] font-semibold leading-none tracking-[-0.02em]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatRate(draft.rate)}
                </span>
                <span className="text-[13px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {preview.validation.kgPerWeek > 0 ? "+" : "−"}
                  {formatWeight(Math.abs(preview.validation.kgPerWeek), unit, 2)}/week
                </span>
              </div>
              <div className="mt-2">
                <RateSlider
                  type={draft.type}
                  magnitude={draft.mag}
                  onChange={(m) => { setMagnitude(m); setConfirmedOutside(false); }}
                  status={status}
                  trendKg={trendKg}
                  tdee0={ctx.tdee0 ?? 0}
                  nearGoal={Math.abs(trendKg - targetKg!) <= 0.02 * trendKg}
                  minMag={MIN_MAG}
                  maxMag={draft.type === "lose" ? CUT_REFUSED_ABOVE : GAIN_REFUSED_ABOVE}
                />
              </div>
            </div>
            <RowGroup>
              <Row label="Reach target" value={preview.etaWeeks != null && Number.isFinite(preview.etaWeeks) ? `about ${Math.round(preview.etaWeeks)} weeks` : "–"} sub={preview.etaDate ? `around ${monthYear(preview.etaDate)}` : undefined} />
              <Row label="Start at" value={preview.update ? `${preview.update.entry.kcal.toLocaleString("en-GB")} kcal` : "–"} sub={preview.update ? `${preview.update.entry.proteinG} g protein · maintenance ≈ ${Math.round(preview.update.tdee).toLocaleString("en-GB")}` : "Add your height to estimate maintenance"} />
            </RowGroup>
            {!preview.validation.ok && (
              <p className="text-[13px]" style={{ color: STATUS_HEX.attention }}>
                {preview.validation.message} Slide back to a rate that can be set.
              </p>
            )}
            {preview.validation.ok && preview.validation.band === "confirm" && (
              <button
                type="button"
                role="checkbox"
                aria-checked={confirmedOutside}
                onClick={() => setConfirmedOutside((c) => !c)}
                className="flex items-start gap-3 rounded-[12px] px-4 py-3 text-left"
                style={{ background: "var(--surface)", border: `1px solid ${confirmedOutside ? "var(--border-strong)" : "var(--border)"}` }}
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md" style={{ background: confirmedOutside ? "var(--primary)" : "var(--surface-raised)", color: "var(--text-on-primary)" }} aria-hidden>
                  {confirmedOutside && (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  )}
                </span>
                <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  {preview.validation.outside === "faster"
                    ? draft.type === "gain"
                      ? "Faster than the evidence suggests for lean gain: in studies, gains this fast mostly add fat. I understand."
                      : "Faster than the range that protects strength on a cut. I understand."
                    : "Slower than the usual range. That is fine, it just takes longer. I understand."}
                </span>
              </button>
            )}
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <SecondaryButton onClick={() => setStep("target")}>Back</SecondaryButton>
              <PrimaryButton onClick={() => setStep("confirm")} disabled={!preview.validation.ok || (preview.validation.band === "confirm" && !confirmedOutside) || !preview.update}>
                Next
              </PrimaryButton>
            </div>
          </section>
        )}

        {step === "confirm" && draft && targetKg != null && trendKg != null && preview && (
          <section className="flex flex-col gap-4" aria-label="Confirm goal">
            <h1 className="text-[20px] font-semibold tracking-[-0.01em]">Confirm</h1>
            <RowGroup>
              <Row label="Target" value={formatWeight(targetKg, unit)} sub={`from ${formatWeight(trendKg, unit)}`} />
              <Row
                label={draft.type === "lose" ? "Cut" : draft.type === "gain" ? "Lean gain" : "Maintain"}
                value={draft.type === "maintain" ? "±0.7 kg" : formatRate(draft.rate)}
                sub={draft.type === "maintain" ? "Targets nudge you back inside the band" : `${preview.validation.kgPerWeek > 0 ? "+" : "−"}${formatWeight(Math.abs(preview.validation.kgPerWeek), unit, 2)} a week · ${STATUS_LABEL[status].toLowerCase()}`}
              />
              {draft.type !== "maintain" && <Row label="Reach target" value={preview.etaWeeks != null && Number.isFinite(preview.etaWeeks) ? `about ${Math.round(preview.etaWeeks)} weeks` : "–"} sub={preview.etaDate ? `around ${monthYear(preview.etaDate)}` : undefined} />}
              <Row
                label="Starting targets"
                value={preview.update ? `${preview.update.entry.kcal.toLocaleString("en-GB")} kcal` : "–"}
                sub={preview.update ? `P ${preview.update.entry.proteinG} · F ${preview.update.entry.fatG} · C ${preview.update.entry.carbsG} g` : undefined}
              />
            </RowGroup>

            <button
              type="button"
              role="switch"
              aria-checked={startToday}
              onClick={() => setStartToday((s) => !s)}
              className="flex min-h-[56px] items-center justify-between rounded-[12px] px-4 text-left"
              style={{ background: "var(--surface)" }}
            >
              <span className="flex flex-col">
                <span className="text-[15px]">Start today</span>
                <span className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
                  Masks the first week of water shifts from the rate read
                </span>
              </span>
              <span className="relative h-7 w-12 shrink-0 rounded-full transition-colors" style={{ background: startToday ? "var(--primary)" : "var(--surface-raised)" }} aria-hidden>
                <span className="absolute top-0.5 h-6 w-6 rounded-full transition-transform" style={{ background: startToday ? "var(--text-on-primary)" : "var(--text-tertiary)", transform: startToday ? "translateX(22px)" : "translateX(2px)" }} />
              </span>
            </button>

            {ctx.recentCutEnded && draft.type === "gain" && (
              <div className="flex flex-col gap-2 rounded-[12px] px-4 py-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  You finished a cut recently. Running 2 to 4 weeks at maintenance first lets the new maintenance be measured before the gain starts.
                </p>
                <SecondaryButton small onClick={switchToMaintenance}>
                  Maintain for now
                </SecondaryButton>
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-[12px] px-4 py-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <p className="text-[15px]">Are you pregnant, or have you had an eating disorder?</p>
              <div className="flex gap-2" role="radiogroup" aria-label="Safety question">
                {[
                  { v: false, label: "No" },
                  { v: true, label: "Yes" },
                ].map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={safety === o.v}
                    onClick={() => setSafety(o.v)}
                    className="h-[36px] rounded-full px-4 text-[13px] font-medium"
                    style={{ background: safety === o.v ? "var(--primary)" : "var(--surface-raised)", color: safety === o.v ? "var(--text-on-primary)" : "var(--text-secondary)" }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {safety === true && (
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  Targets will sit at maintenance and the app won&apos;t coach a deficit. Please talk to a GP or registered dietitian before changing your weight.
                </p>
              )}
              {underage && draft.type === "lose" && (
                <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
                  Calorie targets for a deficit aren&apos;t available under 18. Maintenance targets are.
                </p>
              )}
              {safetyForcesMaintenance && draft.type !== "maintain" && (
                <SecondaryButton small onClick={switchToMaintenance}>
                  Switch to maintenance
                </SecondaryButton>
              )}
            </div>

            <ErrorLine text={error} />
            <div className="grid grid-cols-[auto_1fr] gap-2">
              <SecondaryButton onClick={() => setStep(draft.type === "maintain" ? "target" : "rate")}>Back</SecondaryButton>
              <PrimaryButton onClick={submit} disabled={saving || !preview.validation.ok || !preview.update || safety === null || (safetyForcesMaintenance && draft.type !== "maintain")}>
                {activeGoal ? "Replace goal" : "Set goal"}
              </PrimaryButton>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function BasicsStep({ ctx, onDone }: { ctx: GoalContext; onDone: () => void }) {
  const [sex, setSex] = useState<Sex | undefined>(ctx.profile.missing.includes("sex") ? undefined : ctx.profile.sex);
  const [heightCm, setHeightCm] = useState<number | null>(ctx.profile.heightCm ?? null);
  const [age, setAge] = useState<number>(ctx.profile.age);
  const [bodyFat, setBodyFat] = useState<BodyFatCategory | null>(ctx.profile.bodyFatCategory ?? null);
  const [sheet, setSheet] = useState<"height" | "age" | null>(null);
  const [saving, setSaving] = useState(false);
  const ok = !!sex && heightCm != null && heightCm >= 120 && heightCm <= 230 && age >= 13 && age <= 100;

  async function save() {
    if (!ok) return;
    setSaving(true);
    await saveBasics({ sex, heightCm: heightCm ?? undefined, age, bodyFatCategory: bodyFat });
    setSaving(false);
    onDone();
  }

  return (
    <section className="flex flex-col gap-4" aria-label="About you">
      <div>
        <h1 className="text-[20px] font-semibold tracking-[-0.01em]">A few basics</h1>
        <p className="mt-1 text-[13px]" style={{ color: "var(--text-secondary)" }}>
          The maintenance estimate needs these. Saved to your profile.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Caption>Sex</Caption>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Sex">
          {SEX_OPTIONS.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={sex === o.v} onClick={() => setSex(o.v)} className="h-[36px] rounded-full px-4 text-[13px] font-medium" style={{ background: sex === o.v ? "var(--primary)" : "var(--surface-raised)", color: sex === o.v ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <RowGroup>
        <Row label="Height" value={heightCm != null ? `${heightCm} cm` : <span style={{ color: "var(--text-tertiary)" }}>Add</span>} trailing={<Chevron />} onClick={() => setSheet("height")} ariaLabel="Height" />
        <Row label="Age" value={`${age}`} trailing={<Chevron />} onClick={() => setSheet("age")} ariaLabel="Age" />
      </RowGroup>
      <div className="flex flex-col gap-2">
        <Caption>Body fat, roughly (optional)</Caption>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Body fat category">
          {BODY_FAT_OPTIONS.map((o) => (
            <button key={o.v} type="button" role="radio" aria-checked={bodyFat === o.v} onClick={() => setBodyFat(bodyFat === o.v ? null : o.v)} className="h-[36px] rounded-full px-4 text-[13px] font-medium" style={{ background: bodyFat === o.v ? "var(--primary)" : "var(--surface-raised)", color: bodyFat === o.v ? "var(--text-on-primary)" : "var(--text-secondary)" }}>
              {o.label}
            </button>
          ))}
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Sets the protein target. Skip it and protein uses a bodyweight rule instead.
        </p>
      </div>
      <PrimaryButton onClick={save} disabled={!ok || saving}>
        Continue
      </PrimaryButton>
      <NumberSheet open={sheet === "height"} onClose={() => setSheet(null)} title="Height" unit="cm" initial={heightCm} decimals={0} step={1} min={120} max={230} onSave={setHeightCm} />
      <NumberSheet open={sheet === "age"} onClose={() => setSheet(null)} title="Age" initial={age} decimals={0} step={1} min={13} max={100} onSave={setAge} />
    </section>
  );
}
