// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashToken } from "@/lib/server/supabaseRest";

/**
 * POST /api/account/delete (TR1): refuses without a valid sign-in, deletes
 * only the account the token belongs to, takes the Apple Health link's rows
 * with it, and never logs tokens. The Supabase admin client and the health
 * tables are stood in for; `accountAdmin` itself is checked against a
 * stubbed Auth server below.
 */

const admin = vi.hoisted(() => ({
  users: new Map<string, string>(),
  deleted: [] as string[],
  healthDeleted: [] as string[],
  authDown: false,
  healthDown: false,
}));

vi.mock("@/lib/server/accountAdmin", () => ({
  accountAdmin: () =>
    process.env.SUPABASE_URL
      ? {
          async userFromToken(jwt: string) {
            if (admin.authDown) throw new Error("auth check failed: 500");
            const id = admin.users.get(jwt);
            return id ? { id } : null;
          },
          async deleteUser(id: string) {
            admin.deleted.push(id);
          },
        }
      : null,
}));

vi.mock("@/lib/server/supabaseRest", async (orig) => ({
  ...(await orig<typeof import("@/lib/server/supabaseRest")>()),
  deleteHealthDevice: async (_cfg: unknown, deviceHash: string) => {
    if (admin.healthDown) throw new Error("samples delete failed: 500");
    admin.healthDeleted.push(deviceHash);
  },
}));

const { POST } = await import("@/app/api/account/delete/route");

const JWT_A = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWEifQ.c2lnbmF0dXJlLWE";
const JWT_B = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWIifQ.c2lnbmF0dXJlLWI";
const HEALTH_TOKEN = "h".repeat(43);

function req(body: unknown, jwt: string | null = JWT_A): Request {
  return new Request("http://localhost/api/account/delete", {
    method: "POST",
    headers: { "content-type": "application/json", ...(jwt ? { authorization: `Bearer ${jwt}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

let logs: string[] = [];

beforeEach(() => {
  process.env.SUPABASE_URL = "https://fake-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  admin.users = new Map([
    [JWT_A, "user-a"],
    [JWT_B, "user-b"],
  ]);
  admin.deleted = [];
  admin.healthDeleted = [];
  admin.authDown = false;
  admin.healthDown = false;
  logs = [];
  for (const m of ["log", "info", "warn", "error"] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => void logs.push(a.map(String).join(" ")));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/account/delete (TR1)", () => {
  it("answers 503 when the server has no Supabase keys", async () => {
    delete process.env.SUPABASE_URL;
    expect((await POST(req({ confirm: "delete-account" }))).status).toBe(503);
    expect(admin.deleted).toEqual([]);
  });

  it("refuses without a sign-in token, or with one that isn't a token", async () => {
    expect((await POST(req({ confirm: "delete-account" }, null))).status).toBe(401);
    expect((await POST(req({ confirm: "delete-account" }, "not-a-jwt"))).status).toBe(401);
    expect(admin.deleted).toEqual([]);
  });

  it("refuses a token Supabase doesn't accept (forged, expired, or for a deleted account)", async () => {
    const forged = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyLWEifQ.Zm9yZ2Vk";
    const res = await POST(req({ confirm: "delete-account" }, forged));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
    expect(admin.deleted).toEqual([]);
  });

  it("deletes only the account the token belongs to", async () => {
    const res = await POST(req({ confirm: "delete-account" }, JWT_B));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(admin.deleted).toEqual(["user-b"]);
    expect(admin.healthDeleted).toEqual([]);
  });

  it("won't take a user named in the body, a missing confirmation, or a bad body", async () => {
    for (const body of [{ confirm: "delete-account", userId: "user-b" }, {}, { confirm: "yes" }, "{oops", { confirm: "delete-account", healthToken: "short" }]) {
      expect((await POST(req(body))).status).toBe(400);
    }
    expect((await POST(req({ confirm: "delete-account", pad: "x".repeat(3000) }))).status).toBe(413);
    expect(admin.deleted).toEqual([]);
  });

  it("deletes the Apple Health link's rows for this device's token, then the account", async () => {
    const res = await POST(req({ confirm: "delete-account", healthToken: HEALTH_TOKEN }));
    expect(res.status).toBe(200);
    expect(admin.healthDeleted).toEqual([hashToken(HEALTH_TOKEN)]);
    expect(admin.deleted).toEqual(["user-a"]);
  });

  it("keeps the account when the health rows can't be deleted, so it can be tried again", async () => {
    admin.healthDown = true;
    const res = await POST(req({ confirm: "delete-account", healthToken: HEALTH_TOKEN }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "unavailable" });
    expect(admin.deleted).toEqual([]);
  });

  it("answers 502, not 401, when Auth can't be reached", async () => {
    admin.authDown = true;
    expect((await POST(req({ confirm: "delete-account" }))).status).toBe(502);
    expect(admin.deleted).toEqual([]);
  });

  it("never logs the sign-in token or the health token", async () => {
    admin.healthDown = true;
    await POST(req({ confirm: "delete-account", healthToken: HEALTH_TOKEN }));
    admin.healthDown = false;
    admin.authDown = true;
    await POST(req({ confirm: "delete-account", healthToken: HEALTH_TOKEN }));
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) {
      expect(line).not.toContain(JWT_A);
      expect(line).not.toContain(HEALTH_TOKEN);
      expect(line).not.toContain(hashToken(HEALTH_TOKEN));
    }
  });
});
