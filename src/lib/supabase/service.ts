import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';
import { requireServerSecret } from '@/lib/env.server';

/**
 * Service-role client. Bypasses RLS, so it is used ONLY on the server for
 * operations that are authorised in code first (placing orders, guest payment
 * proofs, cron jobs, rate limiting, email outbox). Never import from client code.
 */
export function createSupabaseServiceClient() {
  return createClient<Database>(publicEnv.supabaseUrl, requireServerSecret('serviceRoleKey'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
