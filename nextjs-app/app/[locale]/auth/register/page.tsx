import Link from "next/link";
import Flash from "@/components/ui/Flash";
import SetupNotice from "@/components/ui/SetupNotice";
import { isConfigured } from "@/lib/env";
import { localePath } from "@/lib/i18n/config";
import { one } from "@/lib/utils";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { createT } from "@/lib/i18n";
import { registerAction } from "../actions";

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  return noindexMetadata(createT(locale === "ur" ? "ur" : "en")("auth.registerTitle"));
}

export default async function RegisterPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const role = one(sp.role) === "employer" ? "employer" : "job_seeker";
  return (
    <main className="section">
      <div className="container">
        <div className="form-card">
          <h1 style={{ fontSize: 28 }}>{t("auth.registerTitle")}</h1>
          <p className="muted">{t("auth.registerSub")}</p>
          {!isConfigured() && <SetupNotice t={t} />}
          <Flash params={sp} t={t} />
          <form action={registerAction}>
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="full_name">{t("auth.fullName")} *</label>
            <input id="full_name" name="full_name" autoComplete="name" required minLength={2} maxLength={120} />
            <label htmlFor="email">{t("common.email")} *</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <label htmlFor="password">{t("auth.password")} *</label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
            <p className="muted">{t("auth.passwordHint")}</p>
            <label htmlFor="role">{t("auth.iAm")} *</label>
            <select id="role" name="role" defaultValue={role}>
              <option value="job_seeker">{t("auth.roleSeeker")}</option>
              <option value="employer">{t("auth.roleEmployer")}</option>
            </select>
            <p><label><input type="checkbox" name="accept_terms" required /> {t("auth.acceptTerms")} <Link href={localePath(locale, "/terms")}>{t("footer.terms")}</Link> / <Link href={localePath(locale, "/privacy")}>{t("footer.privacy")}</Link></label></p>
            <p><button className="btn btn-green btn-block" type="submit">{t("auth.createAccount")}</button></p>
          </form>
          <p className="muted">{t("auth.employerNote")}</p>
          <p className="muted">{t("auth.haveAccount")} <Link href={localePath(locale, "/auth/login")}>{t("nav.signIn")}</Link></p>
        </div>
      </div>
    </main>
  );
}
