import Flash from "@/components/ui/Flash";
import { getSettingsForAdmin } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../_ctx";
import { saveGeneralAction } from "../actions";

export default async function GeneralSettingsPage(props: PageProps) {
  const { locale, t, sp, supabase } = await adminPage(props);
  const s = await getSettingsForAdmin(supabase);
  const g = s.general;
  return (
    <>
      <Flash params={sp} t={t} />
      <div className="form-card">
        <h2 style={{ marginTop: 0 }}>{t("admin.settings.general")}</h2>
        {s.updatedAt.general && <p className="muted">{t("admin.settings.updated", { date: formatDateTime(s.updatedAt.general, locale) })}</p>}
        <form action={saveGeneralAction}>
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="g-name">{t("admin.settings.siteName")} *</label>
          <input id="g-name" name="siteName" required minLength={2} maxLength={80} defaultValue={g.siteName} />
          <label htmlFor="g-email">{t("admin.settings.contactEmail")}</label>
          <input id="g-email" name="contactEmail" type="email" maxLength={200} defaultValue={g.contactEmail} />
          <label htmlFor="g-phone">{t("admin.settings.supportPhone")}</label>
          <input id="g-phone" name="supportPhone" type="tel" maxLength={26} defaultValue={g.supportPhone} />
          <label htmlFor="g-twitter">{t("admin.settings.twitter")}</label>
          <input id="g-twitter" name="twitter" type="url" maxLength={500} placeholder="https://" defaultValue={g.twitter} />
          <label htmlFor="g-facebook">{t("admin.settings.facebook")}</label>
          <input id="g-facebook" name="facebook" type="url" maxLength={500} placeholder="https://" defaultValue={g.facebook} />
          <p><button className="btn btn-dark" type="submit">{t("action.saveChanges")}</button></p>
        </form>
      </div>
    </>
  );
}
