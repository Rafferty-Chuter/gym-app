// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";

/**
 * The sync table's row-level security and last-write-wins push (PR4, S1's
 * "user A can't read user B"), on a real Postgres (PGlite) with Supabase's
 * `auth.uid()` and roles stood in for.
 */

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
let db: PGlite;

async function as(user: string | null, sql: string, params: unknown[] = []) {
  await db.exec(user ? "set role authenticated" : "set role anon");
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

const push = (user: string | null, rows: unknown[]) => as(user, "select public.sync_push($1::jsonb) as n", [JSON.stringify(rows)]);
const readAll = (user: string | null) => as(user, "select k, id, data, deleted from public.sync_records order by k, id");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    insert into auth.users (id) values ('${A}'), ('${B}');
  `);
  await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/0003_sync.sql"), "utf8"));
}, 60_000);

describe("sync table (PR4)", () => {
  it("lets each user write and read their own rows only", async () => {
    await push(A, [{ k: "physique.v1.weighIns", id: "w1", data: { kg: 82.1 }, updated_at: "2026-10-21T08:00:00Z" }]);
    await push(B, [{ k: "physique.v1.weighIns", id: "w1", data: { kg: 95 }, updated_at: "2026-10-21T08:00:00Z" }]);
    const a = await readAll(A);
    const b = await readAll(B);
    expect(a.rows).toEqual([{ k: "physique.v1.weighIns", id: "w1", data: { kg: 82.1 }, deleted: false }]);
    expect(b.rows).toEqual([{ k: "physique.v1.weighIns", id: "w1", data: { kg: 95 }, deleted: false }]);
  });

  it("refuses a user writing a row as someone else, and anyone signed out", async () => {
    await expect(as(A, "insert into public.sync_records (user_id, k, id, data, updated_at) values ($1, 'x', 'y', '{}', now())", [B])).rejects.toThrow();
    await expect(push(null, [{ k: "x", id: "y", data: {}, updated_at: "2026-10-21T08:00:00Z" }])).rejects.toThrow();
    await expect(readAll(null)).rejects.toThrow();
    const updated = await as(A, "update public.sync_records set data = '{\"kg\": 1}' where user_id = $1", [B]);
    expect(updated.affectedRows ?? 0).toBe(0);
    expect((await readAll(B)).rows[0]).toMatchObject({ data: { kg: 95 } });
  });

  it("keeps the newer write and ignores an older one", async () => {
    await push(A, [{ k: "physique.v1.goal", id: "", data: { targetKg: 78 }, updated_at: "2026-10-21T10:00:00Z" }]);
    await push(A, [{ k: "physique.v1.goal", id: "", data: { targetKg: 80 }, updated_at: "2026-10-21T09:00:00Z" }]);
    expect((await as(A, "select data from public.sync_records where k = 'physique.v1.goal'")).rows[0]).toEqual({ data: { targetKg: 78 } });
    await push(A, [{ k: "physique.v1.goal", id: "", data: { targetKg: 76 }, updated_at: "2026-10-21T11:00:00Z" }]);
    expect((await as(A, "select data from public.sync_records where k = 'physique.v1.goal'")).rows[0]).toEqual({ data: { targetKg: 76 } });
  });

  it("records a delete as a row marked deleted, and has no hard delete", async () => {
    await push(A, [{ k: "physique.v1.weighIns", id: "w1", data: null, deleted: true, updated_at: "2026-10-21T12:00:00Z" }]);
    expect((await readAll(A)).rows.find((r) => (r as { id: string }).id === "w1")).toMatchObject({ deleted: true, data: null });
    await expect(as(A, "delete from public.sync_records")).rejects.toThrow();
  });

  it("refuses a batch over 500 rows", async () => {
    const rows = Array.from({ length: 501 }, (_, i) => ({ k: "k", id: `${i}`, data: {}, updated_at: "2026-10-21T08:00:00Z" }));
    await expect(push(A, rows)).rejects.toThrow(/at most 500/);
  });

  it("records consent rows like any other, under the same rules (TR1)", async () => {
    const consent = (withdrawnAt?: string) => ({ k: "consent.v1", id: "sync:c1", data: { kind: "sync", id: "c1", version: 1, at: "2026-10-21T09:00:00Z", ...(withdrawnAt ? { withdrawnAt } : {}) }, updated_at: withdrawnAt ?? "2026-10-21T09:00:00Z" });
    await push(A, [consent()]);
    await push(A, [consent("2026-10-22T10:00:00Z")]);
    const rows = (await as(A, "select data from public.sync_records where k = 'consent.v1'")).rows as Array<{ data: { withdrawnAt?: string } }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].data.withdrawnAt).toBe("2026-10-22T10:00:00Z");
    expect((await as(B, "select 1 from public.sync_records where k = 'consent.v1'")).rows).toHaveLength(0);
  });

  it("takes every row of a deleted account with it, and only that account's (TR1)", async () => {
    await push(B, [{ k: "physique.v1.goal", id: "", data: { targetKg: 90 }, updated_at: "2026-10-21T08:00:00Z" }]);
    expect((await readAll(B)).rows.length).toBeGreaterThan(0);
    const aBefore = (await readAll(A)).rows.length;
    // What auth.admin.deleteUser does to the table (as the service role, which bypasses RLS).
    await db.query("delete from auth.users where id = $1", [B]);
    expect((await db.query("select 1 from public.sync_records where user_id = $1", [B])).rows).toHaveLength(0);
    expect((await readAll(A)).rows.length).toBe(aBefore);
  });
});
