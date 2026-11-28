"use server";
import { revalidatePath } from "next/cache";
import { parseWith, redirectWith } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import type { Locale } from "@/lib/i18n/config";
import { canRecruit, loadApplication } from "@/lib/services/employer";
import { applicationStatusSchema, noteDeleteSchema, noteSchema, uuidOrEmpty } from "@/lib/validation/company";
import { beginAction, employerPath, myRole } from "../ctx";

const detailPath = (l: Locale, o: Record<string, any>) => {
  const id = uuidOrEmpty(o.application_id);
  return id ? employerPath(l, `/applications/${id}`) : employerPath(l, "/applications");
};

/** Back to the list the user came from, keeping only whitelisted, sanitized filter values. */
function backPath(o: Record<string, any>, l: Locale) {
  if (o.from !== "list") return detailPath(l, o);
  const src = new URLSearchParams(typeof o.ret === "string" ? o.ret.slice(0, 300) : "");
  const keep = new URLSearchParams();
  for (const k of ["job", "status", "company", "page"]) {
    const v = src.get(k);
    if (v && /^[A-Za-z0-9_-]{1,40}$/.test(v)) keep.set(k, v);
  }
  const qs = keep.toString();
  return employerPath(l, `/applications${qs ? `?${qs}` : ""}`);
}

/** Moves an application to viewed / shortlisted / interview / selected / rejected (owners and recruiters). */
export async function setApplicationStatusAction(fd: FormData) {
  const c = await beginAction(fd, "app-status", backPath);
  const p = parseWith(applicationStatusSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const app = await loadApplication(c.supabase, p.data.application_id);
  if (!app) redirectWith(c.back, { error: "err.application_not_found" });
  if (!canRecruit(await myRole(c.supabase, app.company_id, c.user.id))) redirectWith(c.back, { error: "err.forbidden" });
  const { error } = await c.supabase.rpc("set_application_status", { p_app: app.id, p_status: p.data.status });
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(employerPath(c.locale, "/applications"));
  redirectWith(c.back, { msg: "employer.app.statusSaved" });
}

/** Internal note (never visible to the candidate). company_id is taken from the application, not the form. */
export async function addNoteAction(fd: FormData) {
  const c = await beginAction(fd, "app-note", (o, l) => detailPath(l, { ...o, from: "detail" }));
  const p = parseWith(noteSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const app = await loadApplication(c.supabase, p.data.application_id);
  if (!app) redirectWith(c.back, { error: "err.application_not_found" });
  if (!canRecruit(await myRole(c.supabase, app.company_id, c.user.id))) redirectWith(c.back, { error: "err.forbidden" });
  const { error } = await c.supabase.from("application_notes")
    .insert({ application_id: app.id, company_id: app.company_id, author_id: c.user.id, note: p.data.note });
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.app.noteAdded" });
}

/** Authors can delete their own notes (the RLS policy also requires author_id = the caller). */
export async function deleteNoteAction(fd: FormData) {
  const c = await beginAction(fd, "app-note", (o, l) => detailPath(l, { ...o, from: "detail" }));
  const p = parseWith(noteDeleteSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const { error } = await c.supabase.from("application_notes").delete()
    .eq("id", p.data.note_id).eq("application_id", p.data.application_id).eq("author_id", c.user.id);
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "common.deleted" });
}
