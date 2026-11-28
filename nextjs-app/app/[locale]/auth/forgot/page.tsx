import Link from "next/link";
import Flash from "@/components/ui/Flash";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { createT } from "@/lib/i18n";
import { forgotAction } from "../actions";

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  return noindexMetadata(createT(locale === "ur" ? "ur" : "en")("auth.forgotTitle"));
}

export default async function ForgotPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  return (
    <main className="section">
      <div className="container">
        <div className="form-card">
          <h1 style={{ fontSize: 28 }}>{t("auth.forgotTitle")}</h1>
          <p className="muted">{t("auth.forgotSub")}</p>
          <Flash params={sp} t={t} />
          <form action={forgotAction}>
            <input type="hidden" name="locale" value={locale} />
            <label htmlFor="email">{t("common.email")} *</label>
            <input id="email" name="email" type="email" autoComplete="email" required />
            <p><button className="btn btn-dark btn-block" type="submit">{t("auth.sendReset")}</button></p>
          </form>
          <p className="muted"><Link href={localePath(locale, "/auth/login")}>{t("nav.signIn")}</Link></p>
        </div>
      </div>
    </main>
  );
}
