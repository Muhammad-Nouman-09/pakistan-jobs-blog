import Script from "next/script";
import { adsenseActive, getSiteSettings, SLOT_RE } from "@/lib/services/settings";
import { createT } from "@/lib/i18n";
import type { Locale } from "@/lib/i18n/config";
import AdUnit from "./AdUnit";

type SlotName = "topBanner" | "inFeed" | "inArticle" | "sidebar";

/**
 * Renders one AdSense unit — only when AdSense is enabled in the admin settings and the slot id is set.
 * Policy guardrails: only used on public content pages (job listings/details, blog, companies); never in
 * auth, dashboards, application forms or pages showing private data; always labelled; never inside or
 * directly next to buttons/forms.
 */
export default async function AdSlot({ slot, locale }: { slot: SlotName; locale: Locale }) {
  const { adsense } = await getSiteSettings();
  const id = adsense.slots[slot];
  if (!adsenseActive(adsense) || !SLOT_RE.test(id)) return null;
  const t = createT(locale);
  return (
    <>
      <Script id="adsense-loader" async strategy="afterInteractive" crossOrigin="anonymous"
        src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsense.publisherId}`} />
      <AdUnit client={adsense.publisherId} slot={id} label={t("ads.label")} />
    </>
  );
}
