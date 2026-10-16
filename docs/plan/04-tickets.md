# 04 — Tickets

How to work a ticket: see "Session protocol" in `README.md`, or run the `/next-ticket` skill. Track progress in `STATUS.md`.

**Ticket format.** Milestone · size (see size key below) · depends on · skills to load · read first · what to do · acceptance criteria · verification.

**★ = morning critical path.** Do these in this order:

`F1 → F3 → P1 → P2 → U1 → U2a → I1 → P3 → U3 → P4 → P5 → U2b → I2 → V1`

**Why logging comes before the judge.** The judge can't say anything until there are about 14–21 days of weight and food data (02 §2.2, §4.3). So the first goal is to make **logging live** (weight, food, sleep, with the trend chart) so data starts building up from day one. If the overnight run stops early, you can still start logging in the morning, and the judge lands next. It will have data by the time it's allowed to speak.

**Size key:** S ≈ 15–30 min, M ≈ 30–90 min, L ≈ 1.5–3 h of agent time. The full ★ path is roughly 10–14 hours of agent time. Everything else in M1 follows.

---

## M0 — Your setup (human, about 15 minutes)

### H1 · Back up and protect your data
1. On your iPhone, open the deployed app in Safari → Profile → Data tools → **Export**. Save the JSON to Files.
2. Safari → Share → **Add to Home Screen**, and open the app from that icon from now on. Safari deletes a site's storage after 7 days without a visit; Home Screen apps are exempt.
3. Repeat the export weekly until M3 moves data to Supabase.

### H2 · Prepare the sessions
1. Merge this plan into your main branch, so every new session sees `CLAUDE.md` and `docs/plan/`. Or start sessions on this branch.
2. In the Claude Code cloud environment settings, check that `ANTHROPIC_API_KEY` is available if you want sessions to run `npm run eval`. It's optional; evals cost money.
3. Start sessions with the Fable model. Paste the kickoff prompt from `README.md`.

---

## M1 — Body layer MVP

### ★ F1 · Tooling: tests, one check command, lint baseline, session hook
M1 · S · depends on: — · skills: `session-start-hook`
Read first: `research/E-codebase-audit.md` §5.1, §5.4.

Do:
1. `npm i -D vitest`. Add `vitest.config.ts` with the `@/` alias, and scripts `test`, `typecheck` (`tsc --noEmit`) and `check` (`npm run typecheck && npm run lint && npm test`).
2. Port `scripts/test-volume-rules.ts` to `lib/__tests__/volumeRules.test.ts`.
3. In `eslint.config.mjs`, add `.agents/**` to `globalIgnores`. Run `npx eslint --suppress-all` to freeze the existing violations into `eslint-suppressions.json`. New violations still fail.
4. Use the `session-start-hook` skill to add a SessionStart hook that runs `npm ci` when `node_modules` is missing, so cloud sessions can run tests.
5. Add `.env.example` listing `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`.
6. Vendor the web skills from `06-tooling.md` §2 (`npx skills add vercel-labs/agent-skills --skill react-best-practices --skill web-design-guidelines -a claude-code -y`, with `DISABLE_TELEMETRY=1`) and commit `.claude/skills/*` and `skills-lock.json`. If the network blocks it, note that in STATUS and continue.
7. Unless README decision D4 says otherwise, apply `01-product-spec.md` §5 to `PRODUCT.md`.

Acceptance:
- [ ] `npm run check` exits 0 on a clean checkout.
- [ ] Introducing a new lint error makes `npm run lint` fail.
- [ ] The volume-rules tests pass under vitest.

### F2 · Fix the bugs that corrupt data
M1 · M · depends on: F1
Read first: `research/E-codebase-audit.md` §5.7; `research/B-training-apps.md` HV-11.

Do (one test per fix):
1. History edit drops `rir` and `exerciseId` (`app/history/page.tsx:36-41, 145-150`). Preserve every set field through edit and save.
2. Hevy CSV with `weight_lbs` imports blank weights (`lib/csvImport.ts` `parseHevy`). Accept `weight_kg` or `weight_lbs` and convert to the user's unit. Map `set_type` failure → RIR 0 and dropset → merge into the previous set. Read `superset_id` (store it if present).
3. `addWorkout` doesn't dispatch `workoutHistoryChanged` (`lib/workout-store.tsx:106-114`).
4. The non-streaming JSON path leaks `<datasources>` (`route.ts:4139-4140`). Strip it the same way the stream path does.
5. The backup allowlist misses `assistantMemory`, `restTimerNotifySettings` and `volumeEnabledOptionalGroups`, and wrongly lists sessionStorage keys (`lib/devDataTransfer.ts:5-24`).
6. Conditional hooks in `components/LiftProgressionSection.tsx:180/225-226`.

