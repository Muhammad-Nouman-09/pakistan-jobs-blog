import { PGlite } from "@electric-sql/pglite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

const ROOT = path.resolve(__dirname, "..", "..");

export type Db = PGlite;

/** Fresh in-memory Postgres with the Supabase stub + every real migration applied in order. */
export async function createDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(fs.readFileSync(path.join(__dirname, "supabase-stub.sql"), "utf8"));
  const dir = path.join(ROOT, "supabase", "migrations");
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    try {
      await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`migration ${f} failed: ${(e as Error).message}`);
    }
  }
  return db;
}

export type Actor = { id: string; email: string };

/** Creates an auth user (the real trigger creates the profile). Runs as the superuser. */
export async function createUser(
  db: Db,
  email: string,
  opts: { role?: "employer" | "job_seeker" | "admin" | string; confirmed?: boolean; name?: string } = {}
): Promise<Actor> {
  const id = randomUUID();
  const meta: Record<string, unknown> = { full_name: opts.name ?? email.split("@")[0] };
  // Anything the client might put in sign-up metadata, including a malicious "admin".
  if (opts.role) meta.role = opts.role;
  await db.query(
    "insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values ($1,$2,$3,$4)",
    [id, email, opts.confirmed === false ? null : new Date().toISOString(), JSON.stringify(meta)]
  );
  return { id, email };
}

export async function makeAdmin(db: Db, email: string) {
  // Same path as scripts/provision-admin.ts: service role only.
  await db.exec("set role service_role");
  try {
    await db.query("select public.provision_admin($1)", [email]);
  } finally {
    await db.exec("reset role");
  }
}

type Who = Actor | null | "service";

/** Run one statement as an `authenticated` user (JWT sub = id), `anon` (null) or `service_role`. */
export async function run<T = Record<string, unknown>>(db: Db, who: Who, sql: string, params: unknown[] = []) {
  if (who === "service") await db.exec("set role service_role");
  else if (who === null) await db.exec("set role anon");
  else await db.exec("set role authenticated");
  try {
    const claims = who === null || who === "service" ? "" : JSON.stringify({ sub: who.id, role: "authenticated" });
    await db.query("select set_config('request.jwt.claims', $1, false)", [claims]);
    return (await db.query<T>(sql, params)).rows;
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claims', '', false)");
  }
}

/** Expect a statement to fail; returns the error message. Throws if it succeeds. */
export async function denied(db: Db, who: Who, sql: string, params: unknown[] = []): Promise<string> {
  try {
    await run(db, who, sql, params);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`expected failure but statement succeeded: ${sql}`);
}

export const sup = <T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []) => db.query<T>(sql, params).then((r) => r.rows);
