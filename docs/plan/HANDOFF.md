# Handoff (2026-10-22)

For a session picking up after the 21 Oct local session (PR3 to PR5, then the tester-ready tickets). Read `CLAUDE.md` first, then this, then `docs/plan/07-tester-ready.md` and the "Tester-ready" section of `STATUS.md`.

## Start here

- **22 Oct:** TR9 done (sign in from the welcome screen). Accounts half switched on (FT4: migration, SMTP through Resend, local `.env.local`; templates and the Vercel variables left). The Supabase project is in Frankfurt, not London; wording fixed. **Deploys work (FT3):** the repo is connected to Vercel, a push to `main` deploys, only `main` deploys (`vercel.json`); production is at `8357307`. Ship by fast-forwarding `main` from a session on the founder's Mac, only when he says so (Hobby blocks commits authored by Claude). No Xcode yet.
- **Goal now: outside testers on TestFlight.** All session tickets TR1 to TR7 in `07-tester-ready.md` are done and merged (consent and delete account, privacy notice and DPIA draft, error reporting, tester kit, iOS privacy manifest and review texts, nightly backup workflow, MacroFactor import). `npm run check` (699 tests) and `npm run build` pass on `c5e7d78`. TR8 (real-device check) waits for the TestFlight build.
- **Waiting on the founder (FT steps in `07-tester-ready.md`):** Apple Developer enrolment is stuck: the app refused his UK driving licence, he has emailed Apple to verify with his passport (passports are accepted in most regions; the Apple ID name must match exactly). Xcode not installed yet (his Mac: macOS 15.7.3 Sequoia, M4; Xcode 26.x runs on it, Xcode 27 needs Tahoe 26.6+). Not yet done: deploy (FT3), accounts switched on (FT4, now allowed since TR1 is in), rotate keys (FT5), Tally form and support email (FT6), recruit testers (FT8), ICO fee and a UK GDPR read of `/privacy` and `docs/plan/legal/DPIA-draft.md` (FT9).
- **The founder is building the AI coach in his own separate session.** Don't touch `app/api/assistant/route.ts` or `app/assistant/page.tsx` without asking.
- **Naming clash:** STATUS also has older "TR1–TR7" rows (training redesign, 18 Oct). The tester-ready tickets are the ones in the "Tester-ready" section.
- **Local setup on the founder's Mac:** the repo is `/Users/raffychuter/gym-app`; an older clone at `~/Desktop/postbag/gym-app` is stale, don't use it. The dev server for him runs on http://localhost:3000 from this repo. `.claude/launch.json` (not committed) has "dev" and "dev-accounts-fake" (the app pointed at a fake Supabase for testing sign-in and sync with Playwright). Session worktrees live in `.claude/worktrees/` (lint skips them); they can be cleaned up once merged. If the dev server serves a stale stylesheet, stop it, delete `.next/dev`, start again.
- **Strategy agreed with the founder:** TestFlight with 5 to 20 lifters for 6 to 8 weeks before any public App Store launch; polish only what testers hit; imports (Hevy, Strong, MacroFactor, Apple Health backfill) matter because the analysis needs weeks of data. Paid launch later needs In-App Purchase (RevenueCat plus Stripe on web), possibly a limited company; research notes at the end of `07-tester-ready.md`.

## Where things stand

- Branch `claude/admiring-ptolemy-mz6jwu`. Everything below is committed and pushed.
- Production (gym-app-eta-nine.vercel.app and gym-app-psi-wheat.vercel.app, one deploy updates both) is at `8357307` (22 Oct): everything through TR9. A push to `main` deploys; the Vercel CLI is not needed.
- 21 Oct local session (STATUS rows PR3 to PR5): Progress redesigned (goal first; Connections as a ranked list in kg with a session strip on tap; Findings in one line each; labelled charts; each main lift in kg, which was X1; HRV and resting HR with a watch; short histories open on All; no maintenance gap from an incomplete log), "Early read" gone from Train, "Ask the coach why" behind the parked assistant (`ASSISTANT_ENABLED`), and accounts and sync (PR4), off until the founder runs `supabase/migrations/0003_sync.sql`, turns on email codes and sets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel (steps in the PR4 STATUS row).
- Why: the Vercel account is on the free Hobby plan, whose limit (100 deployments in 24 hours) is shared by every project on the account. A client site there (mad-hatters-party-shop-website) rebuilds on every TinaCMS save and used it up. gym-app is not linked to Git on Vercel, so pushing never deploys; it deploys from the CLI only. Check the deploy log for "Aliased", not just the exit code.
- A cloud session has a reminder to retry the deploy at 10:05 UTC on 22 Oct.

