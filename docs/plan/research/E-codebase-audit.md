# E — Codebase audit: gym-app → physique coach

Snapshot: branch `claude/admiring-ptolemy-mz6jwu` @ `9715e33` (2026-06-08). Next 16.2.4 (app router), React 19.2.3, TS 5.9.3, Node 22.22, Tailwind 4, `@anthropic-ai/sdk` 0.90.0, `openai` 6.x. 39.2k lines of TS/TSX in `app/ components/ lib/ utils/`. No files were modified during this audit (eslint JSON output written to scratchpad only).

Verified baselines: `npx tsc --noEmit` passes (given). `npx eslint` reports 41 errors and 130 warnings; 97 of the warnings come from the vendored `.agents/skills/impeccable` scripts. `npx tsx scripts/test-volume-rules.ts` passes 10/10. `evals/results.json` was last run on 2026-05-01 and passed 14/14.

---

## 0. Top findings (read this first)

1. **`app/api/assistant/route.ts` is the bottleneck.** It is 4,150 lines in one file. `getAssistantReply` alone runs to 1,340 lines and takes 33 positional args (`route.ts:1594-1632`, `4091-4131`). Questions are routed by 3 regex layers plus a mode detector. All 4 Anthropic prompt-cache breakpoints are already used. **Split it before adding physique logic** (§2.7).
2. **The server and client analyse different data.** The client sends `coachStructuredOutput` built from *all* workouts (`app/assistant/page.tsx:820`). The server's `USER CONTEXT` block re-runs `buildCoachStructuredAnalysis` on `coachingContext.recentWorkouts`, which holds only the 10 newest workouts (`lib/coachingContext.ts:107-109`, `route.ts:1519`). The server also uses a default profile, because `getStoredUserProfile` returns its fallback when there is no `window` (`lib/userProfile.ts:192`). As a result the model sees "Logged workouts available: 10" and can get signals that conflict with the client's.
3. **Physique questions will be misrouted, and physique-only users will be treated as cold-start.** For example, "how long until I hit 90 kg" becomes `timeline_readiness` → `projection_estimate`, which uses a bench-centric prompt (`route.ts:577-579`, `2271-2311`). Separately, `hasWorkoutData` counts workouts only (`route.ts:3953-3955`). A user with weigh-ins and food logs but no workouts gets the "you cannot personalise" preamble (`route.ts:989-1009`).
4. **There is no storage layer.** There are 21 localStorage keys. `workoutHistory` has 5 writers and 8 readers across 9 files, and the workout schema is copied 4 times. Records have no stable IDs: they are addressed by array index and `id` is regenerated on load (`lib/workout-store.tsx:60`). Weights are strings in the *display* unit, and switching units rewrites history with rounding loss (`lib/unit-preference.tsx:44-97`).
5. **The signals engine is a good pattern to copy, but it is not pure.** `liftTrend` / `plateauSignal` / `signalStatus` are clean, canonical, and constant-driven. However, `buildCoachStructuredAnalysis` reads localStorage through `getStoredUserProfile`, and 4 modules call `Date.now()` internally. A physique engine should be pure, with `now` injected.
6. **There is no test runner, no CI, no `CLAUDE.md`, and no `.env.example`.** The design decision docs referenced in comments (`Decisions/…`) live in an external Obsidian vault that agents cannot read.
7. **The paid API routes are unauthenticated and the cost guard is weak.**
   - The daily cap is in-memory and per instance.
   - Omitting `client_id` bypasses it.
   - The cap is checked before the body is validated.
   - `extract-memory` and `refine-target` have no cap at all, and `refine-target` is not cost-logged.
   - `/api/coach-analysis` has no caller but is still deployed and spends OpenAI tokens.
8. **Bugs found in passing:**
   - Editing a workout in History silently drops `rir` and `exerciseId` from every set (`app/history/page.tsx:36-41,145-150`).
   - `components/LiftProgressionSection.tsx` calls hooks conditionally (early `return` at :180, hooks at :225-226).
   - The Progress detail list uses its own trend classifier, which contradicts the canonical `liftTrend` (`app/signal/[key]/page.tsx:802-819`).
   - The non-streaming JSON path (the one the evals use) does not strip `<datasources>` (`route.ts:4139-4140`).
9. **Dead and legacy weight:**
   - 19 files (1.7k lines) are unreachable from any route.
   - 11 more files (2.0k lines) are reachable only through a hard-disabled branch (`enterSingleSessionStructuredBuild = false`, `route.ts:3807`).
   - 5 routes are orphaned (`/coach`, `/coach/review`, `/volume`, `/progress`, `/analysis`), linked only from the dead `components/Navbar.tsx`.
10. **Merge-conflict hotspots** (lines; commit count since April): `app/page.tsx` (985; 11), `app/signal/[key]/page.tsx` (1,393; 9), `app/assistant/page.tsx` (1,403; 8), `route.ts` (4,150; 8). All of them sit on the physique integration path.

---

## 1. Architecture map

### 1.1 Pages (`app/`)
Every page is a client component. 15 have `"use client"`; the other 2 are re-exports. Data is read from localStorage inside effects.

| Route | File (lines) | Status | Reached from |
|---|---|---|---|
| `/` | `app/page.tsx` (985) | live | tab. Order: Start CTA → assistant insight card → 3 Signal tiles (`:963-980`, `grid-cols-3`) |
| `/workout/start` | `app/workout/start/page.tsx` (207) | live | home CTA |
| `/workout` | `app/workout/page.tsx` (2,374) | live | logging screen (the "sacred" path) |
| `/assistant` | `app/assistant/page.tsx` (1,403) | live | home card, signal pages; SSE chat |
| `/signal/[key]` | `app/signal/[key]/page.tsx` (1,393) | live | home tiles; `key ∈ plateau\|volume\|progress` |
| `/history` | `app/history/page.tsx` (479) | live | tab |
| `/templates`, `/templates/new`, `/templates/[templateId]` | 160 / 8 / 25 + `components/TemplateEditorForm.tsx` (524) | live | tab |
| `/profile` | `app/profile/page.tsx` (173) + `app/components/OnboardingProfileFields.tsx` (356) | live | tab |
| `/profile/import` | `app/profile/import/page.tsx` (248) | live | profile (Hevy/Strong CSV import) |
| `/dev/data-transfer` | `app/dev/data-transfer/*` (137) | live | profile ("Data tools"; JSON export/import of keys) |
| `/coach`, `/coach/review` | 299 / 385 | **orphan** | dead Navbar only. Note: `/coach` is the *only* UI that sets `priorityGoal` |
| `/volume` | 311 | **orphan** | dead Navbar only |
| `/progress` | 62 (+`LiftProgressionSection` 525) | **orphan** | dead Navbar only |
| `/analysis` | 2 (re-export of `/coach`) | **orphan** | none |

### 1.2 API routes
None of these routes has authentication, rate limiting, or a body-size limit. There is no `middleware.ts`/`proxy.ts`.

