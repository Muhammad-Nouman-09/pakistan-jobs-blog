import type { TFunction } from "@/lib/i18n";
import { PROVINCES } from "@/lib/types";

/** name / phone / city / province inputs shared by the profile page and settings (columns of `profiles`). */
export default function ContactFields({ t, values, idPrefix }: {
  t: TFunction; idPrefix: string;
  values: { full_name: string; phone: string | null; city: string | null; province: string | null };
}) {
  const province = values.province ?? "";
  const options: string[] = [...PROVINCES];
  if (province && !options.includes(province)) options.push(province);
  return (
    <div className="grid-2">
      <div>
        <label htmlFor={`${idPrefix}-name`}>{t("candidate.profile.fullName")} *</label>
        <input id={`${idPrefix}-name`} name="full_name" required minLength={2} maxLength={120} defaultValue={values.full_name} autoComplete="name" />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-phone`}>{t("common.phone")}</label>
        <input id={`${idPrefix}-phone`} name="phone" type="tel" maxLength={40} defaultValue={values.phone ?? ""} autoComplete="tel" />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-city`}>{t("common.city")}</label>
        <input id={`${idPrefix}-city`} name="city" maxLength={80} defaultValue={values.city ?? ""} autoComplete="address-level2" />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-province`}>{t("common.province")}</label>
        <select id={`${idPrefix}-province`} name="province" defaultValue={province}>
          <option value="">—</option>
          {options.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>
    </div>
  );
}
