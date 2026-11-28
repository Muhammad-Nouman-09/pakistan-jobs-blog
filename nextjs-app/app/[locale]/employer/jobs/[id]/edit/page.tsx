import { notFound, redirect } from "next/navigation";
import JobForm from "@/components/jobs/JobForm";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Flash from "@/components/ui/Flash";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { canRecruit, loadMemberships } from "@/lib/services/employer";
import { loadCategories, loadJobForEdit, pickTranslation } from "@/lib/services/jobs";
import { uuidOrEmpty } from "@/lib/validation/company";

export default async function EditJobPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const id = uuidOrEmpty(params.id);
  if (!id) notFound();
  const job = await loadJobForEdit(supabase, id);
  if (!job) notFound();
  const memberships = await loadMemberships(supabase, user.id);
  const membership = memberships.find((m) => m.company.id === job.company_id);
  // Viewers (and anyone without recruiting rights) only get the read-only job page.
  if (!membership || !canRecruit(membership.role)) redirect(localePath(locale, `/employer/jobs/${id}`));
  const categories = await loadCategories(supabase);
  const title = pickTranslation(job.translations, locale, job.default_language)?.title ?? "—";
  const locked = job.status === "pending_review" || job.status === "archived";

  return (
    <>
      <Breadcrumbs t={t} items={[
        { label: t("employer.tab.jobs"), href: localePath(locale, "/employer/jobs") },
        { label: title, href: localePath(locale, `/employer/jobs/${id}`) },
        { label: t("action.edit") }
      ]} />
      <Flash params={sp} t={t} />
      <h2>{t("employer.jobs.editTitle")}</h2>
      {locked && <p className="notice warn" role="status">{t(`employer.jobs.locked.${job.status}`)}</p>}
      <JobForm locale={locale} t={t} area="employer" job={job} categories={categories}
        companies={memberships.filter((m) => canRecruit(m.role)).map((m) => ({ id: m.company.id, name: m.company.name }))} />
    </>
  );
}
