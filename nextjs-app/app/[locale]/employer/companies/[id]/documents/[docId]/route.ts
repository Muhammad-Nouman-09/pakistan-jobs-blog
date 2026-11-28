import { NextResponse } from "next/server";
import { uuidOrEmpty } from "@/lib/validation/company";
import { routeEmployer } from "../../../../ctx";

export const dynamic = "force-dynamic";

/**
 * Verification document download. The row is loaded with the USER-scoped client (RLS: owners only), then a
 * 60-second signed URL is minted with the same client (storage policy authorizes) and the browser is redirected.
 */
export async function GET(req: Request, ctx: { params: Promise<{ locale: string; id: string; docId: string }> }) {
  const { locale, id, docId } = await ctx.params;
  const s = await routeEmployer(req, locale);
  if (s instanceof NextResponse) return s;
  const companyId = uuidOrEmpty(id);
  const documentId = uuidOrEmpty(docId);
  if (!companyId || !documentId) return new NextResponse(null, { status: 404 });

  const { data: doc } = await s.supabase.from("company_verification_documents").select("storage_path")
    .eq("id", documentId).eq("company_id", companyId).maybeSingle();
  if (!doc) return new NextResponse(null, { status: 404 });
  const { data } = await s.supabase.storage.from("company-documents").createSignedUrl((doc as { storage_path: string }).storage_path, 60);
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
