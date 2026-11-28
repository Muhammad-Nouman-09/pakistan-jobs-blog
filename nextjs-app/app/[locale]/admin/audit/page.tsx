import Filters, { SelectField, TextField } from "@/components/admin/Filters";
import AuditTable from "@/components/admin/AuditTable";
import Pagination from "@/components/ui/Pagination";
import { AUDIT_ENTITIES, AUDIT_PAGE_SIZE, AUDIT_PREFIXES, listAudit } from "@/lib/services/admin";
import { one, pageParam } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../_ctx";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminAuditPage(props: PageProps) {
  const { locale, t, sp, supabase, path } = await adminPage(props);
  const prefix = (AUDIT_PREFIXES as readonly string[]).includes(one(sp.prefix) ?? "") ? (one(sp.prefix) as string) : "";
  const entity = (AUDIT_ENTITIES as readonly string[]).includes(one(sp.entity) ?? "") ? (one(sp.entity) as string) : "";
  const from = DATE.test(one(sp.from) ?? "") ? (one(sp.from) as string) : "";
  const to = DATE.test(one(sp.to) ?? "") ? (one(sp.to) as string) : "";
  const page = pageParam(sp.page);
  const { rows, total } = await listAudit(supabase, { prefix, entity, from, to, page });

  return (
    <>
      <p className="muted">{t("admin.audit.note")}</p>
      <Filters action={path("/audit")} t={t}>
        <SelectField id="au-prefix" name="prefix" label={t("admin.audit.action")} value={prefix}
          options={[{ value: "", label: t("common.all") }, ...AUDIT_PREFIXES.map((p) => ({ value: p, label: `${p}*` }))]} />
        <SelectField id="au-entity" name="entity" label={t("admin.audit.entity")} value={entity}
          options={[{ value: "", label: t("common.all") }, ...AUDIT_ENTITIES.map((e) => ({ value: e, label: e }))]} />
        <TextField id="au-from" name="from" label={t("admin.audit.from")} value={from} type="date" />
        <TextField id="au-to" name="to" label={t("admin.audit.to")} value={to} type="date" />
      </Filters>
      <p className="muted">{total === 1 ? t("common.result1") : t("common.results", { count: total })}</p>
      <AuditTable rows={rows} locale={locale} t={t} />
      <Pagination page={page} total={total} pageSize={AUDIT_PAGE_SIZE} basePath={path("/audit")} params={{ prefix, entity, from, to }} t={t} />
    </>
  );
}
