/**
 * JWT session cookies (jose) — no NextAuth required.
 * Compatible with Supabase-hosted Postgres + Prisma User table.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import {
  AUTH_COOKIE,
  GUEST_COOKIE,
  getAuthSecret,
  getSessionCookieOptions,
  sessionMaxAgeSeconds,
} from "./config";

export type SessionPayload = {
  userId: string;
  email: string;
  name: string | null;
  role: string;
};

function secretKey() {
  const s = getAuthSecret();
  if (!s) return null;
  return new TextEncoder().encode(s);
}

export async function createSessionToken(
  payload: SessionPayload
): Promise<string | null> {
  const key = secretKey();
  if (!key) return null;
  const maxAge = sessionMaxAgeSeconds();
  return new SignJWT({
    email: payload.email,
    name: payload.name,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .sign(key);
}

export async function verifySessionToken(
  token: string
): Promise<SessionPayload | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key);
    const userId = payload.sub;
    const email = typeof payload.email === "string" ? payload.email : "";
    if (!userId || !email) return null;
    return {
      userId,
      email,
      name: typeof payload.name === "string" ? payload.name : null,
      role: typeof payload.role === "string" ? payload.role : "STUDENT",
    };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string): Promise<void> {
  const jar = await cookies();
  jar.set(AUTH_COOKIE, token, getSessionCookieOptions(sessionMaxAgeSeconds()));
  // Clear guest mode when logging in
  jar.set(GUEST_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(AUTH_COOKIE, "", {
    ...getSessionCookieOptions(0),
    maxAge: 0,
  });
}

export async function setGuestCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(GUEST_COOKIE, "1", {
    ...getSessionCookieOptions(60 * 60 * 24 * 365),
  });
}

export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(AUTH_COOKIE)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export async function isGuestMode(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(GUEST_COOKIE)?.value === "1";
}
