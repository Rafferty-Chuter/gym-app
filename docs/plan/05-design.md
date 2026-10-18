# 05 — Design direction

Load the `impeccable` skill (it reads `PRODUCT.md`) and the `dataviz` skill before UI tickets. This file adds the physique-specific rules.

**On reference screens.** The Mobbin connector on your account needs a paid Mobbin plan, so these patterns are described from the research instead of linked screens. If you upgrade Mobbin, UI sessions can call `mcp__Mobbin__search_screens` with the queries in §8.

---

## 1. Principles

1. **One verdict, then 2 numbers, then 1 action.** Every physique surface leads with the engine's verdict. Example: "Fix sleep before cutting further · 6h04m avg over 14 nights · squat −4% · Hold calories this week." Research C §3.
2. **Green is quiet.** When things are on track, show a calm "On track" state and no advice. Insight copy appears only for watch or attention states, or when a check-in is due.
3. **Calibrating is designed, not empty.** Show progress toward the first verdict ("Calibrating · 6 more weigh-ins · first read around Oct 30"), never a placeholder number.
4. **Logging speed beats completeness.** Weight ≤3 taps, sleep ≤4, re-log a recent food ≤2. A custom NumberPad, no system keyboard.
5. **States, not scores, on summary surfaces.** Home and Body headers show colour + icon + a word. Numbers belong in rows and detail views.
6. **State the window and n** wherever a judgement is shown ("14 nights, 13 logged").

## 2. Visual system

Reuse the existing language; don't invent a new one.
- **Surfaces:** `#080b12` (page), `#0e1420` (card), `#141c2a` (raised).
- **Accent:** mint `#00e5b0`.
- **Status:** good `#00e5b0`, watch `#fbbf24`, attention `#fb7185`, unknown muted teal. From `lib/ui/status.ts` after U1.
- **Type:** Geist. Numbers use `tabular-nums`.
- **Charts** (`components/charts/TimeSeriesChart.tsx`):
  - raw weigh-ins are small low-contrast dots;
  - trend weight is a 2 px mint line;
  - the goal projection is a dashed line from goal start at the goal rate;
  - dots appear only on days with a real weigh-in; the trend line runs continuously from the first to the last real weigh-in (02 §2.1), never beyond;
  - x axis is dates; y axis uses `computeNiceYAxis`;
  - tap a point for a tooltip with date, scale and trend.

  These follow MacroFactor's trend-vs-scale presentation (research A §C1). Run the `dataviz` skill's checks.
- **Food bars:** thin horizontal bars for kcal and P/C/F against target. Going over isn't red; it uses a neutral overflow tint, matching MacroFactor's non-judgemental nutrition UI (research A §D10).

## 3. Body page (`/body`)

```
┌────────────────────────────────────────┐
│ ‹ Thu 16 Oct ›                Check-in │  date switcher (backfill) · badge when due
│ → 90.0 kg · Lean gain · +0.25 %/wk     │  goal line
│ ▓▓▓▓▓▓░░░░░░░░░░░░  82.4 → 90.0 (trend)│  progress on trend weight
├────────────────────────────────────────┤
│ ● On track                             │  VERDICT CARD (status colour)
│ Gaining 0.24 %/wk (28 d), lifts rising.│  one line
│ [Ask why]                              │  → assistant with prefilled prompt
├────────────────────────────────────────┤
│ Weight   82.6 kg        [ + ]          │  TODAY STRIP: each row opens a sheet
│ Food     1,840 / 3,010 kcal  P 120/165 │  thin bars
│ Sleep    7h 10m · last night           │
├────────────────────────────────────────┤
│ [ weight chart: dots + trend + target ]│
│ Trend 82.4 kg · +0.24 %/wk (28 days)   │
├────────────────────────────────────────┤
│ Maintenance ≈ 2,780 ± 400 · settling   │  ENERGY CARD (maturity state)
│ Target 3,010 · P 165 · F 131 · C 293   │  (2,780 + 0.25% × 82.4 × 1,102; balanced split)
│ Last 14 d: on target (−40 kcal/day)    │
├────────────────────────────────────────┤
│ Lifts since phase start                │
│ Squat +3% · Bench +2% · RDL +1%        │
│ Sleep 14 nights: 7h05m avg · OK        │
└────────────────────────────────────────┘
```

