import Link from "next/link";
import Filters, { SelectField, TextField } from "@/components/admin/Filters";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import { COMPANY_FILTERS, listCompanies, PAGE_SIZE } from "@/lib/services/admin";
import { formatDate, one, pageParam } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../_ctx";

export default async function AdminCompaniesPage(props: PageProps) {
  const { locale, t, sp, supabase, path } = await adminPage(props);
  const raw = one(sp.status) ?? "pending";
  const status = (COMPANY_FILTERS as readonly string[]).includes(raw) ? raw : "pending";
  const q = (one(sp.q) ?? "").slice(0, 80);
  const page = pageParam(sp.page);
  const { rows, total } = await listCompanies(supabase, { status, q, page });

  return (
    <>
      <Flash params={sp} t={t} />
      <p className="row-actions">
        <Link className="btn btn-green btn-small" href={path("/companies/new")}>{t("admin.company.create")}</Link>
      </p>
      <Filters action={path("/companies")} t={t}>
        <SelectField id="co-status" name="status" label={t("admin.company.verification")} value={status}
          options={COMPANY_FILTERS.map((s) => ({ value: s, label: s === "all" ? t("common.all") : t(`companyStatus.${s}`) }))} />
        <TextField id="co-q" name="q" label={t("admin.company.search")} value={q} />
      </Filters>
      <p className="muted">{total === 1 ? t("common.result1") : t("common.results", { count: total })}</p>
      {rows.length === 0 ? <p className="notice">{t("common.noResults")}</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("common.name")}</th><th>{t("common.city")}</th><th>{t("admin.company.verification")}</th>
                <th>{t("admin.company.managedBy")}</th><th>{t("admin.company.members")}</th><th>{t("common.created")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td><Link href={path(`/companies/${c.id}`)}>{c.name}</Link></td>
                  <td>{c.city ?? "—"}</td>
                  <td><StatusBadge kind="companyStatus" value={c.verification_status} t={t} /></td>
                  <td>{t(`admin.company.managed.${c.managed_by}`)}</td>
                  <td>{c.members}</td>
                  <td>{formatDate(c.created_at, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={path("/companies")} params={{ status, q }} t={t} />
    </>
  );
}
