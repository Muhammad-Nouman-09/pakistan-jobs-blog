import type { Metadata } from "next";
import Link from "next/link";
import Flash from "@/components/ui/Flash";
import SetupNotice from "@/components/ui/SetupNotice";
import { requireRole } from "@/lib/auth/session";
import { isConfigured } from "@/lib/env";
import { createT } from "@/lib/i18n";
import { isLocale, localePath } from "@/lib/i18n/config";
import { one } from "@/lib/utils";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";
import { inviteTokenSchema } from "@/lib/validation/company";
import { acceptInvitationAction } from "./actions";

export const dynamic = "force-dynamic";   // per-user: never prerendered

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  // No referrer: the page URL contains the invitation token.
  return { ...noindexMetadata(createT(isLocale(locale) ? locale : "en")("employer.invite.pageTitle")), referrer: "no-referrer" };
}

export default async function AcceptInvitationPage(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const raw = one(sp.token);
  const token = inviteTokenSchema.safeParse(raw);
  const here = localePath(locale, "/invitations/accept");

  if (!isConfigured()) {
    return <main className="section"><div className="container"><div className="form-card"><SetupNotice t={t} /></div></div></main>;
  }
  if (!token.success) {
    return (
      <main className="section">
        <div className="container">
          <div className="form-card">
            <h1 style={{ fontSize: 28 }}>{t("employer.invite.pageTitle")}</h1>
            <p className="notice warn" role="alert">{t("err.invalid_invitation")}</p>
            <Link className="btn btn-outline" href={localePath(locale)}>{t("nav.home")}</Link>
          </div>
        </div>
      </main>
    );
  }

  // Signed out (or unverified / suspended) visitors are sent to sign in and come back here afterwards.
  await requireRole(locale, ["employer", "job_seeker", "admin"], `${here}?token=${encodeURIComponent(token.data)}`);

  return (
    <main className="section">
      <div className="container">
        <div className="form-card">
          <h1 style={{ fontSize: 28 }}>{t("employer.invite.joinTitle")}</h1>
          <Flash params={sp} t={t} />
          <p>{t("employer.invite.joinText")}</p>
          <form action={acceptInvitationAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="token" value={token.data} />
            <p className="row-actions">
              <button className="btn btn-dark" type="submit">{t("employer.invite.accept")}</button>
              <Link className="btn btn-outline" href={localePath(locale)}>{t("action.cancel")}</Link>
            </p>
          </form>
          <p className="muted">{t("employer.invite.joinNote")}</p>
        </div>
      </div>
    </main>
  );
}
