import Link from "next/link";
import type { TFunction } from "@/lib/i18n";

export default function Pagination({ page, total, pageSize, basePath, params = {}, t }: {
  page: number; total: number; pageSize: number; basePath: string; params?: Record<string, string | undefined>; t: TFunction;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <nav className="pagination" aria-label={t("common.page", { page, total: pages })}>
      <Link className="btn btn-outline btn-small" href={href(Math.max(1, page - 1))} aria-disabled={page <= 1} rel="prev">{t("action.previous")}</Link>
      <span className="muted">{t("common.page", { page, total: pages })}</span>
      <Link className="btn btn-outline btn-small" href={href(Math.min(pages, page + 1))} aria-disabled={page >= pages} rel="next">{t("action.next")}</Link>
    </nav>
  );
}
