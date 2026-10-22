# Showcase screenshots

What the app finds in a log, shown before a tester has 16 weeks of their own. The screenshots in `showcase/` are of **made-up data**. Every post and caption says so. Presenting them as your own log would be untrue, and the subs we post in are the people most likely to ask for the data.

## What the data is, and why this finding

Sleep against the lifts, in kg on the person's own squat, is the headline. Everyone has short nights, and the thing to do about it is plain. No other app gives it: WHOOP and Bevel score recovery but don't know the lifts, and Hevy, Strong and MacroFactor don't see sleep. Under it, three more a lifter can act on: HRV that morning, carbs the day before, and the break since the last session. Four of seven link, the size a real log might show. The three reading "No clear link" (calories, protein, weight trend) are what make it believable: the app doesn't make everything into a finding.

`lib/physique/showcaseData.ts` builds 16 weeks:
- **The person:** 84 kg, cutting towards 74 kg at 0.5% a week, squat and bench three times a week, Apple Watch nights.
- **Built in (`SHOWCASE_EFFECTS`), each a few percent of a top set:**
  - shorter nights the night before;
  - lower-carb days the day before, with carbs swinging at much the same calories (as in a real log, so carbs and calories can be told apart);
  - lower-HRV mornings;
  - a 2-day break against the weekend's 3;
  - a last month with 48 minutes less sleep, lower HRV and higher resting HR, and strength fading 1.5%.
- **Not built in:** protein, calories against maintenance and the weight trend move nothing.
- **Seed:** 15 of 200, the one where the engine finds exactly the four built-in links, the finding fires and the weight stays on plan.
- **Dates:** the data is moved to end on the day it's loaded, so it reads the same on any day.
- **Test:** `lib/physique/__tests__/showcaseData.test.ts`.

## The screenshots (light and dark of each)

| File | Caption |
|---|---|
| `connections-*.png` | What the app found in 16 weeks of example data. The squat was about 7 kg heavier after a longer night, 5.5 kg heavier on higher-HRV mornings, 5 kg heavier the day after a higher-carb day, and 4 kg heavier after a longer break. Calories, protein and the weight trend: no clear link. |
| `connection-open-*.png` | Tap a line to see the sessions behind it: each dot is one session against that lift's own usual. |
| `finding-open-*.png` | When the last 4 weeks drift, it says so, with the study behind it: sleep down to 6h 29m on a cut, bench down 4.5 kg and squat 2.5 kg in 8 weeks. |
| `progress-*.png` | The whole Progress screen on the example: the cut on plan with 1 kg to go, what lined up with the lifts, the last 4 weeks, and everything over time (sleep and HRV dipping in the last month). |

## Post text (with the screenshots)

> **What it finds** (example data, made up so you can see it before you have 16 weeks of your own)
>
> Over 16 weeks of a cut, this example lifter's squat ran:
> - about 7 kg heavier after a longer night (7h 45m vs 5h 59m);
> - 5.5 kg heavier on higher-HRV mornings;
> - 5 kg heavier the day after a higher-carb day (308 g vs 174 g);
> - 4 kg heavier after the weekend's longer break.
>
> Calories, protein and the weight trend showed no clear link, and it says so rather than guessing. When their sleep slipped to 6h 29m for a month and the bench dropped 4.5 kg, it flagged it, with the study on cutting short of sleep.
>
> None of that is advice; it's what the log shows. Your own version starts filling in after a few weeks of logging.

Pair it with the Reddit post in `recruit.md`: lead with this if you don't have a finding from your own log yet, and swap in yours when you do.

## Taking them again

After a change to Progress, take them again with this repo's dev server running:

```bash
PLAYWRIGHT=/path/to/node_modules/playwright/index.mjs node scripts/showcase-screens.mjs docs/plan/testers/showcase
```

It uses a fresh headless browser, seeds the SHOWCASE preset on `/dev/seed-physique`, and saves 390 px wide images at 3× in light and dark. Nothing touches a real browser's data. To look by hand, seed SHOWCASE on `/dev/seed-physique` and open Progress.
