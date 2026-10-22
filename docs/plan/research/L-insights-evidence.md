# L. Insights the engine could find: evidence, methods and what other apps do (2026-10-22)

Backs `docs/plan/08-insights.md`. Four parallel reviews in one session: what data the app keeps and drops, what every engine computes, how other apps show cross-domain insights (web and Mobbin), and the physiology and n-of-1 statistics. Research C, F and I were read first; this note only adds to them or corrects them. Reddit and whoop.com blocked fetching, so user sentiment comes from the WHOOP forum, blogs and reviews and is anecdotal. Numbers marked **[derived]** are our own arithmetic from physiology, not published figures.

## 1. What the app keeps, drops and hides (code audit)

**Kept and analysed:** food per item (kcal, protein, carbs, fat, fibre, `time` HH:MM), one weigh-in a day, sleep per wake date (bedtime, wake time, asleep, in bed, stages, segments, HRV SDNN, resting HR), daily steps, workouts (sets with weight, reps, RIR, type; `completedAt`, `durationSec`), day flags (partial, fasting).

**Available at the source but dropped:**
- **Sodium, salt, sugars, saturated fat, alcohol.** Open Food Facts returns them in `nutriments`; `lib/food/off.ts` maps only energy, protein, carbs, fat and fibre. CoFID has sugars and alcohol (Proximates) and sodium (Inorganics); `scripts/build-cofid.ts` reads only Proximates. The AI parse schema has none of them. MacroFactor's Micronutrients sheet (sodium, sugar, caffeine, water, alcohol) is read for fibre only.
- **The food's identity and grams.** A `FoodEntry` keeps no CoFID code, barcode, per-100 g values or grams (grams survive only in the free-text `serving`). Sodium cannot be added to past entries later except by matching CoFID names.
- **Apple Health:** active and basal energy, workouts (with start times), dietary alcohol, caffeine, water, sodium, sugar, wrist temperature, respiratory rate, menstrual flow. Health Auto Export recognises six metrics (`lib/health/hae.ts:86-95`); native HealthKit reads six types.
- **Timing:** HRV is a calendar-day mean including daytime readings (`lib/health/native.ts:139`), not overnight; reading times are lost. HRV or resting HR on a day without a night is discarded. The draft workout's `startedAt` is never saved. Weigh-in time of day is not reliable (`loggedAt` is the save time; HAE times are local with a `Z` appended).
- **Native first sync reads 60 days** (`FIRST_SYNC_DAYS`), so a new user's Apple Health history beyond that is not used.

**Inconsistent:** live workouts stamp `completedAt` at the end, Hevy and Strong imports at the start. Back-logged food defaults to 12:00; imports become one 12:00 day total. Set weights are strings in the display unit (ticket T9).

**Computed but hidden:** `liftsLink` and `recoveryLink` in `linkedReasons.ts` (the report keeps only the weight link), `weeklyInsight.allFixes`, and the per-lift `plateauSignal` / `liftTrend` (reachable only at `/signal/plateau`).

**Never tested against any outcome:** day-to-day scale changes, bedtime and wake time, steps (beyond "fewer than last week" in the weight link), training load against sleep or HRV, food timing.

**Never written by any UI:** `DayFlags.events` (creatine, period, illness, travel) and `note`, `SleepNight.quality`.

## 2. The Connections engine today, and one bias

