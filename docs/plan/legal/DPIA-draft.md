# DPIA draft: Gym AI, tester phase

Data protection impact assessment, drafted 21 October 2026 (TR2) from what the code on `claude/admiring-ptolemy-mz6jwu` does. It follows the headings of the ICO's sample DPIA template (steps 1 to 7). Facts carry the file they come from. `[FOUNDER]` marks what only the founder can answer or decide.

**This is a draft, not legal advice.** A person who knows UK GDPR has to read it and the privacy notice (`app/privacy/page.tsx`) before testers start (FT9). Keep it under review: update it when a ticket changes what leaves the phone.

Related: the privacy notice (`/privacy`), `docs/plan/07-tester-ready.md` (TR1 consent and delete account, TR3 error reporting, TR5 iOS privacy manifest, TR6 backups), `docs/plan/03-architecture.md` §7.

---

## Step 1: Identify the need for a DPIA

**What the project aims to achieve.** Gym AI is a training and physique app for natural lifters. A person sets a goal (for example "90 kg lean"), logs food, bodyweight, waist, training and sleep, and can read weight, body fat, sleep, steps, resting heart rate and HRV from Apple Health. A deterministic engine on the phone judges whether the plan is working and finds links between habits and lifts. The tester phase is 5 to 20 lifters for 6 to 8 weeks through TestFlight (`07-tester-ready.md`, "The aim of the test").

**Type of processing.** Mostly on the device. Data reaches our servers when the person (a) signs in and syncs (Supabase), (b) sends Apple Health data through Health Auto Export, (c) turns reminders on, (d) uses Describe a meal (Anthropic), (e) searches food or scans a barcode (Open Food Facts via our server). The AI coach chat exists but is switched off (`lib/features.ts` `ASSISTANT_ENABLED = false`).

**Why a DPIA.** The app processes health data (special category, UK GDPR Art 9) from fitness trackers and wearables, and sends some of it to an AI provider in the United States. Special category data combined with innovative technology (AI, wearables) is on the ICO's list of processing likely to result in high risk, so a DPIA is expected before testers (`07-tester-ready.md` research notes; `03-architecture.md` §7).

**Controller.** `[FOUNDER]` Legal name or trading name, address for correspondence, and whether the controller is you as a sole trader or a company. ICO registration number once the data protection fee is paid (FT9: tier 1, £52). Contact: the address in `NEXT_PUBLIC_SUPPORT_EMAIL` (`app/support/page.tsx`, `app/privacy/page.tsx`).

---

## Step 2: Describe the processing

### Nature of the processing

**Collection (sources).**
- Typed by the person: weigh-ins, waist, food entries, sleep, workouts, routines, goal, profile (sex, age, height, body fat category), settings (`lib/storage/keys.ts`).
- Apple Health, read on the iPhone: sleep, weight, body fat, HRV, resting heart rate, steps; read-only (`lib/physique/io/nativeHealth.ts` `READ_TYPES`, `requestAuthorization({ write: [] })`; purpose strings in `ios/App/App/Info.plist`).
- Health Auto Export (a third-party iPhone app the person sets up): posts Apple Health samples to `POST /api/ingest/hae` with a bearer token (`app/api/ingest/hae/route.ts`).
- Imports from Hevy, Strong, Rep Count CSVs and daily-log files, parsed on the phone (`lib/csvImport.ts`, `lib/physique/io/dailyLogImport.ts`).
- Free text the person types into Describe a meal (`app/api/food/parse/route.ts`).

**Use.** The engine runs on the phone (`lib/physique/`, CLAUDE.md rule 1). The server does not compute verdicts. Describe turns text into foods and amounts with Anthropic, then resolves them against the UK CoFID list on our server. The reminder scheduler reads only which dates have entries (`app/api/push/run/route.ts`, `lib/physique/reminder.ts`).

**Storage.**

