import type { TFunction } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";
import { APPLICATION_STATUSES } from "@/lib/types";
import { isUuid, type NotificationRow } from "@/lib/services/candidate";

const s = (v: unknown) => (typeof v === "string" ? v : "");

/** Localized text + optional link for a notification, chosen by `type`. Unknown types get a generic text. */
export function notificationView(n: NotificationRow, t: TFunction, locale: Locale): { text: string; href: string | null } {
  const p = n.payload && typeof n.payload === "object" && !Array.isArray(n.payload) ? (n.payload as Record<string, unknown>) : {};
  switch (n.type) {
    case "application_status": {
      const status = s(p.status);
      const known = (APPLICATION_STATUSES as string[]).includes(status);
      const appId = s(p.application_id);
      return {
        text: known
          ? t("candidate.notif.application_status", { job: s(p.job_title) || t("candidate.notif.aJob"), status: t(`appStatus.${status}`) })
          : t("candidate.notif.application_updated", { job: s(p.job_title) || t("candidate.notif.aJob") }),
        href: isUuid(appId) ? localePath(locale, `/candidate/applications/${appId}`) : null
      };
    }
    case "ownership_transferred":
      return { text: t("candidate.notif.ownership_transferred"), href: null };
    case "added_to_company":
      return { text: t("candidate.notif.added_to_company"), href: null };
    default:
      return { text: t("candidate.notif.generic"), href: null };
  }
}
