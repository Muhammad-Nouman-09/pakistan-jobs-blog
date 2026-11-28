import { getAdsense, saveAdsense } from "@/lib/db";
import { requireUser, json } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Public read: AdSense publisher/slot IDs are embedded in page source anyway.
export async function GET() {
  return json({ adsense: await getAdsense() });
}

export async function PUT(req) {
  const { response } = await requireUser(["admin"]);
  if (response) return response;
  const b = await req.json().catch(() => ({}));
  const s = (v) => String(v ?? "").trim().slice(0, 100);
  const adsense = {
    publisherId: s(b.publisherId), enabled: !!b.enabled,
    slots: { topBanner: s(b.slots?.topBanner), inFeed: s(b.slots?.inFeed), inArticle: s(b.slots?.inArticle), sidebar: s(b.slots?.sidebar) }
  };
  await saveAdsense(adsense);
  return json({ adsense });
}
