# 04 — Tickets

How to work a ticket: see "Session protocol" in `README.md`, or run the `/next-ticket` skill. Track progress in `STATUS.md`.

**Ticket format.** Milestone · size · depends on · skills to load · read first · what to do · acceptance criteria.

**★ = morning critical path.** Do these in this order:

`F1 → F3 → P1 → P2 → U1 → U2a → I1 → P3 → U3 → P4 → P5 → U2b → I2 → V1`

**Why logging comes before the judge.** The judge can't say anything until there are about 14–28 days of weight and food data (02 §2.2, §4.3). So the first goal is to make **logging live** (weight, food, sleep, waist, with the trend chart) so data starts building up from day one. If the overnight run stops early, you can still start logging in the morning, once the branch is deployed (H5). The judge lands next, and it will have data by the time it's allowed to speak.

**Size key:** S ≈ 15–30 min, M ≈ 30–90 min, L ≈ 1.5–3 h of agent time. The full ★ path is roughly 10–14 hours of agent time.

### Rules for autonomous runs (apply to every ticket)

1. **Criteria that need secrets, paid API calls or human judgement never block a ticket.** Record "not run: no key" (or "needs human check") in STATUS, then mark the ticket done once everything else passes.
2. **Time box.** If a ticket runs past 2× its size, ship the tested subset, log the rest as a follow-up row in STATUS, and continue.
3. **The design skill in an autonomous run.**
   - `05-design.md` is the **user-approved shape brief** for every M1 UI ticket. Its §1–7 count as an already-confirmed brief, so record `shape=pass(05-design)`.
   - Image probes: record `image_gate=skipped:autonomous-run`.
   - Never run `$impeccable shape`, `teach` or anything else that waits for a reply.
   - Use `critique`, `audit` and `polish` after building.
4. **Before pushing a UI or route change, run `npm run build` too.** It catches Next-only errors such as invalid route exports or a missing Suspense boundary around `useSearchParams`.
5. **ESLint suppressions.** If lint fails with "suppressions left that do not occur anymore", run `npx eslint --prune-suppressions` and commit the file. Never re-run `--suppress-all` after F1.
6. **Never write to real user data.** Seed and dev pages are dev-only (`notFound()` in production).

---

## M0 — Your setup (human)

### H1 · Back up and protect your data (5 min)
1. On your iPhone, open the production app in Safari → Profile → Data tools → **Export**, and save the JSON somewhere safe. After F3 there's a "Download .json" button.
2. Safari → Share → **Add to Home Screen**, and use that icon from now on. Safari deletes a site's storage after 7 days without a visit; Home Screen apps are exempt.
3. Repeat the export weekly until M3 moves data to Supabase.

### H2 · Prepare the sessions (5 min)
1. Merge this plan's branch (`claude/admiring-ptolemy-mz6jwu`) into `main`, so every session sees `CLAUDE.md` and `docs/plan/`. If you don't, the kickoff prompt branches from the plan branch instead.
2. Optional: make `ANTHROPIC_API_KEY` available to the cloud environment if you want sessions to run `npm run eval` (it costs money). Without it, AI-dependent checks are recorded as "not run".
3. Start sessions with the Fable model and paste the kickoff prompt from `README.md`.