Acceptance:
- [ ] Each fix has a test (or, for UI-only fixes, a short manual check recorded in STATUS).
- [ ] `npm run check` passes.

### ★ F3 · Foundations: stats, dates, units, storage seam, models, API guard
M1 · M · depends on: F1
Read first: `03-architecture.md` §2; `research/E-codebase-audit.md` §7.2–7.3.

Do:
1. **`lib/stats.ts`:** `mean`, `median`, `stdev`, `winsorize`, `ewma`, and `olsSlope(xs, ys)` returning `{slope, intercept, se, n}`. Move the private `leastSquaresSlope` out of `lib/liftTrend.ts` and re-export it, keeping liftTrend's behaviour identical.
2. **`lib/dates.ts`:** `localDateKey(date, tz?)`, `addDays`, `dayDiff`, `dateRange`, `weekday`. All take explicit dates (no implicit now).
3. **`lib/units.ts`:** a single `KG_PER_LB = 0.45359237`; `kgToDisplay`, `displayToKg`, `formatWeight(kg, unit)`, `formatKcal`. Don't migrate existing callers yet (M2/F7).
4. **`lib/storage/`:** build `keys.ts`, `kv.ts`, `useStored.ts` and `repo.ts` per `03-architecture.md` §2.
   - `createRepo<T extends {id: string}>(key)` exposes async `list`, `get`, `upsert`, `remove`, `bulkUpsert` and `subscribe`, plus a sync `snapshot()` for `useSyncExternalStore`.
   - Make `lib/devDataTransfer.ts` derive its allowlist from `keys.ts` (registered keys flagged `includeInBackup`).
5. **`lib/ai/models.ts`:** `ASSISTANT_MODEL = "claude-sonnet-4-6"` (unchanged for now) and `FOOD_PARSE_MODEL = "claude-opus-5-5"`. Point the 4 hard-coded sites at it.
6. **`lib/api/guard.ts`:** `withPaidRoute({schema, maxBytes, subCall}, handler)`. It:
   - parses and validates the body with zod (add `zod` as a direct dependency);
   - **then** checks the daily cap;
   - requires `client_id`;
   - wraps cost logging;
   - returns generic errors.

   New routes use it. Existing routes migrate in F8.

Acceptance:
- [ ] Every function above has unit tests. `olsSlope` matches a hand-computed example, and its SE matches a reference (e.g. numpy or a worked example).
- [ ] `liftTrend` tests (add 3 characterisation cases) still pass after the move.
- [ ] The backup export includes every registered `includeInBackup` key.

### ★ P1 · Physique types and repositories
M1 · S · depends on: F3
Read first: `02-engine-spec.md` §1, §5.1, §8.1; `03-architecture.md` §3.1.

Do:
1. `lib/physique/types.ts` with every entity, `PhysiqueAnalysis`, `Verdict`, `Recommendation` and `RuleId` (a union of every rule id in 02 §7.3 and §8).
2. `lib/physique/repos.ts`: one repo per key in 03 §3.1, all registered in `keys.ts` with `includeInBackup: true`.
3. `lib/physique/profile.ts`: `getPhysiqueProfile()` reads `OnboardingProfile` (sex, age → birthYear, heightCm, units) and merges the physique-only fields. Defaults: `generalActivity` moderate, `proteinLevel` moderate, `dietType` balanced, `calorieFloor` standard, `checkInWeekday` 1 (Monday), `expenditureStartDate` = first weigh-in or food day.

Acceptance:
- [ ] Repo round-trip tests: upsert, list by date range, remove, subscribe fires.
- [ ] A backup export followed by an import restores physique data.

### ★ P2 · Weight engine and synthetic fixtures
M1 · M · depends on: P1
Read first: `02-engine-spec.md` §2; `research/F-evidence-rules.md` §5; `research/A-macrofactor-nutrition.md` §G.3 and §G.6.

