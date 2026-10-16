# 02 — Engine spec: the physique judge

This is the normative spec for everything the app *decides*: trend weight, rate of change, expenditure, targets, and the verdicts ("is it working?"). The assistant only explains what this engine outputs.

Provenance. Every constant is tagged:
- **PUB**: published by the app we copied (MacroFactor, RP, Hevy). See `research/A-macrofactor-nutrition.md` and `research/B-training-apps.md`.
- **EVID**: from the scientific literature. See `research/F-evidence-rules.md` for citations.
- **CAL**: our value, calibrated to reproduce a published behaviour.
- **OURS**: our assumption; tune it during dogfooding.

If this file and a research report disagree, **this file wins**. The research files are the reasoning behind it.

---

## 0. Principles

1. **Pure functions.** `lib/physique/*` takes data and `now` as arguments. No storage, no `window`, no `Date.now()`.
2. **Recompute from history.** Nothing derived is stored as truth. Editing a past entry changes every downstream number. This is how MacroFactor behaves.
3. **Two layers, never mixed.**
   - **Layer 1 – Coach** (copied from MacroFactor): expenditure and weekly targets. Targets come from expenditure and the goal rate. It is *adherence-neutral*: each week stands alone and there is no catch-up.
   - **Layer 2 – Judge** (our differentiator): it reads outcomes (rate, lifts, sleep, protein, adherence) and recommends changes to the **goal settings** (rate, phase, protein level, diet break) or to **behaviour** (sleep, logging, eating to target). **The judge never adds an ad-hoc kcal tweak on top of the coach's target.** If a verdict says "slow the cut", it does that by lowering the goal rate. The coach then turns the new rate into calories. This keeps the two layers from fighting.
4. **Gate before judging.** Every verdict has a minimum-data requirement. Below it, the output is an honest "calibrating" or "not enough data" state, never a guess.
5. **Silence beats false positives.** When two rules conflict or the data is borderline, say nothing.
6. **Never claim what can't be measured.** See §10.

---

## 1. Inputs and conventions

### 1.1 Entities (canonical units)

Full types live in `lib/physique/types.ts` (ticket P1). Summary:

| Entity | Key fields |
|---|---|
| `WeighIn` | `id`, `date` (local `YYYY-MM-DD`), `loggedAt`, `kg`, `source` (`manual` \| `healthkit` \| `import`) |
| `FoodEntry` | `id`, `date`, `loggedAt`, `label`, `kcal`, `proteinG`, `carbsG`, `fatG`, `method` (`quick` \| `saved` \| `ai_text` \| `ai_photo` \| `barcode` \| `search`), `confidence?`, `savedFoodId?` |
| `DayFlags` | `date`, `status?` (`partial` \| `fasting`, set by the user), `kcalOverride?` (Edit Day total), `events?` (`creatine_start` \| `carb_switch` \| `illness` \| `travel` \| `period`) |
| `SleepNight` | `id`, `date` (**the local date of waking**), `asleepMin`, `inBedMin?`, `quality?` (1–5, manual), `source`; optional `hrvMs`, `restingHr` (from HealthKit) |
| `WaistEntry` | `id`, `date`, `cm` |
| `PhysiqueGoal` | see §5.1 |
| `PhysiqueProfile` | `sex`, `birthYear`, `heightCm`, `bodyFatCategory?`, `generalActivity` (`low` \| `moderate` \| `high`), `manualInitialTdee?`, `expenditureStartDate`, `checkInWeekday`, `proteinLevel`, `dietType`, `calorieFloor` |

Workouts come from the existing `StoredWorkout` history (`lib/trainingAnalysis.ts`).

### 1.2 Conventions

- **Local date.** Every record carries the user's local `YYYY-MM-DD`. Sleep belongs to the **wake date**.
- **Windows are whole weeks** (7, 14, 21, 28 or 42 days), so the weekend weight cycle cancels out. EVID (Turicchi 2020).
- **`BW`** is the mean raw weigh-in over the analysis window.
- **Day status.** Each day's intake status is one of:
  - `fasting`: the user flagged it. Counts as 0 kcal.
  - `unlogged`: no entries and no override. Skipped.
  - `partial`: the user flagged it. Skipped.
  - `complete`: everything else.

  The engine *suggests* `partial` when `0 < kcal < 0.5 × median(kcal of complete days in the last 21)`. It never applies the flag itself; the user or the check-in confirms it. OURS (MacroFactor publishes no threshold).