### H5 · Ship M1 to your phone (after the overnight run)
1. Check `STATUS.md`: the ★ tickets up to at least **U2a + I1** are `done`, and `npm run build` passed.
2. Export a backup from production (H1).
3. Merge `physique/m1` (or the session's branch) into `main`. Vercel deploys production.
4. Log **only** in the production Home Screen app. Preview deployments are a different origin, so anything logged there won't appear in production.

---

## M1 — Body layer MVP

### ★ F1 · Tooling: tests, one check command, lint baseline, session hook
M1 · S · depends on: — · skills: `session-start-hook` (as reference only: skip its commit/push and wrap-up steps)
Read first: `research/E-codebase-audit.md` §5.1, §5.4.

Do:
1. `npm i -D vitest happy-dom`.
   - Add `vitest.config.ts` with the `@/` alias and `environment: "happy-dom"`.
   - Add scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`, `"check": "npm run typecheck && npm run lint && npm test"`.
2. Port `scripts/test-volume-rules.ts` to `lib/__tests__/volumeRules.test.ts`.
3. ESLint baseline:
   - In `eslint.config.mjs`, add `.agents/**` and `.claude/skills/**` to `globalIgnores`.
   - Run `npx eslint --suppress-all` **once** to freeze the existing errors into `eslint-suppressions.json`, and commit it.
   - New violations still fail. ESLint 9.39.4 is installed and supports suppressions.
4. Add a SessionStart hook in `.claude/settings.json` that runs `npm ci` when `node_modules` is missing, with a timeout ≥ 300 s.
5. Add `.env.example` listing `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`, and `!.env.example` to `.gitignore`.
6. Vendor the web skills from `06-tooling.md` §2 (`DISABLE_TELEMETRY=1 npx skills add vercel-labs/agent-skills --skill react-best-practices --skill web-design-guidelines -a claude-code -y`).
   - Commit `.agents/skills/*`, the `.claude/skills/*` symlinks and `skills-lock.json`.
   - If the network blocks it, note that in STATUS and continue.
7. Unless README decision D4 says otherwise, apply `01-product-spec.md` §5 to `PRODUCT.md`.

Acceptance:
- [ ] `npm run check` exits 0.
- [ ] A new deliberate lint error makes `npm run lint` fail. Revert it afterwards.
- [ ] The volume-rules tests pass under vitest.
- [ ] `npm run build` passes.

### F2 · Fix the bugs that corrupt data
M1 · M · depends on: F1 (not on the ★ path; run after V1)
Read first: `research/E-codebase-audit.md` §5.7; `research/B-training-apps.md` HV-11.

Do (one test per fix; prune suppressions afterwards, per rule 5):
1. History edit drops `rir` and `exerciseId` (`app/history/page.tsx:36-41, 145-150`). Preserve every set field through edit and save.
2. Hevy CSV with `weight_lbs` imports blank weights (`lib/csvImport.ts` `parseHevy`).
   - Accept `weight_kg` or `weight_lbs` and convert to the user's unit.
   - Map `set_type` failure → RIR 0, and dropset → merge into the previous set.
   - Read `superset_id` and store it if present.
3. `addWorkout` doesn't dispatch `workoutHistoryChanged` (`lib/workout-store.tsx:106-114`).
4. The non-streaming JSON path leaks `<datasources>` (`app/api/assistant/route.ts:4139-4140`). Strip it the same way the stream path does.
5. Conditional hooks in `components/LiftProgressionSection.tsx:180/225-226`.

Acceptance:
- [ ] Each fix has a test, or for UI-only fixes a short manual check recorded in STATUS.
- [ ] `npm run check` passes.

### ★ F3 · Foundations: stats, dates, units, storage seam, models, API guard
M1 · M · depends on: F1
Read first: `03-architecture.md` §2; `research/E-codebase-audit.md` §1.4, §7.2–7.3.

Do:
1. **`lib/stats.ts`** (pure):
   - `mean`, `median`, `mad`, `stdev`, `winsorize`, `ewma`;
   - `olsSlope(xs, ys)` → `{slope, intercept, se, n}`;
   - `robustSlope(xs, ys)` (OLS, cap residuals at 3 × MAD, refit once) → same shape.

   Move the private `leastSquaresSlope` out of `lib/liftTrend.ts` and keep liftTrend's behaviour identical.
2. **`lib/dates.ts`** (pure): `localDateKey(date, tz)`, `addDays`, `dayDiff`, `dateRange`, `weekday`, `isWeekday`, plus `clientNow()`. `clientNow()` is the only impure helper; it returns `{today: "YYYY-MM-DD", tz}` from `Intl.DateTimeFormat().resolvedOptions().timeZone`.
3. **`lib/units.ts`** (pure):
   - a single `KG_PER_LB = 0.45359237`;
   - `kgToDisplay`, `displayToKg`, `formatWeight(kg, unit)`, `formatKcal`;
   - `parseWeightText(text, unit)` → kg or `null` for "", "BW" or NaN.

   Don't migrate existing callers yet (F7).
4. **`lib/storage/`:**
   - `keys.ts`: the registry (`key`, `scope`, `version`, `includeInBackup`, `owner`). Pre-register **every key in research E §1.4's table**.
   - `kv.ts`: `get`/`set`/`remove`. `set` returns `{ok: true} | {ok: false, error}`; never swallow `QuotaExceededError`.
   - `useStored.ts`: a `useSyncExternalStore` hook.
   - `repo.ts`:
     - `createRepo<T extends {id: string}>(key)` exposes async `list({from?, to?})`, `get`, `upsert`, `bulkUpsert`, `remove`, `subscribe`, plus a sync `snapshot()`. Writes reject when `kv.set` fails.
     - `createSingleton<T>(key)` exposes `get`, `set`, `subscribe`, `snapshot`.
     - `createRecordStore<T>(key)` holds a date-keyed map (for `dayFlags`).
5. **Backup:** make `lib/devDataTransfer.ts` derive its allowlist from `keys.ts` (`includeInBackup`). Add a **"Download .json"** button to `app/dev/data-transfer/DevDataTransferClient.tsx`, keeping the textarea.
6. **`lib/ai/models.ts`:** `ASSISTANT_MODEL = "claude-sonnet-4-6"` (unchanged) and `FOOD_PARSE_MODEL = "claude-opus-5-5"`. Point the 4 hard-coded sites at it: `app/api/assistant/route.ts:2880`, `app/api/assistant/extract-memory/route.ts` (model const), `lib/planSingleSessionWorkoutLLM.ts:10`, `evals/run.ts:22`.
7. **`lib/api/guard.ts`:** `withPaidRoute({schema, maxBytes, subCall}, handler)`. It:
   - parses and validates the body with zod (add `zod` as a direct dependency);
   - **then** checks the daily cap;
   - requires `client_id`;
   - wraps cost logging;
   - returns generic errors.

   New routes use it.

Acceptance:
- [ ] Unit tests for every function. `olsSlope` and its SE match a hand-worked example. `robustSlope` ignores a single +3 kg outlier (it moves the slope by < 0.05 %/wk where OLS moves it ~0.3).
- [ ] `liftTrend` behaviour is unchanged (3 characterisation tests added before the move).
- [ ] **Backup test:** the exported key set ⊇ the old `APP_LOCAL_STORAGE_KEYS` − {`workoutFromTemplate`, `workoutSuggestedMuscle`} + {`assistantMemory`, `restTimerNotifySettings`, `volumeEnabledOptionalGroups`}. A pre-F3 export fixture imports losslessly.
- [ ] A forced `QuotaExceededError` (mock) makes `upsert` reject.

### ★ P1 · Physique types and repositories
M1 · S · depends on: F3
Read first: `02-engine-spec.md` §1, §5.1, §8.1; `03-architecture.md` §2–3.1.

Do:
1. `lib/physique/types.ts`: every entity in 02 §1.1, plus `PhysiqueAnalysis`, `Verdict`, `Recommendation`, `RuleId` (every id in 02 §7.3 and §8.2), `PhysiqueProgram` (03 §3.1) and `DailyIntake` (`{date, kcal, proteinG, carbsG, fatG, status}`, derived from food entries and flags by `intake.ts`).
2. `lib/physique/io/repos.ts`: the repos and singletons for each key in 03 §3.1, registered in `keys.ts` with `includeInBackup: true`.
3. `lib/physique/io/profile.ts`: `getPhysiqueProfile()` merges `OnboardingProfile` (`sex`, `age`, `heightCm`, `units`) with the physique-only fields.
   - **Defaults:** `generalActivity` moderate; `proteinLevel` moderate; `dietType` balanced; `checkInWeekday` 1; `sleepGoalH` 8; `age` 30 if missing.
   - `expenditureStartDate` = the first day with both a weigh-in and logged food.
   - It reports which required fields (`heightCm`, `sex`) are missing.

Acceptance:
- [ ] Repo round-trip tests: upsert, list by date range, remove, subscribe fires.
- [ ] A backup export followed by an import restores physique data.

### ★ P2 · Weight engine and the scenario generator
M1 · M · depends on: P1
Read first: `02-engine-spec.md` §1.2, §2, §8.4; `research/F-evidence-rules.md` §5; `research/A-macrofactor-nutrition.md` §G.3, §G.6.

Do:
1. `lib/physique/fixtures.ts`: a normal module, so both tests and the dev pages can import it. It holds a seeded PRNG plus `makeScenario(spec)`, with the spec from 02 §8.4.
   - **Noise:** `noiseSdKg` is the marginal SD (default 0.5); innovation SD = marginal × √(1 − φ²).
   - **Returns:** `{profile, goal, program, weighIns, foodEntries, dayFlags, sleepNights, waist, workouts}` in repo shapes.
   - **Workouts** are `StoredWorkout`s with weight strings in the scenario's unit, and are tagged `name: "[seed] …"` so "Clear" can remove them.
   - The spec takes `trueTdeeKcal`. Weight moves by (intake − trueTDEE) / 7716 per day, plus noise and the water step, so the observed rate comes out of the energy balance.
   - For this ticket, implement the weight, intake (`{meanKcal}` mode), sleep and lifts parts. `intake: "toTarget"` (closed loop) lands in P3.
2. `lib/physique/weight.ts`:
   - `interpolateDaily`;
   - `trendSeries` (EMA α 0.10, ending at the last real weigh-in);
   - `segmentStart(goalHistory, flags, now)` (02 §1.2);
   - `rateOverWindow(weighIns, endDate, days)` → `{ratePctPerWeek, se, seAdj, margin, n, windowDays}` using `robustSlope`;
   - `pickWindow(rule, …)` (02 §2.2 table);
   - `isConfidentlyAbove/Below`;
   - `sanityCheck(newKg, trendKg)` (3%).

Acceptance:
- [ ] Rate accuracy over 200 seeds at 85 kg and −0.6 %/wk with daily weigh-ins: a 28-day window is within ±0.4 %/wk in ≥95% of seeds, and a 21-day window within ±0.5 in ≥95%. Research F §5 predicts ±0.30 and ±0.45 at 95%.
- [ ] The rate is null below 14 days or 5 weigh-ins, and the phase-start mask days are excluded from windows.
- [ ] The trend reproduces research A §G.6's impulse response once expenditure lands (assert in P3).

### ★ U1 · UI primitives
M1 · M · depends on: F1 · skills: `impeccable` (critique/polish only; see rule 3), `dataviz`, `run`
Read first: `05-design.md` §1–2; `research/E-codebase-audit.md` §4.

Do:
1. Extract `STATE_COLOR`, the status icons and `useIsHydrated` from `app/page.tsx` and `app/signal/[key]/page.tsx` into `lib/ui/status.ts` and `lib/ui/useIsHydrated.ts`. Both pages import them, with no visual change.
2. `components/charts/TimeSeriesChart.tsx`:
   - time-based x axis;
   - dots only on days with a real value;
   - the trend line drawn continuously between the first and last real values;
   - an optional dashed projection line and target band;
   - tap a point for a tooltip;
   - y axis via `lib/chartScale.ts`;
   - works at 390 px wide;
   - follows the `dataviz` mark and colour rules within this app's palette.
3. `components/ui/Sheet.tsx`: a bottom sheet with focus trap, swipe or tap to close, and safe-area padding.
4. `components/ui/NumberPad.tsx`: digits, decimal and backspace, with an optional ±step row.
5. `app/dev/chart/page.tsx` (dev-only): renders the chart with a `makeScenario` series. If P2 isn't merged yet, use an inline 8-week series.

Acceptance:
- [ ] The home and signal pages look identical before and after (screenshots).
- [ ] The chart renders an 8-week weight series at 390 px and 768 px (screenshots in `docs/plan/screens/U1/`).

### ★ U2a · The Body page: logging and the trend chart
M1 · L · depends on: P2, U1 · skills: `impeccable` (rule 3), `dataviz`, `run`
Read first: `05-design.md` §3, §5; `01-product-spec.md` §2.

This makes logging live before the judge exists. Build `/body` with:
1. **A date switcher** (‹ date ›) at the top. Every logging control acts on the selected day, for backfilling.
2. **Today strip:**
   - **Weight:** NumberPad sheet prefilled with the last value, with ±0.1 steps; the sanity check runs on save.
   - **Food:** day kcal and P/C/F totals. Tap opens a **quick-add sheet**: optional label, kcal, P, C, F via the NumberPad, plus a "Recent" row of the last 8 distinct entries for one-tap re-log. U4 later replaces this with the full day log.
   - **Sleep:** sheet with bedtime and wake prefilled from the 7-day median (else 23:00 and 07:00) with ±15-minute steppers; "hours asleep" prefilled as time in bed − 20 min; wake-ups 0 / 1–2 / 3+.
   - **Waist** (weekly, optional): NumberPad sheet showing the measuring protocol from 02 §1.1.
3. **Weight chart:** `TimeSeriesChart` with raw dots and the trend line. Caption: "Trend 84.2 kg · −0.6 %/wk (21 d)", or "Early read · N more weigh-ins for a rate".
4. A **verdict placeholder** that says "Calibrating" plus what's missing. U2b replaces it.
5. **Save failures** show "Couldn't save. Export a backup" (from the kv `{ok: false}` result).
6. **`app/dev/seed-physique/page.tsx`** (dev-only):
   - **Seed** first triggers a backup download, then writes a 3-week scenario through the repos;
   - **Clear physique data** removes the physique keys and the `[seed]` workouts.

**Tap counting** excludes digit entry. Accepting a prefilled value or one ±step counts as one tap. The sanity confirmation doesn't count.

Acceptance:
- [ ] A weigh-in takes ≤3 taps from `/body`, a sleep entry ≤4, and a recent-food re-log ≤2.
- [ ] Data persists through a reload and appears in a backup export.
- [ ] Screenshots at 390 px in `docs/plan/screens/U2a/`: the empty state, and 3 weeks of seeded data.
- [ ] `npm run build` passes.

### ★ I1 · Navigation and the home card
M1 · S · depends on: U2a · skills: `impeccable` (rule 3), `run`
Read first: `05-design.md` §6; `PRODUCT.md`.

Do:
1. Add a **Body** tab to `components/BottomTabs.tsx`: 5 tabs (Home, Body, Templates, History, Profile), with a simple scale icon.
2. In `app/page.tsx`, add a compact **Physique** card below the Signals row.
   - Three mini stats: trend weight (and rate when available), kcal logged today, and last night's sleep.
   - Tap → `/body`.
   - **Don't import anything from P5 here.** U2b adds the status dot, verdict title and check-in badge.

Start Workout stays the dominant element.

Acceptance:
- [ ] The home layout order is unchanged except for the new card.
- [ ] Screenshots at 390 px (empty and seeded) in `docs/plan/screens/I1/`.

### ★ P3 · Intake, expenditure, targets and the program
M1 · L · depends on: P2
Read first: `02-engine-spec.md` §1, §3–5; `research/A-macrofactor-nutrition.md` §A1–A4, §B2–B6, §G.

Do:
1. `intake.ts`: `dailyIntake`, day status, partial suggestions (unresolved list), intake means, `loggedShare`, adherence against the target in effect each day (02 §3), protein and fat g/kg.
2. `expenditure.ts`:
   - `snapshotSeed` and `initialTdee` (02 §4.2);
   - `expenditureSeries` (02 §4.1, including the trend ending at the last weigh-in and the predictive offset as a separate ramped term);
   - the maturity state (02 §4.3).
3. `targets.ts`:
   - `rateBands(status)`, `validateRate` (02 §5.2, including the refused cases);
   - `trainingStatus`: **in P3 use the `yearsTrainingBand` fallback only**; P4 adds lift-derived status;
   - `weeklyTarget` (§5.3), `macros` (§5.4 with the category table and protein floor), `floors`.
4. `program.ts`: `newProgram(goal, analysisInputs, now)` (unsmoothed), `checkInProgram` (capped), `refreshProgram`. A program history entry is recorded with its `source`.
5. Extend `makeScenario` with `intake: "toTarget"` (closed loop through `checkInProgram`, weekly).

Acceptance:
- [ ] Every golden test in 02 §4.2 passes to ±1 kcal, including the impulse test within 15 kcal at each point. The impulse setup is +4/+3/+2 lb on 3 consecutive days ending L weeks before today, from steady state.
- [ ] **Stability:** over 50 seeds and 120 days with intake SD 350, the mean absolute daily change after 30 updating days is ≤ 8 kcal at φ = 0 and ≤ 10 kcal at φ = 0.5. **Never change α or k to pass a test.**
- [ ] **Holding:** 3 of 7 days logged → holding; it resumes after 3 consecutive complete days.
- [ ] **Partial suggestion:** fires at 0.49 × median, not at 0.51 ×.
- [ ] **Seed is fixed:** editing the profile after `expenditureStartDate` doesn't change past expenditure values.

### ★ U3 · Goal setup
M1 · M · depends on: P3, U1 · skills: `impeccable` (rule 3), `run`
Read first: `05-design.md` §4; `02-engine-spec.md` §5; `research/A-macrofactor-nutrition.md` §B2, §B10.

Do: build `/body/goal`:
0. **Missing inputs.** If `heightCm` or `sex` is missing, ask for them first, and save them by merging into `OnboardingProfile`. Ask age (default 30) and the body-fat category (optional; "skip" is allowed).
1. **Target weight.** NumberPad, prefilled with the trend (or the last weigh-in). Direction is derived and shown.
2. **Rate.** A slider with the 02 §5.2 bands for the training status (the chip says "Intermediate · from your training years", editable). It shows, live:
   - the weekly change in kg;
   - an honest ETA;
   - the starting kcal and protein from `newProgram`.

   Out-of-band rates need an extra confirm. Refused rates are disabled, with the reason shown.
3. **Safety screen** (stored in `PhysiqueProfile`):
   - age < 18 → SAFE-0 (no deficit);
   - "Are you pregnant, or have you had an eating disorder?" yes → maintenance plus referral copy (SAFE-5).
4. **Confirm.** A summary and "Start today" (sets `phaseStartConfirmedAt`). It writes the goal and **the initial program** (unsmoothed). If the user just finished a cut of 8+ weeks and is choosing a gain, show DB-2's suggestion: run 2–4 weeks at maintenance first.

Acceptance:
- [ ] 82 → 90 kg, intermediate: default +0.25 %/wk; ETA ≈ 37 weeks (ln(90/82) / ln(1.0025) ≈ 37.3).
- [ ] A rate that implies > 1.0 kg/wk, or a day-0 deficit > 30% of TDEE₀ or > 1,000 kcal, can't be saved.
- [ ] After confirming, the Body page's food bars show targets.
- [ ] Screenshots in `docs/plan/screens/U3/`.

### ★ P4 · Strength and sleep modules
M1 · M · depends on: P2
Read first: `02-engine-spec.md` §6, §7.1–7.3; `research/C-sleep-recovery.md` §5–6; `research/F-evidence-rules.md` §6–7.

Do:
1. `strength.ts`:
   - `e1rmAdj` and `bestSessionE1rm` (weights through `parseWeightText` with the `weightUnit` setting);
   - `pickMainLifts` (02 §1.2);
   - `deloadWeeks`, `repRangeChanges`;
   - `liftChangeVsPhaseStart`, `strengthStatus`;
   - `liftDerivedTrainingStatus` (02 §5.2). Wire it into `targets.trainingStatus` when it has enough data.
2. `sleep.ts`: night normalisation (manual in M1; the HealthKit shape is stubbed for M3), `sleepStatus` (manual vs wearable thresholds, mixed rule), `acute`, `debt7`, `mean14h`, and the SLEEP-1 corroboration inputs.

Acceptance:
- [ ] Fixture tests:
  - two lifts with a −8% step at day 14 (5 weeks, 2 sessions/wk, CV 0.03) → `dropping` in ≥70% of seeds (measured 0.76 with the spec's median-of-3 blocks; research F's 80% assumed mean-of-3), and ≥80% with three lifts;
  - one lift −8% → `one-lift`;
  - a drop inside cut days 0–13 → suppressed;
  - a session after a 4.5 h night → excluded;
  - zero main lifts → `unclear`.
- [ ] Sleep tests:
  - manual 6.8 h → `short`;
  - manual 6.4 h → `severe`;
  - wearable 6.8 h → `ok`;
  - 9 of 14 nights → `unknown`.

### ★ P5 · The judge, status and check-in plan
M1 · L · depends on: P3, P4
Read first: `02-engine-spec.md` §8–10; `research/F-evidence-rules.md` "Judge rules table" and "Must NOT claim".

Do:
1. `judge.ts`: `buildPhysiqueAnalysis(inputs, {today, tz})`.
   - Implement every rule (02 §7.3, §8.2 incl. changes A–D).
   - Apply suppression and ordering (§8.3), recommendation choice and direction checks (§8.2 A), and status = most severe.
   - There is always exactly one primary.
2. `status.ts`: the home-tile `{state, status}`.
3. `checkIn.ts`: `buildCheckInPlan`, `applyCheckInAnswers` (returns `DayFlags` and `WaistEntry` writes plus the accepted program).
4. `evidence.ts`: id → citation, built from research F's reference list.
5. **Copy linter test:** no verdict copy contains a banned phrase (02 §10). "REM" matches only as a case-sensitive whole word.

Acceptance:
- [ ] Every rule has fire, near-miss and suppressed/outranked fixtures (02 §8.4).
- [ ] Scenarios, run over 200 seeds, produce the expected primary verdict in ≥80% of seeds (single-seed snapshot tests use frozen seeds):

  | Scenario | Expected primary |
  |---|---|
  | 85 kg, goal −0.6, intake toTarget, 6 weeks, lifts flat | ON-TRACK |
  | 90 kg, goal −1.0 (confirmed), intake toTarget, **true TDEE set above the seed estimate** so the observed 28-day rate is ≈ −1.5, 35 d, 2 lifts −8% step at day 14 | LOSS-1 (LOSS-3 is also acceptable if the rate passes 1.5) with `change_rate` −1.0 → −0.6 |
  | Same, but goal −0.6 with intake 500 kcal under target | ADH-1 |
  | 85 kg, goal −0.6, toTarget, manual sleep 6.6 h (`short`) on 13 of 14 nights, 5 weeks of lifts with a −3% step on 2 lifts at day 21 of 35 | SLEEP-1 |
  | 80 kg intermediate, goal +0.75 (confirmed), observed ≈ +0.75, toTarget, 42 d | GAIN-1 with `change_rate` 0.75 → 0.25 |
  | 10 days of data | DATA-RATE (unknown) |
  | Goal injected directly with a BMI < 18.5 target | SAFE-4 |
  | No goal | NO-GOAL |

- [ ] Direction-check tests: no recommendation ever makes a LOSS rule's goal more aggressive or a GAIN-1 goal faster.
- [ ] The copy linter passes.

### ★ U2b · The Body page: verdict, energy, strength and sleep
M1 · M · depends on: P5, U2a, U3 · skills: `impeccable` (rule 3), `run`
Read first: `05-design.md` §3, §6, §7.

Add to `/body` and Home, reading everything from `buildPhysiqueAnalysis` (pages compute nothing themselves):
1. **Header:** goal summary with a progress bar on trend weight, or a "Set your goal" prompt.
2. **Verdict card:**
   - the primary verdict (status colour, title, detail with window and n);
   - up to 3 flag rows;
   - the recommendation row. `change_rate` → **Apply**, which updates the goal through `validateRate` and starts the mask and cooldown. `refresh_targets` → **Update targets now**. `confirm_days` → links to those days.
   - **Ask why**, which opens the assistant with a prefilled prompt.
3. **Energy card:** expenditure with its maturity state and ± (02 §4.3), today's targets, and 14-day adherence.
4. **Strength and sleep rows:** main lifts' change since the phase started (or "No pre-cut baseline yet"), plus the 14-night mean, status and debt.
5. **Home** (`app/page.tsx`):
   - the Physique card gets the status dot, verdict title and "Check-in ready" badge;
   - when the status is `watch` or `attention`, the assistant insight card shows the physique verdict with chips (Why? / What do I change? / Show the data) instead of the training key focus.
6. **Seed page:** add "On-track cut", "LOSS-1" and "Cold start" buttons (8 weeks, using P5 scenarios).

Acceptance:
- [ ] Cold start shows honest states, never a placeholder number.
- [ ] Screenshots at 390 px in `docs/plan/screens/U2b/`: cold start, on-track cut, LOSS-1 (Body and Home).
- [ ] `npm run build` passes.

### ★ I2 · Assistant integration
M1 · L · depends on: P5 · skills: `claude-api`
Read first: `03-architecture.md` §4.1; `research/E-codebase-audit.md` §2.

Do: 03 §4.1 steps 1–5, plus the routing extraction below. The home insight card is already done in U2b.
- **Routing extraction.** Move `computeStrictIntentLock` and `applyStrictIntentLock` from `app/api/assistant/route.ts` (≈ lines 516–647) into `lib/assistantStrictIntentLock.ts`. Exporting extra names from a route file breaks `next build`, and the routing tests need to call them.
- **Minimal edits to `route.ts`:**
  - the contract field;
  - the block push;
  - the `STATIC_COACH_SYSTEM_PROMPT` addition (~line 1415);
  - the cold-start condition;
  - `analysisPreferredKinds`;
  - the bench-timeline regex (~line 3133) must not catch physique phrasing.

Acceptance:
- [ ] Unit test: the block is ≤2,400 characters for the largest valid payload.
- [ ] Routing test of `applyStrictIntentLock(classifyAssistantQuestionKind(m), computeStrictIntentLock(m))`:
  - "how long until I hit 90kg?" and 10 more physique phrasings → `physique_progress`;
  - 5 bench phrasings still route to bench.
- [ ] Server test: the route rejects a malformed `physique` payload with 400, and accepts a valid one without recomputing the verdict.
- [ ] With a key only, otherwise record "not run": with the LOSS-1 seed, "is my cut working?" gets a reply that leads with the verdict, cites only block numbers and doesn't say "losing muscle"; and a second identical request shows `cache_read_input_tokens > 0`.
- [ ] `npm run build` passes.

### ★ V1 · Seed scenarios and end-to-end check
M1 · S · depends on: U2b, I1, I2 · skills: `run`
Do:
1. Add the remaining scenario buttons to the seed page: SLEEP-1, GAIN-1, SAFE-4 (injected goal), no goal.
2. Use the `run` skill: start the dev server, seed each scenario, and screenshot `/` and `/body` at 390 px into `docs/plan/screens/V1/`. Add `/body/check-in` only if U5 is done.
3. Write `docs/plan/M1-dogfood.md`:
   - what to log daily (weigh-in on waking, food, sleep; waist weekly);
   - when the first rate appears (~14 days) and when verdicts can fire (21–28 days);
   - how to record a wrong verdict in STATUS.

Acceptance:
- [ ] Every scenario screenshot shows its expected verdict from P5.
- [ ] `npm run check` and `npm run build` pass.
- [ ] STATUS marks H5 as ready.

### U4 · Food day log
M1 · M · depends on: U2a · skills: `impeccable` (rule 3), `run`
Read first: `research/A-macrofactor-nutrition.md` §D1–D8; `05-design.md` §5.

Build `/body/food?date=`. Wrap `useSearchParams` in Suspense. It has:
- a timeline (time, label, kcal, P/C/F) with edit and delete;
- quick add;
- saved foods and recents (one tap logs the last serving), and "Save as food" on any entry;
- copy yesterday;
- an Edit Day total override;
- day flags: "Mark as fasting" and "This day is incomplete".

Acceptance:
- [ ] Re-logging a recent food takes ≤2 taps.
- [ ] Day totals update the Body page.
- [ ] Flags change the expenditure inputs (an engine test).
- [ ] `npm run build` passes.

### A1 · "Describe it": AI food estimate
M1 · M · depends on: F3, U4 · skills: `claude-api`
Read first: `03-architecture.md` §5; `research/D-architecture-tooling.md` §4.2.

Do:
1. Build `app/api/food/parse/route.ts` with `withPaidRoute`. Input: `{text ≤ 500 chars, client_id}`.
2. Call `client.messages.parse` with a zod output schema (03 §5), `FOOD_PARSE_MODEL`, effort `low`, and server-side fallbacks. Handle `stop_reason: "refusal"`. The system prompt says:
   - estimate grams and macros per item using standard UK composition values;
   - state assumptions, including raw vs cooked;
   - give confidence;
   - never invent brands.
3. UI: a "Describe it" field in the food sheet → editable rows marked "est." → "Log all" or "Save as food".

Acceptance:
- [ ] Zod rejects malformed input; a missing `client_id` → 400; cost is logged.
- [ ] A mocked-SDK test covers the happy path and a refusal.
- [ ] With a key only, otherwise "not run": "200g chicken breast and 150g cooked rice" gives 400–560 kcal and 50–70 g protein, and the assumptions mention raw or cooked.

### U5 · Weekly check-in
M1 · M · depends on: P5, U2b · skills: `impeccable` (rule 3), `run`
Read first: `02-engine-spec.md` §9; `research/A-macrofactor-nutrition.md` §B8.

Build `/body/check-in`:
- a stepper rendering the `CheckInPlan` modules;
- answers applied through `applyCheckInAnswers`;
- the program update shows old → new targets with **Accept** and **Keep current**;
- "Fast check-in".

Acceptance:
- [ ] Scenario tests: the partial-day module appears when expected, and confirming a day as partial changes the proposed target.
- [ ] Declining keeps the targets.
- [ ] Screenshots in `docs/plan/screens/U5/`.

### I3 · Physique evals
M1 · S · depends on: I2
Add the 5 cases from 03 §4.1 step 7 to `evals/cases.json`, with payloads built from `makeScenario` output and serialised. Run `npm run eval` only with a key.

Acceptance:
- [ ] The cases exist.
- [ ] The run result, or "not run: no key", is recorded in STATUS.

---

## M1.5 — Redesign (rev 2, see `05-design.md` §9 and `research/G-reference-screens.md`)

Order: R1 → R2 → R3 → R4 → R5. Each ticket: screenshots at 390 px in `docs/plan/screens/<id>/`, `npm run check` and `npm run build` pass, STATUS updated. Engine untouched. If a reference screen doesn't cover a decision, keep the current behaviour.

### R1 · Structure: tabs, Home, Body, Train
M · depends on: V1 · skills: `impeccable` (critique/polish), `run`
Do:
1. `components/BottomTabs.tsx`: Home · Food · Body · Sleep · Train. Profile becomes a round button in the Home header. `/templates` and `/history` stay as routes.
2. `components/ui/PageHeader.tsx`: caption over title with the round + (05 §9.2).
3. Home per 05 §9.3: Today strip (three tiles tapping into the log sheets), verdict, Start workout, insight, Signals.
4. Body per 05 §9.5: header with the goal caption, verdict, trend hero, chart with range pills and legend, goal-progress waterfall, lifts, waist, entries by month. The energy card leaves this page.
5. `/train`: Start workout hero, latest routines, "N workouts · last 7 days", volume bars, recent workouts feed.
Acceptance:
- [ ] Every log action is reachable in one tap from Home and from its tab.
- [ ] The Body page has one hero number and one chart.
- [ ] Screenshots: Home, Body, Train (empty and seeded).

### R2 · Food tab, logger and energy page
L · depends on: R1 · skills: `impeccable`, `dataviz`, `run`
Do: 05 §9.4 in full. New files under `app/food/`, `components/food/`, `lib/physique/food/` (pure helpers: day totals by hour, week totals, 30-day energy balance series, hourly go-tos). The quick-add sheet from U2a is replaced by the logger sheet. `/food/energy` is the expenditure page.
Acceptance:
- [ ] Re-logging a recent food is 2 taps; quick add is open → kcal → Quick add.
- [ ] The week strip, carousel and timeline render seeded data at 390 px without horizontal page scroll.
- [ ] The energy page shows the ± band, range pills, the changes table and the targets history.
- [ ] Screenshots: Food (empty, seeded), logger tabs, energy page.

### R3 · Sleep tab
M · depends on: R1 · skills: `impeccable`, `dataviz`, `run`
Do: 05 §9.6 in full. New files under `app/sleep/`, `components/sleep/`, `lib/physique/sleepView.ts` (pure: contributors, consistency, planner). Sleep goal setting stored on the profile (`sleepGoalH`, clamped 7–9).
Acceptance:
- [ ] Contributors never show a number as a score; words only.
- [ ] The planner's lights-out time follows the wake time and goal.
- [ ] Screenshots: Sleep (empty, 3 nights, 14 nights).

### R4 · Logging polish
S · depends on: R2, R3
Do: 05 §9.8: weight sheet with date dropdown, delete and optional body fat; quick-add macro-sum hint and Edit day; sleep sheet goal; every sheet on the NumberPad.
Acceptance:
- [ ] Tap counts: weigh-in 2, sleep 2, recent food 2, quick add 3 (plus digits).

### R5 · Workout logger polish (Hevy)
M · depends on: R1 · touches `app/workout/page.tsx` (sacred: small, serial edits)
Do: PREVIOUS column with last session's set, completed-row tint, rest timer bar with −15 / +15 / Skip, plate calculator sheet. No change to data shapes.
Acceptance:
- [ ] Logging a set is still one tap per set; characterisation of stored workouts unchanged.

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
- Move the assistant and memory-extraction routes to the model you choose (decision D3 in the README); the constants already live in `lib/ai/models.ts` (F3).
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
