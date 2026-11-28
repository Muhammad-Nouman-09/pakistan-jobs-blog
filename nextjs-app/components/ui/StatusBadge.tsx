import type { TFunction } from "@/lib/i18n";

const TONE: Record<string, string> = {
  approved: "", verified: "", active: "", selected: "", shortlisted: "badge-blue", interview: "badge-blue", viewed: "badge-gray",
  submitted: "badge-gray", draft: "badge-gray", archived: "badge-gray", expired: "badge-gray", withdrawn: "badge-gray",
  pending_review: "badge-amber", pending: "badge-amber", changes_requested: "badge-amber",
  rejected: "badge-red", suspended: "badge-red"
};

/** kind selects the label namespace: jobStatus | companyStatus | appStatus | accountStatus | member | role */
export default function StatusBadge({ kind, value, t }: { kind: "jobStatus" | "companyStatus" | "appStatus" | "accountStatus" | "member" | "role"; value: string; t: TFunction }) {
  return <span className={`badge ${TONE[value] ?? "badge-gray"}`}>{t(`${kind}.${value}`)}</span>;
}
