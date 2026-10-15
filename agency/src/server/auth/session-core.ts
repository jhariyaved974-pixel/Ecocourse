import { db } from "../db";
import { randomToken, sha256 } from "../crypto";
import { hashPassword, verifyPassword, dummyHash } from "./password";
import { rateLimit, clearRateLimit } from "../rate-limit";

export const SESSION_COOKIE = "agency_session";
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_IDLE_MS = 24 * 60 * 60 * 1000;

export async function createSession(userId: string, meta: { ipHash?: string | null; userAgent?: string | null }) {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.session.create({
    data: { id: sha256(token), userId, expiresAt, ipHash: meta.ipHash ?? null, userAgent: meta.userAgent?.slice(0, 200) ?? null },
  });
  return { token, expiresAt };
}

/** Validates a raw cookie token. Enforces absolute and idle expiry and that the user is still active. */
export async function validateSessionToken(token: string | undefined | null) {
  if (!token || token.length > 200) return null;
  const id = sha256(token);
  const session = await db.session.findUnique({ where: { id }, include: { user: true } });
  if (!session) return null;
  const now = Date.now();
  if (session.expiresAt.getTime() <= now || now - session.lastSeenAt.getTime() > SESSION_IDLE_MS || !session.user.active) {
    await db.session.deleteMany({ where: { id } });
    return null;
  }
  if (now - session.lastSeenAt.getTime() > 5 * 60 * 1000) {
    await db.session.update({ where: { id }, data: { lastSeenAt: new Date() } });
  }
  const { passwordHash: _omit, ...user } = session.user;
  void _omit;
  return { sessionId: id, user };
}

export async function destroySessionToken(token: string | undefined | null) {
  if (!token) return;
  await db.session.deleteMany({ where: { id: sha256(token) } });
}

export type LoginResult = { ok: true; userId: string } | { ok: false; error: string };

/** Password login with per-account and per-IP rate limiting and constant-ish timing. */
export async function attemptLogin(emailRaw: string, password: string, ipHash: string | null): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const generic = "Incorrect email or password.";
  const [byAccount, byIp] = await Promise.all([
    rateLimit(`login:acct:${sha256(email)}`, 5, 15 * 60 * 1000),
    rateLimit(`login:ip:${ipHash ?? "unknown"}`, 30, 15 * 60 * 1000),
  ]);
  if (!byAccount.ok || !byIp.ok) {
    const mins = Math.ceil(Math.max(byAccount.retryAfterSec, byIp.retryAfterSec) / 60);
    return { ok: false, error: `Too many attempts. Try again in about ${mins} minute(s).` };
  }
  const user = await db.user.findUnique({ where: { email } });
  const valid = await verifyPassword(user?.passwordHash ?? (await dummyHash()), password);
  if (!user || !valid || !user.active) return { ok: false, error: generic };
  await clearRateLimit(`login:acct:${sha256(email)}`);
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  return { ok: true, userId: user.id };
}

export async function createUser(input: { email: string; name: string; password: string; role: "OWNER" | "ADMIN" | "SALES" | "VIEWER" }) {
  return db.user.create({
    data: { email: input.email.trim().toLowerCase(), name: input.name.trim(), role: input.role, passwordHash: await hashPassword(input.password) },
  });
}
