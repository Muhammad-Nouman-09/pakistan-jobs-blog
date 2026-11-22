import { getSessionUser, publicUser, json } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  return json({ user: publicUser(await getSessionUser()) });
}
