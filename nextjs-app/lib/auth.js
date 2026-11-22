import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getUsers } from "@/lib/db";

const COOKIE = "pjb_session";

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET is not set");
    return new TextEncoder().encode("dev-only-insecure-secret");
  }
  return new TextEncoder().encode(s);
}

export async function createSession(userId) {
  const token = await new SignJWT({ uid: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 60 * 60 * 24 * 7
  });
}
export async function destroySession() { (await cookies()).delete(COOKIE); }

export async function getSessionUser() {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const user = (await getUsers()).find((u) => u.id === payload.uid);
    return user && user.status !== "suspended" ? user : null;
  } catch { return null; }
}

export function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...rest } = u; // eslint-disable-line no-unused-vars
  return rest;
}

export const json = (data, status = 200) => NextResponse.json(data, { status });
export const fail = (error, status = 400) => NextResponse.json({ error }, { status });

// Returns { user } or { response }. roles e.g. ["admin"] or ["admin","employer"].
// Pending employers are always refused.
export async function requireUser(roles) {
  const user = await getSessionUser();
  if (!user) return { response: fail("Please sign in.", 401) };
  if (roles && !roles.includes(user.role)) return { response: fail("Not allowed.", 403) };
  if (user.role === "employer" && user.status !== "active") {
    return { response: fail("Your employer account is pending verification.", 403) };
  }
  return { user };
}
