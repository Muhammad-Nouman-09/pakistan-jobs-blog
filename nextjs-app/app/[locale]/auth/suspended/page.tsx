import Link from "next/link";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { createT } from "@/lib/i18n";

export async function generateMetadata({ params }: PageProps) {
  const { locale } = await params;
  return noindexMetadata(createT(locale === "ur" ? "ur" : "en")("auth.suspendedTitle"));
}

export default async function SuspendedPage(props: PageProps) {
  const { locale, t } = await pageCtx(props);
  return (
    <main className="section">
      <div className="container">
        <div className="form-card">
          <h1 style={{ fontSize: 28 }}>{t("auth.suspendedTitle")}</h1>
          <p className="notice warn">{t("auth.suspendedText")}</p>
          <p><Link className="btn btn-outline" href={localePath(locale, "/contact")}>{t("nav.contact")}</Link></p>
        </div>
      </div>
    </main>
  );
}