Do:
1. `lib/physique/fixtures.ts` (a normal module, so both tests and the dev seed page can import it): a seeded PRNG plus `makeScenario({days, startKg, ratePctPerWeek, noiseSdKg: 0.5, phi: 0.5, weighInDays: "daily" | "4x" | "sparse", intakeKcal, intakeSd: 350, sleepH, sleepSd, lifts: [{name, startE1rm, slopePctPerWeek, perWeek}], events})`. It returns `{weighIns, foodDays, sleepNights, workouts}` in repo shapes.
2. `lib/physique/weight.ts`: `interpolateDaily`, `trendSeries` (EMA α 0.10), `rateOverWindow(weighIns, endDate, days)` → `{ratePctPerWeek, se, seAdj, n, windowDays}`, `pickRateWindow` (02 §2.2), `isConfidentlyAbove/Below`, `phaseMaskActive`, `sanityCheck(newKg, trendKg)`.

Acceptance:
- [ ] On a −0.6 %/wk scenario with daily weigh-ins over 21 days, the estimated rate is within ±0.3 of the truth in ≥95% of 200 seeds.
- [ ] The rate is null below 14 days or 5 weigh-ins.
- [ ] The EMA impulse test is reproduced (it feeds the P3 impulse test).

### ★ P3 · Intake, expenditure and targets
M1 · L · depends on: P2
Read first: `02-engine-spec.md` §3–5; `research/A-macrofactor-nutrition.md` §A1–A4, §B2–B6, §G.

Do:
1. `intake.ts`: day status, partial suggestion, intake means, `loggedShare`, adherence, protein and fat g/kg.
2. `expenditure.ts`: `initialTdee` (equations, activity, sessions per week inferred from `StoredWorkout[]` over the last 4 weeks, goal correction) and `expenditureSeries` (02 §4.1 pipeline, holding/updating, predictive goal adjustment, maturity state).
3. `targets.ts`: rate bands and `trainingStatus` (02 §5.2), `weeklyTarget` (§5.3), `macros` (§5.4), floors.

Acceptance:
- [ ] Every golden test in 02 §4.2 passes exactly (±1 kcal rounding).
- [ ] Impulse test: within 15 kcal of research A §G.6 at each of the 6 points.
- [ ] Stability: mean absolute daily change after day 30 ≤ 8 kcal on noisy fixtures.
- [ ] Holding: 3 of 7 days logged → holding; resumes after 3 consecutive complete days.
- [ ] Partial day: the suggestion fires at 0.49× median and not at 0.51×.

### ★ P4 · Strength and sleep modules
M1 · M · depends on: P2
Read first: `02-engine-spec.md` §6, §7.1–7.3; `research/C-sleep-recovery.md` §5–6; `research/F-evidence-rules.md` §6–7.

Do:
1. `strength.ts`: `e1rmAdj(set)` (skips warm-ups once T1 exists; until then treats every set as working), `bestSessionE1rm`, `pickMainLifts(workouts, now)` (compound check via `lib/exerciseMetadataLibrary.ts` role/pattern, falling back to a name list), `liftChangeVsPhaseStart`, `strengthStatus` → `dropping | holding | rising | one-lift | unclear`, with the session exclusions (short sleep, deloads, rep-range change).
   - Workout weights are strings in the display unit. Parse them through `lib/units.ts` to kg first.
2. `sleep.ts`: night normalisation (manual only in M1; the HealthKit shape is stubbed for M3), `sleepStatus` (wearable vs manual thresholds), `debt7`, and the inputs for SLEEP-1/1i/2/3/OK.

Acceptance:
- [ ] Fixture tests cover: two lifts −6% → `dropping`; one lift −8% → `one-lift`; a drop inside cut days 0–13 → suppressed; a session after a 4.5 h night is excluded.
- [ ] Sleep tests cover: manual 6.8 h → `short`; wearable 6.8 h → `ok`; 9 of 14 nights logged → `unknown`.

### ★ P5 · The judge, status and check-in plan
M1 · L · depends on: P3, P4
Read first: `02-engine-spec.md` §8–10; `research/F-evidence-rules.md` "Judge rules table" and "Must NOT claim".

Do:
1. `judge.ts`: `buildPhysiqueAnalysis({goal, profile, weighIns, foodDays, dayFlags, sleepNights, workouts, waist, program}, {now})`. Implement every rule in 02 §7.3 and §8.2, the primary-verdict ordering in §8.3, and recommendations as rate changes (amendment 1). Each verdict carries `evidenceIds`.
2. `status.ts`: the home-tile `{state, status}` (02 §8.3 mapping).
3. `checkIn.ts`: `buildCheckInPlan` (02 §9) and `applyCheckInAnswers` (returns `DayFlags` updates plus the accepted program).
4. `evidence.ts`: an id → citation map built from research F's reference list.
5. A copy linter test: verdict titles and details must not contain any banned phrase from 02 §10.

