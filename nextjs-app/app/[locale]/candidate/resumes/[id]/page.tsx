import Link from "next/link";
import { notFound } from "next/navigation";
import Flash from "@/components/ui/Flash";
import ResumeForm from "@/components/candidate/ResumeForm";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { getResume } from "@/lib/services/candidate";
import { looseContent } from "@/lib/validation/candidate";

export async function generateMetadata(props: PageProps<{ id: string }>) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.resumes.edit"));
}

export default async function EditResumePage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["job_seeker"]);
  const r = await getResume(supabase, user.id, params.id);
  if (!r) notFound();
  const base = localePath(locale, `/candidate/resumes/${r.id}`);

  return (
    <>
      <Flash params={sp} t={t} />
      <section className="panel">
        <h2>{t("candidate.resumes.edit")}</h2>
        <div className="row-actions">
          <Link className="btn btn-outline btn-small" href={`${base}/preview`}>{t("action.preview")}</Link>
          <Link className="btn btn-outline btn-small" href={localePath(locale, "/candidate/resumes")}>{t("action.back")}</Link>
        </div>
      </section>
      <ResumeForm
        t={t} locale={locale} id={r.id}
        values={{ title: r.title, visibility: r.visibility, is_default: r.is_default, content: looseContent(r.content) }}
        pdf={r.pdf_path ? { name: r.pdf_name, size: r.pdf_size } : null}
      />
    </>
  );
}
