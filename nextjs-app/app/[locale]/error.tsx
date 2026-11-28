"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createT } from "@/lib/i18n";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = (usePathname() ?? "").startsWith("/ur") ? "ur" : "en";
  const t = createT(locale);
  useEffect(() => { console.error(error); }, [error]);
  return (
    <main className="page">
      <h1>{t("error.title")}</h1>
      <p>{t("error.text")}</p>
      {error.digest && <p className="muted">ref: <span className="ltr">{error.digest}</span></p>}
      <p><button className="btn btn-dark" onClick={reset}>{t("error.retry")}</button></p>
    </main>
  );
}