**Verdict card states:**
- **Data:** "Calibrating" plus what's missing.
- **On track:** green, one line, no recommendation.
- **Watch or attention:** title, one line, up to 3 flag rows, a recommendation row with an **Apply** button (for `change_rate`), and **Ask why**.
- **Safety:** neutral card, no numbers, a referral line.

## 4. Goal setup (`/body/goal`)

Modelled on MacroFactor's goal wizard (research A §B2): direction → target and rate → summary.

- **Step 1, target weight.** NumberPad, prefilled with the current trend. Shows "Lean gain" or "Cut" as derived.
- **Step 2, rate.**
  - A slider with colour bands from `02-engine-spec.md` §5.2: green range, amber "faster than evidence suggests for lean gain", red/refused.
  - A training-status chip ("Intermediate · from your training years" in M1; "· from your lifts" once P4 derives it), tappable to change.
  - Updates live: "+0.21 kg/week · about 37 weeks · reach ~July 2027 · start at about 3,000 kcal · 165 g protein".
- **Step 3, confirm.** A summary, a "Start today" toggle (sets the phase start), then the safety question.
- **Copy:** honest and calm. "Lean gains are slow: about 0.2 kg a week for most intermediates."

## 5. Food log (`/body/food`)

Modelled on MacroFactor's logger (research A §D1–D8), cut down for M1.

- **Top:** day totals with bars, and day flags (Fasting / Incomplete).
- **Body:** a timeline of entries with time, label, kcal and P/C/F, and small "est." badges on AI estimates.
- **Bottom action bar:** `Quick add` · `Describe` · `Recent` · `Copy yesterday`.
- **Recent sheet:** foods sorted by use at this hour of day (MacroFactor's "go-to" foods for the current hour). One tap logs the last serving; long-press edits the serving.

## 6. Home

- **Order stays:** Start Workout → assistant insight → Signals → **Physique card** (new).
- **Physique card:** status dot + verdict title, then a single row of 3 mini stats: `82.4 kg +0.24%/wk` · `1,840 / 3,010` · `7h05m`. Tap → `/body`.
- **Assistant insight:**
  - When physique status is watch or attention, the insight card shows the physique verdict with chips "Why?", "What do I change?" and "Show the data".
  - Otherwise it keeps the training key focus.
- **Check-in badge:** on the physique card when due.

## 7. Copy library (start here; extend in P5)

Every number in the copy comes from `PhysiqueAnalysis`. Verdicts cite their own window and n.

| Rule | Title | Detail (example numbers) | Recommendation row |
|---|---|---|---|
| NO-GOAL | Set a goal | Set a target weight to get a verdict. | Set goal → |
| DATA-RATE | Calibrating | 6 more weigh-ins for a first read on your rate. | — |
| DATA-EXP | Calibrating | Maintenance estimate: day 9 of about 21. | — |
| DATA-HOLD | Holding | Log 2 more days of food this week to resume updates. | — |
| DATA-PARTIAL | Confirm two days | Tue and Thu look incomplete (640 and 900 kcal). | Confirm days → |
| ON-TRACK (cut) | On track | Losing 0.6 %/wk over 28 days, lifts holding. | — |
| ON-TRACK (gain) | On track | Gaining 0.24 %/wk over 28 days, lifts rising. | — |
| NO-CHANGE | Nothing to change | Nothing to change this week. | — |
| ADH-1 | Eat to target first | You've averaged 320 kcal under target over 14 days. Eat to target before we change your goal. | — |
| LOSS-1 | Slow the cut | Losing 1.5 %/wk over 28 days, and squat and bench are down 8% since the cut began. A 1.0 %/wk goal is above the range that protects strength. | Ease goal to 0.6 %/wk (about +400 kcal/day) · Apply |
| LOSS-1 (goal in range, coach lagging) | Losing faster than planned | Losing 1.3 %/wk over 28 days against a 0.6 goal, while eating to target. Your maintenance estimate is low. | Update targets now (+300 kcal/day) |
| LOSS-2 | Faster than needed | Losing 1.2 %/wk over 21 days with lifts holding. No change unless this continues. | — |
| LOSS-6 | Weight loss has stalled | −0.2 %/wk over 28 days against a −0.6 goal, while eating to target. Your maintenance estimate looks high. | Update targets now (−150 kcal/day) |
| GAIN-1 | Gaining faster than a lean bulk needs | Gaining 0.75 %/wk over 6 weeks. In studies, gains this fast mostly add fat. | Ease goal to 0.25 %/wk (about −440 kcal/day) · Apply |
| SLEEP-1 | Don't cut calories further | Sleep is averaging 6h04m over 14 nights, and squat and bench are down 3–4%. Get sleep back first. | Aim for +45–60 min a night (lights-out 22:30) |
| PRO-1 | Protein is low for a cut | 1.5 g/kg over the last 3 weeks; your target is 2.1. | Aim for 165 g a day |
| RECOMP-1 | Looks like recomposition | Scale flat over 28 days, lifts up 3%, waist down 2.4 cm. | — |
| RECOMP-WAIST | Log your waist | Lifts are up while the scale is flat. A weekly waist measurement tells recomposition from a stall. | Log waist → |
| SAFE-3 | Let's pause the cut | What you described can be a sign of under-fuelling. Move to maintenance and talk to a GP or registered dietitian. | — |

**Banned phrases:** `02-engine-spec.md` §10 (the copy linter in P5 enforces them).

## 8. Reference queries (if Mobbin access is available)

Run these with `platform: "ios"`, `output_destination: "code"`:
- "MacroFactor weight trend chart with scale weight dots and trend line"
- "MacroFactor weekly check-in program update screen"
- "MacroFactor food logger timeline with quick add"
- "WHOOP sleep detail screen with hours vs need"
- "Oura readiness contributors list"
- "Hevy workout logging set rows with previous column"

---

## 9. Rev 2 · The redesign (17 Oct 2026)

Approved direction after the first dogfood look: "not clear, can't say why". Diagnosis: the Body tab did five jobs on one page, logging rows looked like information rows, food had no screen and sleep had none. The fix is MacroFactor's and Bevel's rule: **one tab answers one question**, and each tab owns its own "+". Reference screens: `research/G-reference-screens.md`. Rule from the founder: if unsure, don't change it. Everything below is grounded in a reference screen or in §1 principles.

### 9.1 Navigation

Tab bar: **Home · Food · Body · Sleep · Train**. Templates and History live inside Train. Profile is a round button in the Home header. Each tab's primary log action is a white round **+** at the top right of its header (MacroFactor's Scale Weight page): Food → the logger, Body → weigh-in, Sleep → last night, Train → Start workout (the hero, not a +).