| Route | Model | Caller | Daily cap | Cost log | Notes |
|---|---|---|---|---|---|
| `POST /api/assistant` | `claude-sonnet-4-6` (hard-coded `route.ts:2880`) | `app/assistant/page.tsx:853`, `evals/run.ts` | yes, in-memory per `client_id` | yes (`subCall: "chat"`) | SSE when `Accept: text/event-stream`, otherwise JSON |
| `POST /api/assistant/extract-memory` | `claude-sonnet-4-6` (`extract-memory/route.ts:117`) | `app/assistant/page.tsx:1100` | **no check** (records usage only) | yes | conversation size unbounded |
| `POST /api/refine-target` | `gpt-4.1-mini` | `app/workout/page.tsx:763` (one call per exercise each time the exercise list changes) | **no** | **no** | only live OpenAI dependency |
| `POST /api/coach-analysis` | `gpt-4.1-mini` | **none** | no | no | dead but deployed |

### 1.3 `lib/` by responsibility
`lib/` holds 127 files: 89 at the top level, 38 in `trainingKnowledge/`, plus `programmePipeline/`.

| Area | Modules |
|---|---|
| **Workout data/IO** | `trainingAnalysis.ts` (1,701; fan-in 24; `getWorkoutHistory`, canonical `StoredWorkout`), `workout-store.tsx` (context), `activeWorkout.ts` (draft), `templateStorage.ts`, `csvImport.ts`, `exportWorkoutsCsv.ts`, `devDataTransfer.ts`, `userExerciseLibrary.ts`, `completedSets.ts` |
| **Metrics primitives** | `trainingMetrics.ts` (e1RM Epley, best set = heaviest, 7-day window, muscle mapping), `muscleGroupMapper.ts`, `muscleGroupRules.ts`, `exerciseLibrary.ts`, `exerciseMetadataLibrary.ts`, `exerciseProfiles.ts`, `exerciseNameNormalize.ts` |
| **Signals / rules engine** | `liftTrend.ts`, `plateauSignal.ts`, `volumeAnalysis.ts`, `signalStatus.ts`, `coachStructuredAnalysis.ts` (1,080), `trainingDecisions.ts`, `trainingPrescriptions.ts`, `nextSessionAdjustments.ts`, `goalSupportProfiles.ts`, `coachMusclePools.ts`, `muscleAwareWeeklyVolume.ts`, `inferredTrainingProfile.ts` |
| **Evidence** | `evidenceCards.ts` (client catalog), `evidenceMapping.ts`, `hypertrophyEvidenceV1.ts`, `assistantScienceContext.ts` (separate server catalog) |
| **Assistant (client + server)** | `assistantQuestionRouting.ts`, `assistantMode.ts`, `assistantAnswerScope.ts`, `assistantLogAnchors.ts`, `sessionReviewAnchor.ts`, `assistantThreads.ts`, `assistantMemory.ts`, `assistantThreadWorkouts.ts`, `assistantCostLogging.ts`, `assistantDailyCap.ts`, `coachingContext.ts`, `workoutConstructionIntent.ts`, `parseRequestedExerciseConstraints.ts`, `splitParser.ts`, `muscleCoverageBriefForLLM.ts` |
| **Bench-specific** | `benchProjectionPayload.ts` (777), `benchContext.ts`, `bench1rm.ts` |
| **Canned Q&A knowledge** | `trainingKnowledge/*` (38 small rule files; `trainingAnswerSupport.ts` produces deterministic replies) |
| **Profile / prefs** | `onboardingProfile.ts` (canonical), `userProfile.ts` (derived + legacy), `trainingFocus.tsx`, `experienceLevel.tsx`, `priorityGoal.tsx`, `unit-preference.tsx`, `restTimerSettings.ts` |
| **Charts** | `chartScale.ts` (`computeNiceYAxis`) |
| **Dormant (only via disabled branch)** | `assistantSingleSessionGeneration.ts`, `planSingleSessionWorkoutLLM.ts`, `llmPlannedSessionMapper.ts`, `dayQuality.ts`, `prescriptionDefaults.ts`, `muscleSetCounting.ts`, `assistantStructuredWorkoutContract.ts`, `builderStructuralIntent.ts`, `sessionExerciseCountPolicy.ts`, `exerciseCatalogForLLM.ts`, `trainingKnowledge/sessionCoverageRules.ts` |
| **Dead (no importer chain)** | see §5.2 |
| `utils/trainingSummary.ts` | a 4th `StoredWorkout` copy plus its own un-migrated `workoutHistory` reader. Used by the assistant page |

### 1.4 Storage: every key

**localStorage**

| Key | Shape | Writers | Readers | In backup allowlist (`lib/devDataTransfer.ts:5`) |
|---|---|---|---|---|
| `workoutHistory` | `StoredWorkout[]` | `workout-store.tsx:81`, `csvImport.ts:445`, `unit-preference.tsx:66` (unit rewrite), `trainingAnalysis.ts:121` (name migration on read), `devDataTransfer.ts:88` | `trainingAnalysis.ts:103`, `workout-store.tsx:54`, `utils/trainingSummary.ts:37`, `app/workout/page.tsx:92,125`, `app/volume/page.tsx:44`, `csvImport.ts:393`, `unit-preference.tsx:47` | yes |
| `workoutTemplates` | `WorkoutTemplate[]` | `templateStorage.ts:89`, `app/workout/page.tsx:706,734` | `templateStorage.ts:77`, `coachingContext.ts:56`, `app/workout/page.tsx:684,717` | yes |
| `activeWorkout` | `DraftWorkout` | `activeWorkout.ts:63/157`, `unit-preference.tsx:93` | `activeWorkout.ts:41`, `unit-preference.tsx:74` | yes |
| `onboardingProfile` | `OnboardingProfile` | `onboardingProfile.ts:230,248` | `onboardingProfile.ts:220` | yes |
| `userCoachingProfile` | legacy profile (read-only now) | none | `userProfile.ts:205`, `onboardingProfile.ts:151` | yes |
| `weightUnit` | `"kg"\|"lb"` | `unit-preference.tsx:117` | `unit-preference.tsx:15`, `onboardingProfile.ts:204` | yes |
| `trainingFocus` / `experienceLevel` / `priorityGoal` | string enums | respective `lib/*.tsx` providers | same | yes |
| `userExerciseLibrary` | custom exercises | `userExerciseLibrary.ts:186` | `:145` | yes |
| `restTimerNotifySettings` | settings | `restTimerSettings.ts:40` | `:20` | **no** |
| `volumeEnabledOptionalGroups` | `string[]` | `app/volume/page.tsx:72` | `:56` | **no** |
| `assistantThreadsV1` / `assistantActiveThreadIdV1` | thread map / id | `assistantThreads.ts:90,109` | `:77,:99` | yes |
| `assistantUserId` | uuid | created in *two* places: `assistantThreads.ts:56`, `assistantMemory.ts:42` | both | yes |
| `assistantClientId` | uuid (cap accounting) | `app/assistant/page.tsx:430` | `:424` | yes |
| `assistantSelectiveMemoryV1` | `AssistantSelectiveMemoryV1` | `assistantMemory.ts:82` | `:69` | yes |
| `assistantMemory` | `{facts: ExtractedMemoryFact[]}` (USER MEMORY, cap 60) | `assistantMemory.ts:459` | `:419` | **no** (backup loses USER MEMORY) |
| `assistantLastChatDate` | date | `app/assistant/page.tsx:1145` | **never read** | no |
| `assistantUseLongTermMemory` | flag | **never written** | `app/assistant/page.tsx:499` | no |
| `onboardingComplete` | — | none | none | listed (stale) |

