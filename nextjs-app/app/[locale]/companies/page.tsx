import Link from "next/link";
import type { Metadata } from "next";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Pagination from "@/components/ui/Pagination";
import SetupNotice from "@/components/ui/SetupNotice";
import { createT } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { pageMetadata } from "@/lib/seo/metadata";
import { listCompanies } from "@/lib/services/public";
import { initials, one, pageParam, publicStorageUrl } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = raw === "ur" ? "ur" : "en";
  const t = createT(locale);
  return pageMetadata({ locale, path: "/companies", title: t("companies.metaTitle"), description: t("companies.metaDescription") });
}

const PER_PAGE = 24;

export default async function CompaniesPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const l = (p: string) => localePath(locale, p);
  const q = (one(sp.q) ?? "").trim().slice(0, 80);
  const page = pageParam(sp.page);
  const { rows, total, configured } = await listCompanies(q || undefined, page, PER_PAGE);
  return (
    <main className="section">
      <div className="container">
        <Breadcrumbs t={t} items={[{ label: t("nav.home"), href: l("/") }, { label: t("nav.companies") }]} />
        <h1>{t("nav.companies")}</h1>
        <p className="sub">{t("companies.sub")}</p>
        {!configured && <SetupNotice t={t} />}
        <form className="controls" method="get" action={l("/companies")} role="search">
          <input type="search" name="q" defaultValue={q} placeholder={t("companies.searchPlaceholder")} aria-label={t("action.search")} maxLength={80} />
          <button className="btn btn-dark" type="submit">{t("action.search")}</button>
        </form>
        {configured && !rows.length ? <p>{t("companies.none")}</p> : (
          <div className="card-grid">
            {rows.map((c) => {
              const logo = publicStorageUrl("company-logos", c.logo_path);
              return (
                <article className="card" key={c.id}>
                  <div className="company-hero" style={{ marginBottom: 8 }}>
                    {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="logo-img" src={logo} alt="" loading="lazy" /> : <div className="job-avatar">{initials(c.name)}</div>}
                    <div>
                      <h3 style={{ margin: 0 }}><Link href={l(`/companies/${c.slug}`)}>{c.name}</Link></h3>
                      <span className="muted">{[c.industry, c.city].filter(Boolean).join(" · ")}</span>
                    </div>
                  </div>
                  {c.description && <p className="muted">{c.description}</p>}
                  <span className="badge">{t(c.open_jobs === 1 ? "companies.openJob1" : "companies.openJobs", { n: c.open_jobs })}</span>
                </article>
              );
            })}
          </div>
        )}
        <Pagination page={page} total={total} pageSize={PER_PAGE} basePath={l("/companies")} params={{ q: q || undefined }} t={t} />
      </div>
    </main>
  );
}
