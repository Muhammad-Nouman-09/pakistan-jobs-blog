import Link from "next/link";
import type { Metadata } from "next";
import AdSlot from "@/components/ads/AdSlot";
import JobCard from "@/components/JobCard";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Pagination from "@/components/ui/Pagination";
import SetupNotice from "@/components/ui/SetupNotice";
import JsonLd from "@/components/JsonLd";
import { createT } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { getFacets, JOBS_PER_PAGE, searchJobs, type JobSearchParams } from "@/lib/services/public";
import { EMPLOYMENT_TYPES, WORKPLACE_TYPES } from "@/lib/types";
import { daysLeft, formatDate, one, pageParam } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = raw === "ur" ? "ur" : "en";
  const t = createT(locale);
  // Canonical is always the unfiltered listing, so filter/sort/page URLs do not compete with it in search.
  return pageMetadata({ locale, path: "/jobs", title: t("jobs.metaTitle"), description: t("jobs.metaDescription") });
}

const SORTS = ["latest", "deadline", "salary", "relevance"] as const;
const SALARY_STEPS = [30000, 50000, 100000, 200000, 500000];

export default async function JobsPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const l = (p: string) => localePath(locale, p);
  const q = (one(sp.q) ?? "").trim().slice(0, 100);
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined);
  const params: JobSearchParams = {
    q: q || undefined,
    category: (one(sp.category) ?? "").slice(0, 80) || undefined,
    province: (one(sp.province) ?? "").slice(0, 80) || undefined,
    city: (one(sp.city) ?? "").slice(0, 80) || undefined,
    employment: pick(one(sp.type), EMPLOYMENT_TYPES),
    workplace: pick(one(sp.workplace), WORKPLACE_TYPES),
    sector: pick(one(sp.sector), ["government", "private"] as const),
    salaryMin: Number(one(sp.salary)) > 0 ? Number(one(sp.salary)) : undefined,
    sort: pick(one(sp.sort), SORTS),
    page: pageParam(sp.page)
  };
  const [{ rows, total, configured }, facets, soon] = await Promise.all([
    searchJobs(params, locale), getFacets(locale), searchJobs({ sort: "deadline", pageSize: 6 }, locale)
  ]);
  const keep: Record<string, string | undefined> = {
    q: params.q, category: params.category, province: params.province, city: params.city, type: params.employment,
    workplace: params.workplace, sector: params.sector, salary: params.salaryMin ? String(params.salaryMin) : undefined, sort: params.sort
  };
  const tabHref = (sector?: string) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...keep, sector })) if (v) u.set(k, v);
    const s = u.toString();
    return s ? `${l("/jobs")}?${s}` : l("/jobs");
  };
  const hasFilter = Object.values(keep).some(Boolean);
  const sectorTabs: [string | undefined, string][] = [[undefined, t("jobs.allJobs")], ["government", t("sector.government")], ["private", t("sector.private")]];

  return (
    <main className="section">
      <JsonLd data={breadcrumbJsonLd([{ name: t("nav.home"), path: "/" }, { name: t("nav.jobs") }], locale)} />
      <div className="container">
        <Breadcrumbs t={t} items={[{ label: t("nav.home"), href: l("/") }, { label: t("nav.jobs") }]} />
        <h1>{t("nav.jobs")}</h1>
        <p className="sub">{t("jobs.sub")}</p>
        {!configured && <SetupNotice t={t} />}
        <div className="find-layout">
          <div>
            <nav className="controls tabs" aria-label={t("jobs.sectorTabs")}>
              {sectorTabs.map(([v, label]) => <Link key={label} href={tabHref(v)} className={params.sector === v ? "active" : undefined} aria-current={params.sector === v ? "page" : undefined}>{label}</Link>)}
            </nav>
            <form className="filters" method="get" action={l("/jobs")} role="search">
              {params.sector && <input type="hidden" name="sector" value={params.sector} />}
              <div style={{ gridColumn: "1 / -1" }}>
                <label htmlFor="q">{t("action.search")}</label>
                <input id="q" type="search" name="q" defaultValue={q} placeholder={t("home.searchPlaceholder")} maxLength={100} />
              </div>
              <div><label htmlFor="category">{t("jobs.category")}</label>
                <select id="category" name="category" defaultValue={params.category ?? ""}>
                  <option value="">{t("jobs.allCategories")}</option>
                  {facets.categories.map((c) => <option key={c.slug} value={c.slug}>{c.name} ({c.count})</option>)}
                </select></div>
              <div><label htmlFor="province">{t("common.province")}</label>
                <select id="province" name="province" defaultValue={params.province ?? ""}>
                  <option value="">{t("jobs.allProvinces")}</option>
                  {facets.provinces.map((p) => <option key={p.value} value={p.value}>{p.value} ({p.count})</option>)}
                </select></div>
              <div><label htmlFor="city">{t("common.city")}</label>
                <select id="city" name="city" defaultValue={params.city ?? ""}>
                  <option value="">{t("jobs.allCities")}</option>
                  {facets.cities.map((c) => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
                </select></div>
              <div><label htmlFor="type">{t("jobform.employmentType")}</label>
                <select id="type" name="type" defaultValue={params.employment ?? ""}>
                  <option value="">{t("common.all")}</option>
                  {EMPLOYMENT_TYPES.map((v) => <option key={v} value={v}>{t(`jobType.${v}`)}</option>)}
                </select></div>
              <div><label htmlFor="workplace">{t("jobform.workplaceType")}</label>
                <select id="workplace" name="workplace" defaultValue={params.workplace ?? ""}>
                  <option value="">{t("common.all")}</option>
                  {WORKPLACE_TYPES.map((v) => <option key={v} value={v}>{t(`workplace.${v}`)}</option>)}
                </select></div>
              <div><label htmlFor="salary">{t("jobs.minSalary")}</label>
                <select id="salary" name="salary" defaultValue={params.salaryMin ? String(params.salaryMin) : ""}>
                  <option value="">{t("jobs.anySalary")}</option>
                  {SALARY_STEPS.map((s) => <option key={s} value={s}>PKR {s.toLocaleString("en-US")}+</option>)}
                </select></div>
              <div><label htmlFor="sort">{t("common.sortBy")}</label>
                <select id="sort" name="sort" defaultValue={params.sort ?? ""}>
                  <option value="">{q ? t("common.sort.relevance") : t("common.sort.latest")}</option>
                  <option value="latest">{t("common.sort.latest")}</option>
                  <option value="deadline">{t("common.sort.deadline")}</option>
                  <option value="salary">{t("common.sort.salary")}</option>
                </select></div>
              <div className="row-actions">
                <button className="btn btn-dark" type="submit">{t("action.filter")}</button>
                {hasFilter && <Link className="btn btn-outline" href={l("/jobs")}>{t("action.clear")}</Link>}
              </div>
            </form>
            <p className="muted" aria-live="polite">{total === 1 ? t("common.result1") : t("common.results", { count: total })}</p>
            <div className="job-grid">
              {rows.length
                ? rows.flatMap((j, i) => {
                    const card = <JobCard key={j.job_id} job={j} locale={locale} t={t} />;
                    return i === 4 ? [card, <AdSlot key="ad" slot="inFeed" locale={locale} />] : [card];
                  })
                : configured && <p>{t("jobs.noMatch")}</p>}
            </div>
            <Pagination page={params.page ?? 1} total={total} pageSize={JOBS_PER_PAGE} basePath={l("/jobs")} params={keep} t={t} />
          </div>
          <aside className="sidebar">
            <h3>{t("jobs.closingSoon")}</h3>
            <p className="muted">{t("jobs.closingSoonSub")}</p>
            <ul>
              {soon.rows.map((j) => {
                const d = daysLeft(j.deadline);
                return (
                  <li key={j.job_id}>
                    <Link href={l(`/jobs/${j.slug}`)} dir="auto">{j.title}</Link><br />
                    <span className="d">{d === null ? "" : t("jobs.closesOn", { date: formatDate(j.deadline, locale), n: d })}</span>
                  </li>
                );
              })}
            </ul>
            <AdSlot slot="sidebar" locale={locale} />
            <p className="notice" style={{ marginTop: 16 }}><strong>{t("home.safeTitle")}</strong> {t("jobs.safe")}</p>
          </aside>
        </div>
      </div>
    </main>
  );
}
