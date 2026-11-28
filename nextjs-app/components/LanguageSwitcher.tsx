"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { langName, otherLocale, stripLocale, type Locale } from "@/lib/i18n/config";

/** Same page, other language. `hrefLang`/`lang` help search engines and screen readers. */
export default function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname() || "/";
  const sp = useSearchParams();
  const other = otherLocale(locale);
  const q = sp.toString();
  const href = `/${other}${stripLocale(pathname) === "/" ? "" : stripLocale(pathname)}${q ? `?${q}` : ""}`;
  return (
    <span className="lang-switch">
      <Link href={href} hrefLang={other} lang={other} aria-label={`${label}: ${langName[other]}`} onClick={() => { document.cookie = `NEXT_LOCALE=${other}; path=/; max-age=31536000; samesite=lax`; }}>
        {langName[other]}
      </Link>
    </span>
  );
}
