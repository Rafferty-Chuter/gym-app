# I. Does Gym AI fill a real market gap? (as of 20 October 2026)

**Short answer:** A gap exists, but it is narrower than "nobody combines nutrition, training and sleep". Several apps now combine all three, and some already send a weekly cross-domain review: Bevel, Macro Trainer, Honedly, Zolt, and Repwise (not yet launched). What none of the large players offers, and what I could not find done with this rigour anywhere, is a **deterministic, quantified verdict on a physique goal**: the weight-rate miss or lift drop is attributed to a measured cause, every number shows its working, and the verdict stays silent when data is thin. The gap is real for a small segment (UK lifters who already log food and lifts and wear an Apple Watch), and it is closing. MacroFactor openly says that deeper integration between its two apps "may come later".

**Method and caveats.** Product facts come from official pages, App Store listings and press. Some prices come from competitor-run blogs (SensAI, Nutrola); these are marked †. My tools could not reach Reddit, so the user-need evidence comes from the WHOOP community forum, the Cronometer forum and App Store reviews, and it is anecdotal. Bracketed numbers point to the sources list.

## 1. Comparison table

| Product | Adaptive nutrition (TDEE / targets) | Strength progression | Sleep / recovery | Cross-domain causal weekly report | AI coach | Price (UK where found) | Platform |
|---|---|---|---|---|---|---|---|
| **Gym AI** (for reference) | Yes: adaptive expenditure from intake + EMA trend, weekly target update | e1RM trends, hard sets per muscle vs evidence ranges, deload timing | Apple Watch via Health Auto Export | **Yes: deterministic, quantified, with minimum-data gates** | Claude explains engine verdicts | n/a | Web app, data on one device |
| MacroFactor (Nutrition) | **Best in class**: adaptive expenditure, weekly check-in [1][5] | No | No [1] | No (nutrition only) | AI photo and text food logging; rule-based coaching [1][4] | £62.99/yr, £10.99/mo; bundle with Workouts £89.99/yr [6] | iOS, Android |
| MacroFactor Workouts (launched Jan 2026) | Shares weight, metrics and photos with Nutrition only [2] | Strong: rule-based auto-progression of load and reps, RIR, per-muscle volume charts, PPL and undulating schemes (Sept 2026) [2][4] | No [1][2] | **No: "no shared coaching or automatic program adjustments between the apps at launch"** [2] | No generative AI coach; AI weight-stack reader [2][4] | £69.99/yr [7] | iOS, Android, Apple Watch (beta) [4] |
| Bevel | Calorie and macro goals and a 6M-food database; **no adaptive TDEE found** [9][11] | Strength Builder (700+ exercises); progression by exercise and muscle group in v3.2 [9][10] | Strong: recovery, sleep, strain, HRV [8][9] | Partial: LLM check-ins that "flag what's helping or hurting your progress"; weekly summaries reported but unverified [10][11] | Bevel Intelligence (Pro), rebuilt in v3.0 (Apr 2026) with proactive check-ins [10][14] | Core free; Pro £14.99/mo or £99.99/yr [11] | iOS only [12] |
| WHOOP | Imports macros from other apps via Apple Health; **no native food log** [18][19] | Strength Trainer: muscular load, volume, PRs (May 2026) [15] | Best in class | Partial: Weekly Performance Assessment; Behavior Insights link journal behaviours to *Recovery* (association, not causation) [16][17] | WHOOP AI, which generates workouts [15] | £169 / £229 / £349 per yr (One / Peak / Life)† [20] | Wearable + iOS/Android |
| Oura | Meals: AI photo with qualitative macros, not calories (May 2025) [21] | No manual lift logging; Cardio Effort (20 Oct 2026) [22] | Best in class | No physique report found | Oura Advisor [21] | Membership £5.99/mo or £69.99/yr, plus the ring [23] | Ring + iOS/Android |
| Cronometer | **No adaptive TDEE** (long-running forum requests) [24] | No | No | No | No AI in Gold† [25] | Gold about $49.99/yr† [25] | iOS, Android, web |
| Carbon Diet Coach | Yes: weekly check-in recalibrates macros [26] | No | No | No (nutrition only) | No | $79.99/yr [26] | iOS, Android |
| RP Diet Coach | Yes: weekly review adjusts macros [27] | Separate app | No | No | AI label scan [27] | About $99–150/yr (unclear) [27] | iOS, Android |
| RP Hypertrophy | No | Strong: mesocycles adjusted by pump, soreness and workload feedback [28] | No | No | No | £34.99/mo or £299.99/yr [28] | iOS, Android |
| Hevy | No | Logger (17M+ users); Hevy Trainer auto-progression is Pro, reportedly Feb 2026 [29][30] | No HRV or sleep inputs† [30] | No | No; algorithmic, "not AI" [29] | About $23.99/yr† [30] | iOS, Android, web, Watch |
| Strong | No | Logger; no auto-progression [31] | No | No | No | $29.99/yr [31] | iOS, Android, Watch |
| Fitbod | No | Auto-generated, recovery-aware by muscle group† [32] | No wearable HRV or sleep† [32] | No | ML, not an LLM† | $95.99/yr† [32] | iOS, Android |
| Juggernaut AI | No | Powerlifting autoregulation with a daily readiness check† [33] | Readiness questionnaire only | No | Algorithmic | About $34.99/mo† [33] | iOS, Android |
| Ladder | Static, member-set targets; AI "Smart Log" [34] | Coach-written plans [34] | No [34] | No | Human coaches [34] | $179.99/yr [34] | iOS only |
| Apple Health / Watch (iOS 27) | No; camera food read is qualitative and does not write to Health [36] | No | Readiness score 0–10, Insights tab, sleep (Sept 2026; redesigned Health app is US English first) [35] | Partial: daily Insights across sleep, readiness and fitness; no physique link [35] | AI coach ("Health+") shelved [37] | Free | Apple only |
| Garmin Connect+ | Food logging (Jan 2026); targets appear static [38] | Watch strength activities | Strong | Partial: Active Intelligence links nutrition to training and sleep [39] | Active Intelligence | £6.99/mo or £69.99/yr [40] | Garmin + iOS/Android |
| Google Health Premium | Photo and voice food logging; no adaptive TDEE found [41] | Generic plans | Yes | Partial: Gemini coach reasons over sleep, fitness and nutrition [41] | Gemini coach (generally available May 2026; UK preview earlier) [41] | £7.99/mo [41] | Fitbit/Pixel + iOS/Android |
| Eight Sleep | No | No | Sleep only (Pod + Autopilot) | No | Autopilot temperature AI | Pod 5 from £2,349 + about £399/yr (unclear) [42] | Hardware |
| SensAI | Chat advice only [43] | AI plans adapted to HRV and sleep [43] | Via Apple Health | Partial (recovery to training) | Yes | Not verified | iOS |
| **Macro Trainer** (2026 indie) | Plateau detection proposes macro changes [44] | Programs, volume trends, deload proposals [44] | HRV, RHR and sleep via Apple Health / Health Connect [44] | **Yes (claimed)**: weekly report card, "what worked, what slipped" [44] | On-device chat (beta) [44] | $59.99 one-off [44] | iOS, Android, Mac, Linux |
| **Honedly** (2026 indie) | Adaptive TDEE (Pro+) [45] | RPE auto-progression, body-map volume [45] | Sleep, HRV and RHR via Apple Health zip or Shortcut [45] | **Yes (claimed)**: "Claude reviews your sleep, load, and macros every Sunday"; plateau detection across weight, load and sleep [45] | Claude | $19.99–29.99/mo (may not be charging yet) [45] | Web PWA (US-centric) |
| **Zolt** (2026 indie) | Adaptive TDEE, weekly check-in [46] | Workouts by text, PRs [46] | Sleep, HRV, RHR → readiness [46] | Partial: weekly check-ins, daily combined score [46] | Text/iMessage coach | Paid tiers (INR seen) [46] | iMessage, iOS |
| **Repwise** (pre-launch) | Weekly TDEE re-estimate [47] | MEV/MAV/MRV volume landmarks, per-muscle heat map [47] | "Recovery" (no sleep detail) [47] | **Yes (claimed)**: weekly report across training, nutrition, body and recovery [47] | No ("not AI-generated plans") | Free [47] | Not yet released |
| ChatGPT Health / Claude | Ad hoc analysis by request | — | Apple Health connection | Only if the user asks | General LLM | ChatGPT Health **not available in UK** [48]; Claude Apple Health in beta [49] | Apps |

