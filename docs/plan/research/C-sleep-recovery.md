# C — Sleep, recovery & AI-insight features (research for the physique-coach build)

Date: 2026-10-16 · Scope: Bevel, WHOOP, Oura, Apple, Garmin; HealthKit / Health Connect data layer; sleep science for the judge; insight voice.

**Tags.** [official] = the vendor's own docs, API spec or app listing, or the primary peer-reviewed paper. [third-party] = reviews, press, community forums, competitor blogs. [inferred] = my reasoning or assumption, not published anywhere.

**Access notes.** whoop.com and thelocker pages returned HTTP 403 to automated fetches. WHOOP facts therefore come from `developer.whoop.com` (official API and docs), WHOOP Community threads, and whoop.com text quoted in search-engine snippets. Those are marked "[official, via snippet]". Proprietary score weights are **not published** by any of these vendors unless a card says otherwise.

---

## 0. TL;DR for the build plan

1. **No vendor publishes its recovery or readiness weights.** The only score with a published point split is **Apple's Sleep Score**: duration 50, bedtime consistency 30, interruptions 20 [official]. Bevel publishes its sleep-score *components* without weights [official]. We should copy Apple's structure for our Sleep Score. For recovery we should use a transparent multi-flag rule on top of personal baselines, not a fake-precise 0–100 number (§6.5).
2. **The consensus recovery inputs** are overnight HRV, overnight resting HR, sleep, and sometimes respiratory rate, skin temperature and SpO₂. Each is judged against the user's own baseline. Short windows run 7–14 days and long windows run 2–3 months (Oura, HRV4Training). WHOOP needs 4 days before the first score; Oura and Garmin need 2–3 weeks [official].
3. **Our app is a web app (Next.js), and it cannot read HealthKit or Health Connect directly.** Ship in this order:
   - **v1:** manual morning check-in, plus Oura API v2 and WHOOP API v2 over server-side OAuth with webhooks.
   - **v1.5:** Apple Health through "Health Auto Export" (REST push) or an export.zip upload.
   - **v2:** a native wrapper or an aggregator SDK.
4. **HRV metric mismatch is the biggest data quirk.** HealthKit's long-standing HRV type is **SDNN**, sampled sparsely and irregularly [official]. iOS 27 added `heartRateVariabilityRMSSD` ("Recovery HRV"), but only Series 12 and Ultra 4 write it [official identifier; third-party on behaviour]. WHOOP, Oura and Health Connect give RMSSD. **Never mix SDNN and RMSSD in one baseline.** Store `hrvMethod` per sample, and restart calibration when the source changes.
5. **Apple Sleep Score and Apple Readiness are not readable through HealthKit** (no identifier exists) [official, by absence]. We must compute our own from raw sleep samples.
6. **The science supports the founder's example rule.** In a deficit, short sleep keeps scale-weight loss the same but shifts the loss from fat toward lean mass:
   - Nedeltcheva 2010: 5.2 h vs 7.4 h asleep gave 55% less of the loss as fat and 60% more fat-free-mass loss [official].
   - Wang 2018: about 3 h less sleep per week over 8 weeks cut the fat share of loss from 83% to 58% [official].

   Practical thresholds are in §5. The core rule is: "≥2 weeks averaging under about 6.5 h (wearable) or under 7 h (self-report) while cutting, plus a corroborating signal → freeze further calorie cuts and fix sleep first."
7. **Strength is fairly robust to one bad night** (Knowles 2018: total sleep deprivation had "little effect"). It is not robust to *consecutive* short nights, which cut multi-joint force output [official]. Judge on 7–14-day windows and never on one night.
8. **Voice: copy WHOOP's and Bevel's mechanics, not their failure modes.** WHOOP's AI is publicly criticised for inventing data ("I invented 'more awake last night' without data") [third-party]. Every number in an insight must come from the computed payload. Stay silent on green days. Gate correlations at 5 "yes" and 5 "no" entries (WHOOP and Bevel both do this) [official].

---

## 1. Feature cards

Priority key: **must** = needed for the v1 physique judge; **should** = v1.x; **later** = nice to have.

### Bevel

#### B1 · Bevel Sleep Score
- **What it does:** A nightly 0–100% sleep score. Bands: Poor <70%, Normal 70–85%, Excellent >85%.
- **How it works:**
  - Components, as published: **Time Asleep, Deep Sleep vs target, REM Sleep vs target, Heart Rate Dip** (sleeping HR vs waking HR), **Sleep Efficiency** and **Sleep Continuity**. Weights are unpublished; the FAQ says "Bevel calculates sleep with its own factors and weighting" [official].
  - The Deep Sleep target is a % of *Sleep Needed*, adjusted for age and sex: 13%→9% for males and 14%→10% for females across ages 30–70+, with a 12.5% default [official].
  - Naps do not change the score but do reduce sleep debt and the next night's need [official].
  - Sleep data is read from Apple Health. Naps within ~15 min of main sleep can merge into it [official].
- **UX pattern:** A score ring, then a contributors list, then a "Primary Sleep" detail view with sleeping HR, HRV, respiratory-rate and SpO₂ graphs.
- **Sources:** https://help.bevel.health/en/articles/11258625 [official]; https://apps.apple.com/us/app/bevel-all-in-one-health-app/id6456176249 [official]
- **Confidence:** High on components, none on weights.
- **Adapt for us:** Take the *component list* idea (duration, efficiency, continuity). Do **not** score Deep or REM stages; stage accuracy is weak (see A1 and §4.2). Use Apple's published 50/30/20 split instead (§6.3).
- **Priority:** must (as a model for ours)

#### B2 · Bevel Sleep Needed / Sleep Debt
- **What it does:** Shows "Tonight's Sleep Needed" and a sleep debt figure. Given a wake time, it suggests a wind-down time and target bedtime.
- **How it works:**
  - Sleep Needed "incorporates your Sleep Goal, recent Strain, and Sleep Debt" [official].
  - A user report says the automatic need is the **average of the past 90 days**. Users complain this "can be dangerously misleading" for chronic short sleepers [third-party, feature-request thread]. Bevel marked "Use Sleep Goal to inform Sleep Debt" as *planned* [official, staff status].
- **UX pattern:** Sleep need lives on the sleep tab. A bedtime planner is anchored on the user's wake time.
- **Sources:** https://help.bevel.health/en/articles/10796033 [official]; https://feedback.bevel.health/feature-requests/p/improve-sleep-debt-metric [third-party/official status]
- **Confidence:** Medium.
- **Adapt for us:** Use a **user-set goal clamped to 7–9 h**, not a learned average, so we never normalise chronic short sleep. Add the bedtime planner ("to get 8 h before your 06:30 alarm, lights out by 22:15").
- **Priority:** should

#### B3 · Bevel Recovery Score
- **What it does:** A daily readiness percentage (1–100%), calculated "once each morning, after your sleep and data are available" [official].
- **How it works:**
  - Listed inputs: **Sleep Score, HRV, resting HR, wrist/body temperature, respiratory rate, SpO₂**. Only the direction of each effect is given; weights are unpublished [official].
  - "Recovery HRV" is calculated during sleep, so days are comparable; "Stress HRV" is taken during the day [official].
  - It appears only after **two full nights** and needs sleep data that includes stages [official].
  - The HRV calculation method is user-selectable. For Apple Watch the recommended setting is **"RMSSD + Entire sleep"**, and RHR is "Bevel + Entire sleep". For other devices that write to Apple Health it is "Apple Health + Entire day" [official].
  - Staff said in 2024 that HRV "averages the samples from the deepest parts of your sleep. If there are none, it will fallback to using samples from the entire sleep session" [official, staff reply].
  - Release 3.2.0 (Sep 30, 2026) added "native Recovery HRV (RMSSD) support from Apple Health" [official]. This lines up with the iOS 27 identifier (see §4).
- **UX pattern:** A % ring with an HRV and RHR detail card. A menstrual-cycle view shows typical recovery per phase [official].
- **Sources:** https://help.bevel.health/en/articles/11258177 ; https://help.bevel.health/en/articles/11258241 ; https://help.bevel.health/en/articles/10416961 ; https://feedback.bevel.health/feature-requests/p/source-of-hrv-reading-used-in-recovery ; https://kiledjian.com/2026/07/07/bevel-turns-apple-watch-data.html [third-party]
- **Confidence:** High on inputs and data handling, none on the formula.
- **Adapt for us:**
  - Copy the *data hygiene*: compute HRV and RHR only from the sleep window, prefer RMSSD, fall back explicitly, and wait two nights before showing anything.
  - Don't copy the opaque %. Our recovery should be a status that says which signals are off (§6.5).
- **Priority:** must (data handling)

