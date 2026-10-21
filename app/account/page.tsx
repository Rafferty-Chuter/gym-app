"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Sheet from "@/components/ui/Sheet";
import { Caption, Chevron, PrimaryButton, Row, RowGroup, SecondaryButton } from "@/components/physique/ui";
import SyncConsent from "@/components/account/SyncConsent";
import SignIn, { CONSENT_SAVE_FAILED } from "@/components/account/SignIn";
import DeleteAccountSheet from "@/components/account/DeleteAccountSheet";
import { ACCOUNTS_ENABLED } from "@/lib/sync/config";
import { supabase } from "@/lib/sync/client";
import { getServerSyncStatus, getSyncStatus, runSync, stopSyncing, subscribeSync } from "@/lib/sync/run";
import { giveConsent, isConsentActive, SYNC_CONSENT_VERSION, useConsents } from "@/lib/consent";

/** "just now", "4 minutes ago", "at 09:14", or "on Mon 20 Oct". */
function agoWords(iso: string | null, nowMs: number): string {
  if (!iso) return "not yet";
  const t = Date.parse(iso);
  const min = Math.round((nowMs - t) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const d = new Date(t);
  const sameDay = new Date(nowMs).toDateString() === d.toDateString();
  return sameDay ? `at ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}` : `on ${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}`;
}

/**
 * Account (PR4): sign in with a code by email (`components/account/SignIn.tsx`,
 * shared with the welcome screen's Sign in), and from then on the data
 * follows the account to any device. Signed in: when it last synced,
 * Sync now, Sign out (the data stays on the device).
 *
 * TR1: the consent screen comes before the email, so nothing leaves the
 * phone until it is ticked. Signed in: Stop syncing (withdraws it; the
 * account can then be deleted or sync turned back on with a fresh tick)
 * and Delete account.
 */
export default function AccountPage() {
  return (
    <main className="min-h-screen pb-28" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 sm:px-6">
        <PageHeader back={{ href: "/profile", label: "Profile" }} title="Account" />
        {ACCOUNTS_ENABLED ? <AccountContent /> : <Off />}
      </div>
    </main>
  );
}

function Off() {
  return (
    <p className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
      Accounts aren&apos;t switched on yet. Your data is kept on this device; Profile → Data tools makes a backup.
    </p>
  );
}

function AccountContent() {
  const [email, setEmail] = useState<string | null | undefined>(undefined);
  const [deleted, setDeleted] = useState(false);
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
  // Keyed: signing out fires before the deletion is reported, so the "deleted" state starts a fresh view.
  if (!email) return <SignIn key={deleted ? "deleted" : "sign-in"} consented={syncOn} deleted={deleted} />;
  return (
    <SignedIn
      email={email}
      syncOn={syncOn}
      onDeleted={(clearedDevice) => {
        // A cleared device starts again from the beginning.
        if (clearedDevice) {
          window.location.replace("/");
          return;
        }
        setDeleted(true);
        setEmail(null);
      }}
    />
  );
}

function SignedIn({ email, syncOn, onDeleted }: { email: string; syncOn: boolean; onDeleted: (clearedDevice: boolean) => void }) {
  const status = useSyncExternalStore(subscribeSync, getSyncStatus, getServerSyncStatus);
  const [now, setNow] = useState(() => Date.now());
  const [sheet, setSheet] = useState<"stop" | "delete" | null>(null);
  const [turningOn, setTurningOn] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  async function signOut() {
    if (!window.confirm("Sign out? Your data stays on this device; it stops syncing until you sign in again.")) return;
    // The sync position stays: signing back in to the same account pushes what changed meanwhile; another account starts afresh (run.ts).
    await supabase()?.auth.signOut();
  }
  async function stop() {
    setStopping(true);
    await stopSyncing(new Date().toISOString());
    setStopping(false);
    setSheet(null);
  }

  if (turningOn) {
    return (
      <SyncConsent
        title="Turn sync back on"
        actionLabel="Turn on sync"
        error={consentError}
        onCancel={() => setTurningOn(false)}
        onAgree={() => {
          if (!giveConsent("sync", new Date().toISOString())) {
            setConsentError(CONSENT_SAVE_FAILED);
            return;
          }
          setTurningOn(false);
          void runSync();
        }}
      />
    );
  }

  const line = !syncOn ? "Sync is off on this device" : status.running ? "Syncing…" : status.lastError ? `${status.lastError}. It will try again.` : `Synced ${agoWords(status.lastSyncAt, now)}`;
  return (
    <>
      <section className="flex flex-col gap-2" aria-label="Signed in">
        <Caption>Signed in</Caption>
        <RowGroup>
          <Row label={email} sub={line} value="" />
        </RowGroup>
        {syncOn && status.last?.first && !status.running && (
          <p className="px-1 text-[12px] leading-snug" style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
            Your data is in your account and on this device. Sign in with the same email on another device to have it there too.
          </p>
        )}
        {!syncOn && (
          <p className="px-1 text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
            {status.lastSyncAt ? `Your account still holds the copy from the last sync, ${agoWords(status.lastSyncAt, now)}.` : "Nothing from this device goes to your account."} Delete the account below, or turn sync back on.
          </p>
        )}
      </section>
      <div className="flex gap-2">
        {syncOn ? (
          <SecondaryButton onClick={() => void runSync()} disabled={status.running}>
            Sync now
          </SecondaryButton>
        ) : (
          <SecondaryButton onClick={() => setTurningOn(true)}>Turn sync back on</SecondaryButton>
        )}
        <SecondaryButton onClick={() => void signOut()}>Sign out</SecondaryButton>
      </div>
      <section className="flex flex-col gap-2" aria-label="Your data">
        <Caption>Your data</Caption>
        <RowGroup>
          {syncOn && <Row label="Stop syncing" sub="This device stops sending to your account" value="" trailing={<Chevron />} onClick={() => setSheet("stop")} ariaLabel="Stop syncing. Open" />}
          <Row label="Delete account" sub="The account and everything in it" value="" trailing={<Chevron />} onClick={() => setSheet("delete")} ariaLabel="Delete account. Open" />
        </RowGroup>
      </section>
      <Sheet
        open={sheet === "stop"}
        onClose={() => (stopping ? undefined : setSheet(null))}
        title="Stop syncing?"
        footer={
          <PrimaryButton onClick={() => void stop()} disabled={stopping}>
            {stopping ? "Stopping…" : "Stop syncing"}
          </PrimaryButton>
        }
      >
        <p className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          This device stops sending changes to your account and stops getting them from it. Everything stays on this device. The copy in your account stays until you delete the account.
        </p>
      </Sheet>
      <DeleteAccountSheet
        open={sheet === "delete"}
        onClose={() => setSheet(null)}
        email={email}
        onDeleted={(cleared) => {
          setSheet(null);
          onDeleted(cleared);
        }}
      />
    </>
  );
}
