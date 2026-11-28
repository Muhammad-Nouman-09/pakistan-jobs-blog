import bcrypt from "bcryptjs";
import { getUsers } from "@/lib/db";
import { createSession, publicUser, json, fail } from "@/lib/auth";

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const email = String(b.email || "").trim().toLowerCase();
  const u = (await getUsers()).find((x) => x.email === email);
  // Same message for unknown email and wrong password.
  if (!u || !(await bcrypt.compare(String(b.password || ""), u.passwordHash))) {
    return fail("Wrong email or password.", 401);
  }
  if (u.status === "suspended") return fail("This account is suspended. Contact the admin.", 403);
  await createSession(u.id);
  return json({ user: publicUser(u) });
}
