"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/ui/PageHeader";
import SignIn from "@/components/account/SignIn";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { ACCOUNTS_ENABLED } from "@/lib/sync/config";
import { supabase } from "@/lib/sync/client";
import { runSync } from "@/lib/sync/run";
import { isConsentActive, SYNC_CONSENT_VERSION, useConsents } from "@/lib/consent";
import { markWelcomeSeen, useHasLoggedAnything } from "@/lib/physique/io/onboarding";

/**
 * Sign in from the welcome screen, for someone who already has an account
 * on a new phone or after reinstalling: the same consent, email and code
 * as Profile → Account, then the first sync brings their data down and
 * they land on Home with it, instead of setting up a second goal beside
 * the one in their account. After Hevy's "New to Hevy? Sign up" line under
 * the main button and WHOOP's one email path for new and returning people
 * (Mobbin). An account with nothing logged (a new email, or a typo) says so
 * and offers Set up or another email.
 */
export default function WelcomeSignInPage() {
  return (
    <main className="min-h-screen pb-16" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader back={{ href: "/welcome", label: "Welcome" }} title="Sign in" />
        {ACCOUNTS_ENABLED ? (
          <Content />
        ) : (
          <p className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            Accounts aren&apos;t switched on yet. Your data is kept on this device.
          </p>
        )}
      </div>
    </main>
  );
}

function Content() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const consents = useConsents();
  useEffect(() => {
    const sb = supabase();
    if (!sb) return;
    void sb.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const sub = sb.auth.onAuthStateChange((_e, session) => setEmail(session?.user.email ?? null));
    return () => sub.data.subscription.unsubscribe();
  }, []);
  if (email === undefined || consents === null) return <div className="h-[120px] rounded-[16px]" style={{ background: "var(--surface)" }} />;
  const syncOn = isConsentActive(consents.sync, SYNC_CONSENT_VERSION);
  // Nothing comes down without the tick, so a session without it starts at the consent too.
  if (!email || !syncOn) return <SignIn consented={syncOn} />;
  return <Restore email={email} />;
}

type SyncState = "getting" | "failed" | "done";

/** Leaves the welcome screen behind for good, with a full load: pages read storage as they start. */
async function leaveFor(path: string) {
  await markWelcomeSeen(new Date().toISOString());
  window.location.replace(path);
}

function Restore({ email }: { email: string }) {
  const [state, setState] = useState<SyncState>("getting");
  const [attempt, setAttempt] = useState(0);
  // Judged on what the device now holds, not on what this run changed: the run signing in started may have finished first.
  const logged = useHasLoggedAnything();
  useEffect(() => {
    let live = true;
    // Usually joins the run that signing in started, so it waits for the first sync.
    void runSync().then((outcome) => {
      if (live) setState(outcome ? "done" : "failed");
    });
    return () => {
      live = false;
    };
  }, [attempt]);
  const home = state === "done" && logged;
  useEffect(() => {
    if (home) void leaveFor("/");
  }, [home]);

  if (state === "getting" || home) {
    return (
      <p className="rounded-[16px] px-4 py-3 text-[15px] leading-snug" style={{ background: "var(--surface)", color: "var(--text-secondary)" }} role="status">
        Getting your data…
      </p>
    );
  }

  if (state === "failed") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-[16px] px-4 py-3 text-[15px] leading-snug" style={{ background: "var(--surface)", color: "var(--text)" }} role="alert">
          Couldn&apos;t get your data. Check your connection and try again.
        </p>
        <PrimaryButton
          onClick={() => {
            setState("getting");
            setAttempt((a) => a + 1);
          }}
        >
          Try again
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5" role="status">
        <span className="text-[20px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)" }}>
          Nothing logged in this account yet
        </span>
        <span className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          Signed in as <span style={{ color: "var(--text)" }}>{email}</span>. Set up to start, or use the email your data is under.
        </span>
      </div>
      <PrimaryButton onClick={() => void leaveFor("/setup")}>Set up</PrimaryButton>
      <SecondaryButton onClick={() => void supabase()?.auth.signOut()}>Use another email</SecondaryButton>
    </div>
  );
}
