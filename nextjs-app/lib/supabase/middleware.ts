import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/env";

/** Refreshes the Supabase session cookies. Skipped entirely when the visitor has no auth cookie. */
export async function refreshSession(request: NextRequest, response: NextResponse): Promise<NextResponse> {
  const cfg = supabaseConfig();
  if (!cfg) return response;
  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
  if (!hasAuthCookie) return response;

  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(list) {
        for (const { name, value, options } of list) {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        }
      }
    }
  });
  await supabase.auth.getUser(); // validates the JWT with the auth server and rotates tokens when needed
  return response;
}
