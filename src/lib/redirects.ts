/** Only same-site relative paths are allowed as post-login destinations (no open redirects). */
export function safeNextPath(next: unknown, fallback = '/account'): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  if (/[\r\n\t]/.test(next) || next.length > 512) return fallback;
  return next;
}
