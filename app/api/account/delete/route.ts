/**
 * POST /api/account/delete — delete the signed-in person's account (TR1,
 * App Review 5.1.1(v)). The account is the one the Supabase sign-in token
 * in the Authorization header belongs to, checked by Supabase Auth; the
 * body can't name anyone else. Deletes the Apple Health link's rows for
 * the device's token if one is sent, then the account with the service
 * role (`auth.admin.deleteUser`; `sync_records` cascades). Health rows go
 * first so a failure leaves an account to retry from. Generic errors; no
 * tokens or values logged (CLAUDE.md rule 10).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { accountAdmin } from "@/lib/server/accountAdmin";
import { deleteHealthDevice, hashToken, MIN_TOKEN_LENGTH, supabaseConfig } from "@/lib/server/supabaseRest";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";

/** The body is two short fields; anything bigger is not from the app. OURS. */
const MAX_BYTES = 2_000;

const bodySchema = z
  .object({
    /** Says the person confirmed in the app's sheet; guards against a stray POST. */
    confirm: z.literal("delete-account"),
    /** This device's Apple Health link token, so its rows on our server go too. */
    healthToken: z.string().min(MIN_TOKEN_LENGTH).max(256).optional(),
  })
  .strict();

/** A Supabase access token: a JWT (three base64url parts) in the Authorization header. */
function signInToken(request: Request): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec((request.headers.get("authorization") ?? "").trim());
  const t = m?.[1] ?? "";
  return t.length <= 8192 && /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t) ? t : null;
}

function fail(status: number, error: string): Response {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request): Promise<Response> {
  const cfg = supabaseConfig();
  const admin = accountAdmin();
  if (!cfg || !admin) return fail(503, "not_configured");
  const jwt = signInToken(request);
  if (!jwt) return fail(401, "unauthorized");

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return fail(400, "bad_request");
  }
  if (raw.length > MAX_BYTES) return fail(413, "too_large");
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return fail(400, "bad_request");
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return fail(400, "bad_request");

  let user: { id: string } | null;
  try {
    user = await admin.userFromToken(jwt);
  } catch (e) {
    console.error(`[account/delete] ${e instanceof Error ? e.message : "auth check failed"}`);
    return fail(502, "unavailable");
  }
  if (!user) return fail(401, "unauthorized");

  try {
    if (parsed.data.healthToken) await deleteHealthDevice(cfg, hashToken(parsed.data.healthToken));
    await admin.deleteUser(user.id);
  } catch (e) {
    console.error(`[account/delete] ${e instanceof Error ? e.message : "delete failed"}`);
    return fail(502, "unavailable");
  }
  return NextResponse.json({ deleted: true });
}
