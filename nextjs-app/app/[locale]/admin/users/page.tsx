import Filters, { SelectField, TextField } from "@/components/admin/Filters";
import ConfirmButton from "@/components/ui/ConfirmButton";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import StatusBadge from "@/components/ui/StatusBadge";
import { listUsers, PAGE_SIZE } from "@/lib/services/admin";
import { formatDate, one, pageParam } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../_ctx";
import { setUserStatusAction } from "./actions";

const ROLES = ["admin", "employer", "job_seeker"] as const;
const STATUSES = ["active", "suspended"] as const;

export default async function AdminUsersPage(props: PageProps) {
  const { locale, t, sp, supabase, user, path } = await adminPage(props);
  const q = (one(sp.q) ?? "").slice(0, 80);
  const role = (ROLES as readonly string[]).includes(one(sp.role) ?? "") ? (one(sp.role) as string) : "";
  const status = (STATUSES as readonly string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as string) : "";
  const page = pageParam(sp.page);
  const { rows, total } = await listUsers(supabase, { q, role, status, page });
  const back = new URLSearchParams({ ...(q ? { q } : {}), ...(role ? { role } : {}), ...(status ? { status } : {}), ...(page > 1 ? { page: String(page) } : {}) }).toString();

  return (
    <>
      <Flash params={sp} t={t} />
      <p className="notice">{t("admin.users.note")}</p>
      <Filters action={path("/users")} t={t}>
        <TextField id="u-q" name="q" label={t("admin.users.search")} value={q} />
        <SelectField id="u-role" name="role" label={t("admin.users.role")} value={role}
          options={[{ value: "", label: t("common.all") }, ...ROLES.map((r) => ({ value: r, label: t(`role.${r}`) }))]} />
        <SelectField id="u-status" name="status" label={t("common.status")} value={status}
          options={[{ value: "", label: t("common.all") }, ...STATUSES.map((s) => ({ value: s, label: t(`accountStatus.${s}`) }))]} />
      </Filters>
      <p className="muted">{total === 1 ? t("common.result1") : t("common.results", { count: total })}</p>
      {rows.length === 0 ? <p className="notice">{t("common.noResults")}</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr><th>{t("common.name")}</th><th>{t("common.email")}</th><th>{t("admin.users.role")}</th><th>{t("common.status")}</th><th>{t("admin.users.joined")}</th><th>{t("common.actions")}</th></tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const protectedRow = u.role === "admin" || u.id === user.id;
                return (
                  <tr key={u.id}>
                    <td>{u.full_name || "—"}{u.id === user.id && <> <span className="badge badge-gray">{t("admin.users.you")}</span></>}</td>
                    <td><span className="ltr">{u.email}</span></td>
                    <td><StatusBadge kind="role" value={u.role} t={t} /></td>
                    <td><StatusBadge kind="accountStatus" value={u.status} t={t} /></td>
                    <td>{formatDate(u.created_at, locale)}</td>
                    <td>
                      {protectedRow ? <span className="muted">{t("admin.users.protected")}</span> : (
                        <form action={setUserStatusAction}>
                          <input type="hidden" name="locale" value={locale} />
                          <input type="hidden" name="user" value={u.id} />
                          <input type="hidden" name="back" value={back} />
                          {u.status === "active" ? (
                            <>
                              <input type="hidden" name="status" value="suspended" />
                              <ConfirmButton className="btn btn-danger btn-small" message={t("admin.users.confirmSuspend")}>{t("admin.users.suspend")}</ConfirmButton>
                            </>
                          ) : (
                            <>
                              <input type="hidden" name="status" value="active" />
                              <ConfirmButton className="btn btn-outline btn-small" message={t("admin.users.confirmReactivate")}>{t("admin.users.reactivate")}</ConfirmButton>
                            </>
                          )}
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={path("/users")} params={{ q, role, status }} t={t} />
    </>
  );
}
