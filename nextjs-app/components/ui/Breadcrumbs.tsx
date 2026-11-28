import Link from "next/link";
import type { TFunction } from "@/lib/i18n";

export type Crumb = { label: string; href?: string };

export default function Breadcrumbs({ items, t }: { items: Crumb[]; t: TFunction }) {
  return (
    <nav className="breadcrumb" aria-label={t("breadcrumb.label")}>
      <ol>
        {items.map((c, i) => (
          <li key={i} aria-current={i === items.length - 1 ? "page" : undefined}>
            {c.href && i < items.length - 1 ? <Link href={c.href}>{c.label}</Link> : c.label}
          </li>
        ))}
      </ol>
    </nav>
  );
}
