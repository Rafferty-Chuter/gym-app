# 06 · Execution plan: from "works for me" to a paid coach

Agreed 2026-10-17 after M1, R1–R6, T1 and T2 shipped. Three sprints, each ending in a PR to main, a production deploy on both URLs, and one decision only the founder can make. Tickets keep their ids from `04-tickets.md`; sizes are focused days of Claude's work. Every ticket ends with `npm run check`, `npm run build`, phone-width screenshots, a STATUS row, a commit and a push.

## Sprint 0 · Organised and clear (added 2026-10-17, runs before Sprint A)

The founder's call after T2: park the coach, make the app something that keeps a lifter organised and clear on its own, with plain words and no motivational copy.

| # | Ticket | Size | What ships | Needs from the founder |
|---|---|---|---|---|
| 01 | **W1 Weekly report** | 1 | `lib/physique/weekReport.ts` (pure) and `/report`: for any Monday-to-Sunday week, weight trend and rate, expenditure move, intake average and days logged against target, protein, sessions and hard sets per muscle, main-lift e1RM changes, sleep mean and debt, the week's verdict, and every gap (unlogged food days, missing weigh-ins, missing nights) as a list with one-tap fixes. Numbers and the engine's words only. A line on Home opens the latest report. | — |
| 02 | **W2 Gaps stated plainly** (done 2026-10-17) | 0.5 | On Home, Food, Body and Sleep: "Thursday has no food logged" with log / copy a day / fasting or a total; missed weigh-ins and nights open their sheet on that day. No streaks, no nudges. | — |
| 03 | **S5 Apple Health auto-upload** (built 2026-10-17, awaiting keys) | 1.5 | Health Auto Export pushes sleep, HRV, resting HR and weight to `/api/ingest/hae`; a device token the user pastes once; the app pulls new nights on open; manual logging stays as the fallback. Needs a server store. | **H3:** create a Supabase project (free tier) and add its URL and service key to Vercel. Health Auto Export Premium (about £7 a year). |
| 04 | **G5 Reminders** (built 2026-10-17, awaiting the SQL) | 0.5 | Web push that fires only on a gap and says only what is missing. One a day at a chosen time; the phone uploads which days are logged, the server applies the W2 rules and stays quiet otherwise. | Run `supabase/migrations/0002_push.sql` with the cron secret; add the app to the iPhone Home Screen and turn reminders on in Profile. |
| 05 | **S1 to S3 Accounts and sync** | 3 | Since the Supabase project exists: sign-in, row-level security, local-first sync. | — |

Sprint A (the coach) resumes after Sprint 0. The chat assistant itself stays parked (`ASSISTANT_ENABLED` in `lib/features.ts`, 2026-10-17) until the founder asks for it back; Sprint A's rules ship as engine verdicts and plain copy.

## Sprint A · The coach (what makes it worth paying for)

Goal: after this sprint the app tells a natural intermediate lifter what to do next session, this week and this phase, from food, training and sleep together.

| # | Ticket | Size | What ships | Acceptance |
|---|---|---|---|---|
| A1 | **T3 Template targets** | 0.5 | Rep range and per-set RIR targets on template exercises, migrated from role defaults; shown in the logger header line. | Every seeded template has targets; the logger shows "8–12 · RIR 2". |
| A2 | **T4 One progression rule** | 1 | `lib/training/progression.ts`: MacroFactor's rule on e1RM_adj, equipment profiles and snapping, rep-range expansion, double progression when RIR coverage < 50 %. Replaces the three existing implementations; `/api/refine-target` and the OpenAI key go. | "Next: 82.5 × 8" on every exercise with history; tests for the six rules in research B §8. |
| A3 | **T5 Muscle priorities and weekly sets** | 1 | Emphasise / Grow / Maintain per muscle; weekly set targets from the volume landmarks; a one-tap soreness rating after a session; Train week bars read under / in range / over. | Set targets move with the RP table; the bars change colour only on evidence. |
| A4 | **T6 Mesocycles and deloads** | 1 | Scheduled deloads by training status; triggered deloads from perf 4 (could not match last week); −50 % sets, −10 % load, RIR ≥ 4. | A deload week is detected and prescribed; the strength engine excludes it as it already does. |
| A5 | **T7 Phase-aware rules** | 0.5 | On a cut: hold load, cap set increases at +1. On a lean bulk: push volume to the ceiling, watch the gain-rate ceiling. Wired to `PhysiqueGoal`. | Scenario tests for cut and bulk. |
| A6 | **G1 Phase planner** | 1 | Goal → timeline of phases (cut, maintenance ≥ 2–4 weeks, lean bulk, diet breaks) with the moving ETA per phase and milestones. | The Body page shows the phase strip; the ETA per phase follows the trend rate. |
| A7 | **G3 Monday review** | 1 | The weekly check-in becomes one screen: nutrition, training and sleep, ending in one decision, explained by the assistant. | One tap accepts; the program and the training week update together. |
| A8 | **G4 + G5 Morning card and reminders** | 1 | Home opens on last night's sleep, today's session and today's targets. Web push for weigh-in and check-in in the home-screen app. | Push arrives on an iPhone home-screen install. |