## 2. What is unique, and what is already done well

**Done well elsewhere, often cheaper or free:**
- **Adaptive expenditure:** MacroFactor is the reference product (600k users) [1]. Carbon, RP Diet, Zolt, Honedly and Repwise also do it.
- **Lift logging and progression:** Hevy (17M+ users) [29], Strong, MacroFactor Workouts, RP Hypertrophy and Juggernaut. Repwise already markets volume landmarks per muscle [47].
- **Sleep and recovery scoring:** WHOOP, Oura, Bevel and Garmin do this, and Apple now ships a free Readiness score [35]. Gym AI should not try to compete here.
- **AI "describe it" food logging:** This is now a commodity. MacroFactor, Bevel, Ladder, Oura, Garmin and Macro Trainer all have a version [1][11][34][21][38][44].
- **Cross-domain weekly review as a concept:** This exists. Honedly is close to Gym AI in architecture (web PWA, Claude weekly review, Apple Health via Shortcut) [45]. Macro Trainer sends a weekly report card with deload proposals informed by recovery data [44]. WHOOP has linked logged behaviours to recovery for years [16][17], and Bevel's LLM check-ins aim at the same job [10].

**What looks genuinely uncommon:**
1. **The outcome is the physique, not a recovery score.** WHOOP, Oura and Bevel optimise readiness, and MacroFactor optimises weight. I found no major product that ties a lift trend, calorie balance and sleep into one verdict about a cut or bulk.
2. **Deterministic, quantified attribution.** An example is "+300 kcal/day × 7 days ÷ 7,716 kcal/kg ≈ 0.3 kg/wk". Rivals either generate the narrative with an LLM (Bevel, Honedly) or produce opaque scores; Bevel's scoring is criticised for not showing its inputs [12]. Indie apps claim "connects what you did to what happened" but do not show the arithmetic [44].
3. **Silence when data is thin** as an explicit product rule. I did not see this anywhere.
4. **UK food data** (CoFID plus UK chains). The indie all-in-ones are US-centric: Honedly lists US chains [45], and ChatGPT Health is blocked in the UK [48].

