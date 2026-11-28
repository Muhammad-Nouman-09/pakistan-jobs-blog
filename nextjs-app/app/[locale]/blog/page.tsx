import Link from "next/link";
import type { Metadata } from "next";
import AdSlot from "@/components/ads/AdSlot";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Pagination from "@/components/ui/Pagination";
import SetupNotice from "@/components/ui/SetupNotice";
import { createT } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/config";
import { pageCtx, type PageProps } from "@/lib/page";
import { pageMetadata } from "@/lib/seo/metadata";
import { listBlogCategories, listPosts, translationFor } from "@/lib/services/public";
import { formatDate, one, pageParam, publicStorageUrl } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: raw } = await params;
  const locale = raw === "ur" ? "ur" : "en";
  const t = createT(locale);
  return pageMetadata({ locale, path: "/blog", title: t("blog.metaTitle"), description: t("blog.metaDescription") });
}

const PER_PAGE = 12;

export default async function BlogIndex(props: PageProps) {
  const { locale, t, sp } = await pageCtx(props);
  const l = (p: string) => localePath(locale, p);
  const category = (one(sp.category) ?? "").slice(0, 60) || undefined;
  const page = pageParam(sp.page);
  const [{ rows, total, configured }, cats] = await Promise.all([listPosts(locale, category, page, PER_PAGE), listBlogCategories()]);
  return (
    <main className="section">
      <div className="container">
        <Breadcrumbs t={t} items={[{ label: t("nav.home"), href: l("/") }, { label: t("nav.blog") }]} />
        <h1>{t("nav.blog")}</h1>
        <p className="sub">{t("blog.sub")}</p>
        {!configured && <SetupNotice t={t} />}
        <nav className="tabs controls" aria-label={t("blog.categories")}>
          <Link href={l("/blog")} className={!category ? "active" : undefined}>{t("common.all")}</Link>
          {cats.map((c) => <Link key={c.slug} href={`${l("/blog")}?category=${c.slug}`} className={category === c.slug ? "active" : undefined}>{t(`blog.cat.${c.slug}`)}</Link>)}
        </nav>
        {configured && !rows.length ? <p>{t("blog.none")}</p> : (
          <div className="card-grid">
            {rows.map((p) => {
              const tr = translationFor(p.blog_post_translations, locale)!;
              const img = publicStorageUrl("blog-images", p.featured_image_path);
              return (
                <article className="card" key={p.id}>
                  {img && /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt="" loading="lazy" style={{ width: "100%", height: 150, objectFit: "cover", borderRadius: 12, marginBottom: 10 }} />}
                  {p.blog_categories && <span className="badge">{t(`blog.cat.${p.blog_categories.slug}`)}</span>}
                  <h2 style={{ fontSize: 19, margin: "8px 0 6px" }}><Link href={l(`/blog/${tr.slug}`)}>{tr.title}</Link></h2>
                  <p className="muted">{tr.excerpt}</p>
                  <p className="muted" style={{ margin: 0 }}>{formatDate(p.published_at, locale)}</p>
                </article>
              );
            })}
          </div>
        )}
        <Pagination page={page} total={total} pageSize={PER_PAGE} basePath={l("/blog")} params={{ category }} t={t} />
        <AdSlot slot="inFeed" locale={locale} />
      </div>
    </main>
  );
}