| Where | What | Source |
|---|---|---|
| Phone: browser localStorage (web view) | Everything logged; device ids; sync state; the Supabase session | `lib/storage/keys.ts`, `lib/sync/client.ts` |
| Phone: iPhone app's Library folder (`gymai/data.json`) | A copy of every local key, written when the app goes to the background; included in the iPhone's iCloud backup | `lib/storage/nativeMirror.ts` |
| Supabase `sync_records` | Signed-in users only: every backup key except device-only ones (list below), per record, with a soft-delete flag | `supabase/migrations/0003_sync.sql`, `lib/sync/run.ts` `syncedKeys` |
| Supabase `auth.users` | Email address, sign-in times (Supabase Auth) | `app/account/page.tsx` `signInWithOtp` |
| Supabase `health_devices`, `health_samples` | Health Auto Export samples (metric, day, value, source), keyed by the SHA-256 of a 32-byte random token | `supabase/migrations/0001_health.sql`, `lib/server/supabaseRest.ts` `hashToken`, `lib/physique/io/healthLink.ts` `randomToken` |
| Supabase `push_devices` | Push subscription, time zone, reminder time, logged dates for the last 9 days and the first date of each kind, hash of the Health Auto Export token | `supabase/migrations/0002_push.sql`, `lib/server/pushSchemas.ts` |
| Vercel logs | Request logs (IP, time, path); our cost lines (client id, model, token counts, cost); zod issue paths; error messages. Never values | `lib/api/guard.ts`, `lib/assistantCostLogging.ts` |
| Anthropic | Describe text (and coach requests when on), transiently | `app/api/food/parse/route.ts`, `app/api/assistant/route.ts` |

Synced keys (`syncedKeys()` = every key with `includeInBackup` less `DEVICE_ONLY_KEYS`): `workoutHistory`, `workoutTemplates`, `userExerciseLibrary`, `onboardingProfile`, `userCoachingProfile`, unit and appearance settings, `trainingFocus`, `experienceLevel`, `priorityGoal`, `assistantThreadsV1`, `assistantSelectiveMemoryV1`, `assistantMemory`, and every `physique.v1.*` log key (`weighIns`, `foodEntries`, `savedFoods`, `dayFlags`, `sleepNights` (with HRV and resting HR), `waist`, `steps`, `importMeta`, `goal`, `goalHistory`, `profile`, `program`, `checkIns`, `foodPrefs`, `musclePriorities`, `deload`). Stay on the device: `activeWorkout`, `restTimerNotifySettings`, the assistant ids, `physique.v1.healthLink`, `pushLink`, `nativeHealth`, `onboarding`, `sync.v1.*`.

**Deletion.**
- Phone: weigh-ins, food entries and workouts can be deleted one by one (`lib/physique/io/bodyData.ts`, `app/history/workout`); sleep nights and waist can be edited but not deleted one by one (risk R8). Deleting the app removes localStorage and the Library copy.
- Account: deleting an entry pushes `data: null, deleted: true` for it (`lib/sync/core.ts`), so the content leaves the server and a marker (key, id, time) stays. Account deletion is TR1 (`POST /api/account/delete`, `auth.admin.deleteUser`, `sync_records` cascades from `auth.users`). Until TR1 merges there is no in-app account deletion.
- Health Auto Export: "Disconnect and delete" deletes every sample and the device row (`app/api/health/pull/route.ts` DELETE). No expiry otherwise (risk R3).
- Reminders: turning them off deletes the row (`DELETE /api/push/subscribe`); a device is also dropped after `MAX_FAILURES` = 5 failed sends in a row (`app/api/push/run/route.ts`).

**Sharing (processors and recipients).**