The weakness: items 2 and 3 are execution quality, not features, so a competitor can copy them once it notices.

## 3. Who the gap is real for, and the biggest risks

**Target user:** a UK intermediate-to-advanced natural lifter, mid-cut or mid-lean-bulk, who already logs food (often MacroFactor), logs lifts (Hevy, Strong or MacroFactor Workouts) and wears an Apple Watch. Today they correlate across three apps by hand. Anecdotal evidence:
- WHOOP users say they log in Cronometer or MyFitnessPal and correlate with WHOOP manually. One user built his own app on WHOOP's API to adjust macros and training from recovery (thread Aug 2025 to Sep 2026; one staff reply, "on the radar") [19].
- A MacroFactor reviewer asked for sleep and tiredness inputs to feed macro adjustments [6].
- Cronometer users have requested adaptive TDEE for years [24].

This is a narrow segment. Most people will not log all three domains consistently.

**Risks, most serious first:**
1. **MacroFactor closes the loop.** It has both apps, a £89.99 bundle, the same rule-based philosophy, Apple Watch support and planned App Intents for AI agents [1][2][4][6]. Its Workouts page says deeper integration "may come later" [2]. One combined weekly check-in from them would take the best users.
2. **Bevel adds adaptive expenditure.** Bevel already covers nutrition, strength (per-muscle progression), sleep, recovery, an AI coach and 30-day body-fat and lean-mass projections, and its core is free [9][10][11]. Adaptive TDEE is a small step from there. The WHOOP lawsuit (filed March 2026) is a drag on Bevel [13].
3. **Indie clones.** Macro Trainer, Honedly, Zolt and Repwise all appeared in 2026, so "the combination" alone cannot be the moat [44]–[47].
4. **Apple Health access.** Native competitors read HealthKit directly. Gym AI depends on Health Auto Export, whose automations need its Premium tier (£1.99/mo, £6.99/yr or £24.99 lifetime). It has a 3.7★ rating from 47 ratings and a history of automation fixes [50]. Apple's free Readiness score also commoditises recovery scoring [35].
5. **Single-device storage.** WebKit deletes script-writable storage (localStorage, IndexedDB) after 7 days of Safari use without interaction with the site. Home-screen apps keep a separate counter, but developers report unexpected wipes [51]. Losing months of history breaks both the engine and the user's trust, and there is no multi-device use.
6. **Price anchoring.** Bevel's core and Repwise are free and Hevy is about $24/yr†. A paid tier must beat a MacroFactor + Hevy setup at around £90–110/yr [6][30].

