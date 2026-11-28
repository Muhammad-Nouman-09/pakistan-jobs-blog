import Flash from "@/components/ui/Flash";
import { siteUrl } from "@/lib/env";
import { getSettingsForAdmin } from "@/lib/services/admin";
import { adsenseActive } from "@/lib/services/settings";
import { formatDateTime, one } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../_ctx";
import { saveAdsenseAction } from "../actions";

const REASONS = ["format", "domain", "account", "relationship", "certification", "variable", "too_many_lines"];

export default async function AdsenseSettingsPage(props: PageProps) {
  const { locale, t, sp, supabase } = await adminPage(props);
  const s = await getSettingsForAdmin(supabase);
  const a = s.adsense;
  const line = /^\d{1,4}$/.test(one(sp.line) ?? "") ? one(sp.line) : null;
  const reason = REASONS.includes(one(sp.reason) ?? "") ? (one(sp.reason) as string) : "format";
  return (
    <>
      <Flash params={sp} t={t} />
      {line && <p className="notice warn" role="alert">{t("admin.adsense.badLine", { line, reason: t(`admin.adsense.reason.${reason}`) })}</p>}
      <div className="form-card">
        <h2 style={{ marginTop: 0 }}>{t("admin.settings.adsense")}</h2>
        <p className={adsenseActive(a) ? "success" : "muted"}>{adsenseActive(a) ? t("admin.adsense.active") : t("admin.adsense.inactive")}</p>
        {s.updatedAt.adsense && <p className="muted">{t("admin.settings.updated", { date: formatDateTime(s.updatedAt.adsense, locale) })}</p>}
        <p className="notice">{t("admin.adsense.policy")}</p>
        <form action={saveAdsenseAction}>
          <input type="hidden" name="locale" value={locale} />
          <label><input type="checkbox" name="enabled" defaultChecked={a.enabled} /> {t("admin.adsense.enabled")}</label>
          <label htmlFor="ad-pub">{t("admin.adsense.publisher")}</label>
          <input id="ad-pub" name="publisherId" maxLength={40} placeholder="ca-pub-0000000000000000" pattern="ca-pub-\d{10,20}" className="ltr" dir="ltr" defaultValue={a.publisherId} aria-describedby="ad-pub-help" />
          <span id="ad-pub-help" className="muted">{t("admin.adsense.publisherHelp")}</span>
          <div className="grid-2">
            <div><label htmlFor="ad-top">{t("admin.adsense.slotTop")}</label><input id="ad-top" name="topBanner" maxLength={30} inputMode="numeric" pattern="\d{6,20}" className="ltr" dir="ltr" defaultValue={a.slots.topBanner} /></div>
            <div><label htmlFor="ad-feed">{t("admin.adsense.slotFeed")}</label><input id="ad-feed" name="inFeed" maxLength={30} inputMode="numeric" pattern="\d{6,20}" className="ltr" dir="ltr" defaultValue={a.slots.inFeed} /></div>
            <div><label htmlFor="ad-article">{t("admin.adsense.slotArticle")}</label><input id="ad-article" name="inArticle" maxLength={30} inputMode="numeric" pattern="\d{6,20}" className="ltr" dir="ltr" defaultValue={a.slots.inArticle} /></div>
            <div><label htmlFor="ad-side">{t("admin.adsense.slotSidebar")}</label><input id="ad-side" name="sidebar" maxLength={30} inputMode="numeric" pattern="\d{6,20}" className="ltr" dir="ltr" defaultValue={a.slots.sidebar} /></div>
          </div>
          <label htmlFor="ad-txt">{t("admin.adsense.adsTxt")}</label>
          <textarea id="ad-txt" name="adsTxt" maxLength={20000} spellCheck={false} className="ltr" dir="ltr" style={{ minHeight: 160, fontFamily: "monospace", display: "block", width: "100%" }} defaultValue={a.adsTxt} aria-describedby="ad-txt-help" />
          <span id="ad-txt-help" className="muted">{t("admin.adsense.adsTxtHelp")}</span>
          <p className="muted">{t("admin.adsense.publicUrl")}: <span className="ltr">{siteUrl()}/ads.txt</span></p>
          <p><button className="btn btn-dark" type="submit">{t("action.saveChanges")}</button></p>
        </form>
      </div>
    </>
  );
}
