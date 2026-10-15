import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import type { Database } from '@/lib/database.types';
import { publicEnv } from '@/lib/env';

/**
 * Supabase client bound to the visitor's session cookies. Every query runs as
 * that user, so Row Level Security applies. Use for customer and staff actions.
 */
export async function createSupabaseServerClient() {
  // Session checks compare token expiry with the current time, so they must
  // run at request time (never in a prerender or runtime prefetch).
  await connection();
  const cookieStore = await cookies();
  return createServerClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a Server Component; the proxy refreshes sessions instead.
        }
      },
    },
  });
}
