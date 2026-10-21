"use client";

import Link from "next/link";
import { useNow } from "@/lib/ui/useToday";
import { markWelcomeSeen } from "@/lib/physique/io/onboarding";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { ACCOUNTS_ENABLED } from "@/lib/sync/config";

/**
 * First open (B7): one screen, three lines, two choices. Set up opens the
 * guided setup (O1: basics, today's weight, the goal and its targets);
 * Look around first goes to Home. Either way this screen is not shown
 * again on this device. With accounts on, one quiet line under the
 * buttons signs in someone who already has an account (Hevy's "New to
 * Hevy? Sign up", Mobbin), so a new phone gets their data, not a second
 * setup.
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
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <PrimaryButton onClick={() => void go("/setup")} disabled={!now}>
            Set up
          </PrimaryButton>
          <SecondaryButton onClick={() => void go("/")}>Look around first</SecondaryButton>
          {ACCOUNTS_ENABLED && (
            <p className="flex min-h-[44px] items-center justify-center gap-1 text-[15px]" style={{ color: "var(--text-secondary)" }}>
              Have an account?
              <Link href="/welcome/sign-in" className="flex min-h-[44px] items-center px-1 font-semibold" style={{ color: "var(--text)" }}>
                Sign in
              </Link>
            </p>
          )}
          <p className="pt-2 text-center text-[11px] leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
            A few basics, today&apos;s weight, then your goal. About two minutes. Your log stays on this phone.
            <br />
            General information, not medical advice.{" "}
            <Link href="/privacy" className="underline">
              Privacy
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
