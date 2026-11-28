import Link from "next/link";
import { notFound } from "next/navigation";
import PrintButton from "@/components/candidate/PrintButton";
import ResumeDocument from "@/components/candidate/ResumeDocument";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { getResume } from "@/lib/services/candidate";

export async function generateMetadata(props: PageProps<{ id: string }>) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.resume.previewTitle"));
}

export default async function ResumePreviewPage(props: PageProps<{ id: string }>) {
  const { locale, t, params } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["job_seeker"]);
  const r = await getResume(supabase, user.id, params.id);
  if (!r) notFound();

  return (
    <>
      <div className="row-actions no-print" style={{ margin: "0 0 14px" }}>
        <PrintButton label={t("candidate.resume.print")} />
        <Link className="btn btn-outline btn-small" href={localePath(locale, `/candidate/resumes/${r.id}`)}>{t("action.edit")}</Link>
        {r.pdf_path && <a className="btn btn-outline btn-small" href={localePath(locale, `/candidate/resumes/${r.id}/pdf`)}>{t("action.download")}</a>}
        <Link className="btn btn-outline btn-small" href={localePath(locale, "/candidate/resumes")}>{t("action.back")}</Link>
      </div>
      <div className="panel resume-doc"><ResumeDocument content={r.content} t={t} locale={locale} /></div>
    </>
  );
}