- **Day kcal.** `kcalOverride` beats the sum of food entries.
- **Main lifts.** The user's 2–4 most frequently logged compound lifts with at least one exposure per week over the last 6 weeks.

---

## 2. Weight

### 2.1 Trend weight (for display and expenditure)

- Fill missing days by linear interpolation between real weigh-ins. Never extrapolate past the last weigh-in. PUB (MacroFactor KB#21).
- Smooth with an exponential moving average: `trend[d] = trend[d−1] + 0.10 × (w[d] − trend[d−1])`, seeded with the first weigh-in. α = 0.10 is CAL: it reproduces MacroFactor's published impulse test (RMS error ≈ 6 kcal; research A §G.6).
- If several weigh-ins share a date, use the earliest of the day.
- **Sanity check.** If a new weigh-in is more than 5% from the trend, ask "Is that right?" before saving. OURS.

### 2.2 Rate of change (for verdicts and the rate display)

**Do not take the slope of the EMA for verdicts.** It lags about 9 days. EVID (research F §5).

- `rate` = ordinary least-squares slope of **raw** weigh-ins against day number over the window, × 7 ÷ `BW` × 100, giving %BW per week. Positive means gaining.
- `SE_adj` = OLS slope standard error × 1.6. The factor allows for day-to-day autocorrelation of water weight. EVID/derived.
- **"Confidently above X"** means `(rate − X) / SE_adj > 1.645`. "Confidently below" is the mirror image.
- If the SE can't be computed (fewer than 4 points), use the fallback margins at 85 kg, scaled by 85/BW:

  | Window | Margin (%/wk) |
  |---|---|
  | 14 d | ±0.66 |
  | 21 d | ±0.38 |
  | 28 d | ±0.25 |
  | 42 d | ±0.14 |

- **The rate display** uses the 21-day window once it has at least 8 weigh-ins, otherwise the 14-day window. The engine never shows a rate on fewer than 14 days or fewer than 5 weigh-ins. Below that it shows "Early read". EVID.

### 2.3 Phase-change mask

For 7 days after the start of a cut, a bulk or a diet break, or a return to a deficit, the engine issues **no rate verdicts**. The scale is dominated by glycogen and water. EVID (Hall 2008; Kreitzman 1992).

### 2.4 Water events

Event flags (`creatine_start`, `carb_switch`, `period`, `illness`, `travel`) inside the window do two things:
- They widen the fallback margin by 50% for 14 days.
- The weekly check-in suggests skipping that week's update. PUB (MacroFactor KB#26).

`creatine_start` excludes the 7 days after a loading phase, or 28 days after starting 3–5 g/day, from bulk-rate rules. EVID.

---

## 3. Intake

- `intakeMean(window)` = mean kcal over `complete` and `fasting` days.
- `loggedShare(window)` = (complete + fasting days) ÷ window days.
- **Adherence**: `intakeMean(14) − mean target(14)` in kcal/day. It counts as "on target" within ±150 kcal. OURS (MacroFactor uses a ±200 display band).
- **Protein and fat** are 7-day and 14-day means over complete days, in g/kg BW (and g/kg FFM when FFM is known).

---

## 4. Expenditure (Layer 1; copied from MacroFactor)

### 4.1 Daily pipeline

Port this as written. It is research A §G.3, condensed.

```
days = dateRange(profile.expenditureStartDate, today)
tdee[d0] = initialTdee(profile, goal)                     // §4.2
paused = false
for each day i ≥ 1:
  last7 = days[i-6..i]
  nutritionOK = count(status ∈ {complete, fasting} in last7) ≥ 4        // PUB
  weightOK    = count(real weigh-ins in last7) ≥ 1                        // PUB
  if paused: paused = !(last 3 days all complete/fasting && weightOK)     // PUB: resume after 3 days
  else:      paused = !(nutritionOK && weightOK)
  if i < 7 or paused:
     tdee[d] = tdee[d-1]; state = "holding"                               // PUB: hold last good value
  else:
     Ne = min(21, i+1); Le = min(20, i)                                   // PUB windows
     intakeMean = mean kcal of complete/fasting days in last Ne
     rateKgPerDay = (trend[d] − trend[d − Le]) / Le
     obs = intakeMean − 7716 × rateKgPerDay                              // PUB energy density, same for gain/loss
     k = i < 28 ? 0.20 : 0.10                                             // OURS warm-up / CAL steady
     tdee[d] = tdee[d-1] + k × (obs − tdee[d-1]); state = "updating"
  if goal rate changed within the last 14 days (and user confirmed the phase start):
     tdee[d] += pendingOffset / 14       // pendingOffset = tdee_at_change × 4 × (r_new − r_old), rates as fractions/wk. PUB factor
```

### 4.2 Initial estimate

Use MacroFactor's published equations (research A §A2, §G.4):

- **Height and weight:** `BMR = 129.6·W^0.55 + 0.011·H² − a·age − 213.8·female`, where `a` = 1.96 per year up to 60, then 4.9 per year after.
- **With FFM known:** `BMR = 50.2·FFM^0.7 + 40.5·(FFM^0.7·FM^0.066) − a·age`, where `a` = 1.1 per year up to 60, then 2.75.
- **Athlete** (at least 7 hours/week of hard training): `BMR = 40.4·FFM^0.932`.
- **Adjustments:** ×0.95 in a deficit; ×0.97 if more than 10% below peak weight.
- **Activity factor** = general activity (low 1.2 / moderate 1.4 / high 1.6) + an exercise add-on by sessions per week (0 → +0; 1–3 → +0.1; 4–6 → +0.2; 7+ → +0.3). **Sessions per week come from the workout log** (mean over the last 4 weeks), not from a question.
- **Goal correction:** ×(1 + 4 × goal rate as a fraction per week).
- `manualInitialTdee` overrides all of this.

Golden tests (must pass exactly, research A §G.6):

| Case | Expected |
|---|---|
| BMR, male, 90 kg, 180 cm, age 30 | 1,837 |
| Same with FFM 75 / FM 15 | 1,993 |
| Athlete equation, FFM 75 | 2,259 |
| TDEE₀, moderate + 4–6 sessions/wk | 2,940 |
| Cutting at 0.5 %/wk (×0.95 BMR, ×0.98 goal correction) | 2,737 |
| Cut target at 90 kg | 2,241 |
| Maintenance: target 75 kg, trend 76.0, TDEE 2,500 | 2,376 |
| Fat floor: 180 cm / 150 cm / 145 cm | 45 g / 30 g / 30 g |
| 21-day mean: 20 days × 3,000 + 1 day × 1,500 | 2,929 |

### 4.3 Expenditure maturity (what the UI shows)

| State | Condition | Copy |
|---|---|---|
| `calibrating` | days since start < 21 | "Calibrating · day 9 of about 21" |
| `holding` | the pipeline is paused | "Holding · log 2 more days this week to resume" |
| `settling` | 21–27 days | number shown with "±400 kcal" |
| `stable` | 28 days or more | number shown; "±300 kcal" in the detail view only |

EVID (Hall & Chow 2011): don't state maintenance more precisely than ±300 kcal before 28 days.

Behavioural targets for the implementation (tests in P3):
- Mean absolute daily change after day 30 on noisy synthetic data is ≤ 8 kcal.
- The impulse test reproduces research A §G.6 within 15 kcal at each point.

---

## 5. Goals and targets (Layer 1)

### 5.1 Goal

```ts
type PhysiqueGoal = {
  id: string; createdAt: string;
  type: "lose" | "maintain" | "gain";        // derived from target vs current trend; recomp = maintain
  startDate: string; startTrendKg: number;
  targetKg: number;
  ratePctPerWeek: number;                     // signed: −0.6 = lose 0.6 %BW/wk
  lean: boolean;                              // "lean" = clamp to the evidence bands below (default true)
  completeOn: "trend";                        // PUB option; we only use trend (honest)
  phaseStartConfirmedAt?: string;             // starts the §2.3 mask and the predictive adjustment
};
```

### 5.2 Rate bands

The goal-setup slider shows these bands. Out-of-band rates need an explicit confirmation, and `SAFE-*` rates are refused.

**Cut (%BW/wk)** — PUB (MacroFactor) and EVID (Helms 2014; Garthe 2011; Mero 2010):

| Label | Rate |
|---|---|
| Conservative | 0.25 |
| Moderate (**default 0.6**) | 0.5–0.75 |
| Upper limit | 1.0 |
| Refused | above 1.5, or above 1.0 kg/wk |

When the user is near goal or flagged as lean/advanced, the green range tops out at 0.7.

**Lean gain (%BW/wk) by training status** — PUB defaults, EVID ceilings:

| Status | Default (MacroFactor "happy medium") | Green range | "Too fast" ceiling |
|---|---|---|---|
| Novice | 0.5 | 0.25–0.5 | 0.5 |
| Intermediate (**default**) | 0.325 | 0.15–0.35 | 0.35 |
| Advanced | 0.15 | 0.1–0.25 | 0.25 |

**Training status** comes from data when possible: the median main-lift e1RM slope over the last 8 weeks is ≥2 %/wk for novice, about 1 %/wk for intermediate, below 0.5 %/wk for advanced (PUB, MacroFactor's definition). Otherwise it falls back to onboarding `yearsTrainingBand` (new → novice; 1–2 → novice; 3–5 → intermediate; 5+ → advanced).

**Maintain:** hold trend weight within ±0.68 kg of the target. Outside that band, apply 0.15 %/wk toward the target. PUB.

### 5.3 Weekly target

```
raw = tdee + goalDelta                     // goalDelta = rate × W × 7716 / 7 (signed); maintain per §5.2
if program is new, or < 4 weeks since start, or the goal changed: target = raw     // PUB: new program = unsmoothed
else: target = prevTarget + clamp(raw − prevTarget, −cap, +cap), cap = max(100, 0.05 × tdee)   // OURS
target = max(target, floor)                // floor: 1,500 male / 1,200 female / user "none" with warning (EVID G7)
```

Targets update only at the weekly check-in (§9), never silently.

### 5.4 Macros

- **Protein first**, scaled to FFM. FFM = BW × (1 − body-fat midpoint of the user's category). PUB lifter table, in g/kg FFM:

  | Phase | Low | Moderate (**default**) | High | Extra |
  |---|---|---|---|---|
  | Cut | 2.0 | 2.5 | 3.0 | 3.5 |
  | Maintain/gain | 1.75 | 2.35 | 2.75 | 3.1 |

  With no body-fat category, use 2.2 g/kg BW on a cut and 1.8 g/kg BW otherwise. EVID.
- **Fat floor** = `30 + 0.5 × (heightCm − 150)` g, or 30 g under 150 cm. PUB.
- **Diet type** `balanced` (default): split the non-protein kcal 50/50 between fat and carbs, then `fat = max(fat, floor)`. `lowCarb`: carbs = min(30% of kcal, 200 g). PUB.
- **When kcal is very low**, priority is fat floor, then protein, then carbs. PUB.

---

## 6. Strength signal

### 6.1 Estimated 1RM

`e1RM_adj = load × (1 + (reps + RIR) / 30)`. RIR defaults to 0 when missing. Use only sets with `reps + RIR ≤ 12` and only working sets (not warm-ups). Take the **best** e1RM_adj per session (not the heaviest set).

This deliberately does **not** change `lib/liftTrend.ts`, which keeps its current behaviour for the existing Progress signal. The physique engine gets its own function in `lib/physique/strength.ts`. Unifying the two is ticket T2.

### 6.2 Rules

| ID | Rule |
|---|---|
| STR-1 | "Lifts are dropping": the median of the last 3 exposures is ≤ −5% versus the median of the 3 exposures before the phase started, on **≥2 main lifts**. Requires ≥3 post-exclusion exposures per lift and the phase to be ≥3 weeks old. EVID. |
| STR-2 | Only one lift down ≥5%: lift-specific (technique, programming, fatigue), **not a nutrition verdict**. |
| STR-3 | Drops in cut days 0–13, or in sessions with >10 sets per muscle and carbs <3 g/kg, are suppressed. |
| STR-OK | "Lifts holding": every main lift is within ±3%, or rising. This is a positive signal on a cut. |

Excluded sessions:
- after a night under 5 h, or after 2 consecutive nights under 6 h;
- in deload weeks;
- the first 2 sessions after the rep range changes by more than 3 reps.

**Copy rule:** say "lifts are dropping", never "you're losing muscle".

---

## 7. Sleep

Source: `research/C-sleep-recovery.md` §5–6, reconciled with research F §6.

### 7.1 Night data

- A night belongs to the **local wake date**.
- **Main sleep** is the longest asleep session ending between 03:00 and 14:00 local, after merging gaps of ≤15 min. Other sessions of 15 min to 3 h are naps. PUB (Bevel) / OURS.
- **One source per night**, in this priority: HealthKit (Apple Watch) > manual. A manual entry for a night that HealthKit also covers is kept but not used.
- **Reject from baselines** (but keep stored): asleep under 2 h or over 14 h.
- **Manual entry carries a bias.** Self-report overestimates sleep (Lauderdale 2008), so manual thresholds sit **0.5 h higher** than wearable ones.

### 7.2 Sleep status

| Status | Wearable | Manual | Min data |
|---|---|---|---|
| `short` | 14-night mean **or** weekday mean < 6.5 h | < 7.0 h | ≥10 of 14 nights |
| `severe` | 14-night mean < 6.0 h | < 6.5 h | ≥10 of 14 nights |
| `acute` | ≥2 consecutive nights < 6.0 h | < 6.5 h | those nights |
| `ok` | otherwise | otherwise | ≥10 of 14 nights |
| `unknown` | fewer than 10 of 14 nights logged | | |

The sleep goal is user-set (default 8 h, clamped to 7–9 h) and never learned from history. `debt7` = Σ max(0, goal − asleep) over the last 7 nights, shown as "4 h 10 m short over 7 nights".

### 7.3 Sleep rules (these replace research F's SLEEP-1…3)

| ID | Preconditions | Trigger | Verdict | Action |
|---|---|---|---|---|
| **SLEEP-1** (fix sleep before cutting) | phase = lose; ≥10/14 nights; ≥3 weeks of weight and lift data | `short` **and** a corroborating signal: ≥2 main lifts' e1RM_adj down ≥2.5% (last 2 weeks vs the 3 before), or recovery flag `F_hrv`/`F_rhr` (M3+) | "You're losing on target, but sleep is averaging 6h04m over 14 nights and squat and bench are down 3–4%. Fix sleep before cutting calories further." | `sleep` (+45–60 min/night toward goal). **Blocks any rate-increase (deeper deficit) recommendation for 14 days.** If LOSS-1/3 also fire, prefer slowing the rate. |
| **SLEEP-1i** (info) | phase = lose; ≥10/14 nights | `short` with no corroboration | "Sleep averaging 6h20m. In studies, short sleep during a cut shifted more of the loss to lean tissue." | none (flag only, never primary) |
| **SLEEP-2** (intake drift) | phase = lose; trend flat ≥2 weeks; `short`; ≥4 days after short nights and ≥4 after ≥7 h nights | intake on days after <6 h nights is ≥250 kcal above days after ≥7 h nights | "On days after short nights you eat about 300 kcal more." | `sleep` |
| **SLEEP-3** (session note) | — | `acute` before a heavy compound day | shown only on the workout screen: "Two short nights: expect reps at a fixed load to be down. Keep the top set; drop a back-off set if RIR collapses." | none |
| **SLEEP-OK** (guard) | — | lifts dropping **and** sleep `ok` | none | Passes `sleepOk: true` to the other rules, so neither the engine nor the assistant blames sleep. |

Sessions after a night under 5 h, or after 2 nights under 6 h, are excluded from STR-1 (§6.2).

### 7.4 Recovery status (milestone M3, once Apple Watch data flows)

- **HRV:** use a single (method, source) pair per baseline, analysed as ln(HRV). HealthKit's long-standing type is **SDNN**, which can never be mixed with RMSSD. Night HRV is the median of samples inside main sleep, and needs ≥2 samples.
- **RHR:** the lowest 5-minute rolling mean of heart rate inside main sleep. If that isn't available, use HealthKit `restingHeartRate`, with its own baseline.
- **Baselines:** compare the 7-day mean (≥4 valid days) with the previous 60 days (≥14 valid days).
  - `F_hrv`: z ≤ −0.75.
  - `F_rhr`: 7-day mean − baseline ≥ max(3 bpm, 0.75·sd).
  - `F_sleep`: as in §7.2.
  - Each flag must hold on ≥3 of the last 5 days.
- **Status:**
  - `calibrating`, until 14 valid nights within 28 days;
  - `green`, with 0 flags (the assistant stays silent);
  - `amber`, with 1 flag (named);
  - `red`, with ≥2 flags.

  **No 0–100 recovery number.**
- **Illness guard:** wrist temperature ≥0.5 °C or respiratory rate ≥1.5 br/min over baseline, together with `F_hrv` or `F_rhr`, gives "possible illness, not training" and suppresses training and diet changes.
- **Sleep score:** optional, in the detail view only. Use Apple's published 50/30/20 split (duration / bedtime consistency / interruptions) with research C §6.3's curves. The home screen shows a word, not a score.

---

## 8. The judge (Layer 2)

### 8.1 Output

```ts
type PhysiqueAnalysis = {
  asOf: string;
  phase: "lose" | "maintain" | "gain" | "none";
  data: { weighIns14: number; loggedShare14: number; nightsLogged14: number; expenditureState: "calibrating" | "holding" | "settling" | "stable" };
  weight: { trendKg: number; ratePctPerWeek: number | null; rateWindowDays: number | null; rateSE: number | null };
  expenditure: { kcal: number; state: string; plusMinus: number };
  targets: { kcal: number; proteinG: number; fatG: number; carbsG: number } | null;
  adherence: { deltaKcal: number | null; proteinGPerKg: number | null };
  strength: { status: "dropping" | "holding" | "rising" | "one-lift" | "unclear"; lifts: Array<{ name: string; changePct: number }> };
  sleep: { mean7h: number | null; status: "short" | "restricted" | "ok" | "unknown" };
  verdict: Verdict;                 // exactly one primary verdict (§8.3)
  flags: Verdict[];                 // supporting findings, max 3, in priority order
  recommendation: Recommendation | null;
  status: { state: "good" | "watch" | "attention" | "unknown"; label: string };   // same contract as lib/signalStatus.ts
};
type Verdict = { id: RuleId; title: string; detail: string; evidenceIds: string[]; confidence: "high" | "medium" | "low" };
type Recommendation =
  | { kind: "change_rate"; fromPctPerWeek: number; toPctPerWeek: number; approxKcalDelta: number }
  | { kind: "eat_to_target"; deltaKcal: number }
  | { kind: "protein"; toGPerKg: number }
  | { kind: "sleep"; targetHours: number }
  | { kind: "diet_break"; weeks: 1 | 2 }
  | { kind: "maintenance_first"; weeks: number }
  | { kind: "log_more"; what: "weight" | "food" | "sleep"; needed: number }
  | { kind: "pause_and_seek_help" };
```

### 8.2 Rules

The normative rule list is the **"Judge rules table" in `research/F-evidence-rules.md`**: G-NOISE-1…4, G-EXP-1/2, LOSS-1…6, GAIN-1…4, STR-1…3, PRO-1/2, FAT-1, DB-1/2, SAFE-1…5, M-1 and RECOMP-1. The sleep rules are **replaced** by §7.3 of this file (SLEEP-1, SLEEP-1i, SLEEP-2, SLEEP-3, SLEEP-OK). Each one is implemented as written there, with these amendments:

1. **Recommended kcal steps become rate changes.** LOSS-1's "+150–300 kcal" becomes `change_rate` to the band midpoint (0.75 %/wk, or 0.6 when near goal). `approxKcalDelta` shows the equivalent, clamped to the row's range. GAIN-1/2 work the same way. This is the two-layer rule from §0.
2. **Adherence comes before outcome.** If |adherence| > 150 kcal/day over 14 days, with ≥80% of days logged, the primary verdict is `ADH-1` (eat to target). The outcome rules are demoted to flags. If the user eats 400 kcal under target and loses too fast, the fix is "eat your target", not "change the goal".
3. **Energy density is 7,716 kcal/kg for both gain and loss**, matching §4. Research F's 5,000 for bulks is not used. The self-correcting expenditure loop makes consistency matter more than the true density.
4. **Floors** are 1,500 kcal (male) and 1,200 kcal (female), or the user's stated sex's floor (SAFE-1). `prefer_not_to_say` uses 1,200.

Two new rules:

| ID | Signal | Threshold | Min data | Verdict | Action |
|---|---|---|---|---|---|
| ADH-1 | Adherence | \|intake − target\| > 150 kcal/day, 14-day mean | 14 d, ≥80% logged | "You're averaging 320 kcal under target. Eat to target before changing anything." | `eat_to_target` |
| ON-TRACK | Rate inside the goal band, no other rule firing | — | rate gate (§2.2) | "On track: losing 0.6 %/wk with lifts holding." | none |

### 8.3 Choosing the primary verdict

Evaluate every rule, then pick the primary verdict by the first group that has a match:

1. **Safety:** SAFE-* fires → it is primary, and G8 suppresses every deficit-deepening recommendation.
2. **Data:** no rate yet, or the expenditure state is `calibrating` → `DATA-*` ("Calibrating — 6 more weigh-ins") is primary. `holding` is primary only if nothing in groups 3–4 is gated in.
3. **Adherence:** ADH-1.
4. **Outcome:** LOSS-3 > LOSS-1 > LOSS-4 > GAIN-1 > LOSS-6 > GAIN-2 > LOSS-2 > RECOMP-1 > ON-TRACK.
5. **Contributors** (become flags, or primary only if nothing above fires): SLEEP-1 > PRO-1/2 > STR-2 > FAT-1 > DB-1.

Flags: at most 3 other firing rules, in the same order. Suppression rules (GAIN-3, STR-3, G-NOISE-*) remove rules before ranking.

Status mapping for the home tile: SAFE or LOSS-3 → `attention`; LOSS-1/4/6, GAIN-1/2, ADH-1, SLEEP-1 primary → `watch`; ON-TRACK or RECOMP-1 → `good`; DATA → `unknown`.

### 8.4 Fixtures every rule must have

For each rule ID, `lib/physique/__tests__/judge.test.ts` has:
- (a) a fixture where it fires;
- (b) a near-miss fixture where it must not fire (just under the threshold, or just under the minimum data);
- (c) a fixture where it is suppressed by a higher rule.

The fixtures come from a seeded synthetic generator (`lib/physique/fixtures.ts`) that produces weigh-ins (true trend + AR(1) noise, φ = 0.5, SD 0.5 kg), intake (SD 350 kcal), sleep and workouts for a scenario description.

---

## 9. Weekly check-in

Copied from MacroFactor's module order (research A §B8) and delivered through the assistant.

1. `buildCheckInPlan(analysis, logs, now)` returns these modules, in order:
   1. **Partial days:** suspected partial days, so the user can confirm or exclude them.
   2. **Weigh-in prompt:** shown if there's no weigh-in in the last 3 days plus today.
   3. **Unlogged days:** each one is "fasted (0 kcal)" or "skip".
   4. **Logging break:** an explanation, if the engine is holding.
   5. **Water event:** "skip this week's update?"
   6. **Program update:** old → new targets.
   7. **Judge verdict:** the verdict and recommendation, if any.
2. The UI renders the plan as a short stepper on `/body/check-in`. The assistant can also walk the user through it.
3. Answers are written back as `DayFlags`, then the engine recomputes.
4. The user can **accept** or **decline**. Declining keeps the current targets.
5. **Fast check-in** is one tap: accept the program update, skip the questions.
6. The check-in weekday comes from the profile (default Monday). The home card shows "Check-in ready" from that day until it's done.

---

## 10. Must-not-claim list (enforced in copy and in the assistant prompt)

Implement these as an assistant system-prompt block, and as a unit test that scans verdict copy for banned phrases ("losing muscle", "metabolic damage", "starvation mode", "deep sleep", "REM", "body fat %" without a caveat).

1. No kilograms of muscle gained or lost: not from the scale, BIA, the Navy method or photos.
2. Say "lifts are dropping", never "you're losing muscle".
3. No rate verdict on fewer than 14 days; respect the per-band minimum data in §2.2.
4. Never attribute a single-day or single-week jump to fat.
5. No "metabolic damage" or "starvation mode".
6. Don't state maintenance more precisely than ±300 kcal before 28 days.
7. Diet breaks are framed as adherence and hunger tools only.
8. No protein claims above ~2.2 g/kg (surplus) or ~2.7 g/kg (deficit); no "can only absorb X g per meal".
9. Don't blame carbs for strength loss unless volume is above 10 sets per muscle and carbs are under 3 g/kg.
10. No individual hormone predictions.
11. No sleep-stage judgements (deep, REM) from wearables.
12. Never quantify menstrual water retention in kg.
13. Lean-bulk bands are presented as guidance, not settled science.
14. No RED-S numeric thresholds for men presented as established.
15. Never diagnose an eating disorder or RED-S; no moralising food language ("cheat", "earned", "bad").
16. Recomposition is neither impossible nor guaranteed.
17. Don't recommend reverse dieting as evidence-based.

---

## 11. Training engine (M5)

The training-side spec (set-level progression copied from MacroFactor, the weekly per-muscle set adjustment copied from RP, phase-aware rules, deloads) is `research/B-training-apps.md` §5 and §8. It is normative for milestone M5, with one amendment:

- Its `strengthRetention` and `crossFlags` functions are **replaced** by §6 and §8 of this file. There is one cross-signal implementation, and it lives here.
