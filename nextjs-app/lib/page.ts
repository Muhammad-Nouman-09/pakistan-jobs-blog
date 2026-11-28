import { notFound } from "next/navigation";
import { createT, type TFunction } from "@/lib/i18n";
import { isLocale, type Locale } from "@/lib/i18n/config";

export type SP = Record<string, string | string[] | undefined>;
export type PageProps<P extends Record<string, string> = Record<string, never>> = {
  params: Promise<{ locale: string } & P>;
  searchParams: Promise<SP>;
};

/** Resolves the async route props of a page into { locale, t, sp, params }. 404s on an unknown locale. */
export async function pageCtx<P extends Record<string, string> = Record<string, never>>(
  props: { params: Promise<{ locale: string } & P>; searchParams?: Promise<SP> }
): Promise<{ locale: Locale; t: TFunction; sp: SP; params: { locale: string } & P }> {
  const params = await props.params;
  if (!isLocale(params.locale)) notFound();
  const sp = props.searchParams ? await props.searchParams : {};
  return { locale: params.locale, t: createT(params.locale), sp, params };
}
