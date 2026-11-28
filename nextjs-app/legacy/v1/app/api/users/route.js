import { getUsers } from "@/lib/db";
import { requireUser, publicUser, json } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const { response } = await requireUser(["admin"]);
  if (response) return response;
  return json({ users: (await getUsers()).map(publicUser) });
}
