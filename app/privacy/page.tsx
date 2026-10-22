import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import DocPage, { type DocSection } from "@/components/ui/DocPage";

export const metadata: Metadata = { title: "Privacy · Gym AI", description: "What Gym AI keeps on your phone, what it sends and where, how long it is kept, and how to delete it or complain." };

const linkStyle = { color: "var(--text)" };

/**
 * The privacy notice (TR2). Every claim describes what the code does and
 * names its source in a comment beside it; change the code and this page
 * together. Claims tagged "TR1" describe the consent and delete-account
 * work in docs/plan/07-tester-ready.md TR1, built in parallel: check them
 * against app/account/page.tsx when TR1 merges. Claims tagged "not code"
 * come from a provider's terms, the law or the founder, and are listed for
 * review in docs/plan/legal/DPIA-draft.md. Not legal advice: a person who
 * knows UK GDPR reads this before testers (STATUS TR2). Kept under 700
 * words so it reads in under three minutes.
 *
 * A space after an inline element is written as {" "}: the JSX compiler
 * drops a leading space from text that holds an entity such as &apos;.
 */

/**
 * How to reach us, as the end of a sentence: "email x@y" when
 * NEXT_PUBLIC_SUPPORT_EMAIL is set, otherwise "use the support page", which
 * carries the feedback form (app/support/page.tsx).
 */
function Reach({ subject }: { subject?: string }): ReactNode {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  if (email) {
    const href = subject ? `mailto:${email}?subject=${encodeURIComponent(subject)}` : `mailto:${email}`;
    return (
      <>
        email{" "}
        <a href={href} className="underline" style={linkStyle}>
          {email}
        </a>
      </>
    );
  }
  return (
    <>
      use the{" "}
      <Link href="/support" className="underline" style={linkStyle}>
        support page
      </Link>
    </>
  );
}