**sessionStorage:** `assistantQuickPrompt` and `assistantAutoSend` (home/coach/signal → assistant); `workoutFromTemplate` (templates, workout/start → workout); `workoutSuggestedMuscle` (read and removed in `app/workout/page.tsx:790`, **never set**); `assistantSessionMarkerV1` (`assistantThreads.ts:317,326`). The allowlist wrongly includes `workoutFromTemplate` and `workoutSuggestedMuscle`, which are sessionStorage keys.

**Window events used as a poor-man's store:**
- `workoutHistoryChanged` is dispatched by `workout-store` remove/replace, `csvImport`, and `devDataTransfer`. It is **not** dispatched by `addWorkout` (`workout-store.tsx:106-114`).
- `weightUnitConverted`
- `gym:activeWorkoutChanged`
- `gym:restTimerSettingsChanged`
- `onboardingProfileChanged`
- `userExerciseLibraryUpdated`
- native `storage` (home, workout/start, ActiveWorkoutResumeBar, RestTimerBanner)

### 1.5 Providers
`app/providers.tsx`: `UnitProvider → TrainingFocusProvider → ExperienceLevelProvider → PriorityGoalProvider → WorkoutStoreProvider`. All five follow the same pattern: default state, then `useEffect(() => setState(readLocalStorage()))` with a `mounted` gate. This pattern accounts for most of the 14 `react-hooks/set-state-in-effect` lint errors. `app/page.tsx:515-543` and `app/signal/[key]/page.tsx:115-122` already use `useSyncExternalStore` (`useIsHydrated`, `useActiveWorkoutFlag`), which is the pattern to standardise on. `app/layout.tsx` mounts the global `RestTimerBanner`, `ActiveWorkoutResumeBar` and `BottomTabs`.

### 1.6 Core data types

| Type | Defined at | Notes |
|---|---|---|
| `StoredWorkout` | `lib/trainingAnalysis.ts:38` (canonical); duplicates in `lib/workout-store.tsx:30` (private), `app/workout/page.tsx:60`, `utils/trainingSummary.ts:5` (no `rir`/`restSec`) | `{completedAt ISO, name?, durationSec?, exercises:[{exerciseId?, name, restSec?, sets:[{weight:string, reps:string, notes?, rir?}]}]}`. No id, no unit field, no schema version |
| `CompletedWorkout` | `lib/workout-store.tsx:15` | `StoredWorkout` + `id` (regenerated `Date(completedAt)+index` on load) + totals |
| `DraftWorkout` / `DraftExercise` | `lib/activeWorkout.ts:10-35` | sets have `done?`; only `done===true` sets persist (P1.9) |
| `WorkoutTemplate` | `lib/templateStorage.ts:14` and a duplicate in `lib/coachingContext.ts:15` | |
| `OnboardingProfile` | `lib/onboardingProfile.ts:36` | canonical profile: `units`, `sex`, `age`, `bodyweightKg` (single value, required for "complete"), `heightCm`, `yearsTrainingBand`, `primaryGoal` (`hypertrophy\|strength\|both\|general fitness`), `daysPerWeek`, `sessionLengthMin`, `equipment[]`, `constraintsText`, `trainingPrioritiesText`, `rirFamiliarity`, `completedAt`. Rendered as the cached USER PROFILE block (`formatUserProfileBlock`, `:280`) |
| `UserProfile` | `lib/userProfile.ts:34` | derived from onboarding, falls back to legacy key; `lowerBodyPriority` inferred from text/memory |
| `TrainingFocus` / `ExperienceLevel` / `PriorityGoal` | `lib/trainingFocus.tsx`, `lib/experienceLevel.tsx`, `lib/priorityGoal.tsx:13` | `PriorityGoal` is 7 lift/muscle strings, matched by string/regex in `coachStructuredAnalysis.ts:108-142`, `benchProjectionPayload.ts:104-112`, `route.ts:83-91`. It is settable only on the orphan `/coach`, so it is effectively stuck at `"Improve Overall Strength"`, which `inferBenchFromPriorityGoal` treats as a bench goal |
| `AssistantThread` / `AssistantThreadMessage` | `lib/assistantThreads.ts:3-34` | session-scoped chat |
| `AssistantSelectiveMemoryV1` | `lib/assistantMemory.ts:12` | heuristic preference memory |
| `ExtractedMemoryFact` | `lib/assistantMemory.ts:381` | `{category: preferences\|goals\|findings\|facts, fact, timestamp}` |
| `CoachingContext` | `lib/coachingContext.ts:26` | client-built: profile, 10 recent workouts, templates, brief, inferred, bench |
| `TrainingSignal` / `TrainingInteraction` | `lib/trainingAnalysis.ts:444,461` | id/category/status/severity/confidence/goalRelevance/priorityScore/evidence/recommendationIds |
| `CoachStructuredAnalysis` | `lib/coachStructuredAnalysis.ts:49` | keyFocus*, whatsGoingWell, volumeBalance, actionableSuggestions, evidence ids, nextSessionAdjustmentPlan |
| `LiftTrendStatus` | `lib/liftTrend.ts:33` | canonical per-lift trend |
| `AssistantBody` / `AssistantResponse` | `route.ts:127-310` | ~35 optional client-computed fields; no runtime validation |

---

## 2. Assistant pipeline (`app/api/assistant/route.ts`, 4,150 lines)

### 2.1 Section map

| Lines | Content |
|---|---|
| 1-100 | imports, enum constants, `PUSH_DAY_HYPERTROPHY_PROBE` debug probe |
| 101-311 | `AssistantCoachStructuredOutput`, `AssistantEvidenceCard`, `AssistantBody`, `AssistantResponse` |
| 312-482 | message parsing helpers (context, session type, equipment) — mostly used only by the dead branch |
| 483-647 | `computeStrictIntentLock` / `applyStrictIntentLock` (regex override of the classifier) |
| 648-742 | `renderBuiltWorkoutReply`, `splitTypeFromMessage`, custom-day detection (dormant / log-only) |
| 743-892 | explicit evidence anchors; `tryBuildDeterministicBenchSessionPrescription` |
| 893-1146 | legacy intent classify, coach-output guard, digests, `buildLoggedTrainingPreamble` (982), evidence-card merge, analysis anchors |
| 1147-1481 | static prompt blocks → `STATIC_COACH_SYSTEM_PROMPT` (1415) |
| 1483-1592 | `formatUserContextBlock` (server-side re-run of the rules engine) |
| 1594-2932 | `getAssistantReply`: context strings (1640-1990), **mode/kind task templates (1990-2567)**, memory blocks (2569-2644), bench blocks (2646-2752), subject lock (2754-2782), cache split (2788-2799), system blocks (2814-2848), Anthropic call (2880-2931) |
| 2934-3376 | deterministic reply builders (thread reference, exercise recall, bench projection) |
| 3377-3551 | SSE contract, `respond`, `<datasources>` stream filter, `respondLLMStream` |
| 3553-4150 | `POST`; 3804-3918 is the disabled single-session build (~115 dead lines) |

### 2.2 Request flow (`POST`, 3553)
1. Parse JSON. **Before validation**, check the daily cap: `isOverDailyCap(client_id)` (3591). This returns a canned reply and does not call the model.
2. Derive `templatesSummary` from `coachingContext.templates` (3610-3643). Filter `userMemory`, guard `coachStructuredOutput`, and filter evidence cards to referenced ids (3646-3662).
3. Validate `message` and `trainingSummary` (3664-3675). These are the only validated fields.
4. Classify the question:
   - `classifyAssistantQuestionKind` (`lib/assistantQuestionRouting.ts:106`, first match wins, ~25 rules).
   - Apply `computeStrictIntentLock` as a regex override (3699-3700).
   - Select server evidence cards by kind (3701).
