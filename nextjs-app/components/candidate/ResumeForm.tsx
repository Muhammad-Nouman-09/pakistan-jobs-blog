import Link from "next/link";
import type { TFunction } from "@/lib/i18n";
import { localePath, type Locale } from "@/lib/i18n/config";
import type { LooseContent } from "@/lib/validation/candidate";
import { saveResumeAction } from "@/app/[locale]/candidate/actions";
import ContentSections from "./ContentSections";

export interface ResumeFormValues {
  title: string;
  visibility: "private" | "shareable";
  is_default: boolean;
  content: LooseContent;
}

const kb = (n: number | null) => (n ? `${Math.max(1, Math.round(n / 1024))} KB` : "");

/** The resume builder form, used by resumes/new and resumes/[id]. */
export default function ResumeForm({ t, locale, id, values, pdf }: {
  t: TFunction; locale: Locale; id?: string; values: ResumeFormValues; pdf?: { name: string | null; size: number | null } | null;
}) {
  const c = values.content;
  return (
    <form action={saveResumeAction} encType="multipart/form-data">
      <input type="hidden" name="locale" value={locale} />
      {id ? <input type="hidden" name="id" value={id} /> : null}

      <section className="panel" aria-labelledby="sec-basics">
        <h2 id="sec-basics">{t("candidate.resume.basics")}</h2>
        <label htmlFor="title">{t("candidate.resume.titleLabel")} *</label>
        <input id="title" name="title" required maxLength={120} defaultValue={values.title} />
        <span className="muted">{t("candidate.resume.titleHint")}</span>

        <label htmlFor="visibility">{t("candidate.resume.visibility")}</label>
        <select id="visibility" name="visibility" defaultValue={values.visibility} aria-describedby="visibility-help">
          <option value="private">{t("candidate.resume.visibility.private")}</option>
          <option value="shareable">{t("candidate.resume.visibility.shareable")}</option>
        </select>
        <p id="visibility-help" className="muted">{t("candidate.resume.visibilityHelp")}</p>

        <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
          <input type="checkbox" name="is_default" defaultChecked={values.is_default} /> {t("candidate.resume.makeDefault")}
        </label>
      </section>

      <section className="panel" aria-labelledby="sec-personal">
        <h2 id="sec-personal">{t("candidate.resume.personal")}</h2>
        <div className="grid-2">
          <div>
            <label htmlFor="p-name">{t("common.name")}</label>
            <input id="p-name" name="personal.name" maxLength={120} defaultValue={c.personal.name} autoComplete="name" />
          </div>
          <div>
            <label htmlFor="p-email">{t("common.email")}</label>
            <input id="p-email" name="personal.email" type="email" maxLength={200} defaultValue={c.personal.email} autoComplete="email" />
          </div>
          <div>
            <label htmlFor="p-phone">{t("common.phone")}</label>
            <input id="p-phone" name="personal.phone" type="tel" maxLength={40} defaultValue={c.personal.phone} autoComplete="tel" />
          </div>
          <div>
            <label htmlFor="p-location">{t("candidate.resume.location")}</label>
            <input id="p-location" name="personal.location" maxLength={160} defaultValue={c.personal.location} />
          </div>
        </div>
        <label htmlFor="summary">{t("candidate.profile.summary")}</label>
        <textarea id="summary" name="summary" rows={5} maxLength={3000} defaultValue={c.summary} />
      </section>

      <ContentSections t={t} content={c} />

      <section className="panel" aria-labelledby="sec-pdf">
        <h2 id="sec-pdf">{t("candidate.resume.pdfHeading")}</h2>
        <p className="muted">{t("candidate.resume.pdfHelp")}</p>
        {pdf && id ? (
          <p>
            <strong>{t("candidate.resume.currentPdf")}:</strong> <span className="ltr">{pdf.name ?? "resume.pdf"}</span> {kb(pdf.size)}{" "}
            <a className="btn btn-outline btn-small" href={localePath(locale, `/candidate/resumes/${id}/pdf`)}>{t("action.download")}</a>
          </p>
        ) : null}
        <label htmlFor="pdf">{pdf ? t("candidate.resume.replacePdf") : t("candidate.resume.uploadPdf")}</label>
        <input id="pdf" name="pdf" type="file" accept="application/pdf,.pdf" />
        {pdf ? (
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontWeight: 600 }}>
            <input type="checkbox" name="remove_pdf" /> {t("candidate.resume.removePdf")}
          </label>
        ) : null}
      </section>

      <p className="row-actions">
        <button className="btn btn-dark" type="submit">{t("action.saveChanges")}</button>
        <Link className="btn btn-outline" href={localePath(locale, "/candidate/resumes")}>{t("action.cancel")}</Link>
      </p>
    </form>
  );
}
