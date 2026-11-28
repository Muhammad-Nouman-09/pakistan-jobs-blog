import Flash from "@/components/ui/Flash";
import ConfirmButton from "@/components/ui/ConfirmButton";
import { type PageProps } from "@/lib/page";
import { formatDateTime } from "@/lib/utils";
import { adminPage } from "../_ctx";
import { messageAction } from "./actions";

export default async function AdminMessagesPage(props: PageProps) {
  const { locale, t, sp, supabase } = await adminPage(props);
  const { data } = await supabase.from("contact_messages").select("id,name,email,subject,message,read_at,created_at").order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  const btn = (id: string, op: string, label: string, danger = false) => (
    <form action={messageAction} style={{ display: "inline" }}>
      <input type="hidden" name="locale" value={locale} /><input type="hidden" name="id" value={id} /><input type="hidden" name="op" value={op} />
      {danger
        ? <ConfirmButton className="btn btn-small btn-danger" message={t("action.confirm")}>{label}</ConfirmButton>
        : <button className="btn btn-small btn-outline" type="submit">{label}</button>}
    </form>
  );
  return (
    <>
      <h2>{t("admin.messages.title")}</h2>
      <Flash params={sp} t={t} />
      {!rows.length ? <p className="notice">{t("admin.messages.empty")}</p> : rows.map((m) => (
        <div key={m.id} className={`msg${m.read_at ? "" : " unread"}`}>
          <b dir="auto">{m.subject}</b> <span className="badge">{m.read_at ? t("admin.messages.read") : t("admin.messages.unread")}</span><br />
          <span className="muted">{t("admin.messages.from")}: {m.name} &lt;<span className="ltr">{m.email}</span>&gt; · {formatDateTime(m.created_at, locale)}</span>
          <p style={{ whiteSpace: "pre-line" }} dir="auto">{m.message}</p>
          <div className="row-actions">
            <a className="btn btn-small btn-dark" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`}>{t("admin.messages.reply")}</a>
            {m.read_at ? btn(m.id, "unread", t("admin.messages.markUnread")) : btn(m.id, "read", t("action.markRead"))}
            {btn(m.id, "delete", t("action.delete"), true)}
          </div>
        </div>
      ))}
    </>
  );
}
