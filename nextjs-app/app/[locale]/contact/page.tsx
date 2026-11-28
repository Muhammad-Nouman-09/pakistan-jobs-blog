import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Flash from "@/components/ui/Flash";
import { createT } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { pageMetadata } from "@/lib/seo/metadata";
import { getSiteSettings } from "@/lib/services/settings";
import { contactAction } from "./actions";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = raw === "ur" ? "ur" : "en";
  const t = createT(locale);
  return pageMetadata({ locale, path: "/contact", title: t("contact.title"), description: t("contact.metaDescription") });
}

export default async function Contact(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { general } = await getSiteSettings();
  return (
    <main className="page">
      <Breadcrumbs t={t} items={[{ label: t("nav.home"), href: localePath(locale) }, { label: t("contact.title") }]} />
      <h1>{t("contact.title")}</h1>
      <p>{t("contact.intro")}</p>
      <p className="notice">{t("contact.safe")}</p>
      {(general.contactEmail || general.supportPhone) && (
        <p className="muted">
          {general.contactEmail && <>{t("common.email")}: <a href={`mailto:${general.contactEmail}`}><span className="ltr">{general.contactEmail}</span></a> </>}
          {general.supportPhone && <>· {t("common.phone")}: <span className="ltr">{general.supportPhone}</span></>}
        </p>
      )}
      <Flash params={sp} t={t} />
      <div className="form-card" style={{ maxWidth: "100%" }}>
        <form action={contactAction}>
          <input type="hidden" name="locale" value={locale} />
          <div className="hp" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
          <label htmlFor="name">{t("contact.name")} *</label><input id="name" name="name" required maxLength={100} autoComplete="name" />
          <label htmlFor="email">{t("contact.email")} *</label><input id="email" name="email" type="email" required autoComplete="email" />
          <label htmlFor="subject">{t("contact.subject")} *</label><input id="subject" name="subject" required maxLength={200} />
          <label htmlFor="message">{t("contact.message")} *</label><textarea id="message" name="message" required minLength={10} maxLength={5000} placeholder={t("contact.messagePlaceholder")} />
          <p><button className="btn btn-dark btn-block" type="submit">{t("contact.send")}</button></p>
        </form>
      </div>
    </main>
  );
}
