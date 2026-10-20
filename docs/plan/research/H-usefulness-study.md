# H. How useful is the coach, by time and by data quality?

Study run on 2026-10-20 for the founder. Script: `scripts/study-usefulness.ts` (`npx tsx scripts/study-usefulness.ts 30`, about 70 s). Every cell: `H-usefulness-study.json`.

## Question

How long does a new user wait before the coach says something useful, how right is it when it does, and how does that change when the data is imperfect (missed weigh-ins, missed food days, part-logged days, a noisy scale)?

## Method

Simulated people with a known truth (their real maintenance, their real weight path, what they really eat) are run through the real engine (`buildPhysiqueAnalysis`, `computeExpenditure`, `buildWeekReport`, `linkedReasons`). Nothing is mocked. A new user starts a goal on day 0 with no history.

**Six kinds of person** (30 seeds each):

| Person | Truth | A good coach says |
|---|---|---|
| Cut, on plan | 85 kg, maintenance 2,800, eats the app's target, goal −0.6 %/wk | On track, or nothing to change |
| Cut, eats 400 over | Same, 400 kcal over target every day | Eat to target, stalled, or a diet break offer |
| Cut, 600 under, lifts drop 8% at day 21 | Same, 600 under target | Eat to target, slow the cut, faster than needed |
| Cut, sleeping 6.2 h | On plan, short sleep from the watch | A sleep flag |
| Lean bulk, on plan | 75 kg, maintenance 2,700, goal +0.25 %/wk, lifts rising | On track, nothing to change, or gaining well |
| Lean bulk, eats 500 over | Same, 500 over target | Gaining too fast, or eat to target |

**Four data qualities:**

| Data | Weigh-ins | Food |
|---|---|---|
| Ideal | Every day | Every day logged |
| Typical | 4 days a week | 85% of days logged, 5% part-logged (a quarter of the day) |
| Patchy | Every third day (2 to 3 a week) | 55% of days logged, 15% part-logged |
| Noisy scale | Every day, ±1 kg day to day | Every day logged |

**Timings:** days 3, 7, 14, 21, 28, 42, 56 and 84 after the goal starts. In all, 6 × 4 × 8 × 30 = 5,760 runs.

Each run is scored as one of three outcomes:

- **Correct:** the expected read.
- **Early:** an honest "Calibrating" or "Holding" read.
- **Wrong:** a substantive read that is not the expected one.

Each run also records:

- the maintenance estimate's error against the true maintenance;
- the weight rate's error against the true rate over the same window;
- whether the weekly report's weight card names intake as the cause, for people who are off plan because of intake, from week 4.

## Results

### When the coach starts saying something

Each cell shows correct / early / wrong, averaged over the six people. The sleep person can be "correct" by a flag while the verdict is still early, so a row can add up to more than 100%.

| Data | Day 3 | Day 7 | Day 14 | Day 21 | Day 28 | Day 42 | Day 56 | Day 84 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Ideal | 0 / 100 / 0 | 0 / 100 / 0 | 17 / 97 / 3 | 65 / 45 / 4 | 97 / 0 / 3 | 95 / 0 / 6 | 93 / 0 / 7 | 96 / 0 / 4 |
| Typical | 0 / 100 / 0 | 0 / 100 / 0 | 17 / 96 / 3 | 45 / 69 / 2 | 71 / 9 / 21 | 81 / 3 / 16 | 83 / 3 / 14 | 85 / 4 / 12 |
| Patchy | 0 / 100 / 0 | 0 / 100 / 0 | 14 / 91 / 9 | 13 / 94 / 7 | 13 / 95 / 5 | 17 / 100 / 1 | 17 / 100 / 0 | 16 / 100 / 0 |
| Noisy | 0 / 100 / 0 | 0 / 100 / 1 | 17 / 88 / 10 | 61 / 41 / 10 | 95 / 0 / 5 | 94 / 0 / 6 | 91 / 0 / 9 | 96 / 0 / 4 |

- **Weeks 1 and 2: calibrating, by design.** The only useful read in this period is the sleep flag, from day 14, which works at every data quality because the watch supplies it.
- **Week 3: people who are clearly off plan are caught.**
  - Ideal or noisy data: 91 to 99% of the people eating 400 to 600 kcal off target are caught at day 21.
  - On-plan people still read "Calibrating", which is correct: day 21 is when the maintenance estimate starts updating.
- **Week 4 onwards: verdicts for everyone with decent data.**
  - Ideal: 93 to 97% correct.
  - Noisy scale: 91 to 96% correct. The rate error doubles, but the gates absorb it.
  - Typical: 71 to 85% correct.
- **Patchy data: honest silence.** Expenditure stays on "Holding" and the rate is never shown. So the coach never gives a weight or calorie verdict, though it is also almost never wrong.

### How accurate the numbers are

The maintenance estimate's median error in kcal a day, with the 90th percentile in brackets. The day-3 figure is the formula seed before any data.

| Data | Day 3 | Day 7 | Day 14 | Day 21 | Day 28 | Day 42 | Day 56 | Day 84 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Ideal | 477 (477) | 413 (504) | 247 (617) | 175 (508) | 180 (380) | 122 (255) | 81 (144) | 62 (137) |
| Typical | 477 (477) | 423 (509) | 235 (618) | 176 (513) | 167 (409) | 117 (303) | 76 (176) | 67 (176) |
| Patchy | 477 (477) | 477 (568) | 477 (792) | 467 (792) | 340 (768) | 219 (477) | 104 (374) | 76 (189) |
| Noisy | 477 (477) | 422 (613) | 372 (984) | 368 (897) | 294 (599) | 200 (413) | 88 (200) | 109 (265) |

