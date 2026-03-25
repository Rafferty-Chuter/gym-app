"use client";

import { useState } from "react";
import Link from "next/link";
import {
  APP_LOCAL_STORAGE_KEYS,
  exportAppLocalStorageSnapshot,
  importAppLocalStorageSnapshot,
  listUnknownKeysInImport,
} from "@/lib/devDataTransfer";

export default function DevDataTransferClient() {
  const [exportText, setExportText] = useState("");
  const [importText, setImportText] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  function handleExport() {
    try {
      const json = exportAppLocalStorageSnapshot();
      setExportText(json);
      setStatus("Exported — copy the text below.");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Export failed.");
    }
  }

  function handleImportConfirm() {
    setStatus(null);
    const unknown = listUnknownKeysInImport(importText);
    const result = importAppLocalStorageSnapshot(importText);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    const extra =
      unknown.length > 0 ? ` Ignored unknown keys: ${unknown.join(", ")}.` : "";
    setStatus(`Restored ${result.restored.length} entries.${extra} Reloading…`);
    window.setTimeout(() => {
      window.location.reload();
    }, 400);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white px-4 py-8 pb-28">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <Link href="/profile" className="text-sm text-teal-400 hover:text-teal-200">
            ← Back to Profile
          </Link>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Dev: data transfer</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Export all app localStorage to JSON, copy it, then import on another device.{" "}
            <strong className="text-amber-200/90">Development only.</strong>
          </p>
        </div>

        <section className="rounded-2xl border border-amber-500/25 bg-zinc-900/80 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-amber-100">Export</h2>
          <button
            type="button"
            onClick={handleExport}
            className="rounded-xl bg-amber-500/20 border border-amber-400/40 px-4 py-2.5 text-sm font-semibold text-amber-100 hover:bg-amber-500/30"
          >
            Export Data
          </button>
          <textarea
            readOnly
            value={exportText}
            placeholder="Press “Export Data” to fill this with JSON…"
            className="w-full min-h-[220px] rounded-xl border border-zinc-600 bg-zinc-950 p-3 font-mono text-xs text-zinc-200"
          />
        </section>

        <section className="rounded-2xl border border-teal-500/25 bg-zinc-900/80 p-5 space-y-3">
          <h2 className="text-lg font-semibold text-teal-100">Import</h2>
          {!importOpen ? (
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="rounded-xl bg-teal-500/20 border border-teal-400/40 px-4 py-2.5 text-sm font-semibold text-teal-100 hover:bg-teal-500/30"
            >
              Import Data
            </button>
          ) : (
            <>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste exported JSON here…"
                className="w-full min-h-[220px] rounded-xl border border-zinc-600 bg-zinc-950 p-3 font-mono text-xs text-zinc-200"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleImportConfirm}
                  className="rounded-xl bg-teal-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-teal-500"
                >
                  Confirm import &amp; reload
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setImportOpen(false);
                    setImportText("");
                  }}
                  className="rounded-xl border border-zinc-600 px-4 py-2.5 text-sm text-zinc-300 hover:bg-zinc-800"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </section>

        <section className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-4">
          <h2 className="text-sm font-semibold text-zinc-300 mb-2">Keys in this export</h2>
          <ul className="text-xs font-mono text-zinc-400 space-y-1 columns-1 sm:columns-2 gap-x-6">
            {APP_LOCAL_STORAGE_KEYS.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
        </section>

        {status ? (
          <p className="text-sm text-zinc-300 border border-zinc-600 rounded-lg px-3 py-2">{status}</p>
        ) : null}
      </div>
    </main>
  );
}
