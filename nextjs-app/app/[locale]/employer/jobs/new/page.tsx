import Link from "next/link";
import JobForm from "@/components/jobs/JobForm";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Flash from "@/components/ui/Flash";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { canRecruit, loadMemberships } from "@/lib/services/employer";
import { loadCategories } from "@/lib/services/jobs";
import { one } from "@/lib/utils";

export default async function NewJobPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const memberships = (await loadMemberships(supabase, user.id)).filter((m) => canRecruit(m.role));
  const L = (path: string) => localePath(locale, `/employer${path}`);
  const crumbs = [{ label: t("employer.tab.jobs"), href: L("/jobs") }, { label: t("employer.tab.newJob") }];

  if (memberships.length === 0) {
    return (
      <>
        <Breadcrumbs t={t} items={crumbs} />
        <div className="panel">
          <h2>{t("employer.jobs.noCompanyTitle")}</h2>
          <p>{t("employer.jobs.noCompanyText")}</p>
          <Link className="btn btn-dark" href={L("/companies/new")}>{t("employer.company.create")}</Link>
        </div>
      </>
    );
  }

  const categories = await loadCategories(supabase);
  const wanted = one(sp.company);
  const preselected = memberships.find((m) => m.company.id === wanted)?.company.id;
  const unverified = memberships.filter((m) => m.company.verification_status !== "verified");

  return (
    <>
      <Breadcrumbs t={t} items={crumbs} />
      <Flash params={sp} t={t} />
      <h2>{t("employer.tab.newJob")}</h2>
      {unverified.length > 0 && (
        <div className="notice warn" role="status">
          <p style={{ margin: 0 }}>{t("employer.jobs.unverifiedWarning")}</p>
          <ul style={{ margin: "6px 0 0", paddingInlineStart: 20 }}>
            {unverified.map((m) => (
              <li key={m.company.id}>
                <Link href={L(`/companies/${m.company.id}`)}>{m.company.name}</Link> — {t(`companyStatus.${m.company.verification_status}`)}
              </li>
            ))}
          </ul>
        </div>
      )}
      <JobForm locale={locale} t={t} area="employer" job={null} categories={categories}
        companies={memberships.map((m) => ({ id: m.company.id, name: m.company.name }))} companyId={preselected} />
    </>
  );
}
