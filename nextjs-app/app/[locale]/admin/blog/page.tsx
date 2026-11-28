import Link from "next/link";
import Filters, { SelectField, TextField } from "@/components/admin/Filters";
import Flash from "@/components/ui/Flash";
import Pagination from "@/components/ui/Pagination";
import { listPosts, PAGE_SIZE } from "@/lib/services/admin";
import { POST_STATUSES } from "@/lib/validation/admin";
import { formatDate, one, pageParam } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../_ctx";

export default async function AdminBlogPage(props: PageProps) {
  const { locale, t, sp, supabase, path } = await adminPage(props);
  const status = (POST_STATUSES as readonly string[]).includes(one(sp.status) ?? "") ? (one(sp.status) as string) : "";
  const q = (one(sp.q) ?? "").slice(0, 80);
  const page = pageParam(sp.page);
  const { rows, total } = await listPosts(supabase, { status, q, page });

  return (
    <>
      <Flash params={sp} t={t} />
      <p className="row-actions"><Link className="btn btn-green btn-small" href={path("/blog/new")}>{t("admin.blog.new")}</Link></p>
      <Filters action={path("/blog")} t={t}>
        <SelectField id="b-status" name="status" label={t("common.status")} value={status}
          options={[{ value: "", label: t("common.all") }, ...POST_STATUSES.map((s) => ({ value: s, label: t(`admin.blog.status.${s}`) }))]} />
        <TextField id="b-q" name="q" label={t("admin.blog.search")} value={q} />
      </Filters>
      <p className="muted">{total === 1 ? t("common.result1") : t("common.results", { count: total })}</p>
      {rows.length === 0 ? <p className="notice">{t("common.noResults")}</p> : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t("admin.blog.title")}</th><th>{t("admin.blog.languages")}</th><th>{t("admin.blog.category")}</th>
                <th>{t("common.status")}</th><th>{t("admin.blog.publishedAt")}</th><th>{t("common.updated")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const first = r.translations.find((x) => x.locale === locale) ?? r.translations[0];
                const scheduled = r.status === "published" && r.published_at && new Date(r.published_at).getTime() > Date.now();
                return (
                  <tr key={r.id}>
                    <td>
                      <Link href={path(`/blog/${r.id}`)} lang={first?.locale}>{first?.title ?? t("admin.job.untitled")}</Link>
                      {" "}<Link className="muted" href={path(`/blog/${r.id}/preview`)}>{t("action.preview")}</Link>
                    </td>
                    <td className="chips">
                      {(["en", "ur"] as const).map((l) => (
                        <span key={l} className={`badge ${r.translations.some((x) => x.locale === l) ? "" : "badge-gray"}`}>{l.toUpperCase()}</span>
                      ))}
                    </td>
                    <td>{r.category || "—"}</td>
                    <td>
                      <span className={`badge ${r.status === "published" ? "" : r.status === "draft" ? "badge-amber" : "badge-gray"}`}>{t(`admin.blog.status.${r.status}`)}</span>
                      {scheduled && <> <span className="badge badge-blue">{t("admin.blog.scheduled")}</span></>}
                    </td>
                    <td>{formatDate(r.published_at, locale)}</td>
                    <td>{formatDate(r.updated_at, locale)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} total={total} pageSize={PAGE_SIZE} basePath={path("/blog")} params={{ status, q }} t={t} />
    </>
  );
}
