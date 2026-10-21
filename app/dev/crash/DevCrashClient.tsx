"use client";

import { useState } from "react";

/** Messages carry made-up health values so the server log shows them scrubbed. */
const SAMPLE = "weigh-in 83.71 kg on 2026-10-19, \"Greek yoghurt\" 2437 kcal";

function Thrower(): never {
  throw new Error(`Render failed for ${SAMPLE}`);
}

export default function DevCrashClient() {
  const [crash, setCrash] = useState(false);
  const button = "h-11 rounded-xl px-4 text-[15px] font-semibold";
  const style = { background: "var(--surface-raised)", color: "var(--text)" };
  return (
    <main className="min-h-screen px-5 pb-28 pt-10" style={{ background: "var(--page)", color: "var(--text)" }}>
      <h1 className="text-[28px] font-semibold">Crash test</h1>
      <p className="mt-2 text-[15px]" style={{ color: "var(--text-secondary)" }}>
        Each button throws an error that names made-up values. Watch the dev server for the scrubbed line.
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <button type="button" className={button} style={style} onClick={() => setCrash(true)}>
          Throw while rendering
        </button>
        <button
          type="button"
          className={button}
          style={style}
          onClick={() => {
            throw new Error(`Handler failed for ${SAMPLE}`);
          }}
        >
          Throw in a tap handler
        </button>
        <button type="button" className={button} style={style} onClick={() => void Promise.reject(new Error(`Promise failed for ${SAMPLE}`))}>
          Reject a promise
        </button>
      </div>
      {crash && <Thrower />}
    </main>
  );
}
