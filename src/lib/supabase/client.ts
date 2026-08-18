'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';
import type { Database } from '@/types/database';

/**
 * Browser client. Uses the anon key, so every query is subject to RLS.
 * This is the *only* Supabase client that may be imported by a Client Component.
 */
export function createClient() {
  return createBrowserClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
