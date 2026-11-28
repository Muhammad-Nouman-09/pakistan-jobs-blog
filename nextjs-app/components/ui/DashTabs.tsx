import Link from "next/link";

export type TabItem = { href: string; label: string; active?: boolean; badge?: number };

/** Dashboard section navigation, built from the existing .admin-tabs pill style. */
export default function DashTabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav className="admin-tabs" aria-label={label}>
      {items.map((i) => (
        <Link key={i.href} href={i.href} className={i.active ? "active" : undefined} aria-current={i.active ? "page" : undefined}>
          {i.label}{i.badge ? ` (${i.badge})` : ""}
        </Link>
      ))}
    </nav>
  );
}
