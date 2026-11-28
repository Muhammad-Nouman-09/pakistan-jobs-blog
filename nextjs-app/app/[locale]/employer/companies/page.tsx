import Link from "next/link";
import CompanyLogo from "@/components/employer/CompanyLogo";
import Flash from "@/components/ui/Flash";
import StatusBadge from "@/components/ui/StatusBadge";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { loadMemberships } from "@/lib/services/employer";

export default async function CompaniesPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["employer"]);
  const memberships = await loadMemberships(supabase, user.id);
  const L = (path: string) => localePath(locale, `/employer${path}`);

  return (
    <>
      <Flash params={sp} t={t} />
      <div className="admin-row" style={{ borderBottom: 0, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{t("employer.tab.companies")}</h2>
        <Link className="btn btn-dark" href={L("/companies/new")}>{t("employer.company.create")}</Link>
      </div>
      {memberships.length === 0 ? (
        <div className="panel"><p>{t("employer.overview.noCompanyText")}</p></div>
      ) : (
        <div className="card-grid">
          {memberships.map(({ company, role }) => (
            <div key={company.id} className="card">
              <div className="company-hero" style={{ marginBottom: 8 }}>
                <CompanyLogo name={company.name} path={company.logo_path} />
                <h3 style={{ margin: 0 }}><Link href={L(`/companies/${company.id}`)}>{company.name}</Link></h3>
              </div>
              <p style={{ margin: "0 0 8px" }}>
                <StatusBadge kind="companyStatus" value={company.verification_status} t={t} />{" "}
                <StatusBadge kind="member" value={role} t={t} />
              </p>
              <p className="muted" style={{ margin: "0 0 10px" }}>{[company.industry, company.city].filter(Boolean).join(" · ") || " "}</p>
              <div className="row-actions">
                <Link className="btn btn-outline btn-small" href={L(`/companies/${company.id}`)}>{t("employer.company.manage")}</Link>
                <Link className="btn btn-outline btn-small" href={L(`/companies/${company.id}/team`)}>{t("employer.team.title")}</Link>
                <Link className="btn btn-outline btn-small" href={`${L("/jobs")}?company=${company.id}`}>{t("employer.tab.jobs")}</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
