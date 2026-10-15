// Maps database / PostgREST errors to safe, user-facing messages. Internal
// details (SQL, stack traces, constraint names) never reach the browser.

interface DbErrorLike {
  code?: string;
  message?: string;
  hint?: string | null;
  details?: string | null;
}

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

/** Messages raised deliberately by our SQL functions (errcode P0001/P0002/23514/42501) are safe to show. */
const SAFE_CODES = new Set(['P0001', 'P0002', '23514', '42501']);

export function dbErrorMessage(error: DbErrorLike | null | undefined, fallback = 'Something went wrong. Please try again.'): string {
  if (!error) return fallback;
  if (error.code === '23505') return 'That value is already in use. Please choose another.';
  if (error.code === '23503') return 'This item is referenced by other records and cannot be removed.';
  if (error.code === '22P02' || error.code === '22023') return 'Some of the submitted data is invalid.';
  if (error.code === '42501') return 'You do not have permission to do that.';
  if (error.code && SAFE_CODES.has(error.code) && error.message) return error.message;
  return fallback;
}

export function dbErrorHint(error: DbErrorLike | null | undefined): string | undefined {
  return error?.hint ?? undefined;
}

export function fail(error: string, code?: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, code, fieldErrors };
}

export function ok<T>(data: T, message?: string): ActionResult<T> {
  return { ok: true, data, message };
}

export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path.map(String).join('.');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/**
 * SQL function arguments without defaults must always be sent (PostgREST
 * matches functions by argument names), but the generated types mark them as
 * non-null. Use this to pass an explicit SQL NULL.
 */
export function sqlNull<T>(value: T | null | undefined): T {
  return (value ?? null) as T;
}