**Decision gate A (founder):** use it for seven days. Note every verdict that felt wrong. Fix those before Sprint B.

## Sprint B · The product (what a subscription requires)

Goal: data that survives a phone change, logging that costs nothing to keep up, and a way to pay.

| # | Ticket | Size | What ships | Needs from the founder |
|---|---|---|---|---|
| B1 | **F6 + F4 + F8 hardening** | 1.5 | Characterisation tests on the old training engine, the assistant route split, API hardening. Done first because B2 onward touch the same code. | — |
| B2 | **S1 + S2 Accounts** | 1.5 | Supabase schema with row-level security; sign-in with Apple and Google. | **H3:** create the Supabase project, add the keys to Vercel. |
| B3 | **S3 Local-first sync** | 1.5 | localStorage stays the source of truth on device; a sync layer reconciles with Supabase; works offline. | — |
| B4 | **S4 + S7 Import and backups** | 1 | Import the browser's data into the account; MacroFactor and Hevy CSV import; export and restore. | — |
| B5 | **S5 + S6 Apple Health** | 2 | Health Auto Export ingest for sleep, HRV, resting HR and weight; the recovery rules that need wearable data. | **H4:** install Health Auto Export and point it at the endpoint. |
| B6 | **M4 Food database** (pulled forward, done 2026-10-17) | 3–5 | CoFID (the UK government dataset, 2,726 generic foods, offline) as the base list with household portions, Open Food Facts for UK products by name and barcode, Describe for the rest, recents and saved foods. | — |
| B7 | **Onboarding** (pulled forward, done 2026-10-17) | 1 | A one-screen welcome on first open (Set up opens the weight sheet with the goal flow a tap away, or Look around first); the Get started checklist built the same day was dropped at the founder's request; every tab's empty state names the next action; the week report is honest before the first record. | — |
| CL1 | **Cleaning pass** (done 2026-10-17, pulled forward) | 1 | Profile rebuilt as a settings page, legacy coach pages retired behind redirects, Routines, Start workout, History and the routine editor on the tokens, copy audit ("routine", UK dates). | — |
| B8 | **Billing** | 2 | Stripe on the web; App Store subscriptions once native. Free: logging and trends. Paid: the coach, Describe, Apple Health, sync. Two-week trial. | Stripe account; pricing decision. |
| B9 | **AI cost control** | 0.5 | Per-plan daily caps, a cheaper model for Describe, cost per user on a dashboard. | — |
| B10 | **Legal and privacy** | 1 | Privacy policy, terms, UK GDPR for health data, delete-my-account that works, Anthropic as a processor. | Read and approve the texts. |
| B11 | **Native wrapper** (pulled forward; parked 2026-10-17 until the founder says go) | 2 | Capacitor around the web app for the App Store and Play Store; push and Health access. Notes from the first pass: `npx cap add ios` works from Linux with Capacitor 8 (Swift Package Manager, no CocoaPods); the shell loads the production URL so web and native ship together; a small Swift HealthKit plugin feeds `mergeSamples` so Health Auto Export is no longer needed on native; the build, signing and upload run on the founder's Mac with Xcode. | Apple Developer account (£79/yr) enrolled first: the identity check takes 1 to 3 days. Xcode on the Mac. Google Play account later. |
| B12 | **Reliability** | 1.5 | Error reporting, uptime check, staging environment, tests on every push, GitHub → Vercel deploys fixed. | — |

**Decision gate B (founder):** the price. Proposal: £6.99 a month, £49.99 a year, two-week trial.

## Sprint C · It sells

| # | Step | Size | What ships |
|---|---|---|---|
| C1 | **M7 Testers** | 2 weeks calendar | Ten lifters for a month, weekly calls, every wrong verdict becomes a test case. Nobody is charged yet. |
| C2 | **Landing and pricing page** | 1 | One screen: the verdict, the ETA, the logger. Priced against MacroFactor and Hevy Pro. |
| C3 | **Feedback loop** | 0.5 | In-app "this verdict is wrong" that attaches the engine's inputs to a report. |
| C4 | **Launch** | — | App Store, Play Store, web. Reddit r/naturalbodybuilding and r/macrofactor, two creators approached with the sleep × lifts angle. |

**Decision gate C (founder):** week-four retention of the testers. A third still opening it daily means ship; less means fix the verdicts first.

## Standing rules while executing

- One ticket at a time, in this order, unless dogfood notes change it. Sacred files get small serial edits.
- Every ticket is pure engine first, tests second, UI third, screenshots fourth.
- Silence beats a wrong verdict. A rule that cannot be tested on seeded scenarios does not ship.
- Deploy production from the branch after each ticket so the founder's phone is always current; PR to main at each sprint end.
- The founder's open items carried from M1: add `ANTHROPIC_API_KEY` to the Vercel project; revoke the pasted Vercel token and issue a new one.

## Threat watch

MacroFactor Workouts (January 2026) is a separate strength app from the nutrition incumbent, with auto-progression, RIR and a plate calculator, with no sleep layer and no cross-signal verdict. If they connect their two apps, our pitch narrows to "one coach, calmer, cheaper". Sprint A and the testers come before anything in Sprint B that is not sync.
