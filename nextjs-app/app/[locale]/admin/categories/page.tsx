import Flash from "@/components/ui/Flash";
import ConfirmButton from "@/components/ui/ConfirmButton";
import { listCategories } from "@/lib/services/admin";
import { formatNumber } from "@/lib/utils";
import { type PageProps } from "@/lib/page";
import { adminPage } from "../_ctx";
import { deleteCategoryAction, saveCategoryAction } from "./actions";

export default async function AdminCategoriesPage(props: PageProps) {
  const { locale, t, sp, supabase } = await adminPage(props);
  const categories = await listCategories(supabase);

  return (
    <>
      <Flash params={sp} t={t} />
      <p className="muted">{t("admin.cat.help")}</p>

      <section className="panel" aria-labelledby="cat-new">
        <h2 id="cat-new">{t("admin.cat.new")}</h2>
        <form action={saveCategoryAction}>
          <input type="hidden" name="locale" value={locale} />
          <div className="grid-2">
            <div><label htmlFor="new-slug">{t("admin.cat.slug")} *</label><input id="new-slug" name="slug" required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" className="ltr" dir="ltr" /></div>
            <div><label htmlFor="new-order">{t("admin.cat.sort")}</label><input id="new-order" name="sort_order" type="number" min={0} max={100000} defaultValue={100} /></div>
            <div><label htmlFor="new-en">{t("admin.cat.nameEn")} *</label><input id="new-en" name="name_en" required minLength={2} maxLength={120} /></div>
            <div><label htmlFor="new-ur">{t("admin.cat.nameUr")}</label><input id="new-ur" name="name_ur" maxLength={120} lang="ur" dir="rtl" /></div>
          </div>
          <label><input type="checkbox" name="is_active" defaultChecked /> {t("admin.cat.active")}</label>
          <p><button className="btn btn-dark btn-small" type="submit">{t("action.create")}</button></p>
        </form>
      </section>

      {categories.length === 0 ? <p className="notice">{t("common.noResults")}</p> : categories.map((c) => (
        <section className="panel" key={c.id} aria-label={c.name_en}>
          <form action={saveCategoryAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={c.id} />
            <div className="grid-2">
              <div><label htmlFor={`slug-${c.id}`}>{t("admin.cat.slug")}</label><input id={`slug-${c.id}`} name="slug" required maxLength={60} pattern="[a-z0-9]+(-[a-z0-9]+)*" defaultValue={c.slug} className="ltr" dir="ltr" /></div>
              <div><label htmlFor={`order-${c.id}`}>{t("admin.cat.sort")}</label><input id={`order-${c.id}`} name="sort_order" type="number" min={0} max={100000} defaultValue={c.sort_order} /></div>
              <div><label htmlFor={`en-${c.id}`}>{t("admin.cat.nameEn")}</label><input id={`en-${c.id}`} name="name_en" required minLength={2} maxLength={120} defaultValue={c.name_en} /></div>
              <div><label htmlFor={`ur-${c.id}`}>{t("admin.cat.nameUr")}</label><input id={`ur-${c.id}`} name="name_ur" maxLength={120} defaultValue={c.name_ur ?? ""} lang="ur" dir="rtl" /></div>
            </div>
            <label><input type="checkbox" name="is_active" defaultChecked={c.is_active} /> {t("admin.cat.active")}</label>
            <p className="row-actions">
              <button className="btn btn-dark btn-small" type="submit">{t("action.save")}</button>
              <span className="muted">{t("admin.cat.jobCount", { count: formatNumber(c.jobs, locale) })}</span>
              <ConfirmButton className="btn btn-danger btn-small" form={`del-${c.id}`} message={t("admin.cat.confirmDelete")} disabled={c.jobs > 0} title={c.jobs > 0 ? t("admin.cat.inUse") : undefined}>
                {t("action.delete")}
              </ConfirmButton>
            </p>
          </form>
          <form id={`del-${c.id}`} action={deleteCategoryAction}>
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="id" value={c.id} />
          </form>
        </section>
      ))}
    </>
  );
}
