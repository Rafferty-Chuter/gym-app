# M. Does Connections find what is there, and only that? (IN5, 2026-10-22)

Script: `npx tsx scripts/study-connections.ts 30 2.5` (raw rows in `M-connections-study.json`; the same run at 1.5% noise in `M-connections-study-lownoise.json`). Made-up lifters train squat and bench three times a week with 2.5% session-to-session noise (research L: 2 to 4% for most lifters) and slow progress. Every condition is recorded for everyone: nights of 5.6 to 8.4 hours with bed and wake times (an hour and a half early one morning in five), food every day with carbs from 120 to 380 g, a maintenance estimate, sessions between 06:00 and 20:00. So all 14 conditions are read at once, as for a real person with a watch and a full food log. Each lifter has one known effect, or none. 30 runs each, at 16, 26 and 52 weeks of history.

## Results

| Lifter | 16 weeks | 26 weeks | 52 weeks | Effect shown (true size) |
|---|---|---|---|---|
| 4% weaker after nights under 6.5 h | 29/30 found | 30/30 | 30/30 | 3.3 to 3.6% (4%) |
| 4% weaker on mornings woken 1.5 h early (one in five) | 9/30 | 26/30 | 30/30 | 3.8 to 4.0% (4%) |
| 3% stronger after days over 250 g of carbs | 30/30 | 30/30 | 30/30 | 2.8 to 3.0% (3%) |
| No effect | no links in 90 runs | | | |

**Extra links.** In the runs with a real effect, 13 of 270 runs also linked a second condition, about one extra for every 20 true links. That is inside the 10% false-discovery rate the method controls (Benjamini–Hochberg finds more freely once one real link is present, as it is meant to). Some are not false: on early mornings the person has been awake longer by the session, so "hours awake" moves with "waking early". The rest were single runs of calories, rest days, carbs or sleep.

**Sizes.** The effect shown sits a little under the true one, by design: it is shrunk by (1 − 1/z²) so a link that only just clears the bar is not shown at its luckiest.

**Waking early is the slow one.** One morning in five is about 30 days in 16 weeks, too few to clear the bar most of the time; by six months it is found 26 times in 30.

## Against the old engine

The neighbour-median engine read sessions against the median of the two either side. Runs of short nights became the lift's own level, which halved a true effect: in research L's simulation, −4% read as −2.1% and power fell from 69% to 22%. The test `IN5: short nights in runs are no longer halved` builds that case (a week of short nights at a time, 26 weeks): the new engine links it in 7 or more of 10 runs at an average shown size above 3%.

## Limits

- The made-up lifters have one effect each and no others; real people have several at once, and the overlap check (refit together when two links move together) is what separates them.
- Session noise is independent from one session to the next here; real noise carries over (fatigue), which the engine's widened error allows for.
- Every condition is recorded for everyone. A person who logs less gets fewer conditions read, and later.
