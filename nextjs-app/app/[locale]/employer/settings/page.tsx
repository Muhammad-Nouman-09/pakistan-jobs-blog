import Flash from "@/components/ui/Flash";
import { requireRole } from "@/lib/auth/session";
import { pageCtx, type PageProps } from "@/lib/page";
import { PROVINCES } from "@/lib/types";
import { changePasswordAction, saveProfileAction } from "./actions";

export default async function EmployerSettingsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { profile, user } = await requireRole(locale, ["employer"]);
  const province = profile.province ?? "";
  const customProvince = province && !(PROVINCES as readonly string[]).includes(province);

  return (
    <>
      <Flash params={sp} t={t} />
      <h2>{t("employer.tab.settings")}</h2>

      <div className="panel">
        <h2>{t("employer.settings.profile")}</h2>
        <form action={saveProfileAction}>
          <input type="hidden" name="locale" value={locale} />
          <div className="grid-2">
            <div>
              <label htmlFor="s-name">{t("auth.fullName")} *</label>
              <input id="s-name" name="full_name" required minLength={2} maxLength={120} defaultValue={profile.full_name} autoComplete="name" />
            </div>
            <div>
              <label htmlFor="s-email">{t("common.email")}</label>
              <input id="s-email" type="email" value={user.email ?? profile.email} readOnly disabled />
            </div>
            <div>
              <label htmlFor="s-phone">{t("common.phone")}</label>
              <input id="s-phone" name="phone" type="tel" maxLength={26} defaultValue={profile.phone ?? ""} autoComplete="tel" />
            </div>
            <div>
              <label htmlFor="s-city">{t("common.city")}</label>
              <input id="s-city" name="city" maxLength={80} defaultValue={profile.city ?? ""} />
            </div>
            <div>
              <label htmlFor="s-province">{t("common.province")}</label>
              <select id="s-province" name="province" defaultValue={province}>
                <option value="">{t("common.none")}</option>
                {customProvince && <option value={province}>{province}</option>}
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="s-locale">{t("employer.settings.language")}</label>
              <select id="s-locale" name="preferred_locale" defaultValue={profile.preferred_locale}>
                <option value="en">{t("lang.en")}</option>
                <option value="ur">{t("lang.ur")}</option>
              </select>
            </div>
          </div>
          <p><button className="btn btn-dark" type="submit">{t("action.saveChanges")}</button></p>
        </form>
      </div>

      <div className="panel">
        <h2>{t("employer.settings.password")}</h2>
        <form action={changePasswordAction}>
          <input type="hidden" name="locale" value={locale} />
          <label htmlFor="p-current">{t("employer.settings.currentPassword")} *</label>
          <input id="p-current" name="current_password" type="password" required autoComplete="current-password" />
          <label htmlFor="p-new">{t("auth.newPassword")} *</label>
          <input id="p-new" name="password" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
          <p className="muted">{t("auth.passwordHint")}</p>
          <label htmlFor="p-confirm">{t("employer.settings.confirmPassword")} *</label>
          <input id="p-confirm" name="confirm" type="password" required minLength={10} maxLength={128} autoComplete="new-password" />
          <p><button className="btn btn-dark" type="submit">{t("auth.setPassword")}</button></p>
        </form>
      </div>
    </>
  );
}
