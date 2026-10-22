# N. Does the alcohol and salt read find what is there, and only that? (IN9, 2026-10-22)

Script: `npx tsx scripts/study-alcohol.ts 30` (raw rows in `N-alcohol-salt-study.json`). It runs made-up people through the real engines: `alcoholLinks` (`lib/physique/alcohol.ts`) for the night and the scale, Connections' "drinks the evening before" for the next session, and the scale-jump read for salt. 30 runs each.

**The made-up people.** Food is logged every day. A drinking evening is 54 g of alcohol (about 3 pints) unless stated, and the line for one is 0.25 g per kg, about 20 g at 80 kg. A watch records every night: resting HR around 56 bpm with a 2.3 bpm spread carried 0.4 into the next night, HRV around 55 ms with a 20% spread, and about 7 hours asleep with a 40 minute spread. There is a weigh-in every morning with IN2's scale noise (0.3 kg, carried 0.4) on a slow cut. History is read at 6, 12 and 26 weeks of drinking, after 5 weeks to set the person's usual.

## The night and the scale

| Person | 6 weeks | 12 weeks | 26 weeks |
|---|---|---|---|
| Heavy evenings 1.4 a week (about 13, 22 and 35 drinking nights): resting HR +8.7 bpm, HRV −20%, sleep −35 min | HR 30/30, HRV 23, sleep 17 | 30, 30, 24 | 30, 30, 30 |
| Moderate evenings (36 g) 1.4 a week: HR +4 bpm, HRV −10%, sleep −15 min | HR 30/30, HRV 6, sleep 7 | 30, 11, 3 | 30, 23, 12 |
| Heavy evenings once a fortnight (about 5, 8 and 12 nights) | HR 11/30 (15 had 5 nights yet) | 27, 15, 7 | 30, 25, 15 |
| Scale +0.8 kg the morning after, +0.4 kg two mornings after | morning after 29/30, two after 6 | 30, 9 | 30, 7 |
| Control: drinks 1.4 evenings a week, nothing changes | no link in 30 | none | none |
| Weekend control: drinks on Fridays and Saturdays, which are 40 min shorter and 2.5 bpm higher anyway | 2/30, both with the weekend note | 0/30 | 1/30 |

**Sizes.** Resting HR read +8.5 for +8.7 and +3.7 to 4.0 for +4. HRV read −11 ms for −20% of 55 ms. Sleep read high early (−48 min for −35 at 6 weeks, when only the luckier runs pass) and +34 by 26 weeks.

**False links.** In the 360 runs with something real, a link on an outcome with nothing behind it showed in 7 (2%). Most were the second scale morning, which Benjamini–Hochberg reads more freely once a large real link sits beside it (research M saw the same). Across all 540 runs, 10 had a false link (1.9%). The plain controls had none in 90.

## What it took

- **Pull-in by group.** At first outlying nights were pulled in towards the dry nights' middle. That cut a real +9 bpm to +4 (a unit test caught it). Each group is now pulled in around its own middle.
- **The weekend.** Compared against all dry nights, a weekend drinker whose Fridays and Saturdays run short anyway got a false link in 24 to 29 runs of 30. A same-weekday check at half the size let 4 of 6 through at 6 weeks. The read is now made within each weekday (Friday's drinks against dry Fridays) whenever there are dry evenings on those days. When there aren't, it is made against all dry evenings, and the card says "Your drinking nights were mostly Fridays and Saturdays, with too few dry ones to compare, so the weekend may be part of it."
- **The week-earlier hold.** As in Connections, a link must also have held a week earlier. That took the 6-week controls from 2 false links in 30 to 0. It costs the fortnightly drinker a week: 11 of 30 found at 6 weeks, against 15 without the hold.

## The next session (Connections)

Squat and bench three times a week with 2.5% session noise. Food varies day to day, and a third of evenings have drinks.

| Person | 26 weeks | 52 weeks |
|---|---|---|
| Lifts 3% weaker the day after drinking | 30/30, shown −2.8% | 30/30, −3.0% |
| Strength holds | no link in 30 | no link in 30 |

A pint carries carbs and calories, so on some runs the link sits on "carbs the day before" with drinks named as moving with it ("could be either"). In the first version of the study the drink was the only thing that moved carbs, and that happened on most runs. With varied food it is rare. Strength usually holds the day after drinking (Shaw 2022), so "No clear link" is the expected answer for most people. The row's studies line says so.

## Salt in the scale jump

IN2's lifter with sodium logged on every food (about 3,000 mg a day) and a salty day (+3,000 mg, 7.5 g of salt) every 9 to 12 days.

| Person | Salty mornings called a jump | Salt named on those | Salt named on other mornings |
|---|---|---|---|
| Holds 0.25 kg of water per g of sodium | 110 of 207 | 109 | 0 of 1,611 |
| The scale doesn't follow salt | 3 of 207 | 2 | 0 of 1,611 |

The prior of 0.2 kg per g of sodium starts the size. It becomes the person's own after 60 reads. On a person whose scale ignores salt, salt was named on 2 of 207 salty mornings, both when the scale happened to jump anyway.

## Drinks logged in Apple Health (IN9b, 2026-10-22)

Health records a count of drinks with no size, so a drink is read as 14 g, the US standard drink. A Health count fills an evening only when the food log holds no drink (1 g or less), so an evening logged both ways counts once, and the same day from two sources (the app and Health Auto Export) counts once. Health keeps day totals, so a drink after midnight stays on the next day.

Same seeds, same truths, 30 runs each:

| Person | 6 weeks (rhr / hrv / sleep found) | 12 weeks | 26 weeks |
|---|---|---|---|
| Heavy, logged as food (54 g) | 30 / 23 / 17 | 30 / 30 / 24 | 30 / 30 / 30 |
| Heavy, Apple Health only (4 drinks, read as 56 g) | 30 / 23 / 17 | 30 / 30 / 24 | 30 / 30 / 30 |
| Heavy, logged both ways | 30 / 23 / 17 | 30 / 30 / 24 | 30 / 30 / 30 |
| Moderate, Apple Health only (2 drinks, read as 28 g) | 30 / 6 / 7 | 30 / 11 / 3 | 30 / 23 / 12 |
| Control, Apple Health only | no link in 90 runs | | |

The Health-only rows match the food-logged ones because only which evenings were drinking ones matters, and 2 or more drinks (28 g) is over the line at these people's weight (about 21 g at 85 kg). One drink logged in Health (14 g) is under it: that evening is neither drinking nor dry, as with a small drink logged as food. Connections' drinks condition and the scale jump read the same evenings (tests in `connections.test.ts` and `scaleJump.test.ts`).

## Limits

- The made-up nights carry one effect each. Real drinking evenings also run later and come with more food, and the words say "after", not "because".
- Apple Health's resting HR is a day value and its HRV is overnight in the iPhone app but a day mean through Health Auto Export. So the card says "next day", not "that night", for both.
- An evening is read only when its drinks are logged. A day whose food isn't logged is neither drinking nor dry. A drink logged without its grams of alcohol, such as a quick-add "beer", is missed. Drinks logged in Apple Health count from IN9b, at 14 g each.
- A day's sodium is read only when foods carrying it make up 80% of the day's calories, scaled to the rest.