5. Run the **deterministic short-circuits** (3726-3769, §2.3). Skipped when the user explicitly asks for construction. A hit is returned via `respond()` with no LLM call and no cost log.
6. (Dead) single-session structured build (3807-3918).
7. Map to legacy intent (3923). Choose the mode with `detectAssistantModeWithReason` (`lib/assistantMode.ts:22`), then apply overrides: `hardAnalysisPhrases` (3957-3971), forced advisory when there are no workouts (3983-3989), and `analysisPreferredKinds` (3990-4007).
8. Build `loggedDataPreamble`, either cold-start or the logged digest of the 8 newest workouts (4030-4041).
9. Call `getAssistantReply(...33 positional args)`, streaming via `respondLLMStream` or returning JSON (4133-4140).
10. Errors: `err.message` is echoed to the client. The status is 400 unless the message contains "OPENAI" or "Empty response", which is legacy mapping (4141-4149).

### 2.3 Deterministic short-circuits (evaluated in order, 3726-3766)

| # | Function | Gate | Source |
|---|---|---|---|
| 1 | `tryAnswerFromTrainingKnowledge` | regex canned Q&A | `lib/trainingKnowledge/trainingAnswerSupport.ts:72` |
| 2 | `tryBuildDeterministicBenchSessionPrescription` | kind ∈ coaching_recommendation/projection_estimate/exercise_question **and** /bench/ | `route.ts:834` |
| 3 | `tryBuildDeterministicThreadReferenceReply` | kind = memory_continuity | `route.ts:2974` |
| 4 | `tryBuildDeterministicExerciseReply` | kind = exact_factual_recall + `activeExerciseLastSession` | `route.ts:3084` |
| 5 | `tryBuildDeterministicBenchProjectionReply` | kind ∈ projection_estimate/progression_readiness_path + benchish + `benchProjection` | `route.ts:3117` |

### 2.4 Prompt assembly and caching (2788-2931)
- `system` blocks:
  1. `STATIC_COACH_SYSTEM_PROMPT` with breakpoint (2830).
  2. `USER PROFILE` (`formatUserProfileBlock`) with breakpoint (2838), only if a profile exists.
  3. `USER CONTEXT` (`formatUserContextBlock`).
  4. `USER MEMORY` (`formatMemoryBlock`) if non-empty. The **last system block gets a breakpoint** (2848).
- `messages`: one user turn (conversation history is **not** sent as messages; it is embedded as text):
  - `userStablePrefix` = logged-data preamble + assistant-built sessions, with a breakpoint (2858).
  - `userVolatileSuffix` = subject/bench/anchor block + the mode task prompt + memory/recent chat (2798-2799).
- **4/4 ephemeral breakpoints are in use** when a profile exists. Any new block must ride an existing breakpoint.
- Model `claude-sonnet-4-6`, `max_tokens: 2048`, no temperature, no tools.
- Model id hard-coded in 4 places: `route.ts:2880`, `extract-memory/route.ts:117`, `planSingleSessionWorkoutLLM.ts:10`, `evals/run.ts:22`.
- `<datasources>` trailer: the static prompt asks for it (1435-1450). It is stripped in the stream path (`createDataSourcesFilter`, 3455) and **not stripped in the JSON path** (4139-4140).

### 2.5 Cost logging and daily cap
- `lib/assistantCostLogging.ts`: one `[assistant-cost]` JSON log line per call. Sonnet USD rates are hard-coded (`:8-13`) with fixed FX 0.79. `recordTokenUsage(client_id, input + cache_write)`.
- `lib/assistantDailyCap.ts`: `DAILY_INPUT_TOKEN_CAP = 100_000`. It is an in-memory `Map`, so it resets on cold start and is per-instance (on serverless it is effectively not enforced). `client_id` comes from the client, and leaving it out disables the cap (`:43-45`). The evals send no `client_id`.

### 2.6 Evals harness (`evals/`)
- `run.ts` POSTs each case body to `COACH_URL` (default localhost:3000) in **non-stream** mode. It scores with Sonnet against a natural-language rubric, writes `results.json`, and exits 1 on any failure. Run with `npm run eval`; it needs the dev server running and `ANTHROPIC_API_KEY` (read from `.env.local`).
- `cases.json` has 14 cases: cold-start, evidence quality, construction self-gating. **All bodies send only `message` and `trainingSummary`** (plus focus/level/unit/goal). None sends `coachingContext`, so `USER CONTEXT` always says 0 workouts while the preamble says e.g. 32: the evals run against contradictory context and never exercise the rules-engine path.
- There is no routing/unit test of the classifier, which is where physique mis-routing would show up.

### 2.7 Where a "physique context" block plugs in

| Step | Location | What |
|---|---|---|
| Contract | `AssistantBody` (`route.ts:127-277`) | `physique?: PhysiqueRequestPayload`: **bounded raw daily summaries** (e.g. last 84 days of weigh-ins, kcal/protein totals, sleep) plus the active goal. Validate with zod and enforce size caps |
| Compute | new `lib/physique/engine.ts`, called server-side | Mirror `formatUserContextBlock`: the server re-derives the verdict from raw data (do not trust client verdicts). Pure, with `now` injected |
| System block | after `USER CONTEXT` push (`route.ts:2841-2847`) | `formatPhysiqueContextBlock(analysis)`, **no new `cache_control`**: it is covered by the "last system block" breakpoint at 2848. Keep it compact (~300-600 tokens). The cap counts uncached input + cache writes, so weigh-in-driven invalidation costs ≈ one cache write per day |
| Static instructions | `STATIC_COACH_SYSTEM_PROMPT` (1415-1481) | Add a `PHYSIQUE CONTEXT INTEGRATION` block modelled on `USER_CONTEXT_USAGE_BLOCK` (1400). It must contain **no per-user interpolation**, or the global cache breaks |
| Routing | `lib/assistantQuestionRouting.ts:106` (insert before the projection/timeline rules, ~:200-215), `computeStrictIntentLock` (`route.ts:516-613`; `timelineLike` + `\d{2,3} kg` currently forces `timeline_readiness`), `mapQuestionKindToLegacyIntent` (`:422`), `analysisPreferredKinds` (`route.ts:3990`) | New kinds such as `physique_progress`, `nutrition_question`, `bodyweight_recall` |
| Task prompt | mode switch `route.ts:2089-2567` | a `physique_progress` branch, or after the split a `Record<Kind, TaskTemplate>` entry |
| Evidence scope | `lib/assistantAnswerScope.ts:80`, `lib/assistantScienceContext.ts:63,115` | per-kind scope plus physique evidence cards |
| Cold start | `hasWorkoutData` (`route.ts:3953`), `buildLoggedTrainingPreamble` (982), forced advisory (3983) | count physique data as "has data" |
| Deterministic (optional) | chain at 3726-3766 | e.g. "what did I weigh last Monday" → exact recall without the LLM |
| Client | `app/assistant/page.tsx:853-891` | add the payload; home insight `app/page.tsx:408` |
| Memory | `extract-memory/route.ts:26-54` | exclude anything derivable from logged nutrition/sleep; allow diet preferences |
| Data-sources labels | `route.ts:1437-1444` | add physique label examples |
| Evals | `evals/cases.json` | physique cases with full fixtures plus routing assertions |

