import type { TFunction } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { categoryName, type JobEditData } from "@/lib/services/jobs";
import { saveJobAction } from "@/lib/actions/job-actions";
import { SALARY_CURRENCIES, SALARY_PERIODS } from "@/lib/validation/job";
import { EMPLOYMENT_TYPES, PROVINCES, WORKPLACE_TYPES, type Category } from "@/lib/types";

const FIELDS = ["title", "description", "responsibilities", "requirements", "benefits", "experience", "education", "salary_text", "how_to_apply"] as const;

function TranslationFields({ lang, job, t, required }: { lang: "en" | "ur"; job: JobEditData | null; t: TFunction; required: boolean }) {
  const tr = job?.translations.find((x) => x.locale === lang);
  const dir = lang === "ur" ? "rtl" : "ltr";
  const small = new Set(["experience", "education", "salary_text"]);
  return (
    <fieldset className="panel" lang={lang} dir={dir}>
      <legend><b>{t(`lang.${lang}`)}</b> {required ? `(${t("jobform.mainLanguage")})` : `(${t("common.optional")})`}</legend>
      {FIELDS.map((f) => {
        const id = `tr-${lang}-${f}`;
        const label = t(`jobform.f.${f}`) + (f === "title" && required ? " *" : "");
        return (
          <div key={f}>
            <label htmlFor={id}>{label}</label>
            {f === "title" || small.has(f)
              ? <input id={id} name={`tr.${lang}.${f}`} defaultValue={tr?.[f] ?? ""} maxLength={f === "title" ? 200 : 500} required={f === "title" && required} />
              : <textarea id={id} name={`tr.${lang}.${f}`} defaultValue={tr?.[f] ?? ""} rows={f === "description" ? 8 : 5} maxLength={20000} />}
          </div>
        );
      })}
    </fieldset>
  );
}

/**
 * Shared job editor (employer + admin). Plain server-rendered form posting to saveJobAction; no client JS.
 * The job's STATUS is never a form field — only the buttons "Save draft" / "Save & submit for review".
 */
