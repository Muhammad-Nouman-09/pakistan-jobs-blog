import Link from "next/link";
import { notFound } from "next/navigation";
import PostForm from "@/components/admin/PostForm";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import ConfirmButton from "@/components/ui/ConfirmButton";
import Flash from "@/components/ui/Flash";
import { getPost, listBlogCategories } from "@/lib/services/admin";
import { formatDateTime } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../_ctx";
import { deletePostAction, saveBlogPostAction, setPostStatusAction } from "../actions";

export default async function AdminEditPostPage(props: PageProps<{ id: string }>) {
  const { locale, t, sp, supabase, path, params } = await adminPage(props);
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const [post, categories] = await Promise.all([getPost(supabase, params.id), listBlogCategories(supabase)]);
  if (!post) notFound();
  const translations: any[] = post.blog_post_translations ?? [];
  const heading = translations.find((x) => x.locale === locale) ?? translations[0];
  const scheduled = post.status === "published" && post.published_at && new Date(post.published_at).getTime() > Date.now();
  const hidden = (<><input type="hidden" name="locale" value={locale} /><input type="hidden" name="post" value={post.id} /></>);

  return (
    <>
      <Breadcrumbs t={t} items={[{ label: t("admin.tab.blog"), href: path("/blog") }, { label: heading?.title ?? t("admin.blog.edit") }]} />
      <Flash params={sp} t={t} />

      <section className="panel" aria-labelledby="workflow">
        <h2 id="workflow">{t("admin.blog.workflow")}</h2>
        <p>
          <span className={`badge ${post.status === "published" ? "" : post.status === "draft" ? "badge-amber" : "badge-gray"}`}>{t(`admin.blog.status.${post.status}`)}</span>
          {scheduled && <> <span className="badge badge-blue">{t("admin.blog.scheduledFor", { date: formatDateTime(post.published_at, locale) })}</span></>}
          {post.status === "published" && !scheduled && <span className="muted"> {t("admin.blog.publishedOn", { date: formatDateTime(post.published_at, locale) })}</span>}
        </p>
        <p className="muted">{t("admin.blog.languagesExist", { langs: translations.map((x) => String(x.locale).toUpperCase()).join(", ") || "—" })}</p>
        <div className="row-actions">
          <Link className="btn btn-outline btn-small" href={path(`/blog/${post.id}/preview`)}>{t("action.preview")}</Link>
          {post.status !== "published" && (
            <form action={setPostStatusAction} className="inline-form">
              {hidden}<input type="hidden" name="status" value="published" />
              <div>
                <label htmlFor="publish-date">{t("admin.blog.scheduleDate")}</label>
                <input id="publish-date" name="publish_date" type="date" />
              </div>
              <ConfirmButton className="btn btn-green btn-small" message={t("admin.blog.confirmPublish")}>{t("admin.blog.publish")}</ConfirmButton>
            </form>
          )}
          {post.status === "published" && (
            <form action={setPostStatusAction}>{hidden}<input type="hidden" name="status" value="draft" />
              <ConfirmButton className="btn btn-outline btn-small" message={t("admin.blog.confirmUnpublish")}>{t("admin.blog.unpublish")}</ConfirmButton></form>
          )}
          {post.status !== "archived" && (
            <form action={setPostStatusAction}>{hidden}<input type="hidden" name="status" value="archived" />
              <ConfirmButton className="btn btn-outline btn-small" message={t("admin.blog.confirmArchive")}>{t("admin.blog.archive")}</ConfirmButton></form>
          )}
          {post.status === "archived" && (
            <form action={setPostStatusAction}>{hidden}<input type="hidden" name="status" value="draft" />
              <button className="btn btn-outline btn-small" type="submit">{t("admin.blog.restore")}</button></form>
          )}
        </div>
        {post.status !== "published" && <p className="muted">{t("admin.blog.scheduleHelp")}</p>}
      </section>

      <PostForm t={t} locale={locale} action={saveBlogPostAction} post={post} categories={categories} />

      <section className="panel" aria-labelledby="danger">
        <h2 id="danger">{t("admin.blog.danger")}</h2>
        <form action={deletePostAction}>
          {hidden}
          <ConfirmButton className="btn btn-danger btn-small" message={t("admin.blog.confirmDelete")}>{t("admin.blog.delete")}</ConfirmButton>
        </form>
      </section>
    </>
  );
}
