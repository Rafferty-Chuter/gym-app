---
name: Gym AI
description: A calm, precise physique and training coach for serious natural lifters. Dark layers, white actions, and a colour of its own for each tab (Sleep is indigo first).
colors:
  bg: "#0a0a0b"
  surface: "#141416"
  surface-raised: "#1d1d20"
  surface-pressed: "#26262a"
  border: "#2a2a2e"
  border-strong: "#3a3a40"
  text: "#f2f2f0"
  text-secondary: "#a3a3a8"
  text-tertiary: "#6f6f76"
  text-on-primary: "#0a0a0b"
  primary: "#f2f2f0"
  accent: "#00e5b0"
  accent-dim: "#0c2a24"
  status-good: "#00e5b0"
  status-watch: "#f5b544"
  status-attention: "#f26d7d"
  status-unknown: "#6f6f76"
  chart-trend: "#f2f2f0"
  chart-raw: "#55555c"
  chart-projection: "#6f6f76"
  chart-band: "#1d1d20"
  macro-kcal: "#7aa2ff"
  macro-protein: "#e8736f"
  macro-fat: "#f0c36a"
  macro-carb: "#6fcf9f"
  sleep-bg-top: "#1c2044"
  sleep-bg: "#0c0d1a"
  sleep-surface: "#171a35"
  sleep-surface-raised: "#23274d"
  sleep-border: "#2b305c"
  sleep-text: "#eef0ff"
  sleep-text-secondary: "#a9addb"
  sleep-text-tertiary: "#7378a8"
  sleep-accent: "#9ea6ff"
  sleep-accent-dim: "#3a3f80"
  sleep-stage-awake: "#f6a26b"
  sleep-stage-rem: "#7fd3fb"
  sleep-stage-core: "#6d8bff"
  sleep-stage-deep: "#a98bfa"
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

Direction, decided 2026-10-16 with the founder: **MacroFactor-style**. Near-black with a faint warm tint, grey surface layers, white primary actions, and colour reserved for status and data. Mint (`accent`) is the single brand accent and now means exactly two things: *good* and *selected*. Amber and rose appear only for watch and attention states.

**Rev 3, decided 2026-10-18 with the founder: pillar colour.** Black and white read as bland next to WHOOP and Bevel, so each tab now owns a hue and wears it: its page background, its surfaces and its own data. Sleep goes first (indigo night, periwinkle accent, see Colors); Food, Body and Train follow the same pattern. Home stays neutral because it gathers every tab. White primary actions, the four status colours and the macro colours keep their meanings everywhere.

Anchors: MacroFactor (Weight Trend, Expenditure, Strategy screens), WHOOP (contributor rows, the insight box), Apple Stocks (chart scrubbing, time-range pills).

