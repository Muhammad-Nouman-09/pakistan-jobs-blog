import { redirect } from "next/navigation";
import { dashboardPath, getSession } from "@/lib/auth/session";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { noindexMetadata } from "@/lib/seo/metadata";

export const metadata = noindexMetadata("Dashboard");
export const dynamic = "force-dynamic";

/** Sends the signed-in user to the dashboard of their account type (used by legacy /profile links too). */
export default async function DashboardRedirect(props: PageProps) {
  const { locale } = await pageCtx(props);
  const { profile } = await getSession();
  if (!profile) redirect(localePath(locale, "/auth/login"));
  redirect(localePath(locale, dashboardPath(profile.role)));
}
