import { getUsers, saveUsers, getJobs, saveJobs } from "@/lib/db";
import { requireUser, publicUser, json, fail } from "@/lib/auth";

async function target(params, me) {
  const id = Number((await params).id);
  const users = await getUsers();
  const u = users.find((x) => x.id === id);
  if (!u) return { error: fail("User not found.", 404) };
  if (u.role === "admin" || u.id === me.id) return { error: fail("Admin accounts cannot be changed here.", 403) };
  return { users, u };
}

// PATCH { status: "active" | "suspended" } — verify, suspend, reactivate.
export async function PATCH(req, { params }) {
  const { user, response } = await requireUser(["admin"]);
  if (response) return response;
  const { users, u, error } = await target(params, user);
  if (error) return error;
  const { status } = await req.json().catch(() => ({}));
  if (!["active", "suspended"].includes(status)) return fail("Invalid status.");
  u.status = status;
  await saveUsers(users);
  return json({ user: publicUser(u) });
}

export async function DELETE(_req, { params }) {
  const { user, response } = await requireUser(["admin"]);
  if (response) return response;
  const { users, u, error } = await target(params, user);
  if (error) return error;
  await saveUsers(users.filter((x) => x.id !== u.id));
  // Their jobs stay live but become unassigned.
  const jobs = await getJobs();
  jobs.forEach((j) => { if (j.employerId === u.id) j.employerId = null; });
  await saveJobs(jobs);
  return json({ ok: true });
}
