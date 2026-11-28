import Flash from "@/components/ui/Flash";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { createT } from "@/lib/i18n";
import { resendConfirmationAction } from "../actions";

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  return noindexMetadata(createT(locale === "ur" ? "ur" : "en")("auth.checkEmailTitle"));
}

export default async function CheckEmailPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  return (
    <main className="section">
      <div className="container">
        <div className="form-card">
          <h1 style={{ fontSize: 28 }}>{t("auth.checkEmailTitle")}</h1>
          <p>{t("auth.checkEmailText")}</p>
          <Flash params={sp} t={t} />
          <h2 style={{ fontSize: 18 }}>{t("auth.resendTitle")}</h2>
          <form action={resendConfirmationAction}>
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="email">{t("common.email")}</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <p><button className="btn btn-outline" type="submit">{t("auth.resend")}</button></p>
          </form>
        </div>
      </div>
    </main>
  );
}
