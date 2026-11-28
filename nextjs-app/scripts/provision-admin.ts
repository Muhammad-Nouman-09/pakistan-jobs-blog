/**
 * Secure admin provisioning — the ONLY way to create a Super Admin.
 * Public registration can never produce an admin (the sign-up trigger whitelists employer / job_seeker and
 * the profiles guard blocks role changes from every browser/API client). This script uses the service-role
 * key, which exists only on your machine / CI, never in the browser bundle.
 *
 *   ADMIN_EMAIL=you@example.com npm run admin:provision
 *
 * If the account does not exist yet it is created (e-mail pre-confirmed) and a password-reset e-mail is
 * requested so you choose the password yourself — no password is ever passed on the command line.
 * Requires NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in the env.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase();

if (!url || !anon || !service) throw new Error("Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.");
if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error("Set ADMIN_EMAIL to a valid e-mail address.");

const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });

async function main() {
  const { data: existing } = await admin.from("profiles").select("id,role").ilike("email", email).maybeSingle();
  if (!existing) {
    const { error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: "Site Administrator" } });
    if (error) throw new Error(`Could not create the user: ${error.message}`);
    const mail = await createClient(url!, anon!, { auth: { persistSession: false } }).auth.resetPasswordForEmail(email, {
      redirectTo: `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "")}/auth/callback?next=/en/auth/reset`
    });
    console.log(mail.error ? `User created. Could not send the password e-mail (${mail.error.message}); use "Forgot password" on the site.` : "User created and a password-set e-mail was sent.");
  } else if (existing.role === "admin") {
    console.log("Already an administrator. Nothing to do.");
    return;
  }
  const { data, error } = await admin.rpc("provision_admin", { p_email: email });
  if (error) throw new Error(`provision_admin failed: ${error.message}`);
  console.log(`Done: ${email} is now a Super Admin (profile ${data}). The action was written to the audit log.`);
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
