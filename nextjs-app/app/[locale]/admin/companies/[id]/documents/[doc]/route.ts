import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { isLocale } from "@/lib/i18n/config";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verification document download for moderation. A 60-second signed URL is minted on click with the admin's own
 * client (storage RLS authorizes it) and the browser is redirected to it; nothing is cached.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ locale: string; id: string; doc: string }> }) {
  const { locale, id, doc } = await ctx.params;
  if (!isLocale(locale) || !UUID.test(id) || !UUID.test(doc)) return new NextResponse("Not found", { status: 404 });
  const { supabase } = await requireRole(locale, ["admin"]);
  const { data: row } = await supabase.from("company_verification_documents").select("storage_path").eq("id", doc).eq("company_id", id).maybeSingle();
  if (!row) return new NextResponse("Not found", { status: 404 });
  const { data, error } = await supabase.storage.from("company-documents").createSignedUrl(row.storage_path, 60);
  if (error || !data?.signedUrl) return new NextResponse("Not found", { status: 404 });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Robots-Tag", "noindex");
  return res;
}
