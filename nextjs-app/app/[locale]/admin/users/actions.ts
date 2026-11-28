"use server";
import { errorKey } from "@/lib/errors";
import { parseWith, redirectWith } from "@/lib/forms";
import { userStatusSchema } from "@/lib/validation/admin";
import { adminAction } from "../_ctx";

/** Suspend / reactivate through set_user_status(): the database refuses admins and the caller's own account. */
export async function setUserStatusAction(fd: FormData) {
  const { o, supabase, path } = await adminAction(fd, (l) => `/${l}/admin/users`);
  const q = typeof o.back === "string" ? o.back.replace(/[^\w=&%.+@-]/g, "").slice(0, 200) : "";
  const back = q ? `${path("/users")}?${q}` : path("/users");
  const p = parseWith(userStatusSchema, o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.rpc("set_user_status", { p_user: p.data.user, p_status: p.data.status });
  if (error) redirectWith(back, { error: errorKey(error) });
  redirectWith(back, { msg: p.data.status === "suspended" ? "admin.msg.userSuspended" : "admin.msg.userReactivated" });
}
