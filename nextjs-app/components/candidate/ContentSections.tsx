import type { TFunction } from "@/lib/i18n";
import RepeatableSection, { type FieldConfig } from "./RepeatableSection";
import { LANGUAGE_LEVELS, MAX_ROWS, MAX_SKILLS, type LooseContent } from "@/lib/validation/candidate";

/**
 * The structured CV sections shared by the profile page and the resume builder:
 * education, experience, skills, certifications, projects, languages.
 * Field names (`education[0].degree`, `skills`, …) match lib/validation/candidate.ts.
 */
export default function ContentSections({ t, content }: {
  t: TFunction;
  content: Pick<LooseContent, "education" | "experience" | "skills" | "certifications" | "projects" | "languages">;
}) {
  const remove = t("action.remove");
  const levels = [{ value: "", label: "—" }, ...LANGUAGE_LEVELS.map((v) => ({ value: v, label: t(`candidate.level.${v}`) }))];

  const education: FieldConfig[] = [
    { key: "degree", label: t("candidate.edu.degree"), required: true, maxLength: 120 },
    { key: "institution", label: t("candidate.edu.institution"), required: true, maxLength: 160 },
    { key: "field", label: t("candidate.edu.field"), maxLength: 120 },
    { key: "grade", label: t("candidate.edu.grade"), maxLength: 60 },
    { key: "start_year", label: t("candidate.edu.startYear"), type: "year", placeholder: "2018" },
    { key: "end_year", label: t("candidate.edu.endYear"), type: "year", placeholder: "2022" }
  ];
  const experience: FieldConfig[] = [
    { key: "title", label: t("candidate.exp.title"), required: true, maxLength: 120 },
    { key: "company", label: t("candidate.exp.company"), required: true, maxLength: 160 },
    { key: "location", label: t("candidate.exp.location"), maxLength: 120 },
    { key: "start", label: t("candidate.exp.start"), type: "month", required: true },
    { key: "end", label: t("candidate.exp.end"), type: "month", hint: t("candidate.exp.endHint") },
    { key: "description", label: t("candidate.exp.description"), type: "textarea", maxLength: 2000 }
  ];
  const certifications: FieldConfig[] = [
    { key: "name", label: t("candidate.cert.name"), required: true, maxLength: 160 },
    { key: "issuer", label: t("candidate.cert.issuer"), maxLength: 160 },
    { key: "year", label: t("candidate.cert.year"), type: "year", placeholder: "2023" }
  ];
  const projects: FieldConfig[] = [
    { key: "name", label: t("candidate.proj.name"), required: true, maxLength: 160 },
    { key: "url", label: t("candidate.proj.url"), type: "url", maxLength: 500, placeholder: "https://" },
    { key: "description", label: t("candidate.proj.description"), type: "textarea", maxLength: 1000 }
  ];
  const languages: FieldConfig[] = [
    { key: "name", label: t("candidate.lang.name"), required: true, maxLength: 60 },
    { key: "level", label: t("candidate.lang.level"), type: "select", options: levels }
  ];

  return (
    <>
      <section className="panel" aria-labelledby="sec-education">
        <h2 id="sec-education">{t("candidate.edu.heading")}</h2>
        <RepeatableSection name="education" fields={education} initial={content.education} max={MAX_ROWS}
          labels={{ add: t("candidate.edu.add"), remove, item: t("candidate.edu.item") }} />
      </section>
      <section className="panel" aria-labelledby="sec-experience">
        <h2 id="sec-experience">{t("candidate.exp.heading")}</h2>
        <RepeatableSection name="experience" fields={experience} initial={content.experience} max={MAX_ROWS}
          labels={{ add: t("candidate.exp.add"), remove, item: t("candidate.exp.item") }} />
      </section>
      <section className="panel" aria-labelledby="sec-skills">
        <h2 id="sec-skills">{t("candidate.skills.heading")}</h2>
        <label htmlFor="skills">{t("candidate.skills.label")}</label>
        <textarea id="skills" name="skills" rows={3} maxLength={MAX_SKILLS * 62} defaultValue={content.skills.join(", ")} />
        <span className="muted">{t("candidate.skills.hint", { max: MAX_SKILLS })}</span>
      </section>
      <section className="panel" aria-labelledby="sec-certs">
        <h2 id="sec-certs">{t("candidate.cert.heading")}</h2>
        <RepeatableSection name="certifications" fields={certifications} initial={content.certifications} max={MAX_ROWS}
          labels={{ add: t("candidate.cert.add"), remove, item: t("candidate.cert.item") }} />
      </section>
      <section className="panel" aria-labelledby="sec-projects">
        <h2 id="sec-projects">{t("candidate.proj.heading")}</h2>
        <RepeatableSection name="projects" fields={projects} initial={content.projects} max={MAX_ROWS}
          labels={{ add: t("candidate.proj.add"), remove, item: t("candidate.proj.item") }} />
      </section>
      <section className="panel" aria-labelledby="sec-languages">
        <h2 id="sec-languages">{t("candidate.lang.heading")}</h2>
        <RepeatableSection name="languages" fields={languages} initial={content.languages} max={MAX_ROWS}
          labels={{ add: t("candidate.lang.add"), remove, item: t("candidate.lang.item") }} />
      </section>
    </>
  );
}
