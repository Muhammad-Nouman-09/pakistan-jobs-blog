import { createAnonClient } from "@/lib/supabase/anon";

export interface AdsenseSettings { enabled: boolean; publisherId: string; slots: { topBanner: string; inFeed: string; inArticle: string; sidebar: string }; adsTxt: string }
export interface GeneralSettings { siteName: string; contactEmail: string; supportPhone: string; twitter: string; facebook: string }
export interface SeoSettings { defaultTitle: string; defaultDescription: string; ogImage: string }

export const DEFAULT_ADSENSE: AdsenseSettings = { enabled: false, publisherId: "", slots: { topBanner: "", inFeed: "", inArticle: "", sidebar: "" }, adsTxt: "" };
export const DEFAULT_GENERAL: GeneralSettings = { siteName: "Pakistan Jobs Blog", contactEmail: "", supportPhone: "", twitter: "", facebook: "" };
export const DEFAULT_SEO: SeoSettings = {
  defaultTitle: "Pakistan Jobs Blog — Govt & Private Jobs in Pakistan",
  defaultDescription: "Government and private jobs in Pakistan from verified employers, with real last dates and direct apply links.",
  ogImage: ""
};

export const PUBLISHER_RE = /^ca-pub-\d{10,20}$/;
export const SLOT_RE = /^\d{6,20}$/;

export interface SiteSettings { general: GeneralSettings; seo: SeoSettings; adsense: AdsenseSettings }

/** Public site settings (cached 60 s via the anon client). Falls back to defaults when Supabase is absent. */
export async function getSiteSettings(): Promise<SiteSettings> {
  const supabase = createAnonClient();
  const out: SiteSettings = { general: DEFAULT_GENERAL, seo: DEFAULT_SEO, adsense: DEFAULT_ADSENSE };
  if (!supabase) return out;
  const { data } = await supabase.from("site_settings").select("key,value");
  for (const row of data ?? []) {
    if (row.key === "general") out.general = { ...DEFAULT_GENERAL, ...row.value };
    if (row.key === "seo") out.seo = { ...DEFAULT_SEO, ...row.value };
    if (row.key === "adsense") out.adsense = { ...DEFAULT_ADSENSE, ...row.value, slots: { ...DEFAULT_ADSENSE.slots, ...row.value?.slots } };
  }
  return out;
}

/** AdSense is active only with an enabled flag AND a well-formed publisher id. */
export const adsenseActive = (a: AdsenseSettings) => a.enabled && PUBLISHER_RE.test(a.publisherId);
