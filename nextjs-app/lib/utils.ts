import type { Locale } from "@/lib/i18n/config";

/** ASCII URL slug. Non-latin text (e.g. Urdu) yields "" — callers supply a fallback. */
export function slugify(text: string, max = 80): string {
  return (text || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** Pakistan-time calendar date (YYYY-MM-DD) — job deadlines are inclusive in PKT, not UTC. */
export function todayPK(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Karachi", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Whole days from today (PKT) to a YYYY-MM-DD deadline; negative once closed. null for no deadline. */
export function daysLeft(deadline: string | null | undefined, now = new Date()): number | null {
  if (!deadline) return null;
  const a = Date.parse(`${todayPK(now)}T00:00:00Z`);
  const b = Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

export function formatDate(value: string | null | undefined, locale: Locale = "en"): string {
  if (!value) return "—";
  const d = new Date(value.length <= 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Karachi" }).format(d);
}

export function formatDateTime(value: string | null | undefined, locale: Locale = "en"): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale === "ur" ? "ur-PK" : "en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(d);
}

export function formatNumber(n: number, locale: Locale = "en"): string {
  return new Intl.NumberFormat(locale === "ur" ? "ur-PK" : "en-GB").format(n);
}

export function formatSalary(
  min: number | null, max: number | null, currency = "PKR", period = "month", locale: Locale = "en"
): string {
  if (min == null && max == null) return "";
  const n = (v: number) => formatNumber(Number(v), locale);
  const range = min != null && max != null && Number(min) !== Number(max) ? `${n(min)} – ${n(max)}` : n((max ?? min) as number);
  return `${currency} ${range} / ${period}`;
}

export function initials(name: string): string {
  const words = String(name || "").replace(/[^A-Za-z ]/g, "").split(/\s+/).filter(Boolean);
  return (words.slice(0, 2).map((w) => w[0]).join("") || "PJ").toUpperCase();
}

export const isWebUrl = (u: unknown) => /^https?:\/\/[^\s]+$/i.test(String(u || "").trim());

/** Paging helper: clamps a ?page= param. */
export function pageParam(v: string | string[] | undefined, max = 1000): number {
  const n = parseInt(Array.isArray(v) ? v[0] : v ?? "1", 10);
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), max) : 1;
}

/** First value of a possibly-repeated search param. */
export const one = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** Extracts the numeric reference from a slug like "sales-executive-lahore-123" -> 123. */
export function refFromSlug(slug: string): number | null {
  const m = slug.match(/-(\d{1,12})$/);
  return m ? Number(m[1]) : /^\d{1,12}$/.test(slug) ? Number(slug) : null;
}

/** Public URL of a file in a PUBLIC storage bucket. */
export function publicStorageUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return base ? `${base}/storage/v1/object/public/${bucket}/${path}` : null;
}
