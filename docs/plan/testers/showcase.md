# Showcase screenshots

What the app finds in a log, shown before a tester has 16 weeks of their own. The screenshots in `showcase/` are of **made-up data**. Every post and caption says so. Presenting them as your own log would be untrue, and the subs we post in are the people most likely to ask for the data.

## What the data is, and why this finding

Sleep against the lifts, in kg on the person's own squat, is the headline. Everyone has short nights, and the thing to do about it is plain. No other app gives it: WHOOP and Bevel score recovery but don't know the lifts, and Hevy, Strong and MacroFactor don't see sleep. Calories the day before is second: on a cut it needs the adaptive maintenance estimate and the lifts together, which no other app holds. The rows reading "No clear link" are what make it believable: the app doesn't make everything into a finding.

`lib/physique/showcaseData.ts` builds 16 weeks:
- **The person:** 84 kg, cutting towards 74 kg at 0.5% a week, squat and bench three times a week, Apple Watch nights.
- **Built in:**
  - top sets about 3% lighter for each hour of sleep under 7h 12m;
  - top sets 2% heavier after a higher-carb (so higher-calorie) day;
  - a last month with 48 minutes less sleep, lower HRV and higher resting HR, and strength fading 1.5%.
- **Seed:** 5 of 40, picked because the engine finds only what was built in.
- **Dates:** the data is moved to end on the day it's loaded, so it reads the same on any day.
- **Test:** `lib/physique/__tests__/showcaseData.test.ts`.

## The screenshots (light and dark of each)

| File | Caption |
|---|---|
| `connections-*.png` | What the app found in 16 weeks of example data: the squat about 6 kg heavier after a longer night, and 4.5 kg heavier the day after eating near maintenance. Carbs, protein, rest days, cut speed and HRV: no clear link. |
| `connection-open-*.png` | Tap a line to see the sessions behind it: each dot is one session against that lift's own usual. |
| `finding-open-*.png` | When the last 4 weeks drift, it says so, with the study behind it: sleep down to 6h 18m on a cut, squat down 7.5 kg in 8 weeks. |
| `progress-*.png` | The whole Progress screen on the example: the goal, what lined up with the lifts, the last 4 weeks, everything over time. |

## Post text (with the screenshots)

> **What it finds** (example data, made up so you can see it before you have 16 weeks of your own)
>
> Over 16 weeks of a cut, this example lifter's squat ran about 6 kg heavier after a longer night (7h 55m vs 6h 07m), and 4.5 kg heavier the day after eating near maintenance than after an 825 kcal deficit. Carbs, protein, rest days and HRV showed no clear link, and it says so rather than guessing. When their sleep slipped to 6h 18m for a month and the squat dropped 7.5 kg, it flagged it, with the study on cutting short of sleep.
>
> None of that is advice; it's what the log shows. Your own version starts filling in after a few weeks of logging.

Pair it with the Reddit post in `recruit.md`: lead with this if you don't have a finding from your own log yet, and swap in yours when you do.

## Taking them again

After a change to Progress, take them again with this repo's dev server running:

```bash
PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node scripts/showcase-screens.mjs docs/plan/testers/showcase
```

It uses a fresh headless browser, seeds the SHOWCASE preset on `/dev/seed-physique`, and saves 390 px wide images at 3× in light and dark. Nothing touches a real browser's data. To look by hand, seed SHOWCASE on `/dev/seed-physique` and open Progress.
