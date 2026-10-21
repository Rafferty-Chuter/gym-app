"use client";

import { useEffect } from "react";
import { APP_VERSION } from "@/lib/appVersion";
import type { ClientErrorSource } from "@/lib/errors/clientError";
import { reportClientError } from "@/lib/errors/reportClientError";

/**
 * What a crash looks like (TR3), shared by `app/error.tsx` and
 * `app/global-error.tsx`: what happened in one line, that the log is safe,
 * Reload, and Send feedback when the feedback form is set. After Bevel's
 * and Oura's error states: a title, one sentence, one action, no picture.
 * Send feedback sits on the page itself, so it takes `surface` and a
 * hairline (DESIGN.md: raised grey is for controls on a row). The version
 * sits underneath so a tester can name the build.
 */
export default function ErrorScreen({ error, source }: { error: Error; source: ClientErrorSource }) {
  useEffect(() => {
    reportClientError(error, source);
  }, [error, source]);
  const feedbackUrl = process.env.NEXT_PUBLIC_TALLY_FEEDBACK_URL;
  return (
    <main className="min-h-screen" style={{ background: "var(--page)", color: "var(--text)" }}>
      <div className="mx-auto flex max-w-md flex-col gap-6 px-5 pb-28" style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 96px)" }}>
        <div role="alert" className="flex flex-col gap-2">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em]">Something went wrong</h1>
          <p className="text-[15px] leading-snug" style={{ color: "var(--text-secondary)" }}>
            This screen hit an error. Your log is still saved on this phone, and reloading usually fixes it.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="h-12 w-full rounded-xl text-[17px] font-semibold transition-colors active:bg-[var(--primary-pressed)]"
            style={{ background: "var(--primary)", color: "var(--text-on-primary)" }}
          >
            Reload
          </button>
          {feedbackUrl && (
            <a
              href={feedbackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-11 w-full items-center justify-center rounded-xl text-[17px] font-semibold transition-colors active:bg-[var(--surface-pressed)]"
              style={{ background: "var(--surface)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--border)" }}
            >
              Send feedback
            </a>
          )}
        </div>
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Gym AI {APP_VERSION}
        </p>
      </div>
    </main>
  );
}