| Who | Role | What | Location | Terms |
|---|---|---|---|---|
| Supabase | Processor | Accounts, synced records, Health Auto Export samples, reminders | London `eu-west-2` per `03-architecture.md` A3. `[FOUNDER]` confirm the project's region in the Supabase dashboard (Settings → General) | `[FOUNDER]` accept Supabase's DPA (dashboard) and record the date |
| Anthropic | Processor | Describe text; coach requests when on | United States | `[FOUNDER]` confirm the DPA is in force under the Commercial Terms, its transfer mechanism (UK Addendum / IDTA or UK Extension to the DPF), its retention period for API inputs, and that inputs are not used for training |
| Vercel | Processor | Hosting; request logs | Functions for Apple Health, reminders and food search pinned to `lhr1` (London). Describe (`app/api/food/parse`) and the assistant routes are not pinned, so they run in the project's default region | `[FOUNDER]` check the project's default function region (Settings → Functions) and Vercel's DPA; record log retention on the current plan |
| Open Food Facts | Recipient | Search words and barcodes only, sent by our server with our User-Agent | France | No personal data sent (`lib/server/off.ts`) |
| Apple, Google or Mozilla push services | Recipient | The push message ("No weigh-in yet.", "Weekly report") to the subscription endpoint | Varies | `lib/server/push.ts`, `lib/physique/reminder.ts` `reminderMessage` (no numbers) |
| Tally | Processor (if used) | What a person writes in the feedback form | EU | `[FOUNDER]` FT6 |
| Email provider for sign-in codes | Processor | Email address, code | `[FOUNDER]` Supabase's built-in sender or custom SMTP | `[FOUNDER]` |

`[FOUNDER]` TR3 may add Sentry (error reports). If it does, add it here and to `/privacy`.

**Data flow.**

```
Phone (all data, engine)
 ├─ signed in + consent (TR1) ──► Supabase sync_records (London)
 ├─ Describe a meal ──► our server (Vercel) ──► Anthropic (US); chain dishes: web search by dish name + size
 ├─ Food search / barcode ──► our server (lhr1) ──► Open Food Facts
 ├─ Reminders on ──► our server (lhr1) ──► Supabase push_devices ──hourly──► push service ──► phone
 └─ iPhone app ── Library copy (in iCloud backup)
Health Auto Export app ──► our server (lhr1) ──► Supabase health_samples ──pull──► phone
Apple Health ──read on the phone──► phone
```

**Likely high-risk processing involved.** Special category data (health); innovative technology (an LLM reading food descriptions; wearable data); data sent outside the UK (Anthropic).

### Scope of the processing

- **Nature of the data.** Special category (health): weight, waist, body fat, sleep (times, stages), HRV, resting heart rate, steps, food intake, training. Also: email address, age, sex, height, goal, push endpoint, time zone, IP address in request logs. No criminal offence data. No precise location (time zone only).
- **How much and how often.** Daily entries per person. PR4's end-to-end test with 16 weeks of made-up data synced 694 rows across 10 keys (`STATUS.md` PR4). Health Auto Export sends one row per metric per day. Describe: one request per use.
- **How long.** Account: until deletion (TR1). Health Auto Export: until disconnect. Reminders: until off or 5 failed sends. Vercel logs: Vercel's retention for the plan. Anthropic: its retention for API inputs. `[FOUNDER]` decide what happens to an account, or a Health Auto Export device, that has not been used for a long time (for example delete after 12 months without a sign-in, with an email first); nothing in the code does this today.
- **How many people.** 5 to 20 testers for 6 to 8 weeks (FT8). `[FOUNDER]` expected numbers after the test.
- **Geography.** UK testers. Data in London (Supabase, pinned Vercel functions) and the United States (Anthropic, unpinned Vercel functions). `[FOUNDER]` is the TestFlight link limited to the UK or open?

### Context of the processing

