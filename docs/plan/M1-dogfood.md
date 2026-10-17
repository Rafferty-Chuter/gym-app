# M1 dogfood guide

How to use the physique layer day to day while it calibrates, and what to expect from it in the first month.

## What to log

| When | What | Where |
|---|---|---|
| Every morning, after the bathroom and before food or drink | Weigh in | Body → Weight (two taps: the last value is prefilled, ±0.1 steps) |
| Through the day | Food: kcal and protein at minimum; carbs and fat when you know them | Body → Food (Recent re-logs a food in two taps) |
| Every morning | Last night's sleep: lights out, woke up, hours asleep | Body → Sleep (prefilled from your last 7 nights) |
| Once a week, same morning | Waist, at the navel, relaxed after a normal breath out | Body → Waist |
| As usual | Training | Start workout (the engine reads your main lifts from History) |

Missed days are fine. Log what you know; don't guess. If a day was only partly logged, leave it, and the check-in will ask about it.

## When things appear

- **Trend weight**: from the first weigh-in. The line smooths with every entry (α = 0.10), so the first week moves a lot.
- **Rate of change**: after 14 days inside the current phase with at least 5 weigh-ins (daily is best; 4 a week is enough). A new goal masks its first 7 days, so the first read after "Start today" comes on day 21.
- **Maintenance (expenditure)**: the estimate starts from your profile and then updates daily once 4 of the last 7 days have food logged and there has been a weigh-in in the last 7 days. It is **calibrating** for the first 21 updating days (no ± shown), **settling** from day 21 (± 400), **stable** from day 28 (± 300). If logging drops below 4 of 7 days it **holds** until 3 consecutive complete days.
- **Verdicts**: the rate rules need 21 to 28 days of phase data; strength rules need 2 main lifts with 3 sessions before the phase started and 3 after; sleep rules need 10 of 14 nights. Until then the Body page says exactly what is missing.
- **Weekly check-in**: on your check-in weekday (Monday by default) the Body page offers a program update. Targets move by at most max(100 kcal, 5% of expenditure) per week after the first 28 days.

## Recording a wrong verdict

When a verdict looks wrong, don't edit the data to make it go away. In `docs/plan/STATUS.md`, under "Dogfood notes", add one line:

`YYYY-MM-DD · rule id · what it said · what was actually going on · what you expected`

and export a backup from Profile → Data tools the same day (the engine is deterministic, so the backup reproduces the verdict). Travel, illness, a creatine start or a period are recorded as day events, not as corrections.

## Dev pages (not in production builds)

- `/dev/seed-physique`: seeds a scenario after downloading a backup; "Cold start" clears the physique data and the `[seed]` workouts.
- `/dev/chart`: the chart primitive on a seeded series.
