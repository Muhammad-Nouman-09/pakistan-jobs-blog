"use server";
import { randomUUID } from "node:crypto";
import { revalidateTag } from "next/cache";
import { errorKey } from "@/lib/errors";
import { parseWith, redirectWith } from "@/lib/forms";
import { LIMITS, rateLimit } from "@/lib/security/rate-limit";
import { validateUpload } from "@/lib/security/files";
import {
  blogPostSchema, blogTranslationSchema, POST_LOCALES, postDeleteSchema, postStatusSchema, publishDateToIso, resolvePostSlug
} from "@/lib/validation/admin";
import { adminAction, uuidOrNull } from "../_ctx";

const BUCKET = "blog-images";
type Row = Record<string, string | null>;

/** Create or update a post with its en / ur translations. Never translates anything automatically. */
export async function saveBlogPostAction(fd: FormData) {
  const { o, supabase, user, path } = await adminAction(fd, (l) => `/${l}/admin/blog`);
  const existingId = uuidOrNull(o.id);
  const back = existingId ? path(`/blog/${existingId}`) : path("/blog/new");
  const p = parseWith(blogPostSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });

  // 1. translations from the form
  const upserts: Row[] = [];
  const removals: string[] = [];
  for (const l of POST_LOCALES) {
    const raw = (o[l] ?? {}) as Record<string, string>;
    if (raw.remove === "on") { removals.push(l); continue; }
    const title = String(raw.title ?? "").trim();
    if (!title) {
      if (["slug", "excerpt", "content", "seo_title", "seo_description"].some((k) => String(raw[k] ?? "").trim())) {
        redirectWith(back, { error: "v.title_required" });
      }
      continue;
    }
    const tr = parseWith(blogTranslationSchema, { ...raw, title });
    if (!tr.ok) redirectWith(back, { error: tr.error });
    const slug = resolvePostSlug(l, tr.data.title, tr.data.slug);
    if (!slug.ok) redirectWith(back, { error: slug.error });
    upserts.push({
      locale: l, slug: slug.slug, title: tr.data.title, excerpt: tr.data.excerpt, content: tr.data.content,
      seo_title: tr.data.seo_title || null, seo_description: tr.data.seo_description || null
    });
  }

  // 2. at least one language must remain
  let remaining = upserts.length;
  if (existingId) {
    const { data } = await supabase.from("blog_post_translations").select("locale").eq("post_id", existingId);
    const have = (data ?? []).map((r: any) => r.locale as string).filter((l) => !removals.includes(l));
    remaining = new Set([...have, ...upserts.map((u) => u.locale as string)]).size;
  }
  if (remaining === 0) redirectWith(back, { error: "v.title_required" });

  // 3. optional featured image
  const file = fd.get("image");
  let newImage: string | null = null;
  if (file instanceof File && file.size > 0) {
    if (!(await rateLimit("admin-upload", { ...LIMITS.upload, identifier: user.id }))) redirectWith(back, { error: "err.rate_limited" });
    const check = await validateUpload(file, "blogImage");
    if (!check.ok) redirectWith(back, { error: `err.${check.error}` });
    const objectPath = `${randomUUID()}.${check.ext}`;
    const up = await supabase.storage.from(BUCKET).upload(objectPath, check.bytes, { contentType: check.mime, upsert: false });
    if (up.error) redirectWith(back, { error: errorKey(up.error) });
    newImage = objectPath;
  }
  const dropNewImage = async () => { if (newImage) await supabase.storage.from(BUCKET).remove([newImage]); };

  let postId = existingId;
  let oldImage: string | null = null;
  if (existingId) {
    const { data: cur } = await supabase.from("blog_posts").select("featured_image_path").eq("id", existingId).maybeSingle();
    if (!cur) { await dropNewImage(); redirectWith(path("/blog"), { error: "err.generic" }); }
    oldImage = cur.featured_image_path as string | null;
    const patch: Record<string, unknown> = { category_id: p.data.category ?? null };
    if (newImage) patch.featured_image_path = newImage;
    else if (o.remove_image === "on") patch.featured_image_path = null;
    const { error } = await supabase.from("blog_posts").update(patch).eq("id", existingId);
    if (error) { await dropNewImage(); redirectWith(back, { error: errorKey(error) }); }
  } else {
    const { data, error } = await supabase.from("blog_posts")
      .insert({ category_id: p.data.category ?? null, author_id: user.id, status: "draft", featured_image_path: newImage })
      .select("id").single();
    if (error || !data) { await dropNewImage(); redirectWith(back, { error: errorKey(error) }); }
    postId = data.id as string;
  }

  if (upserts.length) {
    const { error } = await supabase.from("blog_post_translations")
      .upsert(upserts.map((u) => ({ ...u, post_id: postId })), { onConflict: "post_id,locale" });
    if (error) {
      if (!existingId) { await supabase.from("blog_posts").delete().eq("id", postId); await dropNewImage(); }
      redirectWith(back, { error: errorKey(error) });
    }
  }
  if (existingId && removals.length) {
    const { error } = await supabase.from("blog_post_translations").delete().eq("post_id", existingId).in("locale", removals);
    if (error) redirectWith(back, { error: errorKey(error) });
  }
  const replaced = existingId && oldImage && (newImage || o.remove_image === "on");
  if (replaced && oldImage) await supabase.storage.from(BUCKET).remove([oldImage]);

  revalidateTag("public-data");
  redirectWith(path(`/blog/${postId}`), { msg: existingId ? "common.saved" : "admin.msg.postCreated" });
}

/** draft -> published (optionally scheduled) -> archived. Published posts need real content in every language. */
export async function setPostStatusAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, (l) => `/${l}/admin/blog`);
  const id = uuidOrNull(o.post);
  const back = id ? path(`/blog/${id}`) : path("/blog");
  const p = parseWith(postStatusSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { data: post } = await supabase.from("blog_posts").select("status,published_at,blog_post_translations(content)").eq("id", p.data.post).maybeSingle();
  if (!post) redirectWith(path("/blog"), { error: "err.generic" });

  const patch: Record<string, unknown> = { status: p.data.status };
  if (p.data.status === "published") {
    const translations = (post.blog_post_translations ?? []) as { content: string }[];
    if (!translations.length || translations.some((x) => (x.content ?? "").trim().length < 30)) redirectWith(back, { error: "admin.err.postContent" });
    patch.published_at = p.data.publish_date ? publishDateToIso(p.data.publish_date) : post.published_at ?? new Date().toISOString();
  }
  const { error } = await supabase.from("blog_posts").update(patch).eq("id", p.data.post);
  if (error) redirectWith(back, { error: errorKey(error) });
  revalidateTag("public-data");
  redirectWith(back, { msg: `admin.msg.post_${p.data.status}` });
}

export async function deletePostAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, (l) => `/${l}/admin/blog`);
  const p = parseWith(postDeleteSchema, o);
  if (!p.ok) redirectWith(path("/blog"), { error: p.error });
  const { data: post } = await supabase.from("blog_posts").select("featured_image_path").eq("id", p.data.post).maybeSingle();
  const { error } = await supabase.from("blog_posts").delete().eq("id", p.data.post);
  if (error) redirectWith(path(`/blog/${p.data.post}`), { error: errorKey(error) });
  if (post?.featured_image_path) await supabase.storage.from(BUCKET).remove([post.featured_image_path as string]);
  revalidateTag("public-data");
  redirectWith(path("/blog"), { msg: "common.deleted" });
}
