import Link from "next/link";
import type { TFunction } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";
import { daysLeft, formatDate, formatSalary, initials, publicStorageUrl } from "@/lib/utils";
import type { JobListItem } from "@/lib/types";

export function DeadlineLabel({ deadline, locale, t }: { deadline: string | null; locale: Locale; t: TFunction }) {
  const d = daysLeft(deadline);
  if (d === null) return <span className="deadline-pill">{t("job.noDeadline")}</span>;
  if (d < 0) return <span className="deadline-pill closed">{t("job.lastDate")}: {formatDate(deadline, locale)} · {t("job.closed")}</span>;
  if (d === 0) return <span className="deadline-pill">{t("job.lastDate")}: {formatDate(deadline, locale)} · {t("job.closesToday")}</span>;
  return <span className="deadline-pill">{t("job.lastDate")}: {formatDate(deadline, locale)} · {t(d === 1 ? "job.dayLeft" : "job.daysLeft", { n: d })}</span>;
}

/** Same markup and classes as the original job card, localized. */
export default function JobCard({ job: j, locale, t }: { job: JobListItem; locale: Locale; t: TFunction }) {
  const href = localePath(locale, `/jobs/${j.slug}`);
  const logo = publicStorageUrl("company-logos", j.company_logo);
  const salary = j.salary_text || formatSalary(j.salary_min, j.salary_max, j.salary_currency, t(`period.${j.salary_period}`), locale);
  const place = [j.city, j.province].filter(Boolean).join(", ");
  return (
    <article className="job-card">
      <div className="job-avatar">
        {logo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt="" loading="lazy" /> : initials(j.company_name)}
      </div>
      <div style={{ minWidth: 0 }}>
        <h3><Link href={href} lang={j.title_locale} dir="auto">{j.title}</Link></h3>
        <p className="org"><Link href={localePath(locale, `/companies/${j.company_slug}`)} style={{ color: "inherit" }}>{j.company_name}</Link></p>
        <p className="job-meta">
          <span className="badge">{t(`sector.${j.sector}`)}</span>
          {j.featured && <span className="badge badge-amber">{t("job.featured")}</span>}
          {place && <span>{place}</span>}
          {j.category_name && <span>{j.category_name}</span>}
          <span>{t(`jobType.${j.employment_type}`)}</span>
          <span>{t(`workplace.${j.workplace_type}`)}</span>
          <span>{t(j.vacancies === 1 ? "job.post1" : "job.posts", { n: j.vacancies })}</span>
          {salary && <span dir="auto">{salary}</span>}
        </p>
        {j.title_locale !== locale && <p className="muted" style={{ margin: "4px 0 0" }}>{t("common.onlyLang", { lang: t(`lang.${j.title_locale}`) })}</p>}
        <DeadlineLabel deadline={j.deadline} locale={locale} t={t} />
      </div>
      <div className="job-actions">
        <Link className="btn btn-dark btn-small" href={href}>{t("job.viewDetails")}</Link>
      </div>
    </article>
  );
}
