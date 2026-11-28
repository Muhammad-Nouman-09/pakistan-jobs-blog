import PostForm from "@/components/admin/PostForm";
import Breadcrumbs from "@/components/ui/Breadcrumbs";
import Flash from "@/components/ui/Flash";
import { listBlogCategories } from "@/lib/services/admin";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../../_ctx";
import { saveBlogPostAction } from "../actions";

export default async function AdminNewPostPage(props: PageProps) {
  const { locale, t, sp, supabase, path } = await adminPage(props);
  const categories = await listBlogCategories(supabase);
  return (
    <>
      <Breadcrumbs t={t} items={[{ label: t("admin.tab.blog"), href: path("/blog") }, { label: t("admin.blog.new") }]} />
      <Flash params={sp} t={t} />
      <p className="muted">{t("admin.blog.draftNote")}</p>
      <PostForm t={t} locale={locale} action={saveBlogPostAction} categories={categories} />
    </>
  );
}
