import { getUsers, saveUsers } from "@/lib/db";
import { getSessionUser, publicUser, json, fail } from "@/lib/auth";

const FIELDS = ["name", "headline", "summary", "education", "experience", "skills", "languages",
  "city", "province", "phone", "companyName", "companyAbout", "website"];

export async function PATCH(req) {
  const me = await getSessionUser();
  if (!me) return fail("Please sign in.", 401);
  const b = await req.json().catch(() => ({}));
  const users = await getUsers();
  const i = users.findIndex((u) => u.id === me.id);
  const patch = {};
  for (const f of FIELDS) if (typeof b[f] === "string") patch[f] = b[f].trim().slice(0, 4000);
  if (patch.name === "") return fail("Name is required.");
  users[i] = { ...users[i], ...patch };
  await saveUsers(users);
  return json({ user: publicUser(users[i]) });
}