- **Relationship.** Consumer app; testers recruited by the founder (gym, lifting communities; some friends) (FT8).
- **Control.** High. The app works fully without an account; sync, Health Auto Export, reminders and Describe are each opt-in actions; the coach is off. Apple Health access is chosen per type in iOS.
- **Expectations.** A lifter logging food and weight expects the app to hold it. They may not expect a typed meal to go to a US AI company: the notice says so, and R1 recommends asking first.
- **Children and vulnerable groups.** Not intended for under 16 (policy in `/privacy`; no age gate in code). Under 18: no calorie deficit (`lib/physique/setupFlow.ts`, `lib/physique/judge.ts` `SAFE0_MIN_AGE`). People with a history of disordered eating may use calorie tracking: the setup has a safety question that removes deficit targets (`lib/physique/setupFlow.ts`), targets never go below `CALORIE_FLOOR` (`lib/physique/targets.ts`), and the engine stays silent below its data gates (CLAUDE.md rule 3).
- **Prior concerns.** Health apps and AI are an area of public concern; Apple requires explicit permission before personal data goes to a third-party AI (5.1.2(i)) and forbids health data in iCloud (5.1.3).
- **Novelty.** LLM food parsing and statistical "Connections" between habits and lifts. The LLM never computes verdicts (CLAUDE.md rule 2).
- **Codes of conduct.** None.

### Purposes of the processing

- Show the person whether their plan is working (trend weight, maintenance, verdicts) and which habits go with better or worse sessions, from their own data.
- Keep the log safe across devices (accounts), bring Apple Health in without typing, remind only on a gap, and make food logging quicker (Describe, search, barcode).
- Benefit to the founder: learn in the test whether people keep logging, open Progress, believe Connections and would pay (`07-tester-ready.md`).

---

## Step 3: Consultation process

- **Individuals.** Testers' check-ins at weeks 2, 4 and 8 (TR4 `docs/plan/testers/checkins.md`). `[FOUNDER]` add one question: "Was anything about where your data goes unclear or uncomfortable?"
- **Within the organisation.** The founder (sole decision-maker). Claude Code sessions build to this DPIA.
- **Processors.** Supabase, Anthropic and Vercel documentation and DPAs (step 2 table).
- **Experts.** `[FOUNDER]` a person who knows UK GDPR reviews this draft and `/privacy` (FT9). Security: RLS tests on a real Postgres (`lib/__tests__/syncRls.test.ts`); `/code-review` per ticket.

---

## Step 4: Assess necessity and proportionality

- **Lawful basis.** `[FOUNDER]` with the reviewer. Proposed:
  - Accounts and sync: Art 6(1)(a) consent and Art 9(2)(a) explicit consent, given on TR1's consent screen (stored as `{version, at}` on the device and in the account; `runSync` refuses without it).
  - Coach: the same, on TR1's separate AI consent naming Anthropic (`hasAiConsent()`).
  - Describe a meal: today the person's tap is the only action; there is no explicit consent statement. See R1.
  - Health Auto Export: the person creates the token and sets up the automation; the setup sheet (`components/health/AppleHealthSheet.tsx`) explains it but has no consent statement. See R1.
  - Reminders: Art 6(1)(a) consent (the toggle); only dates are sent, which is arguably not health data.
  - Request and cost logs: Art 6(1)(f) legitimate interests (security, abuse and cost control).
