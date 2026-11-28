import Link from "next/link";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import { notificationView } from "@/components/candidate/notification";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { PAGE_SIZE, listNotifications } from "@/lib/services/candidate";
import { formatDateTime, pageParam } from "@/lib/utils";
import { markAllNotificationsReadAction, markNotificationReadAction } from "../actions";

export async function generateMetadata(props: PageProps) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.nav.notifications"));
}

export default async function NotificationsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user } = await requireRole(locale, ["job_seeker"]);
  const page = pageParam(sp.page);
  const { rows, total } = await listNotifications(supabase, user.id, { page });
  const base = localePath(locale, "/candidate/notifications");
  const hasUnread = rows.some((r) => !r.read_at);

  return (
    <>
      <Flash params={sp} t={t} />
      <section className="panel">
        <h2>{t("candidate.notifications.heading")}</h2>
        {hasUnread && (
          <form action={markAllNotificationsReadAction} style={{ margin: "0 0 12px" }}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="page" value={page} />
            <button className="btn btn-outline btn-small" type="submit">{t("candidate.notifications.markAll")}</button>
          </form>
        )}
        {rows.length === 0 ? (
          <p className="muted">{t("candidate.notifications.empty")}</p>
        ) : (
          rows.map((n) => {
            const v = notificationView(n, t, locale);
            return (
              <div className={`msg${n.read_at ? "" : " unread"}`} key={n.id}>
                <div className="admin-row" style={{ borderBottom: 0, padding: 0 }}>
                  <span>
                    {!n.read_at && <span className="badge" style={{ marginInlineEnd: 8 }}>{t("candidate.notifications.new")}</span>}
                    {v.text}
                  </span>
                  <span className="muted">{formatDateTime(n.created_at, locale)}</span>
                </div>
                <div className="row-actions" style={{ marginTop: 8 }}>
                  {v.href && <Link className="btn btn-outline btn-small" href={v.href}>{t("action.view")}</Link>}
                  {!n.read_at && (
                    <form action={markNotificationReadAction}>
                      <input type="hidden" name="locale" value={locale} />
                      <input type="hidden" name="id" value={n.id} />
                      <input type="hidden" name="page" value={page} />
                      <button className="btn btn-outline btn-small" type="submit">{t("action.markRead")}</button>
                    </form>
                  )}
                </div>
              </div>
            );
          })
        )}
        <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={base} t={t} />
      </section>
    </>
  );
}
