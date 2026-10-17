# G · Reference screens (Mobbin, 17 Oct 2026)

What the reference apps actually look like, screen by screen, as seen on Mobbin. Links are to the Mobbin screen so a design session can re-open them; the images themselves are not stored in the repo. Read with `05-design.md` §9 (the redesign brief). Observations only; the decisions are in the brief.

## MacroFactor

### Dashboard
[Daily Nutrition](https://mobbin.com/screens/05bca7bd-ff17-45dc-bca0-3b4c6d51a745) · [Energy Balance, targets view](https://mobbin.com/screens/ca4d1d3d-29da-4414-9009-430bb43f6180) · [Energy Balance, expenditure view, dark](https://mobbin.com/screens/6eb0759b-2195-410f-b75e-3d0d62c2252a) · [Weekly Nutrition](https://mobbin.com/screens/e24f701f-32a6-4086-ab53-f3d9396ab3a7) · [Insights & Analytics](https://mobbin.com/screens/dbb6adbe-687b-4528-aba0-21f9af8c1e6d)

- Header: a small tracked caption with the date ("TUESDAY, JUNE 30") above a very large uppercase page title ("DASHBOARD"). No nav chrome.
- A swipeable widget carousel with page dots. Three widgets:
  1. **Daily Nutrition.** A 3/4 ring with the remaining kcal in the centre ("1502 Remaining"), Consumed on the left and Target on the right in smaller type. Under it, three thin macro bars (Protein, Fat, Carbs) with "113 / 137g". A Consumed / Remaining pill toggle.
  2. **Energy Balance.** 30 days of intake bars (blue) against a dotted line (yellow for targets, orange for expenditure). A three-term row under the chart: "765 − 2041 = −1276" with legends Nutrition · Targets · Difference. An Expenditure / Targets pill toggle.
  3. **Weekly Nutrition.** Seven columns (M…S), each with four stacked mini bars (kcal, P, F, C) and a grey tick for the target; the selected day is outlined and its numbers sit on the right ("139 of 2041", "11 P of 137" …).
- **Insights & Analytics**: a 2-column grid of tiles, each with a title, "Last 7 Days", a sparkline and a headline number ("2507 kcal", "78.3 kg", "1763 kcal deficit", "0 %"). "See All" opens the full grid (Expenditure, Weight Trend, Energy Balance, Goal Progress).
- **Habits**: tiles with 30-day dot grids (Weigh-In, Food Logging).
- A persistent **search bar** ("Search for a food") with barcode and AI icons sits above the tab bar on every main tab.
- Tab bar: Dashboard · Food Log · **+** (black circle) · Strategy · More.
- Dark mode is near-black with dark-grey widgets; the same layout.

### Food Log (timeline)
[Timeline, selection mode](https://mobbin.com/screens/805886bf-2c0c-465c-a400-29afb0cb7343) · [Timeline](https://mobbin.com/screens/e2c71034-8855-477f-8d6c-0e497ca346ed) · [Timeline, remaining view](https://mobbin.com/screens/96eadb1f-c649-4392-a17c-f99f87d064b4) · [Timeline Actions sheet](https://mobbin.com/screens/5b9d0ffc-f0bd-4579-a4ca-9ca97919214d) · [Timeline options](https://mobbin.com/screens/fbfd12a6-8eb1-45b9-a280-ec0c131e7cea)

- Header: menu · "‹ Today ›" · a **week strip** of day pills (M 29, T 30, W 1 …) with a dot under logged days and the selected day filled.
- A **macro banner**: "539 / 2041 · P 24 / 137 · F 20 / 68 · C 71 / 219" with thin colour bars; swipes to a "remaining" variant ("1502 left").
- The **timeline**: a vertical line with hour chips (7 AM, 8 AM …) and a small "+" next to every hour. Entries are white cards with a food icon, the name, "120 kcal 1P 0F 31C · 1 large" and an edit pencil; each hour shows its totals on the hour row ("120 · 1 P · 0 F · 31 C"). Empty hours stay visible by default; a timestamp ("8:00") sits left of each card when enabled.
- Long-press selects entries: a bottom bar with Edit · Copy · Move · Remove. A "Timeline Actions" sheet offers Copy Day, Select All, Clear Day, Hide Food Details, Hide Empty Hours. Options: hour range, alignment, timestamps, hourly totals.

### Logger
[Library tab, favourites](https://mobbin.com/screens/791e9d27-b4ab-46ed-bb34-21021ff19918) · [Search results, Common + Branded](https://mobbin.com/screens/e48b1b63-00de-4a1b-afbd-27d2ca22e120) · [Plate](https://mobbin.com/screens/a66beda3-ed55-4281-af6f-a49523ec228c) · [Quick Add](https://mobbin.com/screens/c35fd678-ce86-4dce-ac02-734e046e1549) · [Food detail with keypad](https://mobbin.com/screens/8f43f9df-d586-4583-871c-2e13664892b3)

- Header: × · a time chip ("12 PM") · a "539 / 2041" pill with a progress ring border · plate icons · ↓.
- Tabs: Scan · Search · AI · Quick Add · Library.
- Results grouped **Common** (with "See 15 More") then **Branded**. Each row: icon, name, "98 kcal 8P 7F 1C · 1 jumbo (63 g)", and a "+" on the right that adds the last serving with no detail screen.
- A black **Log Foods** pill floats bottom-right; "Add" puts the item on the plate instead.
- **Quick Add**: Energy (with a kcal/kJ unit), "Macro sum is 0 kcal", Protein, Fat, Carbs, Alcohol, Name; two buttons, Quick Add and Log Foods; the system numeric keyboard.
- **Food detail**: calories large, the three macros with percentage chips, "To Custom" and "Favorite" actions, "Impact on Targets" as four small rings, a serving row with a highlighted quantity and unit chips (g · oz · serving · cup), a custom keypad with Log Foods and Add on its bottom row.
- **Plate**: the staged items with per-item serving fields; a Plate / Day toggle on the nutrition cards (Calories, Protein, Fat, Carbs, each with a thin bar).

### Expenditure page
[Chart](https://mobbin.com/screens/61c71723-baab-41ff-8b56-3b66236d09da) · [Changes table](https://mobbin.com/screens/5a434e04-c693-4881-8ec3-84cf24f60d44)

- Header: ‹ · "Expenditure" · a graduation-cap help icon.
- Headline pair: "Average 2530 kcal" and "Difference −35 kcal" with the date range under them.
- The chart: a soft "flux range" band, the expenditure line with open markers on holding days and filled markers on updating days; y labels on the right.
- Range pills **1W 1M 3M 6M 1Y All** plus an averaging dropdown (D / W / M). A legend row: Flux Range · Updating · Holding.
- **Expenditure Changes** table: 3-day, 7-day, 14-day, 30-day, 90-day, each with a mini sparkline, the delta ("−24 kcal") and a word (Decrease / Waiting).
- **Current Expenditure** tile (big number + explanation) and **Current Strategy** tile ("Updating").

### Scale Weight page and the weight sheet
[Scale Weight](https://mobbin.com/screens/3670bd7d-82d1-4015-940a-8cf38d5d90a0) · [Log weight sheet](https://mobbin.com/screens/feac92dc-4a49-43a4-97fa-60b5c685e096)

- Header: ‹ · "Scale Weight" · **+**. Chart with the same range pills. A legend chip. Entries listed by month ("June 2026") as rows with the value, date and an edit pencil.
- The weight sheet: × · date with a dropdown · trash; Weight (lbs) and Body Fat (%) fields; a full-width black Save; the numeric keypad.

### Strategy
[Strategy](https://mobbin.com/screens/d1e582f5-34f9-4fa7-97fb-0287901da71c) · [Program and goal cards](https://mobbin.com/screens/333002b3-9228-4a20-8ced-123ef38cd691) · [Coached program](https://mobbin.com/screens/f58205d2-7b7e-4e89-a09a-6d9178a403ce) · [Edit goal](https://mobbin.com/screens/4e13dfe2-c783-4569-be53-efecd1c9f433)

- Big uppercase "STRATEGY"; chips New Goal · Edit Goal · New Program; a ring "6 DAYS until check-in"; Goal / Check-In toggles.
- **In Progress** program card: seven day columns of stacked chips (2041 kcal, 137 P, 68 F, 219 C) in the macro colours, weekday letters under them, New Program / Edit Program chips.
- Goal card: three numbers side by side (Goal Weight, Goal Rate in lbs, Goal Rate in %). Goal History list.
- Edit goal: a list of labelled rows with "Changed From" diffs, Initial Daily Budget, Estimated End Date with explanatory paragraphs.

## Bevel

### Sleep tab
[Sleep tab](https://mobbin.com/screens/ec59eceb-c06f-4ac6-b132-1938e39bac5c) · [Bedtime planner](https://mobbin.com/screens/623a0ad4-5b2d-4c22-863c-2b62fe74d151) · [Primary sleep with contributors](https://mobbin.com/screens/5d156e6a-f1ba-4b4f-8360-31122d692ee4) · [Sleep stages](https://mobbin.com/screens/c4c2dd72-1d95-431b-898f-ad415b4f5c39) · [Sleeping HRV](https://mobbin.com/screens/1682cf89-ebad-47a3-9bc8-454af9b04991) · [Nap](https://mobbin.com/screens/7d6f1f3e-8d13-4764-b322-30e7c0e0f618)

- Header: ‹ · "Sleep" · "Today, 14 September ▾" · alarm icon.
- A large ring "67% Quality"; two tiles under it, **Time in Bed** 6h 32m and **Time Asleep** 6h 26m.
- An **insight card** with an emoji title ("Sleep Debt: A Call for More Rest") and a paragraph in the user's numbers; "View insights".
- **Wind down / Target bedtime** pair (10.06 PM / 10.36 PM) above a 24-hour clock dial showing bedtime → wake; "Wake up at 7.00 AM ›"; "Tonight's sleep needed 8h 23m".
- **Timeline**: a list of sleep sessions (Primary sleep, Nap) with the score badge, date and time.
- **Trends** below.
- The Primary sleep sheet: ring 45%, Time in bed / Time asleep tiles with the bed and wake times, one-sentence summary ("You had poor sleep last night. Your REM sleep is lacking…"), then **Sleep Contributors**: rows of label · rating word (Poor / Fair / Good / Excellent) · a thin bar (Time asleep, REM, Deep, Heart rate dip, Sleep efficiency). Then the stage hypnogram, stage tiles, sleeping HR / HRV / RR / SpO₂ charts with a tab row.
- Nap sheet: Time asleep, Sleep Period, "Sleep bank +1h 0m".

### Home
[Home, light](https://mobbin.com/screens/746c3b08-afd9-4790-945c-ac254f31f41c) · [Home, dark](https://mobbin.com/screens/3fe55859-fa16-4472-bd7a-46cf38791850) · [Fitness](https://mobbin.com/screens/74df253c-88c5-4c18-91b3-fb9102ee54c1)

- "Today, 14 September ▾" title; three rings in a row (Strain, Recovery, Sleep) with percentages; an insight card with a one-line title and a paragraph; sections Stress & Energy, Nutrition. Tab bar Home · Journal · **+** · Fitness · Biology.
- Fitness: a two-month dot calendar of activity, Activity Summary chart, Strain Performance.

## Hevy

### Workout logging
[Logging, completed rows](https://mobbin.com/screens/8bde1e5b-2e6a-4ff9-8079-40ac9b93d2b1) · [Fresh session](https://mobbin.com/screens/972dd1a0-a420-43a8-8345-c7a527dd6da8) · [Rest timer](https://mobbin.com/screens/09f7b704-80b3-4c02-9a83-13ecc4312b09) · [Plate calculator](https://mobbin.com/screens/cd9efb18-5fe5-4705-ac21-c2c9cb2564af) · [Supersets](https://mobbin.com/screens/21e8a290-0d00-47c1-83f9-ad4b567f3ca0)

- Header: ∨ · elapsed "3min 0s" · timer icon · blue **Finish**. Summary row Duration / Volume / Sets.
- Per exercise: icon + name in blue, a notes line, "Rest Timer: 2min 30s", then a table **SET · PREVIOUS · KG · REPS · ✓**. "W" marks warm-ups. Completed rows turn pale green with a green tick; the previous session's set is shown greyed in PREVIOUS. "+ Add Set" under each exercise. Supersets get a purple chip.
- The rest timer is a bottom bar: big countdown, −15 / +15 / Skip. A plate calculator sheet draws the bar and available plates.

### History and detail
[Workout feed](https://mobbin.com/screens/a7d844b0-a5fd-4637-a878-74414017a206) · [Workout detail](https://mobbin.com/screens/f388fe19-e9de-44ef-8faa-b4c9c192f6ad) · [Sets with PR badges](https://mobbin.com/screens/c5fdb471-a809-4723-8efa-c5bae61eea99) · [Exercise history](https://mobbin.com/screens/4d2233ca-a56c-4244-bde5-821bf3f1b6a9) · [Home](https://mobbin.com/screens/79a622bd-392f-4ab4-9eb7-18e3a85fcc5c)

- Feed: each workout as a card with the name, date, Time / Volume / Records, and the first three exercises ("4 sets Deadlift (Barbell)") with "See 3 more exercises".
- Detail: summary row (Time, Volume, Sets, Records), a **Muscle Split** bar list (Legs 69%, Core 17% …), then the sets per exercise with small badges (Volume, Weight, 1RM) on record sets.
- Exercise page tabs: Summary · History · How to · Leaderboard; History lists sessions ("Day 6, 19 Aug 2025") with their sets.
- Home: Latest Routines cards, "4 Workouts, last 7 days" with day circles, Volume bars, a month calendar.
