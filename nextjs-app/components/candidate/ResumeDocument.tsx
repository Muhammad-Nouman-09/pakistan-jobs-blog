import type { ReactNode } from "react";
import type { TFunction } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import { looseContent, type LooseRow } from "@/lib/validation/candidate";

/** "2021-03" -> "Mar 2021" (localized); anything else is shown as is. */
function month(v: string, locale: Locale): string {
  const m = v.match(/^(\d{4})-(\d{2})$/);
  if (!m) return v;
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-GB", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(+m[1], +m[2] - 1, 1)));
}

const range = (a: string, b: string) => [a, b].filter(Boolean).join(" – ");

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ margin: "0 0 18px", breakInside: "avoid" }}>
      <h2 style={{ fontSize: 17, margin: "0 0 8px", paddingBottom: 4, borderBottom: "2px solid var(--line)" }}>{title}</h2>
      {children}
    </section>
  );
}

function Entry({ head, sub, meta, body }: { head: string; sub?: string; meta?: string; body?: string }) {
  return (
    <div style={{ margin: "0 0 10px" }}>
      <div className="admin-row" style={{ borderBottom: 0, padding: 0 }}>
        <strong>{head}{sub ? <span style={{ fontWeight: 400 }}> — {sub}</span> : null}</strong>
        {meta ? <span className="muted">{meta}</span> : null}
      </div>
      {body ? <p style={{ margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{body}</p> : null}
    </div>
  );
}

/**
 * Printable HTML resume. Used by the preview page and (read-only) by the application detail page, whose
 * resume_snapshot.content has the same shape. Tolerates missing / malformed JSON.
 */
export default function ResumeDocument({ content, t, locale }: { content: unknown; t: TFunction; locale: Locale }) {
  const c = looseContent(content);
  const edu = (r: LooseRow) => range(r.start_year ?? "", r.end_year ?? "");
  const contact = [c.personal.email, c.personal.phone, c.personal.location].filter(Boolean);
  return (
    <article style={{ lineHeight: 1.5 }}>
      <header style={{ margin: "0 0 18px" }}>
        <h1 style={{ fontSize: 28, margin: 0 }}>{c.personal.name || t("candidate.resume.unnamed")}</h1>
        {contact.length > 0 && (
          <p className="muted" style={{ margin: "4px 0 0" }}>
            {contact.map((x, i) => <span key={i}>{i > 0 ? " · " : ""}<span className="ltr">{x}</span></span>)}
          </p>
        )}
      </header>
      {c.summary && <Section title={t("candidate.profile.summary")}><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{c.summary}</p></Section>}
      {c.experience.length > 0 && (
        <Section title={t("candidate.exp.heading")}>
          {c.experience.map((r, i) => (
            <Entry key={i} head={r.title} sub={[r.company, r.location].filter(Boolean).join(", ")}
              meta={range(month(r.start ?? "", locale), r.end ? month(r.end, locale) : t("candidate.exp.present"))} body={r.description} />
          ))}
        </Section>
      )}
      {c.education.length > 0 && (
        <Section title={t("candidate.edu.heading")}>
          {c.education.map((r, i) => (
            <Entry key={i} head={r.degree} sub={[r.field, r.institution].filter(Boolean).join(", ")} meta={edu(r)}
              body={r.grade ? `${t("candidate.edu.grade")}: ${r.grade}` : undefined} />
          ))}
        </Section>
      )}
      {c.skills.length > 0 && <Section title={t("candidate.skills.heading")}><p style={{ margin: 0 }}>{c.skills.join(" · ")}</p></Section>}
      {c.certifications.length > 0 && (
        <Section title={t("candidate.cert.heading")}>
          {c.certifications.map((r, i) => <Entry key={i} head={r.name} sub={r.issuer} meta={r.year} />)}
        </Section>
      )}
      {c.projects.length > 0 && (
        <Section title={t("candidate.proj.heading")}>
          {c.projects.map((r, i) => <Entry key={i} head={r.name} sub={r.url} body={r.description} />)}
        </Section>
      )}
      {c.languages.length > 0 && (
        <Section title={t("candidate.lang.heading")}>
          <p style={{ margin: 0 }}>{c.languages.map((r) => `${r.name}${r.level ? ` (${t(`candidate.level.${r.level}`)})` : ""}`).join(" · ")}</p>
        </Section>
      )}
    </article>
  );
}
