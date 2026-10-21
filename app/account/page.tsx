"use client";

import { useEffect, useState, useSyncExternalStore, type FormEvent } from "react";
import PageHeader from "@/components/ui/PageHeader";
import Sheet from "@/components/ui/Sheet";
import { Caption, Chevron, PrimaryButton, Row, RowGroup, SecondaryButton } from "@/components/physique/ui";
import SyncConsent from "@/components/account/SyncConsent";
import DeleteAccountSheet from "@/components/account/DeleteAccountSheet";
import { ACCOUNTS_ENABLED } from "@/lib/sync/config";
import { supabase } from "@/lib/sync/client";
import { getServerSyncStatus, getSyncStatus, runSync, stopSyncing, subscribeSync } from "@/lib/sync/run";
import { giveConsent, isConsentActive, SYNC_CONSENT_VERSION, useConsents } from "@/lib/consent";

/** Seconds before a new code can be asked for: Supabase sends at most one email a minute to an address by default. */
const RESEND_AFTER_S = 60;
const CODE_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = { kind: "deleted" } | { kind: "consent" } | { kind: "email" } | { kind: "code"; email: string; sentAt: number };

const CONSENT_SAVE_FAILED = "Couldn't save that on this device. Try again.";

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
 * Account (PR4): sign in with a code by email (S2: a 6-digit code, not a
 * link, which on an iPhone would open in Safari instead of the app), and
 * from then on the data follows the account to any device. Sign-in and
 * code entry after Claude, Quo and Fresha (Mobbin): one field the phone
 * can fill from Mail, the email shown with Change, signing in as soon as
 * six digits are in, and a new code after a minute. Signed in: when it
 * last synced, Sync now, Sign out (the data stays on the device).
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

function SignIn({ consented, deleted }: { consented: boolean; deleted: boolean }) {
  const [step, setStep] = useState<Step>(() => (deleted ? { kind: "deleted" } : consented ? { kind: "email" } : { kind: "consent" }));
  const [consentError, setConsentError] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (step.kind !== "code") return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [step.kind]);

  async function send(to: string) {
    const sb = supabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error: e } = await sb.auth.signInWithOtp({ email: to, options: { shouldCreateUser: true } });
    setBusy(false);
    if (e) {
      setError(/rate|seconds|too many/i.test(e.message) ? "A code was sent a moment ago. Try again in a minute." : "Couldn't send a code. Check the email and your connection.");
      return;
    }
    setCode("");
    setNow(Date.now());
    setStep({ kind: "code", email: to, sentAt: Date.now() });
  }

  async function verify(token: string) {
    const sb = supabase();
    if (!sb || step.kind !== "code") return;
    setBusy(true);
    setError(null);
    const { error: e } = await sb.auth.verifyOtp({ email: step.email, token, type: "email" });
    setBusy(false);
    if (e) {
      setError("That code didn't work. Check it, or send a new one.");
      return;
    }
    // The first sync copies this device's data up (and anything already in the account down).
    void runSync();
  }

  if (step.kind === "deleted") {
    return (
      <div className="flex flex-col gap-4">
        <p className="rounded-[16px] px-4 py-3 text-[15px] leading-snug" style={{ background: "var(--surface)", color: "var(--text)" }} role="status">
          Your account is deleted. Your data is still on this device.
        </p>
        <div className="flex">
          <SecondaryButton onClick={() => setStep(consented ? { kind: "email" } : { kind: "consent" })}>Sign in to a new account</SecondaryButton>
        </div>
      </div>
    );
  }

  if (step.kind === "consent") {
    return (
      <SyncConsent
          title="Before you sign in"
          actionLabel="Continue"
          error={consentError}
          onAgree={() => {
            if (!giveConsent("sync", new Date().toISOString())) {
              setConsentError(CONSENT_SAVE_FAILED);
              return;
            }
            setStep({ kind: "email" });
          }}
        />
    );
  }

  if (step.kind === "email") {
    const ok = EMAIL_RE.test(value.trim());
    const submit = (e: FormEvent) => {
      e.preventDefault();
      if (ok && !busy) void send(value.trim().toLowerCase());
    };
    return (
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-[20px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)" }}>
            Keep your data on every device
          </span>
          <span className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            Sign in with your email. We&apos;ll send a 6-digit code; no password.
          </span>
        </div>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email"
          className="h-[48px] w-full rounded-[12px] px-3.5 text-[17px] outline-none placeholder:text-[var(--text-tertiary)]"
          style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)" }}
        />
        {error && (
          <p className="text-[12px]" style={{ color: "var(--status-attention)" }} role="alert">
            {error}
          </p>
        )}
        <PrimaryButton type="submit" disabled={!ok || busy}>
          {busy ? "Sending…" : "Email me a code"}
        </PrimaryButton>
        <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          Until you sign in, everything stays on this device only.
        </p>
      </form>
    );
  }

  const wait = Math.max(0, RESEND_AFTER_S - Math.floor((now - step.sentAt) / 1000));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length === CODE_LENGTH && !busy) void verify(code);
      }}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-[20px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)" }}>
          Check your email
        </span>
        <span className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          We sent a 6-digit code to <span style={{ color: "var(--text)" }}>{step.email}</span>.{" "}
          <button type="button" onClick={() => setStep({ kind: "email" })} className="font-semibold underline-offset-2 hover:underline" style={{ color: "var(--text)" }}>
            Change
          </button>
        </span>
      </div>
      <input
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]*"
        maxLength={CODE_LENGTH}
        value={code}
        onChange={(e) => {
          const next = e.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
          setCode(next);
          setError(null);
          if (next.length === CODE_LENGTH) void verify(next);
        }}
        aria-label="6-digit code"
        autoFocus
        className="h-[60px] w-full rounded-[12px] px-3.5 text-center text-[34px] font-semibold tracking-[0.3em] outline-none"
        style={{ background: "var(--surface)", color: "var(--text)", border: "1px solid var(--border)", fontVariantNumeric: "tabular-nums" }}
      />
      {error && (
        <p className="text-[12px]" style={{ color: "var(--status-attention)" }} role="alert">
          {error}
        </p>
      )}
      <PrimaryButton type="submit" disabled={code.length !== CODE_LENGTH || busy}>
        {busy ? "Signing in…" : "Sign in"}
      </PrimaryButton>
      <button type="button" disabled={wait > 0 || busy} onClick={() => void send(step.email)} className="text-[12px] font-semibold disabled:opacity-50" style={{ color: "var(--text-secondary)" }}>
        {wait > 0 ? `Send a new code in ${wait} s` : "Send a new code"}
      </button>
    </form>
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
