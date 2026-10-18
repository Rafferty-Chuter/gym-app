# 02 — Engine spec: the physique judge

This is the normative spec for everything the app *decides*: trend weight, rate of change, expenditure, targets, and the verdicts ("is it working?"). The assistant only explains what this engine outputs.

**Provenance.** Every constant is tagged:
- **PUB**: published by the app we copied (MacroFactor, RP, Hevy). See `research/A-macrofactor-nutrition.md` and `research/B-training-apps.md`.
- **EVID**: from the scientific literature. See `research/F-evidence-rules.md` for citations.
- **CAL**: our value, calibrated to reproduce a published behaviour.
- **OURS**: our assumption; tune it during dogfooding.

If this file and a research report disagree, **this file wins**. The research files are the reasoning behind it.

**Revision 2** (same day). This version applies an independent review: two-layer double-correction, test feasibility, safety floors, undefined terms. The simulation scripts that back the numbers marked "(sim)" are summarised in the review notes in `STATUS.md`.

---

## 0. Principles

1. **Pure functions.** `lib/physique/*` takes data and `now = {today, tz}` as arguments. No storage, no `window`, no `Date.now()`. The only exceptions are the I/O modules in `lib/physique/io/` (repos, profile, payload).
2. **Recompute from history**, from a fixed starting snapshot. Derived numbers aren't stored as truth, and editing a past entry recomputes everything downstream (as MacroFactor does). The **expenditure seed** is snapshotted once (§4.2), so later profile or goal edits don't rewrite past expenditure.
3. **Two layers, never stacked.**
   - **Layer 1 – Coach** (copied from MacroFactor). `target = expenditure + goalRate × W × 7716 / 7`, updated weekly and adherence-neutral, with no catch-up.
     - If the user eats to target and the observed rate differs from the goal rate, then the *expenditure estimate* is off.
     - Layer 1 corrects that by itself as expenditure updates.
   - **Layer 2 – Judge** (our differentiator). It reads outcomes (rate, lifts, sleep, protein, adherence) and chooses **one** of these:
     - **(a) `change_rate`**, only when the **goal itself** is outside the evidence range for the situation. Example: goal −1.0 %/wk while lifts are dropping → −0.6.
     - **(b) `refresh_targets`**, when the goal is in range, the user is adherent, and the coach is lagging. It starts a new program now with the uncapped raw target, so the weekly cap doesn't drag the correction out.
     - **(c) A behaviour change**: eat to target, sleep, protein, logging.
     - **(d) Nothing.**

     **The judge never adds a kcal tweak on top of the coach.** Every recommendation passes the direction checks in §8.2.
4. **Gate before judging.** Every verdict has a minimum-data requirement and a confidence test. Below them, the output is an honest "calibrating" or "not enough data" state.
5. **Silence beats false positives.** When rules conflict or the data is borderline, say nothing. After an accepted recommendation, the same rule family stays quiet for 14 days.
6. **Never claim what can't be measured.** See §10.

---

## 1. Inputs and conventions

### 1.1 Entities (canonical units)

Full types live in `lib/physique/types.ts` (ticket P1). Summary:

| Entity | Key fields |
|---|---|
| `WeighIn` | `id`, `date` (local `YYYY-MM-DD`), `loggedAt`, `kg`, `source` (`manual` \| `healthkit` \| `import`) |
| `FoodEntry` | `id`, `date`, `loggedAt`, `label`, `kcal`, `proteinG`, `carbsG`, `fatG`, `method` (`quick` \| `saved` \| `ai_text` \| `ai_photo` \| `barcode` \| `search`), `confidence?`, `savedFoodId?` |
| `DayFlags` | `date`, `status?` (`partial` \| `fasting`, set by the user), `kcalOverride?` (Edit Day total), `events?: Array<{type: "creatine_start" \| "carb_switch" \| "illness" \| "travel" \| "period", creatineLoading?: boolean}>` |
| `SleepNight` | `id`, `date` (**local wake date**), `bedtime?`, `wakeTime?`, `asleepMin`, `inBedMin?`, `wakeups?` (`0` \| `1-2` \| `3+`), `quality?` (1–5), `source` (`manual` \| `healthkit`); M3: `hrvMs`, `hrvMethod`, `restingHr`; S6: `stages?` (core, deep, REM, awake minutes, display only); S8: `segments?` (`{s, o, d}` stage segments in minutes after bedtime, display only) |
| `WaistEntry` | `id`, `date`, `cm` (protocol: navel, morning, after voiding, relaxed exhale, mean of 2 readings; EVID, research F §10) |
| `PhysiqueGoal` | see §5.1 |
| `PhysiqueProfile` | `sex` (`M` \| `F` \| `prefer_not_to_say`), `age` (from onboarding; **default 30**), `heightCm` (**required to create a goal**), `bodyFatCategory?` (§5.4), `bodyFatPctMeasured?`, `generalActivity` (`low` \| `moderate` \| `high`), `manualInitialTdee?`, `expenditureStartDate`, `checkInWeekday` (0–6, default 1), `proteinLevel` (`low` \| `moderate` \| `high` \| `extra`, default `moderate`), `dietType` (`balanced` \| `lowCarb`, default `balanced`), `sleepGoalH` (7–9, default 8), `wakeTimeHHMM?` (fallback until 3 nights give a usual wake), `wakeOverride?` (S8: `{date, hhmm}`, one morning only) |
| `PhysiqueProgram` | `id`, `goalId`, `history: Array<{startDate, kcal, proteinG, fatG, carbsG, source: "goal_start" \| "check_in" \| "refresh" \| "apply_now", acceptedAt}>`; the entry in effect on day d is the latest with `startDate ≤ d` |

Workouts come from the existing `StoredWorkout` history (`lib/trainingAnalysis.ts`). **Weights there are unitless strings in the current `weightUnit`** (the whole history is rewritten when the unit changes). The engine therefore takes `workoutWeightUnit: "kg" | "lb"` as an input and parses with `parseWeightText(text, unit)` from `lib/units.ts`. That returns `null` for "", "BW" or NaN, and those sets are skipped.

### 1.2 Conventions