export default function PrivacyPage() {
  const sections: DocSection[] = [
    {
      title: "On your phone",
      body: (
        <>
          {/* src: lib/storage/keys.ts (every log is a local key); lib/sync/config.ts and lib/sync/run.ts doSync (no account, no sync) */}
          <p>Everything you log stays on your phone; without an account, we keep no copy.</p>
          {/* src: lib/storage/nativeMirror.ts (a copy in Directory.Library, which iOS includes in the iPhone backup; removed with the app) */}
          <p>The iPhone app also keeps a copy in its own folder, which is part of your iPhone backup if iCloud Backup is on. Deleting the app deletes both.</p>
        </>
      ),
    },
    {
      title: "Your account",
      body: (
        <>
          {/* TR1: the consent screen before the first sign-in; runSync refuses without it. Today lib/sync/run.ts doSync runs only when signed in */}
          <p>Signing in is optional and asks your permission first, on its own screen.</p>
          {/* src: lib/sync/run.ts syncedKeys (every backup key less DEVICE_ONLY_KEYS) over lib/storage/keys.ts: weighIns, waist, foodEntries, sleepNights (with HRV and resting HR), steps, workoutHistory, workoutTemplates, goal, profile, settings, assistantThreadsV1 */}
          {/* src: supabase/migrations/0003_sync.sql (sync_records, each user reads their own rows only); app/account/page.tsx (signInWithOtp, email code). Region: not code; the project's database is in eu-central-1 (Frankfurt), checked 22 Oct 2026 (docs/plan/03-architecture.md A3) */}
          <p>Your log (weight, waist, food, sleep and heart readings, workouts, routines, goal, profile, settings, coach chats) is then copied to your account, stored by Supabase in Frankfurt, Germany, with your email address. The UK treats data protection in the EU as equal to its own.</p>
          {/* TR1: Profile → Account → Stop syncing. Today Sign out (app/account/page.tsx) stops sync and keeps the data. What never syncs (DEVICE_ONLY_KEYS, includeInBackup false) is listed in the DPIA, step 2 */}
          <p>Profile → Account → Stop syncing ends it.</p>
        </>
      ),
    },
    {
      title: "Apple Health",
      body: (
        <>
          {/* src: lib/physique/io/nativeHealth.ts READ_TYPES, requestAuthorization({ write: [] }); lib/physique/io/healthLink.ts mergeSamples (into the local log, then synced like the rest). Advertising and sale: no ad or analytics SDK in package.json, no such code */}
          <p>The iPhone app reads the types you allow (weight, body fat, sleep, steps, resting heart rate, heart rate variability) on the phone and keeps them with your log. It never writes to Apple Health. Health data is never used for advertising or sold.</p>
          {/* src: app/api/ingest/hae/route.ts (preferredRegion lhr1, hashToken, values never logged); supabase/migrations/0001_health.sql */}
          <p>Health Auto Export instead sends the readings you choose to our server, which keeps them in Frankfurt under a token we store only hashed.</p>
        </>
      ),
    },
    {
      title: "Sent when you use a feature",
      body: (
        <ul>
          <li>
            {/* src: app/api/food/parse/route.ts (text → Anthropic); lib/food/published.ts publishedRequest (the lookup carries each dish's label and serving only) → lib/server/foodLookup.ts */}
            <strong>Describe a meal:</strong>{" "}your text goes to Anthropic (Claude) to work out the foods. A chain dish&apos;s nutrition is looked up on the web by its name and size only.
          </li>
          <li>
            {/* src: lib/features.ts ASSISTANT_ENABLED = false (the route answers 404). TR1: the separate, off-by-default AI consent (hasAiConsent). What it sends: app/assistant/page.tsx request body, lib/physique/io/payload.ts */}
            <strong>The coach</strong>{" "}is off in this version. If it returns, it asks first, separately, and only then sends Anthropic your question, the chat and a summary of your goal, weight, food, training and sleep.
          </li>
          <li>
            {/* src: app/api/food/search/route.ts, app/api/food/barcode/route.ts → lib/server/off.ts (our server calls Open Food Facts with the words or code only) */}
            <strong>Food search and barcodes:</strong>{" "}the words or code go via our server to Open Food Facts.
          </li>
          <li>
            {/* src: app/api/push/subscribe/route.ts, lib/server/pushSchemas.ts; lib/physique/reminder.ts buildGapSummary (logged dates over SUMMARY_DAYS = 9, and the first date of each kind) and reminderMessage (no numbers) */}
            <strong>Reminders:</strong>{" "}your push address, time zone, reminder time and which days have food, a weigh-in or sleep logged (dates only, no amounts).{" "}
            {/* src: lib/physique/io/nativeReminders.ts (local notifications scheduled on the phone; no server call) */}
            In the iPhone app, reminders are set on the phone itself and nothing is sent.
          </li>
        </ul>
      ),
    },
    {
      title: "Who handles it for us",
      body: (
        <ul>
          {/* src: supabase/migrations/0001_health.sql, 0002_push.sql, 0003_sync.sql. Region: not code, eu-central-1 (docs/plan/03-architecture.md A3) */}
          <li>Supabase, in Frankfurt (EU): accounts, Health Auto Export readings, reminders.</li>
          {/* src: app/api/food/parse/route.ts, app/api/assistant/route.ts. Training and transfers: not code (Anthropic Commercial Terms and its DPA); the founder confirms (DPIA step 4) */}
          <li>Anthropic, in the United States: Describe and the coach. Its terms forbid training on this data and cover transfers from the UK; ask us for a copy.</li>
          {/* src: preferredRegion "lhr1" in app/api/ingest/hae, health/pull, push/*, food/search, food/barcode; lib/api/guard.ts and lib/assistantCostLogging.ts (client id, token counts and cost; zod issue paths, never values). Request logs: Vercel, not code */}
          <li>Vercel hosts the app, with the Apple Health, reminder and food search parts in London, and keeps short-lived request logs (IP address, time, page). Our own logs never hold what you typed, ate, weighed or slept.</li>
          {/* src: lib/errors/reportClientError.ts → app/api/client-error/route.ts (preferredRegion lhr1; lib/errors/clientError.ts scrubMessage removes every number, quoted text and email; the address is a rate-limit key, never logged) */}
          <li>Error reports carry the error, the screen and the app version, with numbers removed.</li>
          {/* src: .github/workflows/db-backup.yml (pg_dump, GnuPG AES-256, artifact kept 30 days); docs/plan/backups.md */}
          <li>GitHub keeps encrypted nightly copies of our database for 30 days.</li>
          {/* src: lib/server/push.ts sendPush (web-push to the subscription's endpoint); lib/feedback.ts FEEDBACK_URL (NEXT_PUBLIC_TALLY_FEEDBACK_URL) */}
          <li>Also your phone&apos;s push service and, if you use the feedback form, Tally.</li>
        </ul>
      ),
    },
    {
      title: "Why we're allowed to",
      body: (
        /* TR1: the account and AI consent screens. Describe (app/api/food/parse on tap), Health Auto Export (the user sets up the automation) and reminders (the toggle in components/physique/RemindersSection.tsx) run only on the user's own action. Lawful basis: not code, for the reviewer (DPIA step 4, risk R1) */
        <p>Your explicit consent. The account and the coach each ask on their own screen; Describe, Health Auto Export and reminders run only when you use them. Withdraw it any time; that doesn&apos;t undo earlier use.</p>
      ),
    },
    {
      title: "How long we keep it",
      body: (
        <ul>
          {/* src: supabase/migrations/0003_sync.sql (cascade from auth.users; no delete policy, so deletes are soft); lib/sync/core.ts (a deleted record is pushed as data: null, deleted: true) */}
          <li>Your account: until you delete it. A deleted entry is emptied at the next sync, leaving a blank marker for your other devices.</li>
          {/* src: app/api/health/pull/route.ts DELETE (no other expiry in code); lib/physique/io/pushLink.ts disableReminders; app/api/push/run/route.ts MAX_FAILURES (reset on a successful send) */}
          <li>Health Auto Export readings: until you disconnect. Reminder details: until you turn them off, or after 5 failed sends in a row.</li>
          {/* not code: Vercel's log retention by plan; email handling is the founder's (DPIA step 2) */}
          <li>Request logs expire after a short time; emails to us are kept only as long as needed.</li>
        </ul>
      ),
    },
    {
      title: "Deleting your data",
      body: (
        <ul>
          {/* src: lib/physique/io/bodyData.ts deleteWeighIn, deleteFoodEntry; app/history/workout (delete a workout); sleep and waist are edited, not deleted one by one (DPIA risk R8) */}
          <li>On your phone: edit entries, delete weigh-ins, food and workouts, or delete the app.</li>
          {/* TR1: Profile → Account → Delete account (POST /api/account/delete: auth.admin.deleteUser, sync_records cascade, the user's health ingest rows; a second option clears this device) */}
          <li>Profile → Account → Delete account removes the account, everything synced and any linked Health Auto Export readings. You choose whether this phone keeps its copy.</li>
          {/* src: components/health/AppleHealthSheet.tsx "Disconnect and delete" → app/api/health/pull/route.ts DELETE; components/physique/RemindersSection.tsx → DELETE /api/push/subscribe */}
          <li>Disconnect and delete (Profile → Apple Health) and turning reminders off clear what our server holds for them.</li>
        </ul>
      ),
    },
    {
      title: "Your rights",
      body: (
        /* src: app/profile/page.tsx "Move to another phone" → app/dev/data-transfer (every backup key as text). One month: UK GDPR Art 12(3), not code */
        <p>
          You can ask for a copy of your data, or for us to correct, delete, limit or stop using it. Profile → Move to another phone copies everything on your phone. To ask, <Reach subject="My data" />. We reply within a month.
        </p>
      ),
    },
    {
      title: "Complaints",
      body: (
        <>
          {/* not code: the complaints procedure required since 19 June 2026 (Data (Use and Access) Act 2025): a way to complain, acknowledged within 30 days, looked into, outcome told. The founder runs it from NEXT_PUBLIC_SUPPORT_EMAIL */}
          <p>
            If you&apos;re unhappy with how we&apos;ve handled your data, <Reach subject="Complaint" />{" "}and start with the word &ldquo;Complaint&rdquo;. We acknowledge it within 30 days, look into it, keep you updated and tell you the outcome.
          </p>
          {/* not code: the ICO's complaint page and helpline */}
          <p>
            You can also complain to the Information Commissioner&apos;s Office:{" "}
            <a href="https://ico.org.uk/make-a-complaint/" className="underline" style={linkStyle} target="_blank" rel="noopener noreferrer">
              ico.org.uk/make-a-complaint
            </a>{" "}
            or 0303 123 1113.
          </p>
        </>
      ),
    },
    {
      title: "Age",
      body: (
        /* src: lib/physique/setupFlow.ts and lib/physique/judge.ts SAFE0_MIN_AGE (no deficit under 18). "Not meant for under 16" is policy, not enforced in code. The not-medical-advice note is on app/support/page.tsx */
        <p>Gym AI isn&apos;t meant for anyone under 16 and sets no calorie deficit under 18.</p>
      ),
    },
  ];
  return (
    <DocPage
      title="Privacy"
      updated="22 October 2026"
      intro={
        <p>
          {/* not code: the controller; the founder adds a legal or trading name for the reviewer (DPIA step 1) */}
          Gym AI is made in the UK by its founder, who is responsible for your data (the data controller). To reach us, <Reach />.
        </p>
      }
      sections={sections}
    />
  );
}
