import Link from "next/link";
import { notFound } from "next/navigation";
import JobForm from "@/components/jobs/JobForm";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { loadCategories, loadJobForEdit } from "@/lib/services/jobs";

export const metadata = noindexMetadata("Edit job");
export const dynamic = "force-dynamic";

/** Admin moderation edit: same editor as employers use. Saving a live job starts a new draft revision. */
export default async function AdminJobEdit(props: PageProps<{ id: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const { supabase } = await requireRole(locale, ["admin"]);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const job = await loadJobForEdit(supabase, params.id);
  if (!job) notFound();
  const [categories, { data: company }] = await Promise.all([
    loadCategories(supabase),
    supabase.from("companies").select("id,name").eq("id", job.company_id).maybeSingle()
  ]);
  return (
    <div>
      <p><Link href={localePath(locale, `/admin/jobs/${job.id}`)}>← {t("action.back")}</Link></p>
      <h2>{t("jobform.f.title")}: <StatusBadge kind="jobStatus" value={job.status} t={t} /></h2>
      <Flash params={sp} t={t} />
      <JobForm locale={locale} t={t} area="admin" job={job} companies={company ? [company] : []} categories={categories} />
    </div>
  );
}
