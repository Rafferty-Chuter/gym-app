"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { Caption, SecondaryButton } from "@/components/physique/ui";
import { deleteAccount } from "@/lib/sync/account";
import { useHealthLink } from "@/lib/physique/io/healthLink";

/**
 * Delete account (TR1, App Review 5.1.1(v)). Says exactly what goes (the
 * account, everything synced to it, the Apple Health link's copy on our
 * server) and what stays (this device's data), with a second choice to
 * clear this device too. After Flo's and Fable's delete dialogs (Mobbin):
 * what is deleted in one place, the extra clean-up as its own option.
 *
 * TODO(subscriptions): once there is a paid plan, say here that deleting
 * the account doesn't cancel an Apple subscription, and link to the App
 * Store's subscription settings.
 */

const ERRORS = {
  signed_out: "Your sign-in has expired. Sign in again, then delete.",
  network: "Couldn't reach the server. Check your connection and try again.",
  server: "The account wasn't deleted. Try again in a minute.",
} as const;

export default function DeleteAccountSheet({ open, onClose, email, onDeleted }: { open: boolean; onClose: () => void; email: string; onDeleted: (clearedDevice: boolean) => void }) {
  const healthLink = useHealthLink();
  const [clearDevice, setClearDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setBusy(true);
    setError(null);
    const r = await deleteAccount({ clearDevice, nowIso: new Date().toISOString() });
    setBusy(false);
    if (!r.ok) {
      setError(ERRORS[r.error]);
      return;
    }
    onDeleted(clearDevice);
  }

  const goes = ["Your account, " + email, "Everything synced to it", ...(healthLink?.token ? ["Apple Health readings waiting on our server, and this device's link to Health Auto Export"] : [])];

  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Delete account"
      footer={
        <div className="flex flex-col">
          <SecondaryButton onClick={() => void confirm()} disabled={busy}>
            {busy ? "Deleting…" : clearDevice ? "Delete account and clear this device" : "Delete account"}
          </SecondaryButton>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          This can&apos;t be undone.
        </p>
        <section className="flex flex-col gap-2" aria-label="Deleted from our servers">
          <Caption>Deleted from our servers</Caption>
          <ul className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface-raised)" }}>
            {goes.map((g) => (
              <li key={g} className="px-4 py-3 text-[15px] leading-snug" style={{ color: "var(--text)", overflowWrap: "anywhere" }}>
                {g}
              </li>
            ))}
          </ul>
        </section>
        <section className="flex flex-col gap-2" aria-label="This device">
          <Caption>This device</Caption>
          <div role="radiogroup" aria-label="This device" className="overflow-hidden rounded-[16px] divide-y divide-[var(--border)]" style={{ background: "var(--surface-raised)" }}>
            <Choice selected={!clearDevice} onSelect={() => setClearDevice(false)} title="Keep my data here" sub="Your logs, goal and settings stay. The app works as before, without an account." />
            <Choice selected={clearDevice} onSelect={() => setClearDevice(true)} title="Clear this device too" sub="Every log, goal and setting on this device is removed as well." />
          </div>
        </section>
        {error && (
          <p className="text-[12px]" style={{ color: "var(--status-attention)" }} role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function Choice({ selected, onSelect, title, sub }: { selected: boolean; onSelect: () => void; title: string; sub: string }) {
  return (
    <button type="button" role="radio" aria-checked={selected} onClick={onSelect} className="flex w-full items-start gap-3 px-4 py-3 text-left">
      <span
        className="mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
        style={{ border: selected ? "none" : "1.5px solid var(--border-strong)", background: selected ? "var(--primary)" : "transparent" }}
        aria-hidden
      >
        {selected && <span className="h-2 w-2 rounded-full" style={{ background: "var(--text-on-primary)" }} />}
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
          {title}
        </span>
        <span className="text-[12px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          {sub}
        </span>
      </span>
    </button>
  );
}