- **Local date and now.** `now = {today: "YYYY-MM-DD", tz: IANA}` comes from the client (`Intl.DateTimeFormat().resolvedOptions().timeZone`). The server **never** derives dates from its own clock (Vercel runs in UTC). Every record carries the user's local `YYYY-MM-DD`; workout dates are `localDateKey(new Date(completedAt), tz)`. Sleep belongs to the **wake date**. "Weekday" means a wake date from Monday to Friday.
- **Windows are whole weeks** (14, 21, 28 or 42 days), so the weekend weight cycle cancels out. EVID (Turicchi 2020).
- **`BW`** is the mean raw weigh-in over the analysis window.
- **Signed rates.** −0.6 means losing 0.6 %BW per week. "More aggressive" means a larger |rate|.
- **Day status.** Each day's intake status is one of:
  - `fasting`: the user flagged it; counts as 0 kcal.
  - `partial`: the user flagged it; skipped.
  - `unlogged`: no entries and no override; skipped.
  - `complete`: everything else.

  The engine *suggests* `partial` when `0 < kcal < 0.5 × median(kcal of complete days in the last 21)` (OURS). A suggested day is **unresolved** until the user confirms or dismisses it.
- **Day kcal.** `kcalOverride` beats the sum of food entries.
- **Target on day d** is the `PhysiqueProgram.history` entry in effect on d. Days with no program are excluded from adherence.
- **Main lifts.** The user's 2–4 most frequently logged lifts that are:
  - compound (role/pattern from `lib/exerciseMetadataLibrary.ts`, else a name list: squat, bench, deadlift, overhead press, row, pull-up variants);
  - **loaded** (weight > 0; bodyweight-only sets are excluded);
  - trained in **≥5 of the last 6 weeks**.

  With fewer than 2 main lifts, strength status is `unclear`.
- **Phase segment.** The analysis segment for rate rules starts at the latest of:
  - phase start + 7 days (the mask, §2.3);
  - the last goal-rate change of ≥0.2 %/wk + 7 days;
  - the end of the last water event (§2.4).

  Minimum-data counts are measured **inside** the segment.

---

## 2. Weight

### 2.1 Trend weight (display and expenditure)

- Fill missing days by linear interpolation between real weigh-ins. Don't extrapolate past the last weigh-in: the trend ends there. PUB (MacroFactor KB#21).
- `trend[d] = trend[d−1] + 0.10 × (w[d] − trend[d−1])`, seeded with the first weigh-in. CAL: this reproduces MacroFactor's published impulse test (research A §G.6; reproduced exactly in review: −59, −56, −22, +35, +38, +29).
- If several weigh-ins share a date, use the earliest of the day.
- **Sanity check.** If a new weigh-in is more than **3%** from the trend, ask "Is that right?" before saving. OURS.

### 2.2 Rate of change (verdicts and the rate display)

The EMA slope lags about 9 days, so verdicts don't use it.

- **Rate:** a robust least-squares slope of **raw** weigh-ins against day number over the window. Fit OLS, cap residuals at 3 × MAD, refit once. Then `rate = slope × 7 / BW × 100` (%BW/wk).
- **`SE_adj`** = the refit slope's standard error × 1.6. The factor allows for day-to-day water autocorrelation. EVID/derived (research F §5).
- **Margin:** `margin(window) = max(1.645 × SE_adj, fallback(window) × 85 / BW)`, with fallback 14 d → 0.66, 21 d → 0.38, 28 d → 0.25, 42 d → 0.14 (%/wk). Multiply it by **1.5** if a water event (§2.4) falls inside the window or the 14 days before it.
- **"Confidently above X"** means `rate − X > margin`. "Confidently below X" means `X − rate > margin`.
- **Rate display:** the largest of 28 / 21 / 14 days that fits inside the segment and has ≥ 0.4 weigh-ins per day (min 5). Below 14 days or 5 weigh-ins, show "Early read · N more weigh-ins". EVID.
- **Which window each rule uses** (always the largest that fits inside the segment):

  | Rule | Windows (largest that fits) | Minimum data |
  |---|---|---|
  | LOSS-1, LOSS-2, LOSS-4, ON-TRACK | 28 → 21 | ≥21 d in the segment, ≥12 weigh-ins |
  | LOSS-3 | 21 → 14 | ≥14 d, ≥8 weigh-ins |
  | LOSS-6, GAIN-1, GAIN-2 | 42 → 28 (advanced: 42 only) | ≥28 d, ≥16 weigh-ins |
  | RECOMP-1 | 28 | ≥28 d |

  Verdict copy cites the rule's **own** window and n ("over 28 days, 24 weigh-ins").

### 2.3 Phase-change mask and cooldown

- **Mask.** For 7 days after the start of a cut, a bulk or a diet break, a return to a deficit, or a goal-rate change of ≥0.2 %/wk, no rate verdict fires. Those days are also **excluded from rate windows** (the segment rule, §1.2). EVID (Hall 2008; Kreitzman 1992).
- **Cooldown.** After the user accepts a `change_rate` or `refresh_targets`, the rule family that produced it (LOSS-*, GAIN-*) stays silent for 14 days. EVID G5.

### 2.4 Water events

