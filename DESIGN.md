---
name: Gym AI
description: A calm, precise physique and training coach for serious natural lifters. Mist: soft green and misty sky, light or dark with the phone.
colors:
  # Mist (rev 4.2). Light values; the dark mode set is under colors-dark. Both live in app/globals.css.
  page-top: "#d9e6ec"
  bg: "#edf2f0"
  surface: "#fafcfb"
  surface-raised: "#e8eeeb"
  surface-pressed: "#dbe4e0"
  border: "#dce4e0"
  border-strong: "#c2cfca"
  text: "#17272a"
  text-secondary: "#4a5d5f"
  text-tertiary: "#677a7a"
  primary: "#2f6b55"
  primary-pressed: "#275a47"
  text-on-primary: "#f4faf6"
  green: "#7dbf9c"
  green-strong: "#2f7d5c"
  green-dim: "#d3e8dc"
  sky: "#7ea8c6"
  sky-strong: "#3d6d92"
  sky-dim: "#d4e2ec"
  status-good: "#2b875c"
  status-watch: "#b0731a"
  status-attention: "#c2475b"
  status-unknown: "#8a9a9a"
  chart-trend: "#34936a"
  chart-training: "#d4741f"
  chart-sleep: "#3a8fbd"
  chart-steps: "#7b61c9"
  chart-heart: "#c24f8f"
  chart-raw: "#a7b6b3"
  chart-projection: "#8a9a9a"
  chart-band: "#e2eae7"
  macro-kcal: "#5a84d4"
  macro-protein: "#cf5f5a"
  macro-fat: "#c4952b"
  macro-carb: "#4b9f76"
  sleep-top: "#cfdeea"
  stage-awake: "#df9467"
  stage-rem: "#5fb0dc"
  stage-core: "#5b88cc"
  stage-deep: "#8a83cc"
colors-dark:
  page-top: "#1c2b32"
  bg: "#10191b"
  surface: "#172225"
  surface-raised: "#213033"
  surface-pressed: "#2b3d40"
  border: "#26373a"
  border-strong: "#37494c"
  text: "#e6efeb"
  text-secondary: "#a1b3af"
  text-tertiary: "#72878a"
  primary: "#a8d8bc"
  primary-pressed: "#92c7a8"
  text-on-primary: "#0f201a"
  green: "#8fd0ab"
  green-strong: "#a9e0c1"
  green-dim: "#24423a"
  sky: "#9dbfd8"
  sky-strong: "#b9d4e8"
  sky-dim: "#2a4254"
  status-good: "#74d3a2"
  status-watch: "#e6b765"
  status-attention: "#ef8f99"
  status-unknown: "#72878a"
  chart-trend: "#a9e0c1"
  chart-training: "#f0a65e"
  chart-sleep: "#86c4e4"
  chart-steps: "#b4a3f2"
  chart-heart: "#ee8cc0"
  chart-raw: "#4d6266"
  chart-projection: "#72878a"
  chart-band: "#1c2a2d"
  macro-kcal: "#8fb0f0"
  macro-protein: "#ee8d86"
  macro-fat: "#e8c477"
  macro-carb: "#84d1a6"
  sleep-top: "#1a2a39"
  stage-awake: "#f0aa7c"
  stage-rem: "#8fd0f2"
  stage-core: "#7ea2e0"
  stage-deep: "#aaa3e8"
typography:
  hero:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  title:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  number:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  label:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.01em"
  caption:
    fontFamily: "var(--font-geist-sans), system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: "0.04em"
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-primary}"
    typography: "{typography.number}"
    rounded: "{rounded.md}"
    padding: "14px 20px"
    height: "48px"
  button-primary-pressed:
    backgroundColor: "{colors.text-secondary}"
  button-secondary:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    typography: "{typography.number}"
    rounded: "{rounded.md}"
    padding: "12px 16px"
    height: "44px"
  button-secondary-pressed:
    backgroundColor: "{colors.surface-pressed}"
  row:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "14px 16px"
    height: "56px"
  pill:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
    height: "30px"
  pill-selected:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-on-primary}"
  sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
    padding: "16px 20px 24px"
  numberpad-key:
    backgroundColor: "{colors.surface-raised}"
    textColor: "{colors.text}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    height: "52px"
  tab-bar:
    backgroundColor: "{colors.bg}"
    textColor: "{colors.text-tertiary}"
    typography: "{typography.caption}"
    height: "56px"
  tab-bar-active:
    textColor: "{colors.text}"
