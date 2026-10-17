/**
 * GET /api/food/barcode?code= — one Open Food Facts product by EAN / UPC
 * (M4), mapped to FoodItem; 404 when OFF has nothing usable for it.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { OFF_REVALIDATE_S, lookupBarcode } from "@/lib/server/off";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";

const Code = z.string().trim().regex(/^\d{8,14}$/);

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = Code.safeParse(url.searchParams.get("code") ?? "");
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await lookupBarcode(parsed.data);
  if (!r.ok) return NextResponse.json({ error: "upstream", status: r.status }, { status: 502 });
  if (!r.value) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ item: r.value }, { headers: { "Cache-Control": `public, s-maxage=${OFF_REVALIDATE_S}, stale-while-revalidate=${OFF_REVALIDATE_S * 7}` } });
}
