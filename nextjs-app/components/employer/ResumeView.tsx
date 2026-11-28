import type { TFunction } from "@/lib/i18n";
import type { ResumeSnapshot } from "@/lib/services/employer";

const asArray = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === "string" || typeof v === "number" ? String(v) : "");
const range = (a: unknown, b: unknown, present: string) => [str(a), str(b) || (a ? present : "")].filter(Boolean).join(" – ");

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 18 }}>
      <h3 style={{ fontSize: 17, margin: "0 0 6px" }}>{title}</h3>
      {children}
    </section>
  );
}

/**
 * Read-only resume built from the snapshot taken when the candidate applied (so later edits by the candidate
 * never change what the employer reviewed). All values are rendered as text by React (escaped).
 */
export default function ResumeView({ snapshot, t }: { snapshot: ResumeSnapshot | null; t: TFunction }) {
  if (!snapshot || snapshot.redacted) return <p className="notice">{t("employer.app.withdrawnNote")}</p>;
  const c = snapshot.content ?? {};
  const education = asArray(c.education);
  const experience = asArray(c.experience);
  const skills = asArray(c.skills).map(str).filter(Boolean);
  const certs = asArray(c.certifications);
  const projects = asArray(c.projects);
  const languages = asArray(c.languages);
  const summary = str(c.summary);
  const empty = !summary && !education.length && !experience.length && !skills.length && !certs.length && !projects.length && !languages.length;

  return (
    <div>
      {empty && <p className="muted">{t("employer.app.noResumeContent")}</p>}
      {summary && <Section title={t("employer.resume.summary")}><p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{summary}</p></Section>}
      {experience.length > 0 && (
        <Section title={t("employer.resume.experience")}>
          {experience.map((e, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <b>{str(e.title)}</b>{e.company ? <> — {str(e.company)}</> : null}
              <div className="muted">{[range(e.start, e.end, t("employer.resume.present")), str(e.location)].filter(Boolean).join(" · ")}</div>
              {e.description && <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{str(e.description)}</p>}
            </div>
          ))}
        </Section>
      )}
      {education.length > 0 && (
        <Section title={t("employer.resume.education")}>
          {education.map((e, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <b>{str(e.degree)}</b>{e.field ? <> ({str(e.field)})</> : null}{e.institution ? <> — {str(e.institution)}</> : null}
              <div className="muted">{[range(e.start_year, e.end_year, ""), str(e.grade)].filter(Boolean).join(" · ")}</div>
            </div>
          ))}
        </Section>
      )}
      {skills.length > 0 && (
        <Section title={t("employer.resume.skills")}>
          <div className="chips">{skills.map((s, i) => <span key={i} className="badge badge-gray">{s}</span>)}</div>
        </Section>
      )}
      {certs.length > 0 && (
        <Section title={t("employer.resume.certifications")}>
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {certs.map((x, i) => <li key={i}>{[str(x.name), str(x.issuer), str(x.year)].filter(Boolean).join(" · ")}</li>)}
          </ul>
        </Section>
      )}
      {projects.length > 0 && (
        <Section title={t("employer.resume.projects")}>
          {projects.map((x, i) => (
            <div key={i} style={{ marginBottom: 8 }}>
              <b>{str(x.name)}</b>{x.url ? <> — <span className="ltr">{str(x.url)}</span></> : null}
              {x.description && <p style={{ whiteSpace: "pre-wrap", margin: "4px 0 0" }}>{str(x.description)}</p>}
            </div>
          ))}
        </Section>
      )}
      {languages.length > 0 && (
        <Section title={t("employer.resume.languages")}>
          <ul style={{ margin: 0, paddingInlineStart: 20 }}>
            {languages.map((x, i) => {
              const lvl = str(x.level);
              const known = ["basic", "conversational", "fluent", "native"].includes(lvl);
              return <li key={i}>{str(x.name)}{lvl ? ` — ${known ? t(`employer.resume.level.${lvl}`) : lvl}` : ""}</li>;
            })}
          </ul>
        </Section>
      )}
    </div>
  );
}
