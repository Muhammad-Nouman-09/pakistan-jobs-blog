import { redirect } from "next/navigation";
import type { z } from "zod";

/**
 * FormData -> plain object. Supports bracket/dot paths for repeatable rows:
 *   education[0].degree=BSc  -> { education: [{ degree: "BSc" }] }
 * File entries are skipped (read them with fd.get(name) as File). Prototype-polluting keys are dropped.
 */
export function formToObject(fd: FormData): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [rawKey, value] of fd.entries()) {
    if (typeof value !== "string") continue;
    if (rawKey.startsWith("$ACTION")) continue;   // Next server-action bookkeeping fields
    const parts = rawKey.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
    if (parts.some((p) => p === "__proto__" || p === "constructor" || p === "prototype")) continue;
    let node: any = out;
    parts.forEach((p, i) => {
      const last = i === parts.length - 1;
      const nextIsIndex = !last && /^\d+$/.test(parts[i + 1]);
      if (last) {
        if (Array.isArray(node) ? false : p in node && typeof node[p] === "string") {
          node[p] = [node[p], value];
        } else node[p] = value;
      } else {
        node[p] ??= nextIsIndex ? [] : {};
        node = node[p];
      }
    });
  }
  return out;
}

export type Parsed<T> = { ok: true; data: T } | { ok: false; error: string };

/** Zod parse returning an i18n message key (schemas use keys like "v.required" as messages). */
export function parseWith<S extends z.ZodTypeAny>(schema: S, input: unknown): Parsed<z.infer<S>> {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  const msg = r.error.issues[0]?.message;
  return { ok: false, error: typeof msg === "string" && msg.startsWith("v.") ? msg : "v.invalid" };
}

/** Redirect back with a flash message in the query string (rendered by <Flash/>). Never returns. */
export function redirectWith(path: string, flash: { msg?: string; error?: string }): never {
  const u = new URL(path, "http://x");
  u.searchParams.delete("msg");
  u.searchParams.delete("error");
  if (flash.msg) u.searchParams.set("msg", flash.msg);
  if (flash.error) u.searchParams.set("error", flash.error);
  redirect(u.pathname + u.search);
}

/** Only same-site relative paths are accepted for ?next= redirects (prevents open redirects). */
export function safeNext(next: string | undefined | null, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.includes("\\") || /[\r\n]/.test(next)) return fallback;
  return next;
}