Theme is dark only. The scene (dim bedroom, gym lighting, phone at arm's length) forces it; a light mode is not planned.

## Colors

Restrained strategy on neutral screens (Home, sheets, settings): tinted neutrals and one accent used on well under 10% of the screen. Committed strategy on a pillar tab (rev 3): the tab's hue carries the page.

- **Pillar colour (rev 3).** A tab's palette lives in one class in `app/globals.css` (`.theme-sleep` and its `--sl-*` variables; later `.theme-food`, `.theme-body`, `.theme-train`). The class sets the page background (a vertical gradient from `*-bg-top` into `*-bg`), `--page-bg` for the sticky header, and the tab's surfaces, text tones and accent. Components on that tab read the variables, never hex. Rules: the accent marks the tab's own data (the score ring, the sleep window, bars), never buttons; a selected or latest item is the full accent, the rest `*-accent-dim`; rating words use the rating colours below; sheets stay neutral.
- **Sleep (first pillar).** Indigo night, `sleep-*` tokens above. Stage colours: awake orange, REM sky, core blue, deep violet, used in the stage chart and tiles only. Rating words: Excellent periwinkle, Good mint, Fair amber, Poor rose.

- **Backgrounds.** `bg` is the page. `surface` is a row or card. `surface-raised` is a control (button, key, chip) sitting on a surface. `surface-pressed` is the pressed state. Never stack more than two levels; nested cards are wrong.
- **Borders.** Hairlines only (`border`, 1px). `border-strong` for focused controls. No coloured left or right edges on anything.
- **Text.** `text` for values and titles, `text-secondary` for supporting copy, `text-tertiary` for labels and metadata. Never pure white.
- **Primary action.** White (`primary`) with dark text, as in MacroFactor's "Log Foods" and "Check In". One per screen at most. Start Workout on Home is white.
- **Accent (mint).** Status *good*, the selected tab or pill, and the trend-up tint in charts. Not on buttons, not on borders, not as a wash.
- **Status.** `status-good` / `status-watch` / `status-attention` / `status-unknown`. Shown as a 8px dot or a short pill next to text, never as a card background. The same four colours drive the Signals tiles and the physique verdict.
- **Charts.** Trend line in `chart-trend` (white, 2px). Raw weigh-ins as 4px dots in `chart-raw`. Goal projection as a dashed `chart-projection` line. A target band uses `chart-band`.
- **Macro colours** (rev 2, from MacroFactor): kcal `macro-kcal` (blue), protein `macro-protein` (red), fat `macro-fat` (yellow), carbs `macro-carb` (green), all muted. They appear only in nutrition bars and charts, never on buttons or status. Over target is not red: the bar simply fills and its target tick turns white.

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

- **Row.** Label on the left in `text-secondary`, value on the right in `number`, optional trailing chevron or `+`. 56px tall, `rounded.md`, `surface`. Rows in a group are separated by 1px `border` lines, not gaps.
- **Verdict line.** Not a card. An 8px status dot, a `body` sentence in `text`, then a `caption` line with the window and n in `text-tertiary`. Flags are plain rows beneath. A recommendation is a row with a white "Apply" or "Update targets" secondary button.
- **Contributor row** (WHOOP-style). Label, a 48px mini bar or sparkline in greys, value, and a small up or down tick in the status colour.
- **Segmented pills.** `pill` in a row with 4px gaps; the selected one is white with dark text. Used for time ranges (1W 1M 3M 6M 1Y All) and small choices.
- **Bottom sheet.** Title in `title`, content, one primary action at the bottom. Dismiss by swipe or the scrim. Safe-area padding at the bottom.
- **Number pad.** 3×4 grid of `numberpad-key`, with `.` and backspace, and an optional ±step row above. The current value sits above in `hero`. Never show the system keyboard for numeric entry.
- **Chart.** Time-based x axis with sparse date labels in `caption`, y axis from `computeNiceYAxis`, raw dots, continuous trend line between the first and last real values, optional dashed projection. Tap or drag to scrub; the scrubbed point shows a small `surface-raised` tooltip with date, scale weight and trend.
- **Status dot and pill.** 8px dot inline with text, or a 22px pill (`caption`, status colour text on `surface`).
- **Tab bar.** Five tabs: Home, Food, Body, Sleep, Train (rev 2). 20px line icons, `caption` labels, active in `text` (not mint). `bg` background with a 1px top border. Profile is a round button in the Home header.
- **Page header** (rev 2). An 11px tracked caption (date or goal) above the page title in `hero` size, title case. The tab's primary log action is a 36px white round `+` on the right. Sticky, `bg`, hairline when scrolled.
- **Week strip** (rev 2). Seven day pills (weekday letter over day number, 40×56), a 4px dot under logged days, the selected day filled `primary` with dark text. Swiping the strip moves a week.
- **Widget carousel** (rev 2). Horizontal scroll-snap cards the width of the screen minus the gutters, with page dots (6px, `text-tertiary`, active `text`). Two or three cards, never more.
- **Timeline** (rev 2). A 1px vertical `border` line with hour chips (`surface-raised`, `caption`) and a 24px `+` beside each hour; entries are `surface` rows with name, `number`-sized kcal, macro caption and an edit glyph; hour totals sit on the hour row in `caption`.
- **Contributor list** (rev 2, from Bevel). Rows of label · word (Poor / Fair / Good / Excellent in the status colour) · a 4px bar in `surface-raised` filled in `text-secondary`.
- **Sleep score** (rev 3). One number out of 100 in a ring on the Sleep tab: hours slept against what the night needed, with points off for waking off the usual time and for a restless night (`lib/physique/sleepScore.ts`). Always shown with its word and one sentence on why; the parts are on the night page. It is the only score in the app.
- **Range pills.** 1W 1M 3M 6M All as segmented pills under charts; selected is white.
- **Empty and calibrating states.** A sentence in `text-secondary` naming exactly what is missing ("6 more weigh-ins for a first read"), with the control that fixes it directly beneath. Never a placeholder number or an illustration.
- **Buttons.** `button-primary` (white) for the one main action; `button-secondary` (raised grey) for everything else; text-only links in `text-secondary` for tertiary actions. 44px minimum tap targets.

## Do's and Don'ts

- Do lead with the verdict, then the two strongest numbers, then one action.
- Do stay silent when things are fine: an "On track" line with no advice is the finished state.
- Do state the window and n next to any judgement.
- Do keep logging to three taps or fewer, with values prefilled from yesterday.
- Do use the four status colours identically everywhere (Signals tiles, verdict dot, home card).
- Don't use mint on buttons, borders, backgrounds or glows. Mint means good or selected, nothing else.
- Don't put a number in a ring or dial, except the sleep score (rev 3). Elsewhere states are words; detail views have numbers.
- Don't add blurred glass, side stripes or hero-metric tiles. Gradients and tinted surfaces belong to a pillar tab's palette only (rev 3), never as decoration on a neutral screen.
- Don't show confetti, streaks, exclamation marks, or praise.
- Don't show a score for recovery; show a word and the numbers. Sleep has one score (rev 3), never without its word and reason.
- Don't list missed days on a tab that a device fills on its own: a night the watch missed is an empty bar, not a "not logged" row.
- Don't interpolate the trend line past the last real weigh-in, and don't draw dots on days with no data.
