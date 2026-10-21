# Handoff (2026-10-21)

For a session picking up from the long cloud session that built PR1 to C7. Read `CLAUDE.md` first, then this, then the latest rows of `STATUS.md`.

## Where things stand

- Branch `claude/admiring-ptolemy-mz6jwu`. Everything below is committed and pushed.
- Production (gym-app-eta-nine.vercel.app and gym-app-psi-wheat.vercel.app, one `vercel deploy --prod` updates both) is still at A2 (f7f7920). PR1, PR2, T1, O1, C7 and everything from the 21 Oct local session (PR3 to PR4, below) are built but not deployed.
- 21 Oct local session (STATUS rows PR3 to PR4): Progress redesigned (goal first; Connections as a ranked list in kg with a session strip on tap; Findings in one line each; labelled charts; each main lift in kg, which was X1; HRV and resting HR with a watch; short histories open on All; no maintenance gap from an incomplete log), "Early read" gone from Train, "Ask the coach why" behind the parked assistant (`ASSISTANT_ENABLED`), and accounts and sync (PR4), off until the founder runs `supabase/migrations/0003_sync.sql`, turns on email codes and sets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` on Vercel (steps in the PR4 STATUS row).
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
3. **Accounts** first cut built (PR4). Left: the founder's three switch-on steps, a real-project smoke test on the phone, API routes keyed by `auth.uid()` for the daily AI cap, delete account and data, database backups, sign-in offered in `/setup`.
4. Earlier offers waiting on the founder: gate changes (MIN_LOGGED_SHARE 0.7, MIN_WEIGHIN_RATIO 0.25), a MacroFactor import, the AI coach as a premium feature. The assistant prompt in `app/api/assistant/route.ts` (a hotspot) still says "Body tab".

## The founder's own to-dos

- Rotate the secrets that were shared in the cloud session: the Vercel token, the Anthropic key, the Supabase service key, CRON_SECRET.
- Set `NEXT_PUBLIC_SUPPORT_EMAIL` (and `NEXT_PUBLIC_TALLY_FEEDBACK_URL` if wanted) on Vercel, then redeploy.
- Client websites on the Hobby plan break Vercel's non-commercial rule and share the deploy limit; move them to the clients' own accounts or a paid plan.

## Testing

- `/dev/seed-physique` loads made-up data. CONNECTIONS is the richest: 16 weeks, top sets 4% lighter after nights under 6.5 h and 3% heavier after higher-carb days. WATCH carries HRV and resting HR.
- Accounts without real keys: `.claude/launch.json` (local, not committed) had a "dev-accounts-fake" entry that starts the app pointed at `https://fake-project.supabase.co`; a Playwright script answering those requests exercised sign-in and two-device sync (PR4 row).
- If the dev server serves a stale stylesheet (a new CSS variable missing), stop it, delete `.next/dev`, start again.
- Never commit `.env.local`, tokens or the founder's own backup files.
