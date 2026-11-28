"use server";
import { revalidatePath } from "next/cache";
import { parseWith, redirectWith } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import { LIMITS } from "@/lib/security/rate-limit";
import { employerPasswordSchema, employerSettingsSchema } from "@/lib/validation/company";
import { beginAction, employerPath } from "../ctx";

const back = (_o: Record<string, any>, l: Parameters<typeof employerPath>[0]) => employerPath(l, "/settings");

/** Updates the user's own harmless profile fields (the column-level grant allows nothing else). */
export async function saveProfileAction(fd: FormData) {
  const c = await beginAction(fd, "settings-profile", back);
  const p = parseWith(employerSettingsSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const v = p.data;
  const { error } = await c.supabase.from("profiles").update({
    full_name: v.full_name, phone: v.phone ?? null, city: v.city ?? null, province: v.province ?? null, preferred_locale: v.preferred_locale
  }).eq("id", c.user.id);
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "common.saved" });
}

/** Password change: the current password is verified first, then Supabase Auth updates it. */
export async function changePasswordAction(fd: FormData) {
  const c = await beginAction(fd, "settings-password", back, LIMITS.passwordReset);
  const p = parseWith(employerPasswordSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  if (!c.user.email) redirectWith(c.back, { error: "err.generic" });
  const check = await c.supabase.auth.signInWithPassword({ email: c.user.email, password: p.data.current_password });
  if (check.error) redirectWith(c.back, { error: "err.invalid_credentials" });
  const { error } = await c.supabase.auth.updateUser({ password: p.data.password });
  if (error) redirectWith(c.back, { error: "err.generic" });
  redirectWith(c.back, { msg: "employer.passwordChanged" });
}