- **Events:** `creatine_start`, `carb_switch`, `period`, `illness`, `travel`.
- **Effects:**
  - They widen the margin ×1.5 (§2.2).
  - The weekly check-in offers "skip this week's update?". PUB (MacroFactor KB#26).
- **`creatine_start`** excludes 7 days after the start date from rate windows when `creatineLoading` is true, otherwise 28 days. EVID.
- **`period`** in the first or last 5 days of a window means that rule needs the 28-day window or longer (G-NOISE-4).

---

## 3. Intake

- `intakeMean(window)` = mean kcal over `complete` and `fasting` days.
- `loggedShare(window)` = (complete + fasting days) ÷ window days.
- **Adherence** = mean over the last 14 days with a program of `(intake_d − target_d)`, using complete/fasting days only.
  - It's **on target** unless `|adherence| > max(150, 1.645 × sd_d / √n)`, where `sd_d` is the SD of the daily differences. OURS; the noise term stops it firing on random daily variation (sim: a plain ±150 fires 10.7% of the time for a perfectly adherent user).
  - Adherence **isn't computed** while any day in the window has an unresolved partial suggestion. DATA-PARTIAL fires instead.
- **Protein and fat** are 7-day and 14-day means over complete days, in g/kg BW.

---

## 4. Expenditure (Layer 1; copied from MacroFactor)

### 4.1 Daily pipeline

Research A §G.3, corrected:

```
seed = snapshotSeed(profile, goals, workouts, expenditureStartDate)   // §4.2 — fixed once
tdee[d0] = initialTdee(seed)
paused = false; offset = { amount: 0, start: null }
for each day i ≥ 1 (d = days[i]):
  last7 = days[i-6..i]
  nutritionOK = count(status ∈ {complete, fasting} in last7) ≥ 4          // PUB
  weightOK    = count(real weigh-ins in last7) ≥ 1                          // PUB
  if paused: paused = !(last 3 days all complete/fasting && weightOK)       // PUB: resume after 3 days
  else:      paused = !(nutritionOK && weightOK)
  if i < 7 or paused:
     base[d] = base[d-1]; state = "holding"                                 // PUB: hold the last good value
  else:
     Ne = min(21, i+1); Le = min(20, i)                                     // PUB windows
     intakeMean = mean kcal of complete/fasting days in the last Ne days
     dw = date of the last real weigh-in on or before d                     // the trend never extends past it
     rateKgPerDay = (trend[dw] − trend[dw − Le]) / Le
     obs = intakeMean − 7716 × rateKgPerDay                                // PUB density, same for gain and loss
     k = updatingDays < 21 ? 0.20 : 0.10                                    // OURS warm-up / CAL steady
     base[d] = base[d-1] + k × (obs − base[d-1]); state = "updating"
  tdee[d] = base[d] + predictiveOffset(d)                                   // kept outside the EMA (see below)
```

**Predictive goal adjustment** (PUB factor 4×, OURS ramp):
- When the user confirms a new phase or rate after `expenditureStartDate`, set `offset.amount = base[d] × 4 × (r_new − r_old) / 100`, where `r_old` is the previous goal's rate (0 if there was none).
- `predictiveOffset(d)` ramps linearly from 0 to `offset.amount` over 14 days, then **decays** linearly to 0 over the next 28 days as the data takes over.
- It is a separate additive term, so the EMA doesn't erase it.
- Maintain-band nudges (§5.2) are **not** goal changes.

### 4.2 Initial estimate (the seed)

**Snapshot once, at `expenditureStartDate`:**
- profile fields;
- the goal active on that date (rate 0 if none);
- sessions per week, as the mean over the **28 days before** that date (else onboarding `daysPerWeek`).

Later profile or goal edits **don't** change the seed. MacroFactor documents the same: profile fields only seed TDEE₀ (KB#57). Resetting `expenditureStartDate` is the "fresh start" (KB#61).

**Equations (PUB, MacroFactor BMR):**
- **Default:** `BMR = 129.6·W^0.55 + 0.011·H² − a·age − 213.8·s`.
  - `a` = 1.96 per year up to 60, then 4.9 per year after.
  - `s` = 0 (M), 1 (F) or 0.5 (`prefer_not_to_say`, OURS).
- **Only with `bodyFatPctMeasured`:** `BMR = 50.2·FFM^0.7 + 40.5·(FFM^0.7·FM^0.066) − a·age`, where `a` = 1.1 per year up to 60, then 2.75. A body-fat *category* is **not** a measurement and feeds protein only.
- **Adjustment:** ×0.95 if the seed goal is a deficit.
- **Not in M1:** the athlete equation and the ×0.97 peak-weight adjustment (no data fields).
- **Activity factor** = general activity (low 1.2 / moderate 1.4 / high 1.6) + an exercise add-on by sessions per week (0 → +0; 1–3 → +0.1; 4–6 → +0.2; 7+ → +0.3). PUB.
- **Goal correction:** ×(1 + 4 × seed goal rate / 100). PUB.
- `manualInitialTdee` overrides all of the above.
- **Rounding:** round only the final kcal value; keep intermediates as floats.

**Golden tests.** These must pass to ±1 kcal; all were recomputed in review.

| Case | Expected |
|---|---|
| BMR, male, 90 kg, 180 cm, age 30 | 1,837 |
| FFM equation, FFM 75 / FM 15, age 30 | 1,993 (1,992.5) |
| TDEE₀, moderate + 4–6 sessions/wk (AF 1.6) | 2,940 |
| Same, cutting at −0.5 %/wk (×0.95 BMR, ×0.98 goal correction) | 2,737 |
| Cut target at 90 kg trend, TDEE 2,737, −0.5 %/wk | 2,241 |
| Maintain: target 75, **trend 76.0**, TDEE 2,500 (W = trend) | **2,374** |
| Fat floor: 180 cm / 150 cm / 145 cm | 45 g / 30 g / 30 g |
| 21-day mean: 20 days × 3,000 + 1 day × 1,500 | 2,929 |
| Impulse (research A §G.6), within 15 kcal at each point | −59, −56, −22, +35, +38, +29 |

### 4.3 Expenditure maturity (what the UI shows)

Maturity counts **updating days** (not calendar days). `holding` overrides every other state in the UI.

| State | Condition | Copy |
|---|---|---|
| `holding` | the pipeline is paused | "Holding · log 2 more days this week to resume" |
| `calibrating` | fewer than 21 updating days | "Calibrating · day 9 of about 21" |
| `settling` | 21–27 updating days | "≈ 2,780 kcal ± 400 · settling" |
| `stable` | 28 or more updating days | "≈ 2,780 kcal" (and "± 300" in the detail view) |

EVID (Hall & Chow 2011): don't state maintenance more precisely than this.

Behavioural tests (P3):
- On noisy synthetic data (intake SD 350), the mean absolute daily change after 30 updating days, averaged over 50 seeds, is ≤ 8 kcal at φ = 0 and ≤ 10 kcal at φ = 0.5. Review simulation: 6.2 and 7.9–8.7. **Never retune α or k to pass a test.**
- The impulse test passes.

---

## 5. Goals and targets (Layer 1)

### 5.1 Goal

```ts
type PhysiqueGoal = {
  id: string; createdAt: string;
  type: "lose" | "maintain" | "gain";        // derived: |target − trend| ≤ 0.68 kg → maintain
  startDate: string; startTrendKg: number;
  targetKg: number;
  ratePctPerWeek: number;                     // signed; 0 for maintain
  trainingStatusAtCreation: "novice" | "intermediate" | "advanced";   // frozen at creation (§5.2)
  phaseStartConfirmedAt?: string;             // starts the mask (§2.3) and the predictive offset (§4.1)
  completedAt?: string;
};
```

**No goal:** phase `none`; targets = expenditure (maintenance); the primary verdict is `NO-GOAL` ("Set a goal to get a verdict").

**Completion:** when **trend** weight reaches `targetKg`, the app offers "Switch to maintenance at X kg" (a new maintain goal plus the mask). PUB (completion on trend).

**"Near goal":** |trend − target| ≤ max(4 × weekly goal change in kg, 2% of BW).

### 5.2 Rate bands

The slider in goal setup shows these bands. Rates outside the green band need an explicit confirmation; refused rates can't be saved. Every recommended rate (§8.2) goes through the **same** validation.

**Cut (%BW/wk)** — PUB (MacroFactor) and EVID (Helms 2014; Garthe 2011; Mero 2010):

| Label | Rate |
|---|---|
| Conservative | −0.25 |
| Moderate (**default −0.6**) | −0.5 to −0.75 |
| Upper limit | −1.0 |
| Green range when near goal or advanced | tops out at −0.7 |
| **Refused** | above 1.0 kg/wk; or a day-0 deficit > 30% of TDEE₀ or > 1,000 kcal/day (PUB, MacroFactor `deficit_aggressive`); or a rate below −1.0 %/wk unless the user confirms (and never below −1.25) |

**Lean gain (%BW/wk) by training status** — EVID bands (research F §2); defaults at the band centre, OURS (sim: MacroFactor's "happy medium" defaults sit on the ceiling and trigger GAIN-1 for 50–61% of on-plan users over a 16-week bulk):

| Status | Default | Green range | GAIN-1 ceiling |
|---|---|---|---|
| Novice | +0.35 | 0.25–0.5 | 0.5 |
| Intermediate (**default status**) | +0.25 | 0.15–0.35 | 0.35 |
| Advanced | +0.15 | 0.1–0.25 | 0.25 |

**Refused:** above 1.0 %/wk, or above the MacroFactor kg cap for the status (0.8 / 0.64 / 0.48 kg/wk).

**Training status.** Derived from data only when there are ≥12 main-lift exposures **outside cuts and deloads** in the last 12 weeks. Median main-lift e1RM slope:

| Status | Slope (%/wk) |
|---|---|
| Novice | ≥ 1.5 |
| Intermediate | 0.5–1.5 |
| Advanced | < 0.5 |

These cut-offs are OURS, inspired by MacroFactor's definitions. Otherwise use onboarding `yearsTrainingBand`: new / 1–2 → novice; 3–5 → intermediate; 5+ → advanced. The status is **frozen on the goal at creation**, so the ceilings don't flicker.

**Maintain:** hold trend weight within ±0.68 kg of the target. Outside that band, apply 0.15 %/wk toward the target. PUB.

### 5.3 Weekly target

```
W = trend weight on the check-in day
raw = tdee + goalDelta              // goalDelta = rate/100 × W × 7716 / 7; maintain: §5.2 nudge
if new program, refresh_targets, < 28 days since expenditureStartDate, or the goal changed:
    target = raw                    // PUB: a new program is unsmoothed
else:
    cap = max(100, 0.05 × tdee)     // OURS
    target = prevTarget + clamp(raw − prevTarget, −cap, +cap)
target = max(target, floor)         // floor: 1,500 (M) / 1,200 (F and prefer_not_to_say); if it binds → SAFE-1 flag
```

- **No "none" floor in M1.** EVID G7 (research F) — safety.
- Targets change only at the weekly check-in, or when the user accepts `refresh_targets` or a new goal. Never silently.

### 5.4 Macros

**Body-fat category midpoints** (OURS; MacroFactor uses a visual picker):

| Category | Male midpoint | Female midpoint |
|---|---|---|
| Lean | 10% | 18% |
| Athletic | 15% | 23% |
| Average | 21% | 29% |
| Above average | 28% | 36% |
| High | 35% | 43% |

FFM = BW × (1 − midpoint), or uses `bodyFatPctMeasured` if present.

**Protein** = `max(tableValue × FFM, floorPerKg × BWref)`, rounded to 5 g:
- `floorPerKg` is 1.8 on a cut and 1.6 otherwise (EVID).
- `BWref` = BW, but capped at the BMI-25 weight when BMI > 30.

Table values are PUB (MacroFactor lifter table, g/kg FFM):

| Phase | Low | Moderate (**default**) | High | Extra |
|---|---|---|---|---|
| Cut | 2.0 | 2.5 | 3.0 | 3.5 |
| Maintain/gain | 1.75 | 2.35 | 2.75 | 3.1 |

With no category, protein = 2.0 g/kg BWref on a cut and 1.8 g/kg otherwise. The copy for High and Extra is about **preference and satiety**, never extra muscle (§10 #8).

**Fat and carbs:**
- **Fat floor** = `30 + 0.5 × (heightCm − 150)` g, or 30 g under 150 cm. PUB.
- **`balanced`:** split the non-protein kcal 50/50 between fat and carbs, then `fat = max(fat, floor)` and carbs = the remainder. **`lowCarb`:** carbs = min(30% of kcal, 200 g). PUB.
- **When kcal is very low**, priority is fat floor, then protein, then carbs. PUB.

---

## 6. Strength signal

### 6.1 Estimated 1RM

`e1RM_adj = loadKg × (1 + (reps + RIR) / 30)`:
- RIR defaults to 0 when missing.
- Use only working sets with `reps + RIR ≤ 12` and `loadKg > 0`.
- Take the **best** e1RM_adj per session.
- Set types (M5 T1, `lib/completedSets.ts`): a set with no `type` is working. **Warm-ups** never count (not volume, e1RM or PRs). **Drop sets** count for volume but not e1RM. **Failure** sets count for both and are RIR 0 whatever was typed. RIR stays optional on every set: progression tracking needs the change in e1RM, not its level, and a lifter's habitual RIR is stable enough for the trend to hold; marking the top set "to failure" is the one-tap way to make it exact.

This is the **only** e1RM function for physique and (from M5) training. It lives in `lib/physique/strength.ts`. `lib/liftTrend.ts` keeps its current behaviour until T2 migrates it.

### 6.2 Rules

| ID | Rule |
|---|---|
| **STR-1** "lifts are dropping" | The median of the last 3 exposures is ≤ −5% versus the median of the 3 exposures **before the phase started**, on **≥2 main lifts**. Requires ≥3 post-exclusion exposures per lift and the phase to be ≥21 days old. If there are fewer than 3 pre-phase exposures (training and cut started together), the status is `unclear`, with the copy "No pre-cut baseline for your lifts yet". EVID. |
| **STR-2** | Only 1 lift down ≥5%: lift-specific (technique, programming, fatigue). **Not** a nutrition verdict; it's a flag. |
| **STR-3** (suppressor) | Drops inside cut days 0–13, or in sessions with >10 sets per muscle **and** carbs <3 g/kg, are ignored. |
| **STR-OK** | ≥2 main lifts, all within ±3% or rising. This is a positive signal on a cut. With fewer than 2 main lifts the status is `unclear` (never "holding"). |

Excluded sessions:
- after a night under 5 h (manual: under 5.5 h), or 2 consecutive nights under 6 h (manual: under 6.5 h);
- deload weeks, detected as weekly working sets < 60% of the previous 4-week median;
- the first 2 sessions after the median working reps for that lift change by more than 3.

**Copy rule:** "lifts are dropping", never "you're losing muscle".

---

## 7. Sleep

Source: `research/C-sleep-recovery.md` §5–6, reconciled with research F §6.

### 7.1 Night data

- **Main sleep** is the longest asleep session ending between 03:00 and 14:00 local, after merging gaps of ≤15 min. Other sessions of 15 min to 3 h are naps.
- **One source per night**, in this priority: HealthKit > manual.
- **Excluded from baselines** (but kept): asleep under 2 h or over 14 h.
- **Manual thresholds sit +0.5 h above wearable ones**, because self-report overestimates sleep (Lauderdale 2008).

### 7.2 Sleep status

| Status | Wearable | Manual | Min data |
|---|---|---|---|
| `severe` | 14-night mean < 6.0 h | < 6.5 h | ≥10 of 14 nights |
| `short` | 14-night mean **or** weekday mean < 6.5 h | < 7.0 h | ≥10 of 14 nights |
| `acute` (session note only) | ≥2 consecutive nights < 6.0 h | < 6.5 h | those nights |
| `ok` | otherwise | | ≥10 of 14 nights |
| `unknown` | fewer than 10 of 14 nights logged | | |

- If the nights in the window are mixed, use the manual thresholds when ≥50% of them are manual.
- The goal is `sleepGoalH` (default 8 h), never learned from history.
- `debt7` = Σ max(0, goal − asleep) over the last 7 nights.

### 7.3 Sleep rules (these replace research F's SLEEP-1…3)

| ID | Preconditions | Trigger | Verdict | Action |
|---|---|---|---|---|
| **SLEEP-1** | phase = lose; ≥10/14 nights; ≥5 weeks of main-lift data, ≥2 exposures per lift in each block | sleep `short`/`severe` **and** a corroborating signal: ≥2 main lifts with median e1RM_adj in the last 2 weeks ≥2.5% below the median of the 3 weeks before (M3+: or `F_hrv`/`F_rhr`) | "Sleep is averaging 6h04m over 14 nights and squat and bench are down 3–4%. Don't cut calories further until sleep improves." | `sleep` (+45–60 min/night toward goal). **Blocks every more-aggressive recommendation for 14 days.** If a group-4 rule's recommendation is blocked, SLEEP-1 becomes primary. If LOSS-1/3 also fire, their less-aggressive `change_rate` still applies (it's a flag). |
| **SLEEP-1i** (flag only) | phase = lose; ≥10/14 nights | `short`/`severe`, no corroboration | "Sleep is averaging 6h20m. In studies, short sleep during a cut shifted more of the loss to lean tissue." | none |
| **SLEEP-2** | phase = lose; segment rate within ±0.15 %/wk for ≥14 days; `short`; ≥4 days after short nights and ≥4 after ≥7 h nights | intake on days after short nights ≥250 kcal above days after ≥7 h nights | "On days after short nights you eat about 300 kcal more." | `sleep` |
| **SLEEP-3** (session note) | — | `acute` before a session with a main lift | Shown on the workout screen only: "Two short nights: expect reps at a fixed load to be down. Keep the top set; drop a back-off set if RIR collapses." | none |
| **SLEEP-OK** (guard) | — | lifts dropping **and** sleep `ok` | none | Passes `sleepOk: true`, so neither the engine nor the assistant blames sleep. |

### 7.4 Recovery status (M3, once Apple Watch data flows)

- **HRV:** one (method, source) pair per baseline, analysed as ln(HRV). HealthKit's long-standing type is **SDNN**, which is never mixed with RMSSD. Night HRV is the median of ≥2 samples inside main sleep.
- **RHR:** the lowest 5-minute rolling mean of heart rate inside main sleep. If that isn't available, HealthKit `restingHeartRate`, with its own baseline.
- **Flags.** Compare the 7-day mean (≥4 valid days) with the previous 60 days (≥14 valid days):
  - `F_hrv`: z ≤ −0.75.
  - `F_rhr`: 7-day mean − baseline ≥ max(3 bpm, 0.75·sd).
  - `F_sleep`: §7.2 `short`.
  - Each flag must hold on ≥3 of the last 5 days.
- **Status:** `calibrating` (until 14 valid nights within 28 days), `green` (0 flags; the assistant is silent), `amber` (1, named), `red` (≥2). **No 0–100 number.**
- **Illness guard:** wrist temperature ≥0.5 °C or respiratory rate ≥1.5 br/min over baseline, together with `F_hrv`/`F_rhr`, gives "possible illness, not training" and suppresses diet and training changes.
- **Optional sleep score**, in the detail view only: Apple's 50/30/20 split (research C §6.3).

---

### 7.5 Sleep score, usual wake, consistency, trends (S8, `lib/physique/sleepScore.ts`)

Display-only reads for the Sleep tab; none of them feeds the judge.

| Read | Rule | Gate | Tag |
|---|---|---|---|
| Need for a night | `tonightNeedH(goal, debt7(nights ending the day before))`: goal + ⅓ of the 7-night debt, at most +1 h, clamped 7–9.5 h | none | OURS |
| Score | `100 × min(1, asleep ÷ need)` minus up to 15 for timing (0 off at ≤ 15 min from the usual wake, all 15 at ≥ 90 min) and up to 10 for efficiency (0 off at ≥ 90%, all 10 at ≤ 65%); clamped 0–100. Words: Excellent ≥ 92, Good ≥ 85, Fair ≥ 70, Poor below | a valid night (2–14 h); timing needs a usual wake from the nights before; efficiency needs a time in bed or sleep period | Good/Fair bands PUB (WHOOP Sleep Performance 85/70); rest OURS |
| Reason | the lowest-scoring part that falls short (≥ 20 min under the need, > 30 min off the usual wake, efficiency < 85%), else what went right | with the score | OURS |
| Usual wake | median wake time over the last 14 nights on an 18:00 origin | ≥ 3 nights with a wake time | PUB (WHOOP's planner waits for 3 nights) |
| Tonight | wake = a one-off for tomorrow, else the usual wake, else an old fixed setting, else 07:00; lights out = wake − need − 20 min; wind-down = lights out − 30 min | none | OURS |
| Consistency | sample SD of wake times over 7 mornings: Excellent ≤ 15 min, Good ≤ 30, Fair ≤ 60 | ≥ 4 mornings | Good anchored to the one-hour social-jetlag mark (EVID, Wittmann 2006); rest OURS |
| Trends | mean of the last 7 nights against the 30 before them for time asleep, bedtime, wake time, efficiency, HRV and resting HR; steady under 10 min, 10 min, 1 pt, 5% and 1 bpm | ≥ 4 recent and ≥ 10 baseline nights per measure | OURS |

Stages are never part of the score (research C §4.2). Unaggregated Health Auto Export sleep (one row per stage segment) is folded into nights in `lib/health/hae.ts` the same way `nightsFromHealthKitSamples` folds HealthKit samples (sessions across ≤ 15 min gaps, main sleep ending 03:00–14:00) and keeps the segments for the stage chart (`SleepNight.segments`).

## 8. The judge (Layer 2)

### 8.1 Output

```ts
type PhysiqueAnalysis = {
  asOf: string;
  phase: "lose" | "maintain" | "gain" | "none";
  data: { weighIns14: number; loggedShare14: number; nightsLogged14: number;
          expenditureState: "holding" | "calibrating" | "settling" | "stable"; unresolvedPartialDays: string[] };
  weight: { trendKg: number | null; ratePctPerWeek: number | null; rateWindowDays: number | null; margin: number | null };
  expenditure: { kcal: number; state: string; plusMinus: 400 | 300 | null };
  targets: { kcal: number; proteinG: number; fatG: number; carbsG: number } | null;
  adherence: { deltaKcal: number | null; proteinGPerKg: number | null };
  strength: { status: "dropping" | "holding" | "rising" | "one-lift" | "unclear"; lifts: Array<{ name: string; changePct: number }> };
  sleep: { mean14h: number | null; nightsLogged14: number; status: "severe" | "short" | "ok" | "unknown"; acute: boolean; source: "manual" | "wearable" | "mixed" | null; debt7h: number | null };
  verdict: Verdict;                 // exactly one primary verdict, always (§8.3)
  flags: Verdict[];                 // max 3 other firing rules, in priority order
  recommendation: Recommendation | null;
  status: { state: "good" | "watch" | "attention" | "unknown"; label: string };   // lib/signalStatus.ts contract
};
type Verdict = { id: RuleId; title: string; detail: string; windowDays?: number; n?: number; evidenceIds: string[]; confidence: "high" | "medium" | "low" };
type Recommendation =
  | { kind: "change_rate"; fromPctPerWeek: number; toPctPerWeek: number; kcalDeltaAtCurrentBW: number }   // the true delta, not clamped
  | { kind: "refresh_targets"; fromKcal: number; toKcal: number }
  | { kind: "eat_to_target"; deltaKcal: number }
  | { kind: "protein"; toG: number }
  | { kind: "sleep"; targetHours: number }
  | { kind: "diet_break"; weeks: 1 | 2 }
  | { kind: "maintenance_first"; weeks: number }
  | { kind: "log_more"; what: "weight" | "food" | "sleep" | "waist"; needed: number }
  | { kind: "confirm_days"; dates: string[] }
  | { kind: "pause_and_seek_help" };
```

`RuleId` covers every id in §8.2 and §7.3. `M-1` is not a rule: it is a copy policy (§10 #1).

### 8.2 Rules

Research F's **"Judge rules table"** defines G-NOISE-1…4, LOSS-1…4, LOSS-6, GAIN-1…4, STR-1…3, PRO-1/2, FAT-1, DB-1/2 and SAFE-1…5. Implement them as written there, **with every change below**. The sleep rules are §7.3. LOSS-5 and G-EXP-1's "base targets on rate rules" action are **dropped**. LOSS-5 is circular, because expenditure comes from the same weight trend. G-EXP-1 becomes display-only (§4.3).

**A. Recommendation choice for rate rules** (this replaces "kcal steps").

Every rate rule picks exactly one recommendation:
1. **Goal out of range** (|goal| above the rule's in-range value): `change_rate` to the value in the table below.
2. **Goal in range, user adherent (ADH on target), expenditure `stable`, no target change bigger than the cap inside the window:** `refresh_targets` (raw uncapped target now).
3. **Otherwise** (expenditure still settling, or targets just changed): no recommendation. The verdict says "Your maintenance estimate is still catching up".

| Rule | In-range value | `change_rate` target |
|---|---|---|
| LOSS-1, LOSS-3 | 0.75 | −min(\|goal\|, 0.6) |
| LOSS-4, LOSS-2 (near goal) | 0.6 | −min(\|goal\|, 0.5) |
| LOSS-6 | n/a (goal-relative, see B) | `refresh_targets` only; never deepens the goal automatically |
| GAIN-1 | the status ceiling (§5.2) | the status default |
| GAIN-2 | the status floor | goal + 0.1 (≤ the status default) |

**Direction checks.** A recommendation that fails one of these is dropped.
- LOSS-1/2/3/4 → |to| < |from|.
- GAIN-1 → to < from.
- GAIN-2 → to > from.
- `refresh_targets` for LOSS-1/2/3 → toKcal > fromKcal.
- `refresh_targets` for GAIN-1 → toKcal < fromKcal.
- `refresh_targets` for LOSS-6 → toKcal < fromKcal.
- `refresh_targets` for GAIN-2 → toKcal > fromKcal.

Every `change_rate` target also passes §5.2 validation, and `kcalDeltaAtCurrentBW` shows the true size of the change.

**B. Goal-relative thresholds** (so on-plan users don't get flagged):
- **LOSS-6** "weight loss stalled": rate confidently above (less negative than) `0.6 × goal` **and** point estimate above `0.5 × goal`. With the default −0.6, that means confidently slower than −0.36 and a point estimate slower than −0.3.
- **GAIN-2:** rate confidently below `0.6 × goal` and point estimate below `0.5 × goal`, with lifts flat (all within ±2%).
- **GAIN-1:** must fire on **2 consecutive weekly evaluations** (sim: on-plan false positives fall to ≤2%, while a true +0.75 still fires by week 6 in 82% of runs).

**C. Other changes:**
- **LOSS-2** (fast, lifts holding) needs STR-OK. If strength is `unclear` (a non-lifter, or no baseline), the variant **LOSS-2u** applies: "Losing 1.2 %/wk; no lift data to judge retention." Same action as LOSS-2.
- **"Near goal / advanced"** (LOSS-4) uses §5.1 "near goal" or `trainingStatusAtCreation = advanced`. There is no "lean" flag; it can't be measured.
- **RECOMP-1** needs waist data: a waist drop of ≤ −2.0 cm (mean of the last 2 entries vs the first 3 in the window; research F §10's noise band), a flat rate (|rate| < 0.25 over 28 d), and ≥2 main lifts up ≥2.5%.
- **RECOMP-WAIST:** fewer than 4 waist entries, a LOSS-6 or GAIN-2 condition met, and ≥2 lifts up ≥2.5% → suppress LOSS-6 or GAIN-2 and emit a flag: "Lifts are up while the scale is flat. Log your waist weekly to tell recomposition from a stall" (`log_more: waist`).
- **DB-1** (diet break offer): on a cut ≥6 weeks old, if ADH is over target on ≥3 days/week for 2 weeks, **DB-1 is primary and ADH-1 is a flag.** A struggling dieter gets the diet-break offer.
- **DB-2** (maintenance before a bulk) is shown in goal setup (U3), not as a verdict.
- **G-EXP-2** (logging gap likely) fires only when expenditure is `holding`, or logged intake falls ≥15% with no matching trend change. Group 2.

**D. New rules:**

| ID | Group | Trigger | Verdict | Action |
|---|---|---|---|---|
| SAFE-0 | 1 | age < 18 | "Calorie targets for a deficit aren't available under 18." | targets = maintenance; no deficit coaching |
| NO-GOAL | 2 | no active goal | "Set a goal to get a verdict." | link to `/body/goal` |
| DATA-RATE | 2 | rate gate not met (§2.2) | "Calibrating · N more weigh-ins for a first read." N = needed − have | `log_more: weight` |
| DATA-EXP | 2 | expenditure `calibrating` | "Calibrating · day N of about 21." | none |
| DATA-HOLD | 2 | expenditure `holding` | "Holding · log K more days this week to resume." | `log_more: food` |
| DATA-PARTIAL | 2 | unresolved partial suggestions in the adherence window | "Tue and Thu look incomplete. Confirm them first." | `confirm_days` |
| ADH-1 | 3 | adherence off target (§3), resolved data, ≥80% logged | "You're averaging 320 kcal under target over 14 days. Eat to target before we change your goal." | `eat_to_target` |
| ON-TRACK | 4 (last-but-one) | no group-1–3 rule, and the rate is not confidently outside goal ± 0.25 %/wk (maintain: trend within ±0.68 kg) | "On track: losing 0.6 %/wk over 28 days, lifts holding." The lift clause is only included with ≥2 main lifts. | none |
| NO-CHANGE | 4 (last) | none of the above | "Nothing to change this week." | none |

### 8.3 Choosing the primary verdict

1. **Suppress.** Remove every rule suppressed by: G-NOISE-1…4, STR-3, RECOMP-1 (suppresses LOSS-6 and GAIN-2), RECOMP-WAIST, the cooldown (§2.3), and SLEEP-OK (removes sleep blame).
2. **Pick the primary** from the first group with a match:
   1. **Safety:** SAFE-0…5. G8 suppresses every more-aggressive recommendation.
   2. **Data:** NO-GOAL, DATA-PARTIAL, DATA-HOLD, DATA-RATE, DATA-EXP, G-EXP-2. DATA-EXP is primary only if no group-3 or group-4 rule can be evaluated; LOSS-3, for example, needs only the rate gate.
   3. **Adherence:** DB-1 (when §8.2C applies), then ADH-1.
   4. **Outcome:** LOSS-3 > LOSS-1 > LOSS-4 > GAIN-1 > SLEEP-1 > LOSS-6 > GAIN-2 > LOSS-2 / LOSS-2u > RECOMP-1 > GAIN-3 > ON-TRACK > NO-CHANGE.
      - SLEEP-1 is promoted above any rule whose recommendation it blocks.
3. **Flags:** up to 3 other firing rules, in this order: the remaining group 1–4 rules, then SLEEP-1i > SLEEP-2 > PRO-1/2 > STR-2 > FAT-1 > GAIN-4 (GAIN-4 only strengthens GAIN-1's evidence).
4. **Status** = the most severe of the primary and the flags:
   - `attention`: SAFE-*, LOSS-3.
   - `watch`: LOSS-1/2/2u/4/6, GAIN-1/2, ADH-1, DB-1, SLEEP-1, DATA-PARTIAL, DATA-HOLD.
   - `good`: ON-TRACK, NO-CHANGE, RECOMP-1, GAIN-3.
   - `unknown`: NO-GOAL, DATA-RATE, DATA-EXP.
   - Flag-only rules (SLEEP-1i, PRO, FAT, STR-2) cap at `watch`.
5. **SAFE-4 counts LOSS-3** whether it was primary or a flag.
6. **There is always exactly one primary** (NO-CHANGE is the floor).

### 8.4 Fixtures and the scenario generator

`lib/physique/fixtures.ts` exports `makeScenario(spec)`, seeded and deterministic. `spec` includes:
- `bodyweightKg` and `trueTdeeKcal`. Weight moves by (intake − trueTDEE) / 7716 per day, plus noise and the water step;
- `preDays` (default 21) of maintenance data before the phase;
- `goal: {rate, startDay}`;
- **phase-start water step:** −1.2 kg over 5 days on a cut, +0.8 kg on a bulk;
- weight noise as AR(1) with φ = 0.5 and **innovation SD 0.433** (marginal SD 0.5 kg);
- `intake: "toTarget" | {meanKcal}`. `toTarget` is closed loop: the engine's accepted weekly target + N(0, 350). This needs program history, so the generator runs the weekly check-in itself;
- `weighInDays`;
- `sleep: {meanH, sdH, source}`;
- `lifts: [{name, startE1rm, profile: "linear" | "step", changePct, atDay, perWeek, cv: 0.03}]`;
- `events`;
- `waist?`.

Each rule ID has three fixtures in `lib/physique/__tests__/judge.test.ts`:
- (a) one where it fires;
- (b) a near miss, just under the threshold or the minimum data, where it must not fire;
- (c) one where a higher rule suppresses or outranks it.

**Probabilistic assertions** run 200 seeds and assert a firing-rate band (e.g. "fires in ≥80% of seeds"). Single-seed tests use seeds chosen once and frozen.

---

## 9. Weekly check-in

Copied from MacroFactor's module order (research A §B8) and delivered through the assistant.

1. `buildCheckInPlan(analysis, logs, now)` returns these modules, in order:
   1. **Partial days:** suspected partial days, confirm or dismiss.
   2. **Weigh-in prompt:** if there's no weigh-in in the last 3 days plus today.
   3. **Unlogged days:** each one is "fasted (0 kcal)" or "skip".
   4. **Logging break:** an explanation, if holding.
   5. **Water event:** "skip this week's update?"
   6. **Waist:** optional, weekly, using the §1.1 protocol.
   7. **Program update:** old → new targets (§5.3).
   8. **Judge verdict and recommendation**, if any.
2. The UI renders the plan as one screen, `/review` (G3): three reads for last week, the plan's questions, then one decision built from the program update, the judge's rate or refresh recommendation and a due deload. The assistant can also walk the user through it.
3. Answers become `DayFlags` and `WaistEntry`, and the engine recomputes.
4. **Accept** or **keep current**. Declining keeps the targets.
5. **Fast check-in** is one tap: accept the program update, skip the questions.
6. The check-in weekday comes from the profile. The home and Body cards show "Check-in ready" from that day until it's done.

---

## 10. Must-not-claim list

These apply to the verdict copy and the assistant prompt. Implement them as an assistant system-prompt block, and as a unit test that scans all verdict copy for banned phrases.

**Banned phrases** (case-insensitive; "REM" matches only as a whole word):
- "losing muscle", "muscle loss", "fat loss has stalled", "the extra is mostly fat"
- "metabolic damage", "starvation mode"
- "deep sleep", "REM"
- "testosterone"
- "reverse diet"
- "absorb"
- "cheat", "earned", "bad food"
- "great job", "crushing it"
- "!"

**The rules:**
1. No kilograms of muscle gained or lost: not from the scale, BIA, the Navy method or photos. (This is the old M-1.) Body-fat % is shown only with an error caveat. That is checked in the prompt, not by the linter.
2. Say "lifts are dropping", never "you're losing muscle".
3. No rate verdict below the per-rule minimum data in §2.2.
4. Never attribute a single-day or single-week jump to fat.
5. No "metabolic damage" or "starvation mode".
6. Don't state maintenance more precisely than §4.3 allows.
7. Diet breaks are framed as adherence and hunger tools only.
8. No protein claims above ~2.2 g/kg (surplus) or ~2.7 g/kg (deficit); no "can only absorb X g per meal".
9. Don't blame carbs for strength loss unless volume is above 10 sets per muscle and carbs are under 3 g/kg.
10. No individual hormone predictions.
11. No sleep-stage judgements from wearables.
12. Never quantify menstrual water retention in kg.
13. Lean-bulk bands are guidance. Say "in studies, faster gains mostly add fat", never "your extra is fat".
14. No RED-S numeric thresholds for men presented as established.
15. Never diagnose an eating disorder or RED-S; no moralising food language.
16. Recomposition is neither impossible nor guaranteed.
17. Don't recommend reverse dieting as evidence-based.

---

## 11. Training engine (M5)

The training-side spec is `research/B-training-apps.md` §5 and §8. It is normative for M5, with these mappings:

- `strengthRetention(...) === "losing"` means STR-1 `dropping` (§6.2). `crossFlags` is replaced by §7–8 of this file. There is one cross-signal implementation, and it lives here.
- Phase `cut` = `lose`; `lean_bulk` = `gain`; `maintain` = `maintain`.
- `setE1RM` / `sessionE1RM` = §6.1's `e1RM_adj`, with the same exclusions, from `lib/physique/strength.ts`.
