import type { TFunction } from "@/lib/i18n";

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const SAFE = /^[A-Za-z0-9_.]{1,64}$/;

/**
 * Renders the ?msg= / ?error= flash set by redirectWith(). Values are i18n KEYS, looked up (never printed
 * raw), so a crafted link cannot inject text into the page.
 */
export default function Flash({ params, t }: { params: Params; t: TFunction }) {
  const msg = first(params.msg);
  const error = first(params.error);
  const out = [];
  if (error && SAFE.test(error)) {
    const text = t(error);
    out.push(<p key="e" className="notice warn" role="alert">{text === error ? t("err.generic") : text}</p>);
  }
  if (msg && SAFE.test(msg)) {
    const text = t(msg);
    out.push(<p key="m" className="notice" role="status">{text === msg ? t("flash.ok") : text}</p>);
  }
  return <>{out}</>;
}
