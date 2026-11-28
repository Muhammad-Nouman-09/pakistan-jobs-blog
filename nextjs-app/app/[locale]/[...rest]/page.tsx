import { notFound } from "next/navigation";

// Any unmatched path under /en or /ur renders the localized 404 page (app/[locale]/not-found.tsx).
export default function CatchAll() {
  notFound();
}