- **Does it achieve the purpose; is there another way.** The engine needs daily data, so local storage is the default and the server only sees what a feature needs. Sync is the only way to keep data across devices; Health Auto Export exists for web users (the iPhone app reads Apple Health directly and sends nothing to us).
- **Function creep.** No analytics or advertising SDKs (`package.json`). Health data is never used for advertising (`/privacy`; App Store 5.1.3). Any new flow off the phone updates `/privacy` and this DPIA (privacy page header comment).
- **Data quality and minimisation.** Local-first; reminders carry dates only; tokens stored hashed; Open Food Facts gets only the words or code, through our server; the published-nutrition lookup sends only dish labels and serving (`lib/food/published.ts` `publishedRequest`); the coach is to receive derived summaries, not raw streams (`03-architecture.md` §7); values are never logged (CLAUDE.md rule 10, `lib/api/guard.ts`).
- **Information to individuals.** `/privacy` (TR2), linked from Profile → About → Privacy and from Support; TR1's consent screens.
- **Supporting rights.** Access and portability: Profile → Move to another phone (every backup key as text). Rectification: edit in the app. Erasure: delete entries, Disconnect and delete, reminders off, Delete account (TR1). Withdraw consent: Stop syncing (TR1), turn features off. Requests by email, answered within one month. Complaints: acknowledged within 30 days, looked into, outcome told (required since 19 June 2026); ICO route in `/privacy`. `[FOUNDER]` keep a simple log of requests and complaints (date in, acknowledged, closed).
- **Processors comply.** `[FOUNDER]` accept and file each DPA (step 2 table).
- **International transfers.** Anthropic (US); Vercel functions not pinned to `lhr1`; US-headquartered processors' sub-processors. `[FOUNDER]` record the mechanism for each (IDTA, UK Addendum to the EU SCCs, or the UK Extension to the EU-US Data Privacy Framework) and a transfer risk assessment if the reviewer asks for one.

---

## Step 5: Identify and assess risks

| # | Source of risk and potential impact on individuals | Likelihood | Severity | Overall |
|---|---|---|---|---|
| R1 | **AI and Health Auto Export without an explicit consent statement.** Describe sends free-text meals (health-related) to Anthropic in the US on a tap, with no screen naming Anthropic first; Health Auto Export sends health samples to our server with no consent statement. Breaches Art 9 if the tap is not explicit consent, and App Store 5.1.2(i) for Describe. TR1's AI consent covers the coach only. | Probable | Significant | High |
| R2 | **Unauthorised access to synced health data** (bug in RLS, stolen session on a shared device, leaked service-role key). Exposure of weight, food, sleep and heart data. RLS is on with own-row policies, tested on PGlite (`syncRls.test.ts`); the service role is server-only. | Remote | Severe | Medium |
| R3 | **Health Auto Export samples kept indefinitely** if the person stops using the app without disconnecting; anyone holding the token can read that device's samples. Token: 32 random bytes, stored hashed (`lib/physique/io/healthLink.ts`, `lib/server/supabaseRest.ts`). | Possible | Significant | Medium |
| R4 | **Transfer to the US (Anthropic)** without a documented mechanism or with longer retention than expected. | Possible | Significant | Medium |
| R5 | **Health data in iCloud.** The iPhone app's Library copy is part of the iCloud backup (`lib/storage/nativeMirror.ts`). Against App Store 5.1.3 (no personal health information in iCloud); review rejection or removal. | Probable | Significant | High |
| R6 | **No retention limit for inactive accounts**; deleted entries leave content-free markers indefinitely. Over-retention. | Probable | Minimal | Low |
| R7 | **Logs hold personal data**: Vercel request logs keep IPs and paths, including food search words in `?q=`; cost lines keep the device's client id. No health values (rule 10, `lib/api/guard.ts`). | Probable | Minimal | Low |
| R8 | **Erasure granularity**: a single sleep night or waist entry can't be deleted, only edited (`lib/physique/io/bodyData.ts` has no delete for them). | Possible | Minimal | Low |
| R9 | **Consent screen not built yet** (TR1 in progress). If accounts were switched on before TR1, data would sync without consent. FT4 is ordered after TR1. | Remote | Significant | Low |
| R10 | **Children** use the app; no age gate under 16. Age is asked at setup; no deficit under 18. | Remote | Significant | Low |
| R11 | **Harm from verdicts** (for example someone with disordered eating pushed toward a deficit). Safety question, calorie floor, no deficit under 18, silence below data gates. | Possible | Significant | Medium |
| R12 | **Secrets shared in an old cloud session** (service-role key, CRON_SECRET, Vercel token, Anthropic key) could give access to every user's server rows. | Possible | Severe | High |
| R13 | **No breach procedure.** A breach must be reported to the ICO within 72 hours where it risks people's rights. | Remote | Significant | Medium |
| R14 | **Database loss** (Supabase Free has no backups): synced data lost if the project fails. | Possible | Significant | Medium |

