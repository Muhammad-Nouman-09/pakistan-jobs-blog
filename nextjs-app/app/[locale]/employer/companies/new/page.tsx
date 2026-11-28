import Breadcrumbs from "@/components/ui/Breadcrumbs";
import CompanyForm from "@/components/employer/CompanyForm";
import Flash from "@/components/ui/Flash";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { createCompanyAction } from "../actions";

export default async function NewCompanyPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  await requireRole(locale, ["employer"]);
  return (
    <>
      <Breadcrumbs t={t} items={[
        { label: t("employer.tab.companies"), href: localePath(locale, "/employer/companies") },
        { label: t("employer.company.create") }
      ]} />
      <Flash params={sp} t={t} />
      <div className="panel">
        <h2>{t("employer.company.create")}</h2>
        <p className="notice">{t("employer.company.createHelp")}</p>
        <CompanyForm locale={locale} t={t} action={createCompanyAction} submitLabel={t("employer.company.createSubmit")} />
      </div>
    </>
  );
}
