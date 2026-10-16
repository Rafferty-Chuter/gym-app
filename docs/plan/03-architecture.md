# 03 — Architecture

The technical decisions, module boundaries and data model. Research: `research/D-architecture-tooling.md` (route, backend, food, compliance) and `research/E-codebase-audit.md` (the current code).

---

## 1. Decisions

| # | Decision | Chosen | When | Why |
|---|---|---|---|---|
| A1 | App platform | **Keep the Next.js web app**, used from the iPhone Home Screen. Add a Capacitor shell later. | now / M7 | It reuses 100% of the existing UI. A native app is only needed when testers arrive. |
| A2 | Apple Health data (sleep, HRV, RHR, scale weight, steps) | **Health Auto Export** iOS app (Premium, £6.99/yr) → `POST /api/ingest/hae`. Apple Shortcut as a manual "Sync now" backup. | M3 | Gets Apple Watch sleep into our database in about 2 days with no native build. Capacitor + `@capgo/capacitor-health` replaces it at M7. |
| A3 | Backend and accounts | **Supabase, London (`eu-west-2`)**: Postgres + RLS + email-OTP auth. API routes stay on Vercel, pinned to `lhr1`. | M3 | The webhook can't write into browser storage. Supabase is portable Postgres with a UK region and an official Claude plugin. |
| A4 | Local storage | **M1:** localStorage behind a repository seam (`lib/storage`). **M3:** IndexedDB (Dexie) + an outbox that syncs to Supabase. | M1 → M3 | The seam makes the move mechanical, and logging stays offline-first (gyms have bad signal). |
| A5 | Food data | **M1:** quick add, saved foods, and a Claude text estimate (labelled as an estimate). **M4:** CoFID (UK) + USDA imported into Postgres; Open Food Facts for barcodes; Claude parses items + grams and the database supplies the macros. | M1 → M4 | LLM-only macro estimates have ~35% median error (research D §4.2). Grounding fixes that. |
| A6 | AI models | One constants file, `lib/ai/models.ts`. New endpoints use `claude-opus-5-5` with structured outputs (`output_config.format` / `client.messages.parse`; supported by the installed `@anthropic-ai/sdk` 0.90). The existing assistant stays on `claude-sonnet-4-6` until ticket F5 migrates it. | M1 / M2 | Per the `claude-api` skill, Opus 5.5 is the default. **Cost is your call:** high-volume food parsing could use `claude-sonnet-5-5` or `claude-haiku-5-5` (decision D3 in README). |
| A7 | The engine runs on both client and server | The client computes for the UI. The server **recomputes** from a bounded raw payload for the assistant and never trusts client verdicts. In M3+, the server reads the database instead. | M1 | Matches the existing pattern (`formatUserContextBlock`) and the audit's recommendation. |
| A8 | Hosting | Vercel (existing), functions pinned to `lhr1`. | M3 | UK data residency for health data. |

---

## 2. Module map (new code)

