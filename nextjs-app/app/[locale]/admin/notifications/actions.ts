"use server";
import { errorKey } from "@/lib/errors";
import { parseWith, redirectWith } from "@/lib/forms";
import { z } from "zod";
import { uuid } from "@/lib/validation/common";
import { adminAction } from "../_ctx";

/** Marks one of the admin's own notifications as read (RLS limits updates to the owner's rows and to read_at). */
export async function markReadAction(fd: FormData) {
  const { o, supabase, user, path } = await adminAction(fd, (l) => `/${l}/admin/notifications`);
  const back = path("/notifications");
  const p = parseWith(z.object({ id: uuid }), o);
  if (!p.ok) redirectWith(back, { error: p.error });
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", p.data.id).eq("user_id", user.id);
  if (error) redirectWith(back, { error: errorKey(error) });
  redirectWith(back, { msg: "common.done" });
}

export async function markAllReadAction(fd: FormData) {
  const { supabase, user, path } = await adminAction(fd, (l) => `/${l}/admin/notifications`);
  const back = path("/notifications");
  const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null);
  if (error) redirectWith(back, { error: errorKey(error) });
  redirectWith(back, { msg: "common.done" });
}
