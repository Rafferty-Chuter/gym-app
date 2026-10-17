/** The ingest route against a stubbed PostgREST: auth, parsing, upsert rows, and the 503 without keys. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/ingest/hae/route";
import { hashToken } from "@/lib/server/supabaseRest";

const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEF";

type Call = { url: string; method: string; body: unknown };

describe("POST /api/ingest/hae", () => {
  const calls: Call[] = [];
  beforeEach(() => {
    calls.length = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null });
        if ((init?.method ?? "GET") === "GET") return new Response(JSON.stringify([{ samples: 3 }]), { status: 200 });
        return new Response(null, { status: 201 });
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  const req = (body: unknown, token: string | null = TOKEN) =>
    new Request("http://localhost/api/ingest/hae", { method: "POST", headers: token ? { authorization: `Bearer ${token}`, "content-type": "application/json" } : {}, body: JSON.stringify(body) });

  it("answers 503 without database keys and 401 without a token", async () => {
    expect((await POST(req({}))).status).toBe(503);
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    expect((await POST(req({}, null))).status).toBe(401);
    expect((await POST(req({}, "short"))).status).toBe(401);
  });

  it("stores one row per metric and day under the token's hash, never the token", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co/";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    const res = await POST(
      req({
        data: {
          metrics: [
            { name: "sleep_analysis", units: "hr", data: [{ date: "2026-10-15 00:00:00 +0100", totalSleep: 7.1, inBed: 7.6, sleepStart: "2026-10-14 23:10:00 +0100", sleepEnd: "2026-10-15 07:05:00 +0100" }] },
            { name: "weight_body_mass", units: "kg", data: [{ date: "2026-10-15 07:02:00 +0100", qty: 82.4 }, { date: "2026-10-15 19:00:00 +0100", qty: 83.0 }] },
          ],
        },
      })
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ received: 2 });
    const upsert = calls.find((c) => c.url.includes("/rest/v1/health_samples"));
    expect(upsert?.url).toBe("https://x.supabase.co/rest/v1/health_samples?on_conflict=device_hash,metric,day");
    const rows = upsert?.body as Array<Record<string, unknown>>;
    expect(rows.map((r) => r.metric)).toEqual(["sleep", "weight"]);
    expect(rows[0].device_hash).toBe(hashToken(TOKEN));
    expect(rows[1].value).toEqual({ value: 83, at: "2026-10-15T19:00:00" });
    expect(JSON.stringify(calls)).not.toContain(TOKEN);
  });

  it("rejects a non-JSON body", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    const res = await POST(new Request("http://localhost/api/ingest/hae", { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: "nope" }));
    expect(res.status).toBe(400);
  });
});