## 4. Recommendations

1. **Position Gym AI as "the weekly verdict on your cut or bulk", not an all-in-one tracker or an AI coach.** Lead with "every number shows its working", physique outcomes, UK food data, and "we say nothing until the data supports it". Use the LLM to explain verdicts, not as the headline, because every rival markets an AI coach.
2. **Sit on top of incumbents rather than replacing them.** Import MacroFactor's data export [2], Strong's CSV export [31] and Hevy's (method unverified), alongside Apple Health. Win the MacroFactor + Hevy + Watch user without asking them to switch loggers. Keep in-app logging, but don't race Hevy or MacroFactor on logging polish.
3. **Fix the two trust-killers before growth.** First, durable storage: an account with encrypted cloud backup, or at minimum one-tap export and restore plus an enforced home-screen install. Second, health-data ingest: test a thin native iOS shell that reads HealthKit directly, which removes the Health Auto Export dependency, the third-party paywall and the background-sync flakiness.
4. **Don't build** recovery or readiness scores, meal plans, generic AI workout generation, more wearable integrations, social features or a bigger food database. Each is crowded or commoditised (table above). **Do build** more verdict types grounded in the engine: why a lean bulk is gaining too fast, whether a stall is caused by fatigue or by the deficit, and when to take a diet break or deload. Make the weekly report shareable as an image or PDF; online coaches who run weekly check-ins are a possible second audience (untested idea).
5. **Validate before scaling.** Run 15–25 UK lifters through 6–8 weeks of a cut. Measure (a) how far Gym AI's expenditure estimate is from MacroFactor's and (b) how often a weekly verdict changed a decision. If MacroFactor or Bevel ships an integrated weekly check-in in the meantime, the UK-specific, transparent-arithmetic angle is what is left, so test that framing early.

## 5. Sources

Dates are publication or launch dates where known. † = competitor-run or aggregator source; unverified = not confirmed on an official page.

