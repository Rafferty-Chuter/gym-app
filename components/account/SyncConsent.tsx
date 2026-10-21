"use client";

import { useState } from "react";
import { PrimaryButton } from "@/components/physique/ui";
import { ConsentFacts, ConsentTick } from "@/components/account/ConsentParts";

/**
 * Consent before any data leaves the phone for the account (TR1). Plain
 * words on what goes, where, why, and that it can be stopped and deleted;
 * one tick, empty to start, that only covers this. Shown before the first
 * sign-in and before sync is turned back on.
 */
export default function SyncConsent({ title, actionLabel, onAgree, onCancel, error }: { title: string; actionLabel: string; onAgree: () => void; onCancel?: () => void; error?: string | null }) {
  const [ticked, setTicked] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[20px] font-semibold tracking-[-0.01em]" style={{ color: "var(--text)" }}>
          {title}
        </h2>
        <p className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
          Signing in keeps a copy of your data in your account. Here is what that means.
        </p>
      </div>
      <ConsentFacts
        facts={[
          { label: "What goes", text: "Everything you log and set here: weigh-ins, food, sleep, training, your goal, and readings from Apple Health." },
          { label: "Where", text: "Your account, stored by Supabase on servers in London. Other people can't see it." },
          { label: "Why", text: "So your data is safe if this phone is lost, and the same on every device you sign in on." },
          { label: "Your choice", text: "Stop syncing, or delete the account and everything in it, any time in Profile → Account." },
        ]}
      />
      <ConsentTick checked={ticked} onChange={setTicked}>
        I agree to keep a copy of my data, including health data, in my account.
      </ConsentTick>
      {error && (
        <p className="text-[12px]" style={{ color: "var(--status-attention)" }} role="alert">
          {error}
        </p>
      )}
      <PrimaryButton onClick={onAgree} disabled={!ticked}>
        {actionLabel}
      </PrimaryButton>
      {onCancel ? (
        <button type="button" onClick={onCancel} className="h-[44px] text-[15px] font-semibold" style={{ color: "var(--text-secondary)" }}>
          Not now
        </button>
      ) : (
        <p className="text-[12px] leading-snug" style={{ color: "var(--text-tertiary)" }}>
          Without this, everything stays on this device only.
        </p>
      )}
    </div>
  );
}
