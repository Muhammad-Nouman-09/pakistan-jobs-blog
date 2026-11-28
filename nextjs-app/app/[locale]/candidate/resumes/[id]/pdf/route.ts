import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isLocale, localePath } from "@/lib/i18n/config";
import { getResume } from "@/lib/services/candidate";

export const dynamic = "force-dynamic";

/**
 * Download of the PDF attached to one of the signed-in user's own resumes. The resume row is read with the
 * USER client (RLS = own rows only, so someone else's id is a 404), and the 60-second signed URL is minted
 * with that same client, so the storage policy authorizes it too. No public URL is ever exposed.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await ctx.params;
  if (!isLocale(locale)) return new NextResponse("Not found", { status: 404 });

  const s = await getSession();
  if (!s.supabase || !s.user || !s.profile) {
    const next = encodeURIComponent(localePath(locale, `/candidate/resumes/${id}/pdf`));
    return NextResponse.redirect(new URL(localePath(locale, `/auth/login?next=${next}`), req.url), 302);
  }
  if (s.profile.role !== "job_seeker" || s.profile.status !== "active") return new NextResponse("Forbidden", { status: 403 });

  const resume = await getResume(s.supabase, s.user.id, id);
  if (!resume || !resume.pdf_path || !resume.pdf_path.startsWith(`${s.user.id}/`)) return new NextResponse("Not found", { status: 404 });

  const { data, error } = await s.supabase.storage.from("resumes").createSignedUrl(resume.pdf_path, 60, { download: resume.pdf_name ?? "resume.pdf" });
  if (error || !data?.signedUrl) return new NextResponse("Not found", { status: 404 });

  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}
