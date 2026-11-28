import type { TFunction } from "@/lib/i18n";
import { publicStorageUrl } from "@/lib/utils";

interface Translation {
  locale: string; slug: string; title: string; excerpt: string; content: string; seo_title: string | null; seo_description: string | null;
}

/** Blog post editor: category, featured image and one section per language (en / ur). Languages are independent. */
export default function PostForm({ t, locale, action, post, categories }: {
  t: TFunction; locale: string; action: (fd: FormData) => Promise<void>;
  post?: { id: string; category_id: string | null; featured_image_path: string | null; blog_post_translations: Translation[] };
  categories: { id: string; name_en: string; name_ur: string | null }[];
}) {
  const tr = (l: string) => post?.blog_post_translations.find((x) => x.locale === l);
  const imageUrl = publicStorageUrl("blog-images", post?.featured_image_path);
  return (
    <form action={action} encType="multipart/form-data">
      <input type="hidden" name="locale" value={locale} />
      {post && <input type="hidden" name="id" value={post.id} />}

      <div className="panel">
        <div className="grid-2">
          <div>
            <label htmlFor="post-category">{t("admin.blog.category")}</label>
            <select id="post-category" name="category" defaultValue={post?.category_id ?? ""}>
              <option value="">{t("common.none")}</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{locale === "ur" ? c.name_ur || c.name_en : c.name_en}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="post-image">{t("admin.blog.image")}</label>
            <input id="post-image" name="image" type="file" accept="image/png,image/jpeg,image/webp" />
            <span className="muted">{t("admin.blog.imageHelp")}</span>
          </div>
        </div>
        {imageUrl && (
          <p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt="" width={160} style={{ maxWidth: "100%", height: "auto", borderRadius: 8 }} />
            <br />
            <label><input type="checkbox" name="remove_image" /> {t("admin.blog.removeImage")}</label>
          </p>
        )}
        <p className="muted">{t("admin.blog.markdownHelp")}</p>
        <p className="muted">{t("admin.blog.languagesHelp")}</p>
      </div>

      {(["en", "ur"] as const).map((l) => {
        const v = tr(l);
        const rtl = l === "ur";
        return (
          <div className="panel" key={l} lang={l} dir={rtl ? "rtl" : "ltr"}>
            <h2>{t(`lang.${l}`)}{v && <span className="badge badge-gray" style={{ marginInlineStart: 8 }}>{t("admin.blog.exists")}</span>}</h2>
            <label htmlFor={`${l}-title`}>{t("admin.blog.title")}{l === "en" ? " *" : ""}</label>
            <input id={`${l}-title`} name={`${l}.title`} maxLength={200} defaultValue={v?.title ?? ""} />
            <label htmlFor={`${l}-slug`}>{t("admin.blog.slug")}</label>
            <input id={`${l}-slug`} name={`${l}.slug`} maxLength={120} className="ltr" dir="ltr" pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={v?.slug ?? ""} aria-describedby={`${l}-slug-help`} />
            <span id={`${l}-slug-help`} className="muted">{t(rtl ? "admin.blog.slugHelpUr" : "admin.blog.slugHelp")}</span>
            <label htmlFor={`${l}-excerpt`}>{t("admin.blog.excerpt")}</label>
            <textarea id={`${l}-excerpt`} name={`${l}.excerpt`} maxLength={500} style={{ minHeight: 70 }} defaultValue={v?.excerpt ?? ""} />
            <label htmlFor={`${l}-content`}>{t("admin.blog.content")}</label>
            <textarea id={`${l}-content`} name={`${l}.content`} maxLength={100000} style={{ minHeight: 280 }} defaultValue={v?.content ?? ""} />
            <div className="grid-2">
              <div>
                <label htmlFor={`${l}-seo-title`}>{t("admin.blog.seoTitle")}</label>
                <input id={`${l}-seo-title`} name={`${l}.seo_title`} maxLength={70} defaultValue={v?.seo_title ?? ""} />
              </div>
              <div>
                <label htmlFor={`${l}-seo-desc`}>{t("admin.blog.seoDescription")}</label>
                <input id={`${l}-seo-desc`} name={`${l}.seo_description`} maxLength={170} defaultValue={v?.seo_description ?? ""} />
              </div>
            </div>
            {v && <label><input type="checkbox" name={`${l}.remove`} /> {t("admin.blog.removeLanguage")}</label>}
          </div>
        );
      })}
      <p><button className="btn btn-dark" type="submit">{post ? t("action.saveChanges") : t("action.create")}</button></p>
    </form>
  );
}
