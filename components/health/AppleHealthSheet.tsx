"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import { disconnectHealthLink, ensureHealthLink, ingestUrl, pullHealth, receivedLabel, useHealthLink, type PullResult } from "@/lib/physique/io/healthLink";

type Props = { open: boolean; onClose: () => void };

const STEPS: readonly string[] = [
  "Install Health Auto Export from the App Store and buy Premium (automations need it).",
  "Automations → + → REST API. Format JSON, data type Health Metrics.",
  "Metrics: Sleep Analysis, Heart Rate Variability, Resting Heart Rate, Body Mass, Body Fat Percentage, Step Count.",
  "Aggregation on, Batch Requests on, date range Since Last Sync.",
  "Paste the URL and the header below, then run a Manual Export of the last 60 days as a backfill.",
];

function errorCopy(e: NonNullable<Extract<PullResult, { ok: false }>["error"]> | string | null | undefined): string | null {
  switch (e) {
    case "not_configured":
      return "The server has no database keys yet, so nothing can be received.";
    case "unauthorized":
      return "The server did not accept this token.";
    case "network":
      return "Could not reach the server.";
    case "storage":
      return "The server could not read or write the samples.";
    default:
      return null;
  }
}

/**
 * Connect Apple Health (Sprint 0, S5): the token shown with a copy button,
 * the URL, the five settings, the state of the link, Pull now, Disconnect.
 */
export default function AppleHealthSheet({ open, onClose }: Props) {
  const link = useHealthLink();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"token" | "url" | "header" | null>(null);
  const [last, setLast] = useState<PullResult | null>(null);
  const nowIso = () => new Date().toISOString();

  async function copy(kind: "token" | "url" | "header", text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      setCopied(null);
    }
  }

  async function connect() {
    setBusy(true);
    await ensureHealthLink(nowIso());
    setBusy(false);
  }

  async function pull() {
    setBusy(true);
    const r = await pullHealth(nowIso(), true);
    setLast(r);
    setBusy(false);
  }

  const field = (label: string, value: string, kind: "token" | "url" | "header") => (
    <div className="flex items-center gap-2 rounded-[12px] px-3 py-2" style={{ background: "var(--surface-raised)" }}>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[11px] font-medium uppercase tracking-[0.04em]" style={{ color: "var(--text-tertiary)" }}>
          {label}
        </span>
        <span className="truncate text-[13px]" style={{ color: "var(--text)", fontFamily: "var(--font-geist-mono), monospace" }}>
          {value}
        </span>
      </span>
      <button type="button" onClick={() => void copy(kind, value)} className="h-[30px] shrink-0 rounded-full px-3 text-[12px] font-medium" style={{ background: copied === kind ? "var(--status-good)" : "var(--surface)", color: copied === kind ? "var(--surface)" : "var(--text)", border: "1px solid var(--border)" }}>
        {copied === kind ? "Copied" : "Copy"}
      </button>
    </div>
  );

  const status = !link
    ? "Not connected."
    : link.lastPayloadAt
      ? `Last received ${receivedLabel(link.lastPayloadAt, new Date())} · ${link.serverSamples ?? 0} samples on the server.`
      : link.lastPullAt
        ? "Connected. Nothing received yet."
        : "Connected. Not pulled yet.";
  const err = errorCopy(last && !last.ok ? last.error : link?.lastError);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Apple Health"
      footer={
        link ? (
          <div className="flex flex-col gap-2">
            <PrimaryButton onClick={pull} disabled={busy}>
              {busy ? "Pulling…" : "Pull now"}
            </PrimaryButton>
            <SecondaryButton
              onClick={async () => {
                await disconnectHealthLink();
                setLast(null);
              }}
              disabled={busy}
            >
              Disconnect
            </SecondaryButton>
          </div>
        ) : (
          <PrimaryButton onClick={connect} disabled={busy}>
            Create a token
          </PrimaryButton>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Sleep, HRV, resting heart rate, weight and steps arrive on their own through the Health Auto Export app. Manual logging stays as the fallback. Data lands within hours of unlocking the phone, not minutes.
        </p>
        <p className="text-[13px]" style={{ color: "var(--text)" }}>
          {status}
          {last?.ok && last.merged > 0 ? ` Pulled ${last.merged}: ${last.nights} ${last.nights === 1 ? "night" : "nights"}, ${last.weighIns} ${last.weighIns === 1 ? "weigh-in" : "weigh-ins"}.` : last?.ok ? " Nothing new." : ""}
        </p>
        {err && (
          <p className="text-[13px]" style={{ color: "var(--status-watch)" }}>
            {err}
          </p>
        )}
        {link && (
          <>
            {field("URL", ingestUrl(), "url")}
            {field("Header", `Authorization: Bearer ${link.token}`, "header")}
            {field("Token", link.token, "token")}
          </>
        )}
        <ol className="flex flex-col gap-1.5 pl-4 text-[13px]" style={{ color: "var(--text-secondary)", listStyle: "decimal" }}>
          {STEPS.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          The token is a password for writing to this device&apos;s data. It lives on this phone and in the Health Auto Export app, nowhere else. Disconnect to invalidate it.
        </p>
      </div>
    </Sheet>
  );
}
