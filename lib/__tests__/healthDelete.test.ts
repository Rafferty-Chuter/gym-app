/** DELETE /api/health/pull: a disconnect removes every stored sample and the device row for the token. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "@/app/api/health/pull/route";
import { hashToken } from "@/lib/server/supabaseRest";

const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEF";

describe("DELETE /api/health/pull", () => {
  const calls: Array<{ url: string; method: string }> = [];
  let status = 204;
  beforeEach(() => {
    calls.length = 0;
    status = 204;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        calls.push({ url, method: init?.method ?? "GET" });
        return new Response(null, { status });
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  const req = (token: string | null = TOKEN) => new Request("http://localhost/api/health/pull", { method: "DELETE", headers: token ? { authorization: `Bearer ${token}` } : {} });

  it("answers 503 without database keys and 401 without a token", async () => {
    expect((await DELETE(req())).status).toBe(503);
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    expect((await DELETE(req(null))).status).toBe(401);
    expect(calls).toHaveLength(0);
  });

  it("deletes the token's samples, then its device row, and nothing else", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    const res = await DELETE(req());
    expect(res.status).toBe(200);
    const h = encodeURIComponent(hashToken(TOKEN));
    expect(calls).toEqual([
      { url: `https://x.supabase.co/rest/v1/health_samples?device_hash=eq.${h}`, method: "DELETE" },
      { url: `https://x.supabase.co/rest/v1/health_devices?device_hash=eq.${h}`, method: "DELETE" },
    ]);
  });

  it("reports a failed delete instead of claiming success", async () => {
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    status = 500;
    expect((await DELETE(req())).status).toBe(502);
  });
});
