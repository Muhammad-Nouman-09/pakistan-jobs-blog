import Link from "next/link";
import type { TFunction } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";
import type { JobStatus } from "@/lib/types";
import ConfirmButton from "@/components/ui/ConfirmButton";
import { jobWorkflowAction } from "@/lib/actions/job-actions";

function Op({ locale, jobId, op, label, className, confirm, t }: {
  locale: Locale; jobId: string; op: "withdraw" | "archive" | "restore" | "submit"; label: string; className: string; confirm?: boolean; t: TFunction;
}) {
  return (
    <form action={jobWorkflowAction}>
      <input type="hidden" name="locale" value={locale} />
      <input type="hidden" name="area" value="employer" />
      <input type="hidden" name="job_id" value={jobId} />
      <input type="hidden" name="op" value={op} />
      {confirm
        ? <ConfirmButton className={className} message={t("action.confirm")}>{label}</ConfirmButton>
        : <button className={className} type="submit">{label}</button>}
    </form>
  );
}

/**
 * The buttons that make sense for a job in its current status. Viewers (canRecruit=false) only get "view".
 * The database enforces the same rules; this just avoids offering actions that would be refused.
 */
export default function JobActions({ locale, t, jobId, status, canEdit, showView = true }: {
  locale: Locale; t: TFunction; jobId: string; status: JobStatus; canEdit: boolean; showView?: boolean;
}) {
  const edit = status !== "pending_review" && status !== "archived";
  const submit = status === "draft" || status === "rejected" || status === "changes_requested";
  return (
    <div className="row-actions">
      {showView && <Link className="btn btn-outline btn-small" href={localePath(locale, `/employer/jobs/${jobId}`)}>{t("action.view")}</Link>}
      {canEdit && edit && <Link className="btn btn-outline btn-small" href={localePath(locale, `/employer/jobs/${jobId}/edit`)}>{t("action.edit")}</Link>}
      {canEdit && submit && <Op locale={locale} jobId={jobId} op="submit" label={t("employer.job.submit")} className="btn btn-dark btn-small" t={t} />}
      {canEdit && status === "pending_review" && <Op locale={locale} jobId={jobId} op="withdraw" label={t("employer.job.withdraw")} className="btn btn-outline btn-small" confirm t={t} />}
      {canEdit && status === "archived" && <Op locale={locale} jobId={jobId} op="restore" label={t("employer.job.restore")} className="btn btn-outline btn-small" t={t} />}
      {canEdit && status !== "archived" && <Op locale={locale} jobId={jobId} op="archive" label={t("employer.job.archive")} className="btn btn-danger btn-small" confirm t={t} />}
    </div>
  );
}
