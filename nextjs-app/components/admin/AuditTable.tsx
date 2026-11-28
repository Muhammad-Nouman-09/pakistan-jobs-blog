import Link from "next/link";
import type { TFunction } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { adminPath } from "@/app/[locale]/admin/_ctx";
import { actorLabel, type AuditRow } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";

/** Where an audit entity can be inspected in the admin area (users have no detail page). */
export function entityHref(locale: Locale, type: string, id: string | null): string | null {
  if (!id) return null;
  if (type === "job") return adminPath(locale, `/jobs/${id}`);
  if (type === "company") return adminPath(locale, `/companies/${id}`);
  return null;
}

export default function AuditTable({ rows, locale, t, withMetadata = true }: { rows: AuditRow[]; locale: Locale; t: TFunction; withMetadata?: boolean }) {
  if (!rows.length) return <p className="muted">{t("admin.audit.empty")}</p>;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>{t("common.date")}</th><th>{t("admin.audit.actor")}</th><th>{t("admin.audit.action")}</th><th>{t("admin.audit.entity")}</th>
            {withMetadata && <th>{t("admin.audit.details")}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const href = entityHref(locale, r.entity_type, r.entity_id);
            const hasMeta = r.metadata && typeof r.metadata === "object" && Object.keys(r.metadata as object).length > 0;
            return (
              <tr key={r.id}>
                <td>{formatDateTime(r.created_at, locale)}</td>
                <td>
                  {r.actor ? actorLabel(r.actor) : t("admin.audit.system")}
                  {r.actor?.email && r.actor.full_name && <><br /><span className="muted ltr">{r.actor.email}</span></>}
                </td>
                <td><span className="ltr">{r.action}</span></td>
                <td>
                  {r.entity_type}
                  {r.entity_id && (href
                    ? <> <Link href={href} className="ltr">{r.entity_id.slice(0, 8)}</Link></>
                    : <> <span className="muted ltr">{r.entity_id.slice(0, 8)}</span></>)}
                </td>
                {withMetadata && (
                  <td>
                    {hasMeta ? (
                      <details>
                        <summary>{t("admin.audit.showJson")}</summary>
                        <pre className="ltr" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{JSON.stringify(r.metadata, null, 2)}</pre>
                      </details>
                    ) : "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