Acceptance:
- [ ] Every rule has fire / near-miss / suppressed fixtures (02 §8.4).
- [ ] End-to-end scenarios produce the expected primary verdict:

  | Scenario | Expected primary verdict |
  |---|---|
  | Cut on track | ON-TRACK (good) |
  | Cut at −1.4 %/wk while eating to target, 2 lifts −6%, 28 days | LOSS-1 → change_rate to −0.75 |
  | Cut on target, manual sleep 6.4 h over 14 nights, 2 lifts −3% | SLEEP-1 (blocks rate increases) |
  | Eating 400 under target | ADH-1 |
  | Lean bulk intermediate at +0.75 %/wk over 35 days, eating to target | GAIN-1 |
  | 10 days of data | DATA (unknown) |
  | Goal implies BMI < 18.5 | SAFE-4 |

- [ ] The copy linter passes.

### ★ U1 · UI primitives
M1 · M · depends on: F1 · skills: `impeccable`, `dataviz`
Read first: `05-design.md` §1–2; `research/E-codebase-audit.md` §4.

Do:
1. Extract `STATE_COLOR`, the status icons and `useIsHydrated` from `app/page.tsx` and `app/signal/[key]/page.tsx` into `lib/ui/status.ts` and `lib/ui/useIsHydrated.ts`. Both pages import them. No visual change.
2. `components/charts/TimeSeriesChart.tsx`:
   - time-based x axis;
   - raw points (dots) and a smoothed line;
   - an optional target band or line;
   - gaps where data is missing;
   - tap a point for a tooltip;
   - y axis via `lib/chartScale.ts`;
   - works at 390 px wide;
   - follows the `dataviz` skill's mark and colour rules within this app's palette.
3. `components/ui/Sheet.tsx`: a bottom sheet with focus trap, swipe or tap to close, and safe-area padding.
4. `components/ui/NumberPad.tsx`: digits, decimal and backspace, with an optional ±step row.

Acceptance:
- [ ] The home and signal pages look identical before and after (screenshots).
- [ ] The chart renders a seeded 8-week weight series at 390 px and 768 px (screenshots saved).

### ★ U3 · Goal setup
M1 · M · depends on: P3, U1 · skills: `impeccable`
Read first: `05-design.md` §4; `02-engine-spec.md` §5; `research/A-macrofactor-nutrition.md` §B2, §B10.

Do: build `/body/goal` as a 3-step flow.
1. **Target weight.** Prefilled with the current trend. Direction (lose / maintain / gain) is derived and shown.
2. **Rate.** A slider with the colour bands from 02 §5.2 for the user's training status (derived, editable). It shows, live: the weekly change in kg, the projected ETA date (honest, e.g. "about 32 weeks"), and the starting daily kcal and protein.
3. **Confirm.** A summary and "Start today" (sets `phaseStartConfirmedAt`). Then a safety screen: "Are you pregnant, or have you had an eating disorder?" → yes routes to maintenance plus a professional referral (SAFE-5).

Out-of-band rates need an explicit confirmation; SAFE rates are refused with an explanation.

Acceptance:
- [ ] The 82 → 90 kg intermediate example shows the default rate 0.325 %/wk and an ETA of ~28–30 weeks (ln(90/82) / ln(1.00325) ≈ 28.7).
- [ ] A rate above 1.5 %/wk can't be saved.
- [ ] The goal is stored and its history kept.

### ★ U2a · The Body page: logging and the trend chart
M1 · L · depends on: P2, U1 · skills: `impeccable`, `dataviz`, `run`
Read first: `05-design.md` §3; `01-product-spec.md` §2.

This makes logging live before the judge exists. Build `/body` with:
1. **A date switcher** (‹ date ›) at the top. Every logging control acts on the selected day, for backfilling.
2. **Today strip:**
   - **Weight:** tap opens a NumberPad sheet, prefilled with the last value; the sanity check (P2) runs on save.
   - **Food:** shows the day's kcal and P/C/F totals (thin bars once targets exist after P3). Tap opens a **quick-add sheet**: optional label, kcal, P, C, F via the NumberPad, and a "recent" row listing the last 8 distinct entries for one-tap re-log. U4 later replaces this with the full day log.
   - **Sleep:** tap opens a sheet with bedtime and wake prefilled from the 7-day median (or 23:00/07:00), an "hours asleep" stepper prefilled as time in bed − 20 min, and 0 / 1–2 / 3+ wake-ups.
