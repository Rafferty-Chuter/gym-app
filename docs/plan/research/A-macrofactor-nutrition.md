# A — MacroFactor (Nutrition) feature teardown

Prepared 2026-10-16 for the physique-coach expansion of `/home/user/gym-app`. Scope: the MacroFactor **nutrition** app (not MacroFactor Workouts, except where the two connect).

**Method.** All official pages were fetched directly on 2026-10-16: the help centre (`help.macrofactorapp.com`, about 100 articles read), the macrofactor.com blog and "MacroFactor Monthly" (MM) newsletters from Oct 2024 to Sept 2026, the App Store listing, and the public feature-request board. Two quantitative tests were run in Python against published MacroFactor behaviour (see §G.6).

**Access limits.** Reddit (`reddit.com`, `old.reddit.com` and the redlib mirrors) returned 403 or 503 from this environment, so **no Reddit thread was read directly**. The "complaints" material comes from three other sources: the official feature-request board, which shows vote counts; MacroFactor's own FAQ articles, which exist because users keep asking the same questions; and two third-party reviews. YouTube reviews were not reviewed.

**Source tags.** `[official]` means a page from MacroFactor (company site, help centre, newsletter, App Store listing or feature board). `[third-party]` means someone else's site. `[inferred]` means my own deduction, or a constant chosen by us.

**Confidence.** **High** means an explicit official statement with numbers. **Med** means official but qualitative, or partly inferred. **Low** means third-party, anecdotal, or our own assumption.

**Priority.** `must` / `should` / `later` refer to *our* build, not to MacroFactor.

---

## 0. TL;DR — the ten things that matter most

