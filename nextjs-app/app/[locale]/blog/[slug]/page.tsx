import Link from "next/link";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import AdSlot from "@/components/ads/AdSlot";
import JsonLd from "@/components/JsonLd";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Markdown from "@/components/ui/Markdown";
import { createT } from "@/lib/i18n";
import { isLocale, localePath } from "@/lib/i18n/config";
import { plainExcerpt } from "@/lib/markdown";
import { pageCtx, type PageProps } from "@/lib/page";
import { articleJsonLd, breadcrumbJsonLd } from "@/lib/seo/jsonld";
import { pageMetadata } from "@/lib/seo/metadata";
import { availableLocales, getPostBySlug, translationFor } from "@/lib/services/public";
import { formatDate, publicStorageUrl } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<{ slug: string }>): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) return {};
  const post = await getPostBySlug(slug);
  const tr = post && (translationFor(post.blog_post_translations, locale) ?? post.blog_post_translations[0]);
  if (!post || !tr) return { title: createT(locale)("notFound.title"), robots: { index: false } };
  return pageMetadata({
    locale: tr.locale, path: `/blog/${tr.slug}`, title: tr.seo_title || tr.title,
    description: tr.seo_description || tr.excerpt || plainExcerpt(tr.content),
    availableLocales: availableLocales(post.blog_post_translations), image: publicStorageUrl("blog-images", post.featured_image_path),
    type: "article", publishedTime: post.published_at, modifiedTime: tr.updated_at
  });
}

export default async function BlogPostPage(props: PageProps<{ slug: string }>) {
  const { locale, t, params } = await pageCtx(props);
  const l = (p: string) => localePath(locale, p);
  const post = await getPostBySlug(params.slug);
  if (!post) notFound();
  const mine = translationFor(post.blog_post_translations, locale);
  // The slug exists, but only in the other language: send visitors to the translation that really exists.
  if (!mine) {
    const other = post.blog_post_translations[0];
    permanentRedirect(localePath(other.locale, `/blog/${other.slug}`));
  }
  const tr = mine;
  const img = publicStorageUrl("blog-images", post.featured_image_path);
  const cat = post.blog_categories;
  return (
    <main className="section">
      <JsonLd data={articleJsonLd({ title: tr.title, description: tr.seo_description || tr.excerpt || plainExcerpt(tr.content), path: `/blog/${tr.slug}`, locale, published: post.published_at, modified: tr.updated_at, image: img, publisher: t("site.name") })} />
      <JsonLd data={breadcrumbJsonLd([{ name: t("nav.home"), path: "/" }, { name: t("nav.blog"), path: "/blog" }, { name: tr.title }], locale)} />
      <div className="container">
        <Breadcrumbs t={t} items={[{ label: t("nav.home"), href: l("/") }, { label: t("nav.blog"), href: l("/blog") }, { label: tr.title }]} />
        <article className="prose">
          {cat && <p><Link className="badge" href={`${l("/blog")}?category=${cat.slug}`}>{t(`blog.cat.${cat.slug}`)}</Link></p>}
          <h1>{tr.title}</h1>
          <p className="muted">{formatDate(post.published_at, locale)}{tr.updated_at.slice(0, 10) !== post.published_at.slice(0, 10) ? ` · ${t("blog.updated", { date: formatDate(tr.updated_at, locale) })}` : ""}</p>
          {img && /* eslint-disable-next-line @next/next/no-img-element */ <img src={img} alt="" style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 16 }} />}
          <Markdown source={tr.content} />
          <AdSlot slot="inArticle" locale={locale} />
          <p><Link href={l("/blog")}>← {t("blog.backToAll")}</Link></p>
        </article>
      </div>
    </main>
  );
}
