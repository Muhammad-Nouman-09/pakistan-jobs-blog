import Link from "next/link";
import { headers } from "next/headers";
import { createT } from "@/lib/i18n";
import { isLocale } from "@/lib/i18n/config";

export default async function NotFound() {
  // not-found has no params; derive the language from the request path (middleware guarantees a prefix).
  const h = await headers();
  const seg = (h.get("x-pathname") ?? h.get("referer") ?? "").match(/\/(en|ur)(\/|$)/)?.[1];
  const locale = isLocale(seg) ? seg : "en";
  const t = createT(locale);
  return (
    <main className="page">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.text")}</p>
      <p><Link className="btn btn-green" href={`/${locale}`}>{t("nav.home")}</Link> <Link className="btn btn-outline" href={`/${locale}/jobs`}>{t("nav.jobs")}</Link></p>
    </main>
  );
}
