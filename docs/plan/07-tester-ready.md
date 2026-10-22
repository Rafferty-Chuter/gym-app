# 07 — Ready for testers

What has to be true before the first outside lifter installs the app through TestFlight, split into steps only the founder can do (**FT**) and tickets a Claude Code session can take on its own (**TR**). Written 2026-10-21 at the end of the session that built PR3 to PR5; see `HANDOFF.md` for where the code stands and `STATUS.md` for the evidence.

**The aim of the test.** 5 to 20 lifters log for 6 to 8 weeks. We learn four things: do they keep logging (weeks 2 and 4), do they open Progress, when Connections appear do they believe them, and would they pay and how much. Everything below serves that; nothing else is in scope.

## How to run these in parallel

- Each TR ticket is one session. Start it with: "Read `CLAUDE.md`, `docs/plan/HANDOFF.md`, then ticket TRn in `docs/plan/07-tester-ready.md` and do it." The session works on its own branch off `claude/admiring-ptolemy-mz6jwu` and merges back when its checks pass.
- Follow the usual ticket pattern (CLAUDE.md "Before you say a ticket is done"): earn its place, Mobbin where the UI is new, tests, `npm run check`, `npm run build`, a 390px browser check in light and dark, `/code-review medium`, a `STATUS.md` row in the "Tester-ready" section, commit, push.
- **Files two tickets touch** (do these serially or merge carefully): `app/account/page.tsx` (TR1 only), `app/layout.tsx` (TR3, a one-line add), `docs/plan/STATUS.md` (every ticket adds one row: append, don't rewrite).
- The founder is building the AI coach (assistant) in a separate session; no TR ticket touches `app/api/assistant/route.ts` or `app/assistant/page.tsx`.

## Order

```
Now, in parallel:  FT1 FT2 FT3 FT5 FT6 FT8   TR1 TR2 TR3 TR4 TR5 TR6   (TR7 if time)
After TR1:         FT4 (accounts on for everyone; for the founder alone it can go on now)
After FT1+FT2+FT3: FT7 (build and upload to TestFlight)
After FT7:         TR8 (real-device check) → send testers the TestFlight link
```

Testers get the link only when TR1, TR2, TR3, FT4 and FT7 are done.

---

## Founder steps (FT)

### FT1 · Apple Developer Program
- Enrol as an individual in the Apple Developer app on the iPhone (scans your ID; 1 to 3 days). £79 a year. Use the Apple ID that will own the app long term.
- A limited company can come later for the paid launch (the account can move to an organisation with a D-U-N-S number).

### FT2 · Xcode
- Either update to macOS Tahoe 26.6+ and install Xcode 27 from the App Store, or stay on Sequoia and download Xcode 26.x from developer.apple.com/download/all. Uploads need Xcode 26 or later today.
- Open Xcode once, accept the licence, download the iOS platform (Settings → Components), then in a terminal: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer` and `sudo xcodebuild -license accept`.

### FT3 · Deploys that work
- The Vercel Hobby limit (100 deploys a day across every project on the account) blocked deploys on 21 Oct. Either connect the GitHub repo to the Vercel project (Settings → Git) so a push deploys, or install the CLI (`npm i -g vercel`, `vercel login`, `vercel link`, `vercel deploy --prod`; check the log says "Aliased").
- Move client sites off this account or go Pro: they share the deploy limit and break Hobby's non-commercial rule.

### FT4 · Switch accounts on (after TR1 for testers)
1. Supabase → SQL Editor: run `supabase/migrations/0003_sync.sql`. *(Done 22 Oct.)*
2. **Custom SMTP first.** Supabase's built-in sender only emails your own team's addresses (2 an hour) and won't let you edit the templates. Resend (free, 3,000 a month): Authentication → Emails → Set up SMTP, host `smtp.resend.com`, port 465, user `resend`, password a Resend API key. *(Done 22 Oct with the test sender `onboarding@resend.dev`, which only reaches the Resend account's own email; **before testers, buy a domain and verify it in Resend**, then change the sender to an address on it.)*
3. Authentication → Sign In / Providers: Email on, and in its settings **Email OTP length 6** (this project defaulted to 8, which the app's 6-digit field refuses; fixed 22 Oct). Emails → "Magic link or OTP" **and** "Confirm signup": subject "Your sign-in code", body with `{{ .Token }}` so the email carries the 6-digit code (no link: on an iPhone it opens Safari).
4. Vercel: set `NEXT_PUBLIC_SUPABASE_URL` (same value as `SUPABASE_URL`) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API), redeploy.
5. Sign in on your own phone first (Profile → Account): your data goes up to your account. Then sign in on a second browser and check it arrives.

### FT5 · Rotate the keys shared in the old cloud session
Vercel token, Anthropic key, Supabase service-role key, `CRON_SECRET`. Update them on Vercel (and `.env.local`), redeploy.

### FT6 · Feedback and support
- Make a short Tally form ("What happened, what did you expect, screenshot") and set `NEXT_PUBLIC_TALLY_FEEDBACK_URL` on Vercel.
- Set `NEXT_PUBLIC_SUPPORT_EMAIL`.
- Optional: a free Sentry account if TR3 should report there (give the session the DSN).

### FT7 · Build and upload to TestFlight
- Follow `docs/plan/B11-iphone-app.md` (signing, archive, upload). TR5 prepares the privacy manifest and the review text first.
- Use **external testing, inviting each picked tester by email** (testers are strangers from online; on a public link they show up anonymous and the link can be passed on; see `testers/signup.md`). The first build gets a light Beta App Review, usually about a day but sometimes up to two weeks in 2026, so submit it as soon as enrolment clears; sign-in is optional so no demo account is needed. TestFlight asks for a feedback email and a test description (TR5 writes it).

### FT8 · Recruit about 20 lifters (from about 30 sign-ups)
- Training 3+ times a week; ideally some already log in Hevy, Strong or MacroFactor (to test imports) and a few wear an Apple Watch (sleep, HRV).
- Strangers from online (22 Oct: the founder can't count on people he knows). Where, ranked, with each place's rules: `testers/recruit.md`, from `research/K-tester-channels.md`. Sign-up form and picking: `testers/signup.md`.
- Sign them up now; send TestFlight invites only when the build is approved, so their 8 weeks start with a working app.

### FT9 · Before or soon after testers start (legal basics, UK)
- Pay the ICO data protection fee (tier 1, £52; £47 by direct debit).
- Fill in the DPIA draft that TR2 leaves in `docs/plan/legal/` (AI plus health data needs one).
- Have the privacy notice (TR2) read by someone who knows UK GDPR. Not legal advice from us.

---

## Claude Code tickets (TR)

### TR1 · Accounts: consent before data leaves the phone, and delete account
M–L · depends on: — · skills: `impeccable` (critique, polish), `run`
Read first: `CLAUDE.md`; `STATUS.md` rows PR4 (accounts and sync) and PR5; `lib/sync/*`, `app/account/page.tsx`, `components/sync/AutoSync.tsx`, `supabase/migrations/0003_sync.sql`, `lib/__tests__/syncRls.test.ts`, `app/api/health/` (the Apple Health link's server rows), `lib/physique/io/healthLink.ts`.

Why: UK GDPR treats fitness and health data as special category (explicit consent needed, its own clear statement); Apple 5.1.1(v) requires deleting the account inside the app; 5.1.2(i) requires explicit permission before personal data goes to a third-party AI.

Do:
1. **Consent.** Before the first sign-in (and so before any sync), a screen that says in plain words what goes to the account (weight, food, sleep, training, Apple Health readings), where (Supabase, London), why (to keep it safe and on every device), and that it can be withdrawn and deleted. One explicit tick, not pre-ticked, separate from anything else. Store `{version, at}` on the device and in the account (a row in `sync_records` under a key such as `consent.v1`, or a small table if cleaner; record the choice in STATUS). No consent, no sync: `runSync` refuses.
2. **AI consent** (for when the coach is on): a separate, off-by-default consent naming Anthropic, stored the same way, exposed as a function the assistant session can check (`hasAiConsent()`); the chat itself is the founder's other session.
3. **Withdraw:** Profile → Account → "Stop syncing" turns sync off and offers deletion.
4. **Delete account:** Profile → Account → "Delete account". A confirm sheet that says exactly what goes (the account, every synced record, the Apple Health link's server rows for this user) and what stays (this device's own data, with a second option to clear this device too). A server route (`POST /api/account/delete`) verifies the Supabase JWT, deletes the user with the service role (`auth.admin.deleteUser`; `sync_records` cascades), deletes any health ingest rows tied to the user, returns 200; zod body, no health values logged, generic errors. Sign out after. When subscriptions exist this sheet must also say Apple billing continues and link to subscription management (leave a TODO note).
5. Tests: consent gates sync (unit), the delete route refuses without a valid JWT and deletes only the caller (route test with a mocked Supabase admin client), RLS still holds (`syncRls.test.ts`). End to end with the fake Supabase pattern in PR4 (`.claude/launch.json` "dev-accounts-fake"): consent → sign in → sync → delete → signed out, local data kept.

Acceptance:
- [ ] No sync and no upload without the consent tick; withdrawing stops sync.
- [ ] Delete removes the account and its server rows, signs out, keeps or clears local data as chosen.
- [ ] AI consent exists, off by default, readable by the assistant.
- [ ] Copy is plain (no "special category", no legal jargon on screen), short, calm.

### TR2 · Privacy notice and DPIA draft
S–M · depends on: — · skills: none
Read first: `app/privacy/page.tsx` (current notice), `STATUS.md` PR4, `lib/sync/run.ts` (what syncs and what stays), `docs/plan/03-architecture.md` §7, the research notes in this file (below).

Do:
- Update `/privacy` so every statement is true of the code: what stays on the device, what syncs to the account and where (Supabase, London), Apple Health (read on the phone; Health Auto Export path), the AI coach (Anthropic, only with the separate consent, what is sent), retention, deletion (TR1), rights (access, correction, deletion, withdrawing consent), how to complain to us and to the ICO (a data-protection complaints procedure has been required since 19 June 2026), the controller's contact (`NEXT_PUBLIC_SUPPORT_EMAIL`).
- Write `docs/plan/legal/DPIA-draft.md` from the ICO template headings, filled with what we know, `[FOUNDER]` where only the founder can answer.
- Mark the page "Last updated" and keep it plain; note in STATUS that it needs a human with UK GDPR knowledge to read it.

Acceptance: every claim matches the code (cite the file in a comment); the page reads in under three minutes; the DPIA draft exists.

### TR3 · Error reporting
S–M · depends on: — (Sentry DSN from FT6 optional)
Read first: `app/layout.tsx`, `CLAUDE.md` rule 10 (no health values in logs), `lib/api/guard.ts`.

Do:
- `app/error.tsx` and `app/global-error.tsx`: a calm "Something went wrong" with Reload and Send feedback (Tally link), never a blank screen.
- Report client errors: if `NEXT_PUBLIC_SENTRY_DSN` is set, use Sentry (`@sentry/nextjs`, no session replay, no PII, scrub request bodies); otherwise a small built-in `POST /api/client-error` (zod, size cap, rate limit, logs message, stack, route and app version only; never values from storage) that writes to the Vercel logs.
- An app version string visible in Profile (from `package.json` or the build), so a tester can say which build.

Acceptance: a thrown error in a page shows the error screen and reaches the chosen sink with no health values (test asserts the payload shape); `npm run build` passes.

### TR4 · Tester kit
S · depends on: — · skills: none (copy in the founder's voice: plain, calm, peer-level, no hype)
Read first: `PRODUCT.md`, `CLAUDE.md` "The final goal", this file's aim.

Do, in `docs/plan/testers/`:
- `recruit.md`: a short message for the gym and for Discord/Reddit (two versions), who we want, what it asks (6 to 8 weeks, log daily), what they get.
- `guide.md`: one page: install TestFlight and the app, first-run setup, connect Apple Health, import from Hevy or Strong (where in the app), what to log each day, how to send feedback, how to delete their data.
- `checkins.md`: questions for weeks 2, 4 and 8 (still logging? opened Progress? believed a connection? what confused you? would you pay, how much, monthly or yearly?) as a Tally-ready list.
- In the app: make "Send feedback" easy to find (Profile, and the error screen from TR3) using `NEXT_PUBLIC_TALLY_FEEDBACK_URL`.

Acceptance: each file fits on one screen; the in-app feedback link works when the variable is set and hides when it isn't.

### TR5 · iOS: ready for TestFlight review
S–M · depends on: — (the upload itself is FT7)
Read first: `docs/plan/B11-iphone-app.md`, `capacitor.config.ts`, `ios/App/App/Info.plist`, `ios/App/App/App.entitlements`, the research notes below (4.2 and the privacy manifest).

Do:
- Add `ios/App/App/PrivacyInfo.xcprivacy` declaring the required-reason APIs the app and its plugins use (Capacitor Preferences → UserDefaults CA92.1, Filesystem → C617.1 if used; check `@capgo/capacitor-health` ships its own manifest) and the data types collected (Health, Fitness, Contact info, Identifiers; linked to the user; not used for tracking).
- Check the HealthKit purpose strings in `Info.plist` are specific ("Reads sleep, HRV, resting heart rate, weight, body fat and steps to show them beside your training"), and that nothing writes to Health.
- Write `docs/plan/testers/testflight.md`: the TestFlight "What to test" text, the beta app description, the review notes for Apple (lead with what a browser can't do: reading Apple Health on the phone, offline start page; sign-in optional so no demo account needed), and the App Privacy answers for App Store Connect.
- Bump the build number guidance in `B11-iphone-app.md` if needed.

Acceptance: the manifest validates (Xcode not needed to write it; note in STATUS that FT7 checks it in Xcode), the texts are ready to paste.

### TR6 · Nightly database backup
S · depends on: FT4 (the database exists already)
Read first: `docs/plan/research/D-architecture-tooling.md` §3.1 (Free tier has no backups), `supabase/migrations/*`.

Do:
- `.github/workflows/db-backup.yml`: nightly `pg_dump` of the Supabase database (connection string in a GitHub secret `SUPABASE_DB_URL` that the founder adds), compressed, encrypted with a passphrase secret, uploaded as a workflow artifact kept 30 days. A `docs/plan/backups.md` with how to restore.
- No data in logs.

Acceptance: the workflow runs on `workflow_dispatch` (founder triggers once after adding secrets); restore steps written and tried against a local Postgres (PGlite or Docker) with a dump of the schema.

### TR7 · Import food history from MacroFactor (and MyFitnessPal if simple)
M–L · depends on: — · nice before testers, not required
Read first: `lib/csvImport.ts` (Hevy, Strong, Rep Count; `workoutFormatOf`), `lib/physique/io/dailyLogImport.ts`, `app/profile/import/page.tsx`, `STATUS.md` C7 (workout file in the daily-log box) and S4a.

Why: the payoff (maintenance after 21 days, Connections after about 24 sessions) takes weeks; a switcher with history should see real Progress on day one.

Do: find MacroFactor's export format (and MyFitnessPal's) from public docs or a sample the founder provides (never invent one); detect it in the import box; map days to food entries (kcal and macros per day at least) and bodyweight to weigh-ins; skip what already exists; preview then import. Tests with a small anonymised sample.

Acceptance: a MacroFactor export imports in one step, Progress shows maintenance and the weight trend straight after, a second import adds nothing.

### TR9 · Sign in from the welcome screen
S · depends on: PR4, TR1 · done 2026-10-22

Why: a tester who reinstalls, changes phone or opens the web app on a second device lands on the welcome screen with only "Set up" or "Look around first", so they either set up a second goal beside the one in their account or have to find Profile → Account. The analysis needs weeks of history; it must follow them.

Do: a quiet "Have an account? Sign in" line under the welcome buttons (accounts on only), opening `/welcome/sign-in`: the same consent, email and code as Profile → Account, then the first sync, then Home with their data. An account with nothing logged says so ("Nothing logged in this account yet", the email shown) and offers Set up or Use another email (a typo).

Acceptance:
- [x] Nothing reaches the account before the tick; the line is hidden while accounts are off.
- [x] A returning person on a fresh device lands on Home with their data; the welcome doesn't come back.
- [x] An empty account says so; Set up and Use another email both work.

### TR10 · iPhone app: pages clear the status bar
S · done 2026-10-22 (found on the first simulator run)

The shell draws under the status bar, and pages didn't pad for it, so Home's title sat under the clock. `viewport-fit=cover`, a body padding and a strip behind the clock, sticky headers pinned below it. Web only: it reaches the app with a deploy. Checked in the simulator in light and dark; details in STATUS.

### TR11 · Reminders in the iPhone app
M · this session (22 Oct) · must be in the first TestFlight build (native change)
Why: the app's web view has no web push, so the daily nudge and the Monday report never fire in the app; whether testers keep logging is the test's first question. Local notifications scheduled on the phone (`@capacitor/local-notifications`), no APNs and no server; rescheduled each time the app opens or something is logged, so a day already logged stays quiet. Owns `components/physique/RemindersSection.tsx` and the reminder code.

### TR12 · Progress and the report say it plainly
M · its own session (start: "Read `CLAUDE.md`, `docs/plan/HANDOFF.md`, then TR12 in `docs/plan/07-tester-ready.md` and do it") · web only, ships with a push to `main`
Read first: `CLAUDE.md` ("The final goal", rules 2 and 3), `PRODUCT.md`, `DESIGN.md`, `lib/physique/connections.ts`, `components/report/Connections.tsx`, `lib/physique/linkedReasons.ts`, `lib/physique/weekScorecard.ts` (`rateVsPlan`), `lib/physique/copy.ts`, `app/profile/page.tsx`; the founder's preferences: short facts and numbers on the cards, the coach explains at length later; kg first, % second.

Why: the founder, looking at Progress on 22 Oct: a Connections row reads "Carbs the day before · 312 vs 221 g · Moved with calories · +5 kg on squat", which doesn't say what it means. It should lead with one plain sentence a lifter gets at a glance, then the numbers. This is the "would they believe it, would they pay" part of the test.

Do:
1. **Connections lead with a plain sentence.** One line in the person's terms, then the data. Facts from their data, never causes or advice: not "You train better with more carbs" (a cause, and "better" is vague) but "Your squat is about 5 kg heavier the day after a higher-carb day" with "312 g vs 221 g of carbs · 46 sessions" under it. Keep the hedge the engine already has ("Moved with calories" becomes plain: "Calories rose too, so it could be either"). Rows with no link stay quiet ("No clear link"). Copy what's proven: WHOOP's and Bevel's insight lines ("On days after…, your … is …") on Mobbin; name the screens used in STATUS.
2. **The verdicts agree.** Today one week can read "Not clear yet" (headline), "On plan" (weight tile) and "Weight moving as planned" (finding) at −0.2 kg a week against −0.4. The engine is right (not confidently off plan), the words overclaim: when the rate is inside the band only because of its margin, say "Not clear yet" (or similar), never "On plan". Same rule on Home's "Last 7 days".
3. **kg first.** Home's verdict, Home's weight tile and the report's body-weight section lead with %/wk; Progress already leads with kg. kg a week first, % second, everywhere.
4. **Copy from before accounts.** Profile: "Your log is stored on this phone. Move it across before switching phones" is wrong once signed in (say the account keeps it when signed in, keep the move-across line only when not); the Import row lists "sample data" and misses MacroFactor (TR7). Don't touch the Reminders section (TR11 owns it).

Acceptance: a person who has never seen the app reads each Connections row and can say what it means in one sentence; no screen shows "On plan" next to "Not clear yet" for the same week; rates read in kg first; tests for the new wording; `npm run check`, `npm run build`, 390px light and dark with the CONNECTIONS seed; `/code-review medium`; a STATUS row.

### TR8 · Real-device check (after FT7)
S · depends on: FT7 · a session with the founder holding the phone
Checklist on the TestFlight build: first run and setup; turn on the daily reminder (iOS asks once), and a reminder opens the right screen when tapped (TR11); email code autofills from Mail and signs in; consent shows before sync; Apple Health connect and the first read; weigh-in, food and a workout logged; Progress in light and dark, the example view; safe areas and the keyboard on every input; offline start; delete account; feedback link. Record pass or fail per line in STATUS; anything failing becomes its own ticket.

---

## Research notes (21 Oct 2026, checked against Apple, ICO and gov.uk)

- TestFlight external testing needs a light Beta App Review on the first build. A public link is simplest for friends.
- 4.2 (a repackaged website): our Capacitor app loads the live site. Lead with the native parts in the review notes (Apple Health on the phone, offline start). Changing features after review without saying so breaks 2.5.2 / 2.3.1.
- 5.1.1(v): account deletion inside the app. 5.1.2(i) (since Nov 2025): explicit permission before personal data goes to a third-party AI, naming it. 5.1.3: Health data never for advertising, a privacy policy, no health data in iCloud. 4.8 (Sign in with Apple) does not apply to email codes alone.
- UK: health data from fitness trackers is special category (explicit consent); ICO fee £52; DPIA expected (AI plus health data); privacy notice per Article 13 plus a complaints procedure (since 19 June 2026).
- Paid launch (not needed for testers): subscriptions in the iOS app use In-App Purchase (15% on the Small Business Program); in the UK the app can't point to web checkout yet (CMA decision pending); RevenueCat plus Stripe is the usual way to join web and iOS.
