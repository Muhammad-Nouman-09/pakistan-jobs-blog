"use client";
import { usePathname } from "next/navigation";
import DashTabs, { type TabItem } from "@/components/ui/DashTabs";

export type AdminTabItem = { href: string; label: string; badge?: number; exact?: boolean };

/** Section navigation that highlights the current page (needs the pathname, hence a client component). */
export default function AdminTabs({ items, label }: { items: AdminTabItem[]; label: string }) {
  const pathname = usePathname() ?? "";
  const tabs: TabItem[] = items.map((i) => ({
    href: i.href,
    label: i.label,
    badge: i.badge,
    active: i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)
  }));
  return <DashTabs items={tabs} label={label} />;
}
