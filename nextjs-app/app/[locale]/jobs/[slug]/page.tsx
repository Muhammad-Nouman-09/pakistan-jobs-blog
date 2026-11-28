import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import AdSlot from "@/components/ads/AdSlot";
import JsonLd from "@/components/JsonLd";
import { DeadlineLabel } from "@/components/JobCard";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Flash from "@/components/ui/Flash";
import { createT } from "@/lib/i18n";
import { isLocale, localePath, type Locale } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { breadcrumbJsonLd, jobPostingJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { availableLocales, getJobByRef, translationFor, type JobDetail } from "@/lib/services/public";
import { daysLeft, formatDate, formatSalary, initials, isWebUrl, one, publicStorageUrl, refFromSlug } from "@/lib/utils";
import { toggleSaveJobAction } from "@/app/[locale]/candidate/actions";
import { externalApplyAction } from "../actions";

const CLOSED_PAGE_DAYS = 30;   // closed jobs stay reachable (noindex) this long, then return 404

function pickText(job: JobDetail, locale: Locale) {
  return translationFor(job.job_published_translations, locale)
    ?? translationFor(job.job_published_translations, job.default_language)
    ?? job.job_published_translations[0];
}

async function load(slug: string) {
  const ref = refFromSlug(slug);
  if (!ref) return null;
  const job = await getJobByRef(ref);
  if (!job || !job.companies) return null;
  const left = daysLeft(job.deadline);
  if (left !== null && left < -CLOSED_PAGE_DAYS) return null;
  return job;
}

export async function generateMetadata({ params }: PageProps<{ slug: string }>): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) return {};
  const job = await load(slug);
  if (!job) return { title: createT(raw)("notFound.title"), robots: { index: false } };
  const tr = pickText(job, raw);
  if (!tr) return {};
  const left = daysLeft(job.deadline) ?? 0;
  const t = createT(raw);
  const place = [job.city, job.province].filter(Boolean).join(", ");
  const desc = `${job.companies!.name}${place ? ` · ${place}` : ""} · ${t(`jobType.${job.employment_type}`)}. ${tr.description}`;
  return pageMetadata({
    locale: raw, path: `/jobs/${job.slug}`, title: `${tr.title} — ${job.companies!.name}`, description: desc,
    availableLocales: availableLocales(job.job_published_translations), image: publicStorageUrl("company-logos", job.companies!.logo_path),
    type: "article", noindex: left < 0, publishedTime: job.published_at
  });
}

const Section = ({ title, text }: { title: string; text: string }) =>
  text ? <><h3>{title}</h3><p style={{ whiteSpace: "pre-line" }}>{text}</p></> : null;

