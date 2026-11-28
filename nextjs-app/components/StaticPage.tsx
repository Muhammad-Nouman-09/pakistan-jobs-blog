import Link from "next/link";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import type { TFunction } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";

/**
 * Renders a long-form page from message keys: `<prefix>.title`, `<prefix>.intro`, then numbered sections
 * `<prefix>.s1.t` / `<prefix>.s1.b` … until a section is missing. Keeps legal/editorial copy in the
 * translation files, where it can be reviewed per language.
 */
export default function StaticPage({ prefix, locale, t, children }: { prefix: string; locale: Locale; t: TFunction; children?: React.ReactNode }) {
  const sections: { title: string; body: string }[] = [];
  for (let i = 1; i < 30; i++) {
    const title = t(`${prefix}.s${i}.t`);
    if (title === `${prefix}.s${i}.t`) break;
    sections.push({ title, body: t(`${prefix}.s${i}.b`) });
  }
  return (
    <main className="page">
      <Breadcrumbs t={t} items={[{ label: t("nav.home"), href: localePath(locale) }, { label: t(`${prefix}.title`) }]} />
      <h1>{t(`${prefix}.title`)}</h1>
      <p className="muted">{t(`${prefix}.intro`)}</p>
      {sections.map((s, i) => (
        <section key={i}>
          <h2>{s.title}</h2>
          {s.body.split("\n\n").map((para, j) => <p key={j}>{para}</p>)}
        </section>
      ))}
      {children}
    </main>
  );
}

export const CtaLinks = ({ locale, t }: { locale: Locale; t: TFunction }) => (
  <p>
    <Link className="btn btn-green" href={localePath(locale, "/jobs")}>{t("nav.jobs")} →</Link>{" "}
    <Link className="btn btn-outline" href={localePath(locale, "/contact")}>{t("nav.contact")}</Link>
  </p>
);