### 9.2 Page header

MacroFactor's caption-over-title: an 11px tracked caption (the date or the goal) above the page title in `hero` size (34px/600, title case, never uppercase), with the + on the right. Pages scroll under a plain `bg` header with a hairline when stuck.

### 9.3 Home

1. **Today strip**: three tiles, Weight · Food · Sleep. Each shows today's value ("81.1 kg", "1,840 / 3,010", "7h 10m") or its action ("Weigh in", "Log food", "Log sleep") and taps straight into that log sheet. Bevel's three rings and MacroFactor's Habits, without rings.
2. **Verdict line** (unchanged component).
3. **Start workout** (white, the only primary button above the fold).
4. Assistant insight card, quieter; takes the physique verdict when watch/attention (as now).
5. Signals, with quiet pills.

### 9.4 Food (MacroFactor Dashboard + Food Log, merged)

- Header: caption "TODAY · FRI 17 OCT", title "Food", +. A **week strip** of seven day pills under it (weekday letter + day number, a dot under logged days, the selected day filled white); tapping switches the day.
- **Widget carousel** (horizontal scroll-snap, page dots):
  1. *Today*: remaining kcal large ("1,170 left"), consumed and target either side, three thin macro bars (P / F / C) with "113 / 137 g".
  2. *Energy balance*: 30 intake bars against a dotted expenditure line, the three-term row "avg intake − expenditure = difference", an Expenditure / Targets toggle.
  3. *Week*: seven columns of four mini bars (kcal, P, F, C) with grey target ticks that turn white when met; the selected day outlined, its numbers on the right.
  A Consumed / Remaining pill toggle sits under the carousel.
