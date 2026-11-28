"use client";
import { useActionState, useRef, useState } from "react";

export interface InviteState { error?: string; link?: string; emailed?: boolean; email?: string }

export interface InviteLabels {
  email: string; role: string; submit: string; roles: { value: string; label: string }[];
  emailedNote: string; linkNote: string; copy: string; copied: string; linkLabel: string;
}

/**
 * Create-invitation form. The server action returns the accept link in its RESULT (never in a URL), so the
 * raw token is shown once on this page and is not stored anywhere (only its hash is in the database).
 */
export default function InviteForm({ action, locale, company, labels, defaultEmail = "" }: {
  action: (prev: InviteState, fd: FormData) => Promise<InviteState>;
  locale: string; company: string; labels: InviteLabels; defaultEmail?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [copied, setCopied] = useState(false);
  const linkRef = useRef<HTMLInputElement>(null);

  async function copy() {
    if (!state.link) return;
    try {
      await navigator.clipboard.writeText(state.link);
      setCopied(true);
    } catch {
      linkRef.current?.select();
    }
  }

  return (
    <div>
      <form action={formAction} className="inline-form" onSubmit={() => setCopied(false)}>
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="company" value={company} />
        <div>
          <label htmlFor="inv-email">{labels.email}</label>
          <input id="inv-email" name="email" type="email" required defaultValue={defaultEmail} autoComplete="off" />
        </div>
        <div>
          <label htmlFor="inv-role">{labels.role}</label>
          <select id="inv-role" name="role" defaultValue="recruiter">
            {labels.roles.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>
        <button className="btn btn-dark btn-small" type="submit" disabled={pending}>{labels.submit}</button>
      </form>
      {state.error && <p className="notice warn" role="alert">{state.error}</p>}
      {state.email && !state.error && (
        <div className="notice" role="status">
          <p>{state.emailed ? labels.emailedNote : labels.linkNote}</p>
          {state.link && (
            <p>
              <label htmlFor="inv-link">{labels.linkLabel}</label>
              <input id="inv-link" ref={linkRef} className="ltr" readOnly value={state.link} onFocus={(e) => e.currentTarget.select()} />
              <button className="btn btn-outline btn-small" type="button" onClick={copy}>{copied ? labels.copied : labels.copy}</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
