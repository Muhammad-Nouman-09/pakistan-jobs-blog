import "server-only";

/**
 * Optional transactional e-mail via Resend's REST API (no SDK dependency). Returns true when the provider
 * accepted the message, false when e-mail is not configured or the call failed — callers must then show the
 * link to the user so nothing depends on e-mail delivery being set up.
 */
export async function sendEmail(opts: { to: string; subject: string; text: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return false;
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, text: opts.text })
    });
    return res.ok;
  } catch {
    return false;
  }
}
