import CompanyFields from "@/components/admin/CompanyFields";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Flash from "@/components/ui/Flash";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../_ctx";
import { createCompanyAction } from "../actions";

export default async function AdminNewCompanyPage(props: PageProps) {
  const { locale, t, sp, path } = await adminPage(props);
  return (
    <>
      <Breadcrumbs t={t} items={[{ label: t("admin.tab.companies"), href: path("/companies") }, { label: t("admin.company.create") }]} />
      <Flash params={sp} t={t} />
      <div className="form-card">
        <h2 style={{ marginTop: 0 }}>{t("admin.company.create")}</h2>
        <p className="muted">{t("admin.company.createHelp")}</p>
        <form action={createCompanyAction}>
          <input type="hidden" name="locale" value={locale} />
          <CompanyFields t={t} />
          <label htmlFor="owner-email">{t("admin.company.ownerEmail")}</label>
          <input id="owner-email" name="ownerEmail" type="email" maxLength={200} autoComplete="off" aria-describedby="owner-help" />
          <span id="owner-help" className="muted">{t("admin.company.ownerHelp")}</span>
          <label><input type="checkbox" name="verified" defaultChecked /> {t("admin.company.createVerified")}</label>
          <p><button className="btn btn-dark" type="submit">{t("action.create")}</button></p>
        </form>
      </div>
    </>
  );
}
