"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import NumberPad, { NumberPadValue, formatPadValue, parsePadValue } from "@/components/ui/NumberPad";
import { useHeightInput } from "@/components/physique/HeightSheet";
import RateSlider from "@/components/physique/RateSlider";
import { formatRate } from "@/components/physique/WeightChartCard";
import { ErrorLine, PrimaryButton } from "@/components/physique/ui";
import { useUnit } from "@/lib/unit-preference";
import { saveWeighIn } from "@/lib/physique/io/bodyData";
import { createGoal, loadGoalContext, previewGoal, saveBasics } from "@/lib/physique/io/goalSetup";
import { saveOnboardingBasics } from "@/lib/physique/io/profile";
import { loadOnboardingProfile, type OnboardingYearsBand } from "@/lib/onboardingProfile";
import { SEX_OPTIONS } from "@/lib/physique/profileOptions";
import { defaultTargetKg, forcedMaintenance, setupSteps, targetFits, type SetupStep } from "@/lib/physique/setupFlow";
import { CUT_REFUSED_ABOVE, GAIN_REFUSED_ABOVE, rateBands } from "@/lib/physique/targets";
import type { GoalType, Sex } from "@/lib/physique/types";
import { displayToKg, formatWeight, kgToDisplay, type WeightUnit } from "@/lib/units";
import type { Now } from "@/lib/dates";

const n0 = (v: number) => Math.round(v).toLocaleString("en-GB");
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (date: string) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;

/** Slowest pace the slider offers, %BW a week (as the goal wizard). OURS. */
const MIN_MAG = 0.1;
/** How long a picked answer shows before the next question, ms. OURS: long enough to see the tick. */
const ADVANCE_MS = 180;

const YEARS: Array<{ v: OnboardingYearsBand; label: string }> = [
  { v: "new", label: "Under a year" },
  { v: "1-2", label: "1 to 2 years" },
  { v: "3-5", label: "3 to 5 years" },
  { v: "5+", label: "Over 5 years" },
];

const KINDS: Array<{ v: GoalType; label: string; sub: string }> = [
  { v: "lose", label: "Lose fat", sub: "Eat below maintenance" },
  { v: "maintain", label: "Maintain", sub: "Hold your weight" },
  { v: "gain", label: "Build muscle", sub: "Eat a little above" },
];

/**
 * First-run setup (O1): one question a screen with a thin progress bar,
 * after MacroFactor's and Yazio's onboarding; the calories and finish date
 * sit above the target and pace and move as they change, as on
 * MacroFactor's goal screen. Answers save as they are given (basics,
 * today's weigh-in, training years) and the goal is written at the end by
 * the same `createGoal` as the goal wizard, safety rules included.
 */