### 2.8 Split `route.ts` before adding anything
Suggested layout (server-only, e.g. `lib/assistant/`):

| New module | Takes from `route.ts` |
|---|---|
| `contract.ts` (types + zod schema + size limits) | 101-311 |
| `routing/strictIntentLock.ts` (or merge into `assistantQuestionRouting.ts`) | 483-647 |
| `deterministic/{benchSession,threadReference,exerciseRecall,benchProjection}.ts` | 743-892, 2949-3376 |
| `prompts/static.ts` | 1147-1481 |
| `prompts/tasks.ts` as `Record<AssistantQuestionKind \| Mode, (ctx)=>string>` | 1990-2567 |
| `context/{preamble,userContext,memory,bench,subject}.ts` | 925-1033, 1502-1592, 2569-2786 |
| `context/registry.ts`: blocks declared as `{id, placement: "system"\|"userStable"\|"userVolatile", build(ctx)}` | new. The physique block becomes one registry entry |
| `llm.ts` (Anthropic call, cache layout, cost log, single `ASSISTANT_MODEL`) | 2788-2932 |
| `sse.ts` | 3377-3551 |
| `turnContext.ts`: one `AssistantTurnContext` object replacing 33 positional args | 4091-4131 |
| `route.ts` → thin handler (~150 lines) | 3553-4150 minus the dead block |

Also delete the dead branch 3804-3918 and its helpers: `inferSessionTypeFromContext`, `inferWorkoutBuilderGoal`, `renderBuiltWorkoutReply`, `buildCoachContextSnippetForReview`, `resolveEquipmentForBuilder`, `PUSH_DAY_HYPERTROPHY_PROBE`, `forceDynamicProgrammeDebug`, `plannedDayMuscleCoverageBlock = null` at 1678. Gate the 20 `console.log`s behind `devLog`; several log raw user messages and memory to production stdout (3679-3683, 2641).

---

## 3. Signals / rules engine

### 3.1 Pipeline
```
StoredWorkout[] ──► trainingMetrics (parse strings, getBestSet = heaviest set, estimateE1RM Epley, 7-day window)
   ├─► liftTrend.getLiftTrendStatus   last 6 sessions; LS slope; ±1.5% = flat; <3 sessions = early   [canonical]
   │     ├─► plateauSignal.detectPlateauAcrossLifts  (≥4 sessions, latest ≤ start×1.01 AND slope ≤ 0)
   │     └─► aggregateLiftTrends (majority vote → improving/mixed/declining/limited)
   ├─► trainingAnalysis.detect{Exercise,Volume,Frequency}Signals ─► TrainingSignal[]
   │     └─► scoreTrainingSignals ─► buildSignalInteractions
   ├─► volumeAnalysis.buildVolumeRows (MUSCLE_RANGES per detailed group; progression-aware)
   └─► coachStructuredAnalysis.buildCoachStructuredAnalysis (keyFocus, going-well, suggestions, evidence ids,
          trainingDecisions.decideNextActions → nextSessionAdjustments)
                └─► signalStatus.compute{Plateau,Progress,Volume}Status → {state: good|watch|attention|unknown, status}
                       └─► consumers: home tiles (app/page.tsx:259), /signal/[key], assistant USER CONTEXT (route.ts:1502)
```

### 3.2 Reusable for a physique engine

| Asset | Where | Reuse |
|---|---|---|
| `classifyE1rmSeries`, `getLiftTrendStatus`, `aggregateLiftTrends`, thresholds | `lib/liftTrend.ts:69,152,175` | "Are key lifts holding during the cut / rising during the bulk?" Feed it the user's main lifts |
| `leastSquaresSlope` | `lib/liftTrend.ts:44` (private) | Export it into `lib/stats.ts`; generalise to (x = days, y = value) for kg/week |
| `{state, status}` contract + `SignalState` | `lib/signalStatus.ts:24-25` | A physique tile and detail page should return the same shape |
| `EARLY_THRESHOLD_WORKOUTS` → "Early read"/"No data yet" | `signalStatus.ts:27` | Honest cold-start states (PRODUCT.md principle) |
| `TrainingSignal` shape + evidence ids | `trainingAnalysis.ts:444`, `evidenceMapping.ts` | Physique signals with `evidence[]` + `evidenceCardIds` |
| Evidence catalogs | `lib/evidenceCards.ts`, `lib/assistantScienceContext.ts:15` | Add physique cards. Consolidate the two catalogs first |
| `getProgressionByMuscleGroup`, `MUSCLE_RANGES` | `trainingAnalysis.ts:1203`, `volumeAnalysis.ts:24` | "Is training stimulus maintained in a deficit?" |
| `computeNiceYAxis` | `lib/chartScale.ts:30` | Works for kg; check spans for kcal (thousands) |
| `getCompletedLoggedSets` | `lib/completedSets.ts` | confirmed-only data rule |

### 3.3 Pattern to copy
- **One canonical module per verdict.** The rule is stated in a header doc comment (`liftTrend.ts:1-13`, `signalStatus.ts:1-8`) and every surface reads it.
- **Exported constants with one-line rationale docs** (`liftTrend.ts:24-30`, `plateauSignal.ts:39-46`). Thresholds are tunable and testable.
- **Pure function, typed result**, a sub-`kind` for copy variants (`PlateauKind`), and a priority order for picking the "loudest" result (`plateauSignal.ts:110-139`).
- **Hedged labels** ("Trending up", "Early read") and a strict detector that prefers silence over false positives (commit `f935b9c`, `9e2837e`).
- Per-page copy is composed *on top of* the status (`app/page.tsx:259-400`), never re-deciding it.

### 3.4 Do not copy
- **Hidden I/O:** `buildCoachStructuredAnalysis` calls `getStoredUserProfile` → localStorage plus assistant memory (`coachStructuredAnalysis.ts:708`). On the server it silently uses defaults.
- **Implicit clock:** `Date.now()` inside `trainingMetrics.ts:68,416`, `trainingAnalysis.ts:488`, `coachStructuredAnalysis.ts:627`, `app/signal/[key]/page.tsx:825`. Take `now` as a parameter.
- **Duplicated logic:** `extractRecentE1rmSeries` exists in both `liftTrend.ts:139` and `plateauSignal.ts:53`. A third trend classifier sits in `app/signal/[key]/page.tsx:802-819` (endpoint ratio ±2.5% over 42 days), so per-exercise badges on the Progress detail can disagree with `liftTrend`.
- **Session-index x-axis:** trends are per session, not per day. Bodyweight needs time-based regression, smoothing (7-day mean/EWMA), and missing-day handling.
- **"Best set = heaviest weight"** (`trainingMetrics.ts:280`), not max e1RM. This matters if a cut shifts rep ranges.

---

## 4. UI system