```
lib/
  ai/models.ts                  model id constants (F5 moves the existing hard-coded ids here)
  stats.ts                      olsSlope(x, y) → {slope, se}, ewma, median, mean, stdev, winsorize   (pure)
  dates.ts                      localDateKey(date, tz), dayDiff, dateRange, weekday                 (pure)
  units.ts                      kg↔lb, cm↔in, formatWeight/formatEnergy; one KG_PER_LB constant      (pure)
  storage/
    keys.ts                     registry: {key, scope, version, includeInBackup, owner}; drives devDataTransfer
    kv.ts                       safe JSON get/set/remove, SSR guard, change events, cross-tab bridge
    useStored.ts                useSyncExternalStore hook (replaces setState-in-effect providers over time)
    repo.ts                     createRepo<T extends {id}>(key) → async list/get/upsert/remove/subscribe
  physique/
    types.ts                    entities from 02-engine-spec §1.1 + PhysiqueAnalysis
    repos.ts                    weighIns, foodEntries, savedFoods, dayFlags, sleepNights, waist, goal, profile
    weight.ts                   interpolation, EMA trend, OLS rate + SE, phase mask, sanity check
    intake.ts                   day status, partial suggestion, intake means, adherence, macro averages
    expenditure.ts              initial estimate, daily pipeline, maturity state
    targets.ts                  rate bands, training status, weekly target, macros, floors
    strength.ts                 e1RM_adj, main lifts, STR rules (reads StoredWorkout[])
    sleep.ts                    night normalisation, status, debt, SLEEP rules; M3: recovery baselines
    judge.ts                    buildPhysiqueAnalysis(input, {now}) → PhysiqueAnalysis (02 §8)
    checkIn.ts                  buildCheckInPlan(...) (02 §9)
    status.ts                   → {state, status} for the home tile (lib/signalStatus.ts contract)
    assistantBlock.ts           formatPhysiqueContextBlock(analysis) → compact text (≤600 tokens)
    payload.ts                  buildPhysiquePayload(repos, now) → bounded raw data for /api/assistant (zod schema shared)
    evidence.ts                 evidence ids → {title, citation, url} (from research F's reference list)
    fixtures.ts                 seeded synthetic scenario generator (tests + dev seed page)
    __tests__/                  one test file per module
  ui/
    status.ts                   STATE_COLOR + status icons (extracted from app/page.tsx and app/signal/[key]/page.tsx)
components/
  charts/TimeSeriesChart.tsx    time-based x axis, raw dots + trend line + optional band, gaps, tap tooltip
  ui/Sheet.tsx                  bottom sheet
  ui/NumberPad.tsx              custom numeric keypad (MacroFactor-style speed)
  physique/*                    WeightSheet, SleepSheet, FoodSheet, CheckInStepper, VerdictCard, TargetsCard, TodayStrip
app/
  body/page.tsx                 the Body tab
  body/goal/page.tsx            goal setup
  body/check-in/page.tsx        weekly check-in stepper
  body/food/page.tsx            day food log (timeline)
  dev/seed-physique/page.tsx    seeds a realistic 8-week dataset for UI checks (dev only)
  api/food/parse/route.ts       text → items + estimated macros (M1); M4 grounds them in the food database
```

**Ownership rule:** new code goes in new files. Changes to the hotspots (`app/page.tsx`, `app/assistant/page.tsx`, `app/api/assistant/route.ts`, `app/signal/[key]/page.tsx`, `app/workout/page.tsx`) are small, serial, and done in their own tickets.

---

## 3. Data model

### 3.1 M1 (local, browser)

The entities are listed in `02-engine-spec.md` §1.1. Storage keys (all registered in `lib/storage/keys.ts` and included in backup):

| Key | Shape |
|---|---|
| `physique.v1.weighIns` | `WeighIn[]` |
| `physique.v1.foodEntries` | `FoodEntry[]` |
| `physique.v1.savedFoods` | `SavedFood[]` (`id, label, kcal, proteinG, carbsG, fatG, defaultServing, lastUsedAt, useCount`) |
| `physique.v1.dayFlags` | `Record<date, DayFlags>` |
| `physique.v1.sleepNights` | `SleepNight[]` |
| `physique.v1.waist` | `WaistEntry[]` |
| `physique.v1.goal` | `PhysiqueGoal \| null` (plus `goalHistory: PhysiqueGoal[]`) |
| `physique.v1.profile` | `PhysiqueProfile` |
| `physique.v1.program` | current targets + history of accepted check-ins |

**Budget:** around 100 bytes per food entry × 10 a day × 365 days ≈ 365 KB a year. That fits localStorage's ~5 MB until M3 moves storage to IndexedDB.

**Records:** every record has `id` (uuid), `date`, `loggedAt` (ISO), `source` and `schemaVersion: 1`. Units are canonical. **Don't** reuse the workout-history pattern of rewriting stored values when the display unit changes.

