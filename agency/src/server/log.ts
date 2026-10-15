/**
 * Structured JSON logger. Redacts secrets and masks personal data so logs never contain
 * tokens, full phone numbers, emails or message bodies.
 */
type Level = "debug" | "info" | "warn" | "error";
const SECRET_KEYS = /token|secret|password|authorization|api[-_]?key|cookie|signature/i;
const PII_KEYS = /phone|wa_?id|email|body|text|content|name/i;

export function maskPhone(v: string) {
  const digits = v.replace(/\D/g, "");
  return digits.length > 4 ? `***${digits.slice(-4)}` : "***";
}

function scrub(value: unknown, key = "", depth = 0): unknown {
  if (depth > 5) return "[depth]";
  if (SECRET_KEYS.test(key)) return "[redacted]";
  if (typeof value === "string") {
    if (PII_KEYS.test(key)) return /phone|wa_?id/i.test(key) ? maskPhone(value) : `[${value.length} chars]`;
    return value.length > 500 ? `${value.slice(0, 500)}…` : value;
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, key, depth + 1));
  if (value instanceof Error) return { name: value.name, message: value.message };
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v, k, depth + 1)]));
  }
  return value;
}

function write(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (level === "debug" && process.env.LOG_LEVEL !== "debug") return;
  if (process.env.NODE_ENV === "test" && process.env.LOG_IN_TESTS !== "1" && level !== "error") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...(fields ? (scrub(fields) as object) : {}) });
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => write("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => write("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => write("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => write("error", msg, f),
};

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
