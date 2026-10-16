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
  - missing days are gaps, never interpolated in the line;
  - x axis is dates; y axis uses `computeNiceYAxis`;
  - tap a point for a tooltip with date, scale and trend.

  These follow MacroFactor's trend-vs-scale presentation (research A §C1). Run the `dataviz` skill's checks.
- **Food bars:** thin horizontal bars for kcal and P/C/F against target. Going over isn't red; it uses a neutral overflow tint, matching MacroFactor's non-judgemental nutrition UI (research A §D10).

## 3. Body page (`/body`)

```
┌────────────────────────────────────────┐
│ ‹ Thu 16 Oct ›                Check-in │  date switcher (backfill) · badge when due
│ → 90.0 kg · Lean gain · +0.33 %/wk     │  goal line
│ ▓▓▓▓▓▓░░░░░░░░░░░░  82.4 → 90.0 (trend)│  progress on trend weight
├────────────────────────────────────────┤
│ ● On track                             │  VERDICT CARD (status colour)
│ Gaining 0.31 %/wk, lifts rising.       │  one line
│ [Ask why]                              │  → assistant with prefilled prompt
├────────────────────────────────────────┤
│ Weight   82.6 kg        [ + ]          │  TODAY STRIP: each row opens a sheet
│ Food     1,840 / 2,950 kcal  P 120/170 │  thin bars
│ Sleep    7h 10m · last night           │
├────────────────────────────────────────┤
│ [ weight chart: dots + trend + target ]│
│ Trend 82.4 kg · +0.31 %/wk (21 days)   │
├────────────────────────────────────────┤
│ Maintenance ≈ 2,780 kcal · settling    │  ENERGY CARD (maturity state)
│ Target 2,950 · P 170 · F 80 · C 365    │
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
  - A training-status chip ("Intermediate · from your lifts"), tappable to change.
  - Updates live: "+0.27 kg/week · about 29 weeks · reach ~May 2027 · start at 2,950 kcal · 170 g protein".
- **Step 3, confirm.** A summary, a "Start today" toggle (sets the phase start), then the safety question.
- **Copy:** honest and calm. "Lean gains are slow: about 0.25 kg a week for most intermediates."

## 5. Food log (`/body/food`)

Modelled on MacroFactor's logger (research A §D1–D8), cut down for M1.

- **Top:** day totals with bars, and day flags (Fasting / Incomplete).
- **Body:** a timeline of entries with time, label, kcal and P/C/F, and small "est." badges on AI estimates.
- **Bottom action bar:** `Quick add` · `Describe` · `Recent` · `Copy yesterday`.
- **Recent sheet:** foods sorted by use at this hour of day (MacroFactor's "go-to" foods for the current hour). One tap logs the last serving; long-press edits the serving.

## 6. Home

- **Order stays:** Start Workout → assistant insight → Signals → **Physique card** (new).
- **Physique card:** status dot + verdict title, then a single row of 3 mini stats: `82.4 kg +0.31%/wk` · `1,840 / 2,950` · `7h05m`. Tap → `/body`.
- **Assistant insight:**
  - When physique status is watch or attention, the insight card shows the physique verdict with chips "Why?", "What do I change?" and "Show the data".
  - Otherwise it keeps the training key focus.
- **Check-in badge:** on the physique card when due.

## 7. Copy library (start here; extend in P5)

| Rule | Title | Detail (example numbers) |
|---|---|---|
| DATA | Calibrating | 6 more weigh-ins and 4 more logged days before the first read. |
| ON-TRACK (cut) | On track | Losing 0.6 %/wk, lifts holding. |
| ON-TRACK (gain) | On track | Gaining 0.31 %/wk, lifts rising. |
| ADH-1 | Eat to target first | You've averaged 320 kcal under target over 14 days. Hit the target before we change the plan. |
| LOSS-1 | Slow the cut | Losing 1.4 %/wk and squat and bench are down 6% since the cut began. Ease to 0.75 %/wk (about +250 kcal/day). |
| LOSS-2 | Faster than needed | Losing 1.2 %/wk with lifts holding. No change unless this continues 2 more weeks. |
| LOSS-6 | Fat loss has stalled | 28 days at −0.2 %/wk while eating to target. Move the rate to −0.5 %/wk (about −150 kcal/day). |
| GAIN-1 | Gaining faster than a lean bulk needs | +0.75 %/wk over 5 weeks. The extra is mostly fat. Ease to 0.35 %/wk. |
| SLEEP-1 | Fix sleep before cutting further | 6h04m average over 14 nights, and squat is down 4%. Hold calories; aim for lights-out 22:30. |
| PRO-1 | Protein is low for a cut | 1.5 g/kg over the last 3 weeks; the target is 2.1. |
| RECOMP-1 | Looks like recomposition | Scale flat, lifts up 3%, waist down 1.8 cm. No change needed. |
| SAFE-3 | Let's pause the cut | What you described can be a sign of under-fuelling. Move to maintenance and talk to a GP or registered dietitian. |

Banned words: see `02-engine-spec.md` §10. Also never use "great job", "crushing it" or "!".

## 8. Reference queries (if Mobbin access is available)

Run these with `platform: "ios"`, `output_destination: "code"`:
- "MacroFactor weight trend chart with scale weight dots and trend line"
- "MacroFactor weekly check-in program update screen"
- "MacroFactor food logger timeline with quick add"
- "WHOOP sleep detail screen with hours vs need"
- "Oura readiness contributors list"
- "Hevy workout logging set rows with previous column"
