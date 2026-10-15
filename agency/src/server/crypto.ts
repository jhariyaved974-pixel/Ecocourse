import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const sha256 = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
export const sha1 = (data: string | Buffer) => createHash("sha1").update(data).digest("hex");

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

/** Unguessable lowercase slug for preview URLs (~80 bits). */
export function randomSlug(len = 16) {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const buf = randomBytes(len);
  return Array.from(buf, (b) => alphabet[b % alphabet.length]).join("");
}

export function hmacSha256Hex(secret: string, payload: string | Buffer) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/** Constant-time comparison of two hex/ascii strings. */
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export function hashIp(ip: string | null | undefined) {
  if (!ip) return null;
  return sha256(`${process.env.SESSION_SECRET ?? ""}:${ip}`).slice(0, 32);
}
