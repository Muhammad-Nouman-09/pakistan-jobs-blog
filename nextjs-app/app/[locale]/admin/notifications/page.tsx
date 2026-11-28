import Link from "next/link";
import Flash from "@/components/ui/Flash";
import { listNotifications } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage, uuidOrNull } from "../_ctx";
import { markAllReadAction, markReadAction } from "./actions";

const KNOWN = ["job_submitted", "company_submitted"];

export default async function AdminNotificationsPage(props: PageProps) {
  const { locale, t, sp, supabase, user, path } = await adminPage(props);
  const items = await listNotifications(supabase, user.id);
  const unread = items.filter((n) => !n.read_at).length;

  return (
    <>
      <Flash params={sp} t={t} />
      {unread > 0 && (
        <form action={markAllReadAction}>
          <input type="hidden" name="locale" value={locale} />
          <button className="btn btn-outline btn-small" type="submit">{t("admin.notif.markAll", { count: unread })}</button>
        </form>
      )}
      {items.length === 0 ? <p className="notice">{t("admin.notif.empty")}</p> : (
        <div style={{ marginTop: 14 }}>
          {items.map((n) => {
            const jobId = uuidOrNull(n.payload?.job_id);
            const companyId = uuidOrNull(n.payload?.company_id);
            const href = n.type === "job_submitted" && jobId ? path(`/jobs/${jobId}`) : n.type === "company_submitted" && companyId ? path(`/companies/${companyId}`) : null;
            return (
              <div key={n.id} className={`msg${n.read_at ? "" : " unread"}`}>
                <div className="admin-row" style={{ borderBottom: 0, padding: 0 }}>
                  <div>
                    <b>{KNOWN.includes(n.type) ? t(`admin.notif.type.${n.type}`) : t("admin.notif.generic", { type: n.type })}</b>
                    <br /><span className="muted">{formatDateTime(n.created_at, locale)}</span>
                  </div>
                  <div className="row-actions">
                    {href && <Link className="btn btn-dark btn-small" href={href}>{t("admin.notif.review")}</Link>}
                    {!n.read_at && (
                      <form action={markReadAction}>
                        <input type="hidden" name="locale" value={locale} /><input type="hidden" name="id" value={n.id} />
                        <button className="btn btn-outline btn-small" type="submit">{t("action.markRead")}</button>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
