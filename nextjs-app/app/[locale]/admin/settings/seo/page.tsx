import Flash from "@/components/ui/Flash";
import { getSettingsForAdmin } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../_ctx";
import { saveSeoAction } from "../actions";

export default async function SeoSettingsPage(props: PageProps) {
  const { locale, t, sp, supabase } = await adminPage(props);
  const s = await getSettingsForAdmin(supabase);
  const seo = s.seo;
  return (
    <>
      <Flash params={sp} t={t} />
      <div className="form-card">
        <h2 style={{ marginTop: 0 }}>{t("admin.settings.seo")}</h2>
        <p className="muted">{t("admin.settings.seoHelp")}</p>
        {s.updatedAt.seo && <p className="muted">{t("admin.settings.updated", { date: formatDateTime(s.updatedAt.seo, locale) })}</p>}
        <form action={saveSeoAction}>
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="s-title">{t("admin.settings.defaultTitle")} *</label>
          <input id="s-title" name="defaultTitle" required minLength={5} maxLength={70} defaultValue={seo.defaultTitle} />
          <label htmlFor="s-desc">{t("admin.settings.defaultDescription")} *</label>
          <textarea id="s-desc" name="defaultDescription" required minLength={20} maxLength={170} style={{ minHeight: 80 }} defaultValue={seo.defaultDescription} />
          <label htmlFor="s-og">{t("admin.settings.ogImage")}</label>
          <input id="s-og" name="ogImage" type="url" maxLength={500} placeholder="https://" defaultValue={seo.ogImage} />
          <p><button className="btn btn-dark" type="submit">{t("action.saveChanges")}</button></p>
        </form>
      </div>
    </>
  );
}
