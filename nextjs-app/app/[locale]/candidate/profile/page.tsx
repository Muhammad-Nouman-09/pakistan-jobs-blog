import Flash from "@/components/ui/Flash";
import ContactFields from "@/components/candidate/ContactFields";
import ContentSections from "@/components/candidate/ContentSections";
import { requireRole } from "@/lib/auth/session";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { getCandidateProfile } from "@/lib/services/candidate";
import { saveProfileAction } from "../actions";

export async function generateMetadata(props: PageProps) {
  const { t } = await pageCtx(props);
  return noindexMetadata(t("candidate.nav.profile"));
}

export default async function ProfilePage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const { supabase, user, profile } = await requireRole(locale, ["job_seeker"]);
  const cp = await getCandidateProfile(supabase, user.id);

  return (
    <>
      <Flash params={sp} t={t} />
      <p className="muted">{t("candidate.profile.intro")}</p>
      <form action={saveProfileAction}>
        <input type="hidden" name="locale" value={locale} />

        <section className="panel" aria-labelledby="sec-about">
          <h2 id="sec-about">{t("candidate.profile.about")}</h2>
          <ContactFields t={t} idPrefix="pf" values={profile} />
          <label htmlFor="pf-email">{t("common.email")}</label>
          <input id="pf-email" type="email" value={profile.email} readOnly disabled />
          <label htmlFor="pf-headline">{t("candidate.profile.headline")}</label>
          <input id="pf-headline" name="headline" maxLength={160} defaultValue={cp.headline} />
          <span className="muted">{t("candidate.profile.headlineHint")}</span>
          <label htmlFor="pf-summary">{t("candidate.profile.summary")}</label>
          <textarea id="pf-summary" name="summary" rows={6} maxLength={3000} defaultValue={cp.summary} />
        </section>

        <ContentSections t={t} content={cp} />

        <p><button className="btn btn-dark" type="submit">{t("action.saveChanges")}</button></p>
      </form>
    </>
  );
}
