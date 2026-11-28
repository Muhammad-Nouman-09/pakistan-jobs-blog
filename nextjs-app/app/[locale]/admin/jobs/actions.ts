"use server";
import { revalidateTag } from "next/cache";
import { errorKey } from "@/lib/errors";
import { parseWith, redirectWith } from "@/lib/forms";
import { featuredSchema, reviewJobSchema } from "@/lib/validation/admin";
import { adminAction, uuidOrNull } from "../_ctx";

const MESSAGES: Record<string, string> = {
  approve: "admin.msg.jobApproved", reject: "admin.msg.jobRejected", request_changes: "admin.msg.jobChangesRequested", unpublish: "admin.msg.jobUnpublished"
};

/** Moderation. Every transition goes through review_job(); the admin gets no direct write to jobs.status. */
export async function reviewJobAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, (l) => `/${l}/admin/jobs`);
  const id = uuidOrNull(o.job);
  const back = id ? path(`/jobs/${id}`) : path("/jobs");
  const p = parseWith(reviewJobSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.rpc("review_job", { p_job: p.data.job, p_action: p.data.action, p_reason: p.data.reason || null });
  if (error) redirectWith(back, { error: errorKey(error) });
  if (p.data.action === "approve" || p.data.action === "unpublish") revalidateTag("public-data");
  redirectWith(back, { msg: MESSAGES[p.data.action] });
}

export async function featureJobAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, (l) => `/${l}/admin/jobs`);
  const id = uuidOrNull(o.job);
  const back = id ? path(`/jobs/${id}`) : path("/jobs");
  const p = parseWith(featuredSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.rpc("set_job_featured", { p_job: p.data.job, p_featured: p.data.featured });
  if (error) redirectWith(back, { error: errorKey(error) });
  revalidateTag("public-data");
  redirectWith(back, { msg: p.data.featured ? "admin.msg.jobFeatured" : "admin.msg.jobUnfeatured" });
}
