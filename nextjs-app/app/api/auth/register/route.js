import bcrypt from "bcryptjs";
import { getUsers, saveUsers, blankProfile } from "@/lib/db";
import { createSession, publicUser, json, fail } from "@/lib/auth";

export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim().slice(0, 100);
  const email = String(b.email || "").trim().toLowerCase().slice(0, 200);
  const password = String(b.password || "");
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return fail("Enter your name and a valid email.");
  if (password.length < 6) return fail("Password must be at least 6 characters.");
  const users = await getUsers();
  if (users.some((u) => u.email === email)) return fail("An account with that email already exists.", 409);
  const employer = b.role === "employer"; // admin can never be self-registered
  const user = {
    ...blankProfile, id: Math.max(0, ...users.map((u) => u.id)) + 1, name, email,
    role: employer ? "employer" : "seeker",
    status: employer ? "pending" : "active", // employers wait for admin verification
    passwordHash: await bcrypt.hash(password, 10)
  };
  users.push(user);
  await saveUsers(users);
  await createSession(user.id);
  return json({ user: publicUser(user) }, 201);
}
