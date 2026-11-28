import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** Minimal "who am I" for the header. Exposes only display name and role — never the e-mail or ids. */
export async function GET() {
  const { user, profile } = await getSession();
  const body = user && profile && user.email_confirmed_at && profile.status === "active"
    ? { user: { name: profile.full_name, role: profile.role } }
    : { user: null };
  return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}