`lib/physique/connections.ts`: 8 predictors (sleep, HRV, carbs the day before, calories against maintenance the day before, 3-day protein, session hour, days since any session, weight rate) against one pooled number per session (mean of each compound lift's best-set e1RM against the median of its 2 neighbours either side). Top third against bottom third, Welch SE, z 2.7 (about Bonferroni for 8), at least 1.5%, 8 sessions per third, 24 sessions, 112 days. Overlap: |r| ≥ 0.6 keeps the bigger and names the other.

**Bias (simulation, this review):** the neighbour median includes neighbours that share the exposure. When short nights come in runs (probability of staying exposed 0.7), a true −4% read −2.1% and power fell from 69% to 22%. Fix: build each session's level only from unexposed neighbours, or move to the regression below.

**Power of the current window:** about 45 to 60% for a real 4% effect over 16 weeks. "No clear link" today is often "too little to tell".

## 3. What is real and how big

| Predictor | Outcome | Lag | Expected effect | Detectable in one person? | Data needed |
|---|---|---|---|---|---|
| One night ≤ 6 h, or ≥ 1 h under usual | top-set e1RM | night before | 0 to −3% | maybe, 20 to 36 weeks | watch sleep |
| Two or more short nights | reps at a fixed load | 0 to 1 day | −5 to −10% reps | yes | repeated loads |
| Waking ≥ 60 min earlier than usual | e1RM, reps | same day | larger than going to bed late | maybe | wake time (have) |
| Session clock hour, hours awake | e1RM | same day | evening ahead of morning by a few % | yes, if times vary | start time (not saved) |
| Irregular sleep, social jetlag | e1RM | weeks | unknown | no | |
| Alcohol > 0.75 g/kg | sleep HR, HRV | same night | +8.7 bpm, −13 ms RMSSD | **yes**, about 5 nights each way | alcohol (not captured) |
| Alcohol, heavy | next-day top set | 1 day | about 0; jumps and hard endurance worse | no or maybe | alcohol |
| Alcohol | sleep efficiency | same night | about −1.5% | yes | alcohol |
| Carbs above 14-day usual | scale minus trend | 1 to 3 days | +0.2 to 0.4 kg per 100 g [derived] | **yes** | carbs (have), daily weigh-ins |
| Sodium above usual | scale minus trend | 1 to 3 days | about +0.3 kg per extra g retained [derived] | yes, if logged | sodium (not captured) |
| Food mass, fibre | scale minus trend | 1 to 2 days | 0.3 to 1 kg [derived] | maybe | grams (not stored) |
| Weekend | scale | Saturday to Tuesday | about +0.35% | yes | have |
| Hard or new leg session | scale minus trend | 1 to 3 days | 0 to +0.5 kg, weak | maybe | have |
| Creatine start | scale | weeks, persists | +0.5 to 1 kg | yes, as an event | flag exists, no UI |
| Steps against the start of the cut | expenditure, rate | weekly | about 34 kcal a day per 1,000 steps at 85 kg | yes, as an explanation | have |
| Calories under maintenance, 3 days | e1RM | 1 to 3 days | small; strength usually holds on a cut | maybe | have |
| Caffeine before a session | top set | same day | about 2 to 3% | maybe | caffeine (not captured) |
| Protein timing or distribution | anything | weeks | none once the total is matched | no | |
| Pre-session carbs | reps | same day | none, except fasted with > 10 sets a muscle | no or maybe | real meal times |
| Sets, frequency, RIR | e1RM slope | blocks | describe only | no attribution | have |
| Menstrual phase | strength | | trivial (McNulty 2020) | no | |

**Key sources and corrections:**
- **Sleep:** Craven 2022 (Sports Med, doi 10.1007/s40279-022-01706-y): strength −2.85% (66 measures), strength-endurance (reps) −9.85%; −7.56% is the all-task figure. Sleep loss hurts evening sessions more than morning ones, so research C's "morning sessions largely unaffected" is too strong. C's "−0.4% per hour awake" could not be verified. Knowles 2018 (consecutive short nights hurt multi-joint lifts); Reilly and Piercy 1994 (submaximal reps fall from night 2). Strength peaks around 16:00 to 20:00 (Douglas 2020, PMC8425416); habitual training time blunts it (Mirizio 2020).
- **Alcohol:** Pietilä 2018 (n = 4,098, PMC5878366): ≤ 0.25 g/kg +1.4 bpm, −2.0 ms; 0.25 to 0.75 g/kg +4.0 bpm, −5.7 ms; > 0.75 g/kg +8.7 bpm, −12.9 ms. Oura members: −15.6% HRV, −34.6 min sleep. Shaw 2022 (IJSPP): no change in jump, mid-thigh pull or curls the next day, severe cycling −11%. Barnes 2010: 1 g/kg after a damaging session enlarged strength loss at 36 h. Parr 2014 (PMC3922864): muscle protein synthesis −24% at 1.5 g/kg with protein. Diuresis about 100 mL per 10 g alcohol (via Polhuis 2017, PMC5537780); no study of scale weight itself.
- **Scale water:** about 3 g water per g glycogen (Fernández-Elías 2015); glycogen loading +2.3% body water (Bone 2017); wheat fibre adds about 3.7 g stool per g (de Vries 2015, PMC4528039); weekly rhythm, Orsama 2014.
- **NEAT:** non-resting energy was 71% of the fall in expenditure in Weigle 1988, but in CALERIE the fall was not seen in accelerometry (Martin 2011, PMC3075130). Steps explain part of a stall, not all. The back-calculated expenditure already absorbs step changes, so steps explain drift; they are not an input.
- **Training plateaus:** with few training blocks per person, n-of-1 cannot attribute a plateau to volume, frequency or effort. Describe what changed ("Bench flat 7 weeks; chest sets 14 to 8 a week"), don't attribute.

## 4. Statistics: a recipe in plain TypeScript

**Power** (simulated: 2.5 sessions a week with a main lift, AR(1) noise φ 0.3, drifting trend, 25% of sessions exposed with clustering, z 2.7 plus the 1.5% floor, 80% power):

| Session noise (CV) | 3% effect | 4% effect | 5% effect |
|---|---|---|---|
| 2% | about 20 weeks | about 17 | about 16 |
| 3% | about 32 weeks | about 20 | about 18 |
| 4% | about 55 weeks | about 32 | about 22 |

About 1.5× longer for one lift trained 1.5 times a week; about 1.6× longer when only 12% of sessions are exposed (alcohol-like); much faster at a 50/50 split. Null false-positive rate per test was 0.3 to 2.3% at z 2.7, up to 5.9% at z 1.96 with clustered exposure.

**Recipe:**
1. **A fixed family of 10 to 12 hypotheses**, written in code before any data is seen: predictor, lag, expected direction, outcome. Predictors as the deviation from the person's trailing 28-day median.
2. **Outcomes:** log e1RM per lift, and reps at a repeated load. Detect pooled across lifts, show kg on each lift.
3. **Model:** `y ~ β·x + 4-week block intercepts + within-block slope + deload flag + days since last session (cap 7) + time-of-day bucket + phase`, at most about 6 covariates, OLS by normal equations. Standard errors: Newey–West lag 3, or the simpler Welch t on residuals with the variance multiplied by (1 + r₁)/(1 − r₁). If the two-step detrend stays, level from unexposed neighbours only.
4. **Gates:** at least 10 exposed and 10 unexposed sessions, each spread over 6 or more distinct weeks, and 12 weeks of history.
5. **Decision, all must hold:** one-sided in the expected direction (z ≥ 3.3 for the other direction); Benjamini–Hochberg q ≤ 0.10 across the family (valid under positive dependence, BY 2001), or keep z ≥ 2.7; |β| ≥ max(1.5%, 0.5 × the person's residual SD) (Hopkins' smallest worthwhile change); split-half replication on alternating 4-week blocks (same sign, each half at least half the floor); with n ≥ 40, the statistic must beat 95% of circular shifts of the exposure series by 7 days or more (Harris 2020 shift test, arXiv 2012.06862).
6. **Display:** the shrunk estimate β·(1 − 1/t²) to counter the winner's curse, an 80% block-bootstrap range, the session counts. Keep the overlap check but refit with both predictors. Hysteresis: show after 2 weekly passes in a row, hide after 3 fails in a row.

**"Why did my weight jump":**
- Residual = scale − trend. Explain only when |residual| ≥ max(0.5 kg, 1.5 × the person's residual SD).
- Expected decay from the person's own AR(1): after d days the residual is r·φᵈ, φ fitted per person (about 0.5 to 0.7).
- After 60 weigh-ins, a ridge regression of the residual on the day before's drivers (carbs and sodium against usual, food mass, alcohol, leg session, weekend), shrunk towards the priors in §3. Name a cause only when its share is at least 0.3 kg. Show a forecast only if it beats the plain decay when back-tested on the person's own history.

**Pitfalls to design against:** planned or reverse causation (drinking in deload weeks, short sleep before early sessions); logging missing not at random (social days unlogged); exercise-variation and rep-range artefacts; correlated predictors (sleep with alcohol); conditions that are always "yes"; pairs linked by definition; forking paths from tuning thresholds on the data.

## 5. What other apps do

**Nobody links sleep, alcohol or food to a named lift in kg, and nobody explains a lift plateau with quantified causes from the person's own data.** Closest: Honedly (LLM recap puts sleep next to squat tonnage, never links them), Nutri Macro (shows protein and sleep beside a stalled bench, no numbers), Everlift and Plates (plateau alerts from the log only). **No app explains a next-day scale jump from food automatically**; Cronometer Gold lets you overlay weight on sodium by hand. **The threat is WHOOP:** behaviour impact analysis exists and automatic 1RM in Strength Trainer is due November 2026.

| App | Pattern worth copying | Link |
|---|---|---|
| WHOOP Behavior Insights | Ranked list on a diverging axis "HURTS · % IMPACT · HELPS", one number a row; rows from sensor thresholds need no journaling ("77%+ Sleep Performance +10%"); "Record at least 5 yes's and 5 no's" with ✕/✓ counters; reaching the count is not enough ("Unable to identify a significant impact") | mobbin.com/screens/773075e9-a249-47ee-a546-5b2b5ed51fea |
| WHOOP Monthly Performance Assessment | Dropped plain with/without averages as misleading (stretching only after hard days looked harmful); now adjusts for sleep, workouts and other behaviours | whoop.com/eu/en/thelocker/monthly-performance-assessment-now-features-enhanced-recovery-analysis |
| Garmin Lifestyle Logging | Detail sheet: Days logged yes / no, Avg when yes / Avg when no, no score | mobbin.com/screens/97a3c798-108b-48d0-a2c3-2b636c07bcdb |
| Oura tags | Tag icons under each day on the metric's chart; the lag said outright ("measured during your next night of sleep"); 14 of 30 days to start | mobbin.com/screens/dd78e89f-733c-4428-978d-1de2740f26fc |
| Exist.io | Strength and confidence shown apart; checks the next day when the same day shows nothing | kb.exist.io/article/37-what-are-correlations |
| Bevel | Same 5/5 gate; trends table with 3, 7, 14, 30, 90-day change | mobbin.com/screens/d53ade19-db83-4540-938b-3b07d0f426a4 |
| Correlate (2026 indie) | "Honest first 14 days" countdown; "patterns, never proof" | apps.apple.com/app/id6757488839 |
| Apple Health | "Needs More Data" group; "Today 1,700 vs Average 1,700" | mobbin.com/screens/ee42f048-62bf-4c45-af1c-9d4613c4398e |

**What users say:** behaviours that are always "yes" still get an impact (WHOOP forum, a daily medication logged 25/0 showed −4%); a link from one occurrence (Exist); obvious findings are accepted only when quantified in personal units (a WHOOP user knew alcohol hurt his sleep, but the minutes lost made it worth having); daily journaling is a chore and people ask for "default no"; insights saturate and long-time users stop once they know their patterns, so new facts have to keep coming.
