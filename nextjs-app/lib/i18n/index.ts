import type { Locale } from "./config";
import { DEFAULT_LOCALE } from "./config";
import { modules } from "./messages";

export type Messages = Record<string, string>;
export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

const cache = new Map<Locale, Messages>();

/** Merges every message module for a locale. Missing Urdu keys are simply absent (see createT fallback). */
export function getMessages(locale: Locale): Messages {
  const hit = cache.get(locale);
  if (hit) return hit;
  const merged: Messages = Object.assign({}, ...modules.map((mod) => mod[locale] ?? {}));
  cache.set(locale, merged);
  return merged;
}

export const missingKeys = new Set<string>();

/**
 * Translator with an explicit missing-translation policy: a key missing in the requested locale falls back
 * to ENGLISH (never to a machine translation) and is recorded in `missingKeys` (warned in development).
 * `{name}` placeholders are interpolated.
 */
export function createT(locale: Locale): TFunction {
  const own = getMessages(locale);
  const fallback = locale === DEFAULT_LOCALE ? own : getMessages(DEFAULT_LOCALE);
  return (key, vars) => {
    let s = own[key];
    if (s === undefined) {
      s = fallback[key];
      if (locale !== DEFAULT_LOCALE) {
        if (!missingKeys.has(`${locale}:${key}`)) {
          missingKeys.add(`${locale}:${key}`);
          if (process.env.NODE_ENV === "development") console.warn(`[i18n] missing ${locale} translation: ${key}`);
        }
      }
    }
    if (s === undefined) return key;
    return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
  };
}

/** Keys present in English but absent in `locale` (used by tests and the translation-coverage report). */
export function missingTranslations(locale: Locale): string[] {
  const en = getMessages("en");
  const other = getMessages(locale);
  return Object.keys(en).filter((k) => !(k in other));
}
