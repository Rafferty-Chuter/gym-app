import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/assistant/route";

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
