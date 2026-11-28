"use server";
import { revalidatePath } from "next/cache";
import { parseWith, redirectWith } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import { notificationIdSchema } from "@/lib/validation/company";
import { beginAction, employerPath } from "../ctx";

const back = (_o: Record<string, any>, l: Parameters<typeof employerPath>[0]) => employerPath(l, "/notifications");

/** Only `read_at` is writable by users (column-level grant); rows are limited to the caller's own. */
export async function markNotificationReadAction(fd: FormData) {
  const c = await beginAction(fd, "notif-read", back);
  const p = parseWith(notificationIdSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const { error } = await c.supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("id", p.data.notification_id).eq("user_id", c.user.id).is("read_at", null);
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, {});
}

export async function markAllNotificationsReadAction(fd: FormData) {
  const c = await beginAction(fd, "notif-read", back);
  const { error } = await c.supabase.from("notifications").update({ read_at: new Date().toISOString() })
    .eq("user_id", c.user.id).is("read_at", null);
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.notif.allRead" });
}