1. **The engine is simple, but it is tuned.** Expenditure (TDEE) = average logged intake − (rate of change of trend weight × energy density). It looks back about **21 days of intake** and the **trend change over the past 20 days**. It uses about **3,500 kcal/lb (≈7,700 kcal/kg), the same value for gain and loss** since V3. It is deterministic and recomputed from history. The smoothing internals are kept secret ("secret sauce"). [V3 article](https://macrofactor.com/expenditure-v3/) [official]; [KB#19](https://help.macrofactorapp.com/en/articles/19-change-rate) [official]; [KB#241](https://help.macrofactorapp.com/en/articles/241-what-is-partial-logging) [official]
2. **We reproduced their published behaviour.** A plain model fits MacroFactor's own published weight-perturbation experiment closely (RMS error about 6 kcal across six data points): an EMA trend with α = 0.10 on linearly interpolated weights, the published 20/21-day windows, and a daily expenditure gain of k = 0.10. It also matches their published stability figure (about 7 kcal/day average daily change). See §G.6. [KB#209](https://help.macrofactorapp.com/en/articles/209-should-i-still-log-my-weight-if-i-feel-like-i-m-bloated-constipated-or-retaining-water) [official]; [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) [official]
3. **Coaching is "adherence-neutral".** Targets are recalculated each week from expenditure and the goal rate. Each week stands alone: there is **never any "catch-up"** for being behind or over. Going over your targets can raise next week's calories if the data says your expenditure is higher. [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]; [KB#202](https://help.macrofactorapp.com/en/articles/202-what-should-i-do-if-i-m-pursuing-a-goal-with-a-strict-timeline) [official]
4. **Data rules are explicit.** V3 updates expenditure only with **≥4 of 7 days of nutrition logged and ≥1 weigh-in per 7 days**. Otherwise it is "holding": it keeps the last high-confidence value and resumes after **3 days** of consistent tracking. A blank day is skipped. A day flagged as fasting counts as 0 kcal. **Partial logging is the one thing it cannot handle.** [KB#74](https://help.macrofactorapp.com/en/articles/74-expenditure-version) [official]; [MM Oct 2024](https://macrofactor.com/mm-october-2024/) [official]
5. **Goal rates are % of bodyweight per week, with published tables.**
   - Cutting: default 0.25–1.0 %/wk, open range 0.1–1.5 %/wk, hard advice to stay under 1 kg/wk.
   - Bulking: a table by training status, for example intermediate 0.15 / 0.325 / 0.575 / 0.8 %/wk. MacroFactor says the in-app recommendations mirror this table.
   - Maintenance: a ±0.68 kg band, with a ±0.15 %/wk nudge outside it.

   [Cutting](https://macrofactor.com/cutting-calculator/) [official]; [Bulking](https://macrofactor.com/bulking-calculator/) [official]; [KB#125](https://help.macrofactorapp.com/en/articles/125-how-does-dynamic-maintenance-work-in-macrofactor) [official]
6. **Macros are protein-first, scaled to fat-free mass.** For lifters on a cut the options run from 2.0 to 3.5 g/kg FFM. There is a published fat floor of `30 + 0.5 × (height_cm − 150)` g. Non-protein calories are split by diet type. The calorie floor is 1,200 kcal by default, with "low" and "none" options. [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) [official]; [KB#78](https://help.macrofactorapp.com/en/articles/78-how-much-dietary-fat-should-you-eat) [official]; [KB#34](https://help.macrofactorapp.com/en/articles/34-what-are-the-different-program-options-in-coached-mode) [official]
7. **The weekly check-in is a short sequence of data-quality modules before the update.** In order: partial-logging review, weigh-in prompt, fasting-vs-unlogged confirmation, logging-break explanation, then the program update. The user can skip any module, decline the check-in, or turn on a one-tap "Fast Check-In". [KB#247](https://help.macrofactorapp.com/en/articles/247-introduction-to-check-ins-and-coaching-modules) [official]
8. **The logger wins on counted taps, not polish.** In the Food Logging Speed Index (FLSI) 2025, MacroFactor scored **24 actions in total** (search 10, multi-add 6, barcode 5, quick-add 3). Next best: MyNetDiary 30, LoseIt 32; MyFitnessPal scored 36. The speed comes from five things:
   - a single "plate" that every logging method feeds into;
   - multi-add straight from the result list, using the serving you last used;
   - "go-to" foods suggested for the current hour;
   - a custom number keypad for servings;
   - a 24-hour timeline instead of meal slots.

   [FLSI 2025](https://macrofactor.com/fastest-food-logger-2025/) [official]; [New food logger](https://macrofactor.com/new-food-logger/) [official]
9. **Expenditure modifiers (v5.5.0, Oct 2025) are optional add-ons.**
   - *Step-informed updates* use step *trends* to speed up updates. Steps are never converted to calories.
   - *Predictive goal adjustment* shifts expenditure by **4 × the change in goal rate (in %/wk)** over about 2 weeks.
   - Together they improve accuracy by about 6–8 % month-to-month and about 20 % over 100 days.

   [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) [official]; [MM Oct 2025](https://macrofactor.com/mm-oct-2025/) [official]
10. **The biggest gap for us: MacroFactor does not track sleep.** "Import Sleep" is the **#1 feature request on their board (14,390 votes, 'Under Consideration')**. Training data also lives in a separate paid app. Other top requests: sub-goals/milestones (7,050 votes), meal planning (6,777), weigh-in reminders (6,739), recurring meals (5,892) and a web app (5,337). A web-native, training-aware coach that also reads sleep fills gaps they have not closed. [Feature board](https://feedback.macrofactorapp.com/roadmap/feature-requests) [official]

---

## A. Expenditure (TDEE) engine

### A1. Back-calculated expenditure (core)
- **What it does.** Shows a daily "Expenditure" number and chart: an estimate of the user's real TDEE, built from what they log and how their trend weight moves. All coaching flows from this number.
- **How it works.**
  - Formula: `Calories out = Calories in − Change in stored energy`. The change in stored energy comes from the rate of change of *trend* weight. [KB#20](https://help.macrofactorapp.com/en/articles/20-expenditure) [official]; [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]
  - It is deterministic. Editing past data recomputes everything, and you can undo an edit by re-entering the original value. [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]; [KB#209](https://help.macrofactorapp.com/en/articles/209-should-i-still-log-my-weight-if-i-feel-like-i-m-bloated-constipated-or-retaining-water) [official]
  - Windows: "MacroFactor uses the last **21 days** of your nutrition data" [KB#241](https://help.macrofactorapp.com/en/articles/241-what-is-partial-logging) [official]. Change rate is "based on changes in your trend weight over the past **20 days**, expressed as a weekly figure" [KB#19](https://help.macrofactorapp.com/en/articles/19-change-rate) [official]. Foods logged more than 3 weeks back barely affect today's value [KB#207](https://help.macrofactorapp.com/en/articles/207-will-logging-food-to-a-previous-day-affect-my-expenditure-and-coaching-recommendations) [official].
  - Energy density in V3: the same assumption for gain and loss, equal to the "3,500 kcal/lb rule". That rule implies roughly 78 % fat / 22 % lean, using fat ≈ 39.5 MJ/kg (≈4,282 kcal/lb) and lean ≈ 7.6 MJ/kg (≈824 kcal/lb). Earlier versions used a smaller surplus per unit gained, which biased expenditure upward by about 80 kcal (0–130 kcal for most users) and made bulking calorie increases too slow. [V3 article](https://macrofactor.com/expenditure-v3/) [official]. The help centre gives the round figures 9,400 kcal/kg fat and 1,800 kcal/kg lean. [KB#220](https://help.macrofactorapp.com/en/articles/220-how-do-macrofactor-s-algorithms-respond-to-body-recomposition) [official]
  - **Conflicting older text.** KB#20 still says the fat share of weight change varies with rate [official]. KB#222 still uses about 180 kcal/day for +0.5 lb/wk, which implies about 2,520 kcal/lb [official]. Both contradict the V3 article; treat them as V1/V2 text. **Use the single symmetric constant.** [inferred]
  - Framing: it is a prediction engine. It predicts weight change from intake minus expenditure and updates on the prediction error. Example: Greg's June 2021 data, 2,960 kcal/day intake against 3,380 kcal/day expenditure, predicted −3.6 lb; the actual change was −3.4 lb. [V3 article](https://macrofactor.com/expenditure-v3/) [official]
  - Two derived numbers that differ on purpose:
    - "Energy Balance" widget: the plain 30-day average of (intake − expenditure).
    - Deficit/surplus shown in the Weight Trend view: "weighted and trended over the past three weeks". When they disagree, the trend one is used for updates.

    [KB#224](https://help.macrofactorapp.com/en/articles/224-interpreting-the-energy-balance-widget) [official]
  - It does **not** use wearable calorie estimates. Their reason: wearables miss by more than 10 % over 80 % of the time. [KB#33](https://help.macrofactorapp.com/en/articles/33-does-macrofactor-use-energy-expenditure-data-from-my-wearable-activity-tracker) [official]
  - **Body recomposition.** Expenditure is slightly underestimated (about 3.5 % typical, about 10 % in extreme cases), but the targets stay correct for the goal. [KB#220](https://help.macrofactorapp.com/en/articles/220-how-do-macrofactor-s-algorithms-respond-to-body-recomposition) [official]
  - **Systematic under-logging is absorbed.** The expenditure reads low, but the intake targets still work. [KB#201](https://help.macrofactorapp.com/en/articles/201-how-accurately-do-i-need-to-log-my-food) [official]
- **UX pattern.**
  - The Expenditure chart sits under the dashboard's "Insights & Analytics" section.
  - Point markers: a circle means "updating", a square means "holding/paused".
  - A shaded "flux range" band is shown "for fun and curiosity". It is explicitly *not* a confidence interval.

  [KB#74](https://help.macrofactorapp.com/en/articles/74-expenditure-version) [official]; [KB#22](https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard) [official]
- **Sources.** https://macrofactor.com/expenditure-v3/ [official] · https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/ [official] · https://help.macrofactorapp.com/en/articles/20-expenditure [official] · https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure [official] · https://help.macrofactorapp.com/en/articles/19-change-rate [official] · https://help.macrofactorapp.com/en/articles/241-what-is-partial-logging [official] · https://help.macrofactorapp.com/en/articles/224-interpreting-the-energy-balance-widget [official]
- **Confidence.** High for the principle, windows and energy density. Low for the internals (not published).
- **Adapt for us.**
  - **Copy:** the energy balance back-calculation, the deterministic recompute-from-history design (it fits localStorage: recompute on load), and the symmetric 7,716 kcal/kg constant.
  - **Change:** use the open model in §G, which is calibrated to their published behaviour.
  - **Skip:** the "flux range" band. It invites misreading and the product brief says "glanceable, not interpretive".
- **Priority.** must

### A2. Initial estimate (before data exists)
- **What it does.** Onboarding produces a starting TDEE. MacroFactor calls it "the least important bit of information" in the system.
- **How it works.**
  - **TDEE₀ = BMR × activity factor.** [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]
  - **Activity factor = general activity + exercise add-on**, read from their published image (https://macrofactor.com/wp-content/uploads/2024/02/image-1.png) [official]:
    - General activity: Low 1.2, Moderate 1.4, High 1.6.
    - Exercise add-on: 0 sessions/wk +0; 1–3 sessions/wk +0.1; 4–6 sessions/wk +0.2; 7+ sessions/wk +0.3.
  - **BMR uses the MacroFactor equations (Oct 2024).** These replaced Cunningham; KB#26 still says "Cunningham" and is outdated. [MacroFactor BMR](https://macrofactor.com/macrofactors-bmr/) [official]; [Outlift review](https://outlift.com/macrofactor-review/) [third-party] notes the switch.
    - Height and weight: `BMR = 129.6·W^0.55 + 0.011·H² − a·Age − 213.8·Sex`. W is kg, H is cm, Sex is 0 for male and 1 for female. a = 1.96 per year up to age 60, then 4.9 per year after 60.
    - Body composition: `BMR = 50.2·FFM^0.7 + 40.5·(FFM^0.7 · FM^0.066) − a·Age`, with a = 1.1 per year up to 60, then 2.75.
    - Athletes (≥7 h/wk of intense exercise): `BMR = 40.4·FFM^0.932`.
    - Metabolic adaptation: ×0.95 if in an energy deficit; ×0.97 if current weight is more than 10 % below peak weight; ×0.92 if both.
  - **Goal correction.** Initial estimates ran too high for cutters and too low for bulkers (r = 0.27, p < 0.00001). Fix: multiply the initial estimate by `(1 + 4 × goal rate as a fraction per week)`. For example, −1 %/wk gives ×0.96. [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) [official]. Whether this is always on, or only with the "Predictive Goal Adjustment" toggle, is **unclear** from the text. [inferred]
  - **Typical error.** Individual errors of 400–500 kcal or more are expected. [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]
  - **Overrides.**
    - A manual initial TDEE has no downside for the algorithm. [KB#70](https://help.macrofactorapp.com/en/articles/70-set-a-manual-initial-expenditure-estimate) [official]
    - Back-filling about 30 days of past weight and intake gives a calibrated start ("more than 30 days won't improve it"). [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]
    - After back-filling or a manual override, the user is told to "create a new program". [KB#206](https://help.macrofactorapp.com/en/articles/206-what-should-i-do-if-my-initial-expenditure-or-recommended-energy-intake-seems-too-high-or-too-low) [official]
  - **Profile fields only seed TDEE₀.** Changing activity level later does not affect the current estimate. [KB#57](https://help.macrofactorapp.com/en/articles/57-change-your-activity-level) [official]
- **UX pattern.** Short onboarding questions: sex, age, height, weight, body-fat category (visual), activity level, sessions/week, lifting/cardio experience. Then a "Get program" summary that the user can go back and change.
- **Sources.** https://macrofactor.com/macrofactors-bmr/ [official] · https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/ [official] · https://macrofactor.com/expenditure-modifiers/ [official] · https://help.macrofactorapp.com/en/articles/70-set-a-manual-initial-expenditure-estimate [official]
- **Confidence.** High.
- **Adapt for us.**
  - **Copy** the equations, the activity table and the goal correction verbatim.
  - **Change:** our users already log training, so infer sessions/week from their workout history instead of asking. Offer "paste your last 30 days from MFP/Cronometer CSV" as the back-fill path. This fits the existing CSV import culture in `lib/csvImport.ts`. [inferred]
- **Priority.** must

### A3. Warm-up, confidence and "holding" vs "updating"
- **What it does.** Explains why the number is not moving yet, and when it will.
- **How it works.**
  - Timeline: the initial estimate "sticks around for a few days"; it "will start moving" after a week; the rate of change slows after **14–30 days**. [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]
  - "2–3 weeks to dial in". After that, real changes are picked up within 1–2 weeks. [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]
  - Larger daily adjustments are allowed while confidence ramps up. This causes typical overshoots of **50–150 kcal** that settle by weeks 3–4. [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]
  - The first check-in moves targets by "a couple of Calories"; the second check-in is the first real adjustment. [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official]
  - States: "holding" or "updating". In V3, holding is triggered by fewer than 4 of 7 nutrition days, or no weigh-in in 7 days. (V1/V2 required 6 of 7. KB#26 still says 6/7 and is outdated.) [KB#74](https://help.macrofactorapp.com/en/articles/74-expenditure-version) [official]; [KB#110](https://help.macrofactorapp.com/en/articles/110-how-frequently-do-i-need-to-log-my-nutrition-for-the-expenditure-algorithm-and-weekly-coaching-updates) [official]
  - V3 needs only **3 days** of consistent tracking to resume after inactivity. [MM Oct 2024](https://macrofactor.com/mm-october-2024/) [official]
  - While holding, it carries forward "your last high-confidence energy expenditure value". [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]
  - One new weigh-in after a gap lets it "catch back up immediately". [KB#109](https://help.macrofactorapp.com/en/articles/109-how-frequently-do-i-need-to-log-my-weight-for-the-expenditure-algorithm-and-weekly-coaching-updates) [official]
- **UX pattern.** Square markers on the chart while holding. A "Logging Break" module in the check-in explains when updates will resume. Pausing is framed positively ("pausing preserves your last known, high-confidence value"). [KB#74](https://help.macrofactorapp.com/en/articles/74-expenditure-version) [official]; [KB#247](https://help.macrofactorapp.com/en/articles/247-introduction-to-check-ins-and-coaching-modules) [official]
- **Sources.** As cited above.
- **Confidence.** High.
- **Adapt for us.**
  - **Copy** the two-state model and the exact thresholds.
  - It maps directly onto the product principle "cold-start handled honestly". The home indicator should say "Calibrating — day 9 of ~21" or "Holding — need 2 more logged days this week". [inferred]
- **Priority.** must

### A4. Missing, partial and fasting days ("adherence-neutral")
- **What it does.** Users can skip days, eat off-plan, or estimate, without breaking the coaching.
- **How it works.**
  - **Unlogged day** (zero entries, not flagged as fasting): skipped. V3 internally infers intake for missing days. Its estimates average about 13 % error, and over 90 % are within 30 %. That is why V3 tolerates about 3× more missing data than V2. The inference method is not published. [V3 article](https://macrofactor.com/expenditure-v3/) [official]. The Outlift review describes it as "assumes you ate your usual amount" [third-party].
  - **Fasting day.** The user must explicitly flag it ("Edit Day → Fasting"); it then counts as 0 kcal. Flag only when the whole calendar day had zero intake *and* nothing at all was logged. [KB#16](https://help.macrofactorapp.com/en/articles/16-track-a-fasting-day) [official]
  - **Partial logging** is "the Achilles heel": one half-logged day biases the next ~3 weeks. Worked example: 20 days at 3,000 kcal + 1 day at 1,500 → mean 2,929 kcal, about −71 kcal/day. [KB#241](https://help.macrofactorapp.com/en/articles/241-what-is-partial-logging) [official]
  - Guidance for missed meals, best first:
    1. Quick-add an estimate of the missing meal.
    2. Quick-edit the whole day's total. An estimate within ±30 % is "fine".
    3. Delete the partial entries so the day is skipped.

    [KB#29](https://help.macrofactorapp.com/en/articles/29-how-do-macrofactor-s-coaching-algorithms-deal-with-partially-logged-days) [official]
  - Habitually not logging small, consistent items (for example cream in coffee) is fine; the targets absorb it. [KB#201](https://help.macrofactorapp.com/en/articles/201-how-accurately-do-i-need-to-log-my-food) [official]
  - An untracked 5,000 kcal day in a 3-week window → expenditure about 140 kcal/day too low for about 3 weeks. Logging atypical days is preferred but not required. [KB#221](https://help.macrofactorapp.com/en/articles/221-if-you-have-an-unusual-day-of-eating-is-it-better-to-log-it-or-leave-the-day-blank) [official]
  - Pre-logged future days do not count until they have passed. [KB#208](https://help.macrofactorapp.com/en/articles/208-will-logging-food-to-a-future-day-affect-my-expenditure-and-coaching-recommendations) [official]
  - **Partial-day detection.** The check-in module fires when a day's total is "considerably below your norm" (their example: 500 kcal against a usual 2,000). The user can mark the day "incomplete", which excludes it. **The exact threshold is not published.** [KB#248](https://help.macrofactorapp.com/en/articles/248-coaching-module-partial-logging) [official]
- **UX pattern.**
  - "Edit Day" in the quick-action (+) menu, with day properties for Fasting and Period. [KB#39](https://help.macrofactorapp.com/en/articles/39-quick-edit-your-nutrition-for-a-full-day) [official]
  - Check-in modules ask the user to confirm suspicious days. No shaming copy anywhere.
- **Sources.** https://help.macrofactorapp.com/en/articles/241-what-is-partial-logging [official] · https://help.macrofactorapp.com/en/articles/29-how-do-macrofactor-s-coaching-algorithms-deal-with-partially-logged-days [official] · https://help.macrofactorapp.com/en/articles/248-coaching-module-partial-logging [official] · https://help.macrofactorapp.com/en/articles/250-coaching-module-fasting [official] · https://macrofactor.com/expenditure-v3/ [official]
- **Confidence.** High for the rules. Low for the detection threshold and the imputation method.
- **Adapt for us.**
  - **Copy** the explicit day status: `complete | partial | fasting | unlogged`.
  - For imputation, use the window mean (§G). Note that excluding a day from the mean *is* mean-imputation.
  - The assistant is a natural place to resolve partial days: "Tuesday shows 640 kcal against a usual ~2,600. Was that a full day?" [inferred]
- **Priority.** must

### A5. Responsiveness and damping, versions, known failure modes
- **What it does.** Stops the number from swinging after a salty meal, while still following real change.
- **How it works.**
  - **V3 vs V2.** V3 detects real trend reversals 1–5 days sooner (about 3 days in Greg's data), has day-to-day changes about 35 % smaller, and is about 10 % more accurate (weekly prediction error about 15 % smaller). [V3 article](https://macrofactor.com/expenditure-v3/) [official]
  - **2025 weight tweaks.** Responsiveness +5.8 %, stability −3.9 %. Average daily expenditure change in their dataset: **7.25 kcal/day** (V3), 7.49 kcal/day with modifiers. [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) [official]
  - **"Two-step" hedging.** In week 1 of a deviation the change is tentative; if the trend holds into weeks 2–3, the change is larger. Weight that is several lb or kg off for 1–5 days moves next week's target by about 20–30 kcal. [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]
  - **Impulse experiment (used for calibration in §G.6).** Greg added +4, +3 and +2 lb to three consecutive past days and recorded today's expenditure (baseline 3,016):

    | Perturbation placed this far back | 1 wk | 2 wk | 3 wk | 4 wk | 5 wk | 6 wk |
    |---|---|---|---|---|---|---|
    | Today's expenditure | 2,957 | 2,958 | 3,006 | 3,056 | 3,056 | 3,041 |
    | Change vs baseline | −59 | −58 | −10 | +40 | +40 | +25 |

    It settled back to baseline by about 8 weeks. [KB#209](https://help.macrofactorapp.com/en/articles/209-should-i-still-log-my-weight-if-i-feel-like-i-m-bloated-constipated-or-retaining-water) [official]
  - **Known weak spots (they say so themselves):**
    - Persistent water shifts: creatine, low-carb ↔ high-carb, more fibre, and the start of a cut or bulk. These cause errors under 10 % of TDEE that fade in about 2 weeks; advice is to skip 1–2 check-ins. [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]; [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]
    - Week-long unusual activity, for example a cycling trip at about +2,000 kcal/day. [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]
    - Big lifestyle changes take about **3–4 weeks** to price in. For changes over 500 kcal/day, advice is to eat ahead of the algorithm. [KB#210](https://help.macrofactorapp.com/en/articles/210-what-should-i-do-if-my-activity-levels-change-drastically) [official]
  - **"Ease-in" effect.** Water loss at the start of a cut makes it briefly raise calories (and lower them at the start of a bulk). They describe this as a feature. [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]
  - **Menstrual cycles.** V3 is more robust; no period tracking is needed for that. [MM Oct 2024](https://macrofactor.com/mm-october-2024/) [official]. A "Period Weight Trend" is on the 2026–27 roadmap. [MM Sept 2026](https://macrofactor.com/mm-sept-2026/) [official]
  - **Exercise.** Adding exercise raises TDEE less than expected. Example: +400 kcal of exercise → about +250–300 kcal at maintenance, +150–200 kcal in a deficit. [KB#256](https://help.macrofactorapp.com/en/articles/256-i-ve-started-exercising-more-why-isn-t-my-expenditure-increasing) [official]
- **UX pattern.** Choosing the expenditure version is a setting (V1/V2/V3; V3 recommended). [KB#74](https://help.macrofactorapp.com/en/articles/74-expenditure-version) [official]
- **Sources.** As cited above.
- **Confidence.** High for published behaviour. V3 internals are explicitly withheld ("To avoid giving away our 'secret sauce'…").
- **Adapt for us.**
  - **Copy** the behavioural targets: stability around 5–8 kcal/day, the impulse response, and "skip check-in on known water events".
  - **Change:** we know our users' training; detect a creatine start or a carb-cycling change through the assistant and suggest skipping a check-in. [inferred]
  - **Skip** version selection.
- **Priority.** must (behaviour) / skip (versions UI)

### A6. Expenditure modifiers (Oct 2025, v5.5.0)
- **What it does.** Two opt-in toggles under More → Expenditure: "Step-Informed Updates" and "Predictive Goal Adjustment". [MM Oct 2025](https://macrofactor.com/mm-oct-2025/) [official]; [KB#274](https://help.macrofactorapp.com/en/articles/274-expenditure-modifiers) [official]
- **How it works.**
  - **Step-informed.** "Uses step trends to speed up expenditure updates during periods where the step data improves confidence. We do NOT attempt to directly assign an expenditure value to your steps." Expenditure moves a bit faster when steps trend up or down. Effect: about +2 % responsiveness and −3 % stability (+3.3 % / −3 % after day 30). **The mechanism is not published.** [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) [official]
  - **Predictive goal adjustment.** On a goal change, expenditure is nudged by about **4 × Δ(goal rate in %/wk)** over about **2 weeks**. Their example: switching from −1 %/wk to +0.5 %/wk gives about +6 %. Faster when moving toward slower loss or faster gain; slower in the other direction, for the first two weeks. [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) [official]; [KB#274](https://help.macrofactorapp.com/en/articles/274-expenditure-modifiers) [official]. Caveat: it "gets ahead of the data", so it misleads if the user sets a goal they won't pursue. [MM Oct 2025](https://macrofactor.com/mm-oct-2025/) [official]
  - **Combined effect.** Responsiveness +9.1 % with no meaningful stability loss. Monthly weight-change prediction error −6 % overall, −8 % after adaptation. Cumulative 100-day error about −20 %. Median 100-day expenditure error 108 → 89 kcal (weight error about 3 lb → 2.5 lb). [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) [official]
  - **Bundled with the same release:** higher protein recommendations (see B6).
- **UX pattern.** Two toggles at the bottom of the Expenditure settings page; each has a short explainer.
- **Sources.** https://macrofactor.com/expenditure-modifiers/ [official] · https://macrofactor.com/mm-oct-2025/ [official] · https://macrofactor.com/mm-nov-2025/ [official] · https://help.macrofactorapp.com/en/articles/274-expenditure-modifiers [official]
- **Confidence.** High for the predictive formula. Low for the step mechanism.
- **Adapt for us.**
  - **Copy** predictive goal adjustment: it is deterministic and cheap.
  - **Change:** make it default-on, and only apply it when the user confirms they are starting the new phase today. [inferred]
  - **Later:** step-informed updates. Our web app has no reliable step source.
- **Priority.** should (predictive) / later (steps)

### A7. Expenditure controls
- **What it does.** Power-user escape hatches.
- **How it works.**
  - **Manual initial TDEE.** [KB#70](https://help.macrofactorapp.com/en/articles/70-set-a-manual-initial-expenditure-estimate) [official]
  - **Change the expenditure start date.** A "fresh start" without deleting data, for example after a run of partial logging. [KB#61](https://help.macrofactorapp.com/en/articles/61-change-your-expenditure-start-date) [official]
  - **Static mode.** Expenditure is locked and there are no weekly updates. Switching back to dynamic recomputes "as if you'd been dynamic the whole time". [KB#64](https://help.macrofactorapp.com/en/articles/64-how-to-change-your-expenditure-estimate-from-dynamic-to-static) [official]
- **UX pattern.** Settings rows, each with a single "Edit" action.
- **Sources.** As above.
- **Confidence.** High.
- **Adapt for us.**
  - **Copy:** manual initial TDEE and start-date reset (both trivial with a recompute-from-history design).
  - **Skip:** static mode at first. The `manual` program style covers that need.
- **Priority.** should

---

## B. Coaching, goals and the weekly check-in

### B1. Program styles: Coached / Collaborative / Manual
- **What it does.** Sets how much control the user hands to the app.
- **How it works.** [KB#91](https://help.macrofactorapp.com/en/articles/91-program-styles) [official]; [KB#92](https://help.macrofactorapp.com/en/articles/92-weekly-budget) [official]
  - **Coached** (the default): the app sets and adjusts calories and macros every week.
  - **Collaborative:** the app sets the *weekly* calorie budget; the user sets per-day calories and macros with carb:fat sliders and per-day locks. There is **no calorie floor and no fat floor**.
  - **Manual:** the user sets everything and there are no weekly adjustments. Analytics still work. Intended for people with a human coach.
  - Switching styles never loses data or resets the goal.
  - In Coached and Collaborative, the **weekly** budget is locked: raising one day lowers the others.
- **UX pattern.** Strategy tab → New Program → choose a style → a short wizard.
- **Sources.** https://help.macrofactorapp.com/en/articles/91-program-styles [official] · https://help.macrofactorapp.com/en/articles/92-weekly-budget [official]
- **Confidence.** High.
- **Adapt for us.**
  - **Copy:** Coached and Manual. Manual matters because many of our users have a coach.
  - **Later:** Collaborative. It is a lot of UI for a minority need.
- **Priority.** must (coached + manual) / later (collaborative)

### B2. Goal types and rate options
- **What it does.** Lose / Maintain / Gain, with a target weight and a weekly rate.
- **How it works.**
  - Rate is set as **% of bodyweight per week**, so the absolute rate shrinks as weight falls. [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official]
  - The slider has a coloured "green range". [KB#90](https://help.macrofactorapp.com/en/articles/90-set-a-new-goal) [official]
  - Named ranges include "slower" and "recommended". [MM Aug 2026](https://macrofactor.com/mm-august-2026/) [official]
  - **Cutting table** [Cutting](https://macrofactor.com/cutting-calculator/) [official]:

    | | Very conservative | Conservative | Moderate | Slightly aggressive | Aggressive |
    |---|---|---|---|---|---|
    | %BW/wk | 0.10 | 0.25 | 0.5–0.75 | 1.00 | 1.5* |
    | Relative deficit | <5 % | 5–10 % | 10–20 % | 20–30 % | >30 % |

    - Default advice: 0.25–1 %/wk; "be open to" 0.1–1.5 %.
    - *Keep under **1 kg (2 lb)/wk** whatever the bodyweight. Deficits over **1,000 kcal/day** are "unpleasant and unsustainable" for most people.
    - Deficits under about 500 kcal/day kept lean mass on average (Murphy & Koehler 2021).
  - **Bulking table** (%BW/wk) [Bulking](https://macrofactor.com/bulking-calculator/) [official]. "These reflect the bulking recommendations you'll now find when setting up a new weight gain goal in MacroFactor" (updated Oct 2024; [MM Oct 2024](https://macrofactor.com/mm-october-2024/) [official]).

    | Training status | Conservative | Happy medium | Aggressive | Very aggressive |
    |---|---|---|---|---|
    | Beginner | 0.2 | 0.5 | 0.8 | 1.0 |
    | Intermediate | 0.15 | 0.325 | 0.575 | 0.8 |
    | Experienced | 0.1 | 0.15 | 0.35 | 0.6 |

    - Absolute caps in kg/wk: Beginner 0.16 / 0.4 / 0.64 / 0.8; Intermediate 0.12 / 0.26 / 0.46 / 0.64; Experienced 0.08 / 0.12 / 0.28 / 0.48.
    - Status definitions: Beginner = strength up ≥2 %/wk; Intermediate ≈1 %/wk; Experienced well below 1 %/wk.
  - **Recomp:** maintenance, or a rate between "slower" and the top of "recommended". [MM Aug 2026](https://macrofactor.com/mm-august-2026/) [official]
  - **Reverse diet:** a gain goal at the slowest rate, with a target more than 10–15 lb away so water spikes don't complete it. [KB#32](https://help.macrofactorapp.com/en/articles/32-how-would-i-pursue-a-reverse-diet-in-macrofactor) [official]
  - **The app does not nudge users toward weight loss.** [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]
  - **Exact in-app slider bounds and green-range edges are not published.** An anecdotal Reddit summary says ~0.85 kg/wk was "on the higher end but still green". [third-party, low]
- **UX pattern.** Goal wizard: direction → target weight + rate slider (showing the initial daily budget and projected end date live) → summary screen with start weight, target, weekly change and an explanation of adjustments. Target weight and rate can be edited later; changing direction means a new goal. A previous goal can be reopened. [Goal features](https://macrofactor.com/goal-features/) [official]; [KB#88](https://help.macrofactorapp.com/en/articles/88-edit-a-goal) [official]
- **Sources.** https://macrofactor.com/cutting-calculator/ [official] · https://macrofactor.com/bulking-calculator/ [official] · https://macrofactor.com/goal-features/ [official] · https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal [official]
- **Confidence.** High for the tables. Low for the exact slider bounds.
- **Adapt for us.**
  - **Copy** both tables as the slider's colour bands.
  - **Change:** we can *measure* training status from logged e1RM progression (the `lib/liftTrend.ts` and `lib/bench1rm.ts` area) instead of asking, which gives the right row of the bulking table automatically. That suits the target audience. [inferred]
  - Show the projected ETA as MacroFactor does.
- **Priority.** must

### B3. Target calculation and weekly update (with smoothing)
- **What it does.** Each check-in recommends new calorie and macro targets.
- **How it works.**
  - `target = expenditure ± energy for the goal rate`. [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]
  - Changes come from three sources: expenditure changes, goal changes, and "intelligent smoothing". [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official]
  - **Smoothing example.** A 3-week stall that "implies" −500 kcal → recommendations move only **200–300 kcal**. After **3–4 weeks** of consistent data they move fully. [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official]; [KB#205](https://help.macrofactorapp.com/en/articles/205-why-does-my-new-program-have-slightly-different-calorie-and-macronutrient-targets-than-my-old-program-even-though-i-didn-t-change-my-goal) [official]
  - The smoothing is "a modifier … due to the rate of change in your expenditure". [KB#23](https://help.macrofactorapp.com/en/articles/23-how-do-i-adjust-my-macro-targets) [official]. **The formula is not published.**
  - **A new program skips smoothing:** "solely calculated based on your expenditure and goal at the moment". Their example: expenditure 2,400, smoothed target 2,350, new program 2,400. [KB#205](https://help.macrofactorapp.com/en/articles/205-why-does-my-new-program-have-slightly-different-calorie-and-macronutrient-targets-than-my-old-program-even-though-i-didn-t-change-my-goal) [official]
  - **No minimum step size.** Changes of 3 kcal are applied ("any threshold would be arbitrary"); users can dismiss the check-in. [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official]
  - **No catch-up.** Each week is self-contained. For hard deadlines (weight-class sports), the user edits the rate each week so the ETA holds. [KB#202](https://help.macrofactorapp.com/en/articles/202-what-should-i-do-if-i-m-pursuing-a-goal-with-a-strict-timeline) [official]
  - **Goal-rate edits mid-week** take effect fully at the next check-in, or immediately via "new program". [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official]
  - The FAQ explains counter-intuitive outcomes in four cases: losing slower and calories didn't drop; gaining slower and calories didn't rise; losing on pace and calories dropped; gaining on pace and calories rose. Each traces to the gap between intake and target versus expenditure. [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official]
- **UX pattern.** Strategy tab shows a check-in badge. The program-update module shows old → new targets. Accept, or decline to keep the current targets. [KB#247](https://help.macrofactorapp.com/en/articles/247-introduction-to-check-ins-and-coaching-modules) [official]
- **Sources.** As cited.
- **Confidence.** High for the principle. Low for the smoothing formula.
- **Adapt for us.**
  - **Copy:** no catch-up, new-program = unsmoothed, apply any size of change.
  - **Change:** our expenditure model (§G) already carries most of the hedging. Add only a light per-check-in cap. [inferred]
  - The assistant explains each change in one sentence in the user's own numbers. The four FAQ cases are ready-made explanation templates.
- **Priority.** must

### B4. Dynamic maintenance
- **What it does.** A maintenance goal that actively holds a target weight.
- **How it works.**
  - If trend weight is within **±1.5 lb (0.68 kg)** of target, targets equal expenditure.
  - Outside the band, the app prescribes a deficit or surplus equal to **0.15 % of bodyweight per week**. Example: 75 kg, TDEE 2,500, above the band → about 2,375 kcal.
  - The maintenance target is set in *trend* weight.

  [KB#125](https://help.macrofactorapp.com/en/articles/125-how-does-dynamic-maintenance-work-in-macrofactor) [official]; [Goal features](https://macrofactor.com/goal-features/) [official]
- **UX pattern.** Goal Progress shows a dial with "Under / On / Over" around the target. [KB#22](https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard) [official]
- **Sources.** https://help.macrofactorapp.com/en/articles/125-how-does-dynamic-maintenance-work-in-macrofactor [official]
- **Confidence.** High.
- **Adapt for us.** **Copy exactly.** Diet breaks and deload weeks fall out of it for free: MacroFactor's advice for both is "eat at expenditure for a week". [KB#30](https://help.macrofactorapp.com/en/articles/30-does-macrofactor-support-refeeds-diet-breaks-or-carb-cycling) [official]; [KB#210](https://help.macrofactorapp.com/en/articles/210-what-should-i-do-if-my-activity-levels-change-drastically) [official]
- **Priority.** must

### B5. Calorie floors
- **What it does.** Coached programs never go below a floor.
- **How it works.**
  - **Standard:** 1,200 kcal/day.
  - **Low:** individual, "based on the lowest levels of protein, fat, and carbohydrate required to maintain basic physiological functions for moderate periods". **The formula is not published.**
  - **None:** opt-out, with a warning.
  - Collaborative programs have no floor.

  [KB#34](https://help.macrofactorapp.com/en/articles/34-what-are-the-different-program-options-in-coached-mode) [official]; [KB#91](https://help.macrofactorapp.com/en/articles/91-program-styles) [official]
- **UX pattern.** A wizard step with three options and a caution line.
- **Sources.** As above.
- **Confidence.** High (standard). Low (low floor).
- **Adapt for us.**
  - **Copy** standard and none.
  - **Change:** define "low" ourselves as `4·protein_low + 9·fat_floor + 4·50 g carbs` and label it as our own assumption. [inferred]
  - Our audience is mostly men, so the 1,200 floor rarely binds. Still surface it when it does: "your goal rate would need 1,050 kcal; you're at the floor, so expect slower loss".
- **Priority.** must

### B6. Macro programming
- **What it does.** Turns a calorie target into protein, fat and carbs.
- **How it works.**
  - Order: protein first; the remainder is split between fat and carbs by diet type. [KB#93](https://help.macrofactorapp.com/en/articles/93-balanced-macro-program) [official]
  - **Protein** scales with **fat-free mass** = bodyweight × the profile body-fat category. It depends on training type (none < cardio < lifting) and on the level the user picks (Low / Moderate / High / Extra). Weekly changes are only a gram or two as weight moves. [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official]; [KB#58](https://help.macrofactorapp.com/en/articles/58-change-your-body-fat-percentage) [official]
  - **Lifter values (g/kg FFM, updated Oct/Nov 2025)** [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) [official]. Values for non-lifters and cardio-only users are **not published**.

    | Goal | Low | Moderate | High | Extra |
    |---|---|---|---|---|
    | Bulking or maintaining | 1.75 | 2.35 | 2.75 | 3.1 |
    | Cutting | 2.0 | 2.5 | 3.0 | 3.5 |

  - **Fat floor (published):** `fat_min_g = 30 + 0.5 × (height_cm − 150)`; under 150 cm use 30 g. General range 20–35 % of energy. [KB#78](https://help.macrofactorapp.com/en/articles/78-how-much-dietary-fat-should-you-eat) [official]
  - **Diet types** [KB#34](https://help.macrofactorapp.com/en/articles/34-what-are-the-different-program-options-in-coached-mode) [official]; [KB#86](https://help.macrofactorapp.com/en/articles/86-keto-macro-program) [official]:
    - **Balanced:** non-protein calories split evenly between fat and carbs.
    - **Low-fat:** prioritises carbs; fat never below the floor.
    - **Low-carb:** "tends to cap carbs at ~30 % of calories or <200 g".
    - **Keto:** a low carb ceiling ("allows fibre + a bit of flexibility"; the number is **not published**).
    - The fat:carb ratio is kept as calories change, except keto.
  - **Very low calories, priority order:** fat floor first, then protein, then carbs. [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]; [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official]
  - Fibre counts within carbs on the dashboard; net carbs are visible in the day summary. [KB#86](https://help.macrofactorapp.com/en/articles/86-keto-macro-program) [official]
- **UX pattern.** Wizard steps: diet type → calorie floor → training type → calorie shifting → protein level → "Get program" preview → Start. Users can edit an existing program (protein, carb/fat split, shifting) without creating a new one. [KB#34](https://help.macrofactorapp.com/en/articles/34-what-are-the-different-program-options-in-coached-mode) [official]; [KB#243](https://help.macrofactorapp.com/en/articles/243-edit-a-macro-program) [official]
- **Sources.** As cited.
- **Confidence.** High for the lifter table and the fat floor. Low for keto, low-fat ratios and non-lifter protein.
- **Adapt for us.** **Copy** the lifter table, the fat floor, the priority order, and balanced / low-fat / low-carb. Default to lifter, High.
- **Priority.** must

### B7. Calorie shifting, weekly budget, rollover
- **What it does.** Higher days on chosen weekdays (training days, Saturday social) within the same weekly budget.
- **How it works.**
  - Coached shifting is "quite modest" by default; **the cap is not published**. For aggressive shifting, use Collaborative. [KB#34](https://help.macrofactorapp.com/en/articles/34-what-are-the-different-program-options-in-coached-mode) [official]
  - **Rollover / overage payback** is deliberately *not* automatic. It is possible in Collaborative mode: lock days, edit today to match actual intake, and the rest redistributes. They warn this risks "binge-restrict" patterns. [KB#108](https://help.macrofactorapp.com/en/articles/108-how-to-adjust-calorie-targets-to-account-for-overages-or-to-roll-over-unused-calories) [official]
  - **No refeed, diet-break or carb-cycling modes:** the evidence is insufficient and existing tools cover them. [KB#30](https://help.macrofactorapp.com/en/articles/30-does-macrofactor-support-refeeds-diet-breaks-or-carb-cycling) [official]
- **UX pattern.** A weekday picker for high days; a weekly bar view of daily targets.
- **Sources.** As above.
- **Confidence.** Med.
- **Adapt for us.**
  - **Copy** shifting tied to the *training schedule* we already know. Cap the shift (+10 % default, +20 % max on high days) and label the cap as ours. [inferred]
  - **Skip** rollover.
- **Priority.** should

### B8. Weekly check-in screen and coaching modules
- **What it does.** A weekly ritual on a user-chosen weekday (Coached and Collaborative only).
- **How it works.** "MF Coach" assembles curated modules in this order [KB#247](https://help.macrofactorapp.com/en/articles/247-introduction-to-check-ins-and-coaching-modules) [official]:
  1. **Partial Logging.** Lists suspiciously low days; the user ticks the ones to exclude. [KB#248](https://help.macrofactorapp.com/en/articles/248-coaching-module-partial-logging) [official]
  2. **Weigh-In.** Shown if there is no weight entry in the last 3 days plus today; offers to log one now. [KB#249](https://help.macrofactorapp.com/en/articles/249-coaching-module-weigh-in) [official]
  3. **Fasting.** For unlogged, unflagged days: "mark as fasted (0 kcal) or leave unlogged (skipped)". [KB#250](https://help.macrofactorapp.com/en/articles/250-coaching-module-fasting) [official]
  4. **Logging Break.** Explains pauses and when updates resume.
  5. **Program Update.** Shows the new targets.

  Each module: intro explaining *why now* → optional explanation → clarifying question → action → done screen with "never show this module again". Users can toggle modules (More → Strategy) or enable **Fast Check-In** (one tap, no modules). Declining a check-in keeps the current targets. The check-in day can be changed freely. [KB#124](https://help.macrofactorapp.com/en/articles/124-change-your-check-in-day) [official]
- **UX pattern.** Full-screen stepper; each module dismissible; data-quality fixes happen *before* the numbers.
- **Sources.** https://help.macrofactorapp.com/en/articles/247-introduction-to-check-ins-and-coaching-modules [official] and module articles 248–250 [official].
- **Confidence.** High.
- **Adapt for us.** **Copy** the module logic and order, but deliver it through the assistant (assistant-first):
  - The deterministic engine produces a `CheckInPlan`: modules, questions and the proposed targets.
  - The assistant asks the questions conversationally.
  - The user's answers feed the engine.
  - Then the assistant explains the delta.
  - Keep a "Fast check-in" button. [inferred]
- **Priority.** must

### B9. Edge-case playbooks (no special modes)
- **What it does.** Answers to "how do I do X" through existing tools.
- **How it works.**
  - **Diet break:** switch to maintenance, or eat at expenditure. [KB#30](https://help.macrofactorapp.com/en/articles/30-does-macrofactor-support-refeeds-diet-breaks-or-carb-cycling) [official]
  - **Deload week:** eat at expenditure without changing the goal, so the progress chart is preserved. [KB#210](https://help.macrofactorapp.com/en/articles/210-what-should-i-do-if-my-activity-levels-change-drastically) [official]
  - **Illness:** eat as you wish; holding handles it. [KB#110](https://help.macrofactorapp.com/en/articles/110-how-frequently-do-i-need-to-log-my-nutrition-for-the-expenditure-algorithm-and-weekly-coaching-updates) [official]
  - **Hard deadline:** edit the rate weekly. [KB#202](https://help.macrofactorapp.com/en/articles/202-what-should-i-do-if-i-m-pursuing-a-goal-with-a-strict-timeline) [official]
  - **Creatine or a carb switch:** skip 1–2 check-ins. [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]
- **UX pattern.** Knowledge-base articles. There is no in-app guidance.
- **Confidence.** High.
- **Adapt for us.** **Change:** these become assistant skills that recognise the situation from chat or logs and propose the action. This is a clear advantage over a static KB. [inferred]
- **Priority.** should

### B10. Goal completion and Goal Progress view
- **What it does.** Shows progress and decides when a goal is complete.
- **How it works.**
  - Goals complete on **scale weight** by default.
  - When the scale hits the target, the app offers to continue until **trend weight** hits it (added in v1.2.8).

  [MM Feb 2022](https://macrofactor.com/mm-february-2022/) [official]; [Goal features](https://macrofactor.com/goal-features/) [official]
- **UX pattern.**
  - **Waterfall chart:** week 0 = goal size; each bar = that week's progress (light = toward the goal, dark = away); a grey remaining bar.
  - **Maintenance:** a dial.
  - **Celebration:** confetti, and since May 2026 a hidden mini-game. [KB#22](https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard) [official]; [MM May 2026](https://macrofactor.com/mm-may-2026/) [official]
- **Confidence.** High.
- **Adapt for us.**
  - **Copy** completion on trend weight. It is the honest version, so default to it.
  - **Copy** the waterfall as an indicator detail chart.
  - **Skip** confetti and the mini-game: they clash with our "calm, no confetti" brand.
- **Priority.** should

---

## C. Weight trend presentation

### C1. Trend weight vs scale weight
- **What it does.** A smoothed "true weight" line drawn over raw weigh-ins.
- **How it works.**
  - Missing days are filled by **linear interpolation**. Example: Mon 151, Tue missing, Wed 150 → Tue 150.5.
  - The trend is "a moving average … that places greater emphasis on more recent weigh-ins", over "a fairly long time scale".
  - **Constants are not published.**

  [KB#21](https://help.macrofactorapp.com/en/articles/21-weight-trend) [official]; [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]

  Other points:
  - Recommended weighing: daily, or at least 3×/week. The minimum for updates is 1 per 7 days. [KB#109](https://help.macrofactorapp.com/en/articles/109-how-frequently-do-i-need-to-log-my-weight-for-the-expenditure-algorithm-and-weekly-coaching-updates) [official]
  - Interpolation error is usually under 1 %. A missing day is "rarely more than 5 %" from the surrounding days. [KB#110](https://help.macrofactorapp.com/en/articles/110-how-frequently-do-i-need-to-log-my-nutrition-for-the-expenditure-algorithm-and-weekly-coaching-updates) [official]; [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]
  - Because the trend looks back, it sits *above* scale weight on a cut and *below* it on a bulk. They present it as closer to "true" weight. [KB#21](https://help.macrofactorapp.com/en/articles/21-weight-trend) [official]
  - Scale weight entries can include a body-fat % from the scale. [KB#15](https://help.macrofactorapp.com/en/articles/15-log-your-weight) [official]
- **UX pattern.**
  - Weight Trend page: a pale scale-weight line plus a deep-purple trend line; "Current Trend" headline.
  - The dashboard "Scale Weight" tile has a 7-day sparkline.
  - Trend weight is also on the Apple Watch and inside the Workouts app. [KB#271](https://help.macrofactorapp.com/en/articles/271-how-to-view-your-trend-weight-on-the-watch-app) [official]; [KB#278](https://help.macrofactorapp.com/en/articles/278-weight-trend-workouts) [official]
- **Sources.** https://help.macrofactorapp.com/en/articles/21-weight-trend [official] · https://help.macrofactorapp.com/en/articles/109-how-frequently-do-i-need-to-log-my-weight-for-the-expenditure-algorithm-and-weekly-coaching-updates [official]
- **Confidence.** High (method class). Low (constants).
- **Adapt for us.**
  - **Copy:** interpolation + EMA α = 0.10, calibrated in §G.6.
  - **Copy:** the "trend vs scale" chart pattern.
  - **Add:** an input sanity check. If an entry differs from the trend by more than 5 %, ask "Did you mean 90.0?" (inferred from the 5 % statement). This catches typos without inventing outlier rejection, which MacroFactor does not describe. [inferred]
- **Priority.** must

### C2. Change rate, implied deficit and the Energy Balance view
- **What it does.** Answers "how fast am I moving, and am I really in a deficit?"
- **How it works.**
  - **Change rate** = change in trend over 20 days, expressed per week. [KB#19](https://help.macrofactorapp.com/en/articles/19-change-rate) [official]
  - **Energy Balance widget**, 30 days, two views [KB#225](https://help.macrofactorapp.com/en/articles/225-understanding-the-widgets-at-the-top-of-the-dashboard) [official]:
    - *Targets* view: blue intake bars against a yellow dotted target line, with "avg intake − avg target = difference".
    - *Expenditure* view: intake against an orange dotted expenditure line, with "avg intake − avg expenditure".
  - **How to read it** [KB#224](https://help.macrofactorapp.com/en/articles/224-interpreting-the-energy-balance-widget) [official]:
    - Over target but still in a deficit means "you could be doing better, but you're already doing great".
    - Overshooting most days because of hunger means the goal is probably too aggressive.
    - On plan five days but over at weekends: a social-eating strategy problem.
  - **"Nutrition & Targets" weekly bars.** A grey target tick turns black (light mode) or white (dark mode) when reached. Toggle between consumed and remaining. **No red, ever**; showing overages is opt-in. [KB#22](https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard) [official]; [KB#53](https://help.macrofactorapp.com/en/articles/53-opt-into-displaying-calorie-and-macro-overages) [official]
- **UX pattern.** Swipeable top-of-dashboard widgets; "Insights & Analytics" tiles for Expenditure, Weight Trend and Goal Progress.
- **Sources.** As cited.
- **Confidence.** High.
- **Adapt for us.**
  - **Copy** the Energy Balance logic. It is the best "is the plan working?" audit in the teardown and maps to an indicator.
  - **Change:** show it as one glanceable status ("Deficit ~410 kcal/day · on pace") with the chart in the detail view, per PRODUCT.md. [inferred]
- **Priority.** must

### C3. Weight Trend V2 (beta, July 2026) and Period Weight Trend (roadmap)
- **What it does.** A new trend that "can revise past weigh-ins as new data comes in and reduce lag". The user picks the source: weight data only, goal rate only, or blended. It carries an "Experimental" label. [MM Jul 2026](https://macrofactor.com/mm-july-2026/) [official]
- **How it works.** Not documented; there is no help article. Retroactive revision implies a two-sided smoother rather than a one-sided filter. "Goal rate" or "blended" implies the goal rate is used as a prior on the slope. [inferred]. Period-aware trending is on the 2026–27 roadmap. [MM Sept 2026](https://macrofactor.com/mm-sept-2026/) [official]
- **UX pattern.** A settings choice with three sources.
- **Confidence.** Low (beta, unpublished).
- **Adapt for us.** **Skip for now**; revisit once documented. Note that a goal-rate prior makes the trend partly self-fulfilling.
- **Priority.** later

### C4. Outlier and water guidance (behavioural, not algorithmic)
- **What it does.** Tells users how to treat bloat days.
- **How it works.** Logging every day is recommended, even when bloated. Weighing in a non-judgemental context is framed as therapeutic. Skipping "unrepresentative" days is allowed. A +7 lb holiday bump still +1–2 lb a week or two later is probably real gain. [KB#209](https://help.macrofactorapp.com/en/articles/209-should-i-still-log-my-weight-if-i-feel-like-i-m-bloated-constipated-or-retaining-water) [official]
- **UX pattern.** Help-centre copy only.
- **Confidence.** High.
- **Adapt for us.** **Copy the stance:** neutral, "log it anyway". The assistant can reassure using the user's own numbers ("trend moved 0.1 kg; scale moved 1.6 kg").
- **Priority.** should

---

## D. Food logging

### D1. Food Logging Speed Index (FLSI) results and method
- **What it does.** MacroFactor's own benchmark: the number of discrete actions (taps, selections) needed to complete four standard tasks.
- **How it works.** [FLSI 2025](https://macrofactor.com/fastest-food-logger-2025/) [official]; [MM Sept 2025](https://macrofactor.com/mm-sept-2025/) [official]; [FLSI 2022](https://macrofactor.com/fastest-food-logger/) [official]
  - **Four test cases, scored from start screen to end screen, lower is better:**
    1. **Search:** Greek yogurt + honey, each with a *non-default* serving and a *non-default three-digit* quantity. "Strong" is under 17.
    2. **Multi-add:** banana + peanut butter at default servings. Strong is under 9.
    3. **Barcode:** one item with a non-default serving and a three-digit quantity. Strong is under 9.
    4. **Quick-add:** an arbitrary calorie value. Strong is under 8.
  - **Rules:** the fastest settings per case; the shortest path even if non-obvious; no gimmick gestures; premium tiers used.
  - **"Freebies" not counted:** scrolling to the start point, autocomplete taps, extra submit taps.
  - **2025 results (21 apps):**

    | | Search | Multi-add | Barcode | Quick-add | Total |
    |---|---|---|---|---|---|
    | MacroFactor (speed mode) | 10 | 6 | 5 | 3 | **24** (2022 benchmark: 26) |
    | MacroFactor (context mode) | 13 | 6 | 6 | 3 | — |

    Other totals:
    - MyNetDiary 30, LoseIt 32
    - Fitatu 35, Nutracheck 35
    - FitGenie 36, MyFitnessPal 36
    - Carbon 39, Cronometer 40
    - MyMacros+ 41, Lifesum 41
    - Cal AI 45, FatSecret 45, MyDietCoach 45
    - Food Noms 46, Avatar 48
    - Carb Manager 49, Yazio 49
    - Foodvisor 50, Noom 50
    - 1st Phorm 52

    The best competitor needs **25 % more actions**; the average entrant about **70 % more**. Totals were read from the published chart (https://macrofactor.com/wp-content/uploads/2025/09/Final-results.png) [official].
  - **Caveat:** the index is self-designed and self-scored. MacroFactor acknowledges the bias. RP Diet was excluded. [FLSI 2022](https://macrofactor.com/fastest-food-logger/) [official]
- **UX pattern.** n/a (a benchmark).
- **Confidence.** High that these are MacroFactor's published numbers. Med for neutrality.
- **Adapt for us.**
  - **Copy the method as our QA gate.** Write the four FLSI cases as Playwright scripts that count actions. Our targets: search ≤ 10, multi-add ≤ 6, quick-add ≤ 3, AI-describe ≤ 4.
  - This turns "logging is sacred" into a number agents can regress-test. [inferred]
- **Priority.** must

### D2. Plate-based unified logger (speed vs context mode)
- **What it does.** Every logging method (scan, search, quick add, library, Describe, AI photo) feeds one staging "plate". The user can switch methods mid-meal and log everything at once. [KB#215](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor) [official]; [New food logger](https://macrofactor.com/new-food-logger/) [official]
- **How it works.**
  - Two buttons: **Add** (to the plate) and **Log Foods** (logs plate + current item). After an add, the search box resets so the user can type the next query immediately.
  - A **minified plate** of food icons under the macro banner; the **Nutrition Banner** swipes between plate totals and day-remaining.
  - A custom serving keypad. Up to two favourite units pinned.
  - A calendar icon logs to any date and hour.
  - **Speed mode** (default): select → detail sheet → back to search. **Context mode:** jumps to the plate after each pick.

  [KB#45](https://help.macrofactorapp.com/en/articles/45-food-logging-style) [official]; [KB#219](https://help.macrofactorapp.com/en/articles/219-how-to-configure-your-food-logger) [official]
  - Average user: logger opened **4–6×/day**. [New food logger](https://macrofactor.com/new-food-logger/) [official]
- **UX pattern.**
  - Launch points: home-screen widgets, app-icon long-press, a configurable toolbar, the central "+" quick-actions button, and a "+" next to each hour on the timeline.
  - Shortcuts sheet: 1–14 shortcuts, colour-coded. [MM Nov 2025](https://macrofactor.com/mm-nov-2025/) [official]
- **Sources.** As cited.
- **Confidence.** High.
- **Adapt for us.**
  - **Copy** the plate + Add/Log split and the auto-reset search.
  - **Copy** the custom keypad with favourite units.
  - **Copy** speed mode only.
  - On web: a global keyboard shortcut and a persistent "+" next to Start Workout. [inferred]
- **Priority.** must

### D3. Search ranking, history, hourly go-tos, favourites, multi-add
- **What it does.** Makes repeat foods 1–2 taps.
- **How it works.** [KB#215](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor) [official]; [KB#257](https://help.macrofactorapp.com/en/articles/257-favorite-foods) [official]; [KB#40](https://help.macrofactorapp.com/en/articles/40-multi-add-foods) [official]; [KB#49](https://help.macrofactorapp.com/en/articles/49-delete-a-food-from-your-hourly-go-tos) [official]; [KB#46](https://help.macrofactorapp.com/en/articles/46-food-search-database) [official]
  - **Before typing**, the screen shows:
    - Favourites (horizontal row; each saved *with* a serving size; one tap adds it).
    - **Hourly go-tos**: "1 pm go-tos = foods most commonly logged ~12–3 pm, extra weight on 1–2 pm, by recency and frequency"; each can be deleted.
    - "Latest" (most recent).
  - **Typed results** are grouped **From History → Custom → Common → Branded**, with "+N more" expanders per group.
  - The **multi-add "+"** on each result tile adds the remembered last serving with no detail screen.
  - Search is typo-tolerant, 2–4× faster than the legacy database, and shows macros in the results.
- **UX pattern.** Grouped result lists; a "+" on the right of each tile; favourites carousel.
- **Confidence.** High.
- **Adapt for us.**
  - **Copy all of it.**
  - Hourly go-tos are a pure function over the user's own log history, so they need no backend.
  - Score suggestion: `freq × recency decay × hour-proximity weight`; the exact weights are ours. [inferred]
- **Priority.** must

### D4. Barcode, label scanner, Open Food Facts submissions
- **What it does.** Scan packaged foods. If a barcode isn't found, the label scanner reads the nutrition panel.
- **How it works.**
  - The label scanner auto-opens on a barcode miss. Originally US/Canada-optimised; multi-format and multi-language since July 2026. [KB#213](https://help.macrofactorapp.com/en/articles/213-label-scanner) [official]; [MM Jul 2026](https://macrofactor.com/mm-july-2026/) [official]
  - **Custom foods can carry a barcode.** [KB#25](https://help.macrofactorapp.com/en/articles/25-how-robust-is-the-database-coverage-in-my-region) [official]
  - **Open Food Facts submissions** need brand, name, barcode, serving and macros. Submissions are auto-validated (their example: 100 kcal with 300 g protein is rejected). [KB#246](https://help.macrofactorapp.com/en/articles/246-how-to-submit-new-or-updated-foods) [official]
  - 300k+ community OFF contributions in 2025; OFF results can be enabled in search. [MM Sept 2025](https://macrofactor.com/mm-sept-2025/) [official]
  - "Import with AI" builds a custom food from a front-of-pack photo plus a label photo. [KB#246](https://help.macrofactorapp.com/en/articles/246-how-to-submit-new-or-updated-foods) [official]
- **UX pattern.** Scan tab with a Barcode/Label toggle; automatic fallback on a miss.
- **Confidence.** High.
- **Adapt for us.**
  - **Change:** on web, use the Open Food Facts API (free, ODbL, the source MacroFactor itself credits on the App Store) for barcode lookup. The Chrome `BarcodeDetector` API is not on iOS Safari, so a JS decoder library is needed there. [inferred]
  - Label scanning maps cleanly to Claude vision.
  - **Copy** the macro sanity validation: `|4P + 4C + 9F + 7A − kcal| / kcal > 20 %` → warn. Threshold is ours. [inferred]
- **Priority.** should

### D5. Quick add, Edit Day, log by calories/macros
- **What it does.** Logs numbers without a food.
- **How it works.**
  - **Quick Add:** kcal, protein, fat, carbs, alcohol, optional name. Calories auto-compute from the macros and can be overridden. Not searchable later; "copy to custom" converts it. [KB#41](https://help.macrofactorapp.com/en/articles/41-quick-add-calories-and-macros-to-your-food-log) [official]
  - **Edit Day:** sets the day total directly. It overrides the food log, because manual entries have top priority. [KB#39](https://help.macrofactorapp.com/en/articles/39-quick-edit-your-nutrition-for-a-full-day) [official]
  - **Log by Calories/macros:** pick a food, type "400 kcal" or "30 g protein", and the serving size is solved for you. [10 features](https://macrofactor.com/10-macrofactor-features/) [official]
- **UX pattern.** A Quick Add tab on the plate; Edit Day in the + menu.
- **Confidence.** High.
- **Adapt for us.** **Copy all three.** Quick Add at 3 actions is the FLSI floor. Log-by-macro is ideal for protein powder. [inferred]
- **Priority.** must

### D6. AI: Describe (text or voice) and photo logging
- **What it does.** Natural-language and photo logging that lands on the plate for review.
- **How it works.**
  - **Describe** queries a *common-foods* database, not branded items. It handles quantities well ("100 g tomato sauce", "500-calorie bean burrito") but struggles with compound descriptors. [KB#216](https://help.macrofactorapp.com/en/articles/216-log-foods-with-describe) [official]
  - **Photo AI** (from spring 2025): Photo, Photo+Text, or Upload. It can return recipes with expandable ingredients and match branded packs.
  - Photo tips: top-down shot, a hand or object for scale, or a food scale in frame.

    [KB#258](https://help.macrofactorapp.com/en/articles/258-ai-food-logging) [official]
  - **May 2026 upgrade:** multiple photos plus text instructions (portions, exclusions, menus, receipts); the tab is simplified to **Snap** and **Describe**. [MM May 2026](https://macrofactor.com/mm-may-2026/) [official]; [10 features](https://macrofactor.com/10-macrofactor-features/) [official]
  - **AI never logs directly; review on the plate is always required.** [KB#215](https://help.macrofactorapp.com/en/articles/215-how-to-log-food-in-macrofactor) [official]
  - A reviewer still calls AI accuracy "controversial" and recommends weighing food. [Outlift](https://outlift.com/macrofactor-review/) [third-party]
- **UX pattern.** AI tab → result lands on the plate with editable quantities → Log.
- **Confidence.** High.
- **Adapt for us.** **Copy:** the plate-review step, matching to a common-foods table, and photo+text. We already ship Claude, so this is cheap. Store AI items with `source: 'ai'` and confidence so the engine can later discount suspicious days. [inferred]
- **Priority.** must

### D7. Custom foods, recipes and saved meals
- **What it does.** Personal food library.
- **How it works.**
  - Custom foods carry an icon and a barcode, and can be shared by deep link.
  - Recipes have ingredients, prep steps and servings. Ways to create one:
    - import from a URL (Jul 2025);
    - import from a cookbook or handwritten photo (Apr 2026);
    - create from foods already on the timeline.
  - Recipe actions:
    - **Explode:** log the ingredients separately and edit them.
    - **Prepare:** a cooking view.
    - **Save a meal:** a recipe used as a group.
  - Editing a recipe does not rewrite history.

  [KB#5](https://help.macrofactorapp.com/en/articles/5-create-and-add-a-custom-food) [official]; [KB#6](https://help.macrofactorapp.com/en/articles/6-create-and-add-a-custom-recipe) [official]; [KB#3](https://help.macrofactorapp.com/en/articles/3-explode-recipes) [official]; [KB#259](https://help.macrofactorapp.com/en/articles/259-import-recipes-from-link) [official]; [KB#398](https://help.macrofactorapp.com/en/articles/398-import-recipes-with-ai) [official]; [KB#239](https://help.macrofactorapp.com/en/articles/239-save-a-meal-for-later-use) [official]; [MM Apr 2026](https://macrofactor.com/mm-april-2026/) [official]
- **UX pattern.** "Library" tab with Favourites, Recipes and Custom; sort by name or date.
- **Confidence.** High.
- **Adapt for us.**
  - **Copy:** custom foods, saved meals (as recipes) and explode.
  - **Later:** URL and photo import (Claude can do both).
  - **Skip:** sharing (no accounts).
- **Priority.** should

### D8. Timeline instead of meal slots; copy/paste; pre-logging; notes
- **What it does.** Food is placed on a **24-hour timeline** by the hour it was eaten, not into Breakfast / Lunch / Dinner buckets. Rationale: "never decide whether your protein bar is lunch or a snack". [New food logger](https://macrofactor.com/new-food-logger/) [official]
- **How it works.**
  - The hour range is configurable (useful for intermittent fasting windows). Empty hours can be hidden. Hours can be collapsed to an icon row. Left/right alignment for handedness.
  - "Premove": tap a food, then tap the target hour.

    [KB#218](https://help.macrofactorapp.com/en/articles/218-how-to-configure-your-food-timeline) [official]; [KB#85](https://help.macrofactorapp.com/en/articles/85-intermittent-fasting) [official]
  - **Copy/paste targets:** an hour, Now, Today, Tomorrow, inline (the viewed day), multi-paste inline (keeps the clipboard), a date and time, or multiple dates. Select foods individually, a whole hour, or "Copy day". [KB#95](https://help.macrofactorapp.com/en/articles/95-copy-and-paste) [official]
  - Pre-logging is allowed. Daily notes can be colour-coded. [KB#208](https://help.macrofactorapp.com/en/articles/208-will-logging-food-to-a-future-day-affect-my-expenditure-and-coaching-recommendations) [official]; [KB#217](https://help.macrofactorapp.com/en/articles/217-add-notes-to-your-day) [official]
- **UX pattern.** A vertical hour list with "+" per hour. A collapsing week banner on top.
- **Confidence.** High.
- **Adapt for us.**
  - **Copy:** the timeline (a timestamp per entry, grouped by hour), plus Copy day / To dates / multi-paste.
  - It also gives us meal timing relative to the workout timestamp, for free. [inferred]
- **Priority.** must

### D9. Food database sourcing and verification
- **What it does.** Gives users data they can trust.
- **How it works.**
  - About **1.36 M verified items**. About **26,500 micronutrient-complete common foods**, much of it from the **NCC Food and Nutrient Database**.
  - Branded items come from human-verified submissions plus Open Food Facts. The legacy third-party database remains as a barcode and AI-Describe fallback.

    [KB#46](https://help.macrofactorapp.com/en/articles/46-food-search-database) [official]; [KB#25](https://help.macrofactorapp.com/en/articles/25-how-robust-is-the-database-coverage-in-my-region) [official]
  - **Barcode coverage** is strong in US, CA, UK, AU, IE, NZ, JP, FR and ES; Germany is improving. Restaurant coverage is weak. [KB#25](https://help.macrofactorapp.com/en/articles/25-how-robust-is-the-database-coverage-in-my-region) [official]
  - Common foods are usually raw weight, edible portion. [KB#24](https://help.macrofactorapp.com/en/articles/24-are-default-food-weights-for-cooked-or-raw-food) [official]
  - Licensed databases are MacroFactor's largest cost after salaries. [KB#115](https://help.macrofactorapp.com/en/articles/115-why-doesn-t-macrofactor-have-a-lifetime-subscription-tier-with-a-one-time-payment) [official]
- **UX pattern.** Icons rather than photos on food tiles; a "Common" vs "Branded" distinction in results.
- **Confidence.** High.
- **Adapt for us.**
  - **Change:** we can't license NCC cheaply. Use **USDA FoodData Central** (public domain) for common foods, Open Food Facts for branded, and the user's history first. [inferred]
  - Cache in IndexedDB rather than localStorage, because of size.
- **Priority.** should

### D10. Non-judgemental nutrition UI
- **What it does.** Removes shame signals.
- **How it works.** No red numbers, no warnings or pop-ups for going over. The rationale: penalising only overshoots biases logging and pushes everyone toward weight loss. Displaying overages is opt-in. [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]; [KB#53](https://help.macrofactorapp.com/en/articles/53-opt-into-displaying-calorie-and-macro-overages) [official]; [App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471) [official]
- **UX pattern.** Grey target ticks that turn neutral black or white when reached.
- **Confidence.** High.
- **Adapt for us.** **Copy.** It is the same as our "calm, not motivational" brand rule.
- **Priority.** must

---

## E. Other body data

### E1. Body metrics and progress photos
- **What it does.** Tracks circumference measurements and photos alongside weight.
- **How it works.**
  - Body Metrics covers scale weight, **24 body measurements**, a "Visual Body Fat" estimate, and progress photos (front, side, back, one each per day).
  - Users choose which metrics are visible. Compare-all-metrics between dates. Before/after maker with a background toggle and share sheet.
  - **Measurements are not used by the algorithm.**

  [KB#22](https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard) [official]; [KB#120](https://help.macrofactorapp.com/en/articles/120-how-to-log-body-measurements) [official]; [KB#121](https://help.macrofactorapp.com/en/articles/121-how-to-add-progress-photos) [official]; [KB#122](https://help.macrofactorapp.com/en/articles/122-how-to-view-body-measurement-progress-over-time) [official]; [KB#123](https://help.macrofactorapp.com/en/articles/123-how-to-create-and-share-before-and-after-photos) [official]; [KB#119](https://help.macrofactorapp.com/en/articles/119-configure-body-metric-and-progress-photo-tracking) [official]
- **UX pattern.** A "Body Metrics" tile → inner dashboard → Full Body / Progress Photo tiles.
- **Confidence.** High. The full list of the 24 measurement names was not retrieved.
- **Adapt for us.**
  - **Must:** waist, at minimum. Use it with trend weight to tell recomposition from stalls ("weight flat 3 weeks, waist −1.5 cm → recomp, not plateau"). MacroFactor does *not* do this; it is our differentiator (§F2).
  - **Later:** photos. localStorage is too small; photos need IndexedDB plus an export story. [inferred]
- **Priority.** must (waist) / later (photos)

### E2. Habits (logging consistency)
- **What it does.** A calendar of nutrition and weigh-in logging consistency; tap any day to edit. [KB#22](https://help.macrofactorapp.com/en/articles/22-get-to-know-your-dashboard) [official]
- **How it works.** Pure display of logged days. No streaks are mentioned. The App Store calls it a "Habit tracker". [App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471) [official]
- **UX pattern.** Calendar grid; also the entry point for back-filling.
- **Confidence.** High.
- **Adapt for us.** **Copy** as a data-completeness view, not streaks (our brand bans streaks). It doubles as the place to see why expenditure is "holding".
- **Priority.** should

### E3. Steps
- **What it does.** Daily steps via Apple Health / Health Connect or manual entry, with a chart. Used only by the optional step-informed modifier. [KB#255](https://help.macrofactorapp.com/en/articles/255-how-to-import-your-step-count) [official]
- **Confidence.** High.
- **Adapt for us.** **Later.** Web has no step source; a manual or CSV import could work.
- **Priority.** later

### E4. Period tracking
- **What it does.** A "Are you on your period?" toggle per day, for reference only. Insights are promised, and a period-aware weight trend is on the roadmap. [KB#17](https://help.macrofactorapp.com/en/articles/17-track-your-period) [official]; [MM Sept 2026](https://macrofactor.com/mm-sept-2026/) [official]
- **Confidence.** High.
- **Adapt for us.** **Should:** a simple flag. The assistant can then say "you're +1.2 kg on cycle day 2; this pattern recurs" rather than letting a check-in overreact. This is a gap MacroFactor hasn't closed. [inferred]
- **Priority.** should

### E5. Apple Health / Health Connect sync and source priority
- **What it does.** Imports weight, nutrition and steps; exports nutrition and weight (bidirectional since Aug 2024).
- **How it works.**
  - A separate source per data type. Connecting pulls **30 days of history**, then stays in sync.
  - **Fixed priorities:**
    - Weight: Manual > Apple Health / Health Connect.
    - Nutrition: Manual (Edit Day) > MacroFactor Food Log > Apple Health / Health Connect.
    - Steps: Manual > Health.
  - Any internal entry for a day blocks the sync for that day. Fitbit was removed. No offline mode beyond a cache.

  [KB#102](https://help.macrofactorapp.com/en/articles/102-integrations) [official]; [KB#56](https://help.macrofactorapp.com/en/articles/56-weight-or-nutrition-source-priority) [official]; [KB#65](https://help.macrofactorapp.com/en/articles/65-connect-health-connect-or-apple-health) [official]; [KB#28](https://help.macrofactorapp.com/en/articles/28-does-macrofactor-have-an-offline-mode) [official]
- **UX pattern.** More → Integrations, with a toggle per source.
- **Confidence.** High.
- **Adapt for us.**
  - **Copy the priority rule**: manual override > in-app log > import. We will need it for CSV imports from smart-scale apps.
  - **Native health sync:** later (a web app can't read HealthKit).
- **Priority.** should (priority rule) / later (sync)

### E6. Sleep (absent) and training (separate app)
- **What it does.** **MacroFactor nutrition does not track sleep.**
  - "Import Sleep" is the most-voted request: 14,390 votes, "Under Consideration", described as "Is your average time asleep correlated with your expenditure or your eating habits?" [Feature board](https://feedback.macrofactorapp.com/roadmap/feature-requests) [official]
  - Training lives in **MacroFactor Workouts** (launched Jan 2026). Workouts shows trend weight "for training context". [AR 2026](https://macrofactor.com/annual-report-2026/) [official]
  - KB#278 gives one cross-domain heuristic: if trend weight is decreasing while sets and volume drop and recovery slows or fatigue rises, "it could indicate that you are in a larger Calorie deficit than is appropriate for your training program". **No thresholds are given.** [KB#278](https://help.macrofactorapp.com/en/articles/278-weight-trend-workouts) [official]
- **Confidence.** High.
- **Adapt for us.** This is our core differentiator. Implement the KB#278 heuristic with explicit thresholds (§G.5) and add sleep as a recovery covariate. **There is no MacroFactor precedent for the sleep logic**, so it must come from other proven apps covered in other reports. [inferred]
- **Priority.** must

---

## F. Pricing, positioning, complaints and gaps

### F1. Pricing and positioning
- **Price.** $11.99/mo, $47.99 per 6 months, $71.99/yr. 7-day free trial; **no free tier**; ad-free. [App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471) [official]
- **Bundle with Workouts.** $89.99/yr; legacy subscribers get Workouts free until 12 Jan 2027. No lifetime plan, deliberately: per-user costs (licensed food databases, AI) recur. [KB#393](https://help.macrofactorapp.com/en/articles/393-how-macrofactor-subscriptions-and-bundles-work) [official]; [KB#115](https://help.macrofactorapp.com/en/articles/115-why-doesn-t-macrofactor-have-a-lifetime-subscription-tier-with-a-one-time-payment) [official]
- **Scale.** 600k users (Sept 2026); growth 35k (2022) → 90k → 185k → 400k → 600k. [AR 2026](https://macrofactor.com/annual-report-2026/) [official]
- **Ratings.** App Store 4.8 (≈23k ratings, checked 2026-10-16). Site claims 4.8 on Google Play from 16k+ reviews. [App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471) [official]; [MacroFactor home](https://macrofactor.com/macrofactor/) [official]
- **Positioning.**
  - "Macro plan based on your metabolism"; "fastest food logger"; "adherence-neutral, no shaming"; evidence-based, from the Stronger By Science team (Greg Nuckols, Jeff Nippard as co-owners).
  - Comparison pieces against MyFitnessPal (Oct 2025), Cal AI (Apr 2026) and Cronometer (Aug 2026).
  - A nonprofit research foundation is funded from profits.

  [AR 2026](https://macrofactor.com/annual-report-2026/) [official]; [MM Apr 2026](https://macrofactor.com/mm-april-2026/) [official]; [MM Aug 2026](https://macrofactor.com/mm-august-2026/) [official]
- **Adapt for us.** Our users already pay for this kind of app (the PRODUCT.md audience). Positioning: "MacroFactor's engine, plus a coach that also sees your training and sleep". [inferred]

### F2. Complaints and gaps, and how we could do better

Reddit could not be read directly (see the access note at the top). The evidence below is the official feature board's votes, MacroFactor's own FAQ (each FAQ exists because the question recurs), and two third-party reviews.

| # | Complaint / gap | Evidence | Our response | Priority |
|---|---|---|---|---|
| 1 | **No sleep data** | #1 request, 14,390 votes [Feature board](https://feedback.macrofactorapp.com/roadmap/feature-requests) [official] | Sleep log (manual first) as a recovery covariate in the judgment layer | must |
| 2 | **Nutrition and training split across two paid apps**; one vague cross-domain heuristic | [KB#278](https://help.macrofactorapp.com/en/articles/278-weight-trend-workouts) [official]; [KB#393](https://help.macrofactorapp.com/en/articles/393-how-macrofactor-subscriptions-and-bundles-work) [official]; GainFrame: "not a coach — doesn't assess physique progress or training" [third-party](https://gainframe.app/blog/macrofactor-review/) | One engine with strength-trend × weight-trend × sleep rules (§G.5) | must |
| 3 | **"Calories seem low" / slow bulking increases**, especially for lean or tall users | Recurring FAQs [KB#206](https://help.macrofactorapp.com/en/articles/206-what-should-i-do-if-my-initial-expenditure-or-recommended-energy-intake-seems-too-high-or-too-low) [official]; V3 fixed the asymmetric bias [V3](https://macrofactor.com/expenditure-v3/) [official]; reader reports continue in 2025–26 [Outlift](https://outlift.com/macrofactor-review/) [third-party] | Symmetric constant from day 1; derive sessions/week from training logs; show calibration progress honestly | must |
| 4 | **Confusing counter-intuitive changes**: "I went over and my calories went up"; 3-kcal changes | [Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/) [official]; [KB#222](https://help.macrofactorapp.com/en/articles/222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal) [official] | The assistant explains every delta in one sentence using the user's own numbers | must |
| 5 | **Partial logging silently corrupts expenditure** | [KB#241](https://help.macrofactorapp.com/en/articles/241-what-is-partial-logging) [official] | Detect daily, not just weekly; ask in context ("Tuesday looks incomplete") | must |
| 6 | **Water-weight events** (creatine, carb switches, cycle) mislead for about 2 weeks; the fix is manual ("skip check-ins") | [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure) [official]; period trend still on the roadmap [MM Sept 2026](https://macrofactor.com/mm-sept-2026/) [official]; Outlift reader on the cycle [third-party] | Event flags (creatine start, carb change, period) → assistant proposes a paused check-in automatically | should |
| 7 | **Slow to price in big activity changes** (3–4 weeks) | [KB#210](https://help.macrofactorapp.com/en/articles/210-what-should-i-do-if-my-activity-levels-change-drastically) [official] | Use known training-volume changes as a *confidence* signal, the same way MacroFactor uses steps | later |
| 8 | **Milestones/sub-goals; weigh-in reminders** | 7,050 and 6,739 votes [Feature board](https://feedback.macrofactorapp.com/roadmap/feature-requests) [official] | Milestones as calm checkpoints (no confetti); optional weigh-in reminder | should |
| 9 | **Meal planning, recurring meals, meal suggestions** | 6,777 / 5,892 / 5,225 votes [Feature board](https://feedback.macrofactorapp.com/roadmap/feature-requests) [official] | The assistant suggests meals to fill remaining macros from the user's own history | later |
| 10 | **No web app** (planned); no real offline mode | 5,337 votes [Feature board](https://feedback.macrofactorapp.com/roadmap/feature-requests) [official]; [KB#28](https://help.macrofactorapp.com/en/articles/28-does-macrofactor-have-an-offline-mode) [official] | We are web-native and local-first by design | n/a (advantage) |
| 11 | **No free tier / price** | "most common complaint in reviews" [GainFrame](https://gainframe.app/blog/macrofactor-review/) [third-party]; pricing [App Store](https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471) [official] | Business decision, out of scope here | — |
| 12 | **AI logging accuracy**; sparse micronutrients on branded foods | [Outlift](https://outlift.com/macrofactor-review/) [third-party]; [10 features](https://macrofactor.com/10-macrofactor-features/) [official] | Always review on the plate; tag AI items | must |
| 13 | **No social features** | [Outlift](https://outlift.com/macrofactor-review/) [third-party] | Skip; off-brand for us | skip |

---

## G. Algorithm spec we can implement

Every constant is tagged:
- **PUB**: published by MacroFactor; the source is given.
- **CAL**: our value, *calibrated to reproduce* a published MacroFactor behaviour (§G.6).
- **OURS**: our assumption, where MacroFactor publishes nothing.

### G.1 Constants

| Constant | Value | Tag | Source / note |
|---|---|---|---|
| `RHO` energy density of weight change | **7,716 kcal/kg** (3,500 kcal/lb), same for gain and loss | PUB | [V3](https://macrofactor.com/expenditure-v3/) |
| `INTERP` missing weigh-in fill | linear between neighbouring weigh-ins | PUB | [KB#21](https://help.macrofactorapp.com/en/articles/21-weight-trend) |
| `TREND_ALPHA` EMA smoothing of daily weight | **0.10** | CAL | Fits the KB#209 impulse experiment (§G.6); MacroFactor's own constant is unpublished |
| `RATE_WINDOW` trend-slope window | **20 days** | PUB | [KB#19](https://help.macrofactorapp.com/en/articles/19-change-rate) |
| `INTAKE_WINDOW` intake averaging window | **21 days** | PUB | [KB#241](https://help.macrofactorapp.com/en/articles/241-what-is-partial-logging), [KB#208](https://help.macrofactorapp.com/en/articles/208-will-logging-food-to-a-future-day-affect-my-expenditure-and-coaching-recommendations) |
| `K_STEADY` daily gain toward observed TDEE | **0.10** | CAL | §G.6 (impulse fit; stability ≈ 6.5 kcal/day vs published 7.25) |
| `K_WARMUP` gain during calibration | **0.20** | OURS | Reflects "larger daily adjustments while confidence ramps up"; gives 50–150 kcal overshoot ([KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure)) |
| `HOLD_DAYS` initial hold | **7 days** | PUB (qualitative) | "starts moving after a week" ([Algorithms & philosophy](https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/)) |
| `WARMUP_END` | **day 28** | OURS | Inside the published 14–30 day range |
| `MIN_NUTRITION_DAYS_7` | **4 of 7** | PUB | [KB#74](https://help.macrofactorapp.com/en/articles/74-expenditure-version) |
| `MIN_WEIGHINS_7` | **1 of 7** | PUB | [KB#74](https://help.macrofactorapp.com/en/articles/74-expenditure-version) |
| `RESUME_DAYS` consecutive complete days to unpause | **3** | PUB | [MM Oct 2024](https://macrofactor.com/mm-october-2024/) |
| `PARTIAL_RATIO` partial-day flag | intake > 0 and < **0.5 ×** median of complete days in the last 21 | OURS | MacroFactor's example: 500 vs 2,000 ([KB#248](https://help.macrofactorapp.com/en/articles/248-coaching-module-partial-logging)) |
| `WEIGHT_SANITY` confirm-entry threshold | ±**5 %** from current trend | OURS (inferred) | From "rarely more than 5 %" ([KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure)) |
| `WEIGH_IN_PROMPT` | no weigh-in in last 3 days + today | PUB | [KB#249](https://help.macrofactorapp.com/en/articles/249-coaching-module-weigh-in) |
| `GOAL_PRED_FACTOR` | **4 ×** Δ(rate, fraction/wk) | PUB | [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) |
| `GOAL_PRED_RAMP` | **14 days**, linear | PUB (≈) / OURS (shape) | "over the course of a couple of weeks" |
| `MAINT_BAND` | **±0.68 kg** of trend weight | PUB | [KB#125](https://help.macrofactorapp.com/en/articles/125-how-does-dynamic-maintenance-work-in-macrofactor) |
| `MAINT_NUDGE` | **0.15 %** bodyweight/wk | PUB | [KB#125](https://help.macrofactorapp.com/en/articles/125-how-does-dynamic-maintenance-work-in-macrofactor) |
| `FLOOR_STANDARD` | **1,200 kcal/day** | PUB | [KB#34](https://help.macrofactorapp.com/en/articles/34-what-are-the-different-program-options-in-coached-mode) |
| `FLOOR_LOW` | 4·protein(low) + 9·fat_min + 4·50 | OURS | MacroFactor: "individual", formula unpublished |
| `FAT_MIN_G(h)` | `h < 150 ? 30 : 30 + 0.5·(h − 150)` | PUB | [KB#78](https://help.macrofactorapp.com/en/articles/78-how-much-dietary-fat-should-you-eat) |
| `PROTEIN_G_PER_KG_FFM` (lifters) | see table in B6 | PUB | [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/) |
| `LOWCARB_CAP` | carbs ≤ min(30 % kcal, 200 g) | PUB (≈) | [KB#34](https://help.macrofactorapp.com/en/articles/34-what-are-the-different-program-options-in-coached-mode) |
| `KETO_CARB_G` | **30 g** | OURS | MacroFactor unpublished |
| `LOWFAT_FAT_SHARE` | 25 % of non-protein kcal (≥ fat floor) | OURS | MacroFactor: "prioritizes carbs" |
| `WEEKLY_TARGET_CAP` | max(100, 5 %·TDEE) kcal/day change per check-in, waived for the first 28 days, for new programs and for goal changes | OURS | MacroFactor's smoothing formula is unpublished ([KB#23](https://help.macrofactorapp.com/en/articles/23-how-do-i-adjust-my-macro-targets)) |
| `SHIFT_DEFAULT / SHIFT_MAX` | +10 % / +20 % on high days | OURS | MacroFactor: "quite modest" |
| Activity factor | General 1.2 / 1.4 / 1.6 + exercise 0 / 0.1 / 0.2 / 0.3 | PUB | MacroFactor image (A2) |
| BMR equations | see A2 | PUB | [MacroFactor BMR](https://macrofactor.com/macrofactors-bmr/) |
| Cut / bulk rate tables | see B2 | PUB | [Cutting](https://macrofactor.com/cutting-calculator/), [Bulking](https://macrofactor.com/bulking-calculator/) |

### G.2 Data model (fields an agent should create)

```ts
type DayStatus = 'complete' | 'partial' | 'fasting' | 'unlogged';

interface Profile {
  sex: 'male' | 'female'; birthDate: string; heightCm: number;
  bodyFatPct?: number;              // or category midpoint
  generalActivity: 'low' | 'moderate' | 'high';
  sessionsPerWeek: number;          // derive from workout log when available
  isAthlete: boolean;               // >= 7 h/wk intense exercise
  trainingStatus: 'beginner' | 'intermediate' | 'experienced'; // derive from e1RM trend
  peakWeightKg?: number;
  manualInitialTdee?: number;
  expenditureStartDate: string;     // reset = "fresh start" (KB#61)
  checkInWeekday: 0..6;
}
interface WeightEntry { date: string; kg: number; bodyFatPct?: number; source: 'manual' | 'import'; }
interface FoodEntry  { id: string; eatenAt: string /* ISO, hour bucket derived */; name: string;
  source: 'history' | 'custom' | 'common' | 'branded' | 'quickAdd' | 'ai' | 'dayOverride';
  qty: number; unit: string; grams?: number; kcal: number; p: number; f: number; c: number; alcohol?: number;
  fiber?: number; recipeId?: string; aiConfidence?: number; }
interface DayFlags { date: string; fasting?: boolean; partial?: boolean /* user-confirmed */; period?: boolean;
  events?: ('creatine_start' | 'carb_switch' | 'illness' | 'travel')[]; sleepHours?: number; steps?: number; waistCm?: number; note?: string; }
interface Goal { id: string; type: 'lose' | 'maintain' | 'gain'; startDate: string; startTrendKg: number;
  targetKg: number; ratePctPerWeek: number /* signed: -0.5 = lose 0.5%/wk */; completeOn: 'trend' | 'scale'; }
interface Program { id: string; style: 'coached' | 'manual'; createdAt: string; diet: 'balanced' | 'lowFat' | 'lowCarb' | 'keto';
  proteinLevel: 'low' | 'moderate' | 'high' | 'extra'; floor: 'standard' | 'low' | 'none';
  shift: { mode: 'even' | 'shift'; highDays: number[]; pct: number };
  daily: Record<0|1|2|3|4|5|6, { kcal: number; p: number; f: number; c: number }>; }
interface ExpenditurePoint { date: string; tdee: number; status: 'holding' | 'updating'; obs?: number;
  trendKg?: number; rateKgPerDay?: number; dayIndex: number; }
interface CheckIn { date: string; modules: string[]; tdee: number; prev: Program['daily']; next: Program['daily'];
  accepted: boolean; flaggedPartial: string[]; confirmedFasting: string[]; explanation: string; }
```

### G.3 Daily pipeline: trend and expenditure (pure, recomputed from history)

```
function computeSeries(profile, weights, foods, flags, goals, settings, today):
  days = dateRange(profile.expenditureStartDate, today)

  // 1. Daily intake and status
  for d in days:
    kcal[d] = dayOverride(d) ?? sum(foods on d).kcal            // manual Edit Day wins (KB#102/#56)
    if flags[d].fasting:            status[d]='fasting'; kcal[d]=0
    elif kcal[d]==0:                status[d]='unlogged'
    elif flags[d].partial:          status[d]='partial'
    else:                           status[d]='complete'
    // auto-suggest (not auto-apply) partial: kcal[d] < 0.5*median(kcal of complete days in last 21)   [OURS]

  // 2. Weights: linear interpolation between real weigh-ins (PUB); no extrapolation past last weigh-in
  w = interpolate(weights, days)         // undefined before first weigh-in; hold last value after last

  // 3. Trend: EMA on interpolated series (CAL alpha=0.10)
  trend[d0] = w[first weigh-in]
  for d after first weigh-in: trend[d] = trend[d-1] + 0.10*(w[d] - trend[d-1])

  // 4. Expenditure
  tdee[d0] = initialTdee(profile, activeGoal)                  // G.4
  paused = false
  for i, d in enumerate(days) (i>=1):
    last7 = days[i-6..i]
    nutritionOK = count(status in {'complete','fasting'} over last7) >= 4          // PUB
    weightOK    = count(real weigh-ins over last7) >= 1                             // PUB
    if paused: paused = !(all(status in {'complete','fasting'} for days[i-2..i]) and weightOK)  // RESUME_DAYS=3 PUB
    else:      paused = !(nutritionOK and weightOK)

    if i < 7 or paused:
      tdee[d] = tdee[d-1]; state[d]='holding'                  // carry last high-confidence value (PUB)
    else:
      Ne = min(21, i+1); Le = min(20, i)
      incl = days[i-Ne+1..i] where status in {'complete','fasting'}   // unlogged & partial excluded = mean-imputation
      intakeMean = mean(kcal[incl])
      rate = (trend[d] - trend[days[i-Le]]) / Le                     // kg/day
      obs  = intakeMean - 7716*rate
      k    = (i < 28) ? 0.20 : 0.10                                  // OURS / CAL
      tdee[d] = tdee[d-1] + k*(obs - tdee[d-1]); state[d]='updating'

    // 5. Predictive goal adjustment (PUB factor, OURS ramp shape)
    if settings.predictiveGoal and goalChangedWithin14Days(d):
      tdee[d] += pendingOffset/14                                    // pendingOffset = tdee_at_change * 4*(r_new - r_old)

  return {trend, tdee, state, rateKgPerWeek: rate*7, ratePctPerWeek: rate*7/trend[today]*100}
```

Notes for implementers:
- Everything is a pure function of stored logs: edits to past data recompute automatically, as in MacroFactor (KB#209, KB#207).
- Future-dated foods are ignored until the date has passed (KB#208).
- A day-level manual override (Edit Day) beats summed food entries, which beat imported totals (KB#56).

### G.4 Initial estimate

```
function initialTdee(p, goal):
  if p.manualInitialTdee: return p.manualInitialTdee                                   // KB#70
  age = years(p.birthDate)                                             // age term is two-slope (PUB): see formulas below
  if p.isAthlete and FFM known: bmr = 40.4 * FFM^0.932
  elif FFM known:  bmr = 50.2*FFM^0.7 + 40.5*(FFM^0.7 * FM^0.066) - (1.1*min(age,60) + 2.75*max(age-60,0))
  else:            bmr = 129.6*W^0.55 + 0.011*H^2 - (1.96*min(age,60) + 4.9*max(age-60,0)) - 213.8*(sex=='female')
  if goal.ratePctPerWeek < 0: bmr *= 0.95                              // in a deficit (PUB)
  if p.peakWeightKg and W < 0.9*p.peakWeightKg: bmr *= 0.97            // weight-reduced (PUB)
  af = {low:1.2, moderate:1.4, high:1.6}[p.generalActivity] + exerciseAddOn(p.sessionsPerWeek)  // 0/0.1/0.2/0.3 (PUB)
  tdee0 = bmr * af
  tdee0 *= (1 + 4 * goal.ratePctPerWeek/100)                           // goal-bias correction (PUB; default-on is OURS)
  return round(tdee0)
```

### G.5 Weekly check-in, targets, macros, and the "is it working?" judgments

```
function weeklyCheckIn(state, program, goal, profile, today):
  modules = []
  if any(day in last 7 with suggestedPartial): modules += PartialLogging(days)   // user confirms -> flags.partial -> recompute
  if no weigh-in in [today-3 .. today]:        modules += WeighIn()
  if any(day in last 7 with status=='unlogged'): modules += Fasting(days)          // mark fasted (0 kcal) or leave skipped
  if any(state.status=='holding' in last 7):     modules += LoggingBreak(resumeEstimate)
  // assistant presents modules conversationally; answers mutate flags; then recompute state
  tdee = state.tdee[today]; W = state.trend[today]

  raw = tdee + goalDelta(goal, W)
  prevAvg = mean(program.daily[*].kcal)
  if program.isNew or weeksSince(profile.expenditureStartDate) < 4 or goalChangedSinceLastCheckIn:
       target = raw                                                    // "new program = unsmoothed" (PUB)
  else:
       cap = max(100, 0.05*tdee)                                       // OURS
       target = prevAvg + clamp(raw - prevAvg, -cap, +cap)
  target = applyFloor(target, program.floor, profile)                  // 1200 / low / none
  daily  = distributeWeek(target, program.shift)                       // weekly sum = 7*target; each day >= floor
  macros = allocateMacros(daily, program, profile, W)
  return { modules, proposed: macros, explanation: explainDelta(...) }  // user accepts or declines (PUB)

function goalDelta(goal, W):
  if goal.type=='maintain':
     diff = W - goal.targetKg
     if abs(diff) <= 0.68: return 0                                    // PUB
     return -sign(diff) * 0.0015 * W * 7716/7                          // PUB 0.15%/wk
  return (goal.ratePctPerWeek/100) * W * 7716/7                        // signed (PUB)

function allocateMacros(dayKcal, program, profile, W):
  FFM = W * (1 - bodyFatFraction(profile))
  phase = goal.type=='lose' ? 'cut' : 'bulkOrMaintain'
  P = round(PROTEIN[phase][program.proteinLevel] * FFM)                // lifter table (PUB)
  Fmin = profile.heightCm < 150 ? 30 : 30 + 0.5*(profile.heightCm-150) // PUB
  R = dayKcal - 4*P
  switch program.diet:
    balanced: F = R/2/9
    lowFat:   F = 0.25*R/9                                             // OURS
    lowCarb:  C = min(0.30*dayKcal/4, 200); F = (R - 4*C)/9            // C in grams; PUB (approx.)
    keto:     C = 30; F = (R - 4*C)/9                                  // OURS
  F = max(F, Fmin)
  C = max(0, (dayKcal - 4*P - 9*F)/4)
  if 4*P + 9*Fmin > dayKcal:                                           // very low calories
     P = max(P_low, (dayKcal - 9*Fmin)/4)                              // priority: fat floor > protein > carbs (PUB)
  return {kcal: dayKcal, p: P, f: round(F), c: round(C)}
```

**"Is the plan working?" judgments.** Read-only flags for the indicator and the assistant. They **never** change targets by themselves; MacroFactor is adherence-neutral and has no catch-up.

| Flag | Rule | Tag / basis |
|---|---|---|
| `data_holding` | state = holding today | PUB (A3) |
| `calibrating` | day < 21 since start | PUB (A3) |
| `pace` | actual %BW/wk (20-day trend slope) vs goal rate → "on pace / slower / faster", with tolerance ±0.15 %/wk | Rate PUB; tolerance OURS |
| `deficit_aggressive` | relative deficit `(tdee − avgIntake14)/tdee` > **30 %**, **or** deficit > **1,000 kcal/day**, **or** actual loss > **1.0 kg/wk**, **or** > **1.5 %BW/wk** | PUB thresholds from [Cutting](https://macrofactor.com/cutting-calculator/); 14-day window OURS |
| `gaining_too_fast` | actual gain %/wk > "Aggressive" column for the user's training status (B2), or above the kg cap | PUB table [Bulking](https://macrofactor.com/bulking-calculator/) |
| `adherence_gap` | 30-day avg intake − avg target > +200 or < −200 kcal (display both views as in Energy Balance) | View PUB [KB#224](https://help.macrofactorapp.com/en/articles/224-interpreting-the-energy-balance-widget); ±200 OURS |
| `deficit_hurting_training` | trend down ≥ 3 weeks **and** e1RM or weekly hard sets down ≥ 5 % over the same 3 weeks **and** (RIR drift or user-reported fatigue) → "deficit may be too large for your training" | Heuristic PUB [KB#278](https://help.macrofactorapp.com/en/articles/278-weight-trend-workouts); all thresholds OURS |
| `recomp_not_stall` | trend flat (\|rate\| < 0.1 %/wk) ≥ 3 weeks **and** waist −1 cm or more **and** strength up | OURS; theory from [KB#220](https://help.macrofactorapp.com/en/articles/220-how-do-macrofactor-s-algorithms-respond-to-body-recomposition) |
| `water_event` | event flag (creatine start, carb switch, period) in the last 14 days → suggest skipping this check-in | PUB advice [KB#26](https://help.macrofactorapp.com/en/articles/26-how-should-i-interpret-changes-to-my-energy-expenditure); automation OURS |
| `sleep_limiting` | no MacroFactor precedent; define from other reports | — |

### G.6 Calibration evidence and golden tests

Scripts were run in the scratchpad, not in the repo.

1. **Impulse response.** Setup: a constant-weight person (200 lb, intake = TDEE = 3,016). Add +4, +3, +2 lb on three consecutive days placed *L* weeks back, then measure today's TDEE change. α = 0.10, k = 0.10, L = 20, N = 21, RHO = 7,716:

   | Weeks back | 1 | 2 | 3 | 4 | 5 | 6 |
   |---|---|---|---|---|---|---|
   | Our model (kcal) | −59 | −56 | −22 | +35 | +38 | +29 |
   | MacroFactor published, KB#209 (kcal) | −59 | −58 | −10 | +40 | +40 | +25 |

   RMS error about 6 kcal. Shorter windows (14 days) fit much worse (RMS 19–44), which supports the published 20/21-day windows. An alternative fit, α = 0.15 / k = 0.08, is equally good (RMS about 4).
2. **Stability.** With noisy data (weight SD 0.4–0.6 kg, intake SD 350 kcal), the mean |daily TDEE change| after day 30 is 4.9–6.5 kcal/day. MacroFactor published 7.25 kcal/day on real users. [Expenditure modifiers](https://macrofactor.com/expenditure-modifiers/)
3. **Convergence** from a ±500 kcal initial error, with a 0.20 warm-up gain:
   - Initial estimate too high: within 100 kcal in about 10 days.
   - Initial estimate too low, during an active cut: about 28 days. Trend lag at the start of a cut slows it.
   - Maximum overshoot about 130 kcal. MacroFactor publishes 14–30 days and 50–150 kcal overshoot.
4. **Three-week scale stall** while losing 1 lb/wk (true TDEE unchanged): TDEE moves −16 (after 1 wk), −75 (2 wk), −176 (3 wk). MacroFactor says targets move "200–300" instead of 500. After the "whoosh", TDEE overshoots by +132 and settles.
5. **Known limitation.** A *real* −300 kcal TDEE drop is priced in at 15 % after 2 weeks, 35 % after 3, 57 % after 4, 85 % after 6. MacroFactor says 3–4 weeks. Our open model is slower than V3's secret sauce for genuine step changes. Mitigations: predictive goal adjustment, and assistant-prompted manual adjustment for known lifestyle changes, as MacroFactor itself advises in KB#210.
6. **Golden unit tests** for agents:
   - BMR, male, 90 kg, 180 cm, 30 y: **1,837** kcal (height/weight equation).
   - With FFM 75 / FM 15: **1,993**. Athlete equation with FFM 75: **2,259**.
   - TDEE₀ with moderate activity + 4–6 sessions/week (AF 1.6): **2,940**. Cutting 0.5 %/wk (×0.95 BMR, ×0.98 goal correction): **2,737**. Target at 90 kg: **2,241**.
   - Maintenance, 75 kg target, trend 76.0, TDEE 2,500 → **2,376** kcal. MacroFactor says "about 2,375". [KB#125](https://help.macrofactorapp.com/en/articles/125-how-does-dynamic-maintenance-work-in-macrofactor)
   - Fat floor: 180 cm → **45 g**; 150 cm → 30 g; 145 cm → 30 g.
   - Partial day: 20 × 3,000 + 1 × 1,500 → 21-day mean **2,929** (−71). [KB#241](https://help.macrofactorapp.com/en/articles/241-what-is-partial-logging)
   - Protein, lifter cutting at "High", FFM 70 kg → **210 g**.

---

## H. Conflicts and unknowns (do not guess silently)

- **Energy-density symmetry.** The V3 article says gain and loss are the same (3,500 kcal/lb). KB#20 still describes rate-dependent composition. KB#222's gain examples imply about 2,520 kcal/lb. Treat the KB text as stale and use the single constant.
- **Logging minimum.** KB#26 says 6 of 7 nutrition days. KB#74, KB#110 and KB#222 say 4 of 7 for V3. Use **4 of 7**.
- **BMR source.** KB#26 says Cunningham. The Oct 2024 BMR article says the new MacroFactor equations are used in-app. Use the **new equations**.
- **Not published:**
  - the trend-weight smoothing constants;
  - V3's "false-signal mitigation" technique;
  - how V3 infers intake on missing days;
  - the step-modifier mechanism;
  - the weekly smoothing formula;
  - the "low" calorie floor;
  - the keto carb value;
  - the low-fat split;
  - the coached shift cap;
  - the goal-slider bounds and green-range edges;
  - non-lifter protein values;
  - the partial-day threshold;
  - Weight Trend V2 internals.
- **Not verified:** Reddit sentiment (blocked from this environment) and YouTube reviews (not reviewed).

## I. Source index

**Official — MacroFactor blog, newsletters, store, board**
- https://macrofactor.com/macrofactors-algorithms-and-core-philosophy/ (mirror: https://www.strongerbyscience.com/macrofactor-algorithms-philosophy/)
- https://macrofactor.com/expenditure-v3/
- https://macrofactor.com/expenditure-modifiers/
- https://macrofactor.com/macrofactors-bmr/
- https://macrofactor.com/cutting-calculator/
- https://macrofactor.com/bulking-calculator/
- https://macrofactor.com/goal-features/
- https://macrofactor.com/new-food-logger/
- https://macrofactor.com/fastest-food-logger/
- https://macrofactor.com/fastest-food-logger-2025/
- https://macrofactor.com/10-macrofactor-features/
- https://macrofactor.com/annual-report-2026/
- https://macrofactor.com/macrofactor/
- Newsletters: https://macrofactor.com/mm-february-2022/ · https://macrofactor.com/mm-june-2024/ · https://macrofactor.com/mm-october-2024/ · https://macrofactor.com/mm-sept-2025/ · https://macrofactor.com/mm-oct-2025/ · https://macrofactor.com/mm-nov-2025/ · https://macrofactor.com/mm-dec-2025/ · https://macrofactor.com/mm-april-2026/ · https://macrofactor.com/mm-may-2026/ · https://macrofactor.com/mm-july-2026/ · https://macrofactor.com/mm-august-2026/ · https://macrofactor.com/mm-sept-2026/
- Images: https://macrofactor.com/wp-content/uploads/2024/02/image-1.png (activity factors) · https://macrofactor.com/wp-content/uploads/2025/09/Final-results.png (FLSI totals)
- https://apps.apple.com/us/app/macrofactor-macro-tracker/id1553503471
- https://feedback.macrofactorapp.com/roadmap/feature-requests

**Official — help centre (`https://help.macrofactorapp.com/en/articles/` + slug)**
3-explode-recipes · 5-create-and-add-a-custom-food · 6-create-and-add-a-custom-recipe · 15-log-your-weight · 16-track-a-fasting-day · 17-track-your-period · 19-change-rate · 20-expenditure · 21-weight-trend · 22-get-to-know-your-dashboard · 23-how-do-i-adjust-my-macro-targets · 24-are-default-food-weights-for-cooked-or-raw-food · 25-how-robust-is-the-database-coverage-in-my-region · 26-how-should-i-interpret-changes-to-my-energy-expenditure · 28-does-macrofactor-have-an-offline-mode · 29-how-do-macrofactor-s-coaching-algorithms-deal-with-partially-logged-days · 30-does-macrofactor-support-refeeds-diet-breaks-or-carb-cycling · 32-how-would-i-pursue-a-reverse-diet-in-macrofactor · 33-does-macrofactor-use-energy-expenditure-data-from-my-wearable-activity-tracker · 34-what-are-the-different-program-options-in-coached-mode · 39-quick-edit-your-nutrition-for-a-full-day · 40-multi-add-foods · 41-quick-add-calories-and-macros-to-your-food-log · 45-food-logging-style · 46-food-search-database · 49-delete-a-food-from-your-hourly-go-tos · 53-opt-into-displaying-calorie-and-macro-overages · 56-weight-or-nutrition-source-priority · 57-change-your-activity-level · 58-change-your-body-fat-percentage · 61-change-your-expenditure-start-date · 64-how-to-change-your-expenditure-estimate-from-dynamic-to-static · 65-connect-health-connect-or-apple-health · 70-set-a-manual-initial-expenditure-estimate · 74-expenditure-version · 78-how-much-dietary-fat-should-you-eat · 85-intermittent-fasting · 86-keto-macro-program · 88-edit-a-goal · 90-set-a-new-goal · 91-program-styles · 92-weekly-budget · 93-balanced-macro-program · 95-copy-and-paste · 102-integrations · 108-how-to-adjust-calorie-targets-to-account-for-overages-or-to-roll-over-unused-calories · 109-how-frequently-do-i-need-to-log-my-weight-for-the-expenditure-algorithm-and-weekly-coaching-updates · 110-how-frequently-do-i-need-to-log-my-nutrition-for-the-expenditure-algorithm-and-weekly-coaching-updates · 115-why-doesn-t-macrofactor-have-a-lifetime-subscription-tier-with-a-one-time-payment · 119-configure-body-metric-and-progress-photo-tracking · 120-how-to-log-body-measurements · 121-how-to-add-progress-photos · 122-how-to-view-body-measurement-progress-over-time · 123-how-to-create-and-share-before-and-after-photos · 124-change-your-check-in-day · 125-how-does-dynamic-maintenance-work-in-macrofactor · 201-how-accurately-do-i-need-to-log-my-food · 202-what-should-i-do-if-i-m-pursuing-a-goal-with-a-strict-timeline · 205-why-does-my-new-program-have-slightly-different-calorie-and-macronutrient-targets-than-my-old-program-even-though-i-didn-t-change-my-goal · 206-what-should-i-do-if-my-initial-expenditure-or-recommended-energy-intake-seems-too-high-or-too-low · 207-will-logging-food-to-a-previous-day-affect-my-expenditure-and-coaching-recommendations · 208-will-logging-food-to-a-future-day-affect-my-expenditure-and-coaching-recommendations · 209-should-i-still-log-my-weight-if-i-feel-like-i-m-bloated-constipated-or-retaining-water · 210-what-should-i-do-if-my-activity-levels-change-drastically · 213-label-scanner · 215-how-to-log-food-in-macrofactor · 216-log-foods-with-describe · 217-add-notes-to-your-day · 218-how-to-configure-your-food-timeline · 219-how-to-configure-your-food-logger · 220-how-do-macrofactor-s-algorithms-respond-to-body-recomposition · 221-if-you-have-an-unusual-day-of-eating-is-it-better-to-log-it-or-leave-the-day-blank · 222-how-does-macrofactor-make-adjustments-for-a-weight-gain-or-weight-loss-goal · 224-interpreting-the-energy-balance-widget · 225-understanding-the-widgets-at-the-top-of-the-dashboard · 239-save-a-meal-for-later-use · 241-what-is-partial-logging · 243-edit-a-macro-program · 246-how-to-submit-new-or-updated-foods · 247-introduction-to-check-ins-and-coaching-modules · 248-coaching-module-partial-logging · 249-coaching-module-weigh-in · 250-coaching-module-fasting · 255-how-to-import-your-step-count · 256-i-ve-started-exercising-more-why-isn-t-my-expenditure-increasing · 257-favorite-foods · 258-ai-food-logging · 259-import-recipes-from-link · 271-how-to-view-your-trend-weight-on-the-watch-app · 274-expenditure-modifiers · 278-weight-trend-workouts · 393-how-macrofactor-subscriptions-and-bundles-work · 398-import-recipes-with-ai

**Third-party**
- https://outlift.com/macrofactor-review/ (Feb 2026, comments to Sept 2026)
- https://gainframe.app/blog/macrofactor-review/ (Jul 2026; discloses a business interest)
