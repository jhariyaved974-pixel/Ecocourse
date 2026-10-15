import 'server-only';
import { AuthorizationError, requireStaffAction, type StaffRole, type StaffSession } from '@/lib/auth';
import { dbErrorMessage, fail, type ActionResult } from '@/lib/errors';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * Wraps an admin Server Action: verifies the staff session and role (MFA
 * included) before running, gives the handler a Supabase client bound to the
 * staff member's session (so RLS and the SQL role checks apply), and turns
 * authorization/database failures into safe ActionResults.
 *
 *   export async function saveThing(input: unknown) {
 *     return staffAction(ROLE_GROUPS.catalog, async ({ supabase }) => { ... return ok(data) })
 *   }
 */
export async function staffAction<T>(
  roles: readonly StaffRole[],
  handler: (ctx: { staff: StaffSession; supabase: ServerClient }) => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  let staff: StaffSession;
  try {
    staff = await requireStaffAction(roles);
  } catch (err) {
    if (err instanceof AuthorizationError) return fail(err.message, 'forbidden');
    throw err;
  }
  try {
    const supabase = await createSupabaseServerClient();
    return await handler({ staff, supabase });
  } catch (err) {
    if (err instanceof AuthorizationError) return fail(err.message, 'forbidden');
    // redirect()/notFound() throw special errors that must propagate.
    if (err && typeof err === 'object' && 'digest' in err && typeof (err as { digest?: unknown }).digest === 'string' && String((err as { digest: string }).digest).startsWith('NEXT_')) throw err;
    console.error('admin action failed', err);
    return fail('Something went wrong. Please try again.');
  }
}

/** Converts a PostgREST/Postgres error into a failed ActionResult with a safe message (and hint as the code). */
export function dbFail(error: { code?: string; message?: string; hint?: string | null }, fallback?: string): ActionResult<never> {
  return fail(dbErrorMessage(error, fallback), error.hint ?? error.code);
}