3. **Weight chart:** `TimeSeriesChart` with raw dots and the trend line, and the caption "Trend 84.2 kg · −0.6 %/wk (21 d)". With too little data the caption reads "Early read · 6 more weigh-ins for a rate".
4. A **placeholder verdict area** that says "Calibrating" plus what's missing. U2b fills it in.
5. **`app/dev/seed-physique/page.tsx`** (dev only: `notFound()` when `NODE_ENV === "production"`, so it can never overwrite real data on the deployed app). It runs **a backup export first**, then writes 3 weeks of fixture weigh-ins, food and sleep through the repos, using the P2 generator. It also has a "Clear physique data" button. V1 adds more scenarios.

Acceptance:
- [ ] Logging a weigh-in takes ≤3 taps from `/body`, sleep ≤4, and a recent food ≤2.
- [ ] Data persists through a reload and appears in a backup export.
- [ ] Screenshots at 390 px: empty state, and 3 weeks of seeded weigh-ins.

### ★ U2b · The Body page: verdict, energy, strength and sleep
M1 · M · depends on: P5, U2a, U3 · skills: `impeccable`, `run`
Read first: `05-design.md` §3, §7.

Add to `/body`, reading everything from `buildPhysiqueAnalysis` (the page computes nothing itself):
1. **Header:** goal summary ("→ 90.0 kg · lean gain · +0.33 %/wk") with a progress bar on trend weight. Without a goal, show a "Set your goal" prompt linking to `/body/goal`.
2. **Verdict card:**
   - the primary verdict (status colour, title, one line);
   - up to 3 flag rows;
   - the recommendation, with **Apply** for `change_rate` (it updates the goal; targets change at the next check-in, or "Apply now" starts a new program);
   - **Ask why**, which opens the assistant with a prefilled prompt.
3. **Energy card:** expenditure with its maturity state (02 §4.3), today's targets, and 14-day adherence.
4. **Strength and sleep rows:** main lifts' change since the phase started, and the 14-night sleep mean and status.
5. **Food bars** in the today strip now show targets.
6. **Home insight priority** (`app/page.tsx`): if the physique `status.state` is `watch` or `attention`, the assistant insight card shows the physique verdict and its follow-up chips (Why? / What do I change? / Show the data) instead of the training key focus.

Acceptance:
- [ ] Cold start shows honest states ("Calibrating · 6 more weigh-ins"), never a fake number.
- [ ] Screenshots at 390 px for cold start, the seeded on-track cut and the seeded LOSS-1 scenario.

### U4 · Food day log
M1 · M · depends on: U2a · skills: `impeccable`
Read first: `research/A-macrofactor-nutrition.md` §D1–D8; `05-design.md` §5.

Do: build `/body/food?date=`:
- a timeline list (time, label, kcal, P/C/F) with swipe or tap to delete or edit;
- **quick add** (label optional; kcal, P, C, F via the NumberPad);
- **saved foods and recents:** one tap re-logs with the last serving, and any entry can be "Save as food";
- **copy yesterday**;
- **Edit Day** total override;
- day flags: "Mark as fasting" and "This day is incomplete".

Acceptance:
- [ ] Re-logging a recent food takes ≤2 taps.
- [ ] Day totals update the Body page live.
- [ ] Flags change expenditure inputs (verified by a test through the engine).

### A1 · "Describe it": AI food estimate
M1 · M · depends on: F3, U4 · skills: `claude-api`
Read first: `03-architecture.md` §5; `research/D-architecture-tooling.md` §4.2.

Do:
1. Build `app/api/food/parse/route.ts` with `withPaidRoute`. Input: `{text ≤ 500 chars, client_id}`.
2. Call `client.messages.parse` with a zod output schema (03 §5), the `FOOD_PARSE_MODEL`, effort `low`, and server-side fallbacks. Handle refusals. The system prompt says:
   - estimate grams and macros per item using standard UK composition values;
   - state assumptions;
   - give confidence;
   - never invent brands.
3. In the UI, add a "Describe it" text field in the food sheet → editable rows marked "estimate" → "Log all" or "Save as food".