**Profile overlap:** `OnboardingProfile` already holds sex, age, height, bodyweight and units. `PhysiqueProfile` reads those fields from it rather than duplicating them. `OnboardingProfile.bodyweightKg` is shown as derived (the latest trend weight) once weigh-ins exist.

### 3.2 M3 (Supabase)

Follow research D §3.5. Every table has: a client-generated uuid `id`, `user_id` with RLS `user_id = auth.uid()`, `created_at`, `updated_at`, `deleted_at`. Tables:
- `profiles`, `goals`, `programs`, `checkins`
- `weigh_ins`, `food_entries`, `saved_foods`, `day_flags`, `sleep_nights`, `waist_entries`
- `workout_sessions` (`payload jsonb` at first)
- `health_samples` (unique on `user_id, metric, start_at, end_at, source_name`), `health_ingest_raw`, `ingest_tokens`
- `legacy_snapshots`, `engine_snapshots` (optional cache)

Food (M4): `foods_cofid`, `foods_usda`, `off_products` (kept separate for ODbL), with a `pg_trgm` search index.

---

## 4. Assistant integration

### 4.1 M1: minimal, before the route split

1. **Contract.** Add `physique?: PhysiquePayload` to `AssistantBody`. Validate it with the zod schema from `lib/physique/payload.ts`, with these caps:
   - 84 days of weigh-ins;
   - 42 days of daily intake **totals** (not individual food entries);
   - 28 nights of sleep;
   - the goal and profile.
2. **Server compute.** Call `buildPhysiqueAnalysis(payload + coachingContext.recentWorkouts, {now})`. `formatPhysiqueContextBlock` produces a block that is pushed **after USER CONTEXT and before USER MEMORY**, with **no new `cache_control`**: it rides the existing last-system-block breakpoint (`route.ts:2841-2848`).
3. **Static prompt.** Add a `PHYSIQUE CONTEXT INTEGRATION` block to `STATIC_COACH_SYSTEM_PROMPT`, with no per-user interpolation (so the global cache still holds). It covers:
   - cite only numbers that appear in the block;
   - the verdict is decided, so explain it and don't re-judge it;
   - lead with the verdict, then the 2 strongest numbers, then 1 action;
   - state windows and n;
   - the must-not-claim list (02 §10);
   - name confounders before blaming the plan.
4. **Routing.**
   - Add a kind `physique_progress` to `lib/assistantQuestionRouting.ts` **before** the projection and timeline rules. It matches bodyweight, cut, bulk, calories, macros, deficit, surplus, sleep, "how long until X kg", "is it working".
   - Exempt it from `computeStrictIntentLock`'s `\d{2,3} kg` timeline override.
   - Map the new kind in `mapQuestionKindToLegacyIntent` and `analysisPreferredKinds`.
   - Give it a task template that answers from the physique block.
5. **Cold start.** `hasWorkoutData` (`route.ts:3953`) and `buildLoggedTrainingPreamble` treat physique data as "has data".
6. **Client.** `app/assistant/page.tsx` sends `buildPhysiquePayload(...)`. The home insight card (`app/page.tsx:408`) shows the physique verdict when its state is `watch` or `attention`.
7. **Evals.** Add 5 cases to `evals/cases.json` with full physique fixtures:
   - cut on track;
   - LOSS-1;
   - SLEEP-1;
   - "how long until 90 kg" (must not mention bench);
   - a cold-start physique-only user.

### 4.2 M2: after the route split (ticket F4)

The physique block becomes one entry in the context-block registry (research E §2.8). The task template becomes one entry in the `Record<Kind, TaskTemplate>` map.

---

## 5. AI endpoints

Every paid route:
- validates its body with zod and enforces size caps;
- checks the daily cap **after** validation;
- logs cost with `logAssistantCallCost`;
- returns generic error bodies;
- never logs raw health values.