export default function SetupFlow({ now }: { now: Now }) {
  const router = useRouter();
  const { unit: rawUnit, setUnit } = useUnit();
  const unit: WeightUnit = rawUnit === "lb" ? "lb" : "kg";
  const [version, setVersion] = useState(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const ctx = useMemo(() => loadGoalContext(now, unit), [now, unit, version]);
  const missing = ctx.profile.missing;

  const [step, setStep] = useState<SetupStep>("sex");
  const [sex, setSex] = useState<Sex | null>(missing.includes("sex") ? null : ctx.profile.sex);
  // Age has a default in the profile, so it counts as known only once the other basics are.
  const [ageText, setAgeText] = useState(missing.length > 0 ? "" : String(ctx.profile.age));
  const [weightText, setWeightText] = useState(ctx.trendKg != null ? formatPadValue(kgToDisplay(ctx.trendKg, unit), 1) : "");
  const [years, setYears] = useState<OnboardingYearsBand | null>(() => loadOnboardingProfile()?.yearsTrainingBand ?? null);
  const [kind, setKind] = useState<GoalType | null>(null);
  const [targetText, setTargetText] = useState("");
  const [magnitude, setMagnitude] = useState<number | null>(null);
  const [confirmedOutside, setConfirmedOutside] = useState(false);
  const [safety, setSafety] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const height = useHeightInput(missing.includes("heightCm") ? null : (ctx.profile.heightCm ?? null));
  const advancing = useRef(false);

  const steps = setupSteps(kind);
  const index = steps.indexOf(step);
  const age = parsePadValue(ageText);
  const weightKg = (() => {
    const v = parsePadValue(weightText);
    return v != null && v > 0 ? displayToKg(v, unit) : null;
  })();
  const currentKg = ctx.trendKg;
  const status = ctx.statusFromLifts ?? ctx.statusFromYears;

  // ── The goal as it stands ──
  const targetKg = (() => {
    const v = parsePadValue(targetText);
    return v != null && v > 0 ? displayToKg(v, unit) : null;
  })();
  const moving = kind === "lose" || kind === "gain" ? kind : null;
  const fits = moving != null && targetKg != null && currentKg != null && targetFits(moving, targetKg, currentKg);
  const bands = currentKg != null && targetKg != null ? rateBands(status, { nearGoal: Math.abs(currentKg - targetKg) <= 0.02 * currentKg }) : null;
  // Unsigned %BW a week; the cut band's default is stored negative.
  const mag = moving && bands ? (magnitude ?? (moving === "lose" ? -bands.cut.default : bands.gain.default)) : 0;
  const forced = kind != null && forcedMaintenance(kind, { age: ctx.profile.age, safetyYes: safety === true });
  const finalTarget = kind === "maintain" || forced ? currentKg : targetKg;
  const finalRate = kind === "maintain" || forced || !moving ? 0 : moving === "lose" ? -mag : mag;
  const preview = useMemo(() => {
    if (finalTarget == null || currentKg == null) return null;
    if (moving && !forced && !fits) return null;
    return previewGoal(ctx, { targetKg: finalTarget, ratePctPerWeek: finalRate, status }, now);
  }, [ctx, finalTarget, finalRate, status, now, currentKg, moving, forced, fits]);

  function go(to: SetupStep) {
    setError(null);
    setStep(to);
  }
  const next = () => go(steps[Math.min(index + 1, steps.length - 1)]);
  function back() {
    if (index === 0) router.replace("/welcome");
    else go(steps[index - 1]);
  }
  /** Single-choice screens move on by themselves once the tick has shown. */
  function pickThen(apply: () => void, to?: SetupStep) {
    apply();
    if (advancing.current) return;
    advancing.current = true;
    window.setTimeout(() => {
      advancing.current = false;
      if (to) go(to);
      else next();
    }, ADVANCE_MS);
  }

  async function saveHeightAndGo() {
    if (!height.ok || height.cm == null || !sex || age == null) return;
    setBusy(true);
    await saveBasics({ sex, heightCm: height.cm, age });
    setVersion((v) => v + 1);
    setBusy(false);
    next();
  }
  async function saveWeightAndGo() {
    if (weightKg == null) return;
    setBusy(true);
    const r = await saveWeighIn(now.today, weightKg, new Date().toISOString());
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setVersion((v) => v + 1);
    next();
  }
  function chooseYears(v: OnboardingYearsBand) {
    pickThen(() => {
      setYears(v);
      saveOnboardingBasics({ yearsTrainingBand: v });
      setVersion((x) => x + 1);
    });
  }
  function chooseKind(v: GoalType) {
    pickThen(
      () => {
        setKind(v);
        setMagnitude(null);
        setConfirmedOutside(false);
        if ((v === "lose" || v === "gain") && currentKg != null) setTargetText(formatPadValue(kgToDisplay(defaultTargetKg(v, currentKg, kgToDisplay(1, unit)), unit), 1));
      },
      v === "maintain" ? "safety" : "target",
    );
  }
  async function start() {
    if (finalTarget == null || !preview?.validation.ok || safety === null) return;
    setBusy(true);
    const r = await createGoal(ctx, { targetKg: finalTarget, ratePctPerWeek: finalRate, status }, now, { startToday: true, safety: { pregnantOrEdHistory: safety }, nowIso: new Date().toISOString() });
    setBusy(false);
    if (r.ok) router.replace("/");
    else setError(r.error);
  }

  // ── Screens ──
  let title = "";
  let helper: ReactNode = null;
  let body: ReactNode = null;
  let footer: ReactNode = null;

  const tiles =
    preview?.update && currentKg != null ? (
      <div className="mb-2 grid grid-cols-2 gap-2">
        <Tile value={`${n0(preview.update.entry.kcal)} kcal`} label="a day to start" tint />
        <Tile value={preview.etaDate ? monthYear(preview.etaDate) : "–"} label={finalTarget != null ? `to reach ${formatWeight(finalTarget, unit)}` : "to reach it"} />
      </div>
    ) : null;

  switch (step) {
    case "sex":
      title = "Your sex";
      helper = "Used for the maintenance estimate.";
      body = (
        <Choices>
          {SEX_OPTIONS.map((o) => (
            <Choice key={o.v} label={o.label} selected={sex === o.v} onPick={() => pickThen(() => setSex(o.v))} />
          ))}
        </Choices>
      );
      break;
    case "age":
      title = "Your age";
      body = (
        <>
          <NumberPadValue value={ageText} unit="years" />
          <NumberPad value={ageText} onChange={setAgeText} decimals={0} step={1} min={13} max={100} maxIntDigits={3} />
        </>
      );
      footer = (
        <PrimaryButton onClick={next} disabled={age == null || age < 13 || age > 100}>
          Next
        </PrimaryButton>
      );
      break;
    case "height":
      title = "Your height";
      body = height.view;
      footer = (
        <PrimaryButton onClick={saveHeightAndGo} disabled={!height.ok || busy}>
          Next
        </PrimaryButton>
      );
      break;
    case "weight":
      title = "Today's weight";
      helper = "The trend starts here.";
      body = (
        <>
          <div className="flex justify-center">
            <span className="flex gap-1" role="radiogroup" aria-label="Weight units">
              {(["kg", "lb"] as const).map((u) => (
                <button
                  key={u}
                  type="button"
                  role="radio"
                  aria-checked={unit === u}
                  onClick={() => {
                    if (u === unit) return;
                    // Carry the number across so switching never loses what was typed.
                    if (weightKg != null) setWeightText(formatPadValue(kgToDisplay(weightKg, u), 1));
                    setUnit(u);
                  }}
                  className="h-8 rounded-full px-3.5 text-[13px] font-medium"
                  style={{ background: unit === u ? "var(--primary)" : "var(--surface-raised)", color: unit === u ? "var(--text-on-primary)" : "var(--text-secondary)" }}
                >
                  {u}
                </button>
              ))}
            </span>
          </div>
          <NumberPadValue value={weightText} unit={unit} />
          <NumberPad value={weightText} onChange={setWeightText} decimals={1} step={0.1} max={unit === "kg" ? 300 : 660} />
        </>
      );
      footer = (
        <PrimaryButton onClick={saveWeightAndGo} disabled={weightKg == null || weightKg < 30 || busy}>
          Next
        </PrimaryButton>
      );
      break;
    case "years":
      title = "How long have you lifted?";
      helper = "Sets a realistic pace for your goal.";
      body = (
        <Choices>
          {YEARS.map((o) => (
            <Choice key={o.v} label={o.label} selected={years === o.v} onPick={() => chooseYears(o.v)} />
          ))}
        </Choices>
      );
      break;
    case "goal":
      title = "What's the goal?";
      body = (
        <Choices>
          {KINDS.map((o) => (
            <Choice key={o.v} label={o.label} sub={o.sub} selected={kind === o.v} onPick={() => chooseKind(o.v)} />
          ))}
        </Choices>
      );
      break;
    case "target":
      title = "Target weight";
      body = (
        <>
          {tiles}
          <NumberPadValue value={targetText} unit={unit} hint={currentKg != null ? `Now ${formatWeight(currentKg, unit)}` : undefined} />
          <NumberPad
            value={targetText}
            onChange={(v) => {
              setTargetText(v);
              setMagnitude(null);
              setConfirmedOutside(false);
            }}
            decimals={1}
            step={0.5}
            max={unit === "kg" ? 300 : 660}
          />
          {targetKg != null && currentKg != null && !fits && (
            <p className="text-center text-[13px]" style={{ color: "var(--text-secondary)" }}>
              {moving === "lose" ? `Below ${formatWeight(currentKg, unit)} for a cut.` : `Above ${formatWeight(currentKg, unit)} for a gain.`}
            </p>
          )}
        </>
      );
      footer = (
        <PrimaryButton onClick={next} disabled={!fits}>
          Next
        </PrimaryButton>
      );
      break;
    case "pace":
      title = moving === "gain" ? "How fast to gain?" : "How fast to lose?";
      body =
        moving && currentKg != null && targetKg != null && preview ? (
          <div className="flex flex-col gap-4">
            {tiles}
            <div className="rounded-[16px] px-4 py-3" style={{ background: "var(--surface)" }}>
              <div className="flex items-baseline justify-between">
                <span className="text-[28px] font-semibold leading-none tracking-[-0.02em]" style={{ fontVariantNumeric: "tabular-nums" }}>
                  {formatRate(finalRate)}
                </span>
                <span className="text-[13px]" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {preview.validation.kgPerWeek > 0 ? "+" : "−"}
                  {formatWeight(Math.abs(preview.validation.kgPerWeek), unit, 2)} a week
                </span>
              </div>
              <div className="mt-2">
                <RateSlider
                  type={moving}
                  magnitude={mag}
                  onChange={(m) => {
                    setMagnitude(m);
                    setConfirmedOutside(false);
                  }}
                  status={status}
                  trendKg={currentKg}
                  tdee0={ctx.tdee0 ?? 0}
                  nearGoal={Math.abs(currentKg - targetKg) <= 0.02 * currentKg}
                  minMag={MIN_MAG}
                  maxMag={moving === "lose" ? CUT_REFUSED_ABOVE : GAIN_REFUSED_ABOVE}
                />
              </div>
            </div>
            {!preview.validation.ok && (
              <p className="text-[13px]" style={{ color: "var(--status-attention)" }}>
                {preview.validation.message}
              </p>
            )}
            {preview.validation.ok && preview.validation.band === "confirm" && (
              <Choice
                label={preview.validation.outside === "faster" ? "Faster than the usual range. I understand." : "Slower than the usual range. I understand."}
                selected={confirmedOutside}
                onPick={() => setConfirmedOutside((c) => !c)}
                small
              />
            )}
          </div>
        ) : null;
      footer = (
        <PrimaryButton onClick={next} disabled={!preview?.validation.ok || (preview.validation.band === "confirm" && !confirmedOutside) || !preview.update}>
          Next
        </PrimaryButton>
      );
      break;
    case "safety":
      title = "One safety question";
      helper = "Are you pregnant, or have you had an eating disorder?";
      body = (
        <Choices>
          <Choice label="No" selected={safety === false} onPick={() => pickThen(() => setSafety(false))} />
          <Choice label="Yes" selected={safety === true} onPick={() => pickThen(() => setSafety(true))} />
        </Choices>
      );
      break;
    case "summary": {
      const u = preview?.update;
      title = "Your starting targets";
      helper = "Targets follow your maintenance as it updates.";
      body = u ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-[16px] px-4 py-4" style={{ background: "var(--surface)" }}>
            <span className="text-[44px] font-semibold leading-none tracking-[-0.02em]" style={{ fontVariantNumeric: "tabular-nums" }}>
              {n0(u.entry.kcal)}
            </span>
            <span className="ml-1.5 text-[15px] font-medium" style={{ color: "var(--text-secondary)" }}>
              kcal a day
            </span>
            <div className="mt-4 grid grid-cols-3 gap-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
              <Macro label="Protein" g={u.entry.proteinG} color="var(--macro-protein)" />
              <Macro label="Fat" g={u.entry.fatG} color="var(--macro-fat)" />
              <Macro label="Carbs" g={u.entry.carbsG} color="var(--macro-carb)" />
            </div>
          </div>
          <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--surface)" }}>
            <Line label="Goal" value={finalRate === 0 ? `Hold ${currentKg != null ? formatWeight(currentKg, unit) : ""}` : `${finalTarget != null ? formatWeight(finalTarget, unit) : ""}${preview?.etaDate ? ` by ${monthYear(preview.etaDate)}` : ""}`} />
            {finalRate !== 0 && <Line label="Pace" value={`${formatRate(finalRate)} · ${preview && preview.validation.kgPerWeek > 0 ? "+" : "−"}${formatWeight(Math.abs(preview?.validation.kgPerWeek ?? 0), unit, 2)} a week`} />}
            <Line label="Maintenance" value={`about ${n0(u.tdee)} kcal`} />
          </div>
          {forced && kind !== "maintain" && (
            <p className="text-[13px] leading-snug" style={{ color: "var(--text-secondary)" }}>
              {safety ? "Targets sit at maintenance. Please talk to a GP or dietitian before changing your weight." : "Deficit targets aren't offered under 18. These are maintenance targets."}
            </p>
          )}
          <ErrorLine text={error} />
        </div>
      ) : (
        <ErrorLine text={error ?? "Couldn't work out targets. Go back and check your answers."} />
      );
      footer = (
        <PrimaryButton onClick={start} disabled={!u || busy}>
          Start
        </PrimaryButton>
      );
      break;
    }
  }

  return (
    <main className="flex min-h-[100dvh] flex-col" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-5 sm:px-6">
        <header className="flex items-center gap-3 pb-2 pt-3">
          <button type="button" onClick={back} className="-ml-2 flex h-10 w-10 items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }} aria-label="Back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden>
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <div className="h-1 flex-1 overflow-hidden rounded-full" style={{ background: "var(--surface-raised)" }} role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} aria-label={`Step ${index + 1} of ${steps.length}`}>
            <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${((index + 1) / steps.length) * 100}%`, background: "var(--primary)" }} />
          </div>
          <button type="button" onClick={() => router.replace("/")} className="h-10 px-1 text-[15px] font-medium" style={{ color: "var(--text-secondary)" }}>
            Later
          </button>
        </header>
        <section key={step} className="flex flex-1 flex-col pt-6" aria-label={title}>
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em]">{title}</h1>
          {helper && (
            <p className="mt-2 text-[15px] leading-snug" style={{ color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
              {helper}
            </p>
          )}
          <div className="mt-6 flex flex-1 flex-col">{body}</div>
          {step !== "summary" && <ErrorLine text={error} />}
        </section>
        {footer && (
          <div className="sticky bottom-0 pt-3" style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
            {footer}
          </div>
        )}
      </div>
    </main>
  );
}

// ── Parts ──

function Choices({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2" role="radiogroup">
      {children}
    </div>
  );
}

/** One answer: a full-width row with a round tick, as on MacroFactor's and Yazio's question screens. */
function Choice({ label, sub, selected, onPick, small }: { label: string; sub?: string; selected: boolean; onPick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className={`flex w-full items-center justify-between gap-3 rounded-[14px] px-4 text-left transition-colors ${small ? "min-h-[52px] py-2.5" : "min-h-[60px] py-3"}`}
      style={{ background: "var(--surface)", boxShadow: selected ? "inset 0 0 0 2px var(--primary)" : "inset 0 0 0 1px var(--border)" }}
    >
      <span className="flex min-w-0 flex-col">
        <span className={`${small ? "text-[13px]" : "text-[17px] font-semibold"}`} style={{ color: small ? "var(--text-secondary)" : "var(--text)" }}>
          {label}
        </span>
        {sub && (
          <span className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            {sub}
          </span>
        )}
      </span>
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: selected ? "var(--primary)" : "transparent", boxShadow: selected ? undefined : "inset 0 0 0 1.5px var(--border-strong)", color: "var(--text-on-primary)" }} aria-hidden>
        {selected && (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
            <path d="M5 12l5 5L20 7" />
          </svg>
        )}
      </span>
    </button>
  );
}

/** A number the choice gives, above the inputs that move it (after MacroFactor's goal screen). */
function Tile({ value, label, tint }: { value: string; label: string; tint?: boolean }) {
  return (
    <div className="flex flex-col rounded-[14px] px-3.5 py-3" style={{ background: tint ? "var(--green-dim)" : "var(--surface)" }}>
      <span className="text-[20px] font-semibold leading-tight tracking-[-0.01em]" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
      <span className="text-[12px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
    </div>
  );
}

function Macro({ label, g, color }: { label: string; g: number; color: string }) {
  return (
    <span className="flex flex-col">
      <span className="text-[17px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
        {n0(g)} g
      </span>
      <span className="flex items-center gap-1 text-[12px]" style={{ color: "var(--text-secondary)" }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </span>
    </span>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-3 [&+&]:border-t [&+&]:border-[var(--border)]">
      <span className="text-[15px]" style={{ color: "var(--text-secondary)" }}>
        {label}
      </span>
      <span className="text-[15px] font-semibold" style={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </div>
  );
}
