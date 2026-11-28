import Link from "next/link";
import { notFound } from "next/navigation";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Markdown from "@/components/ui/Markdown";
import { getPost } from "@/lib/services/admin";
import { one, formatDateTime, publicStorageUrl } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../../_ctx";

export default async function AdminPostPreviewPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, supabase, path, params } = await adminPage(props);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const post = await getPost(supabase, params.id);
  if (!post) notFound();
  const translations: any[] = post.blog_post_translations ?? [];
  const want = one(sp.lang);
  const tr = translations.find((x) => x.locale === want) ?? translations.find((x) => x.locale === locale) ?? translations[0];
  if (!tr) notFound();
  const image = publicStorageUrl("blog-images", post.featured_image_path);
  const rtl = tr.locale === "ur";

  return (
    <>
      <Breadcrumbs t={t} items={[{ label: t("admin.tab.blog"), href: path("/blog") }, { label: t("admin.blog.previewTitle") }]} />
      <p className="notice">{t("admin.blog.previewNote", { status: t(`admin.blog.status.${post.status}`) })}</p>
      <p className="row-actions">
        {translations.map((x) => (
          <Link key={x.locale} className="btn btn-outline btn-small" href={`${path(`/blog/${post.id}/preview`)}?lang=${x.locale}`}>{t(`lang.${x.locale}`)}</Link>
        ))}
        <Link className="btn btn-outline btn-small" href={path(`/blog/${post.id}`)}>{t("admin.blog.edit")}</Link>
      </p>
      <article className="page" lang={tr.locale} dir={rtl ? "rtl" : "ltr"}>
        <h1>{tr.title}</h1>
        <p className="muted">{formatDateTime(post.published_at ?? post.created_at, locale)}</p>
        {image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" style={{ maxWidth: "100%", height: "auto", borderRadius: 12 }} />
        )}
        {tr.excerpt && <p><b>{tr.excerpt}</b></p>}
        <Markdown source={tr.content ?? ""} />
      </article>
    </>
  );
}