- **Tokens (`app/globals.css`):** only 4 CSS vars (`--background #080b12`, `--foreground`, `--accent 0 229 176` mint, `--accent-foreground`) mapped via `@theme inline`.
  - Component classes: `.btn-primary`, `.btn-secondary`, `.card-app`, `.input-app`, `.focus-accent`, `.text-app-{secondary,tertiary,meta}`, `.link-accent`, `.chip-{low,moderate,high}`, `.label-section`, plus legacy aliases `.text-home-*` and `.link-home-accent`.
  - **Gotcha:** Tailwind zinc classes are globally re-skinned with `!important` attribute selectors (`[class*="bg-zinc-900"]` → `#0e1420`, `globals.css:31-44`). `bg-zinc-*` does not render as stock zinc.
- **Status palette** (hard-coded, duplicated): good `#00e5b0`, watch `#fbbf24`, attention `#fb7185`, unknown muted teal. `STATE_COLOR` is copied in `app/page.tsx:147-190` and `app/signal/[key]/page.tsx:60-113`; the signal icons and `useIsHydrated` are duplicated in both too.
- **Styling reality:** 208 hex/rgba literals and 73 inline `style={{}}` across TSX (signal page 22, assistant 12, home 11). Extract a `lib/ui/status.ts` (palette + icons) before adding a physique tile.
- **Charts:** no chart library; everything is hand-rolled SVG.
  - `LineChart` and `BarChart` in `app/signal/[key]/page.tsx:238,481`, and a chart inside `components/LiftProgressionSection.tsx:~290-360`.
  - Shared helpers: `lib/chartScale.ts`, and `components/ChartPointTooltip.tsx`, which is typed for sets (weight/reps/e1rm), so it is not generic.
  - The x-axis is evenly spaced by index. A physique chart needs a **time axis**, gaps, and a smoothed trend line over raw points. Build `components/charts/TimeSeriesChart.tsx` rather than forking `LineChart` again.
- **Navigation:** `components/BottomTabs.tsx` has 4 fixed tabs (Home, Templates, History, Profile) and matches by prefix. PRODUCT.md still says "Home, Log, History", so they have drifted. Pages pad `pb-28` for the bar. Adding a 5th tab or a "Log" hub is a product decision; the component is simple (`TABS` array, `:52-57`).
- **Page structure convention:**
  - `<main className="min-h-screen bg-zinc-950 text-white relative pb-28">`, then a fixed radial-gradient overlay div, then a container `relative mx-auto max-w-2xl px-5` (or `max-w-3xl px-6`), then a header with a back-chevron `Link`, then `label-section` `h2`s.
  - Data loads in `useEffect` from localStorage and listens for `workoutHistoryChanged`; a skeleton shows until hydrated.
  - Home layout order is fixed by PRODUCT.md: Start CTA first, then assistant card, then Signals (`grid-cols-3`). A 4th tile needs a layout change.
- **Design guidance for agents:** `.agents/skills/impeccable` (symlinked into `.claude/skills/`) plus `PRODUCT.md` (register, anti-references, "glanceable not interpretive").

---

## 5. Quality and risk

### 5.1 Lint (`npx eslint`, ESLint 9.39.4, `eslint-config-next` core-web-vitals + typescript)

| Rule | Count | Where | Nature |
|---|---|---|---|
| `@typescript-eslint/no-explicit-any` (error) | 22 | `trainingKnowledge/{trainingAnswerSupport 5, exerciseSelection 3, exerciseCombinationLogic 2, exerciseContribution 2, exerciseRedundancy 2, muscleCoverage 2}`, `planSingleSessionWorkoutLLM 3`, `dayQuality 2`, `assistantExplanation 1` | mostly dormant/dead code |
| `react-hooks/set-state-in-effect` (error) | 14 | providers (`experienceLevel`, `priorityGoal`, `trainingFocus`, `unit-preference`, `workout-store`), `history ×3`, `templates`, `volume`, `workout/start`, `OnboardingGate`, `ActiveWorkoutResumeBar`, `CreateExerciseModal` | the localStorage hydration pattern. Fixed structurally by a `useSyncExternalStore` storage hook |
| `react-hooks/rules-of-hooks` (error) | 2 | `components/LiftProgressionSection.tsx:225-226` | **real bug** (early return at :180) |
| `react-hooks/purity` (error) | 2 | `app/workout/page.tsx:637,693` (`Date.now()` in handlers inside a 2.4k-line component) | likely false positive; refactor |
| `prefer-const` (error) | 1 | `lib/llmPlannedSessionMapper.ts:353` | dormant |
| warnings: vendor | 97 | `.agents/skills/impeccable/scripts/*` | **not in `globalIgnores`** (`eslint.config.mjs:9-15`) |
| warnings: own | 33 | `no-unused-vars` 25, `exhaustive-deps` 7 (`assistant/page.tsx:580`, `workout/page.tsx:785`, `ExercisePicker.tsx:55-65`, `coach/review:98`), unused-disable 1 | |

Action: ignore `.agents/**`, then run `npx eslint --suppress-all` (ESLint ≥9.24 supports bulk suppressions) to freeze the baseline. `npx eslint` then exits 0 and any *new* violation fails.

### 5.2 Dead and legacy code
- **Unreachable from any page/route/script (19 files, 1,713 lines):**
  - `lib/trainingRecommendations.ts` (365), `homeCoachingStory.ts` (215), `programmePipeline/splitGroupings.ts` (179), `extractSingleWorkoutStructureLLM.ts` (120, OpenAI), `splitReview.ts` (106), `explainRoutineCoachLLM.ts` (91, OpenAI), `muscleQuotaCounting.ts` (73), `assistantExplanation.ts` (61), `assistantAdvisory.ts` (60), `trainingKnowledge/{customSplitParsing,redundancyResolution,splitLogic,trainingAnswerLogic}.ts`, `inferSessionTypeHintFromDay.ts`, `workoutGenerationPathGuard.ts` (only user of `BLOCK_LEGACY_WORKOUT_PATHS`).
  - `components/CoachInsightCard.tsx`, `components/Navbar.tsx`, `app/components/OnboardingFlow.tsx`, `app/components/OnboardingGate.tsx`.
- **Dormant (reachable only via `enterSingleSessionStructuredBuild = false`, `route.ts:3807`): 11 files, 2,003 lines** (listed in §1.3).
- **Orphan routes (1,582 lines incl. `LiftProgressionSection`):** `/coach`, `/coach/review`, `/volume`, `/progress`, `/analysis`; plus `/api/coach-analysis`.
- **Dead storage keys:** `assistantLastChatDate` (write-only), `assistantUseLongTermMemory` (read-only), `workoutSuggestedMuscle` (never set), `onboardingComplete` (listed only).
- **Legacy duplication:**
  - `StoredWorkout` ×4, `WorkoutTemplate` ×2.
  - kg↔lb constants ×3 (`2.2046226218` in `unit-preference.tsx:10` and `app/workout/page.tsx:44`; `2.20462` in `onboardingProfile.ts:291`; `0.45359237` in `csvImport.ts:11`).
  - Two evidence catalogs.
  - Two `assistantUserId` creators.
  - Profile state fragmented across `onboardingProfile` + `userCoachingProfile` + `trainingFocus`/`experienceLevel`/`priorityGoal` + `weightUnit` + two memories.

### 5.3 Large files and conflict hotspots

