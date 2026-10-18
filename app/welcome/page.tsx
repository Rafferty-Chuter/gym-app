"use client";

import { useNow } from "@/lib/ui/useToday";
import { markWelcomeSeen } from "@/lib/physique/io/onboarding";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";

/**
 * First open (B7): one screen, three lines, two choices. Set up opens the
 * weight sheet on Body, from where the goal flow (sex, height, age,
 * target, pace) is one tap; Look around first goes to Home. Either way
 * this screen is not shown again on this device.
 */
export default function WelcomePage() {
  const now = useNow();
  async function go(path: string) {
    await markWelcomeSeen(new Date().toISOString());
    // A full load: the Body tab reads ?date= in a state initialiser, which a soft navigation would miss.
    window.location.assign(path);
  }
  return (
    <main className="flex min-h-screen flex-col" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-between px-5 pb-10 pt-20 sm:px-6">
        <div className="flex flex-col gap-6">
          <p className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
            Gym AI
          </p>
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-[-0.02em]">One place for the plan</h1>
          <ul className="flex flex-col gap-3 text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            <li>Log food, weight, sleep and training. Food by search or barcode, weight in a tap, sleep from Apple Health if you want.</li>
            <li>The engine reads the weight trend against what you eat and says whether the plan is working, in numbers.</li>
            <li>Nothing cheers and nothing nags. Home shows how the last week went, in a few lines.</li>
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => void go(now ? `/body?date=${now.today}` : "/body")} disabled={!now}>
            Set up
          </PrimaryButton>
          <SecondaryButton onClick={() => void go("/")}>Look around first</SecondaryButton>
          <p className="pt-2 text-center text-[11px]" style={{ color: "var(--text-tertiary)" }}>
            Set up starts with today&apos;s weight, then a target and a pace. About two minutes. Everything stays on this phone.
          </p>
        </div>
      </div>
    </main>
  );
}
