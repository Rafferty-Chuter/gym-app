# 01 — Product spec

## 1. What we're building

**A physique coach that reads your scale, your food, your lifts and your sleep together, and tells you whether the plan is working.**

You set a goal: "90 kg, lean". The app turns it into a rate, calories and macros, and a training phase. You log weight (5 seconds), food (fast), sleep (10 seconds, or automatic from Apple Watch later) and training (the existing logger). Each week it checks in. One deterministic engine decides whether you're on track, too fast, too slow, eating off-target, or losing strength or sleep. It recommends one change. The assistant explains why, using your numbers.

**Where we win.** Checked against each app's own published material in October 2026:

| | MacroFactor | MacroFactor Workouts | Bevel / WHOOP / Oura | **Us** |
|---|---|---|---|---|
| Adaptive calories from weight + intake | ✅ (the best) | — | partial | ✅ copied from MacroFactor |
| Training logging and progression | — | ✅ (separate app) | basic | ✅ existing app, upgraded in M5 |
| Sleep | ❌ (#1 feature request, 14,390 votes) | ❌ | ✅ | ✅ |
| **One judge across weight, food, lifts and sleep** | ❌ ("apps don't adjust each other") | ❌ | general health, not physique goals | **✅ the product** |
| Explains in your numbers | static help articles | static | AI chat, criticised for inventing data | assistant bound to engine output |

Sources: `research/A-macrofactor-nutrition.md` §0 and §F2; `research/B-training-apps.md` MF-10; `research/C-sleep-recovery.md` §3.

## 2. Core loop

1. **Set a goal** (`/body/goal`): target weight → direction → rate (evidence bands) → honest ETA → start.
2. **Log daily** (Body tab, from Home):
   - weight on waking;
   - food through the day;
   - sleep in the morning;
   - training as now.
3. **The engine recomputes on every entry.** Trend weight, rate, expenditure, adherence, strength and sleep.
4. **Weekly check-in** on your chosen day. It fixes the data first (partial or missing days), then proposes new targets and gives the verdict. You accept or keep your current targets.
5. **Ask why**, any time. The assistant explains the verdict with the numbers from the engine.

## 3. Features

What each feature is based on, our change, and the milestone it lands in.

| Feature | Based on | Our change | Milestone |
|---|---|---|---|
| Trend weight (smoothed) | MacroFactor trend weight | Same smoothing (calibrated), shown with raw points | M1 |
| Rate of change with a confidence check | Evidence (Hall & Chow 2011) | No rate shown on <14 days; whole-week windows; "confidently above" test | M1 |
| Adaptive expenditure ("maintenance") | MacroFactor V3 (published windows and density) | Open replica, reproduces their published tests; holding/calibrating states shown honestly | M1 |
| Goal + rate bands | MacroFactor cutting and bulking tables + Helms, Iraki, Garthe | Training status measured from your lifts, not asked | M1 |
| Calories and macros | MacroFactor protein-first, FFM-scaled, fat floor | Same; floors 1,500 (M) / 1,200 (F) | M1 |
| Weekly check-in | MacroFactor check-in modules | Delivered as a stepper *and* through the assistant; includes the judge's verdict | M1 |
| Judge verdicts | Research F's rule table | Recommends *goal* changes, never ad-hoc kcal tweaks; adherence first | M1 |
| Strength retention on a cut | MacroFactor's vague heuristic; evidence (Murphy & Koehler 2022) | ≥2 main lifts, ≥5%, ≥3 weeks, sleep-adjusted; "lifts dropping", never "muscle loss" | M1 |
| Sleep logging + "fix sleep before cutting" | Bevel and WHOOP sleep; Nedeltcheva 2010, Wang 2018 | Manual in M1 (≤10 s); Apple Watch via Health Auto Export in M3 | M1 / M3 |
| Quick food logging | MacroFactor quick add, history, copy, Edit Day | Simplified for M1 | M1 |
| AI "describe your meal" | MacroFactor Describe | Estimate in M1 (clearly labelled); grounded in UK/US food databases in M4 | M1 / M4 |
| Food search, barcode, photo | MacroFactor logger (24-action benchmark) | CoFID + USDA + Open Food Facts | M4 |
| Recovery status (HRV, RHR) | Oura / WHOOP / Apple Vitals | A word, not a 0–100 score; ≥2 flags for red; silent when green | M3 |
| Set-level progression | MacroFactor Workouts smart progression | One deterministic module replaces 3 conflicting ones | M5 |
| Weekly per-muscle volume | RP Hypertrophy feedback | Performance computed from logs; only soreness is asked (1 tap) | M5 |
| Training changes by diet phase | Evidence (Roth 2022/23, Helms 2015/2023) | Nobody else does this | M5 |
| Phase planner (cut → maintain → bulk) | MacroFactor sub-goals (#2 request); evidence on maintenance phases | Honest timeline to "90 kg lean" | M6 |
| Program generator | MacroFactor Workouts questionnaire; Hevy Trainer splits | Deterministic skeleton, explained by the assistant | M6 |
| Native app + HealthKit in-app | — | Capacitor shell for testers | M7 |

## 4. What we deliberately don't do

Each item has a reason from the research.

- **No body-fat % or "muscle gained" from scales, BIA or photos.** These can't track change validly (research F §10).
- **No 0–100 recovery or readiness score.** Vendors' scores don't agree, and PRODUCT.md wants glanceable states (research C §6.5).
- **No sleep-stage judgements** (deep sleep, REM). Wearable stage accuracy is moderate (research C §4.2).
- **No catch-up and no calorie rollover.** These create binge-restrict loops; MacroFactor rejects them too (research A §B3, §B7).
- **No streaks, confetti or hype.** See PRODUCT.md.
- **No meal plans** for now.
- **No refeed or diet-break "metabolic" claims.** Diet breaks are an adherence tool only (research F §8).
- **No minimum-calorie bypass** without a warning, and no coaching rates above 1.5 %/wk.

## 5. Proposed PRODUCT.md additions

Ticket F1 applies these unless you veto them (decision D4 in README).

Append to **Product purpose**:

> **Physique layer (2026-10).** The product expands from a training diagnostic to a physique coach. The user sets a bodyweight goal ("90 kg, lean"). A deterministic physique engine (`lib/physique/*`) computes trend weight, rate, adaptive expenditure (modelled on MacroFactor), targets, and a single verdict that combines rate, adherence, lift performance and sleep. As with training signals, the engine decides and the assistant explains. The Body tab is the logging home for weight, food and sleep; Start Workout remains the dominant element on Home.

Append to **Strategic principles**:

> - **One judge, not four dashboards.** Weight, food, lifts and sleep feed one verdict with one recommended change. Never show four competing scores.
> - **Adherence before strategy.** If the user isn't eating to target, say that before changing the plan.
> - **Calibrating is a real state.** No expenditure, rate or verdict until the data supports it.

Update the bottom nav line to: "Bottom nav: Home, Body, Templates, History, Profile."

## 6. What M1 success looks like (your dogfood)

- You log weight on ≥6 of 7 days and food on ≥5 of 7, for 3 weeks, in **under 2 minutes a day** in total.
- The first rate appears around day 14, and expenditure settles around day 21–28.
- By week 3–4 the verdict matches your own judgement, or you can say exactly why it doesn't (log it in STATUS).
- "Is my cut working?" in the assistant gets an answer that leads with the engine's verdict and cites only real numbers.