1. MacroFactor, 2026 Annual Report (Sept 2026; 600k users; Workouts launched Jan 2026; roadmap): https://macrofactor.com/annual-report-2026/
2. MacroFactor Workouts page (features; "no shared coaching… at launch"; data export; USD prices): https://macrofactor.com/workouts/
3. MacroFactor, Jan 2026 update (Workouts launch): https://macrofactor.com/mm-jan-2026/
4. MacroFactor, Sept 2026 update (PPL, progression schemes, Watch beta, AI): https://macrofactor.com/mm-sept-2026/
5. MacroFactor help, subscriptions and bundles (USD, $89.99 bundle): https://help.macrofactorapp.com/en/articles/393-how-macrofactor-subscriptions-and-bundles-work
6. MacroFactor UK App Store (£ prices, reviews): https://apps.apple.com/gb/app/macrofactor-macro-tracker/id1553503471
7. MacroFactor Workouts UK App Store (£ prices): https://apps.apple.com/gb/app/macrofactor-workouts-tracker/id6737156524
8. Bevel homepage: https://www.bevel.health/
9. Bevel membership and pricing (free vs Pro): https://help.bevel.health/en/articles/11583937
10. Bevel features by app version (v2.2–3.2.4; v3.0 Intelligence V2; v3.0.6 body-comp projections; v3.2 strength progression by muscle group; exact dates unverified): https://help.bevel.health/en/articles/11194113
11. Bevel UK App Store (£14.99/£99.99; v3.2.4, 13 Oct): https://apps.apple.com/gb/app/bevel-all-in-one-health-app/id6456176249
12. Health App Insider, Bevel review (20 Jul 2026; iOS-only; opaque scoring; shallow nutrition and strength): https://www.healthappinsider.com/en/reviews/bevel-review
13. Fitt Insider, WHOOP sues Bevel (7 Apr 2026): https://insider.fitt.co/whoop-sues-ai-health-coach-bevel/ ; the5krunner: https://the5krunner.com/2026/04/04/whoop-sues-bevel/ (Bevel's reported 500k MAU is unverified)
14. Gadgets & Wearables, Bevel 3: https://gadgetsandwearables.com/2026/05/16/bevel-3/
15. Gadgets & Wearables, WHOOP Strength Trainer update (22 May 2026): https://gadgetsandwearables.com/2026/05/22/whoop-strength-trainer-2/
16. WHOOP, Behavior Insights: https://whoop.com/thelocker/a-new-way-to-see-insights-on-which-behaviors-affect-your-recovery
17. WHOOP, Weekly Performance Assessment: https://whoop.com/thelocker/new-weekly-performance-assessment ; Monthly: https://www.whoop.com/thelocker/monthly-performance-assessment
18. WHOOP on X, macro import via Apple Health (2023): https://x.com/WHOOP/status/1666139719934017537
19. WHOOP Community, AI nutrition feature request (Aug 2025 to Sep 2026; anecdotal): https://www.community.whoop.com/t/feature-request-ai-powered-nutrition-tracking-integration/6229
20. Tom's Guide, WHOOP UK prices† (deal article, single source): https://www.tomsguide.com/wellness/fitness-trackers/forget-fitbit-whoop-5-0-won-us-over-and-now-peak-membership-is-20-percent-off-for-prime-day
21. Oura Meals and Glucose launch (May 2025): https://ouraring.com/blog/introducing-metabolic-health/ ; https://insider.fitt.co/press-release/oura-redefines-metabolic-health-tracking-with-two-new-ai-driven-features-meals-and-glucose/
22. TechCrunch, Oura Cardio Effort (20 Oct 2026): https://techcrunch.com/2026/10/20/oura-is-launching-two-new-ways-to-track-and-understand-activity/
23. m8d.io, Oura UK membership price† (read 22 Sept 2026): https://m8d.io/en/best-smart-ring/
24. Cronometer forum, adaptive TDEE request: https://forums.cronometer.com/discussion/5713/adaptive-tdee-calculation-is-it-ever-coming
25. Nutrola, Cronometer pricing† (competitor): https://nutrola.app/en/blog/how-much-does-cronometer-cost-now-2026
26. Carbon Diet Coach site (weekly check-ins, USD prices): https://web.joincarbon.com/?via=di
27. RP Diet Coach, App Store: https://apps.apple.com/US/app/id1330041267
28. RP Hypertrophy, UK App Store: https://apps.apple.com/gb/app/rp-hypertrophy/id1555614554
29. Hevy site (17M+ users): https://www.hevyapp.com/ ; Hevy Trainer help: https://help.hevyapp.com/hc/en-us/articles/38385724273047-Hevy-Trainer-Explained-How-It-Builds-Your-Workout-Program ; announcement: https://www.hevyapp.com/announcing-hevy-trainer/
30. SensAI, Hevy review 2026† (prices; Feb 2026 Trainer date unverified): https://www.sensai.fit/blog/hevy-review-2026
31. Strong, App Store (prices, CSV export): https://apps.apple.com/app/id464254577
32. SensAI, Fitbod review 2026†: https://www.sensai.fit/blog/fitbod-review-2026
33. SensAI, Juggernaut vs RP vs Alpha Progression†: https://www.sensai.fit/blog/juggernaut-ai-vs-rp-hypertrophy-vs-alpha-progression-2026
34. Ladder llms.txt (official): https://www.joinladder.com/llms.txt
35. Apple Newsroom (9 Sept 2026; Insights, Readiness, Longevity; US English first): https://www.apple.com/newsroom/2026/09/apple-advances-health-and-fitness-capabilities-using-apple-intelligence/
36. MacRumors, iOS 27 Health guide: https://www.macrumors.com/guide/ios-27-health-app/
37. Thurrott (via Bloomberg), Apple shelved AI health coach: https://www.thurrott.com/a-i/332436/apple-reportedly-shelved-its-planned-ai-health-coach
38. DC Rainmaker, Garmin Connect+ nutrition (5 Jan 2026): https://www.dcrainmaker.com/2026/01/garmin-connect-nutrition-logging-connect.html
39. Garmin blog, nutrition in Connect: https://www.garmin.com/en-NZ/blog/stay-on-top-of-nutrition-goals-in-garmin-connect/
40. the5krunner, Connect+ review with UK price (20 Apr 2026): https://the5krunner.com/2026/04/20/garmin-connect-plus-review/
41. Google Health Premium and Gemini coach†: https://www.sensai.fit/blog/google-health-premium-fitbit-ai-coach-2026 ; Wareable, UK preview: https://www.wareable.com/fitbit/google-fitbit-coach-publicpreview-global-rollout-ios ; NationalWorld, £7.99/mo: https://www.nationalworld.com/recommended/google-fitbit-edge-fitbit-edge-pre-order-fitbit-edge-uk-price-google-health-premium-fitness-tracker-9283737
42. T3, Eight Sleep Pod 5 review (UK prices; subscription figure partly unverified): https://www.t3.com/home-living/sleep/eight-sleep-pod-5
43. SensAI, App Store: https://apps.apple.com/app/id6738963099
44. Macro Trainer site: https://macrotrainer.com/ ; App Store: https://apps.apple.com/us/app/macro-trainer/id6763687102
45. Honedly site: https://honedly.com/
46. Zolt site: https://www.zolthealth.com/ ; App Store: https://apps.apple.com/in/app/zolt-adaptive-tdee-coach/id6736639311
47. Repwise site (pre-launch): https://www.repwise.app/
48. Euronews, ChatGPT Health launch, UK/EEA excluded (8 Jan 2026): https://www.euronews.com/next/2026/01/08/open-ai-launches-dedicated-chatgpt-health-feature-with-medical-record-integrations
49. Fortune, Claude for Healthcare and Apple Health beta (11 Jan 2026; current status unverified): https://fortune.com/2026/01/11/anthropic-unveils-claude-for-healthcare-and-expands-life-science-features-partners-with-healthex-to-let-users-connect-medical-records/
50. Health Auto Export, UK App Store (prices, rating): https://apps.apple.com/gb/app/health-auto-export-json-csv/id1115567069
51. Search Engine Land, Safari 7-day storage cap: https://searchengineland.com/what-safaris-7-day-cap-on-script-writeable-storage-means-for-pwa-developers-332519 ; WebKit bug 237350 (home-screen app wipes reported): https://bugs.webkit.org/show_bug.cgi?id=237350
