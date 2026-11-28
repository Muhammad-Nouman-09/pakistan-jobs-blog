import type { TFunction } from "@/lib/i18n";
import { COMPANY_SIZES } from "@/lib/types";

export interface CompanyValues {
  name?: string; description?: string; industry?: string | null; website?: string | null; country?: string; city?: string | null;
  size?: string | null; email?: string | null; phone?: string | null; address?: string | null;
}

/** Descriptive company fields shared by "create platform-managed company" and "edit company". */
export default function CompanyFields({ t, v = {} }: { t: TFunction; v?: CompanyValues }) {
  return (
    <>
      <label htmlFor="cf-name">{t("admin.company.name")} *</label>
      <input id="cf-name" name="name" required minLength={2} maxLength={150} defaultValue={v.name ?? ""} />
      <label htmlFor="cf-description">{t("admin.company.description")}</label>
      <textarea id="cf-description" name="description" maxLength={5000} defaultValue={v.description ?? ""} />
      <div className="grid-2">
        <div>
          <label htmlFor="cf-industry">{t("admin.company.industry")}</label>
          <input id="cf-industry" name="industry" maxLength={100} defaultValue={v.industry ?? ""} />
        </div>
        <div>
          <label htmlFor="cf-size">{t("admin.company.size")}</label>
          <select id="cf-size" name="size" defaultValue={v.size ?? ""}>
            <option value="">{t("common.none")}</option>
            {COMPANY_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="cf-website">{t("admin.company.website")}</label>
          <input id="cf-website" name="website" type="url" maxLength={300} placeholder="https://" defaultValue={v.website ?? ""} />
        </div>
        <div>
          <label htmlFor="cf-country">{t("admin.company.country")}</label>
          <input id="cf-country" name="country" maxLength={80} defaultValue={v.country ?? "Pakistan"} />
        </div>
        <div>
          <label htmlFor="cf-city">{t("common.city")}</label>
          <input id="cf-city" name="city" maxLength={80} defaultValue={v.city ?? ""} />
        </div>
      </div>
      <h3>{t("admin.company.privateTitle")}</h3>
      <p className="muted">{t("admin.company.privateHelp")}</p>
      <div className="grid-2">
        <div>
          <label htmlFor="cf-email">{t("common.email")}</label>
          <input id="cf-email" name="email" type="email" maxLength={200} defaultValue={v.email ?? ""} />
        </div>
        <div>
          <label htmlFor="cf-phone">{t("common.phone")}</label>
          <input id="cf-phone" name="phone" type="tel" maxLength={26} defaultValue={v.phone ?? ""} />
        </div>
      </div>
      <label htmlFor="cf-address">{t("admin.company.address")}</label>
      <input id="cf-address" name="address" maxLength={400} defaultValue={v.address ?? ""} />
    </>
  );
}
