"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { ConsentFacts, ConsentTick, dayLabel } from "@/components/account/ConsentParts";
import { AI_CONSENT_VERSION, giveConsent, isConsentActive, useConsents, withdrawConsent } from "@/lib/consent";

/**
 * The AI coach's consent (TR1, App Review 5.1.2(i)): what the coach sends,
 * to whom (Anthropic, named), and when; its own tick, off until given, and
 * a way to turn it off. After Perplexity Health's short list of facts
 * (Mobbin). The coach checks `hasAiConsent()` and can open this sheet.
 */
export default function AiConsentSheet({ open, onClose, onAgreed }: { open: boolean; onClose: () => void; onAgreed?: () => void }) {
  const consents = useConsents();
  const on = isConsentActive(consents?.ai, AI_CONSENT_VERSION);
  const [ticked, setTicked] = useState(false);
  const [failed, setFailed] = useState(false);
  const close = () => {
    setTicked(false);
    setFailed(false);
    onClose();
  };
  return (
    <Sheet
      open={open}
      onClose={close}
      title="AI coach"
      footer={
        on ? (
          <div className="flex flex-col">
            <SecondaryButton onClick={() => withdrawConsent("ai", new Date().toISOString())}>Turn off</SecondaryButton>
          </div>
        ) : (
          <PrimaryButton
            disabled={!ticked}
            onClick={() => {
              if (!giveConsent("ai", new Date().toISOString())) {
                setFailed(true);
                return;
              }
              setTicked(false);
              onAgreed?.();
            }}
          >
            Turn on
          </PrimaryButton>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <ConsentFacts
          facts={[
            { label: "What's sent", text: "Your question, and the logs the coach needs to answer it: weight, food, sleep and training." },
            { label: "To whom", text: "Anthropic, the company behind the Claude AI model, which writes the answer." },
            { label: "When", text: "Only when you ask the coach something. While this is off, the coach sends nothing." },
          ]}
        />
        {on && consents?.ai ? (
          <p className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            On since {dayLabel(consents.ai.at, new Date())}. Turn it off any time here.
          </p>
        ) : (
          <ConsentTick checked={ticked} onChange={setTicked}>
            I agree to the coach sending this data to Anthropic.
          </ConsentTick>
        )}
        {failed && (
          <p className="text-[12px]" style={{ color: "var(--status-attention)" }} role="alert">
            Couldn&apos;t save that on this device. Try again.
          </p>
        )}
      </div>
    </Sheet>
  );
}
