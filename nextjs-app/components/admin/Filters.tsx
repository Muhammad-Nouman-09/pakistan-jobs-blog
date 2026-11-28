import Link from "next/link";
import type { ReactNode } from "react";
import type { TFunction } from "@/lib/i18n";

/** GET filter form (no JavaScript needed). Children are the labelled inputs; "Clear" links back to `action`. */
export default function Filters({ action, t, children }: { action: string; t: TFunction; children: ReactNode }) {
  return (
    <form className="filters" method="get" action={action} role="search">
      {children}
      <div className="row-actions">
        <button className="btn btn-dark btn-small" type="submit">{t("action.filter")}</button>
        <Link className="btn btn-outline btn-small" href={action}>{t("action.clear")}</Link>
      </div>
    </form>
  );
}

export function SelectField({ id, name, label, value, options }: {
  id: string; name: string; label: string; value: string; options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select id={id} name={name} defaultValue={value}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

export function TextField({ id, name, label, value, type = "search" }: { id: string; name: string; label: string; value: string; type?: string }) {
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <input id={id} name={name} type={type} defaultValue={value} />
    </div>
  );
}