- **Timeline**: hour rows from 06:00 to 23:00 (the range is a setting), a small + next to each hour, entries as rows (name · "640 kcal · 45P 12F 60C · 1 bowl" · edit pencil), hour totals on the hour row. Timeline actions: Copy day, Clear day, Hide empty hours.
- **Add food bar**: a search-style pill ("Add a food") pinned above the tab bar; opens the logger.
- **Logger sheet** (full height): header × · time chip · "539 / 2,041" pill · ↓. Tabs: **Recent · Quick add · Describe · Saved**. Recent shows go-tos for this hour, then latest, each with a + that logs the last serving in one tap. Quick add: kcal, P, F, C, optional name, with "Macro sum is 480 kcal" under the kcal field; the NumberPad, not the system keyboard. Describe: text → AI estimate landing as editable rows (needs the API key; otherwise says so). Saved: favourites and saved meals.
- **Energy page** (`/food/energy`): MacroFactor's Expenditure page. Headline pair "Average 2,780 kcal · Difference −35 kcal" over the range; chart with the ± band, updating/holding markers, range pills 1W 1M 3M 6M All; "Expenditure changes" table (3-, 7-, 14-, 30-day deltas, "Waiting" until there is data); Current expenditure and Current strategy tiles; **Targets history**: each program entry with its one-sentence reason. This is "the maintenance adjustment".
- Macro colours (DESIGN.md): kcal blue, protein red, fat yellow, carbs green, muted; used only in nutrition charts and bars. Going over is never red.

### 9.5 Body (MacroFactor Scale Weight + Weight Trend + Goal Progress, plus the verdict)

- Header: caption is the goal ("78.0 KG · CUT · −0.60 %/WK", taps into the goal), title "Body", + weigh-in.
- Verdict line.
- Hero: trend weight ("81.1 kg") with the rate and window beside it; the chart with **range pills** (1W 1M 3M 6M All) and a legend row (Trend · Scale · Goal).
- **Goal progress**: MacroFactor's waterfall, one bar per week (toward the goal light, away dark, remaining grey) and "2.9 of 7.0 kg · about 12 weeks left".
- Lifts since phase start; Waist; **Entries** by month (value, date, edit) for the last 30 days.
- The energy card moves to Food.

- **Moving ETA** (added after R5): the Goal progress card ends with "ETA Fri 25 Dec · 2 weeks behind plan" from the trend's observed rate, with the likely window from the rate margin under it; the header caption carries the short form. Early read shows the planned date and what it needs; a trend moving away shows no date. Never a countdown, never red.

### 9.6 Sleep (rev 3, after Bevel and WHOOP, still no percentage score)

- Header: caption "SLEEP GOAL 8H 00M", title "Sleep", + log (acts on the selected night).
- **Night card:** ‹ "Last night" › with the span under it; arrows step back through earlier nights (replaces the nights list). A ring of hours asleep against the goal, hours, word and "of 8h 00m" in the centre, ring in the word's colour. Beside it: In bed (bed to wake), Efficiency, Wake-ups. "Edit this night" for manual nights.
- **Stages** (watch nights only): Awake, REM, Core, Deep, each with share, minutes and a grey bar; a white tick at the user's usual share once 5 nights carry stages. Display only, never coloured or judged.
- **Recovery** (watch only): the word in the status colour, HRV and resting HR tiles against their usual; "Calibrating" until the windows fill.
- **Tonight:** one lights-out time, for tonight's need (goal plus a share of the week's debt), and the wake time with ±15 min; one sentence on where the need comes from.
- **Last 14 nights:** the engine's one-sentence read with its dot, then the bars with the goal line; tapping a night selects it in the night card.
- **Contributors:** a 2 × 2 grid (Duration, Efficiency, Wake-ups, Consistency), word, label, thin bar. Debt is said in words in the 14-night card.

### 9.7 Train (Hevy's home + feed)

Start workout (white hero), Latest routines (template cards), "N workouts · last 7 days" with day circles, Volume bars, then the recent workouts feed (name, date, Time / Volume / Sets, first three exercises). Templates and History keep their routes and are linked from here. Hevy-style set logging (PREVIOUS column, completed-row tint, rest timer ±15 s, plate calculator) is ticket R5 and touches the sacred logger last.

### 9.8 Logging to the smallest detail

- Weight sheet: date with a dropdown, delete, optional body-fat %, the value prefilled with the last entry, Save in one tap (MacroFactor's sheet).
- Food: Recent before typing, one-tap + per row, macro-sum hint, Edit day total, Copy day.
- Sleep: prefilled from the last 7 nights, ±15 min steppers, wake-ups, a sleep-goal setting.
- Every sheet: the NumberPad, never the system keyboard, for numbers.