Acceptance:
- [ ] Zod rejects malformed input.
- [ ] A missing `client_id` → 400.
- [ ] Cost is logged.
- [ ] A recorded fixture test (mocked SDK) covers the happy path and a refusal.
- [ ] Manual test: "200g chicken breast and 150g cooked rice" gives 400–560 kcal and 50–70 g protein, and the assumptions say whether the chicken was taken as raw or cooked.

### U5 · Weekly check-in
M1 · M · depends on: P5, U2b · skills: `impeccable`
Read first: `02-engine-spec.md` §9; `research/A-macrofactor-nutrition.md` §B8.

Do: build `/body/check-in`:
- a stepper that renders `CheckInPlan` modules;
- answers are applied through `applyCheckInAnswers`;
- the program update shows old → new targets with **Accept** and **Keep current**;
- a "Fast check-in" button.

The Body header shows "Check-in ready" on or after the check-in weekday until it's done.

Acceptance:
- [ ] Scenario tests: the partial-day module appears when expected, and confirming a day as partial changes the proposed target.
- [ ] Declining keeps the targets.

### ★ I1 · Navigation and home
M1 · S · depends on: U2a · skills: `impeccable`
Read first: `05-design.md` §6; `PRODUCT.md`.

Do:
1. Add a **Body** tab to `components/BottomTabs.tsx` (5 tabs: Home, Body, Templates, History, Profile), with a simple scale or body icon.
2. In `app/page.tsx`, add a compact **Physique** card below the Signals row with 3 mini stats: trend weight (and rate once available), kcal logged today (vs target once P3 exists), and last night's sleep. When `buildPhysiqueAnalysis` exists (P5), the card also shows the status colour and verdict title. Guard it so the card works before P5 lands. Tap → `/body`.

Start Workout stays the dominant element. (The home insight-card priority is done in U2b.)

Acceptance:
- [ ] The home layout order is unchanged except for the new card.
- [ ] A screenshot at 390 px with no data and with seeded data.

### ★ I2 · Assistant integration
M1 · L · depends on: P5 · skills: `claude-api`
Read first: `03-architecture.md` §4.1; `research/E-codebase-audit.md` §2.

Do: all of 03 §4.1 steps 1–6.
- Keep the edits to `app/api/assistant/route.ts` minimal and localised: contract field, block push, cold-start condition, routing exemption.
- Put the logic in `lib/physique/assistantBlock.ts`, `lib/physique/payload.ts` and the routing module.

Acceptance:
- [ ] Unit test: the block is ≤600 tokens (approximated as ≤2,400 chars) for a full 84-day payload.
- [ ] Unit test: `classifyAssistantQuestionKind("how long until I hit 90kg?")` → `physique_progress`. Add 10 more physique phrasings, and 5 bench phrasings that must still route to bench.
- [ ] Manual: with the seeded LOSS-1 data, "is my cut working?" gives a reply that leads with the verdict, cites only numbers in the block, and doesn't say "losing muscle".
- [ ] Prompt caching is still used (`cache_read_input_tokens > 0` on the second identical request, from the `[assistant-cache]` log).

### I3 · Physique evals
M1 · S · depends on: I2
Do: add the 5 cases in 03 §4.1 step 7 to `evals/cases.json`, with fixtures built by `lib/physique/fixtures.ts` and serialised. Run `npm run eval` if a key is available.
Acceptance:
- [ ] The cases exist.
- [ ] The eval run result is recorded in STATUS (or "not run: no key").

### ★ V1 · Seed scenarios and end-to-end check
M1 · S · depends on: U2b, I1, I2 · skills: `run`
Do:
1. Extend `app/dev/seed-physique/page.tsx` (created in U2a) with buttons for the fixture scenarios (on-track cut, LOSS-1, SLEEP-1, lean bulk too fast, cold start). Each writes 8 weeks of data through the repos, with **a backup export first**.
2. Use the `run` skill: start the dev server, seed each scenario, and screenshot `/`, `/body` and `/body/check-in` at 390 px.
3. Write `docs/plan/M1-dogfood.md`: what to log daily (weigh-in on waking, food, sleep), when the first verdict will appear (≈14–21 days), and how to report a wrong verdict (log it to STATUS with the date and screenshot).

Acceptance:
- [ ] The screenshots are committed under `docs/plan/screens/m1/`.
- [ ] Every scenario shows the verdict expected in P5.

---

## M2 — Hardening (do before M3; tickets can run in any order once M1 is done)

