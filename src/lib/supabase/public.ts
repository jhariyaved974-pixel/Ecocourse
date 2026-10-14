import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

/**
 * Anonymous, cookie-less client for public catalogue/content reads. Safe to use
 * inside `"use cache"` functions; RLS limits it to published data.
 */
export function createSupabasePublicClient() {
  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
