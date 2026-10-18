import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/assistant/route";
import { POST as EXTRACT } from "@/app/api/assistant/extract-memory/route";

// The chat is parked (lib/features.ts); these tests switch it on to check validation, then check it stays shut while parked.
const flags = vi.hoisted(() => ({ enabled: true }));
vi.mock("@/lib/features", () => ({
  get ASSISTANT_ENABLED() {
    return flags.enabled;
  },
}));
afterEach(() => {
  flags.enabled = true;
});

function post(body: unknown) {
  return new NextRequest("http://localhost/api/assistant", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const trainingSummary = { totalWorkouts: 0, totalExercises: 0, totalSets: 0, weeklyVolume: {}, recentExercises: [] };

describe("assistant route: physique payload (I2)", () => {
  it("rejects a malformed physique payload with 400 before any model call", async () => {
    const res = await POST(post({ message: "is my cut working?", trainingSummary, client_id: "test-client-0001", physique: { analysis: {}, now: {} } }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/physique payload invalid/);
  });

  it("rejects an oversized physique payload with 400", async () => {
    const res = await POST(post({ message: "is my cut working?", trainingSummary, client_id: "test-client-0001", physique: { blob: "x".repeat(70_000) } }));
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: string };
    expect(json.error).toMatch(/too large/);
  });
});

describe("assistant routes while parked (A1)", () => {
  it("answer 404 before reading the body, so no paid call can be made", async () => {
    flags.enabled = false;
    const res = await POST(post({ message: "hello", trainingSummary, client_id: "test-client-0001" }));
    expect(res.status).toBe(404);
    const mem = await EXTRACT(new Request("http://localhost/api/assistant/extract-memory", { method: "POST", body: JSON.stringify({ conversation: [{ role: "user", content: "hi" }] }) }));
    expect(mem.status).toBe(404);
  });
});
