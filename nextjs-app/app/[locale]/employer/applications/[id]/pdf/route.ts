import { NextResponse } from "next/server";
import { loadApplication } from "@/lib/services/employer";
import { uuidOrEmpty } from "@/lib/validation/company";
import { routeEmployer } from "../../../ctx";

export const dynamic = "force-dynamic";

/**
 * The applicant's PDF resume. The application is loaded with the USER-scoped client (RLS: owners/recruiters of
 * the company only; withdrawn applications are redacted), then a 60-second signed URL is minted with the same
 * client — the storage policy (can_read_resume_object) authorizes it again — and the browser is redirected.
 */
export async function GET(req: Request, ctx: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await ctx.params;
  const s = await routeEmployer(req, locale);
  if (s instanceof NextResponse) return s;
  const appId = uuidOrEmpty(id);
  if (!appId) return new NextResponse(null, { status: 404 });

  const app = await loadApplication(s.supabase, appId);
  const path = app && app.status !== "withdrawn" ? app.resume_snapshot?.pdf_path : null;
  if (!path) return new NextResponse(null, { status: 404 });
  const { data } = await s.supabase.storage.from("resumes").createSignedUrl(path, 60);
  if (!data?.signedUrl) return new NextResponse(null, { status: 404 });
  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
