"use client";
import { usePathname } from "next/navigation";
import DashTabs, { type TabItem } from "@/components/ui/DashTabs";

/** Marks the current section in <DashTabs/>: a layout cannot know the active URL, so this reads it on the client. */
export default function CandidateTabs({ items, label }: { items: Omit<TabItem, "active">[]; label: string }) {
  const pathname = usePathname() ?? "";
  const root = items[0]?.href;
  const active = (href: string) => (href === root ? pathname === href || pathname === `${href}/` : pathname === href || pathname.startsWith(`${href}/`));
  return <DashTabs label={label} items={items.map((i) => ({ ...i, active: active(i.href) }))} />;
}