### F4 · Split `app/api/assistant/route.ts`
L · Read: `research/E-codebase-audit.md` §2.8.
- Follow the layout in §2.8:
  - a context-block registry;
  - one `AssistantTurnContext` instead of 33 positional args;
  - delete the dead single-session branch and its helpers;
  - gate `console.log` behind `devLog`;
  - add a zod body schema with size limits.
- Physique becomes a registry entry.

Acceptance:
- [ ] Characterisation tests (F6) pass before and after.
- [ ] Evals are no worse.
- [ ] `route.ts` is ≤ 300 lines.

### F5 · Model migration
M · skills: `claude-api` (run its `migrate` subcommand)
- Move the assistant and memory-extraction routes to the model you choose (decision D3 in the README).
- Add server-side fallbacks and refusal handling.
- Re-run the evals and compare.

### F6 · Characterisation tests for the existing engine
M · Read: `research/E-codebase-audit.md` §7.1 item 3.
- Cover `liftTrend`, `plateauSignal`, `signalStatus`, `volumeAnalysis`, the routing table (incl. physique), `createDataSourcesFilter`, and a `formatUserContextBlock` snapshot.
- Fix the server/client mismatch: the server uses the full workout history the client sends (bounded) and the real profile.

### F7 · Move workouts onto the storage seam
L
- `WorkoutRepo` with stable ids and `schemaVersion`.
- Migrate the 5 writers and 8 readers.
- Stop rewriting history on a unit switch: store kg canonically, with a one-time migration.
- Unify the 4 `StoredWorkout` copies.

### F8 · API hardening
S
- Move `extract-memory` and `refine-target` onto `withPaidRoute`.
- Delete `/api/coach-analysis` and the dead OpenAI libs.
- Return generic error bodies.

### F9 · Remove dead code
M
- Delete the 19 unreachable files, the dormant branch files and the orphan routes (research E §5.2), after one last check with `grep`.
- Retire `priorityGoal` in favour of `PhysiqueGoal` plus training priorities, or move it into Profile.

---

## M3 — Real data: accounts and Apple Watch

Start each ticket by re-reading `research/D-architecture-tooling.md` §2–3 and refining the ticket in STATUS.

### H3 · You: create Supabase and get the keys
- Create a Supabase project in **London**.
- Add `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to Vercel and to the cloud environment.
- Optional: a scoped personal access token for the Supabase MCP (`06-tooling.md`).

### S1 · Schema and RLS
M · skills: `supabase`, `supabase-postgres-best-practices` (vendor them, per `06-tooling.md`)
- Write SQL migrations for 03 §3.2, with RLS on every table.
- Generate typed client types.
- Add RLS tests: user A can't read user B.

### S2 · Auth
M
- Email OTP (a 6-digit code, not a magic link).
- Session handling with `@supabase/ssr`.
- API routes verify the JWT; `client_id` becomes `auth.uid()`.

### S3 · Local-first sync
L
- Dexie stores mirroring the repos, plus an outbox; sync on `online`, `visibilitychange` and launch.
- Repos switch to the Dexie implementation behind the same interface.
- Last write wins per row; soft deletes.

### S4 · Import from the browser
S
- On first sign-in, upload the `exportAppLocalStorageSnapshot()` payload to `legacy_snapshots`, then normalise it server-side, idempotently.

### S5 · Health Auto Export ingest
M · Read: research D §2.1 · skills: `claude-api` (not needed), `supabase`
- `POST /api/ingest/hae` (03 §6).
- A "Connect Apple Health" settings screen: generate a token, show it once, copy, revoke.
- Derive `sleep_nights` and `health_samples` → weigh-ins (source `healthkit`).
- Fixture tests built from the documented HAE JSON (both body-mass metric names, aggregated sleep).

### H4 · You: set up Health Auto Export
1. Buy Premium (£6.99/yr).
2. Create a REST API automation:
   - JSON format;
   - metrics: sleep analysis, HRV, resting HR, steps, body mass, body fat, active and basal energy;
   - Aggregation **on**, Batch Requests **on**, date range **Since Last Sync**;
   - header `Authorization: Bearer <token from S5>`;
   - URL `https://<your app>/api/ingest/hae`.
3. Run one Manual Export of the last 60 days in weekly chunks as a backfill.

