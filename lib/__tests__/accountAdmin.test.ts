// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { accountAdmin } from "@/lib/server/accountAdmin";

/**
 * `accountAdmin` with the real supabase-js against a stubbed Auth server
 * (TR1): which requests it makes, and how Auth's answers map to "not a
 * valid sign-in" (null) versus "couldn't check" (throws).
 */

type Seen = { method: string; url: string; auth: string | null; apikey: string | null };
let seen: Seen[] = [];
let answer: (url: string, method: string) => Response | Promise<Response>;

beforeEach(() => {
  process.env.SUPABASE_URL = "https://fake-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
  seen = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const h = new Headers(init?.headers);
    const method = init?.method ?? "GET";
    seen.push({ method, url, auth: h.get("authorization"), apikey: h.get("apikey") });
    return answer(url, method);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("accountAdmin (TR1)", () => {
  it("is off without the server's Supabase keys", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(accountAdmin()).toBeNull();
  });

  it("asks Auth whose token it is, with the token itself", async () => {
    answer = () => json(200, { id: "user-a", aud: "authenticated", email: "a@example.com" });
    expect(await accountAdmin()!.userFromToken("jwt-a")).toEqual({ id: "user-a" });
    expect(seen).toEqual([{ method: "GET", url: "https://fake-project.supabase.co/auth/v1/user", auth: "Bearer jwt-a", apikey: "test-service-key" }]);
  });

  it("reads a refused token as no user, and an unreachable Auth as an error", async () => {
    answer = () => json(401, { code: 401, msg: "invalid JWT" });
    expect(await accountAdmin()!.userFromToken("jwt-x")).toBeNull();
    answer = () => json(403, { code: 403, error_code: "user_not_found", msg: "User from sub claim in JWT does not exist" });
    expect(await accountAdmin()!.userFromToken("jwt-gone")).toBeNull();
    answer = () => json(500, { msg: "boom" });
    await expect(accountAdmin()!.userFromToken("jwt-a")).rejects.toThrow(/auth check failed/);
    answer = () => Promise.reject(new TypeError("fetch failed"));
    await expect(accountAdmin()!.userFromToken("jwt-a")).rejects.toThrow(/auth check failed/);
  });

  it("deletes the account by id with the service key", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    answer = () => json(200, { id });
    await accountAdmin()!.deleteUser(id);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ method: "DELETE", url: `https://fake-project.supabase.co/auth/v1/admin/users/${id}`, auth: "Bearer test-service-key" });
    answer = () => json(500, { msg: "boom" });
    await expect(accountAdmin()!.deleteUser(id)).rejects.toThrow(/user delete failed/);
  });
});
