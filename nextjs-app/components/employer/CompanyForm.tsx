import type { TFunction } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { COMPANY_SIZES } from "@/lib/types";
import type { CompanyPrivate, CompanyRow } from "@/lib/services/employer";

/**
 * Company profile form (create + edit). Server-rendered; `action` is a server action. When `readOnly`
 * (recruiters / viewers) the fields are disabled and there is no save button.
 */
export default function CompanyForm({ locale, t, action, company, priv, readOnly, submitLabel }: {
  locale: Locale; t: TFunction; action: (fd: FormData) => Promise<void>;
  company?: CompanyRow | null; priv?: CompanyPrivate | null; readOnly?: boolean; submitLabel: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="locale" value={locale} />
      {company && <input type="hidden" name="company_id" value={company.id} />}
      <fieldset disabled={readOnly} style={{ border: 0, padding: 0, margin: 0 }}>
        <div className="grid-2">
          <div>
            <label htmlFor="cf-name">{t("employer.f.name")} *</label>
            <input id="cf-name" name="name" required minLength={2} maxLength={150} defaultValue={company?.name ?? ""} />
          </div>
          <div>
            <label htmlFor="cf-industry">{t("employer.f.industry")}</label>
            <input id="cf-industry" name="industry" maxLength={100} defaultValue={company?.industry ?? ""} />
          </div>
          <div>
            <label htmlFor="cf-website">{t("employer.f.website")}</label>
            <input id="cf-website" name="website" type="url" placeholder="https://…" maxLength={300} defaultValue={company?.website ?? ""} />
          </div>
          <div>
            <label htmlFor="cf-size">{t("employer.f.size")}</label>
            <select id="cf-size" name="size" defaultValue={company?.size ?? ""}>
              <option value="">{t("common.none")}</option>
              {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="cf-email">{t("employer.f.email")}</label>
            <input id="cf-email" name="email" type="email" maxLength={200} defaultValue={priv?.email ?? ""} />
          </div>
          <div>
            <label htmlFor="cf-phone">{t("common.phone")}</label>
            <input id="cf-phone" name="phone" type="tel" maxLength={26} defaultValue={priv?.phone ?? ""} />
          </div>
          <div>
            <label htmlFor="cf-country">{t("employer.f.country")}</label>
            <input id="cf-country" name="country" maxLength={80} defaultValue={company?.country ?? "Pakistan"} />
          </div>
          <div>
            <label htmlFor="cf-city">{t("common.city")}</label>
            <input id="cf-city" name="city" maxLength={80} defaultValue={company?.city ?? ""} />
          </div>
        </div>
        <label htmlFor="cf-address">{t("employer.f.address")}</label>
        <input id="cf-address" name="address" maxLength={400} defaultValue={priv?.address ?? ""} />
        <p className="muted">{t("employer.f.privateHelp")}</p>
        <label htmlFor="cf-description">{t("employer.f.description")}</label>
        <textarea id="cf-description" name="description" rows={6} maxLength={5000} defaultValue={company?.description ?? ""} />
        {!readOnly && <p><button className="btn btn-dark" type="submit">{submitLabel}</button></p>}
      </fieldset>
    </form>
  );
}
