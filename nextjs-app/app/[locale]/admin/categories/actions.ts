"use server";
import { revalidateTag } from "next/cache";
import { errorKey } from "@/lib/errors";
import { parseWith, redirectWith } from "@/lib/forms";
import { categoryDeleteSchema, categorySchema } from "@/lib/validation/admin";
import { categoryJobCount } from "@/lib/services/admin";
import { adminAction } from "../_ctx";

export async function saveCategoryAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, (l) => `/${l}/admin/categories`);
  const back = path("/categories");
  const p = parseWith(categorySchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const row = { slug: p.data.slug, name_en: p.data.name_en, name_ur: p.data.name_ur ?? null, sort_order: p.data.sort_order, is_active: p.data.is_active };
  const res = p.data.id
    ? await supabase.from("job_categories").update(row).eq("id", p.data.id).select("id")
    : await supabase.from("job_categories").insert(row).select("id");
  if (res.error) redirectWith(back, { error: errorKey(res.error) });
  if (!res.data?.length) redirectWith(back, { error: "err.forbidden" });
  revalidateTag("public-data");
  redirectWith(back, { msg: "common.saved" });
}

/** Refuses to delete a category that still has jobs (the FK would silently un-categorize them). */
export async function deleteCategoryAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, (l) => `/${l}/admin/categories`);
  const back = path("/categories");
  const p = parseWith(categoryDeleteSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  if ((await categoryJobCount(supabase, p.data.id)) > 0) redirectWith(back, { error: "err.in_use" });
  const { error } = await supabase.from("job_categories").delete().eq("id", p.data.id);
  if (error) redirectWith(back, { error: errorKey(error) });
  revalidateTag("public-data");
  redirectWith(back, { msg: "common.deleted" });
}
