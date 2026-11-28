"use client";
import { usePathname } from "next/navigation";
import DashTabs from "@/components/ui/DashTabs";
import { localePath, stripLocale, type Locale } from "@/lib/i18n/config";

export type EmployerTab = { path: string; label: string; badge?: number };

/** Dashboard tabs with the current section highlighted (the longest matching path wins). */
export default function EmployerTabs({ locale, tabs, label }: { locale: Locale; tabs: EmployerTab[]; label: string }) {
  const current = stripLocale(usePathname() || "/");
  const matches = tabs.filter((t) => current === t.path || current.startsWith(`${t.path}/`));
  const best = matches.sort((a, b) => b.path.length - a.path.length)[0]?.path;
  return (
    <DashTabs
      label={label}
      items={tabs.map((t) => ({ href: localePath(locale, t.path), label: t.label, badge: t.badge, active: t.path === best }))}
    />
  );
}
