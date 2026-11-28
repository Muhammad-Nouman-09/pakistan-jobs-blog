"use client";
import { useParams } from "next/navigation";
import { createT } from "@/lib/i18n";

/** Loading state (never an empty state). Reads the locale from the URL so Urdu pages show Urdu. */
export default function LoadingNotice({ messageKey }: { messageKey: "jobs.loading" }) {
  const params = useParams<{ locale?: string }>();
  const t = createT(params?.locale === "ur" ? "ur" : "en");
  return <p className="muted" role="status" aria-live="polite">{t(messageKey)}</p>;
}
