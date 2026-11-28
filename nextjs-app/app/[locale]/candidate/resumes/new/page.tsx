import Link from "next/link";
import Flash from "@/components/ui/Flash";
import ResumeForm from "@/components/candidate/ResumeForm";
import { requireRole } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { countResumes, getCandidateProfile } from "@/lib/services/candidate";
import { MAX_RESUMES, looseContent, type LooseContent } from "@/lib/validation/candidate";
import { one } from "@/lib/utils";

export async function generateMetadata(props: PageProps) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.resumes.new"));
}

export default async function NewResumePage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user, profile } = await requireRole(locale, ["job_seeker"]);
  const list = localePath(locale, "/candidate/resumes");

  if ((await countResumes(supabase, user.id)) >= MAX_RESUMES) {
    return (
      <section className="panel">
        <p className="notice warn">{t("candidate.resumes.limitReached", { max: MAX_RESUMES })}</p>
        <Link className="btn btn-outline" href={list}>{t("action.back")}</Link>
      </section>
    );
  }

  // "Start from my profile" copies the profile into the form; nothing is saved until the user submits.
  const fromProfile = one(sp.from) === "profile";
  let content: LooseContent = looseContent({});
  let title = "";
  if (fromProfile) {
    const cp = await getCandidateProfile(supabase, user.id);
    content = {
      personal: { name: profile.full_name, email: profile.email, phone: profile.phone ?? "", location: [profile.city, profile.province].filter(Boolean).join(", ") },
      summary: cp.summary, skills: cp.skills, education: cp.education, experience: cp.experience,
      certifications: cp.certifications, projects: cp.projects, languages: cp.languages
    };
    title = cp.headline.slice(0, 120);
  } else {
    content.personal = { name: profile.full_name, email: profile.email, phone: profile.phone ?? "", location: "" };
  }

  return (
    <>
      <Flash params={sp} t={t} />
      <section className="panel">
        <h2>{t("candidate.resumes.new")}</h2>
        {fromProfile ? (
          <p className="notice">{t("candidate.resumes.prefilled")} <Link href={`${list}/new`}>{t("candidate.resumes.startBlank")}</Link></p>
        ) : (
          <p className="muted">{t("candidate.resumes.newIntro")} <Link href={`${list}/new?from=profile`}>{t("candidate.resumes.fromProfile")}</Link></p>
        )}
      </section>
      <ResumeForm t={t} locale={locale} values={{ title, visibility: "private", is_default: false, content }} />
    </>
  );
}
