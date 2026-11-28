import Link from "next/link";
import Flash from "@/components/ui/Flash";
import SetupNotice from "@/components/ui/SetupNotice";
import { isConfigured } from "@/lib/env";
import { localePath } from "@/lib/i18n/config";
import { one } from "@/lib/utils";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { createT } from "@/lib/i18n";
import { loginAction } from "../actions";

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  return noindexMetadata(createT(locale === "ur" ? "ur" : "en")("auth.loginTitle"));
}

export default async function LoginPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  return (
    <main className="section">
      <div className="container">
        <div className="form-card">
          <h1 style={{ fontSize: 28 }}>{t("auth.loginTitle")}</h1>
          <p className="muted">{t("auth.loginSub")}</p>
          {!isConfigured() && <SetupNotice t={t} />}
          <Flash params={sp} t={t} />
          <form action={loginAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="next" value={one(sp.next) ?? ""} />
            <label htmlFor="email">{t("common.email")} *</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <label htmlFor="password">{t("auth.password")} *</label>
            <input id="password" name="password" type="password" autoComplete="current-password" required />
            <p><button className="btn btn-dark btn-block" type="submit">{t("nav.signIn")}</button></p>
          </form>
          <p className="muted"><Link href={localePath(locale, "/auth/forgot")}>{t("auth.forgotLink")}</Link></p>
          <p className="muted">{t("auth.noAccount")} <Link href={localePath(locale, "/auth/register")}>{t("nav.joinFree")}</Link></p>
        </div>
      </div>
    </main>
  );
}