#### B4 · Bevel Strain and Target Strain
- **What it does:** Daily load on a 0–100% scale (it can exceed 100%). It is logarithmic, and activities don't add linearly [official].
- **How it works:**
  - Active strain comes from workouts and passive strain from background HR. Time in higher HR zones and session duration both raise it [official].
  - Target Strain comes from recent Recovery and activity, looking at the "last ~14 days". Good recovery puts the target above the activity baseline; low recovery puts it below [official].
  - Strength work has a separate **Muscular Strain**: accelerometer data plus logged sets, reps, weight and volume. "Workouts can produce high Muscular Strain even without a large heart rate increase" [official].
  - A reviewer found the target hard to act on: it "doesn't recommend specific workouts to hit that strain" [third-party].
- **Sources:** https://help.bevel.health/en/articles/11257857 ; https://help.bevel.health/en/articles/10577601 [official]; https://tech.yahoo.com/wearables/articles/bevel-sort-makes-apple-watch-230000160.html [third-party, Lifehacker 2025-07-16]
- **Confidence:** Medium.
- **Adapt for us:** We already have better lifting load data (sets × reps × RIR). HR-based strain adds little for lifters. Use our own volume and RIR load as the "strain" side and skip an HR strain score.
- **Priority:** later

#### B5 · Bevel Stress Score and Energy Bank
- **What it does:**
  - **Stress:** 1–100 physiological stress through the day, from HR, HRV, movement and time of day. It is explicitly "not emotional or mental stress directly" [official].
  - **Energy Bank:** a Body-Battery-style reserve. It drains with stress and activity and recharges with sleep, naps, mindfulness and lying down. Charging slows near 100% and draining slows near 1%. It **carries over between days** [official].
- **How it works:** About **30 days** to adapt to a personal baseline. Formula and rates are unpublished [official].
- **UX pattern:** An intraday line ("dotted line") plus a calendar view.
- **Sources:** https://help.bevel.health/en/articles/11258369 [official]
- **Confidence:** Medium.
- **Adapt for us:** Skip it. It needs dense intraday HR, which a web app can't get, and it doesn't answer "is my physique plan working".
- **Priority:** later

#### B6 · Bevel Journal and Journal Insights
- **What it does:** Logs habits (yes / neutral / no, or values) and correlates them with Sleep and Recovery.
- **How it works:**
  - A journal "day" runs from wake to wake. Nighttime entries are prompted on waking ("Log yesterday's entry on wake up") [official].
  - **Auto-entries** come from Apple Health with editable thresholds: steps, cardio minutes, daylight, 50+ dB sleeping noise, "Morning sunlight" (≥10 min of daylight in the first hour after waking), naps, "Target strain overreached". Nutrition-derived entries include late meal, alcohol and caffeine [official].
  - Insights unlock at **≥5 "Yes" and ≥5 "No" entries** per habit, over **90-day rolling data**. The copy says "identifies correlations, not cause-and-effect" [official].
  - There is a "Copy entries from yesterday" shortcut [official].
  - A reviewer found setup confusing and the insights thin [third-party].
- **Sources:** https://help.bevel.health/en/articles/13319041 ; https://help.bevel.health/en/articles/11968449 ; https://help.bevel.health/en/articles/13318977 [official]
- **Confidence:** High.
- **Adapt for us:**
  - Build a *tiny* behaviour journal derived mainly from data we already have: late training, caffeine after 14:00, alcohol, late meal, calorie-deficit size.
  - Unlock correlations only at 5/5 within 90 days, and always label them as correlation.
  - Prefer auto-derived tags over manual ones; logging is sacred.
- **Priority:** should

#### B7 · Bevel Intelligence (AI coach)
- **What it does:** A chat assistant over the user's data, plus scheduled **Check-ins**.
- **How it works:**
  - **Reads:** sleep, recovery, HRV, food, workouts, labs, symptoms, images [official].
  - **Insight types:** custom charts, "impact analysis" (e.g. caffeine → sleep), forecasts, nutrition gap analysis, and training plans with progressive-overload weights [official].
  - **Check-ins:** created from chat ("Send me a daily recovery summary every morning at 8am") or manually. Frequency can be once, hourly, daily, weekly or monthly, each with an end date [official]. Daily, weekly and monthly summaries are supported.
  - **No real-time alerts yet:** "stress threshold alerts are not supported yet" [official].
  - **Long-term memory** of goals, injuries and preferences [official].
  - **Personalities:** Friend, Commander, Guardian, Data Nerd [official].
  - **Hard limits:** it cannot log or edit data, change goals, or diagnose [official].
  - **Pricing:** behind Pro ($14.99/mo or $99.99/yr) plus credit packs [official].
  - **Reception:** reviews are mixed, with "generic advice, slow responses, context issues" [third-party].
- **Sources:** https://help.bevel.health/en/articles/11586817 ; https://help.bevel.health/en/articles/12308801 ; https://help.bevel.health/en/articles/11586945 [official]; https://www.bevel.health/ [official]; https://kiledjian.com/2026/07/07/bevel-turns-apple-watch-data.html [third-party]
- **Confidence:** High.
- **Adapt for us:**
  - Our assistant already exists. Borrow (a) **scheduled check-ins**, especially a single weekly verdict, and (b) the *capability boundary* list as an explicit system-prompt contract.
  - Don't offer personalities. PRODUCT.md defines one voice, roughly Bevel's "Data Nerd" with Oura's "direct".
- **Priority:** should

#### B8 · Bevel data sources (what it reads from Apple Health)
- **What it reads:** sleep analysis, HRV (SDNN, and RMSSD from 3.2.0), heart rate, resting HR, respiratory rate, wrist temperature, SpO₂, workouts, steps, active and resting energy, Time in Daylight, environmental noise, mindfulness, dietary data, blood pressure and cycle data. Direct integrations: Oura, Garmin, Amazfit, Google Health [official, compiled from help articles, the release notes and bevel.health].
- **Rules:**
  - Pick **one sleep source** and hide duplicates. When sources overlap, "Health combines overlapping Sleep sessions, which can result in unusually high total Sleep" [official].
  - The Smart Alarm needs an Apple Watch [official].
- **Sources:** https://help.bevel.health/en/articles/10416961 ; https://help.bevel.health/en/articles/10796161 ; https://help.bevel.health/en/articles/13004417 [official]
- **Confidence:** High.
- **Adapt for us:** Enforce a per-metric source priority and dedupe (§4.5).
- **Priority:** must

#### B9 · Bevel strength: Muscular Load and Muscle Freshness
- **Muscular Load:**
  - Inputs: exercises, sets, reps, weight and session RPE.
  - Windows: 7-day short-term vs 6-week long-term.
  - Statuses: Detraining, Maintaining, Productive, Peaking, Overtraining, Calibrating.
  - Calibration needs **≥10 qualifying training days in 6 weeks** per muscle [official].
- **Muscle Freshness:**
  - Per-muscle fatigue decays at muscle-specific rates.
  - Bands: Recovered ≥75%, Fatigued 35–75%, Depleted <35%.
  - Needs **≥3 prior training days** to calibrate.
  - Stated limit: "our best estimate … not a direct measurement of muscle repair" [official].
- **Other:** Version 3.2.4 (Oct 2026) added a Training Calendar and Personal Records [official, App Store].
- **Sources:** https://bevel.health/blog/the-basics-muscular-load ; https://bevel.health/blog/the-basics-muscle-freshness ; App Store listing [official]
- **Confidence:** High on thresholds, low on formula.
- **Adapt for us:** Mostly outside my scope (training research). Two points do apply here: (1) the honest **"Calibrating"** state with explicit day counts, and (2) acute-vs-chronic windows. Our lift data is richer than Bevel's.
- **Priority:** later (for this scope)

#### B10 · Bevel nutrition
- **What it does:** Food logging by barcode, photo, text or recipe, with a 6M+ food database [official].
- **How it works:**
  - A "Nutrition Score" covers vegetables (150 g/day target, from 3.2.4), whole grains, red meat, excess sodium and excess sugar [official].
  - Nutrition entries also feed the Journal: late meal, alcohol, caffeine [official].
- **Sources:** App Store listing; https://www.bevel.health/ [official]
- **Confidence:** Medium.
- **Adapt for us:** The relevant cross-link for this scope is **late meal, alcohol and caffeine → sleep**, auto-tagged from food logs (B6).
- **Priority:** later

### WHOOP

#### W1 · WHOOP Recovery
- **What it does:** A 0–100% morning score. Zones: **Green 67–100, Yellow 34–66, Red 0–33**. It is fixed for the day unless the user edits their sleep [official].
- **How it works:**
  - **Inputs:** HRV (RMSSD), resting HR, respiratory rate, sleep, and on newer hardware skin temperature and SpO₂ [official].
  - **API fields:** `recovery_score, resting_heart_rate, hrv_rmssd_milli, spo2_percentage, skin_temp_celsius, user_calibrating` [official].
  - **Weighting:** WHOOP's podcast says HRV carries most of the weight and sleep less [official, via snippet]. Exact weights are unpublished.
  - **HRV timing:** a community reply describes the current method as overlapping 5-minute windows across the whole sleep, wake removed, weighted toward slow-wave sleep and toward later in the night. It calls the older "last SWS only" description outdated [third-party].
  - **Calibration:** greyed out for the first **4 days** [official, via snippet]. Full baseline in about 30 days [third-party].
