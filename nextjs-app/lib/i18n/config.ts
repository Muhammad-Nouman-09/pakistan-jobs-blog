export const LOCALES = ["en", "ur"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);
export const dirOf = (l: Locale): "ltr" | "rtl" => (l === "ur" ? "rtl" : "ltr");
export const langName: Record<Locale, string> = { en: "English", ur: "اردو" };
export const otherLocale = (l: Locale): Locale => (l === "en" ? "ur" : "en");

/** Prefix an internal path with the locale: localePath("ur", "/jobs") -> "/ur/jobs". */
export function localePath(locale: Locale, path = "/"): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p === "/" ? `/${locale}` : `/${locale}${p}`;
}

/** Strip a leading /en or /ur from a pathname. */
export function stripLocale(pathname: string): string {
  const m = pathname.match(/^\/(en|ur)(\/.*)?$/);
  return m ? m[2] || "/" : pathname;
}
