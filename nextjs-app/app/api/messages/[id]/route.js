import { getMessages, saveMessages } from "@/lib/db";
import { requireUser, json, fail } from "@/lib/auth";

export async function PATCH(req, { params }) {
  const { response } = await requireUser(["admin"]);
  if (response) return response;
  const id = Number((await params).id);
  const msgs = await getMessages();
  const m = msgs.find((x) => x.id === id);
  if (!m) return fail("Message not found.", 404);
  m.read = !!(await req.json().catch(() => ({}))).read;
  await saveMessages(msgs);
  return json({ message: m });
}

export async function DELETE(_req, { params }) {
  const { response } = await requireUser(["admin"]);
  if (response) return response;
  const id = Number((await params).id);
  await saveMessages((await getMessages()).filter((x) => x.id !== id));
  return json({ ok: true });
}
