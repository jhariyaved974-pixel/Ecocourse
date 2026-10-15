import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { Role } from "@/generated/prisma/enums";
import { hashIp } from "../crypto";
import { can, hasRole, type Permission } from "./roles";
import { SESSION_COOKIE, createSession, destroySessionToken, validateSessionToken } from "./session-core";

export async function clientIpHash() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return hashIp(ip);
}

export async function startSession(userId: string) {
  const h = await headers();
  const { token, expiresAt } = await createSession(userId, { ipHash: await clientIpHash(), userAgent: h.get("user-agent") });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  await destroySessionToken(jar.get(SESSION_COOKIE)?.value);
  jar.delete(SESSION_COOKIE);
}

/** Current user for this request (memoised per render). */
export const currentUser = cache(async () => {
  const jar = await cookies();
  const session = await validateSessionToken(jar.get(SESSION_COOKIE)?.value);
  return session?.user ?? null;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

/** For pages: redirects to login when signed out. */
export async function requireUser(role: Role = "VIEWER"): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!hasRole(user.role, role)) redirect("/admin?denied=1");
  return user;
}

export class AuthError extends Error {}

/** For server actions: throws instead of redirecting so the action returns a clean error. */
export async function authorize(permission: Permission): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) throw new AuthError("Your session has expired. Please sign in again.");
  if (!can(user.role, permission)) throw new AuthError("You don't have permission to do that.");
  return user;
}
