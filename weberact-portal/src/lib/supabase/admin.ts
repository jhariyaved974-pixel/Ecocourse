import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL } from '@/lib/env';

// The secret (service role) key bypasses row level security. It is used only in server code for
// jobs that have no signed-in person (webhooks, scheduled jobs) and for sending invites, and only
// after the caller's own permission has been checked.
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const serviceConfigured = Boolean(SECRET && SUPABASE_URL);
export function createServiceClient() {
  if (!serviceConfigured) throw new Error('SUPABASE_SECRET_KEY is not set on the server.');
  return createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false, autoRefreshToken: false } });
}