| File | Lines | Commits since Apr | Physique work touches it? |
|---|---|---|---|
| `app/api/assistant/route.ts` | 4,150 | 8 | **yes** (block, routing, cold start) |
| `app/workout/page.tsx` | 2,374 | 4 | maybe (post-session prompts) |
| `lib/trainingAnalysis.ts` | 1,701 | 5 | indirectly (types, history reader) |
| `app/assistant/page.tsx` | 1,403 | 8 | **yes** (request payload) |
| `app/signal/[key]/page.tsx` | 1,393 | 9 | **yes** (new signal key or detail) |
| `lib/sessionTemplates.ts` | 1,170 | — | no |
| `lib/coachStructuredAnalysis.ts` | 1,080 | — | maybe |
| `app/page.tsx` | 985 | 11 | **yes** (tile, insight, quick-log) |

Rule for multi-agent work: at most one agent owns each of these files at a time. Integration edits to them should be serialised; new code goes in new files.

### 5.4 Tests and tooling
- No test runner and no `test` script. `scripts/test-volume-rules.ts` is an ad-hoc tsx assertion script; it passes and `@/` paths resolve under tsx.
- `evals/` is LLM-graded and needs a running server plus an API key.
- `tsx` is installed. Node 22 has `node --test`. `zod` 4.3.6 is present only transitively and is not a direct dependency.
- No CI (`.github` absent), no Prettier, no `CLAUDE.md`/`AGENTS.md`, no `.env.example`. README is the create-next-app boilerplate.

### 5.5 Environment variables

| Var | Used by | Required? |
|---|---|---|
| `ANTHROPIC_API_KEY` | `route.ts:1633`, `extract-memory/route.ts:22`, `evals/run.ts` (SDK default) | yes |
| `OPENAI_API_KEY` | `refine-target/route.ts:17` (live), `coach-analysis` (dead), 2 dead libs | yes for workout target refinement; failure is silent |
| `NEXT_PUBLIC_TALLY_FEEDBACK_URL` | `app/profile/page.tsx:57`, `app/assistant/page.tsx:1199` | optional (placeholder fallback) |
| `COACH_URL` | `evals/run.ts:21` | optional |
| `BLOCK_LEGACY_WORKOUT_PATHS` | dead `lib/workoutGenerationPathGuard.ts` | no |

`.env*` is gitignored and no `.env.local` exists in the checkout.

### 5.6 Security
- No authentication. Every API route is public and three of them spend money.
- The only guard is a client-supplied `client_id` checked against an in-memory counter. It is bypassable, per-instance, and runs before validation.
- No request-size limits: `message`, `threadMessages` (client caps at 30), `coachingContext.recentWorkouts`, `userMemory` and the extract-memory `conversation` are all unbounded on the server.
- Client-supplied text (memory facts, template/exercise names) is injected verbatim into system blocks. Today that is self-injection only, but it becomes a trust boundary once data moves server-side.
- `err.message` is returned to clients, and server logs contain raw user messages and memory.
- No secrets are committed. Keys are read server-side only, and no `NEXT_PUBLIC_` secret is used.

### 5.7 Bugs found in passing (fix before physique work relies on them)
1. History edit drops `rir` and `exerciseId` from every set of the edited workout (`app/history/page.tsx:36-41`, `145-150` → `replaceWorkoutAtIndex`).
2. Conditional hooks in `LiftProgressionSection.tsx:180/225-226`.
3. Server `USER CONTEXT` computes over 10 workouts with a default profile, while the client computes over all workouts with the real profile (§0.2).
4. JSON path leaks `<datasources>` (`route.ts:4139`).
5. The progress-detail classifier diverges from canonical `liftTrend` (`app/signal/[key]/page.tsx:802`).
6. `PriorityGoal` is not settable in live UI. Its default makes "1RM" questions infer bench (`benchProjectionPayload.ts:110`). `isBenchQuestionText` matches the bare substring `pb` (`:100`).
7. Unit switch rewrites stored history in place with 0.1 rounding (`unit-preference.tsx:28-97`). The profile bodyweight is displayed rounded to an integer (`OnboardingProfileFields.tsx:65-68`, `onboardingProfile.ts:289-293`).
8. The backup allowlist misses `assistantMemory`, `restTimerNotifySettings` and `volumeEnabledOptionalGroups` (`devDataTransfer.ts:5-24`).
9. `addWorkout` does not dispatch `workoutHistoryChanged` (`workout-store.tsx:106-114`).

---

## 6. Conventions (match these)

- **Commits:** recent style is a short imperative subject, sometimes prefixed `feat:` or with a roadmap id `P1.9:` / `P0/P1 batch:`. The body explains *why*, then lists `- file: change` bullets, an optional "Schema impact:" paragraph, and a `Co-Authored-By: Claude …` trailer. Avoid the 2026-03 style of one long run-on "Enhance…" sentence. Single author (Rafferty Chuter), 50 commits, no PR history in repo.
- **Files:**
  - `lib/` is flat camelCase (`liftTrend.ts`, `signalStatus.ts`), except kebab-case `workout-store.tsx` and `unit-preference.tsx`. Providers are `.tsx` in `lib/`.
  - Components are PascalCase in `components/`, mostly default exports (9/12). Route-local components go in `app/components/`.
  - Subfolders are rare (`lib/trainingKnowledge/`, `lib/programmePipeline/`).
  - Absolute imports via `@/` everywhere.
- **TypeScript:** `type` aliases only (315 vs 0 `interface`). String-literal unions for states. `as const satisfies` for enums. `strict: true`. Exported `UPPER_SNAKE` threshold constants.
- **Formatting:** 2-space indent, double quotes (0 single-quote imports), semicolons, trailing commas. No formatter is enforced.
- **Comments:**
  - JSDoc `/** … */` on exported functions and constants, explaining rationale and rules (e.g. `liftTrend.ts:1-13`, `plateauSignal.ts:1-15`).
  - Roadmap tags (`P0.8`, `P1.8`) and links to `Decisions/YYYY-MM-DD-*.md`, which are in the founder's vault and not in the repo.
  - Section dividers `// ── Title ──`.
  - Inline "why" comments citing dogfood evidence (`route.ts:2788-2797`).
- **Storage access:** every read and write is wrapped in `try/catch` with a `typeof window === "undefined"` guard, and changes are announced with a `window` event.
- **Copy/tone:** calm, peer-level, hedged ("Early read", "Trending up"). See PRODUCT.md.

---

## 7. Recommendations

### 7.1 Before the expansion (in order)

