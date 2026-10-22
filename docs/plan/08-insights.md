# 08 — Insights: what the engine spots before the lifter does

A plan for Progress and for what we do with the person's data. Written 2026-10-22 after a review of every engine, every stored field and what other apps do. The evidence, sources and the statistics recipe are in [`research/L-insights-evidence.md`](research/L-insights-evidence.md). Nothing here is built yet.

## The idea

Five questions every lifter on a goal asks. The app answers each from their own data, before they ask, in kilos, with the counts behind it.

| Question | Example answer | First possible |
|---|---|---|
| **Why did the scale jump today?** | "Up 0.9 kg on your trend. Yesterday: 160 g more carbs than usual. Jumps like this were gone in 2 to 3 days for you." | about day 21 |
| **Why isn't my weight moving?** | "Losing 0.1 kg a week, plan 0.4. Food is on target. Steps fell from 11,200 to 6,900 a day since 2 Jul, about 150 kcal a day: most of the gap." | week 4 |
| **Why is my bench stuck?** | "Bench flat for 7 sessions at about 114 kg. Since 1 Sep: chest sets 14 → 8 a week · sleep 6h 10m against your usual 6h 50m." | 6 sessions of that lift |
| **What hurts my sleep and recovery?** | "After 3 or more drinks: resting HR 6 bpm higher, HRV 11 ms lower that night · 7 vs 40 nights." | about 5 nights each way |
| **What moves my lifts?** | "Squat about 3 kg lighter when you wake an hour or more earlier than usual · 9 vs 31 sessions." | 4 to 6 months (sooner with imported history) |

The first four come fast enough for the TestFlight testers (6 to 8 weeks) to see. The fifth is the long-run reason to stay and pay.

## Where we are

**Works well:** trend weight, rate, ETA and maintenance (MacroFactor's method); the weekly weight link (intake, target drift, fewer steps than last week, unlogged days); Connections (8 conditions against all lifts pooled, 16 weeks, strict); Findings (5 rules over 4 weeks); recovery (HRV and resting HR against the person's usual).

**In the way:**
1. **Data we throw away.** Sodium, sugar and alcohol come with every Open Food Facts and CoFID food and are dropped; so are the food's grams and id. From Apple Health we drop active energy, workouts, logged alcohol, caffeine, water and sodium. The workout's start time is never saved, HRV is a whole-day mean rather than overnight, and a new user's Apple Health history is read back only 60 days.
2. **Engines that exist but don't show.** The causes for lifts not growing (`liftsLink`), the weekly fixes and the per-lift plateau signal are computed and hidden.
3. **Connections is too blunt to spot things early.** All lifts pooled into one number; 16 weeks gives about half a chance of seeing a real 4 kg effect, so "No clear link" often means "too little to tell"; the way each session is compared with its neighbours halves an effect when short nights come in runs (a true −4% read −2%); no allowance for deloads or the cut.
4. **Nothing reads the scale day to day, sleep timing, steps or training load** against any outcome.
5. **Times don't line up.** Live workouts are stamped at the end, Hevy and Strong imports at the start; back-logged food sits at 12:00.

## The plan

Four steps. The first uses only data we already have.

1. **Use what we have** (IN1 to IN5): fix the clocks, explain scale jumps, explain stalls, name the stuck lift, rebuild Connections per lift with sleep timing.
2. **Capture what's missing** (IN6 to IN8): sodium, sugar and alcohol on every food, drinks in one tap, more from Apple Health.
3. **New links from the new data** (IN9): alcohol against sleep, recovery, the next session and the scale; salt against the scale.
4. **Show it, and say it first** (IN10, IN11): Progress leads with what was spotted; the Monday report and one notification a week bring it to them.

```
Now, data we have:   IN1 → IN2, IN3, IN4 (in parallel) → IN5
New data:            IN6 → IN7 ;  IN8  →  IN9
Show it:             IN10 after IN2 to IN5 ;  IN11 last
```

## How Progress looks after

```
Progress
┌ Cut to 78.0 kg ───────────────────────────┐
│ 78.4 kg trend · 0.4 kg to go · ~13 Nov    │
│ Losing 0.1 kg a week · plan 0.4           │
│ Steps 11,200 → 6,900 a day since 2 Jul    │  ← IN3, only when off plan
└───────────────────────────────────────────┘
Spotted                                         ← IN10: at most 3, biggest and newest first
  Bench flat for 7 sessions · chest sets 14 → 8 a week
  Up 0.9 kg today · 160 g more carbs yesterday · usually gone in 2–3 days
  After 3+ drinks · resting HR +6 bpm that night · 7 vs 40 nights
What moves your squat              [Squat ▾]    ← IN5, one lift at a time
  HURTS ◀────────┼────────▶ HELPS
  Woke 1 h+ early      −3 kg   9 vs 31
  Two short nights     −4 kg   8 vs 30
  Longer night               +4 kg   32 sessions
  Not enough to tell yet: carbs, protein, days since squat · about 6 more sessions
Over time                                       ← the days behind each fact marked on the charts
Weigh-ins · Waist
```

