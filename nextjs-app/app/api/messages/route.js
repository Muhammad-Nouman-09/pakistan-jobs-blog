import { getMessages, saveMessages } from "@/lib/db";
import { requireUser, json, fail } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Public: anyone can send a contact message.
export async function POST(req) {
  const b = await req.json().catch(() => ({}));
  const m = {
    name: String(b.name || "").trim().slice(0, 100),
    email: String(b.email || "").trim().slice(0, 200),
    subject: String(b.subject || "").trim().slice(0, 200),
    message: String(b.message || "").trim().slice(0, 5000)
  };
  if (!m.name || !/^\S+@\S+\.\S+$/.test(m.email) || !m.subject || !m.message) {
    return fail("Please fill in all fields with a valid email.");
  }
  const msgs = await getMessages();
  msgs.unshift({ id: Date.now(), ...m, createdAt: new Date().toISOString().slice(0, 10), read: false });
  await saveMessages(msgs.slice(0, 500));
  return json({ ok: true }, 201);
}

export async function GET() {
  const { response } = await requireUser(["admin"]);
  if (response) return response;
  return json({ messages: await getMessages() });
}
