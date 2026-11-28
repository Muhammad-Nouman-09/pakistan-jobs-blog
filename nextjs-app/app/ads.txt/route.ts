import { getSiteSettings } from "@/lib/services/settings";
import { validateAdsTxtBasic } from "@/lib/seo/adstxt";

export const revalidate = 300;

/** ads.txt is served from the admin AdSense settings. Empty/invalid content -> 404 (nothing is invented). */
export async function GET() {
  const { adsense } = await getSiteSettings();
  const body = adsense.adsTxt.trim();
  if (!body || !validateAdsTxtBasic(body)) return new Response("Not found", { status: 404 });
  return new Response(`${body}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300" } });
}