export default function JobForm({ locale, t, area, job, companies, categories, companyId }: {
  locale: Locale; t: TFunction; area: "employer" | "admin"; job: JobEditData | null;
  companies: { id: string; name: string }[]; categories: Category[]; companyId?: string;
}) {
  const locked = !!job && (job.status === "archived" || (job.status === "pending_review" && area !== "admin"));
  const q = job?.screening_questions ?? [];
  const sel = (name: string, value: string | undefined, options: [string, string][], required = false) => (
    <select id={name} name={name} defaultValue={value ?? options[0]?.[0]} required={required}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
  return (
    <form action={saveJobAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="area" value={area} />
      {job && <input type="hidden" name="job_id" value={job.id} />}
      <fieldset disabled={locked} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="panel">
          <h2>{t("jobform.basics")}</h2>
          <div className="grid-2">
            <div>
              <label htmlFor="company_id">{t("jobform.company")} *</label>
              {job
                ? <><input type="hidden" name="company_id" value={job.company_id} /><input value={companies.find((c) => c.id === job.company_id)?.name ?? ""} readOnly /></>
                : <select id="company_id" name="company_id" required defaultValue={companyId ?? ""}>
                    <option value="" disabled>{t("jobform.chooseCompany")}</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>}
            </div>
            <div>
              <label htmlFor="category_id">{t("jobform.category")}</label>
              <select id="category_id" name="category_id" defaultValue={job?.category_id ?? ""}>
                <option value="">{t("common.none")}</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{categoryName(c, locale)}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="default_language">{t("jobform.mainLanguage")} *</label>
              {sel("default_language", job?.default_language ?? locale, [["en", t("lang.en")], ["ur", t("lang.ur")]], true)}
            </div>
            <div>
              <label htmlFor="sector">{t("jobform.sector")}</label>
              {sel("sector", job?.sector, [["private", t("sector.private")], ["government", t("sector.government")]])}
            </div>
            <div>
              <label htmlFor="employment_type">{t("jobform.employmentType")} *</label>
              {sel("employment_type", job?.employment_type, EMPLOYMENT_TYPES.map((v) => [v, t(`jobType.${v}`)] as [string, string]), true)}
            </div>
            <div>
              <label htmlFor="workplace_type">{t("jobform.workplaceType")} *</label>
              {sel("workplace_type", job?.workplace_type, WORKPLACE_TYPES.map((v) => [v, t(`workplace.${v}`)] as [string, string]), true)}
            </div>
            <div>
              <label htmlFor="vacancies">{t("jobform.vacancies")} *</label>
              <input id="vacancies" name="vacancies" type="number" min={1} max={10000} defaultValue={job?.vacancies ?? 1} required />
            </div>
            <div>
              <label htmlFor="deadline">{t("jobform.deadline")} *</label>
              <input id="deadline" name="deadline" type="date" defaultValue={job?.deadline ?? ""} />
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>{t("jobform.locationSalary")}</h2>
          <div className="grid-2">
            <div>
              <label htmlFor="city">{t("jobform.city")} *</label>
              <input id="city" name="city" defaultValue={job?.city ?? ""} maxLength={80} />
            </div>
            <div>
              <label htmlFor="province">{t("common.province")}</label>
              <select id="province" name="province" defaultValue={job?.province ?? ""}>
                <option value="">{t("common.none")}</option>
                {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="salary_min">{t("jobform.salaryMin")}</label>
              <input id="salary_min" name="salary_min" type="number" min={0} step="1" defaultValue={job?.salary_min ?? ""} />
            </div>
            <div>
              <label htmlFor="salary_max">{t("jobform.salaryMax")}</label>
              <input id="salary_max" name="salary_max" type="number" min={0} step="1" defaultValue={job?.salary_max ?? ""} />
            </div>
            <div>
              <label htmlFor="salary_currency">{t("jobform.currency")}</label>
              {sel("salary_currency", job?.salary_currency ?? "PKR", SALARY_CURRENCIES.map((c) => [c, c] as [string, string]))}
            </div>
            <div>
              <label htmlFor="salary_period">{t("jobform.period")}</label>
              {sel("salary_period", job?.salary_period ?? "month", SALARY_PERIODS.map((p) => [p, t(`period.${p}`)] as [string, string]))}
            </div>
          </div>
        </div>

        <div className="panel">
          <h2>{t("jobform.application")}</h2>
          <p className="muted">{t("jobform.applicationHelp")}</p>
          <label htmlFor="application_method">{t("jobform.method")} *</label>
          {sel("application_method", job?.application_method, [["internal", t("applyMethod.internal")], ["external_url", t("applyMethod.external_url")], ["external_email", t("applyMethod.external_email")]], true)}
          <div className="grid-2">
            <div>
              <label htmlFor="external_url">{t("jobform.externalUrl")}</label>
              <input id="external_url" name="external_url" type="url" placeholder="https://…" defaultValue={job?.external_url ?? ""} maxLength={500} />
            </div>
            <div>
              <label htmlFor="external_email">{t("jobform.externalEmail")}</label>
              <input id="external_email" name="external_email" type="email" defaultValue={job?.external_email ?? ""} />
            </div>
          </div>
          <h3 style={{ fontSize: 17 }}>{t("jobform.questions")}</h3>
          <p className="muted">{t("jobform.questionsHelp")}</p>
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="inline-form" style={{ display: "flex", width: "100%" }}>
              <input aria-label={`${t("jobform.question")} ${i + 1}`} name={`sq[${i}].text`} defaultValue={q[i]?.text ?? ""} maxLength={200} style={{ flex: 1, width: "auto" }} />
              <label style={{ margin: 0, fontWeight: 400 }}><input type="checkbox" name={`sq[${i}].required`} defaultChecked={q[i]?.required ?? false} /> {t("common.required")}</label>
            </div>
          ))}
        </div>

        <TranslationFields lang="en" job={job} t={t} required={(job?.default_language ?? locale) === "en"} />
        <TranslationFields lang="ur" job={job} t={t} required={(job?.default_language ?? locale) === "ur"} />
        <p className="muted">{t("jobform.translationNote")}</p>

        <div className="panel">
          <label htmlFor="source">{t("jobform.source")}</label>
          <input id="source" name="source" defaultValue={job?.source ?? ""} maxLength={300} />
          <p className="muted">{t("jobform.sourceHelp")}</p>
        </div>

        <p className="row-actions">
          <button className="btn btn-outline" type="submit" name="intent" value="draft">{t("jobform.saveDraft")}</button>
          <button className="btn btn-dark" type="submit" name="intent" value="submit">{t("jobform.saveSubmit")}</button>
        </p>
        <p className="muted">{job && (job.status === "approved" || job.status === "expired") ? t("jobform.revisionNote") : t("jobform.reviewNote")}</p>
      </fieldset>
    </form>
  );
}
