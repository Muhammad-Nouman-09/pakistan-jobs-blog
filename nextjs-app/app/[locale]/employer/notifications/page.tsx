import Link from "next/link";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import { requireRole } from "@/lib/auth/session";
import { localePath, type Locale } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { loadNotifications, PAGE_SIZE, type NotificationRow } from "@/lib/services/employer";
import { formatDateTime, pageParam } from "@/lib/utils";
import { uuidOrEmpty } from "@/lib/validation/company";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

const KNOWN = new Set([
  "job_approved", "job_rejected", "job_changes_requested", "job_unpublished", "company_verified", "company_rejected", "company_suspended",
  "company_pending", "application_received", "member_joined", "ownership_transferred", "added_to_company"
]);

/** Deep link for a notification (ids come from the payload and are validated as UUIDs). */
function linkFor(n: NotificationRow, locale: Locale): string | null {
  const job = uuidOrEmpty(n.payload?.job_id);
  const company = uuidOrEmpty(n.payload?.company_id);
  const application = uuidOrEmpty(n.payload?.application_id);
  const L = (p: string) => localePath(locale, `/employer${p}`);
  if (n.type.startsWith("job_") && job) return L(`/jobs/${job}`);
  if (n.type === "application_received" && application) return L(`/applications/${application}`);
  if (n.type === "member_joined" && company) return L(`/companies/${company}/team`);
  if (company) return L(`/companies/${company}`);
  return null;
}

export default async function NotificationsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase } = await requireRole(locale, ["employer"]);
  const page = pageParam(sp.page);
  const { rows, total } = await loadNotifications(supabase, page);
  const hasUnread = rows.some((r) => !r.read_at);

  return (
    <>
      <Flash params={sp} t={t} />
      <div className="admin-row" style={{ borderBottom: 0, alignItems: "center" }}>
        <h2 style={{ margin: 0 }}>{t("employer.tab.notifications")}</h2>
        {hasUnread && (
          <form action={markAllNotificationsReadAction}>
            <input type="hidden" name="locale" value={locale} />
            <button className="btn btn-outline btn-small" type="submit">{t("employer.notif.markAll")}</button>
          </form>
        )}
      </div>
      {rows.length === 0 ? <div className="panel"><p>{t("employer.notif.none")}</p></div> : rows.map((n) => {
        const href = linkFor(n, locale);
        const detail = typeof n.payload?.reason === "string" ? n.payload.reason : typeof n.payload?.note === "string" ? n.payload.note : "";
        return (
          <div key={n.id} className={`msg${n.read_at ? "" : " unread"}`}>
            <b>{t(KNOWN.has(n.type) ? `employer.notif.type.${n.type}` : "employer.notif.type.generic")}</b>
            <span className="muted"> · {formatDateTime(n.created_at, locale)}</span>
            {detail && <p style={{ whiteSpace: "pre-wrap", margin: "6px 0" }}>{detail}</p>}
            <div className="row-actions" style={{ marginTop: 6 }}>
              {href && <Link className="btn btn-outline btn-small" href={href}>{t("action.view")}</Link>}
              {!n.read_at && (
                <form action={markNotificationReadAction}>
                  <input type="hidden" name="locale" value={locale} />
                  <input type="hidden" name="notification_id" value={n.id} />
                  <button className="btn btn-outline btn-small" type="submit">{t("action.markRead")}</button>
                </form>
              )}
            </div>
          </div>
        );
      })}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={localePath(locale, "/employer/notifications")} t={t} />
    </>
  );
}
