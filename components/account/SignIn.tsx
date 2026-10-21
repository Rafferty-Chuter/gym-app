"use client";

import { useEffect, useState, type FormEvent } from "react";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import SyncConsent from "@/components/account/SyncConsent";
import { supabase } from "@/lib/sync/client";
import { runSync } from "@/lib/sync/run";
import { giveConsent } from "@/lib/consent";

/** Seconds before a new code can be asked for: Supabase sends at most one email a minute to an address by default. */
const RESEND_AFTER_S = 60;
const CODE_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Step = { kind: "deleted" } | { kind: "consent" } | { kind: "email" } | { kind: "code"; email: string; sentAt: number };

export const CONSENT_SAVE_FAILED = "Couldn't save that on this device. Try again.";

/**
 * Signing in (PR4, TR1): the consent first when it hasn't been given on
 * this device, then the email, then a 6-digit code (not a link, which on
 * an iPhone would open in Safari instead of the app). After Claude, Quo
 * and Fresha (Mobbin): one field the phone can fill from Mail, the email
 * shown with Change, signing in as soon as six digits are in, and a new
 * code after a minute. Used by Profile → Account and by the welcome
 * screen's "Sign in". The first sync starts as soon as the code is right.
 */
export default function SignIn({ consented, deleted = false }: { consented: boolean; deleted?: boolean }) {
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