---

## Overview

Gym AI is a product-register interface (the design serves a task, it is not the product). The user is a serious lifter: stepping off the scale in a dim room first thing in the morning, or between sets under gym lights. The tool should disappear into the task: log in a few taps, read one line, move on.

**Rev 4, decided 2026-10-18 with the founder: Mist.** Soft green and misty sky across the whole app, replacing the black and white of rev 1 to 2 and the per-tab hues of rev 3 (Sleep's indigo did not suit the rest). The page is a misty sky that fades into a pale green-grey (light) or a deep green-slate (dark); cards sit on it as near-white or slate layers; the one action colour is a soft green; Sleep leans on the sky side. History: rev 1 (2026-10-16) was MacroFactor-style near-black with white actions and mint for good; rev 3 (earlier on 2026-10-18) gave each tab its own hue.

**Rev 4.1, 2026-10-21 (final polish for testers and the App Store).** Same palette, fewer boxes. A screen is a few panels, each holding one idea, with rows inside a panel split by hairlines instead of gaps between separate cards. Panels and row groups take `rounded.lg` (16px); controls (buttons, inputs, chips) keep `rounded.md` (12px). Colour does more work: the weight trend is green, maintenance is the kcal blue, and food rows carry the macro colours. Copy names what a number is, not where it came from.

**Rev 4.2, 2026-10-21 (Home as a dashboard).** The founder: MacroFactor's front page "looks much more finished", with bold colours in its graphs; the same effect, not a copy. Home's last 7 days became chart tiles, and each measure got its own strong colour, used wherever that measure is drawn.

Anchors: MacroFactor (Weight Trend, Expenditure, Strategy screens), WHOOP (contributor rows, the insight box), Apple Stocks (chart scrubbing, time-range pills).

Light and dark (rev 4). The app follows the phone's setting (`prefers-color-scheme`); Profile > Appearance can pin Light or Dark (`data-theme` on `<html>`, set before first paint). Dark suits the dim bedroom and gym lighting; light suits daytime. Both are the same palette, so every rule here holds in both.

## Colors

Restrained strategy: misty neutrals, one action colour (soft green), and colour for status and data. Every colour is a CSS variable in `app/globals.css` with a light and a dark value; components never hard-code a colour.

- **Page.** `--page` is a vertical gradient from `page-top` (misty sky) into `bg` over the first 380px; the sticky header sits on `page-top`.
- **Green and sky.** `green` is the soft green for data that is going well and for progress fills; `green-strong` for green text and links; `green-dim` for quiet fills. `sky` is the misty blue for sleep and secondary data; `sky-strong` for sky text.
- **Sleep.** `.theme-sleep` keeps Sleep in the family: a dawn (light) or dusk (dark) sky (`sleep-top`) at the top, `sky` for its own data (score ring, sleep window, bars), stage colours (awake peach, REM sky, core blue, deep lavender) in the stage chart and tiles only, and rating words in Excellent `sky-strong`, Good `status-good`, Fair `status-watch`, Poor `status-attention`.

- **Backgrounds.** `bg` is the page. `surface` is a row or card. `surface-raised` is a control (button, key, chip) sitting on a surface. `surface-pressed` is the pressed state. Never stack more than two levels; nested cards are wrong.
- **Borders.** Hairlines only (`border`, 1px). `border-strong` for focused controls. No coloured left or right edges on anything.
- **Text.** `text` for values and titles, `text-secondary` for supporting copy, `text-tertiary` for labels and metadata. Never pure white or pure black.
- **Primary action.** Soft green (`primary`, deep sage in light, pale sage in dark) with `text-on-primary`. One per screen at most (Start workout, Save, Finish). The same fill marks a selected pill, day or toggle.
- **Status.** `status-good` / `status-watch` / `status-attention` / `status-unknown`. Shown as a 8px dot or a short pill next to text, never as a card background. The same four colours drive the Signals tiles and the physique verdict.
- **Charts.** Trend line in `chart-trend` (green since rev 4.1; it was the text colour), 2px on the Body chart and 1.5px in Home's weight tile. Maintenance (the energy chart, its band and legend) uses `macro-kcal`. Raw weigh-ins as 4px dots in `chart-raw`. Goal projection as a dashed `chart-projection` line. A target band uses `chart-band`.
- **Metric colours** (rev 4.2). One hue per measure, 3:1 or more on `surface` in both modes: weight and waist trend `chart-trend` (green; waist uses `chart-steps`), calories `macro-kcal`, protein `macro-protein`, fibre `macro-carb`, training `chart-training` (orange, also Train's week bars), sleep and wake time `chart-sleep`, steps `chart-steps` (violet), resting heart rate `chart-heart`. Status colours stay for judgements (the words), metric colours for the data (the marks); never one for the other. The map lives in `components/physique/PulseTile.tsx` (`PULSE_COLOR`).
- **Macro colours** (rev 2, from MacroFactor): kcal `macro-kcal` (blue), protein `macro-protein` (red), fat `macro-fat` (yellow), carbs `macro-carb` (green), all muted. They appear only in nutrition bars, charts and food rows (rev 4.1: kcal in `text-secondary`, then "38P 14F 57C" with each letter in its macro colour, `components/food/MacroText.tsx`), never on buttons or status. Over target is not red: the bar simply fills and its target tick turns to the text colour.

## Typography

Geist only (already loaded as `--font-geist-sans`), one family for everything. Numbers always use `font-variant-numeric: tabular-nums`.

- `hero` (34px/600) is for the one number a screen is about (trend weight, target kcal on the energy card). At most one per screen.
- `title` (20px/600) for sheet titles and section numbers.
- `body` (15px/400) for verdict sentences and explanations. Line length under 70 characters.
- `number` (17px/600) for values in rows.
- `label` (12px/500) for row labels and chips; `caption` (11px/500, tracked) for small-caps metadata such as "28 DAYS · 24 WEIGH-INS". Uppercase only at caption size.
- Scale ratio is tight (about 1.2). Hierarchy comes from weight and colour, not size jumps.

## Elevation

Flat. Depth is expressed by surface level, not shadow.

- Page: `bg`.
- Rows and cards: `surface`, 1px `border` only when a row sits directly on `bg` without neighbours.
- Controls on rows: `surface-raised`.
- Sheets: `surface`, top corners `rounded.xl`, a 40px grey grabber, and a scrim of `#000` at 60% over the page. The sheet is the only element that uses a shadow (`0 -8px 32px rgba(0,0,0,0.5)`).
- Sticky headers and the tab bar: `bg` with a 1px top or bottom `border`.
- Motion: 150–250ms, `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out-quint). Sheets slide up over 240ms; value changes cross-fade over 150ms; nothing bounces and nothing loops.

## Components

- **Panel** (rev 4.1). `surface`, `rounded.lg`, holding one idea: the verdict with its flags, a chart with its numbers and range pills, a group of rows. Sections inside a panel are split by a 1px `border` hairline running edge to edge. Two panels that say one thing become one panel; a panel never sits inside another.
- **Row.** Label on the left in `text-secondary`, value on the right in `number`, optional trailing chevron or `+`. 56px tall, `surface`. Rows sit in a group (`rounded.lg`) separated by 1px `border` lines, not gaps.
- **Verdict panel** (rev 4.1; facts only since Z3). One panel: an 8px status dot and the 17px title, the `body` sentence, then the flags as hairline-split rows. The title says what happened ("260 kcal under target", "Losing faster than planned"), the sentence gives the numbers; no advice, no plan, no causes from studies, and no button that changes the plan (targets move in the weekly review). Safety notes are the exception.
- **Chart tile** (rev 4.2, Home's "Last 7 days"). Two to a row (an odd last tile spans the row), `surface`, `rounded.lg`: the measure's name (15px/600), its judgement in the status colour (12px), a 40px chart in the measure's colour, a hairline, then the number (17px/600) with its unit quieter and a chevron. Bars sit centred in seven day slots (58% of the slot, at most 14px, 3px top corners), a grey 3px stub for a day with nothing and a dashed target line; lines carry a hollow dot on each day, the last one filled, and the area under them fades from the colour at 28% to nothing (the only gradient on a card, because it encodes the data). The chart and the words come from the same two week reports (`lib/physique/pulseCharts.ts`), and a tile without enough data draws no chart.
- **Progress screen** (PR1). The analysis is the app's main part, so it has the middle tab. From the top: the This week card (an 11px caption, the verdict at 20px with its dot and sentence, up to two flags, the food targets and whether this week's check-in moved them, then the Weekly report row), the Over time panel, Findings, Connections, the goal panel (goal progress, date, waist) and the weigh-ins.
- **Over time panel** (PR1). One panel, range pills 1M 3M 6M All in its header. Six charts stacked on the same weeks (Monday to Sunday): Weight (daily trend line and scale dots), Calories (weekly bars in `macro-kcal` with the maintenance line in `text-secondary`), Protein (bars with the target dashed per week), Training (hard sets a week), Strength (the main lifts' best sets against their first week, a line with a dashed zero), Sleep (bars with a dashed 7 h). Each chart has a 13px name with a dot in its colour and the range's summary on the right (12px, `text-secondary`). Tapping or dragging anywhere across the stack picks one week: a `surface-raised` column runs through every chart, and the week's numbers sit under the charts in a two-column grid. The week in progress is drawn at reduced opacity and reads food through yesterday. Home's chart tiles open Progress at their chart (`/body#calories`).
- **Findings card** (E1, the weekly report, after the summary). "Findings · Last 4 weeks", then each finding as a row: a 15px title, the person's numbers in `text-secondary`, then what studies found in `text-tertiary` with the sources named in the sentence; full references sit under a closed "Sources". Silent when nothing crosses its evidence threshold. Data and evidence only, never an instruction.
- **Connections card** (L1, the weekly report). One panel: "Connections" with the sessions and weeks read, a line on how strength is read, then each clear difference as a row (the measure, the difference in the measure's colour, one factual sentence with both thirds' numbers, and two bars either side of the lift's own level), then "No clear difference" as compact rows (measure, the two values). Below the minimum it says how many sessions it needs. Never advice: the words say what moved together.
- **Contributor row** (WHOOP-style). Label, a 48px mini bar or sparkline in greys, value, and a small up or down tick in the status colour.
- **Segmented pills.** `pill` in a row with 4px gaps; the selected one is `primary` with `text-on-primary`. Used for time ranges (1W 1M 3M 6M 1Y All) and small choices.
- **Bottom sheet.** Title in `title`, content, one primary action at the bottom. Dismiss by swipe or the scrim. Safe-area padding at the bottom.
- **Number pad.** 3×4 grid of `numberpad-key`, with `.` and backspace, and an optional ±step row above. The current value sits above in `hero`. Never show the system keyboard for numeric entry.
- **Chart.** Time-based x axis with sparse date labels in `caption`, y axis from `computeNiceYAxis`, raw dots, continuous trend line between the first and last real values, optional dashed projection. Tap or drag to scrub; the scrubbed point shows a small `surface-raised` tooltip with date, scale weight and trend.
- **Status dot and pill.** 8px dot inline with text, or a 22px pill (`caption`, status colour text on `surface`).
- **Tab bar.** Five tabs: Home, Food, Progress, Sleep, Train (rev 2; Progress replaced Body in PR1 and keeps the `/body` route). 20px line icons, `caption` labels, active in `text`. `tab-bg` background with a 1px top border. Profile is a round button in the Home header.
- **Page header** (rev 2). An 11px tracked caption (date or goal) above the page title in `hero` size, title case. The tab's primary log action is a 36px `primary` round `+` on the right. Sticky on `page-bg` (the top of the misty page).
- **Week strip** (rev 2). Seven day pills (weekday letter over day number, 40×56), a 4px dot under logged days, the selected day filled `primary` with dark text. Swiping the strip moves a week.
- **Widget carousel** (rev 2). Horizontal scroll-snap cards the width of the screen minus the gutters, with page dots (6px, `text-tertiary`, active `text`). Two or three cards, never more.
- **Timeline** (rev 4.1). Only hours with food show. Each hour has a header line (the hour in 13px semibold, its kcal and coloured macros, a 28px `+` on the right) above one panel of its entries, split by hairlines. An entry shows the name, coloured macros with the serving (and "est." for a described meal), and kcal in `number` with the time beneath on the right. Tap to edit.
- **Search field** (rev 4.1). A 48px pill with a magnifier, "Search foods", and a "Scan" pill beside it. Results, go-tos and latest foods are grouped panels with a round `primary` `+` per row.
- **Reading pages** (rev 4.1). Privacy and Support use `components/ui/DocPage.tsx`: a back link, a caption with the date, the title in `hero`, then titled sections of `body` text. No tab bar.
- **Contributor list** (rev 2, from Bevel). Rows of label · word (Poor / Fair / Good / Excellent in the status colour) · a 4px bar in `surface-raised` filled in `text-secondary`.
- **Sleep score** (rev 3, kept in rev 4). One number out of 100 in a ring on the Sleep tab: hours slept against what the night needed, with points off for waking off the usual time and for a restless night (`lib/physique/sleepScore.ts`). Always shown with its word and one sentence on why; the parts are on the night page. It is the only score in the app.
- **Range pills.** 1W 1M 3M 6M All as segmented pills under charts; selected is `primary`.
- **Empty and calibrating states.** A sentence in `text-secondary` naming exactly what is missing ("6 more weigh-ins for a first read"), with the control that fixes it directly beneath. Never a placeholder number or an illustration.
- **Buttons.** `button-primary` (soft green) for the one main action; `button-secondary` (raised grey) for everything else; text-only links in `text-secondary` for tertiary actions. 44px minimum tap targets.

## Do's and Don'ts

- Do lead with what happened, then the two strongest numbers. Say what the data shows, never what to do about it (Z3); the only instructions are safety notes and how to use the app.
- Do stay silent when things are fine: an "On track" line with no advice is the finished state.
- Do state the window and n next to any judgement.
- Do keep logging to three taps or fewer, with values prefilled from yesterday.
- Do use the four status colours identically everywhere (Signals tiles, verdict dot, home card).
- Don't use the status colours on buttons, borders, backgrounds or glows. Green as an action is `primary`; `status-good` means good, nothing else.
- Don't put a number in a ring or dial, except the sleep score (rev 3). Elsewhere states are words; detail views have numbers.
- Don't add blurred glass, side stripes or hero-metric tiles. The only gradients are the misty page (and Sleep's sky) and the fade under a chart line (rev 4.2); never as decoration on a card.
- Don't show confetti, streaks, exclamation marks, or praise.
- Don't show a score for recovery; show a word and the numbers. Sleep has one score (rev 3), never without its word and reason.
- Don't list missed days on a tab that a device fills on its own: a night the watch missed is an empty bar, not a "not logged" row.
- Don't interpolate the trend line past the last real weigh-in, and don't draw dots on days with no data.