## How the founder wants the app

- **The final goal** is in `CLAUDE.md` (Working path). Every new build: earn its place against the other apps and the person's own effort, then copy what's proven (Mobbin) when guidance is thin.
- **Facts, not advice.** Say what the data shows, never what to do. Safety notes are the exception. Evidence-backed findings are welcome, with the source named.
- **Simple and organised.** No purposeless elements, no coaching plans, short copy. If something can't be understood at a glance, cut it.
- **Analysis is the heart of the app**: Progress (all data on one timeline, Findings, Connections) and the weekly report.
- **Insight a person can't get on their own**, from their own data. The engine finds the links (statistics, strict false-positive bar); AI is for explaining them later, never for finding them.
- **Personal baselines over fixed numbers**: sleep is read against the person's usual, not 8 hours.
- **Quality bar**: MacroFactor, WHOOP, Bevel. `DESIGN.md` is normative.
- **Every chart answers a tap** on its points (T1).

## Open work

**Next: getting ready for testers.** `docs/plan/07-tester-ready.md` lists every founder step (FT) and every session ticket (TR), with the order, what each touches and the acceptance criteria; STATUS has a "Tester-ready" section. One session per TR ticket. The AI coach is being built in the founder's own separate session.

1. **Done in PR3:** each main lift on Progress (X1).
2. **Deploy** everything once the Vercel limit allows, then smoke-test both hosts.
3. **Accounts** built (PR4) with consent and delete account (TR1) and a nightly backup workflow (TR6, the founder adds the secrets and triggers the first run). Left: the founder's switch-on steps, a real-project smoke test on the phone, API routes keyed by `auth.uid()` for the daily AI cap. (Sign-in for a fresh device is on the welcome screen, TR9.)
4. **Progress for a new user** (PR5): a list of what each part needs and "See an example" on made-up data.
5. Earlier offers waiting on the founder: gate changes (MIN_LOGGED_SHARE 0.7, MIN_WEIGHIN_RATIO 0.25), the AI coach as a premium feature. (The MacroFactor import is done, TR7; "Body tab" is gone from the assistant prompt, PR3f.)

## The founder's own to-dos

- Rotate the secrets that were shared in the cloud session: the Vercel token, the Anthropic key, the Supabase service key, CRON_SECRET.
- Set `NEXT_PUBLIC_SUPPORT_EMAIL` (and `NEXT_PUBLIC_TALLY_FEEDBACK_URL` if wanted) on Vercel, then redeploy.
- Client websites on the Hobby plan break Vercel's non-commercial rule and share the deploy limit; move them to the clients' own accounts or a paid plan.

## Testing

- `/dev/seed-physique` loads made-up data. CONNECTIONS is the richest: 16 weeks, top sets 4% lighter after nights under 6.5 h and 3% heavier after higher-carb days. WATCH carries HRV and resting HR.
- Accounts without real keys: `.claude/launch.json` (local, not committed) has a "dev-accounts-fake" entry that starts the app pointed at `https://fake-project.supabase.co` (and the delete route at the script's fake admin server). Then `APP_URL=http://localhost:3000 PLAYWRIGHT=<path to playwright/index.mjs> node scripts/e2e-accounts.mjs <screenshots dir>` runs sign-in, sync, consent, delete and the welcome sign-in (44 checks; a Playwright 1.62 copy sits in `~/.npm/_npx/`).
- If the dev server serves a stale stylesheet (a new CSS variable missing), stop it, delete `.next/dev`, start again.
- Never commit `.env.local`, tokens or the founder's own backup files.
