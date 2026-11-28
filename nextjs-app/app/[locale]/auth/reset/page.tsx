import Flash from "@/components/ui/Flash";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { createT } from "@/lib/i18n";
import { resetPasswordAction } from "../actions";

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  return noindexMetadata(createT(locale === "ur" ? "ur" : "en")("auth.resetTitle"));
}

export default async function ResetPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  return (
    <main className="section">
      <div className="container">
        <div className="form-card">
          <h1 style={{ fontSize: 28 }}>{t("auth.resetTitle")}</h1>
          <p className="muted">{t("auth.passwordHint")}</p>
          <Flash params={sp} t={t} />
          <form action={resetPasswordAction}>
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="password">{t("auth.newPassword")} *</label>
            <input id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
            <p><button className="btn btn-dark btn-block" type="submit">{t("auth.setPassword")}</button></p>
          </form>
        </div>
      </div>
    </main>
  );
}
