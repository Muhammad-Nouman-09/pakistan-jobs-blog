"use server";
import { revalidateTag } from "next/cache";
import { errorKey } from "@/lib/errors";
import { parseWith, redirectWith } from "@/lib/forms";
import { adsenseSettingsSchema, generalSettingsSchema, seoSettingsSchema, validateAdsTxt } from "@/lib/validation/admin";
import { adminAction } from "../_ctx";

type Ctx = Awaited<ReturnType<typeof adminAction>>;

async function saveSetting(c: Ctx, key: "general" | "seo" | "adsense", value: Record<string, unknown>, back: string) {
  const { error } = await c.supabase.from("site_settings").upsert(
    { key, value, updated_by: c.user.id, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) redirectWith(back, { error: errorKey(error) });
  revalidateTag("public-data");
  redirectWith(back, { msg: "common.saved" });
}

export async function saveGeneralAction(fd: FormData) {
  const c = await adminAction(fd, (l) => `/${l}/admin/settings/general`);
  const back = c.path("/settings/general");
  const p = parseWith(generalSettingsSchema, c.o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const d = p.data;
  await saveSetting(c, "general", {
    siteName: d.siteName, contactEmail: d.contactEmail ?? "", supportPhone: d.supportPhone ?? "", twitter: d.twitter ?? "", facebook: d.facebook ?? ""
  }, back);
}

export async function saveSeoAction(fd: FormData) {
  const c = await adminAction(fd, (l) => `/${l}/admin/settings/seo`);
  const back = c.path("/settings/seo");
  const p = parseWith(seoSettingsSchema, c.o);
  if (!p.ok) redirectWith(back, { error: p.error });
  await saveSetting(c, "seo", { defaultTitle: p.data.defaultTitle, defaultDescription: p.data.defaultDescription, ogImage: p.data.ogImage ?? "" }, back);
}

export async function saveAdsenseAction(fd: FormData) {
  const c = await adminAction(fd, (l) => `/${l}/admin/settings/adsense`);
  const back = c.path("/settings/adsense");
  // ads.txt first, so the admin learns WHICH line is wrong.
  const ads = validateAdsTxt(typeof c.o.adsTxt === "string" ? c.o.adsTxt : "");
  if (!ads.ok) redirectWith(`${back}?line=${ads.line}&reason=${ads.reason}`, { error: "v.ads_txt" });
  const p = parseWith(adsenseSettingsSchema, { ...c.o, adsTxt: ads.text });
  if (!p.ok) redirectWith(back, { error: p.error });
  const d = p.data;
  await saveSetting(c, "adsense", {
    enabled: d.enabled, publisherId: d.publisherId,
    slots: { topBanner: d.topBanner, inFeed: d.inFeed, inArticle: d.inArticle, sidebar: d.sidebar },
    adsTxt: ads.text
  }, back);
}