- **UX pattern:**
  - A colour-coded dial on Home. WHOOP Coach entry points are on the Recovery screen ("why did my score drop?").
  - WHOOP frames Recovery as "context for your day rather than a report card" [official, via snippet].
- **Sources:** https://developer.whoop.com/docs/whoop-101 ; https://developer.whoop.com/api/ [official]; https://www.whoop.com/thelocker/podcast-84-recovery-update/ [official, via snippet]; https://community.whoop.com/t/hrv-extreme-spikes/6472/31 [third-party]
- **Confidence:** High on inputs and zones, none on weights.
- **Adapt for us:** For WHOOP users, ingest `recovery_score` and show it attributed ("WHOOP: 34%"). Run our judge on the raw `hrv_rmssd_milli` and `resting_heart_rate` against our own baselines, so every source is treated the same way.
- **Priority:** must (ingest)

#### W2 · WHOOP Sleep Need
- **What it does:** Tonight's sleep need = **Baseline + need from Sleep Debt + need from recent Strain − recent Naps**.
- **How it works:**
  - The **API exposes the breakdown:** `sleep_needed.{baseline_milli, need_from_sleep_debt_milli, need_from_recent_strain_milli, need_from_recent_nap_milli}` [official].
  - The baseline is learned from bed and wake times, duration and efficiency over the **past 28 days** [official, via snippet].
  - Debt "follows you around for a few days" (VP Data Science); the decay is unpublished [official, via snippet].
  - Sleep Planner targets: **Peak 100% / Perform 85% / Get by 70%**. Some regional pages say 75% for "get by" [official, inconsistent].
  - The member average need is 8:34 [official, via snippet].
- **UX pattern:** A Sleep Planner that suggests a bedtime for the chosen tier.
- **Sources:** https://developer.whoop.com/api/ [official]; https://www.whoop.com/us/en/thelocker/how-much-sleep-do-i-need ; https://www.whoop.com/ca/en/thelocker/feature-update-whoop-app-sleep-planner/ [official, via snippet]; https://community.whoop.com/t/how-is-100-of-the-my-sleep-need-calculated/527 [third-party]
- **Confidence:** High on structure, low on coefficients.
- **Adapt for us:** Use the same additive structure with our own numbers: goal (default 8 h), plus debt, minus naps. Skip the strain term in v1 (§6.4). Show the breakdown, like WHOOP's API does.
- **Priority:** should

#### W3 · WHOOP Sleep Performance
- **What it does:** A nightly % made of four parts.
- **How it works:**
  - **Sufficiency:** hours slept vs needed.
  - **Consistency:** similarity of bed and wake times over a **4-day** window, 0–100%.
  - **Efficiency:** asleep / in bed.
  - **Sleep Stress:** time in high stress overnight [official, via snippet].
  - **API fields:** `sleep_performance_percentage, sleep_consistency_percentage, sleep_efficiency_percentage, respiratory_rate`, plus a stage summary with `disturbance_count` and `sleep_cycle_count` [official].
  - Bands of ≥85% optimal and 70–84% sufficient are widely repeated but not confirmed on an official page [third-party/unverified]. The community says consistency of 90%+ is the goal [third-party].
  - A WHOOP analysis found a member-average consistency of 67.9% [official, via snippet, undated].
- **Sources:** https://developer.whoop.com/api/ [official]; https://www.whoop.com/thelocker/understand-everything-that-makes-a-great-nights-sleep-with-new-sleep-metrics ; https://whoop.com/thelocker/new-feature-sleep-consistency-why-we-track-it [official, via snippet]; https://www.community.whoop.com/t/whoop-sleep-consistency/800 [third-party]
- **Confidence:** Medium.
- **Adapt for us:** Sufficiency and consistency are the two parts that work with **manual entry**. They map onto Apple's duration and bedtime components (§6.3).
- **Priority:** must

#### W4 · WHOOP Journal / Behavior Insights
- **What it does:** Daily yes/no behaviours (alcohol, late caffeine and similar), correlated with Recovery. Formerly called "Recovery Insights".
- **How it works:** Unlocks at **≥5 "yes" and ≥5 "no" entries within 90 days**. It shows whether a behaviour is associated with higher or lower Recovery, with explicit "not causation" framing. Results sit in the "Impacts" view [official, via snippet].
- **Sources:** https://www.whoop.com/thelocker/the-whoop-journal/ ; https://www.whoop.com/ca/en/thelocker/a-new-way-to-see-insights-on-which-behaviors-affect-your-recovery/ [official, via snippet]
- **Confidence:** High. Bevel uses the identical 5/5 rule.
- **Adapt for us:** Use the same gate. The effect must be shown on *our* outcomes: next-night sleep minutes, next-day e1RM, scale noise.
- **Priority:** should

