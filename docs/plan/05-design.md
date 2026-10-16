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