- **Tap any fact** to see the working: the average when yes against the average when no, both counts, and those sessions or days marked on the chart (Garmin's detail sheet, Oura's tags on the chart).
- **The lag is in the label** ("the night before", "the day after", "that night").
- **No journaling.** Every condition comes from what they already log or wear (WHOOP's sensor rows), so nothing new to fill in daily except drinks, which are food.
- **Two gates, both visible.** A count gate with progress ("9 of 10 short-night sessions"), then the signal gate: "Not enough to tell yet" until the test could have seen a 3 kg effect, and only then "No clear link".
- Findings fold into Spotted. The weekly report shows the same rows.

## Decided: facts that point at their own lever (B)

The founder chose B on 2026-10-22: cards state facts that point at the person's own lever; a plain suggestion (C) appears only in the weekly report, one at a time. The rule before was facts, not advice; the brief for this plan asked the app to suggest changes to food and sleep. The three options considered:

| | Wording | |
|---|---|---|
| A. Facts only | "Your squat is about 4 kg heavier after a longer night · 7h 48m vs 6h 10m" | today's rule |
| **B. Facts that point at their own lever** | "Your squat is about 4 kg heavier after 7h 30m or more · 2 of your last 7 nights were" | **recommended for the cards** |
| C. A suggestion | "Aim for 7h 30m before squat days" | only in the weekly report, one at a time, when the link is proven in their data and studies back it |

B says what works for them in their numbers and leaves the choice to them. C is where the coach can take over later. Safety notes stay as they are.

## How we keep it honest

- **A fixed list of tested pairs**, written in code before any data is seen, so thresholds are never tuned to find something.
- **Strict tests:** within-person comparison adjusted for the lift's trend, deloads and the diet phase; false-discovery control across the list; a minimum effect a lifter would notice; the link must hold in both halves of the history; it shows after two weekly passes in a row and hides after three fails (L §4).
- **A simulation for every new fact before it ships**, like research J: people with known truths and controls with none, 30 seeds each. Target: 80% or more of real effects found once the data is enough, 5% or fewer false facts on the controls.
- **Words:** "after", "lined up with", never "because" or "caused"; always the counts; the must-not-claim list applies (a jump is never fat, no muscle loss, no menstrual kilos).
- **Never shown:** conditions that are always "yes", pairs linked by definition, a link from one occurrence.
- **Not planned, too small to see in one person:** protein or meal timing, caffeine, pre-workout carbs, menstrual effects on strength. Plateaus are described ("chest sets 14 → 8"), never blamed on one cause.

## Tickets

Each is one session with the usual pattern (CLAUDE.md "Before you say a ticket is done"): earn its place, Mobbin where the UI is new, tests, `npm run check`, `npm run build`, 390 px light and dark, a STATUS row. **Files more than one ticket touches** (do these serially): `app/body/page.tsx` (IN4, IN10), `components/progress/GoalCard.tsx` (IN3, IN10), `lib/physique/linkedReasons.ts` (IN3, IN4), `lib/physique/types.ts` (IN1, IN6), `lib/health/*` (IN1, IN8). None touches the assistant files (the founder's session).

### IN1 · Fix the clocks
S · first
- Save the workout's start time on `StoredWorkout` (the draft has `startedAt`); Hevy and Strong imports keep theirs; older live sessions get `completedAt − durationSec`. One small edit in `app/workout/page.tsx` (hotspot).
- Keep the weigh-in's reading time from Apple Health as `measuredAt`, in local time without the false `Z`.
- HRV from overnight readings only; keep HRV and resting HR on days with no night logged. (Done: the iPhone app's read only; Health Auto Export sends HRV aggregated by day.)
- Native first sync reads a year of sleep, weight, steps and HRV, not 60 days, so imported lifts meet a year of sleep on day one.
- Schema impact: optional fields, `schemaVersion` bump, no rewrite of old records.

### IN2 · Why the scale jumped
M · after IN1 · new `lib/physique/scaleJump.ts`
- Scale minus trend. Speak only when the gap is at least 0.5 kg and 1.5 times the person's usual day-to-day spread, with 21 weigh-ins or more.
- The day before against the person's 14-day usual: carbs, calories, weekend, hard leg sets, creatine, period and travel days. Sizes start from the evidence (L §3) and become the person's own after about 60 weigh-ins.
- "Usually gone in N days" from the person's own past jumps, shown only when it beat the plain guess on their history.
- Shows on the weigh-in sheet after saving, Home's weight tile, and a tap on a scale dot on Progress. (Done: a card on Home, a live line in the sheet, a line per jump day in Progress's weigh-in list; see the STATUS row for what changed from this brief.)
- Acceptance: simulated carb-spike days explained 80% or more; noise-only days given a cause 5% or fewer.

### IN3 · Why the weight isn't moving
M · `lib/physique/linkedReasons.ts`
- Steps against the start of the goal, not only last week, in kcal and kg a week; maintenance moving since the start; water hiding a loss (carbs or salt rising, creatine started); unlogged days and intake (already there). Each with its share of the gap in kg a week, and what is left unexplained.
- One line under the goal card when off plan or "Not clear yet", and on the report's Food and weight card (today it shows "Calories predict −0.4 kg, scale −0.1" with no why). (Done; see the STATUS row.)
- Acceptance: personas for steps falling by 5,000, carbs rising, under-logging and a falling maintenance each name their cause; on-plan controls say nothing.

### IN4 · The stuck lift, and what changed
M · new `lib/physique/liftPlateau.ts`
- Per main lift: flat over its last 6 sessions or more (at least 3 weeks), or clearly down.
- Then only what changed past a floor in that span against the 6 weeks before: weekly hard sets for its muscles, sessions a week of that lift, sleep against usual and short nights, calories against maintenance, protein, rep range, deloads, the cut's pace, and that lift's own Connections links.
- Brings the hidden `liftsLink` and `plateauSignal` here and retires the duplicates.
- Top of Progress when it fires, and on the exercise page. (Done; see the STATUS row, including why `liftsLink` and `plateauSignal` stay.)

### IN5 · Connections, rebuilt per lift
L · after IN1 · `lib/physique/connections.ts`
- The method in L §4: regression with block and phase terms, false-discovery control, the split-half check, a smaller shown effect when the evidence is just over the line.
- Detect across lifts, show kilos per lift; test a lift alone once it has the sessions.
- New conditions from data we have: waking an hour or more earlier than usual, two short nights in a row, sleep against the person's usual, HRV against usual, calories against maintenance over 3 days, hard sets in the last 7 days, days since the same lift, hours awake at the session (after IN1).
- A second outcome: reps at a weight they repeat.
- All history up to a year, not 16 weeks.
- `scripts/study-connections.ts` like research J. (Done; results in `research/M-connections-study.md`, see the STATUS row.)

### IN6 · Sodium, sugar and alcohol on every food
M · `lib/food/`, `scripts/build-cofid.ts`, `lib/physique/types.ts`
- Optional `sodiumMg`, `sugarG`, `satFatG`, `alcoholG`, `grams` and the source id on `FoodEntry` and `SavedFood`.
- The CoFID rebuild reads sodium (Inorganics) and sugars and alcohol (Proximates); Open Food Facts maps salt, sugars, saturated fat and alcohol; the AI parse and the chain figures add them where known; the MacroFactor import reads its micronutrient sheet.
- Shown only in a food's detail; no new targets. (Done: the search food page and the entry sheet; see the STATUS row.)
- Schema impact: optional fields.

### IN7 · Drinks in one tap
S · after IN6
- A Drinks row in the food logger: pint, glass of wine, single, can, with a count; alcohol and calories from CoFID.
- Mobbin: how MyFitnessPal, Cronometer, Reframe and Sunnyside log drinks. No moralising words (must-not-claim 15). (Done: a row of chips under the search box; see the STATUS row.)

### IN8 · More from Apple Health
M · `lib/health/*`, `ios/`
- Read active energy, workouts (type, start, length), logged alcohol, caffeine, water and sodium; wrist temperature and cycle only if the person opts in.
- Active energy explains stalls and training days; it never feeds the maintenance estimate.
- Update the iOS usage strings, privacy manifest, `/privacy` and the DPIA draft.

### IN9 · Alcohol and salt links
M · after IN6 to IN8
- Alcohol against that night's resting HR, HRV and sleep (the effect is big enough to see after about 5 drinking nights and 5 without).
- Alcohol against the next session and the next 2 days on the scale, said honestly: strength often holds.
- Salt feeds IN2's scale-jump drivers.

### IN10 · Progress leads with what was spotted
L · after IN2 to IN5 · `app/body/page.tsx`, `components/progress/`, `components/report/`
- The layout above: goal, Spotted, What moves your lift, the charts with the days marked, then weigh-ins.
- Tap shows the working; the count gate shows progress; same rows on the weekly report.
- Mobbin: WHOOP Behavior Insights, Garmin Lifestyle Logging, Oura tags, Apple Health Highlights (screens in L §5).

### IN11 · Say it first
S · last
- The Monday report and its reminder lead with the biggest new fact; one local notification a week at most when a new link passes or a lift stalls (TR11's notifications).
- "Ask the coach why" on each fact is already built behind `ASSISTANT_ENABLED`.

## Earns its place

- **Better than the other apps:** none links sleep, alcohol or food to a named lift in kilos, none explains a plateau with the person's numbers, and none explains a scale jump from yesterday's food (L §5). WHOOP is the closest and adds automatic 1RM in November 2026, so the lift links are the part to move on first.
- **Better than on their own:** nobody can see a 4 kg squat effect through 3% session-to-session noise, or tell carbs from calories, by eye. The engine can, and says when it can't.
- **Their own data, worth paying for:** every fact carries their counts. The scale jump and the stall are the moments people give up on a cut; an answer in their numbers at that moment is the reason to pay.
