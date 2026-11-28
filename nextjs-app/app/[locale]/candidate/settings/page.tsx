import Flash from "@/components/ui/Flash";
import ContactFields from "@/components/candidate/ContactFields";
import { requireRole } from "@/lib/auth/session";
import { LOCALES } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { changePasswordAction, updateSettingsAction } from "../actions";

export async function generateMetadata(props: PageProps) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.nav.settings"));
}

export default async function SettingsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { profile } = await requireRole(locale, ["job_seeker"]);

  return (
    <>
      <Flash params={sp} t={t} />
      <form action={updateSettingsAction}>
        <input type="hidden" name="locale" value={locale} />
        <section className="panel" aria-labelledby="set-account">
          <h2 id="set-account">{t("candidate.settings.account")}</h2>
          <label htmlFor="set-email">{t("common.email")}</label>
          <input id="set-email" type="email" value={profile.email} readOnly disabled aria-describedby="set-email-help" />
          <p id="set-email-help" className="muted">{t("candidate.settings.emailHelp")}</p>
          <ContactFields t={t} idPrefix="set" values={profile} />
          <label htmlFor="set-locale">{t("candidate.settings.language")}</label>
          <select id="set-locale" name="preferred_locale" defaultValue={profile.preferred_locale}>
            {LOCALES.map((l) => <option key={l} value={l}>{t(`lang.${l}`)}</option>)}
          </select>
          <span className="muted">{t("candidate.settings.languageHelp")}</span>
          <p><button className="btn btn-dark" type="submit">{t("action.saveChanges")}</button></p>
        </section>
      </form>

      <form action={changePasswordAction}>
        <input type="hidden" name="locale" value={locale} />
        <section className="panel" aria-labelledby="set-password">
          <h2 id="set-password">{t("candidate.settings.passwordHeading")}</h2>
          <label htmlFor="cur-pw">{t("candidate.settings.currentPassword")} *</label>
          <input id="cur-pw" name="current_password" type="password" autoComplete="current-password" required maxLength={128} />
          <label htmlFor="new-pw">{t("auth.newPassword")} *</label>
          <input id="new-pw" name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={128} aria-describedby="new-pw-help" />
          <span id="new-pw-help" className="muted">{t("auth.passwordHint")}</span>
          <label htmlFor="conf-pw">{t("candidate.settings.confirmPassword")} *</label>
          <input id="conf-pw" name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={128} />
          <p><button className="btn btn-dark" type="submit">{t("candidate.settings.changePassword")}</button></p>
        </section>
      </form>
    </>
  );
}
