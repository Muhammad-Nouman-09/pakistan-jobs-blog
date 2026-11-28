"use server";
import { revalidatePath } from "next/cache";
import { redirectWith } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import { adminAction, adminPath, uuidOrNull } from "../_ctx";

/** Mark a contact message read/unread, or delete it. Admin only (RLS: contact_messages has no other policy). */
export async function messageAction(fd: FormData) {
  const { o, locale, supabase } = await adminAction(fd, (l) => adminPath(l, "/messages"));
  const back = adminPath(locale, "/messages");
  const id = uuidOrNull(o.id);
  if (!id) redirectWith(back, { error: "err.invalid" });
  const op = String(o.op);
  const { error } = op === "delete"
    ? await supabase.from("contact_messages").delete().eq("id", id)
    : await supabase.from("contact_messages").update({ read_at: op === "unread" ? null : new Date().toISOString() }).eq("id", id);
  if (error) redirectWith(back, { error: errorKey(error) });
  revalidatePath(back);
  redirectWith(back, { msg: "common.done" });
}
