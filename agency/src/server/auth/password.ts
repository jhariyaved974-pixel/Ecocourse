import { hash, verify } from "@node-rs/argon2";

// argon2id with OWASP-recommended parameters (19 MiB, t=2, p=1).
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(password: string) {
  return hash(password, OPTS);
}

export async function verifyPassword(passwordHash: string, password: string) {
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

let dummy: Promise<string> | undefined;
/** A real hash verified when the email does not exist, so response timing does not reveal accounts. */
export function dummyHash() {
  dummy ??= hash("dummy-password-for-timing", OPTS);
  return dummy;
}

export function passwordProblems(pw: string): string[] {
  const p: string[] = [];
  if (pw.length < 12) p.push("at least 12 characters");
  if (!/[a-zA-Z]/.test(pw)) p.push("a letter");
  if (!/[0-9]/.test(pw)) p.push("a number");
  return p;
}
