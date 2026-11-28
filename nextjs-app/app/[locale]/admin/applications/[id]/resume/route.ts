import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Applicant PDF, for moderation only. A 60-second signed URL is created with the admin's own client (the storage
 * policy `can_read_resume_object` allows admins for non-withdrawn applications) and the browser is redirected.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await ctx.params;
  if (!isLocale(locale) || !UUID.test(id)) return new NextResponse("Not found", { status: 404 });
  const { supabase } = await requireRole(locale, ["admin"]);
  const { data: app } = await supabase.from("applications").select("resume_snapshot,status").eq("id", id).maybeSingle();
  const path = app && app.status !== "withdrawn" ? (app.resume_snapshot as { pdf_path?: string } | null)?.pdf_path : null;
  if (!path) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await supabase.storage.from("resumes").createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