#### W5 · WHOOP Coach, Daily Outlook and Day in Review (AI)
- **What it does:**
  - **WHOOP Coach:** a chat assistant launched 2023 on OpenAI GPT-4 [official, via snippet; https://www.maginative.com/article/whoop-introduces-ai-powered-personal-coaching/ third-party].
  - **Daily Outlook:** a morning card with recovery, HRV and RHR, a strain suggestion, and sleep vs need. It is rolled out in stages and described as replacing chat-first discovery: "No more chatting with an AI just to figure out what's going on" [third-party, Jan 2025].
  - **Day in Review:** an evening recap of Strain, Recovery, Sleep and logged activities [official, via snippet].
  - Coach also has screen-specific prompts on the Recovery, Sleep and Strain pages, memory, and proactive conversation starters [official, via snippet].
- **Reception:**
  - Praised for memory: it remembered an illness and checked in on following days [third-party].
  - **Most-cited failure: hallucinated data.** One quote: "I invented 'more awake last night' without data". Others include fabricated elevation figures, caffeine and alcohol logged that the user never consumed, and a scolding tone [third-party, Gear Patrol 2026-07-06].
  - A forum thread complains that Daily Outlook ignored a preference stored in memory [third-party].
- **Sources:** https://www.whoop.com/thelocker/new-ai-guidance-from-whoop ; https://whoop.com/thelocker/introducing-whoop-coach-powered-by-openai [official, via snippet]; https://gadgetsandwearables.com/2025/01/24/whoop-daily-outlook/ ; https://www.gearpatrol.com/fitness/whoop-ai-reddit-user-feedback-pros-cons/ ; https://www.community.whoop.com/t/daily-outlook-coach-not-learning-from-my-preferences/15543 [third-party]
- **Confidence:** High on the pattern.
- **Adapt for us:**
  - The home assistant card *is* our Daily Outlook. It should be a computed brief, not a chat prompt (this matches PRODUCT.md).
  - **Hard rule:** the LLM may only quote numbers present in the structured payload. Include `nightsUsed`. Run an eval check that rejects any metric not in the payload. The repo already has an `evals/` folder.
- **Priority:** must

#### W6 · WHOOP Weekly and Monthly Performance Assessments
- **What it does:**
  - **Weekly Performance Assessment:** every **Monday**, covering the strain-vs-recovery balance (training state), sleep status ("how close you came to optimal sleep each night"), and activity trends [official, via snippet].
  - **Monthly Performance Assessment:** this month vs last, sleep deprivation, restorative sleep, cardio load by zone and sport, 6-month strain-vs-recovery, HRV and RHR trends, and Journal behaviour analysis over up to a year [official, via snippet].
  - The monthly report has since been replaced by "Month in Review". Members call it less detailed [third-party].
- **Sources:** https://whoop.com/thelocker/new-weekly-performance-assessment ; https://www.whoop.com/thelocker/monthly-performance-assessment ; https://whoop.com/eu/en/thelocker/monthly-performance-assessment-now-features-enhanced-recovery-analysis [official, via snippet]; https://www.community.whoop.com/t/new-month-in-review-is-a-huge-disappointment/9035 [third-party]
- **Confidence:** Medium.
- **Adapt for us:** **A weekly verdict is the core physique-coach artefact**: "is the plan working, and if not, what's limiting it". Ship one, on a fixed day. A monthly report can wait.
- **Priority:** must

#### W7 · WHOOP Strain (brief)
- **What it does:** A 0–21 non-linear scale (Borg-based). Light 0–9, Moderate 10–13, High 14–17, All Out 18–21 [official].
- **Stress Monitor:** 0–3, comparing live HRV against a **14-day** baseline [official, via snippet].
- **Sources:** https://developer.whoop.com/docs/whoop-101 [official]
- **Adapt for us:** Not needed; lifting load comes from our logs.
- **Priority:** later

### Oura

#### O1 · Oura Readiness
- **What it does:** A 0–100 score. Bands: **85–100 Optimal, 70–84 Good, 60–69 Fair, 0–59 Pay attention** [official].
- **How it works:** Nine contributors (API names: `activity_balance, body_temperature, hrv_balance, previous_day_activity, previous_night, recovery_index, resting_heart_rate, sleep_balance, sleep_regularity`) [official]. Definitions [official]:
  - **Resting HR:** last night's *lowest* HR vs a ~2-month average. The contributor drops if RHR is **3–5 bpm higher** or **10–15 bpm lower** than usual.
  - **HRV Balance:** the 14-day weighted average (recent days count more) vs the **3-month** average.
  - **Body Temperature:** last night vs the long-term nightly average.
  - **Recovery Index:** time asleep *after* HR reaches its nightly low. The target is ≥6 h, and the low should come in the first half of the night.
  - **Sleep:** the previous 24 h including naps, vs baseline.
  - **Sleep Balance:** 2 weeks vs baseline and the 7–9 h recommendation.
  - **Sleep Regularity:** bed and wake consistency over 2 weeks; naps excluded.
  - **Previous Day Activity** and **Activity Balance:** 14 days vs 2 months.
  - Up to **2 weeks** to learn personal averages.
- **UX pattern:**
  - The score sits on top. Each contributor has a bar and a word (Optimal / Good / Pay attention).
  - At **<70** the copy steers to rest: "take it easy", a 20-minute walk, avoid >5 h sitting.
  - A temperature rise triggers a Rest Mode suggestion [official].
- **Sources:** https://support.ouraring.com/hc/en-us/articles/360025589793-Readiness-Score ; https://support.ouraring.com/hc/en-us/articles/360057791533 ; https://cloud.ouraring.com/v2/docs (OpenAPI 1.42) [official]
- **Confidence:** High on contributors and windows, none on weights.
- **Adapt for us:**
  - The **contributor list with a status word per row** is the right detail-view pattern.
  - Oura's **14-day-vs-2–3-month "balance"** is our long-term comparison.
  - Use the **3 bpm** RHR rule as our RHR flag threshold.
- **Priority:** must (pattern)

#### O2 · Oura Sleep Score
- **What it does:** A 0–100 score with the same bands as Readiness [official].
- **How it works:** Seven contributors [official]:
  - **Total sleep:** the "most significant contributor". Adults need 7–9 h.
  - **Efficiency:** about 85% is good. The score drops if sleep takes >20 min to arrive.
  - **Restfulness:** wake-ups, movement, getting out of bed.
  - **REM:** about 1.5 h is optimal.
  - **Deep:** 15–20% on average (0–35% range).
  - **Latency:** 15–20 min is ideal; <5 min may mean over-tiredness.
  - **Timing:** sleep midpoint between **00:00 and 03:00**, adjusted for chronotype.
  - Weights are unpublished.
- **Sources:** https://support.ouraring.com/hc/en-us/articles/360057792293 ; https://support.ouraring.com/hc/en-us/articles/360025445574-Sleep-Score [official]
- **Confidence:** High.
- **Adapt for us:** These thresholds are useful as *explanations* ("efficiency 78%, you were awake ~95 min"). Score only on duration, consistency and interruptions (§6.3).
- **Priority:** should

#### O3 · Oura Advisor (AI)
- **What it does:** Opt-in LLM chat. It can proactively flag pattern shifts, e.g. "deep sleep patterns may have changed".
- **How it works:**
  - The user picks a **style**: "conversational" (supportive) or "direct" (goal-oriented, accountability).
  - The user sets the **check-in frequency**.
  - **Memory** is user-editable.
  - It references the user's existing graphs.
  - Disclaimer: it "can make mistakes" [official press release, Mar 31 2025].
- **Sources:** https://www.businesswire.com/news/home/20250331565896/en/Oura-Advisor-an-AI-powered-Personal-Health-Companion-Now-Rolling-Out-to-All-Oura-Members [official]; https://www.tomsguide.com/wellness/fitness/ouras-ai-powered-advisor-is-rolling-out-heres-what-it-means-for-you [third-party]
- **Confidence:** Medium.
- **Adapt for us:** Two ideas: **user-controlled check-in frequency** (default weekly, optional daily brief) and **user-visible, editable memory**. The repo has `lib/assistantMemory.ts`.
- **Priority:** should

### Apple

#### A1 · Apple Watch Sleep Score (watchOS 26)
- **What it does:** A nightly 0–100 score from **duration (50), bedtime consistency (30), interruptions (20)**.
  - Bedtime consistency "considers when you fell asleep during the last **13 nights**".
  - Interruptions "considers how often you wake up and how long you stay awake".
  - Bands after watchOS 26.2: Very Low 0–40, Low 41–60, OK 61–80, High 81–95, Very High 96–100 [official].
  - It runs on Series 6 and later. It is reportedly built with sleep-medicine input and data from about 5M nights [third-party].
- **Deduction curves (third-party analysis, said to be Apple-confirmed, not in Apple docs):**
  - **Duration:** no penalty at or above about 7 h 50 min. Non-linear below that: about −6 at 1 h short and −13 at 2 h short. Up to −5 each for low Deep or low REM.
  - **Bedtime:** from 15 min later than normal, about −1 point per ~5 min (−10 at 60 min late, −30 at 150 min). Early bedtime is free up to 60 min, then −1 per 30 min, capped at −6.
  - **Interruptions:** the first 11 min awake are free, then about −1 per 4 min. The first 2 wake events are free, then about −1 per 2 further events [third-party].
- **Developer access:** none. No Sleep Score identifier exists in HealthKit [official, by absence in the identifier list; third-party Apple dev-forum post].
- **Sources:** https://support.apple.com/guide/watch/apded441a669 [official]; https://the5krunner.com/2025/10/06/how-apple-watchs-sleep-score-is-calculated-all-you-need-to-know-to-improve-sleep-health [third-party]; https://9to5mac.com/2025/11/04/watchos-26-2-sleep-score-changes-apple-watch/ [third-party]
- **Confidence:** High on the split, medium on the curves.
- **Adapt for us:** **Adopt this structure as our Sleep Score.** It is the most transparent published model and all three parts can be computed from manual entry (§6.3). Drop the stage deductions.
- **Priority:** must

#### A2 · Apple Vitals
- **What it does:**
  - Overnight HR, respiratory rate, wrist temperature, SpO₂ and sleep duration, each against a "typical range".
  - On Series 12 and Ultra 4, HRV replaces sleep duration, and Vitals adds daytime HR and HRV [official].
  - It needs **7 nights** to establish ranges [official].
- **Alert rule:** notify the next morning only when **multiple (by default ≥2) overnight metrics** are outside range. The notification lists possible factors: medications, elevation, illness [official].
- **Sources:** https://support.apple.com/guide/watch/vitals-apd15aa7ed96/watchos ; https://support.apple.com/120142 [official]
- **Confidence:** High.
- **Adapt for us:** **The "≥2 signals must agree" rule is our anti-false-positive gate** (§6.5). PRODUCT.md: "False positives … are fatal". List possible non-training causes (illness, alcohol, travel) before blaming the plan.
- **Priority:** must

#### A3 · Apple Readiness and Recovery HRV (watchOS 27, Series 12 / Ultra 4 only)
- **What it does:**
  - A **0–10** daily score: **Recover 0–1, Pace Yourself 2–4, Ready 5–7, Go For It 8–10**.
  - Inputs: recent active calories, workout effort ratings, training load, recent Sleep Score, overnight HR, respiratory rate, wrist temperature, HRV and SpO₂, plus daytime HR. All are compared with a recent baseline.
  - It **updates during the day** (calories, naps, daytime HR) and shows contributing factors per area [third-party, iClarified 2026-10-01; also https://www.macstories.net/stories/watchos-27-the-macstories-review/7/].
  - Needs the watch worn to sleep on **≥7 of the past 49 nights** [third-party, citing Apple].
  - New sensors measure HRV "as often as every five minutes" [third-party].
  - It is not exposed in HealthKit. The new `heartRateVariabilityRMSSD` type *is* exposed, introduced in iOS/watchOS **27.0** [official].
- **Sources:** https://developer.apple.com/documentation/healthkit/hkquantitytypeidentifier/heartratevariabilityrmssd [official]; https://www.iclarified.com/102426/apple-watch-readiness-score-how-it-works-and-which-models-support-it ; https://gadgetsandwearables.com/2026/09/15/watchos-27-readiness-recovery-hrv-older-apple-watch/ ; https://github.com/Lybron/health-auto-export/issues/75 [third-party]
- **Confidence:** Medium. It is a new product with limited documentation.
- **Adapt for us:**
  - Apple's **action-word labels** ("Pace Yourself") beat a bare number. Our status labels should name an action.
  - Apple's coarse 0–10 scale, versus WHOOP and Oura's 0–100, supports *not* faking precision.
- **Priority:** should

### Garmin (brief)

#### G1 · Garmin Body Battery
- **What it does:** A 5–100 energy reserve (one manual says 0–100), from HRV, stress, sleep quality and activity [official].
- **How it works:** Computed by the Firstbeat engine. RMSSD-based stress drains it; rest and sleep recharge it. The formula is unpublished; third-party sources say a night typically adds +40 to +70 [third-party].
- **Sources:** https://www8.garmin.com/manuals/webhelp/GUID-9CC4A873-E034-4A06-B2E0-636DCFE760EE/EN-US/GUID-87E1392B-2C55-40B7-A1FF-3AB9252DA0A0.html [official]; https://the5krunner.com/garmin-features/sleep/garmin-body-battery [third-party]
- **Adapt for us:** Skip it, for the same reason as Bevel's Energy Bank (B5).
- **Priority:** later

#### G2 · Garmin Training Readiness and HRV Status
- **Training Readiness:**
  - 1–100, **continuously updated**.
  - Factors: last night's Sleep score, Recovery time, HRV status, Acute load, Sleep history (last 3 nights), Stress history (last 3 days).
  - Bands: Prime 95–100, High 75–94, Moderate 50–74, Low 25–49, Poor 1–24 [official].
- **HRV Status:**
  - Status is based on the 7-day average vs a personal baseline *range*.
  - The baseline needs **≥3 weeks**. The 7-day average is available after 1 week.
  - Statuses: Balanced, Unbalanced (outside the range either way), Low, Poor (age norms) [official, Garmin blog].
- **Sources:** https://www8.garmin.com/manuals/webhelp/GUID-31D23DBB-57C2-4DF7-A0C9-8D1A00AB4BE7/EN-US/GUID-C21BE0C8-A08E-4DA1-B6C6-2E0E2DDDB372.html ; https://www.garmin.com/en-MY/blog/understanding-the-hrv-status-on-your-garmin-smartwatch/ [official]
- **Confidence:** High.
- **Adapt for us:**
  - Garmin's **3-night sleep history** and **7-day HRV average vs a baseline band** are close to what we propose.
  - Note that Garmin flags *high* HRV as "Unbalanced" too. Our HRV flag should be one-sided (low only) in v1 to avoid confusing users. This is an assumption [inferred].
- **Priority:** should (pattern)

---

## 2. Cold start: when each app stays quiet (copy this behaviour)

| App · metric | Data needed before first output | Source |
|---|---|---|
| Bevel Recovery | 2 full nights, with stages | [official] help 11258241 |
| Bevel Stress / Energy Bank | ~30 days to fully adapt | [official] help 11258369 |
| Bevel Journal insight | ≥5 yes and ≥5 no per habit, 90-day rolling | [official] help 13319041 |
| Bevel Muscle Freshness / Load | 3 / 10 training days | [official] blog |
| WHOOP Recovery | greyed for 4 days; ~30 days for full baseline | [official, via snippet] / [third-party] |
| WHOOP Journal insight | ≥5 yes and ≥5 no within 90 days | [official, via snippet] |
| Oura contributors | up to 2 weeks to learn averages | [official] |
| Apple Vitals | 7 nights | [official] |
| Apple Readiness | ≥7 of the last 49 nights | [third-party citing Apple] |
| Garmin HRV Status | 7-day average after 1 week; baseline after 3 weeks | [official] |
| HRV science | ≥3–4 valid days/week for a valid weekly average (Plews 2014) | [official] https://pubmed.ncbi.nlm.nih.gov/24334285/ |

**Our rule (§6.2):**
- Sleep metrics appear from night 1.
- Consistency needs 7 nights.
- HRV and RHR status needs 14 valid nights within 28 days.
- The sleep-vs-physique judge needs ≥10 of 14 nights logged plus ≥3 weeks of weight and lift data.
- Until then the UI shows "Calibrating: N more nights". It never shows a placeholder score.

---

## 3. How these apps phrase and surface insights (for the assistant's voice)

**Surfaces that work:**
1. **Morning brief card** (WHOOP Daily Outlook, Bevel daily check-in, Oura readiness message). Once a day, after sleep syncs. Content: score, top 1–2 contributors, one suggestion. Gadgets & Wearables praised Daily Outlook as "straight to the point" and better than chat-first [third-party].
2. **Contributor rows with a status word** (Oura, Apple Readiness, Bevel sleep). The number explains itself through 3–7 named factors [official].
3. **Ask-why entry on each metric screen** (WHOOP Coach on the Recovery, Sleep and Strain screens). The question comes pre-filled from that screen [official, via snippet].
4. **Threshold-gated alerts** (Apple Vitals at ≥2 outliers; Oura temperature leading to Rest Mode). Rare and actionable, with possible causes listed [official].
5. **Correlation cards** (WHOOP and Bevel journals) behind a 5/5 gate, always with "correlation, not cause" wording [official].
6. **Weekly report on a fixed day** (WHOOP WPA on Mondays) [official, via snippet].
7. **Scheduled check-ins the user creates in chat** (Bevel: "every morning at 8am") [official].

**Tone patterns:**
- WHOOP: recovery is "context, not a report card".
- Oura: "Pay attention", never "bad".
- Apple: "shouldn't be the sole basis" caveats.
- Bevel and Oura offer persona or tone switches, but **PRODUCT.md fixes one voice**: precise, peer, calm.
- The closest vendor analogues are Bevel "Data Nerd" ("analytical, informative") and Oura "direct" ("goal-oriented, accountability").

**Failure modes to design out:**
- Hallucinated metrics and invented logs (WHOOP AI, Gear Patrol 2026).
- Memory ignored by the next brief (WHOOP forum).
- Generic advice (Bevel, kiledjian.com).
- A target with no action attached (Bevel strain, Lifehacker).
- Scolding tone (WHOOP, unverified screenshot).
- Sources: [third-party] links in W5 and B4.

**Voice rules for our assistant [inferred, derived from the above plus PRODUCT.md]:**
1. **Green = silent.** No sleep or recovery line on Home unless a status is amber or red, or a judge rule fired.
2. Lead with the verdict, then the two strongest numbers, then one action: "Fix sleep before cutting further. 7-night average 6h02m (goal 8h); squat e1RM −4% over 3 wks. Hold calories this week; aim lights-out 22:30."
3. Always state the window and n ("last 14 nights, 13 logged"). Never interpret a single night's HRV.
4. Name confounders before blaming the plan: alcohol, illness, travel, a new deficit in the last 7 days.
5. Say "associated with" for correlations, and say "evidence suggests" plus a study chip only when a rule fires.
6. No streaks, no scores-as-grades, no "great job sleeping!" PRODUCT.md anti-references apply.

---

## 4. Data layer

### 4.1 Reality check: getting wearable data into a Next.js web app
HealthKit and Health Connect are **on-device APIs**. A browser cannot call them [inferred, from platform architecture]. The ingest paths, ranked:

| Path | Covers | Effort | Notes |
|---|---|---|---|
| **Manual morning check-in** | everyone | low | Fallback and v1 (§6.7) |
| **Oura API v2** (server OAuth2) | Oura users | low | Endpoints: `daily_sleep`, `daily_readiness` (contributors), `sleep` (`average_hrv`, `lowest_heart_rate`, `average_breath`, `efficiency`, `latency`, stage durations, `bedtime_start/end`). Webhooks "strongly recommended", about 30 s after app sync. **10-user cap until Oura approves the app.** Personal access tokens were deprecated in Dec 2025. Sleep syncs only when the user opens the Oura app [official] https://cloud.ouraring.com/v2/docs |
| **WHOOP API v2** (server OAuth2) | WHOOP users | low | `/v2/recovery`, `/v2/activity/sleep` (with `sleep_needed` breakdown), `/v2/cycle`. Scopes `read:recovery read:sleep read:cycles read:workout read:body_measurement`. v1 webhooks removed [official] https://developer.whoop.com/api/ |
| **Health Auto Export (iOS app → REST POST)** | Apple users willing to install it | low–med | Third-party app that pushes HealthKit JSON to our endpoint on a schedule (premium tier) [third-party] https://apps.apple.com/us/app/health-auto-export-json-csv/id1115567069 |
| **Apple Health `export.zip` upload** | Apple users, one-off backfill | med | Large XML; parse server-side with streaming [inferred] |
| **Native wrapper** (Capacitor or Expo) with HealthKit and Health Connect plugins | all phone users | high | The real long-term answer [inferred] |
| **Aggregator** (Terra, Junction, ROOK, Sahha) | many devices | med, plus $ | Still needs their mobile SDK for HealthKit. Terra from about $399/mo; ROOK $399/mo; Sahha $299/mo [third-party, competitor-authored pricing] https://sahha.ai/compare/terra-alternatives/ |
| Garmin Health API | Garmin users | high | Approved businesses only; the program is reportedly paused [official] https://developer.garmin.com/gc-developer-program/health-api/ ; [third-party] https://tryterra.co/blog/garmin-connect-developer-program-pause |
| Fitbit → **Google Health API** | Fitbit and Pixel users | med | Legacy Fitbit Web API sunset in **Sept 2026**; users must re-consent through Google OAuth [third-party] https://sahha.ai/blog/fitbit-api-sunset-migration/ |

### 4.2 Apple HealthKit types we need
All identifiers below were verified in Apple's identifier list (developer.apple.com, 2026-10-16) [official].

| Identifier | Unit | Use | Quirks |
|---|---|---|---|
| `HKCategoryTypeIdentifier.sleepAnalysis` with values `inBed`, `asleepUnspecified`, `awake`, `asleepCore`, `asleepDeep`, `asleepREM` | category intervals | TST, time in bed, onset, wake, awake minutes, wake count | Stage values exist from iOS 16; older or third-party data gives `asleepUnspecified`. Stage samples overlap the `inBed` sample but not each other. Apple Watch writes `awake` only *between* sleep samples. Store `HKMetadataKeyTimeZone`. Multiple sources produce duplicate sessions; "Health combines overlapping Sleep sessions" (Bevel) [official] https://developer.apple.com/documentation/healthkit/hkcategoryvaluesleepanalysis |
| `heartRateVariabilitySDNN` | ms | Legacy HRV | **SDNN**, not RMSSD [official]. Apple publishes no sampling schedule. Sampling is sparse and irregular: reports range from about every 2–5 h in the day to more often overnight, and AFib History raises frequency [third-party] https://doc.peakwatch.co/en/guide/frequency-of-hrv-measurement.html . Daytime spot values are confounded; even drinking water can shift HRV acutely [third-party, Altini] https://marcoaltini.substack.com/p/apple-watch-and-heart-rate-variability |
| `heartRateVariabilityRMSSD` | ms | Preferred HRV | **New in iOS/watchOS 27.0** [official]. Labelled "Recovery HRV" in Health; written by Series 12 and Ultra 4. Apple's doc page is a stub with no computation documented. Cannot be derived from SDNN [third-party] https://github.com/MBombeck/HealthLog/issues/1110 |
| `restingHeartRate` | count/min | RHR | Apple *estimates it from sedentary daytime samples*. It "may delete earlier samples and replace them with better estimates" for the current and previous day [official]. It is **not** an overnight minimum, so it is not comparable to Oura or WHOOP RHR. Prefer computing the overnight low from `heartRate` inside the sleep window (Bevel's "Bevel + Entire sleep") |
| `heartRate` | count/min | Overnight low and average | Samples may carry motion-context metadata (sedentary after ≥5 min still) [official] |
| `respiratoryRate` | count/min | Optional recovery input | Recorded automatically during sleep on Apple Watch [official] |
| `appleSleepingWristTemperature` | °C | Optional illness flag | Read-only; one absolute value per night. Health shows a deviation only after about 5 nights; we must compute our own baseline [official] |
| `oxygenSaturation` | % | Optional | Unavailable on some US watches sold after Jan 18 2024 [official] |
| `stepCount`, `activeEnergyBurned`, `basalEnergyBurned` | count, kcal | NEAT and expenditure context | iPhone and Watch both write. **Use `HKStatisticsQuery` / `HKStatisticsCollectionQuery`, which dedupe by source priority. Never sum raw samples** [official behaviour, inferred application] |
| `bodyMass`, `bodyFatPercentage`, `leanBodyMass` | kg, % | Physique trend | Smart scales write these. BIA body-fat is noisy, so use trends only [inferred] |
| `dietaryEnergyConsumed`, `dietaryProtein` (+ other macros) | kcal, g | If the user logs food elsewhere | Duplicates if they also log in our app [inferred] |
| `timeInDaylight`, `appleSleepingBreathingDisturbances` | min, count | Later: journal auto-tags | iOS 17 / iOS 18 |
| `HKHeartbeatSeriesSample` (`HKDataTypeIdentifierHeartbeatSeries`) | beat timestamps | Compute our own RMSSD | iOS 13+; sparse; native code required [official] |

**Not available to us:** Apple Sleep Score, Readiness and Vitals ranges have no HealthKit identifier [official, by absence].

**Sleep-stage accuracy:**
- Apple Watch detects sleep vs wake well (≥95% sensitivity). Stage agreement is moderate (stage sensitivity about 50–86%) [official primary] https://doaj.org/article/386a1a380203416bb36db24bfc93f4df
- Apple's own white paper maps "Deep" to N3 and "Core" to N1+N2 [official] https://www.apple.com/kr/health/pdf/Estimating_Sleep_Stages_from_Apple_Watch_Oct_2025.pdf
- **So: score duration, timing and interruptions; only *display* stages.**

### 4.3 Android Health Connect types we need
All verified on developer.android.com [official].

| Record | Permission | Notes |
|---|---|---|
| `SleepSessionRecord` | `READ_SLEEP` | `stages`: UNKNOWN 0, AWAKE 1, SLEEPING 2, OUT_OF_BED 3, LIGHT 4, DEEP 5, REM 6, AWAKE_IN_BED 7 |
| `HeartRateVariabilityRmssdRecord` | `READ_HEART_RATE_VARIABILITY` | **RMSSD** (`heartRateVariabilityMillis`); instantaneous |
| `RestingHeartRateRecord` | `READ_RESTING_HEART_RATE` | Semantics vary by writer app [inferred] |
| `RespiratoryRateRecord`, `SkinTemperatureRecord` (deltas, feature-flagged), `OxygenSaturationRecord` | respective `READ_*` | optional |
| `StepsRecord`, `ActiveCaloriesBurnedRecord`, `TotalCaloriesBurnedRecord` | respective `READ_*` | Use the aggregate API, which handles duplicates |
| `WeightRecord`, `BodyFatRecord`, `LeanBodyMassRecord`, `NutritionRecord`, `ExerciseSessionRecord` | respective `READ_*` | |
| History and background | `READ_HEALTH_DATA_HISTORY`, `READ_HEALTH_DATA_IN_BACKGROUND` | **The default read window is 30 days before the first grant.** Older data needs the history permission. Reinstalling resets permissions. Page size 1000; back off on quota errors |

Sources: https://developer.android.com/health-and-fitness/guides/health-connect/plan/data-types ; https://developer.android.com/health-and-fitness/guides/health-connect/develop/read-data ; https://developer.android.com/reference/kotlin/androidx/health/connect/client/records/SleepSessionRecord [official]

### 4.4 Normalisation rules (our assumptions, marked [inferred])
1. **Night attribution:** a night belongs to the **local date of the final wake time**. Oura's `day` field and WHOOP's cycle model both use wake-day framing.
2. **Main sleep vs nap:**
   - Merge asleep intervals with gaps ≤15 min into one session. Bevel merges naps within about 15 min of main sleep [official].
   - Main sleep = the longest session ending between 03:00 and 14:00 local.
   - Other asleep sessions of 15 min to 3 h are naps.
3. **One source per metric per night.** Priority: dedicated wearable API (Oura or WHOOP) > Apple Watch > other HealthKit writers > phone-only. Users can override, as in Bevel [official].
4. **HRV:**
   - Store `{valueMs, method: 'rmssd'|'sdnn', source, ts}`.
   - Night HRV = the **median** of the chosen method's samples inside the main-sleep window. For HealthKit SDNN, require ≥2 samples, else null.
   - **A baseline uses one (method, source) pair only.** Changing source or method restarts calibration.
   - Analyse **ln(HRV)**; the ln transform is standard in HRV monitoring (Plews 2013) [official] https://pubmed.ncbi.nlm.nih.gov/23852425/
5. **RHR:**
   - Vendor overnight value (WHOOP `resting_heart_rate`, Oura `lowest_heart_rate`) first.
   - Otherwise the lowest 5-min rolling mean of `heartRate` within main sleep.
   - Otherwise HealthKit `restingHeartRate`, flagged `method:'apple_daytime'` with its own baseline. Re-read the previous 2 days, because Apple revises them.
6. **Reject implausible values:** TST <2 h or >14 h (store, but exclude from baselines); HRV outside 5–250 ms; RHR outside 30–120 bpm.

### 4.5 Baselines: rolling windows and z-scores
Precedents:
- HRV4Training: a **60-day** "normal range" with a **7-day rolling** ln-rMSSD as the daily "baseline". The band is **±0.5 SD** in the research protocol and **±0.75 SD** in Pro [third-party, vendor blog] https://www.hrv4training.com/blog2/training-prescription-guided-by-heart-rate-variability ; https://www.hrv4training.com/blog2/the-importance-of-normal-values
- Oura: 14 days vs 2–3 months [official].
- Garmin: 7 days vs a 3-week+ baseline band [official].
- Plews 2012: a falling 7-day ln-rMSSD average *and* a falling CV of that average preceded non-functional overreaching [official] https://pubmed.ncbi.nlm.nih.gov/22367011/

```ts
// Our assumption, built from the precedents above.
type Daily = { date: string; value: number | null }; // already ln-transformed for HRV

function rollingBaseline(series: Daily[], d: number) {
  const short = window(series, d - 6, d).filter(valid);          // 7 days incl. today
  const long  = window(series, d - 60, d - 1).filter(valid);     // previous 60 days
  if (short.length < 4 || long.length < 14) return { status: 'calibrating' as const };
  const longW = winsorize(long, 3);                              // clip at ±3 SD (artefacts)
  const mu = mean(longW), sd = Math.max(stdev(longW), SD_FLOOR); // SD_FLOOR: lnHRV 0.05, RHR 1 bpm
  const s7 = mean(short);
  return { status: 'ok' as const, s7, mu, sd, z: (s7 - mu) / sd };
}
```

- **Long-window choice:** 60 days follows HRV4Training and Oura's "2 months". Excluding today avoids self-contamination [inferred].
- **Thresholds:** an HRV flag when z ≤ −0.75, a one-sided low band [third-party precedent]. An RHR flag when `s7 − mu ≥ max(3 bpm, 0.75·sd)`; Oura's contributor drops at +3–5 bpm [official].
- **Persistence:** flag only if the condition holds on ≥3 of the last 5 days. This avoids flicker [inferred].

---

## 5. Science for the judge (short)

| Study | Design | Finding relevant to a physique coach | Practical threshold we take |
|---|---|---|---|
| **Nedeltcheva 2010**, Ann Intern Med [official] https://pubmed.ncbi.nlm.nih.gov/20921542/ | 10 overweight adults, 14 d moderate caloric restriction, 8.5 vs 5.5 h in bed (measured sleep 7 h 25 vs 5 h 14) | Same ~3 kg loss. **Fat lost 1.4 vs 0.6 kg; fat-free mass lost 1.5 vs 2.4 kg** (−55% fat share, +60% FFM loss). More hunger, higher acyl-ghrelin, lower RMR (1,505 vs 1,391 kcal), RQ shifted toward less fat oxidation | ~5–5.5 h actual sleep during a cut is clearly harmful to body-composition quality |
| **Wang 2018**, Sleep [official] https://pubmed.ncbi.nlm.nih.gov/29438540/ ; https://pmc.ncbi.nlm.nih.gov/articles/PMC8591680 | 36 overweight adults, 8 wk at 95% of RMR; restriction group cut time in bed on 5 nights/wk with 2 catch-up nights (TST −169 ± 75 min/wk) | Same weight loss (−3.3 vs −3.2 kg). **Fat share of loss: median 83% vs 58%** (p = 0.016). Weekend catch-up did not fully rescue it | Even **~1 h less on weeknights** matters over 8 weeks; don't let weekend lie-ins mask weekday deficits (judge on the weekday mean too) |
| **Al Khatib 2017**, Eur J Clin Nutr (meta) [official] https://pubmed.ncbi.nlm.nih.gov/27804960/ | 11 studies, 172 people; partial deprivation (3.5–5.5 h in bed) | **+385 kcal/day intake**; no change in energy expenditure | Explains "stalled loss + short sleep": check logged intake on post-short-sleep days |
| **Tasali 2022**, JAMA Intern Med [official] https://pubmed.ncbi.nlm.nih.gov/35129580/ | RCT, 80 overweight short sleepers (<6.5 h); one sleep-hygiene session targeting 8.5 h in bed | **+1.2 h sleep → −270 kcal/day intake** vs control | A realistic ask is **+45–75 min/night**; one counselling session achieved +1.2 h |
| **Knowles 2018**, J Sci Med Sport (SR, 17 studies) [official] https://pubmed.ncbi.nlm.nih.gov/29422383/ | Deprivation vs restriction and resistance exercise | Total deprivation had "little effect" on strength. **Consecutive nights of restriction reduce multi-joint (not single-joint) force output.** Motivation (caffeine, groups) offsets it | Don't react to one night. React to **≥2–3 consecutive short nights**, watching compounds |
| **Reilly & Piercy 1994**, Ergonomics [official] https://pubmed.ncbi.nlm.nih.gov/8112265/ | 8 men, 3 h/night × 3 nights | Max bench, leg press and deadlift fell (curl unaffected). **Submaximal 20-rep performance declined significantly from night 2** | Rep-based (hypertrophy) work degrades early, so watch reps at fixed load, not just top singles |
| **Craven 2022**, Sports Med (meta, 69 papers) [official] https://pubmed.ncbi.nlm.nih.gov/35708888/ | ≤6 h vs >6 h | Mean **−7.56%** performance. Consistent harm only with **deprivation and late restriction** (waking early); about **−0.4% per hour awake** before the task; **AM sessions largely unaffected** | If sleep loss is unavoidable, cut from the *start* of the night, not the end, and train earlier |
| **Lamon 2021**, Physiol Rep [official] https://pubmed.ncbi.nlm.nih.gov/33400856/ | 13 adults, 1 night total deprivation, crossover | **MPS −18%, cortisol +21%, testosterone −24%** | Mechanistic support for "sleep protects lean mass" |
| **Saner 2020**, J Physiol [official] https://pubmed.ncbi.nlm.nih.gov/32078168/ | 24 men, 5 nights × 4 h | MyoPS 1.24 vs 1.53 %/day (about −19%); HIIT on the restricted days kept it at control levels | Training itself partially protects; keep training during short-sleep weeks |
| **Leproult & Van Cauter 2011**, JAMA [official] https://pubmed.ncbi.nlm.nih.gov/21632481/ ; https://pmc.ncbi.nlm.nih.gov/articles/PMC4445839/ | 10 young men, 8 nights × 5 h in bed (TST 4 h 48) | Daytime testosterone **−10–15%**; vigour down | Supporting context only |
| **Dáttilo 2011**, Med Hypotheses [official] https://pubmed.ncbi.nlm.nih.gov/21550729/ | Hypothesis paper | Sleep debt → higher cortisol, lower testosterone and IGF-1 → a proteolytic environment, so less synthesis and more degradation | Mechanism only. **Don't cite as outcome evidence** |
| **Watson 2015**, AASM/SRS consensus [official] https://pubmed.ncbi.nlm.nih.gov/26039963/ | Consensus | Adults: **≥7 h** regularly | Default goal floor of 7 h |
| **Lauderdale 2008**, Epidemiology [official] https://pubmed.ncbi.nlm.nih.gov/18854708/ | 669 adults, actigraphy vs self-report | Self-report **overestimates**: +1.2 h at 5 h actual, +0.4 h at 7 h actual (mean 6.8 vs 6.0 h) | Manual-entry thresholds sit about 0.5 h higher than wearable thresholds |
| **Saw 2016**, BJSM (SR) [official] https://pubmed.ncbi.nlm.nih.gov/26423706/ | 56 studies | "Subjective self-reported measures trump commonly used objective measures" for training response | Justifies a manual wellness check-in as a first-class signal |

**Thresholds the judge uses** (our synthesis [inferred] from the table):
- **Short sleep:**
  - Wearable: 14-night mean TST **< 6.5 h**, or weekday mean < 6.5 h.
  - Self-report: **< 7.0 h** (Lauderdale bias).
  - "Severe": wearable < 6.0 h, self-report < 6.5 h.
- **Acute:** ≥2 consecutive nights < 6 h (wearable) or < 6.5 h (self-report).
- **Target fix:** +45–60 min/night toward a goal of ≥7 h (8 h default).

---

## 6. Sleep + recovery spec we can implement

### 6.1 Inputs (data model)
```ts
type SleepNight = {
  date: string;                 // local wake date
  source: 'manual'|'oura'|'whoop'|'healthkit'|'healthconnect';
  bedtime: string; wakeTime: string;           // ISO local
  timeInBedMin: number;
  asleepMin: number | null;     // null for manual unless the user enters it (see 6.7)
  awakeMin?: number; wakeCount?: number;
  stages?: { deepMin: number; remMin: number; coreLightMin: number };
  napsMin?: number;
  quality1to5?: number;         // manual
  vendorScore?: { name: 'whoop_sleep_performance'|'oura_sleep'|'apple'; value: number };
};
type NightPhysio = {
  date: string; source: string;
  hrv?: { valueMs: number; method: 'rmssd'|'sdnn'; samples: number };
  rhr?: { bpm: number; method: 'overnight_low'|'vendor'|'apple_daytime' };
  respRate?: number; wristTempDeltaC?: number;
  vendorRecovery?: { name: 'whoop'|'oura_readiness'; value: number };
};
type Wellness = { date: string; energy1to5?: number; soreness1to5?: number; stress1to5?: number }; // Hooper-style, https://pubmed.ncbi.nlm.nih.gov/8571005/
```
Training (e1RM, sets, RIR), bodyweight and food come from existing or parallel features. The judge consumes these signals:
- `weightTrendPctPerWeek`
- `liftTrend[]` (e1RM per key compound)
- `kcalAdherence`

### 6.2 Baselines and calibration
| Metric | Short | Long | Min. data to show status |
|---|---|---|---|
| TST | 7-night mean, plus weekday-only mean | goal (user-set, clamped 7–9 h) | 1 night (value); 7 nights (trend) |
| Bedtime consistency | onset vs **median of previous 13 nights** (Apple) | — | 7 nights |
| ln HRV (per method and source) | 7-day mean (≥4 valid) | previous 60 days (≥14 valid) | 14 valid in 28 days |
| RHR (per method) | 7-day mean (≥4) | previous 60 days (≥14) | 14 valid in 28 days |
| Wellness | 3-day mean | 28-day mean | 5 entries |

Mark everything "[our assumption]" in code comments. The precedents are in §2 and §4.5.

### 6.3 Sleep Score (0–100): Apple's split, our curves
Structure from Apple [official]. Curves fitted to the5krunner's reported Apple deductions [third-party]. Goal and banding are ours [inferred].
- **Duration (50):**
  - `deficitH = max(0, goalH − asleepH)`; `penalty = 5.5·deficitH + 0.5·deficitH²`. This gives 6 at 1 h and 13 at 2 h, matching the reported Apple points.
  - `duration = max(0, 50 − penalty)`.
  - No stage deductions (stage accuracy, §4.2).
- **Bedtime consistency (30):**
  - `late = onset − median(onset, prev 13 nights)` in minutes.
  - If `late > 15`: `−(late − 15)/4.5`, which reaches 30 at 150 min.
  - If `early > 60`: `−min(6, (early − 60)/30)`.
  - Floor 0. Use the full 30 until 7 nights exist.
- **Interruptions (20):**
  - `−max(0, awakeMin − 11)/4 − max(0, wakeCount − 2)/2`, floor 0.
  - Manual: wake bucket 0 → 20, 1–2 → 17, 3+ → 10 [inferred].
- **Bands:** <70 "Short / disrupted", 70–84 "OK", ≥85 "Solid". These cut-offs agree across Bevel and Oura [official]. On the dashboard use colour, icon and one word, with no number (PRODUCT.md).

### 6.4 Sleep need and debt
- `need = goal − napsMin(today)`. This is WHOOP's structure without the strain term [official structure; inferred values].
- The goal defaults to 8 h, clamped 7–9 h, and is set by the user. **Never learn it from history**; see Bevel's criticised 90-day average (B2).
- `debt7 = Σ_{i=1..7} max(0, need_i − asleep_i)`. Display it ("4 h 10 m short over 7 nights").
- A weighted decay is optional later; WHOOP says debt "follows you for a few days" [official, via snippet].
- Bedtime planner: `lightsOut = alarm − need − 15 min latency` [inferred; Oura's ideal latency is 15–20 min, official].

### 6.5 Recovery status (no numeric score in v1)
Evaluate daily. Each flag must hold on ≥3 of the last 5 days [inferred].
- `F_sleep`: 7-night mean asleep ≤ goal − 60 min, **or** < 6.0 h (wearable) / < 6.5 h (manual).
- `F_hrv`: HRV z ≤ −0.75 (one-sided) [HRV4Training band, third-party].
- `F_rhr`: RHR 7-day − μ60 ≥ max(3 bpm, 0.75·sd) [Oura 3–5 bpm, official].
- `F_subj`: 3-day mean energy ≤ 2/5 **or** soreness ≥ 4/5.

| Status | Rule | Label (action-worded, like Apple Readiness) |
|---|---|---|
| Calibrating | baselines not ready | "Calibrating · N nights to go" |
| Green | 0 flags | "Recovered" (dashboard only; **assistant silent**) |
| Amber | 1 flag | "Watch sleep", "HRV low", etc. (names the flag) |
| Red | **≥2 flags** (Apple Vitals multi-outlier logic [official]) | "Under-recovered" |

- Illness guard: if wrist temperature rises ≥0.5 °C over baseline, or respiratory rate rises ≥1.5 br/min over baseline, with `F_hrv` or `F_rhr`, say "possible illness, not training" and suppress training changes [inferred thresholds; Apple and Oura list illness as a cause, official].
- Optional number if product insists [inferred]: `R = clamp(50 + 20·(0.5·zHRV − 0.3·zRHR + 0.2·zSleep), 0, 100)` with `zSleep = (asleep7 − goal)/45 min`. HRV is weighted highest because WHOOP says HRV carries most of the weight [official, via snippet]. **Recommendation: don't ship the number.** Vendors' numbers don't agree ("scores won't match others", Bevel FAQ [official]), and PRODUCT.md wants glanceable states.

### 6.6 Judge rules (emit `CoachDecision`-style objects, max 1 sleep rule per week)
Each rule outputs `{id, verdict, evidence:{windowNights, nightsLogged, numbers…}, action, citations[]}`. The assistant renders it; the LLM may not add numbers.

1. **S1 · `fix_sleep_before_cutting`** (must). This is the founder's example.
   - Preconditions: phase = cut; ≥10/14 nights logged; ≥3 wks of weight and lift data.
   - Trigger: short sleep (14-night or weekday mean, §5 thresholds) **and** at least one of:
     - ≥2 key compounds with e1RM down ≥2.5% (last 2 wks vs prior 3 wks; coordinate with training research);
     - fixed-load reps down;
     - `F_hrv`;
     - `F_rhr`.
   - Action: **block any calorie-reduction suggestion for 14 days**; set a sleep target of +45–60 min; suggest a bedtime.
   - Evidence chips: Nedeltcheva 2010, Wang 2018, Knowles 2018.
   - Example copy: "You're losing on target (−0.6%/wk), but sleep is averaging 6h04m over 14 nights and squat/bench e1RM are down 3–4% since Sep 22. Fix sleep before cutting calories further: hold intake, aim for lights-out 22:30."
2. **S2 · `short_sleep_intake_drift`** (should).
   - Trigger: cut, weight trend flat ≥2 wks, short sleep, **and** logged kcal on days after <6 h nights ≥250 kcal above days after ≥7 h nights (≥4 of each).
   - Copy names the pattern. It cites Al Khatib (+385 kcal/day) and Tasali (−270 kcal with +1.2 h).
3. **S3 · `consecutive_short_nights`** (should). Silent by default.
   - Trigger: ≥2 consecutive nights <6 h (wearable) or <6.5 h (manual) **before a scheduled heavy compound day**.
   - Shown only in the session screen: "Expect reps at fixed load to be down; keep the top set, drop a back-off set if RIR collapses."
   - Cites Knowles, Reilly & Piercy, Craven (suggest AM training if possible).
4. **S4 · `sleep_ruled_out`** (must, as a guard).
   - When lifts drop **and** sleep is fine (≥ goal − 30 min, no flags), sleep rules emit nothing and pass a `sleepOk:true` fact to the training and nutrition rules. This stops the assistant blaming sleep by default.
5. **S5 · `possible_illness`** (should): the illness guard from §6.5, which overrides S1 to S3.

Frequency: S1 and S2 at most once per weekly verdict (WHOOP's Monday cadence [official]). S3 only in-session. Nothing on green.

### 6.7 Manual-entry fallback (no wearable)
- **Morning check-in row on Home**, shown once until noon and dismissible. It must not compete with Start Workout.
  1. Bedtime and wake time, prefilled with the 7-day median, ±15 min steppers.
  2. "Hours actually asleep", prefilled as time in bed − 20 min, editable.
  3. Wake-ups: 0 / 1–2 / 3+.
  4. Optional energy and soreness, 1–5.
  - Target: ≤10 s. The assistant also parses chat ("slept 5.5h") [inferred].
- **Thresholds:** self-report thresholds sit **+0.5 h** above wearable ones (Lauderdale 2008 [official]). Copy says "self-reported".
- **Sleep Score:** fully computable (§6.3) from duration, bedtime and wake bucket.
- **Recovery status:** uses `F_sleep` and `F_subj` only. Red needs both. Subjective wellness is a valid signal (Saw 2016 [official]).
- **Optional:** manual morning RHR/HRV entry from any HRV app, stored as `method:'manual_rmssd'` with its own baseline (later).
- **Backfill:** allow entering the last 7 nights in one sheet on onboarding, so S1 can arm sooner. These are flagged "recalled" and get lower weight [inferred].

### 6.8 Assistant context payload (feeds `app/api/assistant/route.ts`)
```ts
type SleepRecoveryContext = {
  window: { nights: 14; logged: number; sources: string[] };
  sleep: { mean14h: number; weekdayMeanH: number; goalH: number; debt7h: number;
           consistencyMedianOnset: string; lastNight?: { asleepH: number; score: number } };
  recovery: { status: 'calibrating'|'green'|'amber'|'red'; flags: string[];
              hrv?: { method: 'rmssd'|'sdnn'; z: number }; rhr?: { deltaBpm: number } };
  vendor?: { whoopRecovery?: number; ouraReadiness?: number };   // display-only
  judge?: { ruleId: string; verdict: string; numbers: Record<string, number>; citations: string[] };
};
```
- System-prompt contract: "Only cite numbers present in this object. If `status==='calibrating'`, say how many nights remain. Never interpret a single night's HRV."
- Add an eval in `evals/` that fails on any unlisted metric [inferred; addresses the W5 failure mode].

### 6.9 Open risks
- WHOOP sleep-performance bands and HRV method details are third-party only.
- Apple Readiness details are press-only.
- Thresholds in §6.3–6.6 are our assumptions and need dogfood calibration. Log every fired rule with its inputs for review.
- Health Auto Export and the aggregators are third-party dependencies, and their pricing and terms may change.
- e1RM-drop thresholds must be agreed with the training-research report, and the weight-trend method with the nutrition report.
