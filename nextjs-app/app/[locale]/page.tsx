import Link from "next/link";
import type { Metadata } from "next";
import AdSlot from "@/components/ads/AdSlot";
import JobCard from "@/components/JobCard";
import JsonLd from "@/components/JsonLd";
import SetupNotice from "@/components/ui/SetupNotice";
import { createT } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { pageMetadata } from "@/lib/seo/metadata";
import { siteOrganizationJsonLd, websiteJsonLd } from "@/lib/seo/jsonld";
import { getFacets, listPosts, searchJobs, translationFor } from "@/lib/services/public";
import { formatNumber } from "@/lib/utils";

export const revalidate = 60;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = createT(locale === "ur" ? "ur" : "en");
  return pageMetadata({ locale: locale === "ur" ? "ur" : "en", path: "/", title: t("meta.defaultTitle"), description: t("meta.defaultDescription") });
}

export default async function Home(props: PageProps) {
  const { locale, t } = await pageCtx(props);
  const l = (p: string) => localePath(locale, p);
  const [facets, latest, featured, posts] = await Promise.all([
    getFacets(locale),
    searchJobs({ sort: "latest", pageSize: 6 }, locale),
    searchJobs({ featuredOnly: true, sort: "latest", pageSize: 3 }, locale),
    listPosts(locale, undefined, 1, 3)
  ]);
  const soon = await searchJobs({ sort: "deadline", pageSize: 3 }, locale);

  return (
    <main>
      <JsonLd data={websiteJsonLd(t("site.name"), locale)} />
      <JsonLd data={siteOrganizationJsonLd(t("site.name"), locale)} />
      <section className="hero">
        <div className="hero-inner">
          <h1>{t("home.h1a")} <span className="accent">{t("home.h1b")}</span><br />{t("home.h1c")}</h1>
          {/* Static dictionary copy with <b> emphasis (no user data, no interpolation) */}
          <p className="lead" dangerouslySetInnerHTML={{ __html: t("home.lead") }} />
          <p className="hero-label">{t("home.lookingFor")} <span className="accent">{t("home.work")}</span></p>
          <form className="search-pill" action={l("/jobs")} method="get" role="search">
            <input type="search" name="q" placeholder={t("home.searchPlaceholder")} aria-label={t("home.searchLabel")} maxLength={100} />
            <button className="btn btn-dark" type="submit">{t("home.searchButton")}</button>
          </form>
          <p className="hero-hint">{t("home.searchHint")}</p>
          <p className="hero-label">{t("home.hiring")} <span className="accent">{t("home.postHere")}</span></p>
          <div className="post-pill">
            <Link className="btn btn-green" style={{ width: "100%" }} href={l("/auth/register?role=employer")}>{t("nav.postJob")}</Link>
          </div>
          <div className="stats">
            <div className="stat"><b>{formatNumber(facets.totals.jobs, locale)}</b><span>{t("home.statJobs")}</span></div>
            <div className="stat"><b>{formatNumber(facets.totals.vacancies, locale)}</b><span>{t("home.statVacancies")}</span></div>
            <div className="stat"><b>{formatNumber(facets.totals.government, locale)}</b><span>{t("home.statGovt")}</span></div>
          </div>
        </div>
        {!latest.configured && <div className="container"><SetupNotice t={t} /></div>}
        <div className="hero-cards">{soon.rows.map((j) => <JobCard key={j.job_id} job={j} locale={locale} t={t} />)}</div>
      </section>

      <section className="section section-soft">
        <div className="container">
          <h2>{t("home.howTitle")}</h2>
          <p className="sub">{t("home.howSub")}</p>
          <div className="steps">
            <div className="step"><div className="num">1</div><h3>{t("home.step1t")}</h3><p>{t("home.step1d")}</p></div>
            <div className="step"><div className="num">2</div><h3>{t("home.step2t")}</h3><p>{t("home.step2d")}</p></div>
            <div className="step"><div className="num">3</div><h3>{t("home.step3t")}</h3><p>{t("home.step3d")}</p></div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <h2>{t("home.browseTitle")}</h2>
          <p className="sub">{t("home.browseSub")}</p>
          <div className="pills">
            {facets.categories.map((c) => <Link key={c.slug} className="pill" href={`${l("/jobs")}?category=${encodeURIComponent(c.slug)}`}>{c.name} ({formatNumber(c.count, locale)})</Link>)}
            <Link className="pill" href={l("/jobs")}>{t("home.seeAll")}</Link>
          </div>
        </div>
      </section>

      {featured.rows.length > 0 && (
        <section className="section section-soft">
          <div className="container">
            <h2>{t("home.featuredTitle")}</h2>
            <div className="job-grid">{featured.rows.map((j) => <JobCard key={j.job_id} job={j} locale={locale} t={t} />)}</div>
          </div>
        </section>
      )}

      <section className="section">
        <div className="container">
          <h2>{t("home.latestTitle")}</h2>
          <p className="sub">{t("home.latestSub")} <Link href={l("/jobs")}>{t("home.seeAll")}</Link></p>
          <div className="job-grid">
            {latest.configured && !latest.rows.length ? <p>{t("home.noJobs")}</p> : latest.rows.map((j) => <JobCard key={j.job_id} job={j} locale={locale} t={t} />)}
          </div>
          <AdSlot slot="inFeed" locale={locale} />
          <p className="notice" style={{ marginTop: 20 }}><strong>{t("home.safeTitle")}</strong> {t("home.safeText")}</p>
        </div>
      </section>

      {posts.rows.length > 0 && (
        <section className="section section-soft">
          <div className="container">
            <h2>{t("home.blogTitle")}</h2>
            <p className="sub">{t("home.blogSub")} <Link href={l("/blog")}>{t("home.allArticles")}</Link></p>
            <div className="card-grid">
              {posts.rows.map((p) => {
                const tr = translationFor(p.blog_post_translations, locale)!;
                return (
                  <article className="card" key={p.id}>
                    <span className="badge">{p.blog_categories ? t(`blog.cat.${p.blog_categories.slug}`) : ""}</span>
                    <h3><Link href={l(`/blog/${tr.slug}`)}>{tr.title}</Link></h3>
                    <p className="muted">{tr.excerpt}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
