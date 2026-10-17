import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { withPaidRoute } from "@/lib/api/guard";
import { recordTokenUsage, DAILY_INPUT_TOKEN_CAP } from "@/lib/assistantDailyCap";

const schema = z.object({ client_id: z.string().optional(), text: z.string().max(10) });

function req(body: unknown): Request {
  return new Request("http://localhost/api/x", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("withPaidRoute", () => {
  const handler = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  const route = withPaidRoute({ schema, maxBytes: 200, subCall: "food_parse" }, handler);

  it("rejects malformed input with 400 and never calls the handler", async () => {
    expect((await route(req({ client_id: "client-123456", text: "way too long" }))).status).toBe(400);
    expect((await route(req("{not json"))).status).toBe(400);
    expect(handler).not.toHaveBeenCalled();
  });

  it("requires client_id", async () => {
    expect((await route(req({ text: "hi" }))).status).toBe(400);
  });

  it("caps body size with 413", async () => {
    expect((await route(req({ client_id: "client-123456", text: "x".repeat(10), pad: "y".repeat(400) }))).status).toBe(413);
  });

  it("checks the daily cap only after validation, and returns 429 when over", async () => {
    recordTokenUsage("capped-client-1", DAILY_INPUT_TOKEN_CAP);
    // Invalid body with a capped client → 400, not 429 (validation first).
    expect((await route(req({ client_id: "capped-client-1", text: "way too long" }))).status).toBe(400);
    expect((await route(req({ client_id: "capped-client-1", text: "hi" }))).status).toBe(429);
    expect(handler).not.toHaveBeenCalled();
  });

  it("calls the handler for a valid body and hides thrown errors", async () => {
    const res = await route(req({ client_id: "client-123456", text: "hi" }));
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
    const boom = withPaidRoute({ schema, maxBytes: 200, subCall: "food_parse" }, async () => {
      throw new Error("secret detail");
    });
    const r2 = await boom(req({ client_id: "client-123456", text: "hi" }));
    expect(r2.status).toBe(500);
    expect(await r2.text()).not.toContain("secret");
  });
});