---

## Step 6: Identify measures to reduce risk

| Risk | Options to reduce or eliminate risk | Effect on risk | Residual risk | Measure approved |
|---|---|---|---|---|
| R1 | Gate Describe behind TR1's AI consent (`hasAiConsent()`): a one-time sheet naming Anthropic and saying what is sent, off by default, before the first Describe. Add an explicit consent line and tick to the Health Auto Export setup sheet before the token is shown. A small ticket after TR1. | Reduced | Low | `[FOUNDER]` |
| R2 | Keep RLS tests in `npm run check`; sign-out clears the session; TR1 delete route verifies the JWT and deletes only the caller (route test). | Reduced | Low | `[FOUNDER]` |
| R3 | Delete Health Auto Export devices (and samples) not seen for N days (`health_devices.last_seen_at` exists); say N in `/privacy`. | Reduced | Low | `[FOUNDER]` choose N |
| R4 | File Anthropic's DPA and transfer mechanism; consider zero data retention if offered for the account; Describe already sends only what the person typed. | Reduced | Low | `[FOUNDER]` |
| R5 | Exclude the Library copy from iCloud backup (`NSURLIsExcludedFromBackupKey` on the file, or move it to a non-backed-up location) and update `/privacy`; accounts give recovery instead. Fold into TR5 or its own ticket. | Eliminated | Low | `[FOUNDER]` |
| R6 | An inactive-account policy (for example 12 months, email first) and a scheduled job; purge deleted markers older than every device's cursor. | Reduced | Low | `[FOUNDER]` |
| R7 | Accept; move food search to POST if search words in logs are a concern. | Accepted | Low | `[FOUNDER]` |
| R8 | Add delete for a sleep night and a waist entry. | Eliminated | Low | `[FOUNDER]` |
| R9 | Keep FT4 after TR1; recheck `/privacy` TR1 claims when TR1 merges. | Reduced | Low | Yes (plan order) |
| R10 | Accept for testers (adults recruited directly); consider an age question that blocks under 16 before launch. | Accepted | Low | `[FOUNDER]` |
| R11 | Existing safety measures; testers' check-ins ask how verdicts felt. | Reduced | Low | `[FOUNDER]` |
| R12 | FT5: rotate every shared secret, update Vercel and `.env.local`, redeploy. | Eliminated | Low | `[FOUNDER]` |
| R13 | A one-page breach plan: who decides, how to assess, ICO report within 72 hours, tell affected people when high risk; keep a breach log. | Reduced | Low | `[FOUNDER]` |
| R14 | TR6 nightly encrypted `pg_dump`, kept 30 days, restore tested. | Reduced | Low | `[FOUNDER]` |

---

## Step 7: Sign off and record outcomes

| Item | Name/date | Notes |
|---|---|---|
| Measures approved by: | `[FOUNDER]` | Integrate actions back into the plan (`STATUS.md`), with date and responsibility |
| Residual risks approved by: | `[FOUNDER]` | If accepting any residual high risk, consult the ICO before going ahead |
| DPO advice provided: | `[FOUNDER]` | A DPO is likely not mandatory at tester scale; the reviewer confirms. The reviewer's advice stands in |
| Summary of DPO advice: | `[FOUNDER]` | |
| DPO advice accepted or overruled by: | `[FOUNDER]` | If overruled, explain why |
| Comments: | | |
| Consultation responses reviewed by: | `[FOUNDER]` | If the decision departs from testers' views, explain why |
| Comments: | | |
| This DPIA will be kept under review by: | `[FOUNDER]` | Review when a ticket changes what leaves the phone, before the paid launch, and at least yearly |
