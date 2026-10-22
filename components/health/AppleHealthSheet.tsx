"use client";

import { useState } from "react";
import Sheet from "@/components/ui/Sheet";
import { PrimaryButton, SecondaryButton } from "@/components/physique/ui";
import HealthOptInRows from "@/components/health/HealthOptInRows";
import { disconnectHealthLink, ensureHealthLink, ingestUrl, pullHealth, receivedLabel, repullFromStart, useHealthLink, type PullResult } from "@/lib/physique/io/healthLink";
import { connectNativeHealth, disconnectNativeHealth, hasHealthExtras, syncNativeHealth, unaskedTypes, useNativeHealth, wantedTypes, type SyncResult } from "@/lib/physique/io/nativeHealth";
import { useHealthOptIn } from "@/lib/physique/io/healthOptIn";
import { isNativeApp } from "@/lib/nativeApp";
import { useIsHydrated } from "@/lib/ui/useIsHydrated";

type Props = { open: boolean; onClose: () => void };

const STEPS: readonly string[] = [
  "Install Health Auto Export from the App Store and buy Premium (automations need it).",
  "Automations → + → REST API. Format JSON, data type Health Metrics.",
  "Metrics: Sleep Analysis, Heart Rate Variability, Resting Heart Rate, Body Mass, Body Fat Percentage, Step Count, Active Energy, Water, Caffeine, Sodium, Alcoholic Beverages. Add Sleeping Wrist Temperature only if you turned it on below.",
  "Aggregation on, Batch Requests on, date range Since Last Sync.",
  "Paste the URL and the header below, then run a Manual Export of the last year as a backfill.",
  "For workouts, a second automation set up the same way with data type Workouts. For cycle, only if you turned it on below, a third with Cycle Tracking.",
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

function nativeErrorCopy(e: Extract<SyncResult, { ok: false }>["error"] | string | null | undefined): string | null {
  switch (e) {
    case "unavailable":
      return "Apple Health isn't available on this device.";
    case "read_failed":
      return "Apple Health could not be read. Check Settings → Health → Data Access & Devices → Liftworks.";
    default:
      return null;
  }
}

/**
 * Apple Health inside the iPhone app (B11): read straight from HealthKit,
 * so there is no token or second app. Connect asks for read access once;
 * reads then run on open and on return to the app.
 */
function NativeAppleHealthSheet({ open, onClose }: Props) {
  const state = useNativeHealth();
  const haeLink = useHealthLink();
  const optIn = useHealthOptIn();
  const extras = hasHealthExtras();
  const unasked = state ? unaskedTypes(state, wantedTypes(optIn ?? {}, extras)) : [];
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<SyncResult | null>(null);
  const nowIso = () => new Date().toISOString();

  async function run(fn: () => Promise<SyncResult>) {
    setBusy(true);
    setLast(await fn());
    setBusy(false);
  }

  const status = !state
    ? "Not connected."
    : state.lastSyncAt
      ? `Last read ${receivedLabel(state.lastSyncAt, new Date())}.`
      : "Connected. Not read yet.";
  const err = nativeErrorCopy(last && !last.ok ? last.error : state?.lastError);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Apple Health"
      footer={
        state ? (
          <div className="flex flex-col gap-2">
            <PrimaryButton onClick={() => run(() => syncNativeHealth(nowIso(), true))} disabled={busy}>
              {busy ? "Reading…" : "Read now"}
            </PrimaryButton>
            <SecondaryButton
              onClick={async () => {
                await disconnectNativeHealth();
                setLast(null);
              }}
              disabled={busy}
            >
              Stop reading
            </SecondaryButton>
          </div>
        ) : (
          <PrimaryButton onClick={() => run(() => connectNativeHealth(nowIso()))} disabled={busy}>
            {busy ? "Connecting…" : "Connect Apple Health"}
          </PrimaryButton>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
          Read from Apple Health on this iPhone each time the app opens: sleep, HRV, resting heart rate, weight, body fat, steps, active energy and workouts, and the water, caffeine, sodium and drinks other apps log. Manual logging stays as the fallback.
        </p>
        <p className="text-[13px]" style={{ color: "var(--text)" }}>
          {status}
          {last?.ok ? ` Read ${last.nights} ${last.nights === 1 ? "night" : "nights"}, ${last.weighIns} ${last.weighIns === 1 ? "weigh-in" : "weigh-ins"}.` : ""}
        </p>
        {unasked.length > 0 && (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Read now asks Apple Health for the kinds added since you connected.
          </p>
        )}
        {err && (
          <p className="text-[13px]" style={{ color: "var(--status-watch)" }}>
            {err}
          </p>
        )}
        {haeLink && (
          <p className="text-[13px]" style={{ color: "var(--text-secondary)" }}>
            Health Auto Export isn&apos;t needed in the app. You can turn its automation off.
          </p>
        )}
        <HealthOptInRows
          cycleAvailable={extras}
          disabled={busy}
          onChange={async (_kind, on) => {
            // On: ask Apple Health for it and read now (before connecting, Connect asks for it). Off: what was read is already gone.
            if (on && state) await run(() => syncNativeHealth(nowIso(), true));
          }}
        />
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Liftworks only reads. To change which data it can read, use Settings → Health → Data Access & Devices.
        </p>
      </div>
    </Sheet>
  );
}

/**
 * Connect Apple Health (Sprint 0, S5): the token shown with a copy button,
 * the URL, the five settings, the state of the link, Pull now, Disconnect.
 * Inside the iPhone app, the native sheet above instead (B11).
 */
export default function AppleHealthSheet(props: Props) {
  const hydrated = useIsHydrated();
  if (hydrated && isNativeApp()) return <NativeAppleHealthSheet {...props} />;
  return <HealthAutoExportSheet {...props} />;
}

function HealthAutoExportSheet({ open, onClose }: Props) {
  const link = useHealthLink();
  const [busy, setBusy] = useState(false);
  const [disconnectFailed, setDisconnectFailed] = useState(false);
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
                setBusy(true);
                const r = await disconnectHealthLink();
                setBusy(false);
                setLast(null);
                setDisconnectFailed(!r.ok);
              }}
              disabled={busy}
            >
              Disconnect and delete
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
          Sleep, HRV, resting heart rate, weight, steps, active energy, workouts, and the water, caffeine, sodium and drinks other apps log arrive on their own through the Health Auto Export app. Manual logging stays as the fallback. Data lands within hours of unlocking the phone, not minutes.
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
        <HealthOptInRows
          disabled={busy}
          onChange={async (_kind, on) => {
            // On: pull again from the start, so readings the server already holds for it are merged.
            if (!on || !link) return;
            await repullFromStart();
            await pull();
          }}
        />
        {disconnectFailed && (
          <p className="text-[13px]" style={{ color: "var(--status-watch)" }}>
            Couldn&apos;t reach the server to delete your samples. Nothing was removed; try again when you&apos;re online.
          </p>
        )}
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          The token is a password for writing to this device&apos;s data. It lives on this phone and in the Health Auto Export app, nowhere else. Disconnecting deletes the samples stored on the server and invalidates the token.
        </p>
      </div>
    </Sheet>
  );
}