export default async function JobDetailPage(props: PageProps<{ slug: string }>) {
  const { locale, t, sp, params } = await pageCtx(props);
  const l = (p: string) => localePath(locale, p);
  const job = await load(params.slug);
  if (!job) notFound();
  if (params.slug !== job.slug) permanentRedirect(l(`/jobs/${job.slug}`));
  const tr = pickText(job, locale);
  if (!tr) notFound();
  const company = job.companies!;
  const left = daysLeft(job.deadline) ?? 0;
  const closed = left < 0;
  const salary = tr.salary_text || formatSalary(job.salary_min, job.salary_max, job.salary_currency, t(`period.${job.salary_period}`), locale);
  const logo = publicStorageUrl("company-logos", company.logo_path);
  const category = job.job_categories ? (locale === "ur" ? job.job_categories.name_ur || job.job_categories.name_en : job.job_categories.name_en) : null;
  const place = [job.city, job.province, job.country].filter(Boolean).join(", ");
  const wrongLang = tr.locale !== locale;
  const showEmail = one(sp.apply) === "email" && job.application_method === "external_email";
  const crumbs = [{ name: t("nav.home"), path: "/" }, { name: t("nav.jobs"), path: "/jobs" }, { name: tr.title }];

  return (
    <main className="section">
      <JsonLd data={jobPostingJsonLd(job, locale, { title: tr.title, description: [tr.description, tr.responsibilities, tr.requirements, tr.benefits].filter(Boolean).join("\n\n") })} />
      <JsonLd data={breadcrumbJsonLd(crumbs, locale)} />
      <div className="container">
        <Breadcrumbs t={t} items={[{ label: t("nav.home"), href: l("/") }, { label: t("nav.jobs"), href: l("/jobs") }, { label: tr.title }]} />
        <Flash params={sp} t={t} />
        <article className="detail" style={{ marginTop: 0 }}>
          <div className="company-hero">
            {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img className="logo-img" src={logo} alt="" /> : <div className="job-avatar" style={{ width: 72, height: 72 }}>{initials(company.name)}</div>}
            <div>
              <h1 style={{ fontSize: 28, margin: "0 0 4px" }} lang={tr.locale} dir="auto">{tr.title}</h1>
              <p className="muted" style={{ margin: 0 }}>
                <Link href={l(`/companies/${company.slug}`)}>{company.name}</Link> · {place} · {t(`sector.${job.sector}`)}
              </p>
            </div>
          </div>
          {wrongLang && <p className="notice">{t("common.onlyLang", { lang: t(`lang.${tr.locale}`) })}</p>}
          {closed && <p className="notice warn" role="status">{t("job.closedNotice")}</p>}
          <table><tbody>
            <tr><th>{t("job.vacancies")}</th><td>{t(job.vacancies === 1 ? "job.post1" : "job.posts", { n: job.vacancies })}</td></tr>
            {salary && <tr><th>{t("job.salary")}</th><td dir="auto">{salary}</td></tr>}
            <tr><th>{t("jobform.employmentType")}</th><td>{t(`jobType.${job.employment_type}`)}</td></tr>
            <tr><th>{t("jobform.workplaceType")}</th><td>{t(`workplace.${job.workplace_type}`)}</td></tr>
            {category && <tr><th>{t("jobs.category")}</th><td>{category}</td></tr>}
            {tr.education && <tr><th>{t("job.education")}</th><td>{tr.education}</td></tr>}
            {tr.experience && <tr><th>{t("job.experience")}</th><td>{tr.experience}</td></tr>}
            <tr><th>{t("job.posted")}</th><td>{formatDate(job.published_at, locale)}</td></tr>
            <tr><th>{t("job.lastDate")}</th><td>{formatDate(job.deadline, locale)} <DeadlineLabel deadline={job.deadline} locale={locale} t={t} /></td></tr>
            {job.source && <tr><th>{t("job.source")}</th><td>{job.source}</td></tr>}
          </tbody></table>

          <Section title={t("job.description")} text={tr.description} />
          <Section title={t("jobform.f.responsibilities")} text={tr.responsibilities} />
          <Section title={t("jobform.f.requirements")} text={tr.requirements} />
          <Section title={t("jobform.f.benefits")} text={tr.benefits} />
          <Section title={t("job.howToApply")} text={tr.how_to_apply} />

          <AdSlot slot="inArticle" locale={locale} />

          <div id="apply" className="panel" style={{ marginTop: 20 }}>
            <h2>{t("job.applyTitle")}</h2>
            {closed ? <p>{t("job.closedNotice")}</p> : job.application_method === "internal" ? (
              <>
                <p>{t("job.applyInternalText")}</p>
                <p><Link className="btn btn-green" href={l(`/jobs/${job.slug}/apply`)}>{t("job.applyNow")}</Link></p>
              </>
            ) : job.application_method === "external_url" && isWebUrl(job.external_url) ? (
              <>
                <p>{t("job.applyExternalText")}</p>
                <form action={externalApplyAction}>
                  <input type="hidden" name="locale" value={locale} /><input type="hidden" name="ref" value={job.ref_no} /><input type="hidden" name="kind" value="url" />
                  <button className="btn btn-green" type="submit">{t("job.applyExternalButton")}</button>
                </form>
                <p className="muted">{t("job.externalNotTracked")}</p>
              </>
            ) : job.application_method === "external_email" && job.external_email ? (
              <>
                <p>{t("job.applyEmailText")}</p>
                {showEmail ? (
                  <p><a className="btn btn-green" href={`mailto:${job.external_email}`}><span className="ltr">{job.external_email}</span></a></p>
                ) : (
                  <form action={externalApplyAction}>
                    <input type="hidden" name="locale" value={locale} /><input type="hidden" name="ref" value={job.ref_no} /><input type="hidden" name="kind" value="email" />
                    <button className="btn btn-green" type="submit">{t("job.showEmail")}</button>
                  </form>
                )}
                <p className="muted">{t("job.externalNotTracked")}</p>
              </>
            ) : <p>{t("job.noApplyLink")}</p>}
            {!closed && (
              <form action={toggleSaveJobAction} style={{ marginTop: 12 }}>
                <input type="hidden" name="locale" value={locale} /><input type="hidden" name="job_id" value={job.job_id} />
                <input type="hidden" name="return_to" value={l(`/jobs/${job.slug}`)} />
                <button className="btn btn-outline btn-small" type="submit">{t("job.saveJob")}</button>
              </form>
            )}
          </div>
          <p className="notice">{t("job.scamNotice")}</p>
        </article>
      </div>
    </main>
  );
}
