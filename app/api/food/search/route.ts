/**
 * GET /api/food/search?q= — UK products from Open Food Facts (M4), mapped
 * to FoodItem. Free upstream, so no cost log; validated and cached a day
 * per query at the edge and in the data cache. The generic base list is
 * searched on the phone, not here.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { OFF_REVALIDATE_S, searchOff } from "@/lib/server/off";

export const runtime = "nodejs";
export const preferredRegion = "lhr1";

const Query = z.string().trim().min(2).max(80);

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const parsed = Query.safeParse(url.searchParams.get("q") ?? "");
  if (!parsed.success) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  const r = await searchOff(parsed.data);
  if (!r.ok) return NextResponse.json({ error: "upstream", status: r.status }, { status: 502 });
  return NextResponse.json({ items: r.value }, { headers: { "Cache-Control": `public, s-maxage=${OFF_REVALIDATE_S}, stale-while-revalidate=${OFF_REVALIDATE_S * 7}` } });
}