- **Maintenance:**
  - Within about 175 kcal by week 3.
  - Within about 120 kcal by week 6.
  - Within about 60 to 80 kcal by week 12, with typical data as good as ideal.
  - Patchy data gets there too, but about four weeks later.
- **Weight rate:** median error is about 0.12 %/wk from week 6 with ideal or typical data (about 0.1 kg a week at 85 kg), and about 0.23 %/wk on a noisy scale.
- **Weekly report causes:** whenever the weekly report's weight card appears for someone off plan because of intake, it names the cause ("400 over the 2,240 target") in 100% of runs. With patchy data the card does not appear, because too few days are logged.

### False alarms and missed problems

Share of on-plan people (cut and bulk) who get a substantive read that isn't "on track" or "nothing to change":

| Data | Day 21 | Day 28 | Day 42 | Day 56 | Day 84 |
|---|---:|---:|---:|---:|---:|
| Ideal | 10% | 3% | 15% | 20% | 10% |
| Typical | 3% | 7% | 9% | 14% | 0% |
| Noisy | 17% | 10% | 18% | 28% | 10% |

These are not all false.

- **About half are real.** In the "stalled" reads for an on-plan cutter, the simulated person really was losing only 0.1 to 0.36 %/wk against −0.6. Their target lagged the maintenance estimate, so the stall was real and the read was right.
- **The rest come from day-to-day eating noise.** These are "eat to target" and "diet break" reads, at about 1 read in 11 for someone eating exactly to target with ±350 kcal daily variation.
- **The noisy scale is the weak spot.** On ±1 kg daily swings, "stalled" and "faster than needed" reads rise to about 1 in 4 by week 8.

Share of off-plan people (over, under, bulking too fast) who are caught:

| Data | Day 21 | Day 28 | Day 42 | Day 56 | Day 84 |
|---|---:|---:|---:|---:|---:|
| Ideal | 99% | 100% | 99% | 99% | 100% |
| Typical | 58% | 56% | 70% | 78% | 73% |
| Noisy | 91% | 100% | 100% | 100% | 100% |
| Patchy | 0% | 0% | 0% | 0% | 0% |

The typical-data misses come from one gate. "Eat to target" and "stalled" need at least 80% of days logged over their window (`MIN_LOGGED_SHARE`), and someone logging 85% of days with some part-logged days falls under it about half the time. Before the fixes below, many of those misses read "On track".

## Fixes made from this study

1. **"On track" no longer shows when the best estimate is off plan.**
   - The rule only needed the rate to be "not confidently outside" goal ± 0.25 %/wk. So a cutter losing 0.3 %/wk against a −0.6 goal was told "On track", with the 0.3 next to it.
   - It now needs the point estimate inside the band.
   - Otherwise the read is "Nothing to change yet". The detail is "Losing 0.3 %/wk over 28 days against a −0.6 %/wk goal", followed by "Not clear enough yet to change anything" or, when the rate is clearly outside but no rule's other gates are met, "Targets stay as they are for now".
   - Result: "On track" for off-plan people with typical data fell from 18% to 7%. No cell got worse.
2. **The eat-to-target test uses a two-sided z.**
   - It tests |delta| both ways but used the one-sided 1.645. That let it fire on about 1 in 10 people eating exactly to target.
   - It now uses 1.96, so the noise term is about 183 kcal at ±350 daily variation over 14 days.
3. **"On track" no longer appears as a second note under a rate verdict.** Before this, a bulk read "Gaining faster than a lean bulk needs" with "On track" beneath it.
4. **"Nothing to change yet" with an off-plan rate shows the watch colour, not green.** It now matches the "9 weeks behind plan" line next to it.
5. **The study's own scoring** was fixed:
   - the cause-matching pattern missed "over the 2,240 target";
   - "diet break" is a correct read for a cutter over target from week 6;
   - "faster than needed" is a correct read for a cutter eating 600 under.

## Decisions for the founder (tested, not shipped)

Each experiment changes one constant and re-runs the whole study.

| Change | Typical data | Patchy data | Cost |
|---|---|---|---|
| Logged-days gate for "eat to target" and "stalled", 80% → 70% (`MIN_LOGGED_SHARE`) | Off-plan caught 69% → **94%**; wrong reads 16% → 5% | No change | On-plan alerts 7% → 11% |
| Weigh-in gate for showing a rate, 0.4 a day → 0.25 a day (`MIN_WEIGHIN_RATIO`) | No change | Rate shown 0% → **100%**, error 0.14 %/wk (same as 4 a week) | None measured |
| Expenditure keeps updating on 3 logged days in 7 instead of 4 (`MIN_NUTRITION_DAYS_7`) | No change | More "Nothing to change yet" reads with the rate shown; still no calorie verdicts | Maintenance less settled |

Recommendation:
- Take the first two changes. Both move the coach from silent to useful for real-life loggers, at a small and stated cost.
- Leave the third. A patchy logger is better served by gap reminders (G5) and automatic weigh-ins than by verdicts built on half the food.

## Limits

- **The model is the engine's own.** The simulated bodies follow the engine's energy-balance model: 7,716 kcal per kg, AR(1) scale noise and water shifts at phase starts. Real bodies vary more, for example with menstrual cycles, creatine, travel and illness.
- **Constant under-logging is invisible, by design.** Someone who always logs 20% less than they eat looks to the engine exactly like someone with a 20% lower maintenance who logs perfectly. The maintenance figure then reads in "logged calories", and the targets still work.
- **Inconsistent under-logging is not invisible.** Forgetting snacks on some days is the real risk; the patchy and part-logged variants stand in for it.
- **Lift changes are deliberately simple.** Lifts are a flat line, a steady rise or one step down. Strength reads in real training are noisier.
- **This measures the engine, not people.** It cannot say whether people act on a verdict. That needs the 15 to 25 person trial in the market report (research I).
