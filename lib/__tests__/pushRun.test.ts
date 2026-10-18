/** The reminder scheduler against a stubbed PostgREST and a stubbed push send. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
let sendStatus: number | null = null;

vi.mock("web-push", () => ({
  default: {
    sendNotification: vi.fn(async (sub: { endpoint: string }, payload: string) => {
      if (sendStatus != null) {
        const err = new Error("push failed") as Error & { statusCode: number };
        err.statusCode = sendStatus;
        throw err;
      }
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    }),
  },
}));

import { GET } from "@/app/api/push/run/route";

type Call = { url: string; method: string; body: unknown };

const SUB = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };
const SECRET = "cron-secret-123456789012345678901234";

function device(over: Partial<Record<string, unknown>> = {}) {
  return {
    device_hash: "d1",
    subscription: SUB,
    tz: "Europe/London",
    reminder_hhmm: "09:00",
    summary: { logged: { food: ["2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-16"], weight: ["2026-10-14", "2026-10-15"], sleep: [] }, first: { food: "2026-09-01", weight: "2026-10-14", sleep: null } },
    summary_at: "2026-10-16T07:00:00.000Z",
    health_hash: null,
    last_run_day: null,
    failures: 0,
    ...over,
  };
}

describe("GET /api/push/run", () => {
  const calls: Call[] = [];
  let devices: unknown[] = [];
  let healthRows: Array<{ metric: string; day: string }> = [];
  beforeEach(() => {
    calls.length = 0;
    sent.length = 0;
    sendStatus = null;
    devices = [];
    healthRows = [];
    process.env.SUPABASE_URL = "https://x.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "k";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "B".repeat(87);
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "https://example.test";
    process.env.CRON_SECRET = SECRET;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T08:10:00.000Z")); // 09:10 in London
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (url.includes("/rest/v1/push_devices") && method === "GET") return new Response(JSON.stringify(devices), { status: 200 });
        if (url.includes("/rest/v1/health_samples")) return new Response(JSON.stringify(healthRows), { status: 200 });
        if (method === "PATCH") return new Response(JSON.stringify([{ device_hash: "d1" }]), { status: 200 });
        return new Response(null, { status: 204 });
      })
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "CRON_SECRET"]) delete process.env[k];
  });

  const req = (secret: string | null = SECRET) => new Request("http://localhost/api/push/run", { headers: secret ? { authorization: `Bearer ${secret}` } : {} });

  it("needs the cron secret and the keys", async () => {
    expect((await GET(req(null))).status).toBe(401);
    expect((await GET(req("wrong"))).status).toBe(401);
    delete process.env.VAPID_PRIVATE_KEY;
    expect((await GET(req())).status).toBe(503);
  });

  it("sends one push about today to a device whose time has just passed", async () => {
    devices = [device()];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ checked: 1, due: 1, sent: 1, quiet: 0, removed: 0, skipped: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].endpoint).toBe(SUB.endpoint);
    expect(sent[0].payload).toEqual({ title: "Today", body: "No weigh-in yet.", url: "/body?date=2026-10-16", tag: "daily" });
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toMatchObject({ last_run_day: "2026-10-16", failures: 0 });
    expect(JSON.stringify(calls)).not.toContain("Oats");
  });

  it("stays quiet when nothing is missing, and skips a device already run today or outside its window", async () => {
    devices = [
      device({ summary: { logged: { food: ["2026-10-15", "2026-10-16"], weight: ["2026-10-15", "2026-10-16"], sleep: [] }, first: { food: "2026-10-15", weight: "2026-10-15", sleep: null } } }),
      device({ device_hash: "d2", last_run_day: "2026-10-16" }),
      device({ device_hash: "d3", reminder_hhmm: "20:00" }),
      device({ device_hash: "d4", tz: "Asia/Tokyo" }), // 17:10 there
    ];
    const res = await GET(req());
    expect(await res.json()).toEqual({ checked: 4, due: 1, sent: 0, quiet: 1, removed: 0, skipped: 0 });
    expect(sent).toHaveLength(0);
  });

  it("counts Apple Health weigh-ins the server already holds", async () => {
    devices = [device({ health_hash: "h1", summary: { logged: { food: ["2026-10-15"], weight: [], sleep: [] }, first: { food: "2026-10-15", weight: null, sleep: null } } })];
    healthRows = [
      { metric: "weight", day: "2026-10-14" },
      { metric: "weight", day: "2026-10-16" },
    ];
    const res = await GET(req());
    expect(await res.json()).toMatchObject({ due: 1, sent: 0, quiet: 1 });
    healthRows = [{ metric: "weight", day: "2026-10-14" }];
    devices = [device({ device_hash: "d2", health_hash: "h1", summary: { logged: { food: ["2026-10-15"], weight: [], sleep: [] }, first: { food: "2026-10-15", weight: null, sleep: null } } })];
    expect(await (await GET(req())).json()).toMatchObject({ due: 1, sent: 1 });
    expect(sent[0].payload.body).toBe("No weigh-in yet.");
  });

  it("on a Monday sends the week report even when nothing is missing", async () => {
    vi.setSystemTime(new Date("2026-10-19T08:10:00.000Z")); // Monday 09:10 in London
    const week = ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"];
    devices = [device({ summary_at: "2026-10-19T07:00:00.000Z", summary: { logged: { food: week, weight: week, sleep: [] }, first: { food: "2026-09-01", weight: "2026-10-01", sleep: null } } })];
    const res = await GET(req());
    expect(await res.json()).toMatchObject({ due: 1, sent: 1, quiet: 0 });
    expect(sent[0].payload).toEqual({ title: "Weekly report · 12 to 18 Oct", body: "Where you're heading, what to fix and next week's targets.", url: "/report?week=2026-10-12", tag: "daily" });
  });

  it("drops a device the push service says is gone, and one with a stale summary says nothing", async () => {
    devices = [device(), device({ device_hash: "d2", summary_at: "2026-09-01T07:00:00.000Z" })];
    sendStatus = 410;
    const res = await GET(req());
    expect(await res.json()).toEqual({ checked: 2, due: 2, sent: 0, quiet: 0, removed: 1, skipped: 1 });
    expect(calls.some((c) => c.method === "DELETE" && c.url.includes("device_hash=eq.d1"))).toBe(true);
  });
});
