"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { parseWith, redirectWith } from "@/lib/forms";
import { errorKey } from "@/lib/errors";
import type { Locale } from "@/lib/i18n/config";
import { LIMITS } from "@/lib/security/rate-limit";
import { safeFileName, validateUpload } from "@/lib/security/files";
import { PUBLIC_TAG } from "@/lib/supabase/anon";
import { companySchema, docDeleteSchema, docUploadSchema, MAX_COMPANY_DOCS, uuidOrEmpty } from "@/lib/validation/company";
import { beginAction, employerPath, myRole } from "../ctx";

const listPath = (l: Locale) => employerPath(l, "/companies");
const companyPath = (l: Locale, o: Record<string, any>) => {
  const id = uuidOrEmpty(o.company_id);
  return id ? employerPath(l, `/companies/${id}`) : listPath(l);
};

/** Creates a company through the create_company() function: the caller becomes its owner, status "pending". */
export async function createCompanyAction(fd: FormData) {
  const c = await beginAction(fd, "company-create", (_o, l) => employerPath(l, "/companies/new"));
  const p = parseWith(companySchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const v = p.data;
  const { data: id, error } = await c.supabase.rpc("create_company", {
    p_name: v.name, p_description: v.description, p_industry: v.industry ?? "", p_website: v.website ?? "", p_email: v.email ?? "",
    p_phone: v.phone ?? "", p_country: v.country, p_city: v.city ?? "", p_address: v.address ?? "", p_size: v.size ?? ""
  });
  if (error || !id) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(listPath(c.locale));
  redirectWith(employerPath(c.locale, `/companies/${id}`), { msg: "employer.companyCreated" });
}

/** Owners edit the descriptive fields. Verification state / slug cannot be changed here (database guard). */
export async function updateCompanyAction(fd: FormData) {
  const c = await beginAction(fd, "company-update", (o, l) => companyPath(l, o));
  const id = uuidOrEmpty(c.o.company_id);
  if (!id) redirectWith(listPath(c.locale), { error: "err.company_not_found" });
  if ((await myRole(c.supabase, id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });
  const p = parseWith(companySchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const v = p.data;

  const { data: updated, error } = await c.supabase.from("companies").update({
    name: v.name, description: v.description, industry: v.industry ?? null, website: v.website ?? null,
    country: v.country, city: v.city ?? null, size: v.size ?? null
  }).eq("id", id).select("id");
  if (error || !updated?.length) redirectWith(c.back, { error: error ? errorKey(error) : "err.forbidden" });

  const priv = { email: v.email ?? null, phone: v.phone ?? null, address: v.address ?? null };
  const { data: privUpdated, error: privError } = await c.supabase.from("company_private").update(priv).eq("company_id", id).select("company_id");
  if (privError) redirectWith(c.back, { error: errorKey(privError) });
  if (!privUpdated?.length) {
    const { error: insertError } = await c.supabase.from("company_private").insert({ company_id: id, ...priv });
    if (insertError) redirectWith(c.back, { error: errorKey(insertError) });
  }
  revalidateTag(PUBLIC_TAG);
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "common.saved" });
}

/** Logo: validated (size, type, magic bytes), stored under {companyId}/{uuid}.{ext}; the previous file is removed. */
export async function uploadLogoAction(fd: FormData) {
  const c = await beginAction(fd, "company-logo", (o, l) => companyPath(l, o), LIMITS.upload);
  const id = uuidOrEmpty(c.o.company_id);
  if (!id) redirectWith(listPath(c.locale), { error: "err.company_not_found" });
  if ((await myRole(c.supabase, id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });
  const check = await validateUpload(fd.get("logo") as File | null, "logo");
  if (!check.ok) redirectWith(c.back, { error: `err.${check.error}` });

  const { data: before } = await c.supabase.from("companies").select("logo_path").eq("id", id).maybeSingle();
  const oldPath = (before as { logo_path: string | null } | null)?.logo_path ?? null;
  const path = `${id}/${randomUUID()}.${check.ext}`;
  const up = await c.supabase.storage.from("company-logos").upload(path, check.bytes, { contentType: check.mime, upsert: false });
  if (up.error) redirectWith(c.back, { error: "err.generic" });

  const { data: updated, error } = await c.supabase.from("companies").update({ logo_path: path }).eq("id", id).select("id");
  if (error || !updated?.length) {
    await c.supabase.storage.from("company-logos").remove([path]);
    redirectWith(c.back, { error: error ? errorKey(error) : "err.forbidden" });
  }
  if (oldPath && oldPath !== path) await c.supabase.storage.from("company-logos").remove([oldPath]);
  revalidateTag(PUBLIC_TAG);
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.logoSaved" });
}

/** Removes the current logo. */
export async function removeLogoAction(fd: FormData) {
  const c = await beginAction(fd, "company-logo", (o, l) => companyPath(l, o), LIMITS.upload);
  const id = uuidOrEmpty(c.o.company_id);
  if (!id) redirectWith(listPath(c.locale), { error: "err.company_not_found" });
  if ((await myRole(c.supabase, id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });
  const { data: before } = await c.supabase.from("companies").select("logo_path").eq("id", id).maybeSingle();
  const oldPath = (before as { logo_path: string | null } | null)?.logo_path ?? null;
  const { error } = await c.supabase.from("companies").update({ logo_path: null }).eq("id", id);
  if (error) redirectWith(c.back, { error: errorKey(error) });
  if (oldPath) await c.supabase.storage.from("company-logos").remove([oldPath]);
  revalidateTag(PUBLIC_TAG);
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.logoRemoved" });
}

/** Verification documents (private bucket). Up to MAX_COMPANY_DOCS per company; each file is validated. */
export async function uploadDocumentsAction(fd: FormData) {
  const c = await beginAction(fd, "company-docs", (o, l) => companyPath(l, o), LIMITS.upload);
  const p = parseWith(docUploadSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const id = p.data.company_id;
  if ((await myRole(c.supabase, id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });

  const files = fd.getAll("files").filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (!files.length) redirectWith(c.back, { error: "err.file_missing" });
  const { count } = await c.supabase.from("company_verification_documents").select("id", { count: "exact", head: true }).eq("company_id", id);
  if ((count ?? 0) + files.length > MAX_COMPANY_DOCS) redirectWith(c.back, { error: "employer.err.docLimit" });

  // Validate everything first so a bad file does not leave a half-finished upload behind.
  const checked = [];
  for (const file of files) {
    const check = await validateUpload(file, "document");
    if (!check.ok) redirectWith(c.back, { error: `err.${check.error}` });
    checked.push({ check, name: safeFileName(file.name) });
  }
  for (const { check, name } of checked) {
    const path = `${id}/${randomUUID()}.${check.ext}`;
    const up = await c.supabase.storage.from("company-documents").upload(path, check.bytes, { contentType: check.mime, upsert: false });
    if (up.error) redirectWith(c.back, { error: "err.generic" });
    const { error } = await c.supabase.from("company_verification_documents")
      .insert({ company_id: id, uploaded_by: c.user.id, storage_path: path, file_name: name, doc_type: p.data.doc_type });
    if (error) {
      await c.supabase.storage.from("company-documents").remove([path]);
      redirectWith(c.back, { error: errorKey(error) });
    }
  }
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.docsUploaded" });
}

export async function deleteDocumentAction(fd: FormData) {
  const c = await beginAction(fd, "company-docs", (o, l) => companyPath(l, o), LIMITS.upload);
  const p = parseWith(docDeleteSchema, c.o);
  if (!p.ok) redirectWith(c.back, { error: p.error });
  const { company_id: id, doc_id: docId } = p.data;
  if ((await myRole(c.supabase, id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });
  const { data: doc } = await c.supabase.from("company_verification_documents").select("storage_path").eq("id", docId).eq("company_id", id).maybeSingle();
  if (!doc) redirectWith(c.back, { error: "err.invalid" });
  const { error } = await c.supabase.from("company_verification_documents").delete().eq("id", docId).eq("company_id", id);
  if (error) redirectWith(c.back, { error: errorKey(error) });
  await c.supabase.storage.from("company-documents").remove([(doc as { storage_path: string }).storage_path]);
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "common.deleted" });
}

/** A rejected company asks for another review (owner only; checked again by the database function). */
export async function resubmitVerificationAction(fd: FormData) {
  const c = await beginAction(fd, "company-resubmit", (o, l) => companyPath(l, o));
  const id = uuidOrEmpty(c.o.company_id);
  if (!id) redirectWith(listPath(c.locale), { error: "err.company_not_found" });
  if ((await myRole(c.supabase, id, c.user.id)) !== "owner") redirectWith(c.back, { error: "err.forbidden" });
  const { error } = await c.supabase.rpc("resubmit_company_verification", { p_company: id });
  if (error) redirectWith(c.back, { error: errorKey(error) });
  revalidatePath(c.back);
  redirectWith(c.back, { msg: "employer.resubmitted" });
}