| # | Task | Why | Size |
|---|---|---|---|
| 1 | Add `CLAUDE.md`: commands, module map (§1), hotspot ownership rule, storage-key registry rule, test/eval commands, conventions (§6). Port the key `Decisions/*` into `docs/decisions/` | Agents start every session blind; the vault is unreachable | S |
| 2 | Tooling: add `vitest` (or `node --test` + tsx), plus `npm run typecheck`, `npm test`, and `npm run check` (tsc + eslint + test). Ignore `.agents/**` in eslint and run `eslint --suppress-all`. Add a minimal GitHub Action running `check` | Gives agents a pass/fail signal; stops lint debt growing | S |
| 3 | Characterisation tests for the existing engine: `liftTrend`, `plateauSignal`, `signalStatus`, `volumeAnalysis` (port `scripts/test-volume-rules.ts`), routing table tests for `classifyAssistantQuestionKind` + `computeStrictIntentLock` (incl. physique phrasings that must *not* route to bench), `createDataSourcesFilter`, `formatUserContextBlock` snapshot | Protects behaviour during the `route.ts` split and the new routing | M |
| 4 | Fix bugs 5.7 #1-#4 | Physique engine will read RIR/exerciseId; the evals must reflect the real path | S |
| 5 | Split `route.ts` per §2.8, with a context-block registry and a single `AssistantTurnContext`. Delete the dead branch, gate logs, add a zod body schema with size limits | Physique work otherwise lands in a 4k-line file that every agent edits | M-L |
| 6 | **Storage layer** `lib/storage/` (§7.3) and migrate `workoutHistory` readers onto `WorkoutRepo`. Physique data uses repos from day one | Consistency, testability, later DB move | M |
| 7 | Units: a single `lib/units.ts`. Physique values are stored canonically (kg, kcal, g, minutes) and **never rewritten on unit switch** | Avoids repeating the lossy-history pattern | S |
| 8 | API hardening: cap check after validation and on `extract-memory`/`refine-target`; cost-log `refine-target`; delete `/api/coach-analysis`; generic error bodies; plan shared-store rate limiting (KV/Redis) before a public launch | Every new physique LLM call adds unguarded spend | S-M |
| 9 | Remove or archive dead and dormant code (§5.2) and the orphan routes. Move `priorityGoal` editing into Profile or retire it in favour of a unified `Goal` | Shrinks the surface agents must understand; fixes goal fragmentation | S |
| 10 | Extract shared UI primitives: `lib/ui/status.ts` (STATE_COLOR + icons), `components/charts/TimeSeriesChart.tsx` (time axis), `hooks/useIsHydrated` | Physique tile and charts otherwise fork more copies | S |

### 7.2 Proposed module boundaries for new code
```
lib/stats.ts                    leastSquaresSlope (moved from liftTrend), timeRegression(x=days), rollingMean, ewma, median — pure
lib/units.ts                    kg/lb, cm/in, kcal; display formatting
lib/storage/
  keys.ts                       registry: {key, scope: local|session, version, includeInBackup, owner}
  kv.ts                         safe JSON get/set/remove, SSR guard, change events, cross-tab 'storage' bridge
  useStored.ts                  useSyncExternalStore hook (replaces setState-in-effect providers)
  repos/workouts.ts             WorkoutRepo (async API; stable ids; schemaVersion)
lib/physique/
  types.ts                      BodyweightEntry, NutritionDay/FoodEntry, SleepEntry, PhysiqueGoal, PhysiqueAnalysis, PhysiqueSignal
  repos.ts                      BodyweightRepo / NutritionRepo / SleepRepo / GoalRepo on lib/storage (async)
  series.ts                     daily bucketing (local date + tz), smoothing, outlier rejection, gap handling
  energy.ts                     intake averages, logging adherence, adaptive TDEE from intake vs trend weight change, confidence
  strength.ts                   adapter over liftTrend: key-lift retention or progression vs goal phase
  recovery.ts                   sleep vs baseline
  engine.ts                     buildPhysiqueAnalysis(input, { now }) → verdict (on-track | too-fast | too-slow | stalled | insufficient-data) + adjustment + evidence ids. Pure; thresholds exported with doc comments
  status.ts                     computePhysiqueStatus() → SignalStatusResult (same contract as lib/signalStatus.ts)
  assistantBlock.ts             formatPhysiqueContextBlock(analysis) → compact string
  evidence.ts                   physique evidence cards (content needs product/evidence sign-off)
  __tests__/                    fixtures: cut on track, cut too fast, stall with low adherence, bulk, sparse data, unit switch
lib/assistant/…                 (from the route.ts split) + routing kinds + task template for physique
app/(physique pages)            e.g. app/body/page.tsx (trend + log), quick-log sheets in components/physique/*
app/signal/[key]                add a key, or a separate detail page to avoid growing the 1.4k-line file
```

Design rules for the physique entities:
- Every record has a stable `id` (uuid), `date` (local `YYYY-MM-DD`) plus `loggedAt` ISO, `source` (`manual`/`import`), and `schemaVersion`.
- Store canonical units.
- Keep a single active `PhysiqueGoal` alongside `OnboardingProfile.primaryGoal`. Do **not** extend the `PriorityGoal` string enum: it is regex-matched in 3 places.
- Have the profile's `bodyweightKg` follow the latest smoothed weigh-in, or show it as a read-only derived value.
- Food logs grow fastest. Budget the localStorage quota (~5 MB) and consider IndexedDB behind the same repo interface.

### 7.3 Storage abstraction (to ease a later DB move)
- **Repository interfaces with async signatures** (`list({from,to})`, `get(id)`, `upsert(entity)`, `remove(id)`, `subscribe(cb)`), even though localStorage is synchronous. Swapping to fetch/DB later then leaves call sites unchanged.
- **The key registry drives the backup allowlist**, so `devDataTransfer.ts` can no longer drift.
- **Server-side recomputation stays the contract.** The client sends bounded raw data; the server's pure engine judges. When a DB arrives, the server reads the DB instead of the payload, and the engine does not change.
- **One-time migrations** are versioned in `lib/storage/migrations.ts`. Today they are scattered: name normalisation in `trainingAnalysis.ts:107-122`, profile legacy merge in `onboardingProfile.ts:126-213`.

### 7.4 Existing files new work will most likely touch

| File | Reason | Conflict risk |
|---|---|---|
| `app/api/assistant/route.ts` (or its split modules) | block injection, cold-start gate, routing override, task prompt | **high** |
| `lib/assistantQuestionRouting.ts` | new kinds placed ahead of projection rules | med |
| `lib/assistantAnswerScope.ts`, `lib/assistantScienceContext.ts`, `lib/assistantMode.ts` | per-kind scope, evidence, mode | low |
| `app/assistant/page.tsx` | send physique payload; empty-state prompts | **high** |
| `app/page.tsx` | physique tile / insight / quick-log entry; `grid-cols-3` | **high** |
| `app/signal/[key]/page.tsx` | new signal key or link to a new detail page | **high** |
| `lib/signalStatus.ts` | export physique status alongside (or import from `lib/physique/status.ts`) | med |
| `components/BottomTabs.tsx`, `app/layout.tsx`, `app/providers.tsx` | nav entry, any new provider | low (global) |
| `lib/onboardingProfile.ts`, `app/components/OnboardingProfileFields.tsx`, `app/profile/page.tsx` | goal fields, bodyweight sync | med |
| `lib/devDataTransfer.ts` | backup keys (or replaced by the registry) | low |
| `app/api/assistant/extract-memory/route.ts`, `lib/assistantMemory.ts` | diet/sleep preference facts; exclusions | low |
| `lib/evidenceCards.ts` / `lib/assistantScienceContext.ts` | physique evidence | low |
| `evals/cases.json` (+ fixtures) | physique cases | low |
| `app/globals.css` | only if new tokens (prefer adding status tokens here) | low |

### 7.5 Suggested agent sequencing
1. **Serial foundation, one agent each in turn:** tooling + CLAUDE.md, then characterisation tests, then bug fixes, then the `route.ts` split, then `lib/storage`.
2. **Parallel-safe, new files only:** `lib/stats.ts`, `lib/units.ts`, `lib/physique/*` engine + tests, `components/charts/TimeSeriesChart.tsx`, physique log pages and sheets, evidence content.
3. **Serial integration, one owner per hotspot:** routing kinds → assistant context block → assistant page payload → home tile and signal detail → evals.