| Route | Milestone | Model | Input → output |
|---|---|---|---|
| `POST /api/food/parse` | M1 | `FOOD_PARSE_MODEL` (default `claude-opus-5-5`) | Text such as "200g chicken breast, 150g cooked rice, tbsp olive oil" → structured output `{items: [{label, grams, kcal, proteinG, carbsG, fatG, confidence: "high" \| "medium" \| "low", assumptions}]}`. The UI shows editable rows labelled "estimate". |
| `POST /api/food/parse` (v2) | M4 | same | Claude returns `{items: [{query, grams, confidence}]}` only. The server matches each item to CoFID/USDA/OFF/saved foods and computes macros from the database. Unmatched items fall back to the v1 estimate, flagged. |
| `POST /api/food/photo` | M4 | same, with vision | Photo → items + grams → database grounding, as above. |
| `POST /api/assistant` | existing | `ASSISTANT_MODEL` | + physique block (§4). |

**Model API notes** (from the `claude-api` skill; re-read it before coding any AI ticket):
- Opus 5.5 has thinking always on, controlled by `output_config.effort` (default `medium`). Use `low` for parsing.
- No assistant prefill.
- Forced `tool_choice` returns a 400. Use structured outputs.
- Include server-side `fallbacks` (`betas: ["server-side-fallback-2026-07-01"]`, `fallbacks: "default"`) and handle `stop_reason: "refusal"`.

---

## 6. Health ingest (M3)

Follow research D §2.1:
- **Endpoint:** `POST /api/ingest/hae`, with `runtime = "nodejs"` and `preferredRegion = "lhr1"`.
- **Auth:** a bearer token generated once and stored as SHA-256 in `ingest_tokens`, compared in constant time.
- **Handling:**
  1. Store the raw payload.
  2. Map metric names defensively (both `weight_body_mass` and `weight_&_body_mass`).
  3. Upsert into `health_samples` idempotently.
  4. Derive `sleep_nights` on the wake date.
  5. Return 200 fast, and do the heavy work in `after()`.
- **HAE configuration** (which the user does on the phone) is written up in ticket H3.
- **Fallbacks:** a one-off history backfill via a Manual Export date range. An Apple Shortcut endpoint (`/api/ingest/shortcut`) needs a 30-minute on-device spike first.

---

## 7. Security and privacy

**M1 (founder only):**
- No accounts. Data stays in the browser.
- The AI routes are unauthenticated, as they are today. Fix the cap-bypass issues in F3 so new routes can't be farmed.
- **Risk:** Safari deletes site storage after 7 days without a visit, unless the app runs from the Home Screen. **Use it from the Home Screen** and export a backup weekly (H1).

**M3 onwards:**
- Supabase RLS on every table.
- API routes verify the Supabase JWT, and query with the user's token.
- The service role is used only in the ingest webhook.

**Before testers (M7)** — research D §5:
- explicit health-data consent and third-party-AI consent (UK GDPR Art 9(2)(a); App Store 5.1.2(i));
- privacy policy;
- DPIA;
- ICO fee;
- wellness-only claims;
- a calorie floor and a screening question;
- data export and delete account.

Send the LLM **derived summaries**, not raw sample streams.

---

## 8. Path to native (M7)

Capacitor 8 with a static export (research D §2.2 mode B). The changes needed:
- `generateStaticParams` for `/signal/[key]`;
- `/templates/[templateId]` becomes `?id=`;
- an API base URL with a bearer token instead of cookies;
- API routes excluded from the export build;
- `images.unoptimized`.

The HealthKit plugin `@capgo/capacitor-health` 8.x syncs in the foreground on launch and resume into the **same** ingest tables. Barcode scanning moves to `@capacitor-mlkit/barcode-scanning`.

iOS builds need Xcode. From cloud sessions, use a cloud macOS builder (Capawesome Cloud or a GitHub Actions macOS runner).
