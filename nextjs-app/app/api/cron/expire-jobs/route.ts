import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PUBLIC_TAG } from "@/lib/supabase/anon";

export const dynamic = "force-dynamic";

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;                                   // no secret configured -> endpoint is closed
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Daily cron (see vercel.json): marks approved jobs whose deadline has passed as `expired` and refreshes the
 * cached public pages. Public listings already hide closed jobs by deadline, so this is bookkeeping for
 * employer dashboards and reports.
 */
export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "not configured" }, { status: 503 });
  const { data, error } = await admin.rpc("expire_jobs");
  if (error) return NextResponse.json({ error: "failed" }, { status: 500 });
  revalidateTag(PUBLIC_TAG);
  return NextResponse.json({ expired: data });
}