### S6 · Recovery from HealthKit data
M · Read: `02-engine-spec.md` §7.4; research C §4.4–4.5, §6.5
- Night HRV and RHR, baselines, flags, recovery status, the illness guard.
- Wire `F_hrv` and `F_rhr` into SLEEP-1's corroboration.
- Add a recovery row to the Body page (word, not number; green = quiet).

### S7 · Backups
S
- A GitHub Action that runs a nightly `pg_dump` to an encrypted artifact, or Supabase Pro backups once testers arrive.

---

## M4 — Food done properly

Read first for all: `research/A-macrofactor-nutrition.md` §D; research D §4.

- **N1 · Food database.** Import CoFID (OGL) and USDA Foundation + SR Legacy (CC0) into Postgres. Add a `pg_trgm` search API, `/api/food/search`, that ranks history first.
- **N2 · Barcodes.** An Open Food Facts proxy, `/api/food/barcode/:code`, with a custom User-Agent, a per-barcode cache table, a "check the label" confirmation, and ODbL attribution in the UI.
- **N3 · Search and plate UI.** MacroFactor's pattern: one "plate" fed by every method, multi-add from results with the last-used serving, hourly go-tos, NumberPad servings.
- **N4 · Grounded AI parse and photos.** `/api/food/parse` v2: Claude returns items + grams only, and the database supplies macros. Add `/api/food/photo` with vision. Label low confidence.
- **N5 · Barcode scanner.** The `barcode-detector` WASM polyfill with `getUserMedia`.
- **N6 · Recipes and saved meals.**
- **N7 · Logging-speed benchmark.** Port MacroFactor's 4 Food Logging Speed Index tests to Playwright tap counts. Target ≤ 24 actions total.

---

## M5 — Training engine

Normative spec: `research/B-training-apps.md` §5 and §8, with the amendment in `02-engine-spec.md` §11.

- **T1 · Set types.** Warm-up, drop and failure, with a schema migration. Warm-ups are excluded from volume, e1RM and PRs.
- **T2 · Unified e1RM.** Best e1RM per session (RIR-aware, reps + RIR ≤ 12), a time-based %/wk slope, and the duplicate `extractRecentE1rmSeries` removed. Keep the `liftTrend` API stable.
- **T3 · Template targets.** Rep ranges and per-set RIR targets on templates, with a migration from role defaults.
- **T4 · One progression module.** MacroFactor's rule, equipment profiles and snapping, rep-range expansion. Replace the 3 existing implementations and delete `/api/refine-target`, so OpenAI is no longer needed.
- **T5 · Muscle priorities and weekly sets.** Emphasize / Grow / Maintain, weekly per-muscle set targets, and a 1-tap soreness rating (RP's 1–4 × 1–4 table).
- **T6 · Mesocycles and deloads.** Scheduled and triggered deloads (Dr. Muscle's numbers: −50% sets, −10% load).
- **T7 · Phase-aware training rules.** The cut and lean-bulk rules from research B §5, wired to `PhysiqueGoal`.
- **T8 · Logging extras.** Warm-up generator, plate calculator, live PR mark (quiet, no confetti), supersets, rest timer ±15 s.

---

## M6 — The plan: calibrated to your goal

- **G1 · Phase planner.** Goal → a timeline of phases (cut, maintenance ≥2–4 weeks per DB-2, lean bulk, optional diet breaks), with an honest ETA and milestones. MacroFactor's #2 feature request is sub-goals.
- **G2 · Program generator.** A questionnaire (MacroFactor and Hevy Trainer inputs) → a deterministic program skeleton (Hevy's split defaults by days per week, RP volume landmarks by priority). The LLM only explains it.
- **G3 · Weekly review.** WHOOP's Monday-style review delivered by the assistant: nutrition, training and sleep in one place, ending in one decision. Built on the check-in.
- **G4 · Morning brief card.** Last night's sleep, today's session and today's targets. Green = silent.
- **G5 · Reminders.** Web push (supported in iOS Home Screen web apps) for weigh-in and check-in.

---

## M7 — Testers

Read first for all: research D §2.2, §5.

- **X1 · Capacitor shell.** Capacitor 8 with a static export (03 §8).
- **X2 · HealthKit in-app.** HealthKit sync via `@capgo/capacitor-health` into the same ingest tables.
- **X3 · Consent and data rights.** Consent screens (health data; third-party AI), privacy policy, data export, delete account.
- **X4 · Builds.** A cloud macOS build pipeline and TestFlight.
- **X5 · Compliance pack.** DPIA, ICO fee, wellness-claims review, Supabase Pro.
